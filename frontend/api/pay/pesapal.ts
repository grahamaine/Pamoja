import { randomUUID } from 'node:crypto'
import { env, HttpError, json, parseAmount, parseRef, requireMethod, route } from '../_lib/common.js'
import { fundOrderSafely, prepareOrder, saveOrder } from '../_lib/fiat.js'
import { buildFiatDeps, fiatConfigured, fiatDepsOrNull } from '../_lib/services.js'

// Pesapal API 3.0: hosted checkout for cards, mobile money and bank.
// POST /api/pay/pesapal                      { amount, jobRef, email?, phone?, provider?, reference?, deadlineHours?, disputeWindow? }
//                                            -> { redirectUrl, orderTrackingId }
// GET  /api/pay/pesapal?tracking=…           -> { status, escrow?, job? }
// With a provider address the payment funds an escrow job (see api/_lib/fiat.ts); a phone number is then required for the SMS code.
// POST /api/pay/pesapal?action=register-ipn  one-off setup; returns ipn_id to store as PESAPAL_IPN_ID
// Pesapal also calls this URL (GET) as the IPN, with OrderTrackingId and OrderMerchantReference.

async function token(): Promise<string> {
  const r = await fetch(`${env('PESAPAL_BASE_URL')}/api/Auth/RequestToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      consumer_key: env('PESAPAL_CONSUMER_KEY'),
      consumer_secret: env('PESAPAL_CONSUMER_SECRET'),
    }),
  })
  return (await json<{ token: string }>(r, 'Pesapal token')).token
}

const headers = (t: string) => ({
  Authorization: `Bearer ${t}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
})

async function status(tracking: string) {
  const t = await token()
  const url = `${env('PESAPAL_BASE_URL')}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(tracking)}`
  const r = await fetch(url, { headers: headers(t) })
  const d = await json<{ payment_status_description?: string; merchant_reference?: string }>(r, 'Pesapal status')
  const s = (d.payment_status_description ?? '').toUpperCase()
  const mapped = s === 'COMPLETED' ? 'SUCCESSFUL' : ['FAILED', 'INVALID', 'REVERSED'].includes(s) ? 'FAILED' : 'PENDING'
  return { status: mapped, raw: s, jobRef: d.merchant_reference }
}

/** With a provider address in the request, this payment funds an escrow job once it succeeds. */
async function escrowOrder(body: any) {
  if (!body?.provider) return null
  if (!fiatConfigured()) throw new HttpError(503, 'Escrow for mobile money is not switched on yet')
  const d = buildFiatDeps()
  return { d, order: await prepareOrder(d, body) }
}

export default route(async (req) => {
  requireMethod(req, 'POST', 'GET')
  const base = env('PUBLIC_APP_URL')

  if (req.method === 'GET') {
    const tracking = String(req.query.tracking ?? req.query.OrderTrackingId ?? '')
    if (!/^[A-Za-z0-9-]{8,64}$/.test(tracking)) throw new HttpError(400, 'Invalid tracking id')
    const result = await status(tracking)
    // The IPN and the customer's status checks both land here; funding is safe to repeat.
    const escrow = result.status === 'SUCCESSFUL' ? await fundOrderSafely(fiatDepsOrNull, 'pesapal', tracking) : {}
    // Pesapal's IPN call carries OrderNotificationType and expects this acknowledgement, or it retries.
    if (req.query.OrderNotificationType) {
      return {
        orderNotificationType: String(req.query.OrderNotificationType),
        orderTrackingId: tracking,
        orderMerchantReference: String(req.query.OrderMerchantReference ?? result.jobRef ?? ''),
        status: 200,
      }
    }
    return { ...result, ...escrow }
  }

  if (req.query.action === 'register-ipn') {
    const t = await token()
    const r = await fetch(`${env('PESAPAL_BASE_URL')}/api/URLSetup/RegisterIPN`, {
      method: 'POST',
      headers: headers(t),
      body: JSON.stringify({ url: `${base}/api/pay/pesapal`, ipn_notification_type: 'GET' }),
    })
    const d = await json<{ ipn_id: string }>(r, 'Pesapal RegisterIPN')
    return { ipn_id: d.ipn_id }
  }

  const amount = parseAmount(req.body?.amount)
  const jobRef = parseRef(req.body?.jobRef)
  const email = String(req.body?.email ?? '').trim()
  const phone = String(req.body?.phone ?? '').replace(/[^\d+]/g, '')
  if (!email && !phone) throw new HttpError(400, 'Provide an email or phone number')
  const escrow = await escrowOrder(req.body)

  const t = await token()
  const r = await fetch(`${env('PESAPAL_BASE_URL')}/api/Transactions/SubmitOrderRequest`, {
    method: 'POST',
    headers: headers(t),
    body: JSON.stringify({
      id: `${jobRef}-${randomUUID().slice(0, 6)}`,
      currency: 'UGX',
      amount,
      description: `Pamoja escrow deposit ${jobRef}`,
      callback_url: `${base}/?pay=done`,
      notification_id: env('PESAPAL_IPN_ID'),
      billing_address: { email_address: email || undefined, phone_number: phone || undefined, country_code: 'UG' },
    }),
  })
  const d = await json<{ redirect_url: string; order_tracking_id: string }>(r, 'Pesapal order')
  if (escrow) await saveOrder(escrow.d, 'pesapal', d.order_tracking_id, escrow.order)
  return { redirectUrl: d.redirect_url, orderTrackingId: d.order_tracking_id }
})
