import { useCallback, useState } from 'react'
import { Lock, BriefcaseBusiness, KeyRound, Smartphone, Wallet, ShieldCheck, Store, type LucideIcon } from 'lucide-react'
import { usePamojaProgram } from './useProgram'
import { explorer, PROGRAM_ID } from './lib/config'
import { ChainMarquee } from './ui/ChainMarquee'
import { Dashboard } from './ui/Dashboard'
import { Services } from './ui/Services'
import { PayWidget } from './ui/PayWidget'
import { ProfileHeader, RightRail, Section, SideRail, TabBar, TABS, TopBar, type TabId } from './ui/Shell'
import logo from './assets/logo-mark.png'
import './App.css'

const STEPS: { n: string; title: string; text: string; Icon: LucideIcon }[] = [
  { n: '1', Icon: Lock, title: 'Lock the payment', text: 'The customer deposits the price. It sits in a Solana program, not with either side.' },
  { n: '2', Icon: BriefcaseBusiness, title: 'Get the service', text: 'The provider does the job: a haircut, a repair, a delivery.' },
  { n: '3', Icon: KeyRound, title: 'Confirm with a code', text: 'The customer shares a short SMS code. The program checks it and pays the provider.' },
]

const FEATURES: { title: string; text: string; Icon: LucideIcon }[] = [
  { Icon: Smartphone, title: 'Works on any phone', text: 'No QR codes. A 4–6 digit code by SMS or WhatsApp is all a customer needs.' },
  { Icon: Wallet, title: 'Three ways to pay', text: 'Crypto (USDC), mobile money or bank transfer, all settled into one escrow.' },
  { Icon: ShieldCheck, title: 'No-show protection', text: 'Every job has a deadline. Until it, the provider can be paid; after it, the customer can take the money back.' },
  { Icon: Store, title: 'Built for local business', text: 'Salons, repairs, suppliers and event services across East Africa.' },
]

const tabFromHash = (): TabId => {
  const h = window.location.hash.replace('#', '')
  return TABS.some((t) => t.id === h) ? (h as TabId) : 'home'
}

function App() {
  const ctx = usePamojaProgram()
  const [tab, setTab] = useState<TabId>(tabFromHash)
  const [query, setQuery] = useState('')

  const go = useCallback((t: TabId) => {
    setTab(t)
    window.history.replaceState(null, '', t === 'home' ? window.location.pathname : `#${t}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return (
    <>
      <TopBar tab={tab} onTab={go} query={query} onQuery={setQuery} />

      <div className="shell">
        <SideRail tab={tab} onTab={(t) => { if (t !== 'services') setQuery(''); go(t) }} />

        <div className="main">
          <ProfileHeader onTab={go} />
          <TabBar tab={tab} onTab={(t) => { if (t !== 'services') setQuery(''); go(t) }} />

          <div className="content">
            {tab === 'home' && (
              <>
                <Section title="How it works" sub="Three steps. No middleman holding your money.">
                  <div className="grid grid-wide">
                    {STEPS.map((s) => (
                      <article className="card wide" key={s.n}>
                        <span className="ico"><s.Icon size={26} strokeWidth={1.8} /></span>
                        <div className="body">
                          <h3><span className="num">{s.n}</span>{s.title}</h3>
                          <p>{s.text}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </Section>

                <ChainMarquee title="Built on Solana · connects to" />

                <Section title="Why Pamoja" sub="Designed for how people in Uganda actually pay.">
                  <div className="grid grid-wide">
                    {FEATURES.map((f) => (
                      <article className="card wide" key={f.title}>
                        <span className="ico"><f.Icon size={26} strokeWidth={1.8} /></span>
                        <div className="body">
                          <h3>{f.title}</h3>
                          <p>{f.text}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </Section>
              </>
            )}

            {tab === 'services' && (
              <Section title="Services & store" sub="From salons and repairs to rides, food and shopping. If someone is paid for a job or an order, it fits.">
                <Services query={query} onQuery={setQuery} />
              </Section>
            )}

            {tab === 'dashboard' && (
              <Section title="Business dashboard" sub="Track deposits, payouts and your provider level in one place.">
                <Dashboard />
              </Section>
            )}

            {tab === 'pay' && (
              <Section title="Pay for a job" sub="Choose how you pay. Mobile money and card payments are collected by our payment partners.">
                <PayWidget />
              </Section>
            )}

            {tab === 'devnet' && (
              <Section title="Try it on devnet" sub="Run a full escrow on Solana devnet. Test tokens only, no real money.">
                <div className="card demo">
                  <ol className="devnet-steps">
                    <li>Get devnet SOL from the <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">Solana faucet</a> and test USDC from the <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">Circle faucet</a> (choose Solana Devnet).</li>
                    <li>Open <button className="linkish" onClick={() => go('pay')}>Pay</button>, choose Crypto, and lock a payment for a provider's wallet address.</li>
                    <li>Track it in the <button className="linkish" onClick={() => go('dashboard')}>Business</button> tab: confirm to pay the provider before the deadline, or refund after it.</li>
                  </ol>
                  <p className="status">
                    {ctx ? 'Wallet connected.' : 'Connect your wallet (top right) to get started.'} Program:{' '}
                    <a href={explorer(PROGRAM_ID)} target="_blank" rel="noreferrer">{PROGRAM_ID.slice(0, 4)}…{PROGRAM_ID.slice(-4)}</a>
                  </p>
                </div>
              </Section>
            )}
          </div>

          <footer className="footer">
            <div className="brand"><img src={logo} alt="" /><span>Pamoja · Services &amp; Suppliers</span></div>
            <p>Built on Solana · Encode Club Solana Hackathon 2026</p>
          </footer>
        </div>
      </div>

      <RightRail onTab={go} />
    </>
  )
}

export default App
