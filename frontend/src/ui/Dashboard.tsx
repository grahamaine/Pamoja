import type { ReactElement } from 'react'
import { Lock, Banknote, CircleCheck, Clock, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useEscrow } from '../useEscrow'
import { useConfirmService } from '../useConfirmService'
import { ConfirmBox } from './ConfirmBox'
import {
  canFund, canRefund, canRelease, cancelJob, closeJob, fromBaseUnits, fundJob, isFinal, refundJob, releaseJob, trustOf, type JobView,
} from '../lib/escrow'
import { explorer, PROGRAM_ID, STABLE_DECIMALS, STABLE_MINT, STABLE_SYMBOL } from '../lib/config'
import './Dashboard.css'

const LABEL: Record<string, string> = { created: 'Awaiting payment', funded: 'Locked', released: 'Released', cancelled: 'Cancelled', refunded: 'Refunded' }

const LEVELS = [
  { name: 'Bronze', from: 0 },
  { name: 'Silver', from: 10 },
  { name: 'Gold', from: 30 },
  { name: 'Diamond', from: 75 },
]

function levelFor(completed: number) {
  const idx = LEVELS.reduce((acc, l, i) => (completed >= l.from ? i : acc), 0)
  const next = LEVELS[idx + 1]
  return { current: LEVELS[idx], next, progress: next ? (completed - LEVELS[idx].from) / (next.from - LEVELS[idx].from) : 1 }
}

/** Shown to the provider on every open job: is this payment real, and who can release it? */
function TrustBadge({ j, pamojaAttestor }: { j: JobView; pamojaAttestor: string | null }) {
  const t = trustOf(j, STABLE_MINT, pamojaAttestor)
  if (t.mintOk && t.confirmer === 'pamoja') {
    return <span className="trust ok" title={`Locked in ${STABLE_SYMBOL}. Released by the Pamoja SMS service when you enter the customer's code.`}><ShieldCheck size={14} /> Verified: {STABLE_SYMBOL}, Pamoja confirmation</span>
  }
  const problems: string[] = []
  if (!t.mintOk) problems.push(`not ${STABLE_SYMBOL}; check the token before you start`)
  if (t.confirmer === 'customer') problems.push('the customer confirms it themselves (demo mode)')
  if (t.confirmer === 'unknown') problems.push('confirmed by an unknown key, not the Pamoja service')
  return <span className="trust warn" title="Neither case lets anyone take the money from you, but you might not get paid."><TriangleAlert size={14} /> Payment {problems.join('; ')}</span>
}

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`
const when = (unix: number) => new Date(unix * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const money = (j: JobView) => `${fromBaseUnits(j.amount, STABLE_DECIMALS)} ${j.mint.equals(STABLE_MINT) ? STABLE_SYMBOL : 'tokens'}`

const EMBED = `<a href="https://pamoja-solana.vercel.app/#pay"
   class="pamoja-pay">Pay with Pamoja</a>`

// What visitors see before they connect a wallet.
const DEMO = [
  { id: 'J-1042', service: 'HAIR', who: 'Customer ••41', amount: '45 USDC', status: 'funded' },
  { id: 'J-1041', service: 'REPR', who: 'Customer ••17', amount: '120 USDC', status: 'funded' },
  { id: 'J-1040', service: 'DLVR', who: 'Retailer ••08', amount: '310 USDC', status: 'created' },
  { id: 'J-1039', service: 'HAIR', who: 'Customer ••62', amount: '12 USDC', status: 'released' },
]

export function Dashboard() {
  const { connected, me, program, jobs, loading, error, busy, notes, refresh, act } = useEscrow()
  const service = useConfirmService()

  const locked = jobs.filter((j) => j.status === 'funded').reduce((s, j) => s + Number(fromBaseUnits(j.amount, STABLE_DECIMALS)), 0)
  const released = jobs.filter((j) => j.status === 'released')
  const paidOut = released.reduce((s, j) => s + Number(fromBaseUnits(j.amount, STABLE_DECIMALS)), 0)
  const open = jobs.filter((j) => j.status === 'created' || j.status === 'funded').length
  const completedAsProvider = me ? released.filter((j) => j.provider.equals(me)).length : 0
  const { current, next, progress } = levelFor(connected ? completedAsProvider : 1)

  const stats = connected
    ? [
        { label: 'Funds in escrow', value: `${locked} ${STABLE_SYMBOL}`, Icon: Lock },
        { label: 'Paid out', value: `${paidOut} ${STABLE_SYMBOL}`, Icon: Banknote },
        { label: 'Jobs completed', value: String(released.length), Icon: CircleCheck },
        { label: 'Open jobs', value: String(open), Icon: Clock },
      ]
    : [
        { label: 'Funds in escrow', value: '475 USDC', Icon: Lock },
        { label: 'Paid out', value: '12 USDC', Icon: Banknote },
        { label: 'Jobs completed', value: '1', Icon: CircleCheck },
        { label: 'Open jobs', value: '3', Icon: Clock },
      ]

  const now = Math.floor(Date.now() / 1000)

  const actions = (j: JobView) => {
    if (!program || !me) return null
    const key = j.address.toBase58()
    const isCustomer = j.customer.equals(me)
    const isAttestor = j.attestor.equals(me)
    const disabled = busy !== null
    const btns: ReactElement[] = []

    if (isCustomer && canFund(j, now)) {
      btns.push(<button key="fund" className="mini primary" disabled={disabled} onClick={() => act(key, () => fundJob(program, me, j))}>Pay in</button>)
    }
    if (isCustomer && j.status === 'created') {
      btns.push(<button key="cancel" className="mini" disabled={disabled} onClick={() => act(key, () => cancelJob(program, j))}>Cancel</button>)
    }
    if (isAttestor && canRelease(j, now)) {
      btns.push(<button key="release" className="mini primary" disabled={disabled} onClick={() => act(key, () => releaseJob(program, me, j))}>Confirm &amp; pay provider</button>)
    }
    if (isCustomer && j.status === 'funded') {
      const late = canRefund(j, now)
      btns.push(
        <button key="refund" className="mini" disabled={disabled || !late} title={late ? '' : `Available after ${when(j.deadline.toNumber())}`} onClick={() => act(key, () => refundJob(program, me, j))}>
          {late ? 'Refund' : `Refund after ${when(j.deadline.toNumber())}`}
        </button>,
      )
    }
    if (isCustomer && isFinal(j)) {
      btns.push(<button key="close" className="mini" disabled={disabled} title="Deletes the finished job and returns its rent (about 0.002 SOL) to you" onClick={() => act(key, () => closeJob(program, me, j))}>Close &amp; reclaim rent</button>)
    }
    const isProvider = j.provider.equals(me)
    const viaService = service.ready && service.attestor !== null && j.attestor.toBase58() === service.attestor && canRelease(j, now)
    return (
      <>
        {isProvider && !isCustomer && (j.status === 'created' || j.status === 'funded') && <TrustBadge j={j} pamojaAttestor={service.attestor} />}
        {isProvider && j.status === 'funded' && !canRelease(j, now) && <small className="note">The deadline has passed, so this payment can no longer be released to you.</small>}
        {viaService && isCustomer && <ConfirmBox job={key} role="customer" onDone={refresh} />}
        {viaService && isProvider && <ConfirmBox job={key} role="provider" onDone={refresh} />}
        <div className="row-actions">{btns}</div>
        {notes[key] && <small className="note">{notes[key]}</small>}
      </>
    )
  }

  return (
    <div className="dash">
      {connected ? (
        <p className="demo-note">
          Live from Solana devnet · program <a href={explorer(PROGRAM_ID)} target="_blank" rel="noreferrer">{short(PROGRAM_ID)}</a>
          <button className="refresh" onClick={refresh} disabled={loading} title="Reload" aria-label="Reload jobs"><RefreshCw size={14} className={loading ? 'spin' : ''} /></button>
        </p>
      ) : (
        <p className="demo-note">Example data. Connect your wallet to see your own jobs from the escrow program.</p>
      )}

      <div className="dash-stats">
        {stats.map((s) => (
          <div className="card wide stat" key={s.label}>
            <span className="ico"><s.Icon size={24} strokeWidth={1.8} /></span>
            <div className="body">
              <span>{s.label}</span>
              <strong>{s.value}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="dash-cols">
        <div className="card jobs">
          <h3>Your jobs</h3>
          {error && <p className="err">{error}</p>}
          {connected && !loading && jobs.length === 0 && !error && (
            <p className="empty">No jobs yet. Create one from the Pay tab (Crypto option) and it will appear here.</p>
          )}
          {(!connected || jobs.length > 0) && (
            <table>
              <thead>
                <tr><th>Job</th><th>Service</th><th>Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {connected
                  ? jobs.map((j) => (
                      <tr key={j.address.toBase58()}>
                        <td data-label="Job"><a href={explorer(j.address.toBase58())} target="_blank" rel="noreferrer">{short(j.address.toBase58())}</a></td>
                        <td data-label="Service">
                          {j.reference}
                          <small>{me && j.customer.equals(me) ? `to ${short(j.provider.toBase58())}` : `from ${short(j.customer.toBase58())}`} · due {when(j.deadline.toNumber())}</small>
                          {actions(j)}
                        </td>
                        <td data-label="Amount">{money(j)}</td>
                        <td data-label="Status"><span className={`chip chip-${j.status}`}>{LABEL[j.status]}</span></td>
                      </tr>
                    ))
                  : DEMO.map((j) => (
                      <tr key={j.id}>
                        <td data-label="Job">{j.id}</td>
                        <td data-label="Service">{j.service}<small>{j.who}</small></td>
                        <td data-label="Amount">{j.amount}</td>
                        <td data-label="Status"><span className={`chip chip-${j.status}`}>{LABEL[j.status]}</span></td>
                      </tr>
                    ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="dash-side">
          <div className="card">
            <h3>Provider level</h3>
            <p className="level"><span className="badge">{current.name}</span>{next ? ` · ${next.from - (connected ? completedAsProvider : 1)} more jobs to ${next.name}` : ' · top level'}</p>
            <div className="bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          </div>
          <div className="card">
            <h3>“Pay with Pamoja” button</h3>
            <p>Paste this on your website or share the link on WhatsApp.</p>
            <pre>{EMBED}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}
