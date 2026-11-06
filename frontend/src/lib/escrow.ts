import { BN, type Program } from '@anchor-lang/core'
import { PublicKey, type Connection } from '@solana/web3.js'
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import type { Pamoja } from '../idl/pamoja'

// Talks to the Pamoja escrow program. No React or browser code in here.

export type JobStatus = 'created' | 'funded' | 'delivered' | 'disputed' | 'released' | 'cancelled' | 'refunded'

export type JobView = {
  address: PublicKey
  customer: PublicKey
  provider: PublicKey
  mint: PublicKey
  attestor: PublicKey
  amount: BN
  deadline: BN
  jobId: BN
  reference: string
  status: JobStatus
  disputeWindow: BN // seconds the customer has to dispute once the provider marks the job delivered
  deliveredAt: BN // unix seconds; 0 until delivered
}

export type EscrowProgram = Program<Pamoja>

/**
 * Size of a Job account in this version of the program (8-byte discriminator + fields). Jobs made by
 * the earlier program are 16 bytes shorter and cannot be read with the new layout, so the list skips
 * them. They were devnet test jobs only.
 */
export const JOB_ACCOUNT_SIZE = 190

/** Dispute windows offered when creating a job. The program accepts 1 minute to 7 days. */
export const DISPUTE_WINDOWS = [
  { seconds: 48 * 3600, label: '48 hours' },
  { seconds: 24 * 3600, label: '24 hours' },
  { seconds: 3600, label: '1 hour' },
  { seconds: 120, label: '2 minutes (demo)' },
]

export const jobAddress = (programId: PublicKey, customer: PublicKey, jobId: BN) =>
  PublicKey.findProgramAddressSync(
    [new TextEncoder().encode('job'), customer.toBytes(), jobId.toArrayLike(Buffer, 'le', 8)],
    programId,
  )[0]

/** Whole-token amount (e.g. "12.5") to the token's smallest unit. */
export function toBaseUnits(amount: string, decimals = 6): BN {
  const [whole, frac = ''] = amount.trim().split('.')
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac)) throw new Error('Enter a valid amount')
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  return new BN(`${whole || '0'}${padded}`)
}

export const fromBaseUnits = (amount: BN, decimals = 6) => {
  const s = amount.toString().padStart(decimals + 1, '0')
  const whole = s.slice(0, -decimals)
  const frac = s.slice(-decimals).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

const statusOf = (s: object): JobStatus => Object.keys(s)[0] as JobStatus

const tokenPrograms = new Map<string, PublicKey>()

/** Classic SPL Token or Token-2022, read from who owns the mint account. Cached per mint. */
export async function tokenProgramFor(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const key = mint.toBase58()
  const cached = tokenPrograms.get(key)
  if (cached) return cached
  const info = await connection.getAccountInfo(mint)
  if (!info) throw new Error('Token mint not found on this network')
  if (!info.owner.equals(TOKEN_PROGRAM_ID) && !info.owner.equals(TOKEN_2022_PROGRAM_ID)) throw new Error('Not a token mint')
  tokenPrograms.set(key, info.owner)
  return info.owner
}

// The same timing rules the program enforces, so buttons only appear when the action can succeed.
//   Funded, up to the deadline: release (customer's code) or the provider marks it delivered
//   Funded, after the deadline: refund only
//   Delivered: the customer can dispute until the window ends; after it the provider can claim
//   Disputed:  the confirmation service decides (release or resolve_refund)
export const disputeEnds = (j: JobView) => j.deliveredAt.toNumber() + j.disputeWindow.toNumber()
export const canFund = (j: JobView, now: number) => j.status === 'created' && now <= j.deadline.toNumber()
export const canRelease = (j: JobView, now: number) =>
  (j.status === 'funded' && now <= j.deadline.toNumber()) || j.status === 'delivered' || j.status === 'disputed'
export const canRefund = (j: JobView, now: number) => j.status === 'funded' && now > j.deadline.toNumber()
export const canMarkDelivered = (j: JobView, now: number) => j.status === 'funded' && now <= j.deadline.toNumber()
export const canDispute = (j: JobView, now: number) => j.status === 'delivered' && now <= disputeEnds(j)
export const canClaim = (j: JobView, now: number) => j.status === 'delivered' && now > disputeEnds(j)
/** Money is still in the vault. */
export const isOpen = (j: JobView) => j.status === 'funded' || j.status === 'delivered' || j.status === 'disputed'
export const isFinal = (j: JobView) => j.status === 'released' || j.status === 'cancelled' || j.status === 'refunded'

export type Trust = {
  /** The locked token is the stablecoin Pamoja expects (not some look-alike token). */
  mintOk: boolean
  /** Who can release: the Pamoja SMS service, the customer themselves, or an unknown key. */
  confirmer: 'pamoja' | 'customer' | 'unknown'
}

/**
 * What a provider should check before starting work. The program lets the customer pick the token
 * and the confirmer, so a job can be "funded" with a worthless token or a confirmer only the
 * customer controls. Neither can steal from the provider, but either can leave them unpaid.
 */
export function trustOf(j: JobView, stableMint: PublicKey, pamojaAttestor: string | null): Trust {
  const attestor = j.attestor.toBase58()
  return {
    mintOk: j.mint.equals(stableMint),
    confirmer: pamojaAttestor && attestor === pamojaAttestor ? 'pamoja' : j.attestor.equals(j.customer) ? 'customer' : 'unknown',
  }
}

/** Every job where this wallet is the customer, the provider or the confirmer. */
export async function listJobs(program: EscrowProgram, me: PublicKey): Promise<JobView[]> {
  const all = await program.account.job.all([{ dataSize: JOB_ACCOUNT_SIZE }])
  return all
    .map(({ publicKey, account }) => ({ address: publicKey, ...account, status: statusOf(account.status) }) as JobView)
    .filter((j) => [j.customer, j.provider, j.attestor].some((k) => k.equals(me)))
    .sort((a, b) => b.jobId.cmp(a.jobId))
}

export type NewJob = {
  provider: PublicKey
  mint: PublicKey
  amount: BN
  reference: string
  attestor: PublicKey
  deadline: BN // unix seconds
  disputeWindow: BN // seconds
}

/** Creates the job, then locks the payment in the vault. Returns the job address. */
export async function createAndFundJob(program: EscrowProgram, me: PublicKey, p: NewJob): Promise<PublicKey> {
  const jobId = new BN(Date.now())
  const job = jobAddress(program.programId, me, jobId)

  await program.methods.createJob(jobId, p.provider, p.mint, p.amount, p.reference, p.attestor, p.deadline, p.disputeWindow).rpc()
  await fundJob(program, me, { address: job, mint: p.mint })
  return job
}

export async function fundJob(program: EscrowProgram, me: PublicKey, j: Pick<JobView, 'address' | 'mint'>) {
  const tokenProgram = await tokenProgramFor(program.provider.connection, j.mint)
  return program.methods
    .fundJob()
    .accountsPartial({
      job: j.address,
      mint: j.mint,
      customerTokenAccount: getAssociatedTokenAddressSync(j.mint, me, false, tokenProgram),
      tokenProgram,
    })
    .rpc()
}

export const cancelJob = (program: EscrowProgram, j: Pick<JobView, 'address'>) =>
  program.methods.cancel().accountsPartial({ job: j.address }).rpc()

/** After the deadline: the money and the vault's rent go back to the customer. */
export async function refundJob(program: EscrowProgram, me: PublicKey, j: Pick<JobView, 'address' | 'mint'>) {
  const tokenProgram = await tokenProgramFor(program.provider.connection, j.mint)
  return program.methods
    .refund()
    .accountsPartial({
      customer: me,
      job: j.address,
      mint: j.mint,
      customerTokenAccount: getAssociatedTokenAddressSync(j.mint, me, false, tokenProgram),
      tokenProgram,
    })
    .rpc()
}

/**
 * Only the job's attestor can release, and only up to the deadline. Pays the provider, returns the
 * vault's rent to the customer, and creates the provider's token account if it does not exist yet.
 */
export async function releaseJob(program: EscrowProgram, me: PublicKey, j: Pick<JobView, 'address' | 'mint' | 'provider' | 'customer'>) {
  const tokenProgram = await tokenProgramFor(program.provider.connection, j.mint)
  const providerToken = getAssociatedTokenAddressSync(j.mint, j.provider, false, tokenProgram)
  return program.methods
    .release()
    .accountsPartial({
      attestor: me,
      job: j.address,
      customer: j.customer,
      mint: j.mint,
      providerTokenAccount: providerToken,
      tokenProgram,
    })
    .preInstructions([createAssociatedTokenAccountIdempotentInstruction(me, providerToken, j.provider, j.mint, tokenProgram)])
    .rpc()
}

/** Deletes a finished job and returns its rent (about 0.002 SOL) to the customer. */
export const closeJob = (program: EscrowProgram, me: PublicKey, j: Pick<JobView, 'address'>) =>
  program.methods.closeJob().accountsPartial({ customer: me, job: j.address }).rpc()


/** Provider: the work is done. Starts the customer's dispute window and closes the refund path. */
export const markDelivered = (program: EscrowProgram, me: PublicKey, j: Pick<JobView, 'address'>) =>
  program.methods.markDelivered().accountsPartial({ provider: me, job: j.address }).rpc()

/** Customer: the work was not done. The Pamoja confirmation service then decides. */
export const disputeJob = (program: EscrowProgram, me: PublicKey, j: Pick<JobView, 'address'>) =>
  program.methods.dispute().accountsPartial({ customer: me, job: j.address }).rpc()

/** Provider: the dispute window passed with no dispute, so take the payment. */
export async function claimJob(program: EscrowProgram, me: PublicKey, j: Pick<JobView, 'address' | 'mint' | 'customer'>) {
  const tokenProgram = await tokenProgramFor(program.provider.connection, j.mint)
  const providerToken = getAssociatedTokenAddressSync(j.mint, me, false, tokenProgram)
  return program.methods
    .claim()
    .accountsPartial({
      provider: me,
      job: j.address,
      customer: j.customer,
      mint: j.mint,
      providerTokenAccount: providerToken,
      tokenProgram,
    })
    .preInstructions([createAssociatedTokenAccountIdempotentInstruction(me, providerToken, me, j.mint, tokenProgram)])
    .rpc()
}

/** Attestor: decide a dispute for the customer. (A ruling for the provider is `releaseJob`.) */
export async function resolveRefundJob(program: EscrowProgram, me: PublicKey, j: Pick<JobView, 'address' | 'mint' | 'customer'>) {
  const tokenProgram = await tokenProgramFor(program.provider.connection, j.mint)
  const customerToken = getAssociatedTokenAddressSync(j.mint, j.customer, false, tokenProgram)
  return program.methods
    .resolveRefund()
    .accountsPartial({
      attestor: me,
      job: j.address,
      customer: j.customer,
      mint: j.mint,
      customerTokenAccount: customerToken,
      tokenProgram,
    })
    .preInstructions([createAssociatedTokenAccountIdempotentInstruction(me, customerToken, j.customer, j.mint, tokenProgram)])
    .rpc()
}
