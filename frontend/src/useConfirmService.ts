import { useEffect, useState } from 'react'
import { getServiceStatus } from './lib/confirmApi'

/** Asks the server whether the SMS confirmation service is set up, and which key signs for it. */
export function useConfirmService() {
  const [state, setState] = useState<{ ready: boolean; attestor: string | null; treasury: string | null; fiatReady: boolean; loaded: boolean }>({ ready: false, attestor: null, treasury: null, fiatReady: false, loaded: false })
  useEffect(() => {
    let alive = true
    getServiceStatus()
      .then((s) => alive && setState({ ready: s.ready, attestor: s.attestor, treasury: s.treasury ?? null, fiatReady: !!s.fiatReady, loaded: true }))
      .catch(() => alive && setState({ ready: false, attestor: null, treasury: null, fiatReady: false, loaded: true }))
    return () => { alive = false }
  }, [])
  return state
}
