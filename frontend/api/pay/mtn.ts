import { randomUUID } from 'node:crypto'
import { env, HttpError, json, normalisePhone, parseAmount, parseRef, requireMethod, route } from '../_lib/common.js'
import { fundOrderSafely, prepareOrder, saveOrder } from '../_lib/fiat.js'
import { buildFiatDeps, fiatConfigured, fiatDepsOrNull } from '../_lib/services.js'

// MTN MoMo Collection API: request a payment from the customer's MTN number (they approve on their phone).
// POST /api/pay/mtn        { amount, phone, jobRef, provider?, reference?, deadlineHours?, disputeWindow? } -> { referenceId }
// GET  /api/pay/mtn?ref=…  -> { status: 'PENDING' | 'SUCCESSFUL' | 'FAILED', escrow?, job? }
// With a provider address the payment funds an escrow job: see api/_lib/fiat.ts.

async function token(): Promise<string> {
  const basic = Buffer.from(`${env('MTN_API_USER')}:${env('MTN_API_KEY')}`).toString('base64')
  const r = await fetch(`${env('MTN_BASE_URL')}/collection/token/`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Ocp-Apim-Subscription-Key': env('MTN_SUBSCRIPTION_KEY') },
  })
  return (await json<{ access_token: string }>(r, 'MTN token')).access_token
}

const headers = (t: string, extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${t}`,
  'X-Target-Environment': env('MTN_TARGET_ENV'),
  'Ocp-Apim-Subscription-Key': env('MTN_SUBSCRIPTION_KEY'),
  ...extra,
})

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
    const ref = String(req.query.ref ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(ref)) throw new HttpError(400, 'Invalid reference')
    const t = await token()
    const r = await fetch(`${env('MTN_BASE_URL')}/collection/v1_0/requesttopay/${ref}`, { headers: headers(t) })
    const d = await json<{ status: string; reason?: unknown }>(r, 'MTN status')
    const escrow = d.status === 'SUCCESSFUL' ? await fundOrderSafely(fiatDepsOrNull, 'mtn', ref) : {}
    return { status: d.status, reason: d.reason, ...escrow }
  }

  const amount = parseAmount(req.body?.amount)
  const phone = normalisePhone(req.body?.phone)
  const jobRef = parseRef(req.body?.jobRef)
  const escrow = await escrowOrder(req.body)
  const referenceId = randomUUID()
  const t = await token()
  const r = await fetch(`${env('MTN_BASE_URL')}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers: headers(t, { 'X-Reference-Id': referenceId, 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      amount: String(amount),
      currency: env('MTN_CURRENCY'),
      externalId: jobRef,
      payer: { partyIdType: 'MSISDN', partyId: phone.intl },
      payerMessage: `Pamoja ${jobRef}`,
      payeeNote: `Escrow deposit ${jobRef}`,
    }),
  })
  if (r.status !== 202) throw new Error(`MTN requesttopay failed (${r.status})`)
  if (escrow) await saveOrder(escrow.d, 'mtn', referenceId, escrow.order)
  return { referenceId }
})
