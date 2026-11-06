import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { explorer, STABLE_SYMBOL } from '../lib/config'

// For customers who paid by mobile money or card, so have no wallet: look up the booking and use the
// SMS code to dispute a delivery or reclaim the money after the deadline. The Pamoja treasury signs
// the on-chain step on their behalf once the code checks out.

type JobInfo = {
  status: 'created' | 'funded' | 'delivered' | 'disputed' | 'released' | 'cancelled' | 'refunded'
  reference: string
  amount: string
  provider: string
  deadline: number
  deliveredAt: number | null
  disputeEnds: number | null
  paidByMobileMoney: boolean
}

const LABEL: Record<JobInfo['status'], string> = {
  created: 'Awaiting payment',
  funded: 'Paid in, waiting for the service',
  delivered: 'Provider says it is done',
  disputed: 'Disputed: Pamoja is reviewing it',
  released: 'Provider paid',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

const when = (unix: number) => new Date(unix * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${r.status})`)
  return data as T
}

export function Booking({ initialJob }: { initialJob: string }) {
  const [job, setJob] = useState(initialJob)
  const [info, setInfo] = useState<JobInfo | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const lookUp = useCallback(async (address: string) => {
    if (!address.trim()) return
    setBusy(true)
    setMsg('')
    try {
      setInfo(await call<JobInfo>(`/api/escrow/job?address=${encodeURIComponent(address.trim())}`))
    } catch (e) {
      setInfo(null)
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (initialJob) { setJob(initialJob); lookUp(initialJob) }
  }, [initialJob, lookUp])

  const act = async (action: 'dispute' | 'refund') => {
    setBusy(true)
    setMsg(action === 'dispute' ? 'Sending your dispute…' : 'Requesting your refund…')
    try {
      await call(`/api/escrow/${action}`, { method: 'POST', body: JSON.stringify({ job: job.trim(), code }) })
      setMsg(action === 'dispute'
        ? 'Dispute received. The payment stays locked while Pamoja reviews it; we will text you the outcome.'
        : 'Refund started. The money will be sent back to your mobile money number.')
      setCode('')
      await lookUp(job)
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const now = Math.floor(Date.now() / 1000)
  const canDispute = info?.status === 'delivered' && info.disputeEnds !== null && now <= info.disputeEnds
  const canRefund = info?.status === 'funded' && now > info.deadline

  return (
    <details className="booking" open={!!initialJob}>
      <summary>Manage a booking paid by mobile money or card</summary>
      <div className="fields">
        <label>Job address (from your SMS link)
          <input value={job} onChange={(e) => setJob(e.target.value)} placeholder="Job address" disabled={busy} />
        </label>
      </div>
      <button className="btn pay" onClick={() => lookUp(job)} disabled={busy || !job.trim()}>
        {busy ? <><Loader2 className="spin" size={18} /> Working…</> : 'Look up booking'}
      </button>

      {info && (
        <div className="booking-info">
          <p>
            <strong>{info.reference}</strong> · {info.amount} {STABLE_SYMBOL} locked · <span className={`chip chip-${info.status}`}>{LABEL[info.status]}</span>{' '}
            <a href={explorer(job.trim())} target="_blank" rel="noreferrer">Explorer</a>
          </p>
          {info.status === 'funded' && <p className="crypto-note">Deadline {when(info.deadline)}. If the provider has not finished or marked it delivered by then, you can get your money back here.</p>}
          {info.status === 'delivered' && info.disputeEnds && (
            <p className="crypto-note">
              {canDispute
                ? `The provider marked this done. If the service was not delivered, dispute before ${when(info.disputeEnds)}. Otherwise the provider is paid after that time.`
                : 'The time to dispute has passed; the provider can now claim the payment.'}
            </p>
          )}

          {info.paidByMobileMoney && (canDispute || canRefund) && (
            <div className="fields">
              <label>Your 6-digit code (from the SMS)
                <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="PMJ-HAIR-123456 or 123456" disabled={busy} />
              </label>
            </div>
          )}
          {info.paidByMobileMoney && canDispute && (
            <button className="btn pay" onClick={() => act('dispute')} disabled={busy || !code.trim()}>Dispute this delivery</button>
          )}
          {info.paidByMobileMoney && canRefund && (
            <button className="btn btn-primary pay" onClick={() => act('refund')} disabled={busy || !code.trim()}>Get my money back</button>
          )}
          {!info.paidByMobileMoney && (canDispute || canRefund) && (
            <p className="crypto-note">This job was paid from a wallet. Connect that wallet and use the Business tab to manage it.</p>
          )}
        </div>
      )}
      {msg && <p className="pay-msg" role="status">{msg}</p>}
    </details>
  )
}
