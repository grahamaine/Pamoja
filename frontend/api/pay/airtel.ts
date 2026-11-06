import { randomUUID } from 'node:crypto'
import { env, HttpError, json, normalisePhone, parseAmount, parseRef, requireMethod, route } from '../_lib/common.js'
import { fundOrderSafely, prepareOrder, saveOrder } from '../_lib/fiat.js'
import { buildFiatDeps, fiatConfigured, fiatDepsOrNull } from '../_lib/services.js'

// Airtel Money Open API (Uganda): USSD push to the customer's Airtel number.
// POST /api/pay/airtel       { amount, phone, jobRef, provider?, reference?, deadlineHours?, disputeWindow? } -> { transactionId }
// GET  /api/pay/airtel?id=…  -> { status: 'PENDING' | 'SUCCESSFUL' | 'FAILED', escrow?, job? }
// With a provider address the payment funds an escrow job: see api/_lib/fiat.ts.

async function token(): Promise<string> {
  const r = await fetch(`${env('AIRTEL_BASE_URL')}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: '*/*' },
    body: JSON.stringify({
      client_id: env('AIRTEL_CLIENT_ID'),
      client_secret: env('AIRTEL_CLIENT_SECRET'),
      grant_type: 'client_credentials',
    }),
  })
  return (await json<{ access_token: string }>(r, 'Airtel token')).access_token
}

const headers = (t: string) => ({
  Authorization: `Bearer ${t}`,
  'Content-Type': 'application/json',
  Accept: '*/*',
  'X-Country': 'UG',
  'X-Currency': 'UGX',
})

// Airtel transaction status codes: TS = success, TF = failed, TA = ambiguous, TIP = in progress
const STATUS: Record<string, string> = { TS: 'SUCCESSFUL', TF: 'FAILED', TIP: 'PENDING', TA: 'PENDING' }

/** With a provider address in the request, this payment funds an escrow job once it succeeds. */
async function escrowOrder(body: any) {
  if (!body?.provider) return null
  if (!fiatConfigured()) throw new HttpError(503, 'Escrow for mobile money is not switched on yet')
  const d = buildFiatDeps()
  return { d, order: await prepareOrder(d, body) }
}

export default route(async (req) => {
  requireMethod(req, 'POST', 'GET')

  if (req.method === 'GET') {
    const id = String(req.query.id ?? '')
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw new HttpError(400, 'Invalid transaction id')
    const t = await token()
    const statusPath = process.env.AIRTEL_STATUS_PATH ?? '/standard/v1/payments/'
    const r = await fetch(`${env('AIRTEL_BASE_URL')}${statusPath}${id}`, { headers: headers(t) })
    const d = await json<{ data?: { transaction?: { status?: string } } }>(r, 'Airtel status')
    const code = d.data?.transaction?.status ?? 'TIP'
    const status = STATUS[code] ?? 'PENDING'
    const escrow = status === 'SUCCESSFUL' ? await fundOrderSafely(fiatDepsOrNull, 'airtel', id) : {}
    return { status, code, ...escrow }
  }

  const amount = parseAmount(req.body?.amount)
  const phone = normalisePhone(req.body?.phone)
  const jobRef = parseRef(req.body?.jobRef)
  const escrow = await escrowOrder(req.body)
  const transactionId = `PMJ-${randomUUID().slice(0, 8)}`
  const t = await token()
  // v1 is Airtel's standard collection (USSD push). v2 needs message signing, which new apps don't have.
  const path = process.env.AIRTEL_PAYMENT_PATH ?? '/merchant/v1/payments/'
  const r = await fetch(`${env('AIRTEL_BASE_URL')}${path}`, {
    method: 'POST',
    headers: headers(t),
    body: JSON.stringify({
      reference: `Pamoja ${jobRef}`,
      subscriber: { country: 'UG', currency: 'UGX', msisdn: phone.national },
      transaction: { amount, country: 'UG', currency: 'UGX', id: transactionId },
    }),
  })
  await json(r, 'Airtel payment')
  if (escrow) await saveOrder(escrow.d, 'airtel', transactionId, escrow.order)
  return { transactionId }
})
