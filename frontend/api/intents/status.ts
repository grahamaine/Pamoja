import { requireMethod, route } from '../_lib/common.js'
import { status } from '../_lib/aurora.js'

// GET /api/intents/status?depositAddress=… -> { status, amountOut, solanaTxs, … }
// status: PENDING_DEPOSIT | KNOWN_DEPOSIT_TX | PROCESSING | SUCCESS | INCOMPLETE_DEPOSIT | REFUNDED | FAILED
export default route(async (req) => {
  requireMethod(req, 'GET')
  return status(req.query.depositAddress)
})
