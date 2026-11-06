import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { HttpError, env } from './common.js'
import type { Deps, Sms, Store } from './confirm.js'
import type { FiatDeps } from './fiat.js'

/** Upstash Redis over its REST API (free tier works). Holds hashed codes and attempt counters. */
export class UpstashStore implements Store {
  constructor(private url: string, private token: string) {}

  private async cmd(...args: (string | number)[]): Promise<unknown> {
    const r = await fetch(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (!r.ok) throw new Error(`Upstash ${args[0]} failed (${r.status})`)
    return ((await r.json()) as { result: unknown }).result
  }

  async get(key: string) { return ((await this.cmd('GET', key)) as string | null) ?? null }
  async set(key: string, value: string, ttl: number) { await this.cmd('SET', key, value, 'EX', ttl) }
  async del(key: string) { await this.cmd('DEL', key) }
  async incr(key: string, ttl: number) {
    const n = Number(await this.cmd('INCR', key))
    if (n === 1) await this.cmd('EXPIRE', key, ttl)
    return n
  }
}

/** For tests and local development only. Serverless instances do not share memory. */
export class MemoryStore implements Store {
  private m = new Map<string, string>()
  async get(k: string) { return this.m.get(k) ?? null }
  async set(k: string, v: string) { this.m.set(k, v) }
  async del(k: string) { this.m.delete(k) }
  async incr(k: string) { const n = Number(this.m.get(k) ?? 0) + 1; this.m.set(k, String(n)); return n }
}

/** Africa's Talking SMS. Use the sandbox host while testing. */
export class AfricasTalkingSms implements Sms {
  constructor(private username: string, private apiKey: string, private sandbox: boolean, private from?: string) {}

  async send(to: string, text: string) {
    const host = this.sandbox ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com'
    const body = new URLSearchParams({ username: this.username, to, message: text })
    if (this.from) body.set('from', this.from)
    const r = await fetch(`${host}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey: this.apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const data = (await r.json().catch(() => ({}))) as { SMSMessageData?: { Recipients?: { status?: string; statusCode?: number }[] } }
    const rec = data.SMSMessageData?.Recipients?.[0]
    if (!r.ok || !rec || (rec.statusCode ?? 0) >= 400) throw new HttpError(502, 'The SMS could not be sent. Check the phone number and try again.')
  }
}

/** Tolerates a value pasted as `NAME="value"` instead of just `value`. */
export const clean = (v: string | undefined) =>
  (v ?? '').trim().replace(/^[A-Z][A-Z0-9_]*\s*=\s*/, '').replace(/^["']+|["']+$/g, '').trim()

/** Finds the web address even if the whole `NAME="https://..."` line, or both lines, were pasted. */
export const upstashUrl = (raw: string | undefined) => (raw ?? '').match(/https?:\/\/[^\s"']+/)?.[0] ?? clean(raw)

/** Finds the token even if the whole block was pasted; refuses a masked value. */
export const upstashToken = (raw: string | undefined) => {
  const v = raw ?? ''
  const t = (/REST_TOKEN\s*=\s*["']?([^"'\s]+)/.exec(v)?.[1] ?? clean(v)).trim()
  if (/^\*+$/.test(t)) throw new HttpError(503, 'The Upstash token was saved as asterisks. Reveal the token in Upstash (eye icon) and add it again.')
  return t
}

const cleanEnv = (name: string) => {
  const v = clean(process.env[name])
  if (!v) throw new HttpError(500, `Server is missing ${name}`)
  return v
}

function keypairFromEnv(name: string): Keypair {
  const raw = env(name)
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]))
  } catch {
    throw new HttpError(500, `${name} is not a valid key (expected the JSON array from a Solana keypair file)`)
  }
}
const attestorKey = () => keypairFromEnv('ATTESTOR_SECRET_KEY')

let cached: Deps | null = null

/** Builds the service from environment variables. Secrets stay on the server. */
export function buildDeps(): Deps {
  if (cached) return cached
  const redisUrl = upstashUrl(process.env.UPSTASH_REDIS_REST_URL)
  const redisToken = upstashToken(process.env.UPSTASH_REDIS_REST_TOKEN)
  if (!redisUrl || !redisToken) throw new HttpError(503, 'The confirmation service has no database configured yet')

  cached = {
    connection: new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed'),
    attestor: attestorKey(),
    store: new UpstashStore(redisUrl, redisToken),
    sms: new AfricasTalkingSms(cleanEnv('AT_USERNAME'), cleanEnv('AT_API_KEY'), clean(process.env.AT_ENV) !== 'production', clean(process.env.AT_SENDER_ID) || undefined),
    secret: cleanEnv('CODE_SECRET'),
  }
  return cached
}

// Circle's test USDC on Solana devnet, the same default the website uses.
const DEFAULT_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'

/** True when mobile money / card payments can fund the escrow. */
export const fiatConfigured = () => !!process.env.TREASURY_SECRET_KEY

let cachedFiat: FiatDeps | null = null

/**
 * The confirmation service plus the treasury that funds jobs for mobile money and card payers.
 * The treasury must be a different wallet from the attestor: the attestor decides disputes, and must
 * never be the customer of the jobs it decides.
 */
export function buildFiatDeps(): FiatDeps {
  if (cachedFiat) return cachedFiat
  const base = buildDeps()
  const treasury = keypairFromEnv('TREASURY_SECRET_KEY')
  if (treasury.publicKey.equals(base.attestor.publicKey)) throw new HttpError(500, 'TREASURY_SECRET_KEY must be a different wallet from ATTESTOR_SECRET_KEY')
  const rate = Number(clean(process.env.UGX_PER_USDC) || 3700)
  if (!(rate > 0)) throw new HttpError(500, 'UGX_PER_USDC must be a positive number')
  cachedFiat = {
    ...base,
    treasury,
    mint: new PublicKey(clean(process.env.STABLECOIN_MINT) || DEFAULT_MINT),
    ugxPerUsdc: rate,
    appUrl: (clean(process.env.PUBLIC_APP_URL) || 'https://pamoja-solana.vercel.app').replace(/\/$/, ''),
    adminToken: clean(process.env.ADMIN_TOKEN) || null,
  }
  return cachedFiat
}

/** For payment routes: the fiat deps when escrow funding is switched on, otherwise null. */
export const fiatDepsOrNull = () => (fiatConfigured() ? buildFiatDeps() : null)
