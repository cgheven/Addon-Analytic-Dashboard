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
// ~30 queries per load. Firing them all at once triggers HTTP 429. Cap how many run
// in parallel (8 is well under the limit thanks to the 429 backoff below, and roughly
// halves wall-clock load time vs the old cap of 4).
const MAX_CONCURRENT = 8
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

// Error tracking so the UI can show a real error popup instead of silently
// rendering empty/zero data (which looks like fake/"no data").
let _errorCount = 0
let _lastError = null
export const getQueryErrorStats = () => ({ count: _errorCount, last: _lastError })

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
    // Ultimately failed — record it (the dashboard reads this after each load).
    const status = e.response?.status || 0
    _errorCount++
    _lastError = { status, rateLimited: status === 429, message: e.message }
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

// Current window + the equal-length window immediately before it (for real
// "vs previous period" deltas) + a union window covering both (for the WHERE).
function dayWindows(range) {
  if (range && range.start && range.end) {
    const start = new Date(`${range.start}T00:00:00`)
    const end   = new Date(`${range.end}T23:59:59`)
    const lenMs = Math.max(86400000, end - start)
    const prevStart = new Date(start.getTime() - lenMs).toISOString().slice(0, 10)
    return {
      cur:   `timestamp >= toDateTime('${range.start} 00:00:00') AND timestamp <= toDateTime('${range.end} 23:59:59')`,
      prev:  `timestamp >= toDateTime('${prevStart} 00:00:00') AND timestamp < toDateTime('${range.start} 00:00:00')`,
      union: `timestamp >= toDateTime('${prevStart} 00:00:00') AND timestamp <= toDateTime('${range.end} 23:59:59')`,
    }
  }
  const d = (range && typeof range === 'object' ? range.days : range) || 1
  return {
    cur:   `timestamp >= now() - interval ${d} day`,
    prev:  `timestamp >= now() - interval ${2 * d} day AND timestamp < now() - interval ${d} day`,
    union: `timestamp >= now() - interval ${2 * d} day`,
  }
}

// Real % change vs the previous equal-length period (null when there's no baseline).
function delta(cur, prev) {
  if (prev === 0 && cur === 0) return null
  if (prev === 0) return { label: 'new', dir: 'up' }
  const p = Math.round(((cur - prev) / prev) * 100)
  return { label: `${p >= 0 ? '+' : ''}${p}% vs prev period`, dir: p > 0 ? 'up' : p < 0 ? 'down' : 'nu' }
}

export async function getOverviewKPIs(addon, range) {
  const w = dayWindows(range)
  const rows = await hql(`
    SELECT
      uniqIf(distinct_id, event = 'session_started' AND ${w.cur}) as wau,
      uniqIf(distinct_id, event = 'session_started' AND ${w.prev}) as wau_prev,
      countIf(event = 'asset_downloaded' AND ${w.cur}) as downloads,
      countIf(event = 'asset_downloaded' AND ${w.prev}) as downloads_prev,
      countIf(event = 'favourite_added' AND ${w.cur}) as favourites,
      countIf(event = 'favourite_added' AND ${w.prev}) as favourites_prev,
      countIf(event = 'addon_installed' AND ${w.cur}) as installs,
      countIf(event = 'addon_installed' AND ${w.prev}) as installs_prev,
      countIf(event IN ('download_failed','import_failed') AND ${w.cur}) as errors,
      countIf(event IN ('asset_downloaded','asset_imported') AND ${w.cur}) as total_actions,
      countIf(event = 'addon_opened' AND ${w.cur}) as opens,
      countIf(event = 'addon_opened' AND ${w.prev}) as opens_prev
    FROM events WHERE properties.addon_name = '${addon}' AND ${w.union}
  `)
  const r = rows[0] || []
  const n = i => Number(r[i] || 0)
  const wau = n(0), downloads = n(2), favourites = n(4), installs = n(6), errors = n(8), actions = n(9), opens = n(10)
  return {
    wau, downloads, favourites, installs, opens,
    errorRate: actions > 0 ? ((errors / actions) * 100).toFixed(1) : '0.0',
    trends: {
      wau:        delta(wau, n(1)),
      downloads:  delta(downloads, n(3)),
      favourites: delta(favourites, n(5)),
      installs:   delta(installs, n(7)),
      opens:      delta(opens, n(11)),
    },
  }
}

// Addon opens (launches) per day — every addon launch fires addon_opened, so this is the raw
// "how often is the addon opened" trend (vs DAU which counts unique users via session_started).
export async function getOpensTrend(addon, days) {
  return hql(`
    SELECT toDate(timestamp) as day, count() as n
    FROM events WHERE event = 'addon_opened' AND ${where(addon, days)}
    GROUP BY day ORDER BY day ASC
  `)
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

// Weekly account activity from the new Logto login system. The addon emits
// account_login with a boolean `register` property (true = signup, false = login).
export async function getAccountTrend(addon, days) {
  return hql(`
    SELECT
      toStartOfWeek(timestamp) as week,
      countIf(event = 'account_login' AND toString(properties.register) = 'true') as signups,
      countIf(event = 'account_login' AND toString(properties.register) != 'true') as logins
    FROM events
    WHERE event = 'account_login' AND ${where(addon, days)}
    GROUP BY week ORDER BY week ASC
  `)
}

// Latest plan per user (argMax over the most recent session/login) bucketed into
// Free / Pro / Studio / Studio Team — mirrors getVersionDistribution's per-distinct_id pattern.
// Order matters: 'Studio Team%' must be checked BEFORE 'Studio%' (it also starts with "Studio").
export async function getPlanDistribution(addon, range) {
  return hql(`
    SELECT plan, count() as users FROM (
      SELECT distinct_id, multiIf(p LIKE 'Studio Team%', 'Studio Team', p LIKE 'Studio%', 'Studio', p LIKE 'Pro%', 'Pro', 'Free') as plan FROM (
        SELECT distinct_id, argMax(toString(properties.plan), timestamp) as p
        FROM events
        WHERE event IN ('session_started','account_login') AND ${where(addon, range)}
        GROUP BY distinct_id
      )
    ) GROUP BY plan ORDER BY users DESC
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
      countIf(event = 'import_failed') as imp_fail,
      countIf(event IN ('search_performed','asset_searched')) as s_total,
      countIf(event IN ('search_performed','asset_searched') AND toFloatOrDefault(toString(properties.results_count), 0) > 0) as s_ok,
      countIf(event = 'session_started' AND toString(properties.is_premium) = 'true') as premium_sessions,
      countIf(event = 'session_started') as total_sessions
    FROM events WHERE ${where(addon, days)}
  `)
  const r = rows[0] || []
  const n = i => Number(r[i] || 0)
  // null when there's no data for that metric — the UI renders "—" instead of a fake number.
  const rate = (ok, total) => total > 0 ? ((ok / total) * 100).toFixed(1) : null
  const dlOk = n(0), dlFail = n(1), impOk = n(2), impFail = n(3)
  return {
    download: rate(dlOk, dlOk + dlFail),
    import:   rate(impOk, impOk + impFail),
    search:   rate(n(5), n(4)),            // % of searches that returned results
    premium:  rate(n(6), n(7)),            // premium sessions / total sessions
  }
}

export async function getNewInstalls(addon, days) {
  return hql(`
    SELECT toStartOfWeek(timestamp) as week, count() as n
    FROM events WHERE event = 'addon_installed' AND ${where(addon, days)}
    GROUP BY week ORDER BY week ASC
  `)
}

// ──────────────────────────────────────────────────────────────────────────
// Update / version analytics
// Events (same schema across all addons):
//   addon_opened        { version }                    — fires on every launch
//   update_prompt_shown { from_version, to_version }   — fires when update detected
//   update_completed    { old_version, new_version }   — fires when version changed
// ──────────────────────────────────────────────────────────────────────────

// Current version of every active user = the version on their LATEST launch
// (argMax over addon_opened), grouped → "who is on what version" distribution.
export async function getVersionDistribution(addon, range) {
  return hql(`
    SELECT version, count() as users FROM (
      SELECT distinct_id, argMax(toString(properties.version), timestamp) as version
      FROM events
      WHERE event = 'addon_opened' AND ${where(addon, range)}
        AND toString(properties.version) != ''
      GROUP BY distinct_id
    ) GROUP BY version ORDER BY users DESC LIMIT 25
  `)
}

// The most recently pushed update target — the latest to_version users were
// prompted with. Used as "the current release" T for adoption math.
export async function getLatestTargetVersion(addon, range) {
  const rows = await hql(`
    SELECT argMax(toString(properties.to_version), timestamp) as latest
    FROM events
    WHERE event = 'update_prompt_shown' AND ${where(addon, range)}
      AND toString(properties.to_version) != ''
  `)
  return rows[0]?.[0] || null
}

// Update adoption — of the DISTINCT users who were shown an update prompt in the
// window, how many also COMPLETED an update? Set intersection on distinct_id
// (a user can relaunch/prompt many times, so count distinct, never raw events).
export async function getUpdateAdoption(addon, range) {
  const rows = await hql(`
    SELECT count() as prompted, countIf(c > 0) as updated FROM (
      SELECT distinct_id,
        countIf(event = 'update_prompt_shown') as p,
        countIf(event = 'update_completed')    as c
      FROM events
      WHERE event IN ('update_prompt_shown','update_completed') AND ${where(addon, range)}
      GROUP BY distinct_id
      HAVING p > 0
    )
  `)
  const r = rows[0] || [0, 0]
  const prompted = Number(r[0] || 0), updated = Number(r[1] || 0)
  return {
    prompted, updated,
    notUpdated: Math.max(0, prompted - updated),
    rate: prompted > 0 ? Math.round((updated / prompted) * 100) : null,
  }
}

// Total updates completed per day — the adoption velocity line.
export async function getUpdateTrend(addon, range) {
  return hql(`
    SELECT toDate(timestamp) as day, count() as n
    FROM events WHERE event = 'update_completed' AND ${where(addon, range)}
    GROUP BY day ORDER BY day ASC
  `)
}

// Version migration matrix — from_version → to_version, distinct users who made
// that jump (the real upgrade paths users are taking).
export async function getVersionMigration(addon, range) {
  return hql(`
    SELECT toString(properties.old_version) as frm,
           toString(properties.new_version) as too,
           uniq(distinct_id) as users
    FROM events WHERE event = 'update_completed' AND ${where(addon, range)}
      AND toString(properties.new_version) != ''
    GROUP BY frm, too ORDER BY users DESC LIMIT 12
  `)
}
