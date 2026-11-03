import { requireMethod, route } from '../_lib/common.js'
import { payableTokens } from '../_lib/aurora.js'

// GET /api/intents/tokens -> { destination, tokens: [{ assetId, symbol, blockchain, chain, price }], limits }
// Tokens a customer can pay with through Aurora Intents. 503 until AURORA_API_KEY is set.
export default route(async (req) => {
  requireMethod(req, 'GET')
  return payableTokens()
})
