import { createContext, useContext, useState } from 'react'

const Ctx = createContext(null)

export const ADDONS = [
  // Windows
  { id: 'aftereffects-asset-library',     label: 'After Effects', short: 'AE', platform: 'Windows' },
  { id: 'premiere-asset-library',         label: 'Premiere Pro',  short: 'PR', platform: 'Windows' },
  { id: 'blender-asset-library',          label: 'Blender',       short: 'BL', platform: 'Windows' },
  { id: 'davinci-asset-library',          label: 'DaVinci',       short: 'DV', platform: 'Windows' },
  // macOS
  { id: 'aftereffects-asset-library-mac', label: 'After Effects', short: 'AE', platform: 'macOS' },
  { id: 'premiere-asset-library-mac',     label: 'Premiere Pro',  short: 'PR', platform: 'macOS' },
  { id: 'blender-asset-library-mac',      label: 'Blender',       short: 'BL', platform: 'macOS' },
  { id: 'davinci-asset-library-mac',      label: 'DaVinci',       short: 'DV', platform: 'macOS' },
]

export const DATE_RANGES = [
  { label: 'Last 24 hours', short: '1d',  days: 1  },
  { label: 'Last 7 days',   short: '7d',  days: 7  },
  { label: 'Last 14 days',  short: '14d', days: 14 },
  { label: 'Last 30 days',  short: '30d', days: 30 },
  { label: 'Last 90 days',  short: '90d', days: 90 },
]

export function DashboardProvider({ children }) {
  const [addon,     setAddon]     = useState(ADDONS[0])
  const [dateRange, setDateRange] = useState(DATE_RANGES[1])  // default: Last 7 days
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)
  const refresh = () => setRefreshTick(t => t + 1)

  return (
    <Ctx.Provider value={{ addon, setAddon, dateRange, setDateRange, sidebarOpen, setSidebarOpen, refreshTick, refresh, ADDONS, DATE_RANGES }}>
      {children}
    </Ctx.Provider>
  )
}

export const useDashboard = () => useContext(Ctx)
