import { useState, type ReactNode } from 'react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { BadgeCheck, BookOpen, ChevronLeft, ChevronRight, FlaskConical, Globe, House, BriefcaseBusiness, LayoutGrid, Link2, Menu, Search, Share2, Wallet, X, type LucideIcon } from 'lucide-react'
import { CATEGORIES } from './Services'
import logo from '../assets/logo-mark.png'
import { InstallButton } from './InstallApp'
import './Shell.css'

export type TabId = 'home' | 'services' | 'dashboard' | 'pay' | 'devnet'

export const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'services', label: 'Services' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'pay', label: 'Pay' },
  { id: 'devnet', label: 'Devnet' },
]

export const SITE_URL = 'https://pamoja-solana.vercel.app'
export const REPO_URL = 'https://github.com/grahamaine/Pamoja'

// One list drives both the header menu and the left icon rail, so they always match.
type NavItem = { label: string; Icon: LucideIcon; tab?: TabId; href?: string }
export const NAV: NavItem[] = [
  { label: 'Home', Icon: House, tab: 'home' },
  { label: 'Services', Icon: LayoutGrid, tab: 'services' },
  { label: 'Business', Icon: BriefcaseBusiness, tab: 'dashboard' },
  { label: 'Pay', Icon: Wallet, tab: 'pay' },
  { label: 'Devnet', Icon: FlaskConical, tab: 'devnet' },
  { label: 'Docs', Icon: BookOpen, href: `${REPO_URL}#readme` },
]

/* ---------- banner artwork: tilted glowing rings and stars ---------- */
function HeroArt() {
  // deterministic "random" stars so the picture never jumps between renders
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const stars = Array.from({ length: 70 }, () => ({ x: rnd() * 1200, y: rnd() * 360, r: rnd() * 1.4 + 0.3, o: rnd() * 0.6 + 0.2 }))
  const rings = Array.from({ length: 16 }, (_, i) => ({ rx: 170 + i * 46, ry: 40 + i * 12, o: 0.9 - i * 0.045, w: i % 4 === 0 ? 2 : 1 }))

  return (
    <svg className="hero-art" viewBox="0 0 1200 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="0.55" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#14f1b2" />
        </linearGradient>
        <radialGradient id="glow" cx="0.72" cy="0.55" r="0.55">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.28" />
          <stop offset="1" stopColor="#070d10" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="360" fill="url(#glow)" />
      {stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />)}
      <g className="rings" transform="translate(860 210) rotate(-16)">
        {rings.map((r, i) => (
          <ellipse key={i} rx={r.rx} ry={r.ry} fill="none" stroke="url(#ringGrad)" strokeWidth={r.w} opacity={Math.max(r.o, 0.08)} />
        ))}
      </g>
    </svg>
  )
}

const GithubMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
  </svg>
)

/* ---------- top bar ---------- */
export function TopBar({ tab, onTab, query, onQuery }: { tab: TabId; onTab: (t: TabId) => void; query: string; onQuery: (q: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <header className="topbar">
      <button className="brand" onClick={() => onTab('home')} aria-label="Pamoja home">
        <img src={logo} alt="" />
        <span>Pamoja</span>
      </button>

      <nav className={open ? 'top-links open' : 'top-links'}>
        {NAV.map((n) =>
          n.href ? (
            <a key={n.label} href={n.href} target="_blank" rel="noreferrer">{n.label}</a>
          ) : (
            <button key={n.label} className={tab === n.tab ? 'on' : ''} onClick={() => { onTab(n.tab!); setOpen(false) }}>{n.label}</button>
          ),
        )}
        <InstallButton className="install-link" />
      </nav>

      <div className="top-actions">
        <label className="search">
          <Search size={18} />
          <input
            id="top-search"
            placeholder="Search services"
            value={query}
            onChange={(e) => { onQuery(e.target.value); if (e.target.value) onTab('services') }}
          />
        </label>
        <WalletMultiButton />
        <button className="menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </header>
  )
}

/* ---------- left icon rail: the same pages and tools as the header menu ---------- */
export function SideRail({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void }) {
  return (
    <aside className="siderail" aria-label="Pages and tools">
      <button className="tile logo" onClick={() => onTab('home')} title="Pamoja home" aria-label="Pamoja home">
        <img src={logo} alt="" />
      </button>
      {NAV.map(({ label, Icon, tab: t, href }) =>
        href ? (
          <a key={label} className="tile" href={href} target="_blank" rel="noreferrer" title={label} aria-label={label}>
            <Icon size={22} strokeWidth={1.8} />
            <span>{label}</span>
          </a>
        ) : (
          <button key={label} className={tab === t ? 'tile on' : 'tile'} onClick={() => onTab(t!)} title={label} aria-label={label} aria-current={tab === t ? 'page' : undefined}>
            <Icon size={22} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ),
      )}
      <button className="tile search-tile" onClick={() => document.getElementById('top-search')?.focus()} title="Search" aria-label="Search">
        <Search size={20} />
        <span>Search</span>
      </button>
    </aside>
  )
}

/* ---------- profile header: banner, avatar, name, links, actions ---------- */
export function ProfileHeader({ onTab }: { onTab: (t: TabId) => void }) {
  const [note, setNote] = useState('')
  const flash = (m: string) => { setNote(m); window.setTimeout(() => setNote(''), 2200) }

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Pamoja', text: 'Pay when the service is done.', url: SITE_URL })
      else { await navigator.clipboard.writeText(SITE_URL); flash('Link copied') }
    } catch { /* user cancelled */ }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(SITE_URL); flash('Link copied') } catch { flash(SITE_URL) } }

  return (
    <section className="profile">
      <div className="banner"><HeroArt /><div className="banner-fade" /></div>

      <div className="profile-row">
        <div className="avatar">
          <img src={logo} alt="Pamoja logo" />
          <span className="verified" title="Built on Solana"><BadgeCheck size={18} /></span>
        </div>

        <div className="who">
          <h1>Pamoja</h1>
          <p className="tagline">Pay when the service is done.</p>
          <div className="chips">
            <span className="chip live"><i /> Solana Devnet</span>
            <span className="chip">{CATEGORIES.length} service categories</span>
            <span className="chip">East Africa</span>
          </div>
          <div className="links">
            <button className="round" onClick={copy} title="Copy link" aria-label="Copy link"><Link2 size={18} /></button>
            <a className="round" href={SITE_URL} target="_blank" rel="noreferrer" title="Website" aria-label="Website"><Globe size={18} /></a>
            <a className="round" href={REPO_URL} target="_blank" rel="noreferrer" title="GitHub" aria-label="GitHub"><GithubMark /></a>
          </div>
        </div>

        <div className="profile-actions">
          <InstallButton />
          <button className="btn btn-outline" onClick={share}><Share2 size={17} /> {note || 'Share'}</button>
          <button className="btn btn-primary" onClick={() => onTab('pay')}><Wallet size={17} /> Start a payment</button>
        </div>
      </div>
    </section>
  )
}

/* ---------- tabs under the header ---------- */
export function TabBar({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void }) {
  return (
    <div className="tabbar" role="tablist" aria-label="Sections">
      {TABS.map((t) => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => onTab(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- floating right panel ---------- */
export function RightRail({ onTab }: { onTab: (t: TabId) => void }) {
  const [open, setOpen] = useState(true)
  if (!open) {
    return <button className="rail-open" onClick={() => setOpen(true)} aria-label="Open quick panel"><ChevronLeft size={18} /></button>
  }
  return (
    <aside className="rightrail" aria-label="Quick panel">
      <div className="me">
        <img src={logo} alt="" />
        <span className="lvl" title="Demo provider level">LV1</span>
      </div>
      <button onClick={() => onTab('dashboard')} title="Business dashboard" aria-label="Business dashboard"><BriefcaseBusiness size={20} /></button>
      <button onClick={() => onTab('pay')} title="Pay for a job" aria-label="Pay for a job"><Wallet size={20} /></button>
      <a href={`${REPO_URL}/tree/main/docs`} target="_blank" rel="noreferrer" title="Docs" aria-label="Docs"><BookOpen size={20} /></a>
      <button className="collapse" onClick={() => setOpen(false)} aria-label="Hide quick panel"><ChevronRight size={18} /></button>
    </aside>
  )
}

export function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {sub && <p className="sub">{sub}</p>}
      {children}
    </section>
  )
}
