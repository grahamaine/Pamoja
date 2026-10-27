import { useMemo } from 'react'
import { AnchorProvider, Program } from '@anchor-lang/core'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import idl from './idl/pamoja.json'
import type { Pamoja } from './idl/pamoja'

/** The Pamoja escrow program, bound to the connected wallet. Null until a wallet connects. */
export function usePamojaProgram() {
  const { connection } = useConnection()
  const wallet = useAnchorWallet()

  return useMemo(() => {
    if (!wallet) return null
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
    const program = new Program<Pamoja>(idl as Pamoja, provider)
    return { program, wallet }
  }, [connection, wallet])
}
