import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { requireMethod, route } from '../_lib/common.js'
import { MIN_ATTESTOR_SOL } from '../_lib/confirm.js'

// GET /api/confirm/status -> { ready, attestor, attestorSol, lowBalance }
// The website asks this before creating jobs. Until every setting exists the service reports
// "not ready" and the website stays in demo mode, so no job is ever tied to a service that is off.
// attestorSol is the confirmation wallet's balance; it pays release fees, so keep it topped up.
const NEEDED = ['ATTESTOR_SECRET_KEY', 'CODE_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'AT_USERNAME', 'AT_API_KEY']

export default route(async (req) => {
  requireMethod(req, 'GET')
  if (NEEDED.some((k) => !process.env[k])) return { ready: false, attestor: null }
  let kp: Keypair
  try {
    kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.ATTESTOR_SECRET_KEY!) as number[]))
  } catch {
    return { ready: false, attestor: null }
  }
  let attestorSol: number | null = null
  try {
    const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed')
    attestorSol = (await connection.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL
  } catch {
    // RPC hiccup: still report the service as ready; the release route checks the balance itself
  }
  return { ready: true, attestor: kp.publicKey.toBase58(), attestorSol, lowBalance: attestorSol !== null && attestorSol < MIN_ATTESTOR_SOL }
})
