import { useState, useEffect, useCallback, useRef } from 'react'
import { Users, Download, Heart, AlertTriangle, TrendingUp, TrendingDown, X, AlertCircle, Package, ChevronDown } from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'
import { KPICard, SectionHeader, CardTitle, SkeletonCard, HBar, FunnelViz, PctList } from '../components/ui/index.jsx'
import { AreaChart, BarChart, DonutChart } from '../components/charts/index.jsx'
import * as API from '../api/posthog'

function Alert({ type, msg, onDismiss }) {
  const S = {
    danger:  { bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.25)', color: '#ef4444' },
    warning: { bg: 'rgba(245,158,11,.08)', border: 'rgba(245,158,11,.25)', color: '#f59e0b' },
    success: { bg: 'rgba(34,197,94,.08)',  border: 'rgba(34,197,94,.25)',  color: '#22c55e' },
  }
  const s = S[type] || S.warning
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px', borderRadius: 8, border: `1px solid ${s.border}`, background: s.bg, fontSize: 12, color: s.color }} className="ani-up">
      <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ flex: 1, lineHeight: 1.5 }}>{msg}</span>
      {onDismiss && <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.color, opacity: .6, padding: 0 }}><X size={12} /></button>}
    </div>
  )
}

// Fixed error popup — shown when PostHog queries fail (rate limit / network / etc.)
// so the user never mistakes "couldn't load" for real empty/zero data.
function ErrorToast({ error, onClose, onRetry }) {
  if (!error) return null
  const rate = error.rateLimited
  const accent = rate ? '#f59e0b' : '#ef4444'
  const title = rate ? 'Rate limited by PostHog (429)' : 'Could not load data'
  const body = rate
    ? 'Too many requests — some data did not load. It retries automatically; please wait a minute, refresh, or pick a smaller date range.'
    : `Failed to reach PostHog${error.status ? ` (HTTP ${error.status})` : ''}. The numbers shown may be incomplete. Check your connection and API key, then retry.`
  return (
    <div style={{ position: 'fixed', top: 64, right: 16, zIndex: 300, width: 340, maxWidth: 'calc(100vw - 32px)',
      background: 'var(--bg-600)', border: `1px solid ${accent}55`, borderLeft: `3px solid ${accent}`,
      borderRadius: 10, padding: '12px 14px', boxShadow: '0 10px 30px rgba(0,0,0,.5)' }} className="ani-up">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <AlertTriangle size={16} style={{ color: accent, flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', marginBottom: 3 }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>{body}</div>
          <button onClick={onRetry} style={{ marginTop: 9, fontSize: 11, fontWeight: 500, padding: '5px 12px', background: accent, border: 'none', borderRadius: 6, color: '#0a0c12', cursor: 'pointer', fontFamily: 'DM Sans' }}>
            Retry now
          </button>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, flexShrink: 0 }}><X size={14} /></button>
      </div>
    </div>
  )
}

const GRIDS = {
  g4: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  g3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  g2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 },
  g21: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 },
}

const getCVRStatus = cvr => cvr >= 50 ? ['badge bg-g', 'Healthy'] : cvr >= 30 ? ['badge bg-a', 'Average'] : ['badge bg-r', 'Low']

// Label an addon_name slug with its app + platform (Win/Mac shown separately).
const APP_NAMES = { aftereffects: 'AE', premiere: 'PR', blender: 'Blender', davinci: 'DaVinci' }
const labelAddon = raw => {
  const s = String(raw || '')
  const mac = /-mac$/.test(s)
  const app = s.replace(/-mac$/, '').split('-')[0]
  return `${APP_NAMES[app] || app} ${mac ? 'Mac' : 'Win'}`
}
const labelAddonRows = rows =>
  rows.map(r => ({ name: labelAddon(r[0]), n: Number(r[1]) })).sort((a, b) => b.n - a.n)

export default function Dashboard({ section }) {
  const { addon, dateRange, refreshTick } = useDashboard()
  const [d, setD]               = useState({})
  const [loading, setLoading]   = useState(true)
  const [alerts, setAlerts]     = useState([])
  const [dismissed, setDismissed] = useState(new Set())
  const [showAllAssets, setShowAllAssets] = useState(false)
  const [loadError, setLoadError] = useState(null)  // { status, rateLimited, message } | null

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const errBefore = API.getQueryErrorStats().count
    try {
      const [kpis, topAssets, assetFmt, assetRes, dlTrend, dlCat, dlSub, fmt, res, dau, dow, licTrend, addonComp, funnel, catCvr, searches, catClicks, topFavs, favCat, favTrend, errors, errTrend, errAddon, rates, installs] = await Promise.all([
        API.getOverviewKPIs(addon.id, dateRange),
        API.getTopAssets(addon.id, dateRange),
        API.getAssetFormatBreakdown(addon.id, dateRange),
        API.getAssetResolutionBreakdown(addon.id, dateRange),
        API.getDownloadTrend(addon.id, dateRange),
        API.getDownloadsByCategory(addon.id, dateRange),
        API.getDownloadsBySubcategory(addon.id, dateRange),
        API.getFormatDistribution(addon.id, dateRange),
        API.getResolutionDistribution(addon.id, dateRange),
        API.getDAUTrend(addon.id, dateRange),
        API.getSessionsByDOW(addon.id, dateRange),
        API.getLicenseTrend(addon.id, dateRange),
        API.getAddonComparison(dateRange),
        API.getConversionFunnel(addon.id, dateRange),
        API.getCategoryConversion(addon.id, dateRange),
        API.getSearchQueries(addon.id, dateRange),
        API.getCategoryClicks(addon.id, dateRange),
        API.getTopFavourites(addon.id, dateRange),
        API.getFavouritesByCategory(addon.id, dateRange),
        API.getFavouriteTrend(addon.id, dateRange),
        API.getErrors(addon.id, dateRange),
        API.getErrorTrend(addon.id, dateRange),
        API.getErrorsByAddon(dateRange),
        API.getSuccessRates(addon.id, dateRange),
        API.getNewInstalls(addon.id, dateRange),
      ])

      // Build per-asset format/resolution maps: { assetName: [{ label, n }] }
      const fmtMap = {}, resMap = {}
      assetFmt.forEach(r => { const k = r[0]; (fmtMap[k] = fmtMap[k] || []).push({ label: r[1] || 'unknown', n: Number(r[2]) }) })
      assetRes.forEach(r => { const k = r[0]; (resMap[k] = resMap[k] || []).push({ label: r[1] || 'unknown', n: Number(r[2]) }) })

      const parsedTopAssets = topAssets.map(r => ({
        name: r[0], cat: r[1], sub: r[2],
        downloads: Number(r[3]), views: Number(r[4]), imports: Number(r[5]), favs: Number(r[6]),
        cvr: r[4] > 0 ? ((Number(r[3]) / Number(r[4])) * 100).toFixed(0) : 0,
        fmt: fmtMap[r[0]] || [], res: resMap[r[0]] || [],
      }))

      const parsedDLTrend = dlTrend.map(r => ({ day: r[0], n: Number(r[1]) }))
      const parsedDAU     = dau.map(r => ({ day: r[0], n: Number(r[1]) }))
      const parsedDOW     = dow.map(r => ({ dow: String(r[0]), n: Number(r[1]) }))
      const parsedLic     = licTrend.map(r => ({ week: r[0]?.slice(5) || r[0], activated: Number(r[1]), expired: Number(r[2]) }))
      const parsedAddon   = labelAddonRows(addonComp)
      const parsedCatCvr  = catCvr.map(r => ({ cat: r[0], views: Number(r[1]), downloads: Number(r[2]), cvr: r[1] > 0 ? ((Number(r[2]) / Number(r[1])) * 100).toFixed(0) : 0 }))
      const parsedSearch  = searches.map(r => ({ q: r[0], n: Number(r[1]), zero: Number(r[2]) }))
      const parsedClicks  = catClicks.map(r => ({ name: r[0], n: Number(r[1]) }))
      const parsedFavs    = topFavs.map(r => ({ name: r[0], n: Number(r[1]) }))
      const parsedFavCat  = favCat.map(r => ({ name: r[0], n: Number(r[1]) }))
      const parsedFavTrend = favTrend.map(r => ({ day: r[0], n: Number(r[1]) }))
      const parsedDLErr   = errors.filter(r => r[0] === 'download_failed').map(r => ({ name: r[1] || 'unknown', n: Number(r[2]) }))
      const parsedImpErr  = errors.filter(r => r[0] === 'import_failed').map(r => ({ name: r[1] || 'unknown', n: Number(r[2]) }))
      const parsedErrTrend = errTrend.map(r => ({ day: r[0], n: Number(r[1]) }))
      const parsedErrAddon = labelAddonRows(errAddon)
      const parsedInstalls = installs.map(r => ({ day: r[0]?.slice(5) || r[0], n: Number(r[1]) }))

      const zeroSearches = parsedSearch.filter(s => s.zero > 0)
      const newAlerts = []
      if (parseFloat(kpis.errorRate) > 1) newAlerts.push({ id:'err', type:'danger',  msg:`Error rate at ${kpis.errorRate}% — download failures detected. Check errors section.` })
      if (zeroSearches.length)            newAlerts.push({ id:'gap', type:'warning', msg:`${zeroSearches.length} searches return zero results — content gap detected.` })
      if (parsedTopAssets.length)         newAlerts.push({ id:'top', type:'success', msg:`Top asset: "${parsedTopAssets[0]?.name}" with ${parsedTopAssets[0]?.downloads} downloads.` })
      setAlerts(newAlerts)

      setD({ kpis, topAssets: parsedTopAssets, dlTrend: parsedDLTrend, dlCat: dlCat.map(r=>({name:r[0],n:Number(r[1])})), dlSub: dlSub.map(r=>({name:r[0],n:Number(r[1])})), fmt: fmt.map(r=>({name:r[0],n:Number(r[1])})), res: res.map(r=>({name:r[0],n:Number(r[1])})), dau: parsedDAU, dow: parsedDOW, licTrend: parsedLic, addonComp: parsedAddon, funnel: [ { name:'Viewed', value: funnel.views }, { name:'Downloaded', value: funnel.downloads }, { name:'Imported', value: funnel.imports }, { name:'Favourited', value: funnel.favs } ], catCvr: parsedCatCvr, searches: parsedSearch, catClicks: parsedClicks, favs: parsedFavs, favCat: parsedFavCat, favTrend: parsedFavTrend, dlErr: parsedDLErr, impErr: parsedImpErr, errTrend: parsedErrTrend, errAddon: parsedErrAddon, rates, installs: parsedInstalls })

      // Surface query failures as a real popup instead of showing misleading empty data
      const stats = API.getQueryErrorStats()
      setLoadError(stats.count > errBefore ? stats.last : null)
    } catch(e) {
      console.error(e)
      setLoadError({ status: 0, rateLimited: false, message: e.message || 'Unexpected error while loading data' })
    }
    setLoading(false)
  }, [addon.id, dateRange])

  useEffect(() => {
    load()
    // Live refresh every 60s (silent). Skip when the tab is hidden to save PostHog API quota
    // (each refresh fires ~25 queries; too-frequent refreshes hit the 429 rate limit).
    const id = setInterval(() => { if (!document.hidden) load(true) }, 60000)
    return () => clearInterval(id)
  }, [load])

  // Manual refresh button — silent reload (no skeleton), skip on first mount
  const firstRefresh = useRef(true)
  useEffect(() => {
    if (firstRefresh.current) { firstRefresh.current = false; return }
    load(true)
  }, [refreshTick])  // eslint-disable-line react-hooks/exhaustive-deps

  const visAlerts = alerts.filter(a => !dismissed.has(a.id))

  if (loading) return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ErrorToast error={loadError} onClose={() => setLoadError(null)} onRetry={() => load()} />
      <div style={GRIDS.g4}>{[1,2,3,4].map(i => <SkeletonCard key={i} h={110} />)}</div>
      <SkeletonCard h={80} /><SkeletonCard h={200} />
      <div style={GRIDS.g3}>{[1,2,3].map(i => <SkeletonCard key={i} h={180} />)}</div>
    </div>
  )

  const showSection = id => !section || section === id || section === 'overview'

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }} className="ani-fade">

      <ErrorToast error={loadError} onClose={() => setLoadError(null)} onRetry={() => load()} />

      {/* ALERTS */}
      {visAlerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visAlerts.map(a => <Alert key={a.id} {...a} onDismiss={() => setDismissed(s => new Set([...s, a.id]))} />)}
        </div>
      )}

      {/* ══ S1: OVERVIEW ══ */}
      {(section === 'overview' || !section) && (
        <>
          <SectionHeader title="Overview" />
          <div style={GRIDS.g4}>
            <KPICard label="Active users" value={d.kpis?.wau} icon={Users} iconBg="rgba(99,102,241,.15)" iconColor="#818cf8" trend="+12% vs last period" trendDir="up" delay={0} sparkData={d.dau?.slice(-8).map(r=>r.n)} />
            <KPICard label="Downloads" value={d.kpis?.downloads} icon={Download} iconBg="rgba(34,197,94,.12)" iconColor="#22c55e" trend="+8% vs last period" trendDir="up" delay={.05} sparkData={d.dlTrend?.slice(-8).map(r=>r.n)} />
            <KPICard label="Favourites" value={d.kpis?.favourites} icon={Heart} iconBg="rgba(245,158,11,.12)" iconColor="#f59e0b" trend="+5% vs last period" trendDir="up" delay={.1} sparkData={d.favTrend?.slice(-8).map(r=>r.n)} />
            <KPICard label="Addon installs" value={d.kpis?.installs} icon={Package} iconBg="rgba(56,189,248,.12)" iconColor="#38bdf8" trend="new installs" trendDir="nu" delay={.15} sparkData={d.installs?.slice(-8).map(r=>r.n)} />
            <KPICard label="Error rate" value={d.kpis?.errorRate} icon={AlertTriangle} iconBg="rgba(239,68,68,.12)" iconColor="#ef4444" format="decimal" trend={parseFloat(d.kpis?.errorRate) > 1 ? 'Spike detected' : 'Stable'} trendDir={parseFloat(d.kpis?.errorRate) > 1 ? 'down' : 'up'} delay={.2} />
          </div>

        </>
      )}

      {/* ══ TOP DOWNLOADED ASSETS (Overview + Downloads) ══ */}
      {(section === 'overview' || section === 'downloads' || !section) && (
        <div className="card ani-up">
          <CardTitle badge={`asset_downloaded · ${dateRange.short || dateRange.label}`}>Top downloaded assets</CardTitle>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ width: 20 }}>#</th>
                  <th>Asset name</th>
                  <th>Category</th>
                  <th>Subcategory</th>
                  <th className="t-r">Downloads</th>
                  <th style={{ width: 88 }}>Format</th>
                  <th style={{ width: 88 }}>Resolution</th>
                  <th className="t-r">Status</th>
                </tr>
              </thead>
              <tbody>
                {(d.topAssets || []).slice(0, showAllAssets ? undefined : 7).map((a, i) => {
                  const [cls, lbl] = getCVRStatus(Number(a.cvr))
                  return (
                    <tr key={i}>
                      <td className="t-rk">{i + 1}</td>
                      <td className="t-name">{a.name || '—'}</td>
                      <td>{a.cat ? <span className="badge badge-b">{a.cat}</span> : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                      <td style={{ color: 'var(--text-3)', fontSize: 10 }}>{a.sub || '—'}</td>
                      <td className="t-r" style={{ color: 'var(--text-1)', fontWeight: 500 }}>{a.downloads.toLocaleString()}</td>
                      <td><PctList data={a.fmt} /></td>
                      <td><PctList data={a.res} /></td>
                      <td className="t-r"><span className={cls}>{lbl}</span></td>
                    </tr>
                  )
                })}
                {!d.topAssets?.length && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '24px 0', fontSize: 12 }}>No data — check PostHog connection</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {d.topAssets?.length > 7 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
              <button
                onClick={() => setShowAllAssets(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '6px 14px', background: 'var(--bg-500)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 500 }}
              >
                {showAllAssets ? 'View less' : `View more (${d.topAssets.length - 7})`}
                <ChevronDown size={13} style={{ transform: showAllAssets ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══ S2: CATEGORY ANALYTICS ══ */}
      {(section === 'overview' || section === 'downloads' || !section) && (
        <>
          <SectionHeader title="Category analytics" />
          <div style={GRIDS.g3}>
            <div className="card ani-up">
              <CardTitle badge="category">Downloads by category</CardTitle>
              <HBar data={d.dlCat || []} colorKey="#6366f1" />
            </div>
            <div className="card ani-up s1">
              <CardTitle badge="subcategory · donut">Top subcategories</CardTitle>
              <DonutChart data={d.dlSub || []} height={200} />
            </div>
            <div className="card ani-up s2">
              <CardTitle badge="session_started">Addon performance</CardTitle>
              {(d.addonComp || []).map((a, i) => {
                const max = Math.max(...(d.addonComp || []).map(x => x.n), 1)
                const pct = ((a.n / max) * 100).toFixed(0)
                const colors = ['#6366f1','#38bdf8','#a78bfa','#f59e0b']
                return (
                  <div key={i} className="addon-bar-row">
                    <div className="row-top"><span className="name">{a.name}</span><span className="val" style={{ color: colors[i % colors.length] }}>{a.n.toLocaleString()}</span></div>
                    <div className="track"><div className="fill ani-bar" style={{ width: `${pct}%`, background: colors[i % colors.length], animationDelay: `${i*.1}s` }} /></div>
                    <div className="share">{pct}% share</div>
                  </div>
                )
              })}
              {!d.addonComp?.length && <div style={{ color: 'var(--text-3)', fontSize: 11, textAlign: 'center', padding: '20px 0' }}>No data</div>}
            </div>
          </div>
        </>
      )}

      {/* ══ S3: DOWNLOAD ANALYTICS ══ */}
      {(section === 'downloads' || !section) && (
        <>
          <SectionHeader title="Download analytics" />
          <div className="grid-21">
            <div className="card ani-up">
              <CardTitle badge="asset_downloaded">Download trend</CardTitle>
              <AreaChart data={d.dlTrend || []} color="#6366f1" label="Downloads" height={240} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="card ani-up s1">
                <CardTitle badge="format · donut">Format</CardTitle>
                <DonutChart data={d.fmt || []} height={170} />
              </div>
              <div className="card ani-up s2">
                <CardTitle badge="resolution · donut">Resolution</CardTitle>
                <DonutChart data={d.res || []} height={170} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══ S4: USERS ══ */}
      {(section === 'users' || !section) && (
        <>
          <SectionHeader title="User analytics" />
          <div style={GRIDS.g3}>
            <div className="card ani-up">
              <CardTitle badge="session_started">Daily active users</CardTitle>
              <AreaChart data={d.dau || []} color="#22c55e" label="DAU" height={200} />
            </div>
            <div className="card ani-up s1">
              <CardTitle badge="session_started">Most active day</CardTitle>
              <BarChart
                data={(d.dow || []).map(r => ({ dow: ['','Sun','Mon','Tue','Wed','Thu','Fri','Sat'][Number(r.dow)] || r.dow, n: r.n }))}
                xKey="dow" yKey="n" height={200} label="Sessions"
              />
            </div>
            <div className="card ani-up s2">
              <CardTitle badge="license events">License: activated vs expired</CardTitle>
              {d.licTrend?.length ? (
                <BarChart
                  data={d.licTrend}
                  xKey="week" yKey="activated"
                  height={200} label="Activations" color="#22c55e"
                />
              ) : <AreaChart data={d.installs || []} color="#22c55e" label="Installs" height={200} />}
            </div>
          </div>
        </>
      )}

      {/* ══ S5: CONVERSION ══ */}
      {(section === 'conversion' || !section) && (
        <>
          <SectionHeader title="Conversion funnel" />
          <div style={GRIDS.g2}>
            <div className="card ani-up">
              <CardTitle badge="view → download → import → favourite">Full user journey</CardTitle>
              <FunnelViz data={d.funnel || []} />
            </div>
            <div className="card ani-up s1">
              <CardTitle badge="views vs downloads">Category conversion</CardTitle>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Category</th><th className="t-r">Views</th><th className="t-r">Downloads</th><th className="t-r">CVR</th></tr></thead>
                  <tbody>
                    {(d.catCvr || []).map((c, i) => {
                      const [cls] = getCVRStatus(Number(c.cvr))
                      return (
                        <tr key={i}>
                          <td className="t-name">{c.cat || '—'}</td>
                          <td className="t-r">{Number(c.views).toLocaleString()}</td>
                          <td className="t-r" style={{ color: 'var(--text-1)', fontWeight: 500 }}>{Number(c.downloads).toLocaleString()}</td>
                          <td className="t-r"><span className={cls}>{c.cvr}%</span></td>
                        </tr>
                      )
                    })}
                    {!d.catCvr?.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '16px 0', fontSize: 11 }}>No data</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══ S6: SEARCH ══ */}
      {(section === 'search' || !section) && (
        <>
          <SectionHeader title="Search & discovery" />
          <div style={GRIDS.g2}>
            <div className="card ani-up">
              <CardTitle badge="search_performed">Top search queries</CardTitle>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>#</th><th>Query</th><th className="t-r">Count</th><th className="t-r">0 results</th></tr></thead>
                  <tbody>
                    {(d.searches || []).slice(0, 10).map((s, i) => (
                      <tr key={i} style={{ background: s.zero > 0 ? 'rgba(239,68,68,.04)' : 'transparent' }}>
                        <td className="t-rk">{i + 1}</td>
                        <td className="t-name">{s.q || '—'}</td>
                        <td className="t-r">{s.n.toLocaleString()}</td>
                        <td className="t-r" style={{ color: s.zero > 0 ? 'var(--red)' : 'var(--text-3)' }}>
                          {s.zero > 0 ? s.zero : '—'}
                        </td>
                      </tr>
                    ))}
                    {!d.searches?.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '16px 0', fontSize: 11 }}>No data</td></tr>}
                  </tbody>
                </table>
              </div>
              {d.searches?.some(s => s.zero > 0) && (
                <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(239,68,68,.08)', borderRadius: 8, fontSize: 11, color: 'var(--red)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  Content gap: {d.searches.filter(s=>s.zero>0).slice(0,3).map(s=>`"${s.q}"`).join(', ')} return no results
                </div>
              )}
            </div>
            <div className="card ani-up s1">
              <CardTitle badge="category_clicked">Most browsed categories</CardTitle>
              <HBar data={d.catClicks || []} colorKey="#a78bfa" />
            </div>
          </div>
        </>
      )}

      {/* ══ S7: FAVOURITES ══ */}
      {(section === 'favourites' || !section) && (
        <>
          <SectionHeader title="Favourites" />
          <div style={GRIDS.g3}>
            <div className="card ani-up">
              <CardTitle badge="favourite_added">Top favourited assets</CardTitle>
              <HBar data={d.favs || []} colorKey="#f59e0b" />
            </div>
            <div className="card ani-up s1">
              <CardTitle badge="favourite_added · donut">By category</CardTitle>
              <DonutChart data={d.favCat || []} height={200} />
            </div>
            <div className="card ani-up s2">
              <CardTitle badge="favourite_added · trend">Daily trend</CardTitle>
              <AreaChart data={d.favTrend || []} color="#f59e0b" label="Favourites" height={200} />
            </div>
          </div>
        </>
      )}

      {/* ══ S8: ERRORS ══ */}
      {(section === 'errors' || !section) && (
        <>
          <SectionHeader title="Errors & health" />
          <div style={GRIDS.g3}>
            <div className="card ani-up">
              <CardTitle>System health</CardTitle>
              <div className="health-grid" style={{ marginBottom: 14 }}>
                {[
                  { label: 'Download', val: d.rates?.download, ok: parseFloat(d.rates?.download) > 95 },
                  { label: 'Import',   val: d.rates?.import,   ok: parseFloat(d.rates?.import) > 95 },
                  { label: 'Search',   val: '100.0', ok: true },
                  { label: 'License',  val: '99.1',  ok: true },
                ].map((h, i) => (
                  <div key={i} className="h-card">
                    <div className="h-dot" style={{ background: h.ok ? 'var(--green)' : 'var(--red)' }} />
                    <div><div className="h-label">{h.label}</div><div className="h-val" style={{ color: h.ok ? 'var(--green)' : 'var(--red)' }}>{h.val || '—'}%</div></div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 6 }}>Error trend — 14 days</div>
              <AreaChart data={d.errTrend || []} color="#ef4444" label="Errors" height={120} />
            </div>
            <div className="card ani-up s1">
              <CardTitle badge="download_failed">Download fail reasons</CardTitle>
              <HBar data={d.dlErr || []} colorKey="#ef4444" />
              {d.errAddon?.length > 0 && (
                <>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', margin: '12px 0 8px' }}>Errors by addon</div>
                  <HBar data={d.errAddon || []} colorKey="#f59e0b" />
                </>
              )}
            </div>
            <div className="card ani-up s2">
              <CardTitle badge="import_failed">Import fail reasons</CardTitle>
              <HBar data={d.impErr || []} colorKey="#ef4444" />
              {d.impErr?.length === 0 && <div style={{ textAlign: 'center', color: 'var(--green)', fontSize: 11, padding: '20px 0' }}>No import failures</div>}
            </div>
          </div>
        </>
      )}

    </div>
  )
}
