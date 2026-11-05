import { useEffect, useRef, useState } from 'react'
import { Coins, Smartphone, CreditCard, Loader2, CircleCheck, CircleX, Globe, type LucideIcon } from 'lucide-react'
import { CryptoPay } from './CryptoPay'
import { AnyChainPay } from './AnyChainPay'
import './PayWidget.css'

type Method = 'mtn' | 'airtel' | 'pesapal' | 'crypto' | 'anychain'
type Phase = 'idle' | 'sending' | 'waiting' | 'done' | 'failed'

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

export function PayWidget() {
  const [method, setMethod] = useState<Method>('mtn')
  const [amount, setAmount] = useState('10000')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState('')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearInterval(timer.current), [])

  // Demo job reference. In the real flow this comes from the on-chain Job.
  const jobRef = 'DEMO-HAIR-001'

  const poll = (statusUrl: string) => {
    let tries = 0
    window.clearInterval(timer.current)
    timer.current = window.setInterval(async () => {
      tries += 1
      try {
        const { status } = await call<{ status: string }>(statusUrl)
        if (status === 'SUCCESSFUL') { window.clearInterval(timer.current); setPhase('done'); setMessage('Payment received. In this prototype, mobile money and card payments are not yet linked to the escrow; use Crypto or Any chain for the full escrow flow.') }
        else if (status === 'FAILED') { window.clearInterval(timer.current); setPhase('failed'); setMessage('The payment was declined or cancelled.') }
      } catch { /* keep polling */ }
      if (tries >= 40) { window.clearInterval(timer.current); setPhase('failed'); setMessage('Timed out waiting for approval. Try again.') }
    }, 3000)
  }

  const pay = async () => {
    setPhase('sending')
    setMessage('')
    try {
      const body = JSON.stringify({ amount: Number(amount), phone, email, jobRef })
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

  const needsPhone = method === 'mtn' || method === 'airtel'
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
        <label>Amount (UGX)
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} disabled={busy} />
        </label>
        {needsPhone && (
          <label>Mobile number
            <input inputMode="tel" placeholder="0772 123456" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
          </label>
        )}
        {method === 'pesapal' && (
          <label>Email or phone
            <input placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
          </label>
        )}
      </div>

      <button className="btn btn-primary pay" onClick={pay} disabled={busy}>
        {busy ? <><Loader2 className="spin" size={18} /> {phase === 'sending' ? 'Sending…' : 'Waiting for approval…'}</> : `Pay ${Number(amount || 0).toLocaleString()} UGX`}
      </button>

      {message && (
        <p className={`pay-msg ${phase}`} role="status">
          {phase === 'done' && <CircleCheck size={18} />}
          {phase === 'failed' && <CircleX size={18} />}
          {message}
        </p>
      )}
        </>
      )}
    </div>
  )
}
