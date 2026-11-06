import { useEffect, useRef, useState } from 'react'
import { Coins, Smartphone, CreditCard, Loader2, CircleCheck, CircleX, Globe, type LucideIcon } from 'lucide-react'
import { CryptoPay } from './CryptoPay'
import { AnyChainPay } from './AnyChainPay'
import { Booking } from './Booking'
import { CATEGORIES } from './Services'
import { useConfirmService } from '../useConfirmService'
import { DISPUTE_WINDOWS } from '../lib/escrow'
import { explorer } from '../lib/config'
import './PayWidget.css'

type Method = 'mtn' | 'airtel' | 'pesapal' | 'crypto' | 'anychain'
type Phase = 'idle' | 'sending' | 'waiting' | 'done' | 'failed'
type StatusReply = { status: string; escrow?: 'none' | 'pending' | 'locked' | 'error'; job?: string; message?: string }

const METHODS: { id: Method; label: string; hint: string; Icon: LucideIcon }[] = [
  { id: 'mtn', label: 'MTN MoMo', hint: 'Approve on your phone', Icon: Smartphone },
  { id: 'airtel', label: 'Airtel Money', hint: 'Approve on your phone', Icon: Smartphone },
  { id: 'pesapal', label: 'Card / Bank', hint: 'Pesapal checkout', Icon: CreditCard },
  { id: 'crypto', label: 'Crypto (USDC)', hint: 'Pay from your wallet', Icon: Coins },
  { id: 'anychain', label: 'Any chain', hint: 'BTC, ETH, USDT and 100+ more', Icon: Globe },
]

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${r.status})`)
  return data as T
}

const params = new URLSearchParams(window.location.search)

export function PayWidget() {
  const service = useConfirmService()
  const escrowOn = service.fiatReady
  const [method, setMethod] = useState<Method>('mtn')
  const [reference, setReference] = useState('HAIR')
  const [provider, setProvider] = useState('')
  const [hours, setHours] = useState('24')
  const [disputeWin, setDisputeWin] = useState(String(DISPUTE_WINDOWS[0].seconds))
  const [job, setJob] = useState(params.get('job') ?? '')
  const [amount, setAmount] = useState('10000')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState('')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearInterval(timer.current), [])

  // Shown on the payment request and in the provider's records.
  const jobRef = `PMJ-${reference}`

  const poll = (statusUrl: string) => {
    let tries = 0
    window.clearInterval(timer.current)
    timer.current = window.setInterval(async () => {
      tries += 1
      try {
        const r = await call<StatusReply>(statusUrl)
        if (r.status === 'SUCCESSFUL') {
          if (r.escrow === 'pending') {
            setMessage('Payment received. Locking it in escrow…') // keep polling until the job is funded
          } else {
            window.clearInterval(timer.current)
            setPhase(r.escrow === 'error' ? 'failed' : 'done')
            if (r.escrow === 'locked' && r.job) {
              setJob(r.job)
              setMessage('Payment received and locked in escrow. We sent your confirmation code by SMS: give it to the provider only when the service is done.')
            } else if (r.escrow === 'error') {
              setMessage(r.message ?? 'Payment received, but locking it in escrow failed. Contact Pamoja.')
            } else {
              setMessage('Payment received.')
            }
          }
        } else if (r.status === 'FAILED') { window.clearInterval(timer.current); setPhase('failed'); setMessage('The payment was declined or cancelled.') }
      } catch { /* keep polling */ }
      if (tries >= 60) { window.clearInterval(timer.current); setPhase('failed'); setMessage('Timed out waiting for approval. Try again.') }
    }, 3000)
  }

  // Back from Pesapal's hosted checkout: it adds OrderTrackingId to the return address.
  useEffect(() => {
    const tracking = params.get('OrderTrackingId')
    if (tracking && /^[A-Za-z0-9-]{8,64}$/.test(tracking)) {
      setMethod('pesapal')
      setPhase('waiting')
      setMessage('Checking your card payment…')
      poll(`/api/pay/pesapal?tracking=${encodeURIComponent(tracking)}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pay = async () => {
    setPhase('sending')
    setMessage('')
    try {
      const escrow = escrowOn ? { provider: provider.trim(), reference, deadlineHours: Number(hours), disputeWindow: Number(disputeWin) } : {}
      const body = JSON.stringify({ amount: Number(amount), phone, email, jobRef, ...escrow })
      if (method === 'mtn') {
        const { referenceId } = await call<{ referenceId: string }>('/api/pay/mtn', { method: 'POST', body })
        setPhase('waiting'); setMessage('Check your phone and approve the MTN MoMo prompt.')
        poll(`/api/pay/mtn?ref=${referenceId}`)
      } else if (method === 'airtel') {
        const { transactionId } = await call<{ transactionId: string }>('/api/pay/airtel', { method: 'POST', body })
        setPhase('waiting'); setMessage('Check your phone and approve the Airtel Money prompt.')
        poll(`/api/pay/airtel?id=${transactionId}`)
      } else {
        const { redirectUrl } = await call<{ redirectUrl: string }>('/api/pay/pesapal', { method: 'POST', body })
        window.location.assign(redirectUrl)
      }
    } catch (e) {
      setPhase('failed')
      setMessage((e as Error).message)
    }
  }

  const needsPhone = method === 'mtn' || method === 'airtel' || escrowOn
  const busy = phase === 'sending' || phase === 'waiting'

  return (
    <div className="card paywidget">
      <div className="methods" role="radiogroup" aria-label="Payment method">
        {METHODS.map(({ id, label, hint, Icon }) => (
          <button key={id} role="radio" aria-checked={method === id} className={method === id ? 'method on' : 'method'} onClick={() => setMethod(id)} disabled={busy}>
            <Icon size={22} strokeWidth={1.8} />
            <span><strong>{label}</strong><small>{hint}</small></span>
          </button>
        ))}
      </div>

      {method === 'crypto' ? (
        <CryptoPay />
      ) : method === 'anychain' ? (
        <AnyChainPay onUseUsdc={() => setMethod('crypto')} />
      ) : (
        <>
      <div className="fields">
        {escrowOn && (
          <>
            <label>Service
              <select value={reference} onChange={(e) => setReference(e.target.value)} disabled={busy}>
                {CATEGORIES.map((c) => <option key={c.ref} value={c.ref}>{c.ref} · {c.name}</option>)}
              </select>
            </label>
            <label>Provider wallet address
              <input placeholder="Solana address of the business" value={provider} onChange={(e) => setProvider(e.target.value)} disabled={busy} />
            </label>
            <label>Deadline (hours from now)
              <input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ''))} disabled={busy} />
            </label>
            <label>Time to dispute a delivery
              <select value={disputeWin} onChange={(e) => setDisputeWin(e.target.value)} disabled={busy}>
                {DISPUTE_WINDOWS.map((w) => <option key={w.seconds} value={w.seconds}>{w.label}</option>)}
              </select>
            </label>
          </>
        )}
        <label>Amount (UGX)
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} disabled={busy} />
        </label>
        {needsPhone && (
          <label>Mobile number
            <input inputMode="tel" placeholder="0772 123456" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
          </label>
        )}
        {method === 'pesapal' && (
          <label>Email{escrowOn ? '' : ' or phone'}
            <input placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
          </label>
        )}
      </div>

      <p className="crypto-note">
        {escrowOn
          ? 'Your payment is locked in escrow on Solana and only reaches the provider when you give them the SMS code, or if they mark the job delivered and you do not dispute in time. No wallet needed.'
          : 'Mobile money and card payments here are not linked to the escrow yet; use Crypto or Any chain for the full escrow flow.'}
      </p>

      <button className="btn btn-primary pay" onClick={pay} disabled={busy}>
        {busy ? <><Loader2 className="spin" size={18} /> {phase === 'sending' ? 'Sending…' : 'Waiting for approval…'}</> : `Pay ${Number(amount || 0).toLocaleString()} UGX`}
      </button>

      {message && (
        <p className={`pay-msg ${phase}`} role="status">
          {phase === 'done' && <CircleCheck size={18} />}
          {phase === 'failed' && <CircleX size={18} />}
          {message}
          {phase === 'done' && job && <> <a href={explorer(job)} target="_blank" rel="noreferrer">View on Explorer</a></>}
        </p>
      )}
        </>
      )}

      {escrowOn && <Booking initialJob={job} />}
    </div>
  )
}
