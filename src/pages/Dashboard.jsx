import { useState, useEffect, useCallback, useRef } from 'react'
import { Users, Download, Heart, AlertTriangle, TrendingUp, TrendingDown, X, AlertCircle, Package, ChevronDown, Rocket, CheckCircle2, Clock, RefreshCw, ArrowRight, Activity } from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'
import { KPICard, SectionHeader, CardTitle, SkeletonCard, HBar, FunnelViz, PctList } from '../components/ui/index.jsx'
import { AreaChart, BarChart, DonutChart, MultiLineChart } from '../components/charts/index.jsx'
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

// Version helpers — normalize (strip leading "v", trim) and semver-compare so
// "1.2" / "v1.2.0" group together and sort correctly. Empty → "unknown".
const normVer = v => String(v || '').trim().replace(/^v/i, '') || 'unknown'
const cmpVer = (a, b) => {
  const pa = normVer(a).split('.').map(n => parseInt(n, 10) || 0)
  const pb = normVer(b).split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}

// Stale-while-revalidate cache: keyed by addon + date range. Lets switching addons /
// sections / date ranges back show instantly while a silent refresh runs in the
// background. Survives re-renders (module scope), cleared on full page reload.
const dashCache = new Map()
const cacheKeyOf = (addon, range) =>
  `${addon.id}|${range.short || ''}|${range.start || ''}|${range.end || ''}`

export default function Dashboard({ section }) {
  const { addon, dateRange, refreshTick } = useDashboard()
  const [d, setD]               = useState({})
  const [loading, setLoading]   = useState(true)
  const [alerts, setAlerts]     = useState([])
  const [dismissed, setDismissed] = useState(new Set())
  const [showAllAssets, setShowAllAssets] = useState(false)
  const [loadError, setLoadError] = useState(null)  // { status, rateLimited, message } | null

  const load = useCallback(async (silent = false) => {
    const cacheKey = cacheKeyOf(addon, dateRange)
    const cached = dashCache.get(cacheKey)

    // Stale-while-revalidate: if we've loaded this addon+range before, show it
    // instantly and refresh silently in the background (no skeleton, no flash).
    if (cached && !silent) {
      setD(cached.d); setAlerts(cached.alerts || []); setLoading(false)
    } else if (!silent) {
      setLoading(true)
    }
    const showingCached = !!cached && !silent
    const effSilent = silent || showingCached  // don't clobber good data on a bg refresh
    const errBefore = API.getQueryErrorStats().count

    try {
      // Fire ALL queries at once — the limiter (8 concurrent) schedules them. The 7
      // "above-the-fold" queries are created first so they get the first slots.
      const P = {
        kpis:      API.getOverviewKPIs(addon.id, dateRange),
        topAssets: API.getTopAssets(addon.id, dateRange),
        assetFmt:  API.getAssetFormatBreakdown(addon.id, dateRange),
        assetRes:  API.getAssetResolutionBreakdown(addon.id, dateRange),
        dlTrend:   API.getDownloadTrend(addon.id, dateRange),
        dlCat:     API.getDownloadsByCategory(addon.id, dateRange),
        dlSub:     API.getDownloadsBySubcategory(addon.id, dateRange),
        fmt:       API.getFormatDistribution(addon.id, dateRange),
        res:       API.getResolutionDistribution(addon.id, dateRange),
        dau:       API.getDAUTrend(addon.id, dateRange),
        dow:       API.getSessionsByDOW(addon.id, dateRange),
        acctTrend: API.getAccountTrend(addon.id, dateRange),
        planDist:  API.getPlanDistribution(addon.id, dateRange),
        addonComp: API.getAddonComparison(dateRange),
        funnel:    API.getConversionFunnel(addon.id, dateRange),
        catCvr:    API.getCategoryConversion(addon.id, dateRange),
        searches:  API.getSearchQueries(addon.id, dateRange),
        catClicks: API.getCategoryClicks(addon.id, dateRange),
        topFavs:   API.getTopFavourites(addon.id, dateRange),
        favCat:    API.getFavouritesByCategory(addon.id, dateRange),
        favTrend:  API.getFavouriteTrend(addon.id, dateRange),
        errors:    API.getErrors(addon.id, dateRange),
        errTrend:  API.getErrorTrend(addon.id, dateRange),
        errAddon:  API.getErrorsByAddon(dateRange),
        rates:     API.getSuccessRates(addon.id, dateRange),
        installs:  API.getNewInstalls(addon.id, dateRange),
        opensTrend: API.getOpensTrend(addon.id, dateRange),
        verDist:   API.getVersionDistribution(addon.id, dateRange),
        adoption:  API.getUpdateAdoption(addon.id, dateRange),
        updTrend:  API.getUpdateTrend(addon.id, dateRange),
        verMig:    API.getVersionMigration(addon.id, dateRange),
        latestVer: API.getLatestTargetVersion(addon.id, dateRange),
      }

      // PHASE 1 — reveal above-the-fold (KPIs, top assets, category) the moment the
      // first wave returns, so the page appears in ~1s instead of waiting for all 30.
      if (!effSilent) {
        const [k, ta, af, ar, dt, dc, ds] = await Promise.all([P.kpis, P.topAssets, P.assetFmt, P.assetRes, P.dlTrend, P.dlCat, P.dlSub])
        const fm = {}, rm = {}
        af.forEach(r => { const key = r[0]; (fm[key] = fm[key] || []).push({ label: r[1] || 'unknown', n: Number(r[2]) }) })
        ar.forEach(r => { const key = r[0]; (rm[key] = rm[key] || []).push({ label: r[1] || 'unknown', n: Number(r[2]) }) })
        setD(prev => ({
          ...prev, kpis: k,
          topAssets: ta.map(r => ({ name: r[0], cat: r[1], sub: r[2], downloads: Number(r[3]), views: Number(r[4]), imports: Number(r[5]), favs: Number(r[6]), cvr: r[4] > 0 ? ((Number(r[3]) / Number(r[4])) * 100).toFixed(0) : 0, fmt: fm[r[0]] || [], res: rm[r[0]] || [] })),
          dlTrend: dt.map(r => ({ day: r[0], n: Number(r[1]) })),
          dlCat: dc.map(r => ({ name: r[0], n: Number(r[1]) })),
          dlSub: ds.map(r => ({ name: r[0], n: Number(r[1]) })),
        }))
        setLoading(false)
      }

      // PHASE 2 — await the full set, then commit atomically (+ cache it).
      const [kpis, topAssets, assetFmt, assetRes, dlTrend, dlCat, dlSub, fmt, res, dau, dow, acctTrend, planDist, addonComp, funnel, catCvr, searches, catClicks, topFavs, favCat, favTrend, errors, errTrend, errAddon, rates, installs, opensTrend, verDist, adoption, updTrend, verMig, latestVer] = await Promise.all([
        P.kpis, P.topAssets, P.assetFmt, P.assetRes, P.dlTrend, P.dlCat, P.dlSub, P.fmt, P.res, P.dau, P.dow, P.acctTrend, P.planDist, P.addonComp, P.funnel, P.catCvr, P.searches, P.catClicks, P.topFavs, P.favCat, P.favTrend, P.errors, P.errTrend, P.errAddon, P.rates, P.installs, P.opensTrend, P.verDist, P.adoption, P.updTrend, P.verMig, P.latestVer,
      ])

      // Did any query fail (e.g. rate limit)? If so, never overwrite good data with
      // the empty/zero results — that would look like fake "0 / no data".
      const stats = API.getQueryErrorStats()
      const errored = stats.count > errBefore
      setLoadError(errored ? stats.last : null)
      if (errored && effSilent) { setLoading(false); return }  // keep last real / cached data

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
      const parsedAcct    = acctTrend.map(r => ({ week: r[0]?.slice(5) || r[0], signups: Number(r[1]), logins: Number(r[2]) }))
      const parsedPlan    = planDist.map(r => ({ name: r[0], n: Number(r[1]) }))
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
      const parsedOpens    = (opensTrend || []).map(r => ({ day: String(r[0] || '').slice(5) || r[0], n: Number(r[1]) }))

      // ── Update / version analytics ──
      // Collapse versions that normalize to the same value (e.g. "1.2" + "v1.2.0").
      const verAgg = {}
      verDist.forEach(r => { const k = normVer(r[0]); verAgg[k] = (verAgg[k] || 0) + Number(r[1]) })
      const verRows = Object.entries(verAgg).map(([name, n]) => ({ name, n }))
      const activeVerUsers = verRows.reduce((s, v) => s + v.n, 0)
      // "Latest" = the version most recently pushed via prompts; fall back to the
      // highest version anyone is actually running.
      const latest = normVer(latestVer) !== 'unknown'
        ? normVer(latestVer)
        : verRows.map(v => v.name).sort(cmpVer).slice(-1)[0] || null
      const onLatest = latest ? (verAgg[latest] || 0) : 0
      const pctOnLatest = activeVerUsers > 0 ? Math.round((onLatest / activeVerUsers) * 100) : 0
      const laggards = Math.max(0, activeVerUsers - onLatest)
      const verSorted = verRows.sort((a, b) => cmpVer(b.name, a.name))  // newest first
      const updTrendRows = updTrend.map(r => ({ day: r[0], n: Number(r[1]) }))
      const totalUpdates = updTrendRows.reduce((s, r) => s + r.n, 0)
      const verMigRows = verMig.map(r => ({ frm: normVer(r[0]), to: normVer(r[1]), n: Number(r[2]) }))
      const updates = {
        ...adoption, latest, onLatest, pctOnLatest, laggards,
        activeVerUsers, totalUpdates,
        verDist: verSorted, updTrend: updTrendRows, verMig: verMigRows,
        updVsNot: [
          { name: 'Updated', n: adoption.updated },
          { name: 'Not updated', n: adoption.notUpdated },
        ],
      }

      const zeroSearches = parsedSearch.filter(s => s.zero > 0)
      const newAlerts = []
      if (parseFloat(kpis.errorRate) > 1) newAlerts.push({ id:'err', type:'danger',  msg:`Error rate at ${kpis.errorRate}% — download failures detected. Check errors section.` })
      if (zeroSearches.length)            newAlerts.push({ id:'gap', type:'warning', msg:`${zeroSearches.length} searches return zero results — content gap detected.` })
      if (parsedTopAssets.length)         newAlerts.push({ id:'top', type:'success', msg:`Top asset: "${parsedTopAssets[0]?.name}" with ${parsedTopAssets[0]?.downloads} downloads.` })
      const finalD = { kpis, topAssets: parsedTopAssets, dlTrend: parsedDLTrend, dlCat: dlCat.map(r=>({name:r[0],n:Number(r[1])})), dlSub: dlSub.map(r=>({name:r[0],n:Number(r[1])})), fmt: fmt.map(r=>({name:r[0],n:Number(r[1])})), res: res.map(r=>({name:r[0],n:Number(r[1])})), dau: parsedDAU, dow: parsedDOW, acctTrend: parsedAcct, planDist: parsedPlan, addonComp: parsedAddon, funnel: [ { name:'Viewed', value: funnel.views }, { name:'Downloaded', value: funnel.downloads }, { name:'Imported', value: funnel.imports }, { name:'Favourited', value: funnel.favs } ], catCvr: parsedCatCvr, searches: parsedSearch, catClicks: parsedClicks, favs: parsedFavs, favCat: parsedFavCat, favTrend: parsedFavTrend, dlErr: parsedDLErr, impErr: parsedImpErr, errTrend: parsedErrTrend, errAddon: parsedErrAddon, rates, installs: parsedInstalls, opens: parsedOpens, updates }
      setAlerts(newAlerts)
      setD(finalD)
      if (!errored) dashCache.set(cacheKey, { d: finalD, alerts: newAlerts })  // cache for instant SWR

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
    <div className="page" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ErrorToast error={loadError} onClose={() => setLoadError(null)} onRetry={() => load()} />
      <div style={GRIDS.g4}>{[1,2,3,4].map(i => <SkeletonCard key={i} h={110} />)}</div>
      <SkeletonCard h={80} /><SkeletonCard h={200} />
      <div style={GRIDS.g3}>{[1,2,3].map(i => <SkeletonCard key={i} h={180} />)}</div>
    </div>
  )

  const showSection = id => !section || section === id || section === 'overview'

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }} className="ani-fade page">

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
            <KPICard label="Active users" value={d.kpis?.wau} icon={Users} iconBg="rgba(99,102,241,.15)" iconColor="#818cf8" trend={d.kpis?.trends?.wau?.label} trendDir={d.kpis?.trends?.wau?.dir} delay={0} sparkData={d.dau?.slice(-8).map(r=>r.n)} />
            <KPICard label="Downloads" value={d.kpis?.downloads} icon={Download} iconBg="rgba(34,197,94,.12)" iconColor="#22c55e" trend={d.kpis?.trends?.downloads?.label} trendDir={d.kpis?.trends?.downloads?.dir} delay={.05} sparkData={d.dlTrend?.slice(-8).map(r=>r.n)} />
            <KPICard label="Favourites" value={d.kpis?.favourites} icon={Heart} iconBg="rgba(245,158,11,.12)" iconColor="#f59e0b" trend={d.kpis?.trends?.favourites?.label} trendDir={d.kpis?.trends?.favourites?.dir} delay={.1} sparkData={d.favTrend?.slice(-8).map(r=>r.n)} />
            <KPICard label="Addon installs" value={d.kpis?.installs} icon={Package} iconBg="rgba(56,189,248,.12)" iconColor="#38bdf8" trend={d.kpis?.trends?.installs?.label} trendDir={d.kpis?.trends?.installs?.dir} delay={.15} sparkData={d.installs?.slice(-8).map(r=>r.n)} />
            <KPICard label="Addon opens" value={d.kpis?.opens} icon={Activity} iconBg="rgba(168,85,247,.12)" iconColor="#a855f7" trend={d.kpis?.trends?.opens?.label} trendDir={d.kpis?.trends?.opens?.dir} delay={.2} sparkData={d.opens?.slice(-8).map(r=>r.n)} />
            <KPICard label="Error rate" value={d.kpis?.errorRate} icon={AlertTriangle} iconBg="rgba(239,68,68,.12)" iconColor="#ef4444" format="decimal" trend={parseFloat(d.kpis?.errorRate) > 1 ? 'Spike detected' : 'Stable'} trendDir={parseFloat(d.kpis?.errorRate) > 1 ? 'down' : 'up'} delay={.25} />
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

      {/* ══ UPDATE ANALYTICS (addon_opened / update_prompt_shown / update_completed) ══ */}
      {(section === 'updates' || !section) && (() => {
        const u = d.updates || {}
        const hasData = (u.activeVerUsers || 0) + (u.totalUpdates || 0) + (u.prompted || 0) > 0
        return (
          <>
            <SectionHeader title="Update analytics" subtitle={u.latest ? `Latest release · v${u.latest}` : undefined} />
            {!hasData ? (
              <div className="card" style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, padding: '28px 0' }}>
                No update data yet — waiting for <b style={{ color: 'var(--text-2)' }}>addon_opened</b>, <b style={{ color: 'var(--text-2)' }}>update_prompt_shown</b> and <b style={{ color: 'var(--text-2)' }}>update_completed</b> events in this date range.
              </div>
            ) : (
              <>
                <div style={GRIDS.g4}>
                  <KPICard label="Update adoption" value={u.rate ?? 0} format="percent" icon={Rocket}
                    iconBg="rgba(99,102,241,.15)" iconColor="#818cf8"
                    trend={u.prompted ? `${u.updated} of ${u.prompted} prompted updated` : 'No update prompts yet'}
                    trendDir={u.rate >= 50 ? 'up' : 'down'} delay={0} />
                  <KPICard label="On latest version" value={u.pctOnLatest ?? 0} format="percent" icon={CheckCircle2}
                    iconBg="rgba(34,197,94,.12)" iconColor="#22c55e"
                    trend={`${u.onLatest || 0} of ${u.activeVerUsers || 0} active users`}
                    trendDir={u.pctOnLatest >= 60 ? 'up' : 'down'} delay={.05} />
                  <KPICard label="Pending updates" value={u.laggards ?? 0} icon={Clock}
                    iconBg="rgba(245,158,11,.12)" iconColor="#f59e0b"
                    trend={u.laggards > 0 ? 'still on older versions' : 'everyone up to date'}
                    trendDir={u.laggards > 0 ? 'down' : 'up'} delay={.1} />
                  <KPICard label="Updates completed" value={u.totalUpdates ?? 0} icon={RefreshCw}
                    iconBg="rgba(56,189,248,.12)" iconColor="#38bdf8"
                    trend={`${u.activeVerUsers || 0} active users`} trendDir="up" delay={.15}
                    sparkData={u.updTrend?.slice(-8).map(r => r.n)} />
                </div>

                <div className="grid-21">
                  <div className="card ani-up">
                    <CardTitle badge="update_completed">Update adoption trend</CardTitle>
                    <AreaChart data={u.updTrend || []} color="#6366f1" label="Updates" height={240} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="card ani-up s1">
                      <CardTitle badge="prompted users">Updated vs not</CardTitle>
                      <DonutChart data={u.updVsNot || []} height={170} />
                    </div>
                    <div className="card ani-up s2">
                      <CardTitle badge="prompt → completed">Adoption funnel</CardTitle>
                      <FunnelViz data={[
                        { name: 'Prompted', value: u.prompted || 0 },
                        { name: 'Updated', value: u.updated || 0 },
                      ]} />
                    </div>
                  </div>
                </div>

                <div style={GRIDS.g2}>
                  <div className="card ani-up">
                    <CardTitle badge="addon_opened · latest launch">Version distribution</CardTitle>
                    {(u.verDist || []).length ? (u.verDist).map((v, i) => {
                      const max = Math.max(...u.verDist.map(x => x.n), 1)
                      const pct = ((v.n / max) * 100).toFixed(0)
                      const share = u.activeVerUsers ? ((v.n / u.activeVerUsers) * 100).toFixed(0) : 0
                      const isLatest = v.name === u.latest
                      return (
                        <div key={i} className="addon-bar-row">
                          <div className="row-top">
                            <span className="name">v{v.name}{isLatest && <span className="badge badge-g" style={{ marginLeft: 6 }}>latest</span>}</span>
                            <span className="val" style={{ color: isLatest ? '#22c55e' : '#38bdf8' }}>{v.n.toLocaleString()}</span>
                          </div>
                          <div className="track"><div className="fill ani-bar" style={{ width: `${pct}%`, background: isLatest ? '#22c55e' : '#38bdf8', animationDelay: `${i * .05}s` }} /></div>
                          <div className="share">{share}% of users</div>
                        </div>
                      )
                    }) : <div style={{ color: 'var(--text-3)', fontSize: 11, textAlign: 'center', padding: '20px 0' }}>No version data</div>}
                  </div>
                  <div className="card ani-up s1">
                    <CardTitle badge="update_completed">Version migration paths</CardTitle>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="data-table">
                        <thead><tr><th>From</th><th style={{ width: 24 }}></th><th>To</th><th className="t-r">Users</th></tr></thead>
                        <tbody>
                          {(u.verMig || []).map((m, i) => (
                            <tr key={i}>
                              <td style={{ color: 'var(--text-3)' }}>v{m.frm}</td>
                              <td style={{ color: 'var(--text-3)' }}><ArrowRight size={11} /></td>
                              <td className="t-name">v{m.to}{m.to === u.latest && <span className="badge badge-g" style={{ marginLeft: 6 }}>latest</span>}</td>
                              <td className="t-r" style={{ color: 'var(--text-1)', fontWeight: 500 }}>{m.n.toLocaleString()}</td>
                            </tr>
                          ))}
                          {!u.verMig?.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '16px 0', fontSize: 11 }}>No update migrations yet</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )
      })()}

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
              <CardTitle badge="account_login">Logins vs Signups</CardTitle>
              {d.acctTrend?.length ? (
                <MultiLineChart
                  labels={d.acctTrend.map(r => r.week)}
                  datasets={[
                    { label: 'Logins',  data: d.acctTrend.map(r => r.logins) },
                    { label: 'Signups', data: d.acctTrend.map(r => r.signups) },
                  ]}
                  height={200}
                  legend
                />
              ) : <AreaChart data={d.installs || []} color="#22c55e" label="Installs" height={200} />}
            </div>
          </div>
          <div style={GRIDS.g3}>
            <div className="card ani-up">
              <CardTitle badge="session_started · plan">Plan distribution</CardTitle>
              {d.planDist?.length ? (
                <DonutChart data={d.planDist} height={200} />
              ) : <div style={{ color: 'var(--text-3)', fontSize: 11, textAlign: 'center', padding: '20px 0' }}>No plan data</div>}
            </div>
            <div className="card ani-up s1">
              <CardTitle badge="addon_opened · every launch">Addon opens</CardTitle>
              {d.opens?.length ? (
                <AreaChart data={d.opens} color="#a855f7" label="Opens" height={200} />
              ) : <div style={{ color: 'var(--text-3)', fontSize: 11, textAlign: 'center', padding: '20px 0' }}>No open data yet</div>}
            </div>
            <div className="card ani-up s2">
              <CardTitle badge="addon_installed · first run">New installs</CardTitle>
              {d.installs?.length ? (
                <AreaChart data={d.installs} color="#38bdf8" label="Installs" height={200} />
              ) : <div style={{ color: 'var(--text-3)', fontSize: 11, textAlign: 'center', padding: '20px 0' }}>No install data yet</div>}
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
                  { label: 'Download', val: d.rates?.download },
                  { label: 'Import',   val: d.rates?.import },
                  { label: 'Search',   val: d.rates?.search },
                  { label: 'Premium',  val: d.rates?.premium },
                ].map((h, i) => {
                  const hasVal = h.val != null
                  const ok = hasVal && parseFloat(h.val) > 95
                  const color = !hasVal ? 'var(--text-3)' : ok ? 'var(--green)' : 'var(--red)'
                  return (
                    <div key={i} className="h-card">
                      <div className="h-dot" style={{ background: color }} />
                      <div><div className="h-label">{h.label}</div><div className="h-val" style={{ color }}>{hasVal ? `${h.val}%` : '—'}</div></div>
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 6 }}>Error trend — {dateRange.short || dateRange.label}</div>
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
