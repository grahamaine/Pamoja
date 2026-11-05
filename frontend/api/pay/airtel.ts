import { randomUUID } from 'node:crypto'
import { env, HttpError, json, normalisePhone, parseAmount, parseRef, requireMethod, route } from '../_lib/common.js'

// Airtel Money Open API (Uganda): USSD push to the customer's Airtel number.
// POST /api/pay/airtel       { amount, phone, jobRef } -> { transactionId }
// GET  /api/pay/airtel?id=…  -> { status: 'PENDING' | 'SUCCESSFUL' | 'FAILED' }

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
    return { status: STATUS[code] ?? 'PENDING', code }
  }

  const amount = parseAmount(req.body?.amount)
  const phone = normalisePhone(req.body?.phone)
  const jobRef = parseRef(req.body?.jobRef)
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
  return { transactionId }
})
