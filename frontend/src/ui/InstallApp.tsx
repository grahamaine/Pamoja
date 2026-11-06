import { useEffect, useState } from 'react'
import { Download, Share, SquarePlus, X, EllipsisVertical, MonitorDown } from 'lucide-react'
import { useInstall, type Platform } from '../lib/install'
import './InstallApp.css'

// "Install app" button. Uses the browser's own install prompt where there is one (Chrome, Edge,
// Android); otherwise opens short steps for the visitor's browser (iPhone/iPad, Mac Safari, etc.).

const STEPS: Record<Platform, { title: string; steps: React.ReactNode[] }> = {
  ios: {
    title: 'Install on iPhone or iPad',
    steps: [
      <>Tap <Share size={16} className="inline" /> <strong>Share</strong> at the bottom of Safari (top right on iPad).</>,
      <>Scroll down and tap <SquarePlus size={16} className="inline" /> <strong>Add to Home Screen</strong>.</>,
      <>Tap <strong>Add</strong>. Pamoja now opens from your home screen like any app.</>,
    ],
  },
  'mac-safari': {
    title: 'Install on your Mac',
    steps: [
      <>In Safari, open the <strong>File</strong> menu (or <Share size={16} className="inline" /> Share).</>,
      <>Choose <strong>Add to Dock</strong>, then <strong>Add</strong>.</>,
    ],
  },
  android: {
    title: 'Install on Android',
    steps: [
      <>Tap the browser menu <EllipsisVertical size={16} className="inline" /> (top right).</>,
      <>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>, then <strong>Install</strong>.</>,
    ],
  },
  desktop: {
    title: 'Install on your computer',
    steps: [
      <>In Chrome or Edge, click the install icon <MonitorDown size={16} className="inline" /> at the right end of the address bar.</>,
      <>Or open the menu <EllipsisVertical size={16} className="inline" />: Chrome → <strong>Cast, save and share → Install page as app</strong>; Edge → <strong>Apps → Install this site as an app</strong>.</>,
    ],
  },
  firefox: {
    title: 'Install Pamoja',
    steps: [
      <>Firefox on a computer cannot install web apps. Open this page in <strong>Chrome</strong> or <strong>Edge</strong> and press Install app again.</>,
      <>On Android, Firefox can: menu <EllipsisVertical size={16} className="inline" /> → <strong>Install</strong>.</>,
    ],
  },
  'in-app': {
    title: 'Open in your browser first',
    steps: [
      <>You are viewing Pamoja inside another app (for example WhatsApp or Instagram), which cannot install it.</>,
      <>Tap the menu (<EllipsisVertical size={16} className="inline" /> or ⋯) and choose <strong>Open in browser</strong> (Chrome or Safari).</>,
      <>Then press <strong>Install app</strong> on the Pamoja page.</>,
    ],
  },
}

export function InstallButton({ className = 'btn btn-outline', label = 'Install app' }: { className?: string; label?: string }) {
  const { installed, canPrompt, prompt, platform } = useInstall()
  const [help, setHelp] = useState(false)

  useEffect(() => {
    if (!help) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setHelp(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [help])

  if (installed) return null

  const onClick = async () => {
    if (canPrompt && (await prompt())) return
    setHelp(true)
  }
  const s = STEPS[platform]

  return (
    <>
      <button className={className} onClick={onClick}><Download size={17} /> {label}</button>
      {help && (
        <div className="install-backdrop" onClick={() => setHelp(false)}>
          <div className="install-sheet" role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={(e) => e.stopPropagation()}>
            <button className="install-close" onClick={() => setHelp(false)} aria-label="Close"><X size={20} /></button>
            <img src="/favicon-192.png" alt="" className="install-icon" />
            <h3 id="install-title">{s.title}</h3>
            <ol>{s.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
            <p className="install-note">Same site, no app store: it opens full-screen, gets its own icon, and updates by itself.</p>
          </div>
        </div>
      )}
    </>
  )
}
