# CGHEVEN Analytics Dashboard

Dark analytics dashboard — exact copy of design mockup. React + Vite + Chart.js + PostHog HogQL API.

## Setup in 3 steps

### 1. Install
```bash
npm install
```

### 2. Configure .env
```env
VITE_POSTHOG_HOST=https://us.posthog.com
VITE_POSTHOG_PROJECT_ID=378655
VITE_POSTHOG_API_KEY=phx_your_personal_api_key_here
VITE_DASHBOARD_PASSWORD=your_password_here
```

PostHog API key scopes needed: `query:read`

### 3. Run
```bash
npm run dev
# open http://localhost:3000
```

## Deploy to Vercel (free)

```bash
npm install -g vercel
vercel
```

Then in Vercel dashboard → Settings → Environment Variables — add all 4 vars from .env.

## Login
Password is set in `VITE_DASHBOARD_PASSWORD` env var. Default: `cgheven2024`

## Dashboard Sections
- Overview — KPIs + Top Downloaded Assets table
- Category — Downloads by category + subcategory donut + addon comparison
- Downloads — Trend + format + resolution charts
- Users — DAU + most active day + license trend
- Conversion — Full funnel + category CVR table
- Search — Top queries + zero-result gaps + category clicks
- Favourites — Top assets + category donut + daily trend
- Errors — System health + fail reasons + error trend

## Events Used (all 12)
- session_started → DAU, WAU, most active day, addon comparison
- addon_installed → new installs trend
- license_activated / license_expired → license trend
- search_performed → search queries, zero results
- category_clicked → category browse heatmap
- asset_viewed → conversion funnel (views)
- asset_downloaded → downloads by category/format/resolution/asset
- asset_imported → conversion funnel (imports), success rate
- import_failed → import error reasons
- download_failed → download error reasons, error rate
- favourite_added → top favourites, favourite by category, trend
