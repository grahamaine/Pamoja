import { PublicKey } from '@solana/web3.js'
import { HttpError } from './common.js'

// Aurora Intents (built on NEAR Intents) lets a customer pay from 30+ chains while the money lands as
// USDC on Solana. These helpers sit behind /api/intents/*: the browser never sees the API key, and the
// server only ever asks for one kind of quote, "exactly N USDC to this Solana address". So the key
// cannot be used to route funds anywhere else.
//
// Docs: https://docs.intents.aurora.dev  (the API is a proxy of the NEAR Intents 1Click API)
// NEAR Intents settles with real solver liquidity, so this runs on MAINNET, not devnet.

const BASE = 'https://intents-api.aurora.dev/api'

// Canonical USDC on Solana mainnet. Used to pick the right destination asset from Aurora's token list.
export const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
export const USDC_DECIMALS = 6
export const MIN_USDC = 1
export const MAX_USDC = 1000
export const SLIPPAGE_BPS = 100 // 1%, applied to the input side for EXACT_OUTPUT quotes

export type AuroraToken = {
  assetId: string
  decimals: number
  blockchain: string
  symbol: string
  price?: number
  contractAddress?: string | null
}

export type AuroraQuote = {
  depositAddress?: string
  depositMemo?: string
  amountIn: string
  amountInFormatted: string
  amountInUsd: string
  minAmountIn: string
  amountOut: string
  amountOutFormatted: string
  deadline?: string
  timeWhenInactive?: string
  timeEstimate: number
}

export type AuroraQuoteResponse = {
  correlationId: string
  timestamp: string
  signature: string
  quote: AuroraQuote
}

export type Fetcher = typeof fetch

export function apiKey(): string {
  const k = process.env.AURORA_API_KEY?.trim()
  if (!k) throw new HttpError(503, 'Paying from other chains is not switched on yet (no Aurora API key configured).')
  return k
}

async function call<T>(f: Fetcher, url: string, init?: RequestInit): Promise<T> {
  const r = await f(url, init)
  const text = await r.text()
  let body: unknown = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    /* non-JSON error page */
  }
  if (!r.ok) {
    const msg = (body as { message?: unknown }).message
    // 4xx from Aurora usually explains itself (e.g. "amount too low"); pass that on, never the key.
    if (r.status >= 400 && r.status < 500 && typeof msg === 'string') throw new HttpError(400, msg.replaceAll(apiKeySafe(), '***'))
    throw new Error(`Aurora ${r.status}: ${text.slice(0, 200)}`)
  }
  return body as T
}

const apiKeySafe = () => process.env.AURORA_API_KEY?.trim() || '\u0000'

// Token list changes rarely; keep it for a minute per warm function instance.
let cache: { at: number; tokens: AuroraToken[] } | null = null

export async function tokens(f: Fetcher = fetch): Promise<AuroraToken[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.tokens
  const list = unwrapTokens(await call<unknown>(f, `${BASE}/tokens/${apiKey()}`))
  cache = { at: Date.now(), tokens: list }
  return list
}

/** The docs show a bare array; the live API may wrap it ({ tokens: [...] }, { data: [...] }, ...). Accept both. */
export function unwrapTokens(body: unknown): AuroraToken[] {
  const isList = (v: unknown): v is AuroraToken[] => Array.isArray(v) && v.every((t) => t && typeof (t as AuroraToken).assetId === 'string')
  if (isList(body)) return body
  if (body && typeof body === 'object') {
    for (const v of Object.values(body as Record<string, unknown>)) if (isList(v) && v.length) return v
  }
  const shape = body && typeof body === 'object' ? `object with keys ${Object.keys(body).slice(0, 8).join(', ')}` : typeof body
  throw new Error(`Aurora token list has an unexpected shape: ${shape}`)
}

export function resetTokenCache() {
  cache = null
}

export function solanaUsdc(list: AuroraToken[]): AuroraToken {
  const t = list.find(
    (x) => x.blockchain === 'sol' && (x.contractAddress === SOLANA_USDC_MINT || (x.symbol === 'USDC' && x.decimals === USDC_DECIMALS)),
  )
  if (!t) throw new HttpError(503, 'USDC on Solana is not available through Aurora right now.')
  return t
}

/** "12.5" -> 12500000n. Rejects anything outside MIN..MAX or with more than 6 decimals. */
export function usdcUnits(input: unknown): bigint {
  const s = String(input ?? '').trim()
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new HttpError(400, 'Enter the amount in USDC, e.g. 25 or 12.50')
  const [whole, frac = ''] = s.split('.')
  const units = BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(frac.padEnd(USDC_DECIMALS, '0'))
  if (units < BigInt(MIN_USDC) * 1_000_000n || units > BigInt(MAX_USDC) * 1_000_000n) {
    throw new HttpError(400, `Amount must be between ${MIN_USDC} and ${MAX_USDC} USDC`)
  }
  return units
}

export function solanaAddress(input: unknown): string {
  const s = String(input ?? '').trim()
  try {
    return new PublicKey(s).toBase58()
  } catch {
    throw new HttpError(400, 'Enter a valid Solana wallet address to receive the USDC')
  }
}

// Refunds go back on the chain the customer paid from, so the address must fit that chain.
const EVM = new Set(['eth', 'base', 'arb', 'op', 'pol', 'bsc', 'avax', 'gnosis', 'bera', 'monad', 'scroll', 'xlayer', 'plasma', 'hlevm'])

export function refundAddress(blockchain: string, input: unknown): string {
  const s = String(input ?? '').trim()
  const bad = () => new HttpError(400, `Enter your ${chainName(blockchain)} address, so a failed payment can be refunded to you`)
  if (!s || s.length > 120 || /\s/.test(s)) throw bad()
  if (EVM.has(blockchain) && !/^0x[0-9a-fA-F]{40}$/.test(s)) throw bad()
  if (blockchain === 'sol') {
    try {
      new PublicKey(s)
    } catch {
      throw bad()
    }
  }
  if (blockchain === 'tron' && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s)) throw bad()
  if (blockchain === 'btc' && !/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(s)) throw bad()
  return s
}

export const CHAIN_NAMES: Record<string, string> = {
  eth: 'Ethereum', base: 'Base', arb: 'Arbitrum', op: 'Optimism', pol: 'Polygon', bsc: 'BNB Chain', avax: 'Avalanche',
  sol: 'Solana', btc: 'Bitcoin', tron: 'Tron', ton: 'TON', near: 'NEAR', sui: 'Sui', aptos: 'Aptos', doge: 'Dogecoin',
  ltc: 'Litecoin', xrp: 'XRP', zec: 'Zcash', bch: 'Bitcoin Cash', stellar: 'Stellar', cardano: 'Cardano', gnosis: 'Gnosis',
  bera: 'Berachain', starknet: 'Starknet', monad: 'Monad', scroll: 'Scroll', dash: 'Dash',
}
export const chainName = (b: string) => CHAIN_NAMES[b] ?? b.toUpperCase()

// Slow-finality chains need longer before the quote's refund deadline kicks in.
const SLOW = new Set(['btc', 'ltc', 'doge', 'bch', 'zec', 'dash'])

export type QuoteInput = { originAsset: unknown; amount: unknown; recipient: unknown; refundTo: unknown; dry: unknown }

export async function quote(input: QuoteInput, f: Fetcher = fetch) {
  const list = await tokens(f)
  const usdc = solanaUsdc(list)
  const origin = list.find((t) => t.assetId === input.originAsset)
  if (!origin) throw new HttpError(400, 'Pick a token to pay with')
  if (origin.assetId === usdc.assetId) throw new HttpError(400, 'That is already USDC on Solana; use the Crypto (USDC) option instead')

  const amount = usdcUnits(input.amount)
  const recipient = solanaAddress(input.recipient)
  const refundTo = refundAddress(origin.blockchain, input.refundTo)
  const dry = input.dry !== false
  const minutes = SLOW.has(origin.blockchain) ? 120 : 30

  const body = {
    dry,
    swapType: 'EXACT_OUTPUT', // the customer chooses how much USDC arrives; Aurora works out what to send
    slippageTolerance: SLIPPAGE_BPS,
    originAsset: origin.assetId,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset: usdc.assetId,
    amount: amount.toString(),
    recipient,
    recipientType: 'DESTINATION_CHAIN',
    refundTo,
    refundType: 'ORIGIN_CHAIN',
    deadline: new Date(Date.now() + minutes * 60_000).toISOString(),
    quoteWaitingTimeMs: 3000,
    referral: 'pamoja',
  }

  const r = await call<AuroraQuoteResponse>(f, `${BASE}/quote/${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const q = r.quote
  if (!q || typeof q.amountInFormatted !== 'string') throw new Error('Aurora quote response has no quote')
  if (!dry && !q.depositAddress) throw new Error('Aurora live quote has no deposit address')
  // Sanity check before showing a deposit address: the quote must deliver (about) the USDC we asked
  // for. Allows up to 1% for Aurora's withdrawal fee; anything less means a wrong asset or decimals.
  if (BigInt(q.amountOut) * 100n < amount * 99n) throw new Error('Aurora quote delivers less USDC than requested')

  return {
    dry,
    origin: { assetId: origin.assetId, symbol: origin.symbol, blockchain: origin.blockchain, chain: chainName(origin.blockchain), decimals: origin.decimals },
    recipient,
    refundTo,
    amountOut: q.amountOutFormatted,
    amountIn: q.amountInFormatted,
    amountInUnits: q.amountIn,
    minAmountIn: q.minAmountIn,
    amountInUsd: q.amountInUsd,
    timeEstimate: q.timeEstimate,
    depositAddress: q.depositAddress ?? null,
    depositMemo: q.depositMemo ?? null,
    deadline: q.deadline ?? null,
    // Keep these with the payment: Aurora's signature over the quote settles any dispute later.
    correlationId: r.correlationId,
    signature: r.signature,
    timestamp: r.timestamp,
  }
}

export type SwapStatus = 'PENDING_DEPOSIT' | 'KNOWN_DEPOSIT_TX' | 'PROCESSING' | 'SUCCESS' | 'INCOMPLETE_DEPOSIT' | 'REFUNDED' | 'FAILED'

type TxRef = { hash: string; explorerUrl?: string }
type StatusResponse = {
  status: SwapStatus
  updatedAt?: string
  swapDetails?: {
    amountOutFormatted?: string
    amountInFormatted?: string
    refundedAmountFormatted?: string
    originChainTxHashes?: TxRef[]
    destinationChainTxHashes?: TxRef[]
    refundReason?: string | null
  }
}

export async function status(depositAddress: unknown, f: Fetcher = fetch) {
  const addr = String(depositAddress ?? '').trim()
  if (!/^[A-Za-z0-9:._-]{20,120}$/.test(addr)) throw new HttpError(400, 'Invalid deposit address')
  const r = await call<StatusResponse>(f, `${BASE}/status/${apiKey()}?depositAddress=${encodeURIComponent(addr)}`)
  const d = r.swapDetails ?? {}
  const txs = (l?: TxRef[]) => (Array.isArray(l) ? l.filter((t) => t && typeof t.hash === 'string').map((t) => ({ hash: t.hash, url: t.explorerUrl ?? null })) : [])
  return {
    status: r.status,
    updatedAt: r.updatedAt ?? null,
    amountOut: d.amountOutFormatted ?? null,
    amountIn: d.amountInFormatted ?? null,
    refunded: d.refundedAmountFormatted ?? null,
    refundReason: d.refundReason ?? null,
    originTxs: txs(d.originChainTxHashes),
    solanaTxs: txs(d.destinationChainTxHashes),
  }
}

// What people actually hold to pay a hairdresser or a plumber: stablecoins and major coins. Aurora's
// full list also has memecoins, yield-vault receipts and deprecated tokens, which only add confusion.
export const PAYABLE_SYMBOLS = new Set([
  'USDT', 'USDC', 'USDT0', 'DAI', 'ETH', 'BTC', 'WBTC', 'wBTC', 'cbBTC', 'BNB', 'SOL', 'TRX', 'NEAR', 'wNEAR',
  'POL', 'AVAX', 'ARB', 'OP', 'SUI', 'APT', 'XRP', 'DOGE', 'LTC', 'BCH', 'ZEC', 'XLM', 'ADA',
])

/** Tokens a customer can pay with: curated, priced, one entry per chain+symbol, never USDC-on-Solana itself. */
export async function payableTokens(f: Fetcher = fetch) {
  const list = await tokens(f)
  const usdc = solanaUsdc(list)
  const seen = new Set<string>()
  const usable = list.filter((t) => {
    if (t.assetId === usdc.assetId || !(typeof t.price === 'number' && t.price > 0)) return false
    if (!PAYABLE_SYMBOLS.has(t.symbol)) return false
    if (t.assetId.startsWith('1cs_v1:') || t.assetId.includes('miden-')) return false // wrapped re-listings of the same coin
    const key = `${t.blockchain}:${t.symbol.toUpperCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return {
    destination: { assetId: usdc.assetId, symbol: 'USDC', chain: 'Solana' },
    tokens: usable.map((t) => ({ assetId: t.assetId, symbol: t.symbol, blockchain: t.blockchain, chain: chainName(t.blockchain), price: t.price! })),
    limits: { min: MIN_USDC, max: MAX_USDC },
  }
}
