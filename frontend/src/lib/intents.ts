// Browser side of "pay from any chain" (Aurora Intents). All calls go through /api/intents/*,
// which holds the Aurora key and only allows "exact USDC to a Solana address" quotes.

export type PayToken = { assetId: string; symbol: string; blockchain: string; chain: string; price: number }
export type TokenList = { destination: { assetId: string; symbol: string; chain: string }; tokens: PayToken[]; limits: { min: number; max: number } }

export type Quote = {
  dry: boolean
  origin: { assetId: string; symbol: string; blockchain: string; chain: string; decimals: number }
  recipient: string
  refundTo: string
  amountOut: string
  amountIn: string
  amountInUnits: string
  minAmountIn: string
  amountInUsd: string
  timeEstimate: number
  depositAddress: string | null
  depositMemo: string | null
  deadline: string | null
  correlationId: string
  signature: string
  timestamp: string
}

export type SwapStatus = 'PENDING_DEPOSIT' | 'KNOWN_DEPOSIT_TX' | 'PROCESSING' | 'SUCCESS' | 'INCOMPLETE_DEPOSIT' | 'REFUNDED' | 'FAILED'
export type Status = {
  status: SwapStatus
  amountOut: string | null
  refunded: string | null
  refundReason: string | null
  originTxs: { hash: string; url: string | null }[]
  solanaTxs: { hash: string; url: string | null }[]
}

export const FINAL: SwapStatus[] = ['SUCCESS', 'REFUNDED', 'FAILED']

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${r.status})`)
  return data as T
}

export const getTokens = () => call<TokenList>('/api/intents/tokens')

export const getQuote = (q: { originAsset: string; amount: string; recipient: string; refundTo: string; dry: boolean }) =>
  call<Quote>('/api/intents/quote', { method: 'POST', body: JSON.stringify(q) })

export const getStatus = (depositAddress: string) =>
  call<Status>(`/api/intents/status?depositAddress=${encodeURIComponent(depositAddress)}`)

// The live quote (with Aurora's signature) is kept in this browser so a refresh doesn't lose track
// of a payment in flight, and so the signed quote is available if anything needs to be disputed.
const KEY = 'pamoja.anychain.payment'
export function saveSession(q: Quote) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q))
  } catch {
    /* private mode: tracking still works until the page closes */
  }
}
export function loadSession(): Quote | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Quote) : null
  } catch {
    return null
  }
}
export function clearSession() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

// Chains most people in the region actually hold funds on come first in the picker.
export const CHAIN_ORDER = ['tron', 'bsc', 'eth', 'base', 'arb', 'pol', 'op', 'avax', 'btc', 'ton', 'near', 'sui', 'sol']
export const chainRank = (b: string) => {
  const i = CHAIN_ORDER.indexOf(b)
  return i === -1 ? CHAIN_ORDER.length : i
}

export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}`
