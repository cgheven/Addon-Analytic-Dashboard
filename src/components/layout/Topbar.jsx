import { Menu, Download, Bell, LogOut, ChevronDown, Calendar, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useDashboard } from '../../context/DashboardContext'
import { useAuth } from '../../context/AuthContext'

export function Topbar({ onMenu }) {
  const { addon, setAddon, dateRange, setDateRange, refresh, ADDONS, DATE_RANGES } = useDashboard()
  const { logout } = useAuth()
  const [addonOpen, setAddonOpen] = useState(false)
  const [dateOpen, setDateOpen]   = useState(false)
  const [custom, setCustom]       = useState({ start: '', end: '' })
  const [spinning, setSpinning]   = useState(false)

  const handleRefresh = () => {
    refresh()
    setSpinning(true)
    setTimeout(() => setSpinning(false), 700)
  }

  const applyCustom = () => {
    if (!custom.start || !custom.end) return
    setDateRange({ label: `${custom.start} → ${custom.end}`, short: 'Custom', start: custom.start, end: custom.end })
    setDateOpen(false)
  }
  const dateLabel = dateRange.short === 'Custom' ? 'Custom' : dateRange.label

  return (
    <header className="topbar" style={{
      height: 52, background: 'var(--bg-700)', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 10,
      position: 'sticky', top: 0, zIndex: 100, flexShrink: 0,
    }}>
      <button onClick={onMenu} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, display: 'flex', flexShrink: 0 }}>
        <Menu size={18} />
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{ width: 24, height: 24, background: '#6366f1', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#fff' }}>CG</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }} className="hidden md:block">CGHEVEN</span>
      </div>

      {/* Addon selector — all addons (Windows + macOS) grouped in one dropdown */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setAddonOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '5px 12px', background: '#6366f1', border: 'none', borderRadius: 20, color: '#fff', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <span className="hidden sm:inline">{addon.label}</span>
          <span className="sm:hidden">{addon.short}</span>
          <span style={{ fontSize: 9, opacity: .85, background: 'rgba(255,255,255,.2)', padding: '1px 6px', borderRadius: 10 }}>{addon.platform === 'macOS' ? 'Mac' : 'Win'}</span>
          <ChevronDown size={12} />
        </button>
        {addonOpen && (
          <>
            <div onClick={() => setAddonOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 190 }} />
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: 'var(--bg-600)', border: '1px solid var(--border)', borderRadius: 10, padding: 6, zIndex: 200, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
              {['Windows', 'macOS'].map(plat => (
                <div key={plat}>
                  <div style={{ fontSize: 9, color: 'var(--text-3)', padding: '6px 8px 4px', textTransform: 'uppercase', letterSpacing: .5 }}>{plat}</div>
                  {ADDONS.filter(a => a.platform === plat).map(a => {
                    const sel = addon.id === a.id
                    return (
                      <button key={a.id} onClick={() => { setAddon(a); setAddonOpen(false) }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', fontSize: 12, padding: '7px 10px', background: sel ? 'rgba(99,102,241,.18)' : 'none', color: sel ? '#818cf8' : 'var(--text-2)', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: sel ? 500 : 400 }}
                      >
                        <span style={{ fontSize: 9, width: 22, color: 'var(--text-3)' }}>{a.short}</span>
                        {a.label}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Live indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto', fontSize: 10, color: 'var(--green)', fontWeight: 500, flexShrink: 0 }} title="Auto-refreshing every 60s">
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} className="ani-pulse" />
        <span className="hidden sm:inline">Live</span>
      </div>

      {/* Refresh button */}
      <button onClick={handleRefresh} title="Refresh now" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-500)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-2)', padding: 6, borderRadius: 8, flexShrink: 0 }}>
        <RefreshCw size={14} style={{ animation: spinning ? 'spin .7s linear' : 'none' }} />
      </button>

      {/* PostHog-style date range picker */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setDateOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '5px 10px', background: 'var(--bg-500)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 500, whiteSpace: 'nowrap' }}
        >
          <Calendar size={13} style={{ color: 'var(--text-3)' }} />
          <span className="hidden sm:inline">{dateLabel}</span>
          <span className="sm:hidden">{dateRange.short === 'Custom' ? 'Custom' : (dateRange.short || dateLabel)}</span>
          <ChevronDown size={12} style={{ color: 'var(--text-3)' }} />
        </button>
        {dateOpen && (
          <>
            <div onClick={() => setDateOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 190 }} />
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--bg-600)', border: '1px solid var(--border)', borderRadius: 10, padding: 6, zIndex: 200, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
              {DATE_RANGES.map(d => {
                const sel = !dateRange.start && dateRange.days === d.days
                return (
                  <button key={d.short} onClick={() => { setDateRange(d); setDateOpen(false) }}
                    style={{ width: '100%', textAlign: 'left', fontSize: 12, padding: '7px 10px', background: sel ? 'rgba(99,102,241,.18)' : 'none', color: sel ? '#818cf8' : 'var(--text-2)', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: sel ? 500 : 400 }}
                  >{d.label}</button>
                )
              })}
              <div style={{ borderTop: '1px solid var(--border)', margin: '6px 4px', paddingTop: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', padding: '0 6px 6px', textTransform: 'uppercase', letterSpacing: .5 }}>Custom range</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 6px' }}>
                  <input type="date" value={custom.start} max={custom.end || undefined}
                    onChange={e => setCustom(c => ({ ...c, start: e.target.value }))}
                    style={{ fontSize: 11, padding: '5px 8px', background: 'var(--bg-500)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontFamily: 'DM Sans', colorScheme: 'dark' }} />
                  <input type="date" value={custom.end} min={custom.start || undefined}
                    onChange={e => setCustom(c => ({ ...c, end: e.target.value }))}
                    style={{ fontSize: 11, padding: '5px 8px', background: 'var(--bg-500)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontFamily: 'DM Sans', colorScheme: 'dark' }} />
                  <button onClick={applyCustom} disabled={!custom.start || !custom.end}
                    style={{ fontSize: 11, padding: '6px 10px', background: custom.start && custom.end ? '#6366f1' : 'var(--bg-400)', border: 'none', borderRadius: 6, color: custom.start && custom.end ? '#fff' : 'var(--text-3)', cursor: custom.start && custom.end ? 'pointer' : 'not-allowed', fontFamily: 'DM Sans', fontWeight: 500 }}
                  >Apply</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <button style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '5px 12px', background: '#6366f1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 500, flexShrink: 0 }}>
        <Download size={13} />
        <span className="hidden sm:inline">Export</span>
      </button>

      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', position: 'relative', padding: 4, flexShrink: 0 }}>
        <Bell size={17} />
        <span style={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, background: 'var(--red)', borderRadius: '50%' }} className="ani-pulse" />
      </button>

      <button onClick={logout} title="Logout" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, flexShrink: 0 }}>
        <LogOut size={16} />
      </button>
    </header>
  )
}
