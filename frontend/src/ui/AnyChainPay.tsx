import { useEffect, useMemo, useRef, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import QRCode from 'qrcode'
import { CircleCheck, CircleX, Copy, Check, Loader2, RotateCcw } from 'lucide-react'
import {
  chainRank, clearSession, FINAL, getQuote, getStatus, getTokens, loadSession, saveSession, solscanTx,
  type PayToken, type Quote, type Status, type SwapStatus,
} from '../lib/intents'
import { STABLE_MINT } from '../lib/config'
import './AnyChainPay.css'

// Aurora delivers mainnet USDC. While Pamoja's escrow runs on devnet (hackathon), locking uses test USDC.
const ESCROW_ON_MAINNET = STABLE_MINT.toBase58() === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

// Pay from any chain: the customer sends BTC, ETH, USDT on Tron, … and exactly the chosen amount of
// USDC lands in their Solana wallet, ready to lock in escrow. Powered by Aurora Intents (NEAR Intents).

const STEPS: { key: string; label: string; done: (s: SwapStatus) => boolean; active: (s: SwapStatus) => boolean }[] = [
  { key: 'sent', label: 'Send the payment', done: (s) => s !== 'PENDING_DEPOSIT', active: (s) => s === 'PENDING_DEPOSIT' },
  { key: 'seen', label: 'Payment received', done: (s) => s === 'PROCESSING' || s === 'SUCCESS', active: (s) => s === 'KNOWN_DEPOSIT_TX' },
  { key: 'swap', label: 'Converting to USDC on Solana', done: (s) => s === 'SUCCESS', active: (s) => s === 'PROCESSING' },
  { key: 'done', label: 'USDC delivered to your wallet', done: (s) => s === 'SUCCESS', active: () => false },
]

function useCountdown(iso: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!iso) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [iso])
  if (!iso) return null
  const left = Math.max(0, Date.parse(iso) - now)
  const m = Math.floor(left / 60_000)
  const s = Math.floor((left % 60_000) / 1000)
  return { left, label: `${m}:${String(s).padStart(2, '0')}` }
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked: the value is still selectable */
    }
  }
  return (
    <div className="ac-copy">
      <span>{label}</span>
      <code>{value}</code>
      <button type="button" className="mini" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

export function AnyChainPay({ onUseUsdc }: { onUseUsdc?: () => void }) {
  const { publicKey } = useWallet()
  const [tokens, setTokens] = useState<PayToken[] | null>(null)
  const [limits, setLimits] = useState({ min: 1, max: 1000 })
  const [setupError, setSetupError] = useState('')
  const [chain, setChain] = useState('')
  const [assetId, setAssetId] = useState('')
  const [amount, setAmount] = useState('10')
  const [recipient, setRecipient] = useState('')
  const [refundTo, setRefundTo] = useState('')
  const [preview, setPreview] = useState<Quote | null>(null)
  const [live, setLive] = useState<Quote | null>(() => loadSession())
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [qr, setQr] = useState<{ address: string; url: string } | null>(null)
  const poller = useRef<number | undefined>(undefined)


  useEffect(() => {
    getTokens()
      .then((r) => {
        setTokens(r.tokens)
        setLimits(r.limits)
      })
      .catch((e: Error) => setSetupError(e.message))
  }, [])

  const chains = useMemo(() => {
    const seen = new Map<string, string>()
    for (const t of tokens ?? []) if (!seen.has(t.blockchain)) seen.set(t.blockchain, t.chain)
    return [...seen.entries()].sort((a, b) => chainRank(a[0]) - chainRank(b[0]) || a[1].localeCompare(b[1]))
  }, [tokens])

  // Defaults are derived, not stored: the first chain in CHAIN_ORDER (Tron, where most regional
  // stablecoins sit), its first stablecoin, and the connected wallet as the USDC destination.
  const activeChain = chain || chains[0]?.[0] || ''
  const chainTokens = useMemo(
    () => (tokens ?? []).filter((t) => t.blockchain === activeChain).sort((a, b) => (/^USD/.test(b.symbol) ? 1 : 0) - (/^USD/.test(a.symbol) ? 1 : 0) || a.symbol.localeCompare(b.symbol)),
    [tokens, activeChain],
  )
  const activeAsset = chainTokens.some((t) => t.assetId === assetId) ? assetId : (chainTokens[0]?.assetId ?? '')
  const activeRecipient = recipient || publicKey?.toBase58() || ''

  // Editing any input invalidates a price already shown.
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v)
    setPreview(null)
  }


  // Poll the live payment until it finishes.
  useEffect(() => {
    window.clearInterval(poller.current)
    if (!live?.depositAddress) return
    const tick = async () => {
      try {
        const s = await getStatus(live.depositAddress!)
        setStatus(s)
        if (FINAL.includes(s.status)) window.clearInterval(poller.current)
      } catch {
        /* keep polling through hiccups */
      }
    }
    void tick()
    poller.current = window.setInterval(tick, 6000)
    return () => window.clearInterval(poller.current)
  }, [live])

  useEffect(() => {
    const address = live?.depositAddress
    if (!address) return
    QRCode.toDataURL(address, { margin: 1, width: 220, color: { dark: '#070d10', light: '#ffffff' } })
      .then((url) => setQr({ address, url }))
      .catch(() => setQr(null))
  }, [live])

  const countdown = useCountdown(live?.deadline ?? null)
  const selected = chainTokens.find((t) => t.assetId === activeAsset)
  const qrUrl = qr && qr.address === live?.depositAddress ? qr.url : ''

  const ask = async (dry: boolean) => {
    setBusy(true)
    setError('')
    try {
      const q = await getQuote({ originAsset: activeAsset, amount, recipient: activeRecipient.trim(), refundTo: refundTo.trim(), dry })
      if (dry) setPreview(q)
      else {
        saveSession(q)
        setStatus(null)
        setLive(q)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const startOver = () => {
    const pending = (status?.status ?? 'PENDING_DEPOSIT') === 'PENDING_DEPOSIT'
    if (pending && !window.confirm('If you already sent funds to this address, they will still arrive in your Solana wallet, but this page will stop tracking them. Start a new payment?')) return
    clearSession()
    setLive(null)
    setStatus(null)
    setPreview(null)
  }

  if (setupError) {
    return (
      <div className="anychain">
        <p className="crypto-note">{setupError}</p>
      </div>
    )
  }
  if (!tokens) {
    return (
      <div className="anychain">
        <p className="crypto-note"><Loader2 className="spin" size={14} /> Loading the tokens you can pay with…</p>
      </div>
    )
  }

  // ----- A payment is in flight (or finished): show where to send and what is happening -----
  if (live?.depositAddress) {
    const s = status?.status ?? 'PENDING_DEPOSIT'
    const expired = countdown !== null && countdown.left === 0 && s === 'PENDING_DEPOSIT'
    return (
      <div className="anychain">
        {s === 'PENDING_DEPOSIT' && !expired && (
          <div className="ac-deposit">
            {qrUrl && <img src={qrUrl} width={220} height={220} alt={`QR code for the ${live.origin.chain} deposit address`} />}
            <div className="ac-deposit-text">
              <p className="ac-send">
                Send <strong>{live.amountIn} {live.origin.symbol}</strong> on <strong>{live.origin.chain}</strong>
              </p>
              <CopyField label="To this address" value={live.depositAddress} />
              {live.depositMemo && <CopyField label="With this memo (required)" value={live.depositMemo} />}
              <CopyField label="Amount" value={live.amountIn} />
              <p className="crypto-note">
                You can send from any wallet or straight from an exchange. Send only {live.origin.symbol} on {live.origin.chain}: other
                tokens or networks sent here are lost. Anything above what is needed comes back to {short(live.refundTo)}.
                {countdown && <> Address valid for <strong>{countdown.label}</strong>.</>}
              </p>
            </div>
          </div>
        )}

        <ol className="ac-steps" aria-label="Payment progress">
          {STEPS.map((st) => {
            const done = st.done(s)
            const active = st.active(s) && !expired
            return (
              <li key={st.key} className={done ? 'done' : active ? 'active' : ''} aria-current={active ? 'step' : undefined}>
                {done ? <CircleCheck size={16} /> : active ? <Loader2 className="spin" size={16} /> : <span className="dot" />}
                {st.label}
              </li>
            )
          })}
        </ol>

        {s === 'SUCCESS' && (
          <p className="pay-msg done" role="status">
            <CircleCheck size={18} />
            <span>
              {status?.amountOut ?? live.amountOut} USDC arrived in {short(live.recipient)}.{' '}
              {status?.solanaTxs[0] && <a href={status.solanaTxs[0].url || solscanTx(status.solanaTxs[0].hash)} target="_blank" rel="noreferrer">View on Solscan</a>}
            </span>
          </p>
        )}
        {s === 'INCOMPLETE_DEPOSIT' && (
          <p className="pay-msg failed" role="status"><CircleX size={18} /> Less than {live.amountIn} {live.origin.symbol} arrived. Send the rest to the same address before it expires, or it will be refunded.</p>
        )}
        {(s === 'REFUNDED' || s === 'FAILED') && (
          <p className="pay-msg failed" role="status">
            <CircleX size={18} />
            {s === 'REFUNDED'
              ? `The payment could not be completed and ${status?.refunded ?? 'your funds'} ${live.origin.symbol} went back to ${short(live.refundTo)}.`
              : 'The conversion failed. Your funds are returned to your refund address.'}
            {status?.refundReason ? ` (${status.refundReason})` : ''}
          </p>
        )}
        {expired && <p className="pay-msg failed" role="status"><CircleX size={18} /> This address has expired. Do not send to it; start a new payment.</p>}

        {s === 'SUCCESS' && !ESCROW_ON_MAINNET && (
          <p className="crypto-note">This USDC is on Solana mainnet. During the hackathon Pamoja's escrow runs on devnet, so locking a job uses test USDC for now.</p>
        )}

        <div className="ac-actions">
          {s === 'SUCCESS' && onUseUsdc && <button className="btn btn-primary" onClick={onUseUsdc}>Lock it in escrow</button>}
          {(FINAL.includes(s) || expired || s === 'PENDING_DEPOSIT') && (
            <button className="mini" onClick={startOver}><RotateCcw size={14} /> New payment</button>
          )}
        </div>
      </div>
    )
  }

  // ----- Form: choose what to pay with and how much USDC should arrive -----
  return (
    <div className="anychain">
      <div className="fields">
        <label>Pay from
          <select value={activeChain} onChange={(e) => edit(setChain)(e.target.value)} disabled={busy}>
            {chains.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label>With
          <select value={activeAsset} onChange={(e) => edit(setAssetId)(e.target.value)} disabled={busy}>
            {chainTokens.map((t) => <option key={t.assetId} value={t.assetId}>{t.symbol}</option>)}
          </select>
        </label>
        <label>USDC to receive
          <input inputMode="decimal" value={amount} onChange={(e) => edit(setAmount)(e.target.value.replace(/[^\d.]/g, ''))} disabled={busy} />
        </label>
        <label className="wide">Your Solana wallet
          <input placeholder="Where the USDC arrives" value={activeRecipient} onChange={(e) => edit(setRecipient)(e.target.value)} disabled={busy} />
        </label>
        <label className="wide">Your {selected?.chain ?? ''} address, for refunds
          <input placeholder={refundHint(activeChain)} value={refundTo} onChange={(e) => edit(setRefundTo)(e.target.value)} disabled={busy} />
        </label>
      </div>

      {preview && (
        <p className="ac-price" role="status">
          You send <strong>{preview.amountIn} {preview.origin.symbol}</strong> (about ${Number(preview.amountInUsd).toFixed(2)}) and receive{' '}
          <strong>{preview.amountOut} USDC</strong> on Solana, usually within {Math.max(1, Math.round(preview.timeEstimate / 60))} min of your payment arriving.
        </p>
      )}

      {preview ? (
        <button className="btn btn-primary pay" onClick={() => ask(false)} disabled={busy}>
          {busy ? <><Loader2 className="spin" size={18} /> Preparing…</> : 'Get deposit address'}
        </button>
      ) : (
        <button className="btn btn-primary pay" onClick={() => ask(true)} disabled={busy || !activeAsset}>
          {busy ? <><Loader2 className="spin" size={18} /> Checking price…</> : 'See price'}
        </button>
      )}

      {error && <p className="pay-msg failed" role="alert"><CircleX size={18} /> {error}</p>}

      <p className="crypto-note ac-foot">
        Between {limits.min} and {limits.max} USDC. Uses real funds on mainnet. Routed by Aurora Intents on NEAR Intents; no bridge or extra wallet needed.
      </p>
    </div>
  )
}

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a)

function refundHint(chain: string) {
  if (chain === 'tron') return 'T…'
  if (chain === 'btc') return 'bc1…'
  if (['eth', 'base', 'arb', 'op', 'pol', 'bsc', 'avax'].includes(chain)) return '0x…'
  return 'Address you are paying from'
}
