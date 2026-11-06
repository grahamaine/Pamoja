import { useEffect, useState } from 'react'

// Installing Pamoja as an app.
//   Chrome, Edge, Samsung Internet, Opera (desktop and Android): the browser offers a real install
//   prompt through the `beforeinstallprompt` event, which we keep and show when the button is pressed.
//   Safari on iPhone/iPad and Mac: no prompt exists, so we show the Share → Add to Home Screen / Dock steps.
//   Firefox, and in-app browsers (WhatsApp, Instagram, Facebook): explain how to open it somewhere that can.

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: PromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** Call once, as early as possible: the browser fires the event soon after the page loads. */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // keep it for our own button instead of the browser's mini-bar
    deferred = e as PromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* the site works without it */ })
  })
}

export type Platform = 'ios' | 'mac-safari' | 'android' | 'in-app' | 'firefox' | 'desktop'

export function detectPlatform(ua = navigator.userAgent): Platform {
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (/FBAN|FBAV|Instagram|WhatsApp|Line\/|Twitter|TikTok|Snapchat/i.test(ua)) return 'in-app'
  if (iOS) return 'ios'
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Android/i.test(ua)) return 'android'
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return 'mac-safari'
  return 'desktop'
}

export const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/** State for the install button: hidden once installed; a real prompt where the browser has one. */
export function useInstall() {
  const [, force] = useState(0)
  const [installed, setInstalled] = useState(isInstalled)

  useEffect(() => {
    const update = () => { force((n) => n + 1); setInstalled(isInstalled()) }
    listeners.add(update)
    const mq = window.matchMedia?.('(display-mode: standalone)')
    mq?.addEventListener?.('change', update)
    return () => { listeners.delete(update); mq?.removeEventListener?.('change', update) }
  }, [])

  /** Shows the browser's own install dialog. Returns false when there is none (show instructions instead). */
  const prompt = async () => {
    if (!deferred) return false
    const e = deferred
    deferred = null
    await e.prompt()
    const { outcome } = await e.userChoice
    if (outcome === 'accepted') setInstalled(true)
    notify()
    return true
  }

  return { installed, canPrompt: deferred !== null, prompt, platform: detectPlatform() }
}
