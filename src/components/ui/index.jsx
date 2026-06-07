import { TrendingUp, TrendingDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

function useCountUp(target, ms = 700) {
  const [v, setV] = useState(0)
  const raf = useRef()
  useEffect(() => {
    const n = parseFloat(target) || 0
    let start = null
    const step = ts => {
      if (!start) start = ts
      const p = Math.min((ts - start) / ms, 1)
      const e = 1 - Math.pow(1 - p, 3)
      setV(n * e)
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target])
  return v
}

export function KPICard({ label, value, trend, trendDir, icon: Icon, iconBg, iconColor, sparkData, format = 'number', delay = 0 }) {
  const animated = useCountUp(parseFloat(value) || 0)
  let displayed
  if (format === 'decimal') displayed = animated.toFixed(1)
  else if (format === 'percent') displayed = `${animated.toFixed(1)}%`
  else displayed = Math.round(animated).toLocaleString()

  return (
    <div className="kpi-card ani-up" style={{ animationDelay: `${delay}s` }}>
      <div className="kpi-icon" style={{ background: iconBg }}>
        {Icon && <Icon size={17} color={iconColor} />}
      </div>
      {sparkData?.length > 1 && (
        <div className="kpi-spark" style={{ marginBottom: 8 }}>
          {sparkData.map((v, i) => {
            const max = Math.max(...sparkData, 1)
            return <div key={i} className="ks" style={{ height: `${(v / max) * 100}%`, background: iconColor, opacity: .8 }} />
          })}
        </div>
      )}
      <div className="kpi-val ani-count" style={{ color: trendDir === 'down' ? 'var(--red)' : 'var(--text-1)' }}>{displayed}</div>
      <div className="kpi-label">{label}</div>
      {trend && (
        <div className={`kpi-trend ${trendDir === 'up' ? 'trend-up' : trendDir === 'down' ? 'trend-dn' : 'trend-nu'}`}>
          {trendDir === 'up' ? <TrendingUp size={11} /> : trendDir === 'down' ? <TrendingDown size={11} /> : null}
          {trend}
        </div>
      )}
    </div>
  )
}

export function SectionHeader({ title, subtitle }) {
  return (
    <div className="sec-header">
      <span className="sec-label">{title}</span>
      <div className="sec-line" />
      {subtitle && <span style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{subtitle}</span>}
    </div>
  )
}

export function CardTitle({ children, badge }) {
  return (
    <div className="card-title">
      {children}
      {badge && <span className="badge-sm">{badge}</span>}
    </div>
  )
}

export function SkeletonCard({ h = 200 }) {
  return <div className="card"><div className="skeleton" style={{ height: h }} /></div>
}

export function HBar({ data = [], colorKey = '#6366f1', showAll = false }) {
  if (!data.length) return <div style={{ color: 'var(--text-3)', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>No data</div>
  const items = showAll ? data : data.slice(0, 8)
  const max = Math.max(...items.map(d => Number(d.n || d.value || 0)), 1)
  return (
    <div>
      {items.map((d, i) => {
        const val = Number(d.n || d.value || 0)
        const pct = (val / max) * 100
        const label = d.name || d.cat || d.sub || d.fmt || d.res || d.addon || d.q || '—'
        return (
          <div key={i} className="hbar-row">
            <div className="hbar-lbl" title={label}>{label}</div>
            <div className="hbar-track">
              <div className="hbar-fill ani-bar" style={{ width: `${pct}%`, background: colorKey, animationDelay: `${i * 0.05}s` }} />
            </div>
            <div className="hbar-val">{val.toLocaleString()}</div>
          </div>
        )
      })}
    </div>
  )
}

// Vertical, aligned percentage breakdown — one row per format/resolution:
//   MP4 ········ 49%
//   MOV ········ 51%
// data: [{ label, n }]. Percentages = count / total (accurate to the event data).
export function PctList({ data = [] }) {
  const items = (data || []).filter(d => Number(d.n) > 0)
  if (!items.length) return <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
  const total = items.reduce((s, d) => s + Number(d.n), 0) || 1
  const shown = items.slice(0, 3)
  const extra = items.length - shown.length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {shown.map((d, i) => {
        const pct = (Number(d.n) / total) * 100
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11, lineHeight: 1.25, whiteSpace: 'nowrap' }} title={`${Number(d.n).toLocaleString()} downloads`}>
            <span style={{ color: 'var(--text-1)', fontWeight: 500, minWidth: 46, display: 'inline-block' }}>{String(d.label || '—').toUpperCase()}</span>
            <span style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{pct.toFixed(0)}%</span>
          </div>
        )
      })}
      {extra > 0 && <div style={{ fontSize: 9, color: 'var(--text-3)' }}>+{extra} more</div>}
    </div>
  )
}

export function FunnelViz({ data = [] }) {
  if (!data.length) return null
  const max = data[0]?.value || 1
  const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444']
  return (
    <div>
      {data.map((step, i) => {
        const pct  = max > 0 ? (step.value / max) * 100 : 0
        const drop = i > 0 && data[i-1].value > 0
          ? `-${(((data[i-1].value - step.value) / data[i-1].value) * 100).toFixed(0)}%`
          : null
        return (
          <div key={step.name}>
            <div className="funnel-step">
              <div className="f-label">{step.name}</div>
              <div className="f-track">
                <div className="f-bar" style={{ width: `${Math.max(pct, 8)}%`, background: colors[i] }}>
                  <span>{step.value.toLocaleString()}</span>
                </div>
              </div>
              <div className="f-drop">{drop || '—'}</div>
            </div>
            {i < data.length - 1 && <div style={{ height: 6, marginLeft: 76, paddingLeft: 8 }}><div style={{ width: 1, height: 6, background: 'var(--border)' }} /></div>}
          </div>
        )
      })}
    </div>
  )
}
