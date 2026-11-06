import { createHash, timingSafeEqual } from 'node:crypto'
import BN from 'bn.js'
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { HttpError, normalisePhone, parseAmount } from './common.js'
import {
  checkCode, disputeEnds, loadJob, program, refundToCustomer, releaseToProvider, requireAttestorFees, sendCode, statusOf, tokenProgramFor,
  type Deps,
} from './confirm.js'

// Mobile money and card payments that fund the escrow (roadmap item 5).
//
// The customer pays in UGX with MTN, Airtel or Pesapal. Once the payment provider itself reports the
// payment as successful (checked server-side, never trusted from the browser), the Pamoja treasury
// wallet creates the on-chain job as the customer and locks the matching amount of USDC in the vault.
// The customer then gets the usual SMS code. They need no wallet: the code is their key, for giving
// to the provider, disputing a delivery, or asking for a refund after the deadline.
//
// Refunds of these jobs go back to the treasury on-chain and are recorded as owed to the customer's
// phone number, to be paid back by mobile money.

export interface FiatDeps extends Deps {
  treasury: Keypair // acts as the on-chain customer for wallet-less payers; holds USDC and SOL
  mint: PublicKey // the stablecoin locked in the vault
  ugxPerUsdc: number // conversion rate for the amount locked
  appUrl: string // for links in SMS messages
  adminToken: string | null // lets the Pamoja team decide disputes through the API
}

export type Method = 'mtn' | 'airtel' | 'pesapal'

export type Order = {
  provider: string
  reference: string
  amountUgx: number
  usdc: string // base units (6 decimals)
  phone: string // international format, 2567XXXXXXXX
  deadlineHours: number
  disputeWindow: number // seconds
  createdAt: number
  job?: string
  codeSent?: boolean
}

const TTL = 60 * 60 * 24 * 60
const USDC_DECIMALS = 6
const MIN_TREASURY_SOL = 0.02 // two account rents plus fees per job
const nowSec = () => Math.floor(Date.now() / 1000)
const orderKey = (method: Method, paymentId: string) => `order:${method}:${paymentId}`
const fiatKey = (job: string) => `fiat:${job}`

export const toUsdcBaseUnits = (amountUgx: number, ugxPerUsdc: number) =>
  new BN(Math.floor((amountUgx * 10 ** USDC_DECIMALS) / ugxPerUsdc))

const fmtUsdc = (base: BN) => (Number(base.toString()) / 10 ** USDC_DECIMALS).toFixed(2)

/** Validates the escrow part of a payment request. The provider's wallet address says who gets paid. */
export function parseOrder(body: any, ugxPerUsdc: number): Omit<Order, 'createdAt'> {
  let provider: PublicKey
  try { provider = new PublicKey(String(body?.provider ?? '').trim()) } catch { throw new HttpError(400, "Enter the provider's Solana wallet address") }
  const reference = String(body?.reference ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9]{2,8}$/.test(reference)) throw new HttpError(400, 'Choose a service')
  const amountUgx = parseAmount(body?.amount)
  const phone = normalisePhone(body?.phone)
  const deadlineHours = Number(body?.deadlineHours ?? 24)
  if (!Number.isInteger(deadlineHours) || deadlineHours < 1 || deadlineHours > 24 * 30) throw new HttpError(400, 'Choose a deadline between 1 hour and 30 days')
  const disputeWindow = Number(body?.disputeWindow ?? 48 * 3600)
  if (!Number.isInteger(disputeWindow) || disputeWindow < 60 || disputeWindow > 7 * 24 * 3600) throw new HttpError(400, 'Choose a dispute window between 1 minute and 7 days')
  const usdc = toUsdcBaseUnits(amountUgx, ugxPerUsdc)
  if (usdc.isZero()) throw new HttpError(400, 'Amount is too small')
  return { provider: provider.toBase58(), reference, amountUgx, usdc: usdc.toString(), phone: phone.intl, deadlineHours, disputeWindow }
}

async function treasuryUsdc(d: FiatDeps) {
  const tokenProgram = await tokenProgramFor(d, d.mint)
  const ata = getAssociatedTokenAddressSync(d.mint, d.treasury.publicKey, false, tokenProgram)
  const bal = await d.connection.getTokenAccountBalance(ata, 'confirmed').catch(() => null)
  return { ata, tokenProgram, amount: new BN(bal?.value.amount ?? '0') }
}

export async function treasuryStatus(d: FiatDeps) {
  const [sol, usdc] = await Promise.all([d.connection.getBalance(d.treasury.publicKey, 'confirmed'), treasuryUsdc(d)])
  return { treasury: d.treasury.publicKey.toBase58(), treasurySol: sol / LAMPORTS_PER_SOL, treasuryUsdc: fmtUsdc(usdc.amount) }
}

/**
 * Before asking the customer to pay: refuses if the treasury could not lock the money afterwards,
 * so nobody pays in UGX for a job that cannot be funded.
 */
export async function prepareOrder(d: FiatDeps, body: any): Promise<Order> {
  const order = { ...parseOrder(body, d.ugxPerUsdc), createdAt: nowSec() }
  const [sol, usdc] = await Promise.all([d.connection.getBalance(d.treasury.publicKey, 'confirmed'), treasuryUsdc(d)])
  if (sol / LAMPORTS_PER_SOL < MIN_TREASURY_SOL || usdc.amount.lt(new BN(order.usdc))) {
    throw new HttpError(503, 'Escrow for mobile money is temporarily unavailable (the Pamoja treasury needs topping up). No money was taken.')
  }
  return order
}

export async function saveOrder(d: FiatDeps, method: Method, paymentId: string, order: Order) {
  await d.store.set(orderKey(method, paymentId), JSON.stringify(order), TTL)
}

/** One job per payment: the job id is derived from the payment id, so a retry can never fund twice. */
export const jobIdFor = (method: Method, paymentId: string) =>
  new BN(createHash('sha256').update(`pamoja:${method}:${paymentId}`).digest().subarray(0, 8), 'le')

export type EscrowState = { escrow: 'none' | 'pending' | 'locked' | 'error'; job?: string; message?: string }

/**
 * Called only after the payment provider reported the payment SUCCESSFUL. Creates and funds the job
 * from the treasury, then texts the customer their code. Safe to call many times (polling, IPN).
 */
export async function fundOrder(d: FiatDeps, method: Method, paymentId: string): Promise<EscrowState> {
  const key = orderKey(method, paymentId)
  const raw = await d.store.get(key)
  if (!raw) return { escrow: 'none' } // a plain payment with no escrow order attached
  const order = JSON.parse(raw) as Order
  if (order.job && order.codeSent) return { escrow: 'locked', job: order.job }

  if ((await d.store.incr(`lock:${key}`, 120)) > 1) return { escrow: 'pending' }
  try {
    const p = program(d, d.treasury)
    const jobId = jobIdFor(method, paymentId)
    const [job] = PublicKey.findProgramAddressSync(
      [Buffer.from('job'), d.treasury.publicKey.toBuffer(), jobId.toArrayLike(Buffer, 'le', 8)],
      p.programId,
    )
    const address = job.toBase58()

    let status = 'missing'
    try {
      const acc = await p.account.job.fetchNullable(job)
      if (acc) status = statusOf(acc)
    } catch { /* treat as missing */ }

    if (status === 'missing') {
      await p.methods
        .createJob(
          jobId,
          new PublicKey(order.provider),
          d.mint,
          new BN(order.usdc),
          order.reference,
          d.attestor.publicKey,
          new BN(nowSec() + order.deadlineHours * 3600),
          new BN(order.disputeWindow),
        )
        .accountsPartial({ customer: d.treasury.publicKey })
        .rpc()
      status = 'created'
    }
    if (status === 'created') {
      const { ata, tokenProgram } = await treasuryUsdc(d)
      await p.methods
        .fundJob()
        .accountsPartial({ customer: d.treasury.publicKey, job, mint: d.mint, customerTokenAccount: ata, tokenProgram })
        .rpc()
    }

    order.job = address
    await saveOrder(d, method, paymentId, order)
    await d.store.set(fiatKey(address), JSON.stringify({ phone: order.phone, method, paymentId, amountUgx: order.amountUgx }), TTL)

    if (!order.codeSent) {
      await sendCode(d, address, order.reference, order.phone, ` Manage or dispute: ${d.appUrl}/?job=${address}#pay`)
      order.codeSent = true
      await saveOrder(d, method, paymentId, order)
    }
    return { escrow: 'locked', job: address }
  } finally {
    await d.store.del(`lock:${key}`)
  }
}

/** Wraps fundOrder for the payment status routes: a funding problem must not hide a successful payment. */
export async function fundOrderSafely(deps: () => FiatDeps | null, method: Method, paymentId: string): Promise<EscrowState> {
  try {
    const d = deps()
    if (!d) return { escrow: 'none' }
    return await fundOrder(d, method, paymentId)
  } catch (e) {
    console.error('escrow funding failed', method, (e as Error).message)
    return { escrow: 'error', message: 'Your payment was received, but locking it in escrow failed. We will retry; keep this page open or contact Pamoja.' }
  }
}

async function loadFiatJob(d: FiatDeps, jobAddress: string) {
  const { job, acc } = await loadJob(d, jobAddress)
  if (!acc.customer.equals(d.treasury.publicKey)) throw new HttpError(403, 'This job was paid from a wallet. Use the wallet to manage it.')
  const raw = await d.store.get(fiatKey(jobAddress))
  return { job, acc, fiat: raw ? (JSON.parse(raw) as { phone: string; method: Method; paymentId: string; amountUgx: number }) : null }
}

/** Public, read-only view of a job for the booking page. */
export async function jobInfo(d: Deps & { treasury?: Keypair }, jobAddress: string) {
  const { acc } = await loadJob(d, jobAddress)
  const deliveredAt = Number(acc.deliveredAt)
  return {
    status: statusOf(acc),
    reference: String(acc.reference),
    amount: fmtUsdc(new BN(acc.amount.toString())),
    provider: acc.provider.toBase58(),
    deadline: Number(acc.deadline),
    deliveredAt: deliveredAt || null,
    disputeEnds: deliveredAt ? disputeEnds(acc) : null,
    paidByMobileMoney: !!d.treasury && acc.customer.equals(d.treasury.publicKey),
  }
}

async function recordRefundOwed(d: FiatDeps, jobAddress: string, reason: string) {
  const raw = await d.store.get(fiatKey(jobAddress))
  const fiat = raw ? JSON.parse(raw) : {}
  await d.store.set(`refund-owed:${jobAddress}`, JSON.stringify({ ...fiat, job: jobAddress, reason, at: nowSec() }), TTL)
  if (fiat.phone) {
    await d.sms.send(`+${fiat.phone}`, `Pamoja: your payment for job ${jobAddress.slice(0, 4)}…${jobAddress.slice(-4)} will be refunded to this number by mobile money.`).catch(() => {})
  }
}

/** Mobile money customer: dispute a delivery with their SMS code. The treasury signs on their behalf. */
export async function fiatDispute(d: FiatDeps, input: { job: string; code: string }) {
  const { job, acc } = await loadFiatJob(d, input.job)
  if (statusOf(acc) !== 'delivered') throw new HttpError(409, 'Only a job the provider has marked delivered can be disputed')
  if (nowSec() > disputeEnds(acc)) throw new HttpError(409, 'The time to dispute this delivery has passed')
  await checkCode(d, input.job, input.code)
  const signature: string = await program(d, d.treasury).methods.dispute().accountsPartial({ customer: d.treasury.publicKey, job }).rpc()
  return { disputed: true, signature }
}

/** Mobile money customer: after the deadline, with no delivery, get the money back. */
export async function fiatRefund(d: FiatDeps, input: { job: string; code: string }) {
  const { job, acc } = await loadFiatJob(d, input.job)
  if (statusOf(acc) !== 'funded') throw new HttpError(409, 'This job cannot be refunded (it was delivered, disputed or is already finished)')
  if (nowSec() <= Number(acc.deadline)) throw new HttpError(409, 'A refund is possible only after the deadline')
  await checkCode(d, input.job, input.code)
  const { ata, tokenProgram } = await treasuryUsdc(d)
  const signature: string = await program(d, d.treasury)
    .methods.refund()
    .accountsPartial({ customer: d.treasury.publicKey, job, mint: acc.mint, customerTokenAccount: ata, tokenProgram })
    .rpc()
  await d.store.del(`code:${input.job}`)
  await recordRefundOwed(d, input.job, 'deadline passed')
  return { refunded: true, signature }
}

/** After the provider marks a job delivered: texts a mobile money customer, once. */
export async function notifyDelivered(d: FiatDeps, input: { job: string }) {
  let loaded
  try { loaded = await loadFiatJob(d, input.job) } catch { return { notified: false } }
  const { acc, fiat } = loaded
  if (statusOf(acc) !== 'delivered' || !fiat) return { notified: false }
  if ((await d.store.incr(`notified:${input.job}`, TTL)) > 1) return { notified: false }
  const ends = new Date(disputeEnds(acc) * 1000).toLocaleString('en-GB', { timeZone: 'Africa/Kampala', dateStyle: 'medium', timeStyle: 'short' })
  await d.sms.send(
    `+${fiat.phone}`,
    `Pamoja: the provider marked your ${acc.reference} job as done. If it was not, dispute before ${ends} (Kampala time): ${d.appUrl}/?job=${input.job}#pay`,
  )
  return { notified: true }
}

/** The Pamoja team decides a dispute. Needs ADMIN_TOKEN. */
export async function resolveDispute(d: FiatDeps, input: { job: string; outcome: string; token: string }) {
  const expected = Buffer.from(d.adminToken ?? '')
  const given = Buffer.from(String(input.token ?? ''))
  if (!d.adminToken || expected.length !== given.length || !timingSafeEqual(expected, given)) throw new HttpError(401, 'Not allowed')
  if (input.outcome !== 'provider' && input.outcome !== 'customer') throw new HttpError(400, 'outcome must be "provider" or "customer"')

  const { job, acc } = await loadJob(d, input.job)
  if (!acc.attestor.equals(d.attestor.publicKey)) throw new HttpError(403, 'This job is not confirmed by the Pamoja service')
  if (statusOf(acc) !== 'disputed') throw new HttpError(409, 'This job is not disputed')
  await requireAttestorFees(d)

  if (input.outcome === 'provider') {
    return { outcome: 'provider', signature: await releaseToProvider(d, job, acc) }
  }
  const signature = await refundToCustomer(d, job, acc)
  if (acc.customer.equals(d.treasury.publicKey)) await recordRefundOwed(d, input.job, 'dispute decided for the customer')
  return { outcome: 'customer', signature }
}
