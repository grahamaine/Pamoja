import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { AnchorProvider, Program, Wallet } from '@anchor-lang/core'
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token'
import nacl from 'tweetnacl'
import { HttpError, normalisePhone } from './common.js'
import { IDL } from './idl.js'

// The confirmation service: sends the customer a 6-digit code, checks it when the provider enters
// it, and only then signs `release` as the job's attestor. The code is never stored in plain text
// and never goes on-chain, because a 6-digit code could be recovered from a public hash instantly.

export const MAX_ISSUES = 3 // codes the customer can request per job
export const MAX_TRIES = 5 // wrong guesses allowed per code

export interface Store {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  incr(key: string, ttlSeconds: number): Promise<number>
  del(key: string): Promise<void>
}

export interface Sms {
  send(to: string, text: string): Promise<void>
}

export interface Deps {
  connection: Connection
  attestor: Keypair
  store: Store
  sms: Sms
  secret: string // server-only; mixes into the stored code hash
}

const TTL = 60 * 60 * 24 * 60 // keep codes for 60 days

// The attestor wallet pays each release's fee and, when the provider has no token account yet,
// about 0.002 SOL to create one. Below this balance the service stops and says so, rather than
// failing halfway with a confusing on-chain error. Top it up from the faucet on devnet.
export const MIN_ATTESTOR_SOL = 0.01

export async function attestorBalance(d: Pick<Deps, 'connection' | 'attestor'>) {
  return (await d.connection.getBalance(d.attestor.publicKey, 'confirmed')) / LAMPORTS_PER_SOL
}

async function tokenProgramFor(d: Pick<Deps, 'connection'>, mint: PublicKey) {
  const info = await d.connection.getAccountInfo(mint, 'confirmed')
  if (info?.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID
  if (info?.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID
  throw new HttpError(409, 'The job uses a token this service does not recognise')
}

export const issueMessage = (job: string) => `Pamoja: send my confirmation code for job ${job}`

/** The escrow program, signing as `signer` (the attestor unless another key is given). */
export const program = (d: Pick<Deps, 'connection' | 'attestor'>, signer: Keypair = d.attestor) =>
  new Program(IDL, new AnchorProvider(d.connection, new Wallet(signer), { commitment: 'confirmed' })) as any

export const statusOf = (acc: any): string => Object.keys(acc.status)[0]
const nowSec = () => Math.floor(Date.now() / 1000)
export const disputeEnds = (acc: any) => Number(acc.deliveredAt) + Number(acc.disputeWindow)

const hashCode = (d: Deps, job: string, code: string) =>
  createHash('sha256').update(`${d.secret}:${job}:${code}`).digest('hex')

/** Reads one of our jobs, or throws 404. */
export async function loadJob(d: Pick<Deps, 'connection' | 'attestor'>, jobAddress: string) {
  let job: PublicKey
  try { job = new PublicKey(jobAddress) } catch { throw new HttpError(400, 'Invalid job address') }
  let acc: any
  try {
    acc = await program(d).account.job.fetchNullable(job)
  } catch (e) {
    // an address that exists but is not one of our jobs (or a job from the old program) fails to decode
    if (/discriminator|decode|Invalid account|Account does not belong|out of range|beyond buffer/i.test(String((e as Error).message))) acc = null
    else throw e
  }
  if (!acc) throw new HttpError(404, 'Job not found')
  return { job, acc }
}

/** A job this service confirms whose money the customer's code can still release. */
async function loadReleasableJob(d: Deps, jobAddress: string) {
  const { job, acc } = await loadJob(d, jobAddress)
  if (!acc.attestor.equals(d.attestor.publicKey)) throw new HttpError(403, 'This job is not confirmed by the Pamoja service')
  const status = statusOf(acc)
  if (status === 'funded') {
    // Same rule as the program: a funded job releases only up to the deadline. After it the money
    // belongs to the refund path, so there is no point sending or checking a code.
    if (nowSec() > Number(acc.deadline)) {
      throw new HttpError(409, 'The deadline for this job has passed. The customer can now reclaim the payment.')
    }
  } else if (status !== 'delivered' && status !== 'disputed') {
    // Once delivered (or disputed) the refund path is closed, so the code still works after the deadline.
    throw new HttpError(409, 'The job has not been paid in, or is already finished')
  }
  return { job, acc }
}

/** Sends a fresh 6-digit code by SMS and stores only its hash. `extra` is appended to the message. */
export async function sendCode(d: Deps, jobAddress: string, reference: string, phoneIntl: string, extra = '') {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await d.store.set(`code:${jobAddress}`, hashCode(d, jobAddress, code), TTL)
  await d.store.del(`tries:${jobAddress}`)
  const short = `${jobAddress.slice(0, 4)}…${jobAddress.slice(-4)}`
  await d.sms.send(
    `+${phoneIntl}`,
    `Pamoja code: PMJ-${reference}-${code}. Give it to the provider only when the service is done. Job ${short}.${extra}`,
  )
}

/**
 * Checks a code against the stored hash. Every attempt counts towards the limit, whoever makes it.
 * Accepts "483920" or the full "PMJ-HAIR-483920".
 */
export async function checkCode(d: Deps, jobAddress: string, input: unknown) {
  const digits = String(input ?? '').trim().split('-').pop()!.replace(/\s/g, '')
  if (!/^\d{6}$/.test(digits)) throw new HttpError(400, 'Enter the 6-digit code from the SMS')

  const stored = await d.store.get(`code:${jobAddress}`)
  if (!stored) throw new HttpError(409, 'No code has been sent for this job yet')

  const tries = await d.store.incr(`tries:${jobAddress}`, TTL) // count first, so parallel guesses cannot dodge the limit
  if (tries > MAX_TRIES) throw new HttpError(429, 'Too many wrong codes. Ask the customer to request a new code.')

  const a = Buffer.from(stored, 'hex')
  const b = Buffer.from(hashCode(d, jobAddress, digits), 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(400, `Wrong code. ${MAX_TRIES - tries} ${MAX_TRIES - tries === 1 ? 'try' : 'tries'} left.`)
  }
}

/** Stops before an on-chain call that the attestor wallet could not pay for. */
export async function requireAttestorFees(d: Deps) {
  if ((await attestorBalance(d)) < MIN_ATTESTOR_SOL) {
    throw new HttpError(503, 'The confirmation service is out of network fees. Please try again later.')
  }
}

/** The customer proves they own the job (wallet signature), then gets the code by SMS. */
export async function issueCode(d: Deps, input: { job: string; phone: string; signature: string }) {
  const { acc } = await loadReleasableJob(d, input.job)
  const phone = normalisePhone(input.phone)

  let signature: Uint8Array
  try { signature = Uint8Array.from(Buffer.from(String(input.signature), 'base64')) } catch { throw new HttpError(400, 'Invalid signature') }
  const ok = nacl.sign.detached.verify(new TextEncoder().encode(issueMessage(input.job)), signature, acc.customer.toBytes())
  if (!ok) throw new HttpError(403, 'Only the customer of this job can request the code')

  const issued = await d.store.incr(`issued:${input.job}`, TTL)
  if (issued > MAX_ISSUES) throw new HttpError(429, 'The code was already sent the maximum number of times')

  await sendCode(d, input.job, String(acc.reference), phone.intl)
  return { sent: true, resendsLeft: MAX_ISSUES - issued }
}

/** The provider enters the code. If it matches, the service signs the release. */
export async function releaseWithCode(d: Deps, input: { job: string; code: string }) {
  const { job, acc } = await loadReleasableJob(d, input.job)
  await checkCode(d, input.job, input.code)

  if ((await attestorBalance(d)) < MIN_ATTESTOR_SOL) {
    // The code was right, so give the try back: this is our problem, not the provider's.
    await d.store.del(`tries:${input.job}`)
    throw new HttpError(503, 'The confirmation service is out of network fees. Your code is still valid; please try again later.')
  }

  const signature = await releaseToProvider(d, job, acc)
  await d.store.del(`code:${input.job}`)
  return { released: true, signature }
}

/** Signs `release` as the attestor: pays the provider (after a correct code, or a ruling for them). */
export async function releaseToProvider(d: Deps, job: PublicKey, acc: any): Promise<string> {
  const tokenProgram = await tokenProgramFor(d, acc.mint)
  const providerToken = getAssociatedTokenAddressSync(acc.mint, acc.provider, false, tokenProgram)
  return program(d)
    .methods.release()
    .accountsPartial({
      attestor: d.attestor.publicKey,
      job,
      customer: acc.customer, // gets the vault's rent back
      mint: acc.mint,
      providerTokenAccount: providerToken,
      tokenProgram,
    })
    .preInstructions([
      createAssociatedTokenAccountIdempotentInstruction(d.attestor.publicKey, providerToken, acc.provider, acc.mint, tokenProgram),
    ])
    .rpc()
}

/** Signs `resolve_refund` as the attestor: a dispute decided for the customer. */
export async function refundToCustomer(d: Deps, job: PublicKey, acc: any): Promise<string> {
  const tokenProgram = await tokenProgramFor(d, acc.mint)
  const customerToken = getAssociatedTokenAddressSync(acc.mint, acc.customer, false, tokenProgram)
  return program(d)
    .methods.resolveRefund()
    .accountsPartial({
      attestor: d.attestor.publicKey,
      job,
      customer: acc.customer,
      mint: acc.mint,
      customerTokenAccount: customerToken,
      tokenProgram,
    })
    .preInstructions([
      createAssociatedTokenAccountIdempotentInstruction(d.attestor.publicKey, customerToken, acc.customer, acc.mint, tokenProgram),
    ])
    .rpc()
}

export { tokenProgramFor }
