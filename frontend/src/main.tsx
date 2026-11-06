import './polyfills'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { clusterApiUrl } from '@solana/web3.js'
import '@solana/wallet-adapter-react-ui/styles.css'
import './index.css'
import App from './App.tsx'
import { buildWallets } from './wallets'
import { captureInstallPrompt, registerServiceWorker } from './lib/install'

// Before React renders: the browser may offer the install prompt right after load.
captureInstallPrompt()
registerServiceWorker()

const wallets = buildWallets()

// Wallet Standard wallets (Backpack, etc.) are still auto-detected on top of these adapters.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConnectionProvider endpoint={import.meta.env.VITE_RPC_URL || clusterApiUrl('devnet')}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </StrictMode>,
)
