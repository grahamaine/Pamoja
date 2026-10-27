import { useCallback, useEffect, useState } from 'react'
import { usePamojaProgram } from './useProgram'
import { listJobs, type EscrowProgram, type JobView } from './lib/escrow'

/** Loads the connected wallet's jobs and runs escrow actions, with one message per job. */
export function useEscrow() {
  const ctx = usePamojaProgram()
  const program = ctx?.program as EscrowProgram | undefined
  const me = ctx?.wallet.publicKey

  const [jobs, setJobs] = useState<JobView[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    if (!program || !me) { setJobs([]); return }
    setLoading(true)
    setError('')
    try {
      setJobs(await listJobs(program, me))
    } catch (e) {
      setError(friendly(e))
    } finally {
      setLoading(false)
    }
  }, [program, me])

  useEffect(() => { refresh() }, [refresh])

  /** Runs one action for one job, then reloads the list. */
  const act = useCallback(async (job: string, fn: () => Promise<unknown>) => {
    setBusy(job)
    setNotes((n) => ({ ...n, [job]: 'Waiting for your wallet…' }))
    try {
      await fn()
      setNotes((n) => ({ ...n, [job]: 'Done' }))
      await refresh()
    } catch (e) {
      setNotes((n) => ({ ...n, [job]: friendly(e) }))
    } finally {
      setBusy(null)
    }
  }, [refresh])

  return { connected: !!me, me, program, jobs, loading, error, busy, notes, refresh, act }
}

export function friendly(e: unknown): string {
  const m = String((e as Error)?.message ?? e)
  if (/User rejected|rejected the request/i.test(m)) return 'You cancelled the request.'
  if (/0x1\b|insufficient (funds|lamports)/i.test(m)) return 'Not enough devnet SOL or USDC in this wallet.'
  if (/InstructionFallbackNotFound|0x65\b|101/.test(m)) return 'The live program does not have this instruction yet (needs an upgrade).'
  if (/TooEarly/.test(m)) return 'The deadline has not passed yet.'
  if (/DeadlinePassed/.test(m)) return 'The deadline has passed. Only a refund to the customer is possible now.'
  if (/WrongStatus/.test(m)) return 'This job is not in the right state for that action.'
  if (/JobNotFinished/.test(m)) return 'Only finished jobs (paid out, cancelled or refunded) can be closed.'
  if (/NotAttestor/.test(m)) return 'Only the confirmation service for this job can release the payment.'
  if (/NotCustomer/.test(m)) return 'Only the customer who created this job can do that.'
  if (/WrongMint/.test(m)) return 'That token does not match this job.'
  if (/AccountNotInitialized|could not find account/i.test(m)) return 'A required token account is missing. Does this wallet hold the test USDC?'
  return m.length > 160 ? `${m.slice(0, 160)}…` : m
}
