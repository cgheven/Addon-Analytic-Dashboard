import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DashboardProvider, useDashboard } from './context/DashboardContext'
import { Topbar } from './components/layout/Topbar'
import { Sidebar } from './components/layout/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

function AppShell() {
  const { authed } = useAuth()
  const { sidebarOpen, setSidebarOpen } = useDashboard()
  const [section, setSection]   = useState(null)
  const [mobileOpen, setMobile] = useState(false)

  if (!authed) return <Login />

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-900)' }}>
      <Sidebar
        active={section || 'overview'}
        setActive={s => { setSection(s === 'overview' ? null : s) }}
        mobileOpen={mobileOpen}
        onClose={() => setMobile(false)}
      />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <Topbar onMenu={() => { setMobile(v => !v); setSidebarOpen(v => !v) }} />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <Dashboard section={section} />
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <DashboardProvider>
        <AppShell />
      </DashboardProvider>
    </AuthProvider>
  )
}
