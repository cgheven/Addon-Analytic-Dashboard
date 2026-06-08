import { LayoutDashboard, Users, Download, Trophy, ArrowLeftRight, Search, Heart, AlertTriangle, RefreshCw, Settings, X, BarChart2 } from 'lucide-react'
import { useDashboard } from '../../context/DashboardContext'

const NAV = [
  { id: 'overview',    icon: LayoutDashboard, label: 'Overview'         },
  { id: 'users',       icon: Users,           label: 'Users'            },
  { id: 'downloads',   icon: Download,        label: 'Downloads'        },
  { id: 'updates',     icon: RefreshCw,       label: 'Updates'          },
  { id: 'assets',      icon: Trophy,          label: 'Assets'           },
  { id: 'conversion',  icon: ArrowLeftRight,  label: 'Conversion'       },
  { id: 'search',      icon: Search,          label: 'Search'           },
  { id: 'favourites',  icon: Heart,           label: 'Favourites'       },
  { id: 'errors',      icon: AlertTriangle,   label: 'Errors',  badge: '!' },
]

export function Sidebar({ active, setActive, mobileOpen, onClose }) {
  const { sidebarOpen } = useDashboard()

  return (
    <>
      {mobileOpen && <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 40 }} />}
      <aside
        className="lg:relative lg:transform-none"
        style={{
          width: sidebarOpen ? 200 : 56,
          background: 'var(--bg-700)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          transition: 'width .25s cubic-bezier(.4,0,.2,1)',
          position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 50,
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        <div style={{ height: 52, display: 'flex', alignItems: 'center', padding: sidebarOpen ? '0 14px' : '0 14px', borderBottom: '1px solid var(--border)', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, background: '#6366f1', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BarChart2 size={15} color="#fff" />
          </div>
          {sidebarOpen && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }} className="ani-slide-right">CGHEVEN</span>}
          {mobileOpen && (
            <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
              <X size={16} />
            </button>
          )}
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
          {NAV.map(item => {
            const isActive = active === item.id
            return (
              <button
                key={item.id}
                onClick={() => { setActive(item.id); onClose() }}
                title={!sidebarOpen ? item.label : undefined}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8, border: 'none',
                  background: isActive ? 'rgba(99,102,241,.15)' : 'transparent',
                  color: isActive ? '#818cf8' : 'var(--text-3)',
                  cursor: 'pointer', marginBottom: 2, transition: 'all .15s',
                  fontFamily: 'DM Sans', justifyContent: sidebarOpen ? 'flex-start' : 'center',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-500)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <item.icon size={16} style={{ flexShrink: 0 }} />
                {sidebarOpen && (
                  <span style={{ fontSize: 12, fontWeight: isActive ? 500 : 400, whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
                    {item.label}
                  </span>
                )}
                {sidebarOpen && item.badge && (
                  <span style={{ fontSize: 9, background: 'rgba(239,68,68,.15)', color: 'var(--red)', padding: '1px 5px', borderRadius: 6, fontWeight: 600 }}>
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {sidebarOpen && (
          <div style={{ margin: 8, padding: 12, background: 'rgba(99,102,241,.1)', borderRadius: 10, border: '1px solid rgba(99,102,241,.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <div style={{ width: 6, height: 6, background: 'var(--green)', borderRadius: '50%' }} className="ani-pulse" />
              <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 500 }}>PostHog Free</span>
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 6 }}>340K / 1M events used</div>
            <div style={{ background: 'var(--bg-400)', borderRadius: 3, height: 4, overflow: 'hidden' }}>
              <div style={{ width: '34%', height: '100%', background: '#6366f1', borderRadius: 3 }} />
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
