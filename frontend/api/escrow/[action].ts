import { HttpError, requireMethod, route } from '../_lib/common.js'
import { fiatDispute, fiatRefund, jobInfo, notifyDelivered, resolveDispute } from '../_lib/fiat.js'
import { buildDeps, buildFiatDeps, fiatConfigured } from '../_lib/services.js'

// One function for the escrow actions that need the server (Vercel Hobby allows 12 functions).
//   GET  /api/escrow/job?address=…           public view of a job (status, deadline, dispute window)
//   POST /api/escrow/delivered  { job }       texts a mobile money customer that the job was marked delivered
//   POST /api/escrow/dispute    { job, code } mobile money customer disputes a delivery with their SMS code
//   POST /api/escrow/refund     { job, code } mobile money customer reclaims after the deadline
//   POST /api/escrow/resolve    { job, outcome: 'provider' | 'customer' }  Pamoja decides a dispute;
//                                             needs the header  Authorization: Bearer <ADMIN_TOKEN>
// Wallet customers dispute and refund from their wallet in the Business tab instead.
export default route(async (req) => {
  const action = String(req.query.action ?? '')
  const body = req.body ?? {}

  if (action === 'job') {
    requireMethod(req, 'GET')
    const d = fiatConfigured() ? buildFiatDeps() : buildDeps()
    return jobInfo(d, String(req.query.address ?? ''))
  }

  requireMethod(req, 'POST')
  if (!fiatConfigured()) {
    if (action === 'delivered') return { notified: false }
    throw new HttpError(503, 'Mobile money escrow is not switched on')
  }
  const d = buildFiatDeps()
  switch (action) {
    case 'delivered':
      return notifyDelivered(d, { job: String(body.job ?? '') })
    case 'dispute':
      return fiatDispute(d, { job: String(body.job ?? ''), code: String(body.code ?? '') })
    case 'refund':
      return fiatRefund(d, { job: String(body.job ?? ''), code: String(body.code ?? '') })
    case 'resolve': {
      const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
      return resolveDispute(d, { job: String(body.job ?? ''), outcome: String(body.outcome ?? ''), token })
    }
    default:
      throw new HttpError(404, 'Unknown action')
  }
})
