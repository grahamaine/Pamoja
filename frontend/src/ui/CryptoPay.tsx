import { useState } from 'react'
import { BN } from '@anchor-lang/core'
import { PublicKey } from '@solana/web3.js'
import { CircleCheck, CircleX, Loader2 } from 'lucide-react'
import { usePamojaProgram } from '../useProgram'
import { friendly } from '../useEscrow'
import { useConfirmService } from '../useConfirmService'
import { createAndFundJob, toBaseUnits, type EscrowProgram } from '../lib/escrow'
import { ATTESTOR_ADDRESS, explorer, STABLE_DECIMALS, STABLE_MINT, STABLE_SYMBOL } from '../lib/config'
import { CATEGORIES } from './Services'

// Pay with crypto: creates the job and locks the payment in the escrow vault.
export function CryptoPay() {
  const ctx = usePamojaProgram()
  const service = useConfirmService()
  const [reference, setReference] = useState('HAIR')
  const [provider, setProvider] = useState('')
  const [amount, setAmount] = useState('5')
  const [hours, setHours] = useState('24')
  const [phase, setPhase] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle')
  const [message, setMessage] = useState('')
  const [job, setJob] = useState('')

  if (!ctx) {
    return <p className="crypto-note">Connect your wallet (top right) to pay with {STABLE_SYMBOL} on Solana devnet.</p>
  }

  const submit = async () => {
    setPhase('sending')
    setMessage('Approve the two requests in your wallet: create the job, then lock the payment.')
    try {
      const providerKey = new PublicKey(provider.trim())
      const confirmer = service.ready && service.attestor ? service.attestor : ATTESTOR_ADDRESS
      const attestor = confirmer ? new PublicKey(confirmer) : ctx.wallet.publicKey
      const base = toBaseUnits(amount, STABLE_DECIMALS)
      if (base.isZero()) throw new Error('Enter an amount above zero')
      const h = Number(hours)
      if (!(h >= 1 && h <= 24 * 30)) throw new Error('Choose a deadline between 1 hour and 30 days')

      const address = await createAndFundJob(ctx.program as EscrowProgram, ctx.wallet.publicKey, {
        provider: providerKey,
        mint: STABLE_MINT,
        amount: base,
        reference,
        attestor,
        deadline: new BN(Math.floor(Date.now() / 1000) + Math.round(h * 3600)),
      })
      setJob(address.toBase58())
      setPhase('done')
      setMessage(service.ready ? 'Payment locked. Next, open the Business tab and text yourself the confirmation code.' : 'Payment locked in escrow. Track it in the Business tab.')
    } catch (e) {
      setPhase('failed')
      setMessage(/Invalid public key/i.test(String((e as Error).message)) ? 'That provider address is not valid.' : friendly(e))
    }
  }

  const busy = phase === 'sending'

  return (
    <div className="crypto">
      <div className="fields">
        <label>Service
          <select value={reference} onChange={(e) => setReference(e.target.value)} disabled={busy}>
            {CATEGORIES.map((c) => <option key={c.ref} value={c.ref}>{c.ref} · {c.name}</option>)}
          </select>
        </label>
        <label>Provider wallet address
          <input placeholder="Solana address of the business" value={provider} onChange={(e) => setProvider(e.target.value)} disabled={busy} />
        </label>
        <label>Amount ({STABLE_SYMBOL})
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} disabled={busy} />
        </label>
        <label>Deadline (hours from now)
          <input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ''))} disabled={busy} />
        </label>
      </div>

      <p className="crypto-note">
        The provider must be confirmed before the deadline; after it, only you can take the money back.{' '}
        You need devnet SOL for fees and test {STABLE_SYMBOL} in this wallet:{' '}
        <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">SOL faucet</a> ·{' '}
        <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">USDC faucet</a> (choose Solana Devnet).
        {service.loaded && !service.ready && !ATTESTOR_ADDRESS && ' Demo mode: you confirm your own job. When the SMS confirmation service is switched on, the customer gets a code by SMS instead.'}
        {service.ready && ' Confirmation by SMS code is on: after paying, you get a 6-digit code to give the provider when the service is done.'}
      </p>

      <button className="btn btn-primary pay" onClick={submit} disabled={busy}>
        {busy ? <><Loader2 className="spin" size={18} /> Working…</> : `Create job and lock ${amount || 0} ${STABLE_SYMBOL}`}
      </button>

      {message && (
        <p className={`pay-msg ${phase === 'done' ? 'done' : phase === 'failed' ? 'failed' : ''}`} role="status">
          {phase === 'done' && <CircleCheck size={18} />}
          {phase === 'failed' && <CircleX size={18} />}
          {message}
          {job && <> <a href={explorer(job)} target="_blank" rel="noreferrer">View on Explorer</a></>}
        </p>
      )}
    </div>
  )
}
