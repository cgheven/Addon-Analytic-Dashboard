import axios from 'axios'

const HOST    = import.meta.env.VITE_POSTHOG_HOST    || 'https://us.posthog.com'
const PROJECT = import.meta.env.VITE_POSTHOG_PROJECT_ID
const KEY     = import.meta.env.VITE_POSTHOG_API_KEY

const api = axios.create({
  baseURL: `${HOST}/api/projects/${PROJECT}`,
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  timeout: 30000,
})

// Concurrency limiter — PostHog rate-limits the query API, and the dashboard fires
// ~25 queries per load. Firing them all at once triggers HTTP 429. Cap to a few at a time.
const MAX_CONCURRENT = 4
let active = 0
const queue = []
function schedule(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject })
    pump()
  })
}
function pump() {
  if (active >= MAX_CONCURRENT || !queue.length) return
  active++
  const { fn, resolve, reject } = queue.shift()
  fn().then(resolve, reject).finally(() => { active--; pump() })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function request(query, attempt = 0) {
  try {
    const { data } = await api.post('/query/', { query: { kind: 'HogQLQuery', query } })
    return data.results || []
  } catch (e) {
    // 429 = rate limited. Back off (honour Retry-After) and retry a few times.
    if (e.response?.status === 429 && attempt < 4) {
      const retryAfter = Number(e.response?.headers?.['retry-after'])
      const waitMs = (retryAfter > 0 ? retryAfter : Math.pow(2, attempt) + Math.random()) * 1000
      await sleep(waitMs)
      return request(query, attempt + 1)
    }
    console.warn('PostHog query failed:', e.message)
    return []
  }
}

async function hql(query) {
  return schedule(() => request(query))
}

// Accepts either a number (days) or a dateRange object: { days } | { start, end }
function timeClause(range) {
  if (range && range.start && range.end) {
    return `timestamp >= toDateTime('${range.start} 00:00:00') AND timestamp <= toDateTime('${range.end} 23:59:59')`
  }
  const days = (range && typeof range === 'object' ? range.days : range) || 1
  return `timestamp >= now() - interval ${days} day`
}

// Exact match — each platform slug is its own dashboard entry. Windows uses
// '<slug>', Mac uses '<slug>-mac', and they are tracked/shown separately.
const where = (addon, range) =>
  `properties.addon_name = '${addon}' AND ${timeClause(range)}`

export async function getOverviewKPIs(addon, days) {
  const rows = await hql(`
    SELECT
      uniqIf(distinct_id, event = 'session_started') as wau,
      countIf(event = 'asset_downloaded') as downloads,
      countIf(event = 'favourite_added') as favourites,
      countIf(event IN ('download_failed','import_failed')) as errors,
      countIf(event IN ('asset_downloaded','asset_imported')) as total_actions,
      countIf(event = 'addon_installed') as installs
    FROM events WHERE ${where(addon, days)}
  `)
  const r = rows[0] || [0,0,0,0,1,0]
  return {
    wau:        Number(r[0]),
    downloads:  Number(r[1]),
    favourites: Number(r[2]),
    errorRate:  r[4] > 0 ? ((Number(r[3]) / Number(r[4])) * 100).toFixed(1) : '0.0',
    installs:   Number(r[5]),
  }
}

export async function getTopAssets(addon, days) {
  return hql(`
    SELECT
      properties.asset_name as name,
      properties.category as cat,
      properties.sub_category as sub,
      countIf(event = 'asset_downloaded') as downloads,
      countIf(event = 'asset_viewed') as views,
      countIf(event = 'asset_imported') as imports,
      countIf(event = 'favourite_added') as favs
    FROM events
    WHERE ${where(addon, days)}
      AND event IN ('asset_downloaded','asset_viewed','asset_imported','favourite_added')
      AND properties.asset_name != ''
    GROUP BY name, cat, sub
    ORDER BY downloads DESC LIMIT 50
  `)
}

// Per-asset format breakdown — used for the segmented bars in the Top assets table
export async function getAssetFormatBreakdown(addon, days) {
  return hql(`
    SELECT properties.asset_name as name, properties.format as fmt, count() as n
    FROM events WHERE event = 'asset_downloaded' AND ${where(addon, days)}
      AND properties.asset_name != ''
    GROUP BY name, fmt ORDER BY n DESC
  `)
}

// Per-asset resolution breakdown
export async function getAssetResolutionBreakdown(addon, days) {
  return hql(`
    SELECT properties.asset_name as name, properties.resolution as res, count() as n
    FROM events WHERE event = 'asset_downloaded' AND ${where(addon, days)}
      AND properties.asset_name != ''
    GROUP BY name, res ORDER BY n DESC
  `)
}

export async function getDownloadsByCategory(addon, days) {
  return hql(`
    SELECT properties.category as cat, count() as n
    FROM events WHERE event = 'asset_downloaded' AND ${where(addon, days)}
    GROUP BY cat ORDER BY n DESC LIMIT 10
  `)
}

export async function getDownloadsBySubcategory(addon, days) {
  return hql(`
    SELECT properties.sub_category as sub, count() as n
    FROM events WHERE event = 'asset_downloaded' AND ${where(addon, days)}
    GROUP BY sub ORDER BY n DESC LIMIT 12
  `)
}

export async function getFormatDistribution(addon, days) {
  return hql(`
    SELECT properties.format as fmt, count() as n
    FROM events WHERE event = 'asset_downloaded' AND ${where(addon, days)}
    GROUP BY fmt ORDER BY n DESC LIMIT 8
  `)
}

export async function getResolutionDistribution(addon, days) {
  return hql(`
    SELECT properties.resolution as res, count() as n
    FROM events WHERE event = 'asset_downloaded' AND ${where(addon, days)}
    GROUP BY res ORDER BY n DESC LIMIT 6
  `)
}

export async function getDownloadTrend(addon, days) {
  return hql(`
    SELECT toDate(timestamp) as day, count() as n
    FROM events WHERE event = 'asset_downloaded' AND ${where(addon, days)}
    GROUP BY day ORDER BY day ASC
  `)
}

export async function getDAUTrend(addon, days) {
  return hql(`
    SELECT toDate(timestamp) as day, uniq(distinct_id) as n
    FROM events WHERE event = 'session_started' AND ${where(addon, days)}
    GROUP BY day ORDER BY day ASC
  `)
}

export async function getSessionsByDOW(addon, days) {
  return hql(`
    SELECT toDayOfWeek(timestamp) as dow, count() as n
    FROM events WHERE event = 'session_started' AND ${where(addon, days)}
    GROUP BY dow ORDER BY dow ASC
  `)
}

export async function getLicenseTrend(addon, days) {
  return hql(`
    SELECT
      toStartOfWeek(timestamp) as week,
      countIf(event = 'license_activated') as activated,
      countIf(event = 'license_expired') as expired
    FROM events
    WHERE event IN ('license_activated','license_expired') AND ${where(addon, days)}
    GROUP BY week ORDER BY week ASC
  `)
}

export async function getAddonComparison(range) {
  return hql(`
    SELECT properties.addon_name as addon, count() as sessions
    FROM events WHERE event = 'session_started'
      AND ${timeClause(range)}
    GROUP BY addon ORDER BY sessions DESC
  `)
}

export async function getConversionFunnel(addon, days) {
  const rows = await hql(`
    SELECT
      countIf(event = 'asset_viewed') as views,
      countIf(event = 'asset_downloaded') as downloads,
      countIf(event = 'asset_imported') as imports,
      countIf(event = 'favourite_added') as favs
    FROM events WHERE ${where(addon, days)}
  `)
  const r = rows[0] || [0,0,0,0]
  return { views: Number(r[0]), downloads: Number(r[1]), imports: Number(r[2]), favs: Number(r[3]) }
}

export async function getCategoryConversion(addon, days) {
  return hql(`
    SELECT
      properties.category as cat,
      countIf(event = 'asset_viewed') as views,
      countIf(event = 'asset_downloaded') as downloads
    FROM events
    WHERE event IN ('asset_viewed','asset_downloaded') AND ${where(addon, days)}
    GROUP BY cat ORDER BY downloads DESC LIMIT 8
  `)
}

export async function getSearchQueries(addon, days) {
  // Blender Windows mislabels search as 'asset_searched' with prop 'search_query' —
  // accept both event names and coalesce the query key so its searches still count.
  // NOTE: toUInt32OrZero is NOT a valid HogQL function — it errored the whole query
  // (search showed nothing). Use toFloatOrNull, since results_count comes as a float.
  return hql(`
    SELECT
      coalesce(nullIf(toString(properties.query), ''), toString(properties.search_query)) as q,
      count() as searches,
      countIf(toFloatOrDefault(toString(properties.results_count), 0) = 0) as zero
    FROM events WHERE event IN ('search_performed','asset_searched') AND ${where(addon, days)}
    GROUP BY q ORDER BY searches DESC LIMIT 15
  `)
}

export async function getCategoryClicks(addon, days) {
  return hql(`
    SELECT properties.category as cat, count() as n
    FROM events WHERE event = 'category_clicked' AND ${where(addon, days)}
    GROUP BY cat ORDER BY n DESC LIMIT 8
  `)
}

export async function getTopFavourites(addon, days) {
  return hql(`
    SELECT properties.asset_name as name, count() as n
    FROM events WHERE event = 'favourite_added' AND ${where(addon, days)}
      AND properties.asset_name != ''
    GROUP BY name ORDER BY n DESC LIMIT 10
  `)
}

export async function getFavouritesByCategory(addon, days) {
  return hql(`
    SELECT properties.category as cat, count() as n
    FROM events WHERE event = 'favourite_added' AND ${where(addon, days)}
    GROUP BY cat ORDER BY n DESC LIMIT 8
  `)
}

export async function getFavouriteTrend(addon, days) {
  return hql(`
    SELECT toDate(timestamp) as day, count() as n
    FROM events WHERE event = 'favourite_added' AND ${where(addon, days)}
    GROUP BY day ORDER BY day ASC
  `)
}

export async function getErrors(addon, days) {
  return hql(`
    SELECT
      event,
      coalesce(properties.reason, properties.error, 'unknown') as reason,
      count() as n
    FROM events
    WHERE event IN ('download_failed','import_failed') AND ${where(addon, days)}
    GROUP BY event, reason ORDER BY n DESC LIMIT 20
  `)
}

export async function getErrorTrend(addon, days) {
  return hql(`
    SELECT toDate(timestamp) as day, count() as n
    FROM events WHERE event IN ('download_failed','import_failed') AND ${where(addon, days)}
    GROUP BY day ORDER BY day ASC
  `)
}

export async function getErrorsByAddon(range) {
  return hql(`
    SELECT properties.addon_name as addon, count() as n
    FROM events WHERE event IN ('download_failed','import_failed')
      AND ${timeClause(range)}
    GROUP BY addon ORDER BY n DESC
  `)
}

export async function getSuccessRates(addon, days) {
  const rows = await hql(`
    SELECT
      countIf(event = 'asset_downloaded') as dl_ok,
      countIf(event = 'download_failed') as dl_fail,
      countIf(event = 'asset_imported') as imp_ok,
      countIf(event = 'import_failed') as imp_fail
    FROM events WHERE ${where(addon, days)}
  `)
  const r = rows[0] || [0,0,0,0]
  const dlOk = Number(r[0]), dlFail = Number(r[1])
  const impOk = Number(r[2]), impFail = Number(r[3])
  return {
    download: dlOk + dlFail > 0 ? ((dlOk / (dlOk + dlFail)) * 100).toFixed(1) : '100.0',
    import:   impOk + impFail > 0 ? ((impOk / (impOk + impFail)) * 100).toFixed(1) : '100.0',
  }
}

export async function getNewInstalls(addon, days) {
  return hql(`
    SELECT toStartOfWeek(timestamp) as week, count() as n
    FROM events WHERE event = 'addon_installed' AND ${where(addon, days)}
    GROUP BY week ORDER BY week ASC
  `)
}
