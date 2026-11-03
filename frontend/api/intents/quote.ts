import { requireMethod, route } from '../_lib/common.js'
import { quote } from '../_lib/aurora.js'

// POST /api/intents/quote { originAsset, amount, recipient, refundTo, dry }
// Asks Aurora Intents for "exactly `amount` USDC to `recipient` on Solana, paid with `originAsset`".
// dry: true (default) only prices it. dry: false also returns the deposit address to pay into.
export default route(async (req) => {
  requireMethod(req, 'POST')
  const b = req.body ?? {}
  return quote({ originAsset: b.originAsset, amount: b.amount, recipient: b.recipient, refundTo: b.refundTo, dry: b.dry })
})
