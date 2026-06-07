import { useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

const DARK_DEFAULTS = {
  color: '#475569',
  borderColor: '#1e2236',
  backgroundColor: 'rgba(99,102,241,.12)',
}

const PAL = ['#6366f1','#38bdf8','#a78bfa','#22c55e','#f59e0b','#ef4444','#84cc16','#c084fc','#f97316','#14b8a6']

function base(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 700, easing: 'easeOutQuart' },
    interaction: { mode: 'index', intersect: false },  // hover anywhere on the x-axis
    plugins: { legend: { display: false }, tooltip: {
      backgroundColor: '#12151f', titleColor: '#94a3b8', bodyColor: '#f1f5f9',
      borderColor: '#1e2236', borderWidth: 1, cornerRadius: 8, padding: 10,
      titleFont: { size: 11, family: 'DM Sans' }, bodyFont: { size: 12, family: 'DM Sans', weight: '600' },
      displayColors: true, boxWidth: 8, boxHeight: 8, boxPadding: 4, usePointStyle: true,
      callbacks: {
        label: ctx => {
          const v = ctx.parsed.y ?? ctx.parsed.x ?? ctx.parsed ?? 0
          return ` ${ctx.dataset.label || 'Value'}: ${Number(v).toLocaleString()}`
        },
      },
    }},
    scales: {
      x: { ticks: { color: '#475569', font: { size: 9, family: 'DM Sans' } }, grid: { color: '#1e2236' }, border: { display: false } },
      y: { ticks: { color: '#475569', font: { size: 9, family: 'DM Sans' } }, grid: { color: '#1e2236' }, border: { display: false } },
    },
    ...extra,
  }
}

export function AreaChart({ data = [], color = '#6366f1', label = '', height = 180, yLabel = 'n' }) {
  const ref = useRef()
  const chart = useRef()
  useEffect(() => {
    if (!ref.current) return
    chart.current?.destroy()
    chart.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels: data.map(d => d.day?.slice(5) || d.day || ''),
        datasets: [{ label, data: data.map(d => d[yLabel] || d.value || d.n || 0), borderColor: color, borderWidth: 2, backgroundColor: `${color}18`, fill: true, tension: .4, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: color, pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2, pointHitRadius: 30 }]
      },
      options: base(),
    })
    return () => chart.current?.destroy()
  }, [data, color])
  return <div style={{ position: 'relative', height }}><canvas ref={ref} aria-label={label} /></div>
}

export function BarChart({ data = [], color = '#6366f1', label = '', height = 180, xKey = 'label', yKey = 'n', vertical = true }) {
  const ref = useRef()
  const chart = useRef()
  useEffect(() => {
    if (!ref.current) return
    chart.current?.destroy()
    const labels = data.map(d => d[xKey] || d.dow || d.label || d.name || '')
    const values = data.map(d => Number(d[yKey] || d.n || d.value || 0))
    const colors = data.map((_, i) => {
      if (xKey === 'dow') {
        const max = Math.max(...values, 1)
        return values[i] === max ? '#6366f1' : '#1e2236'
      }
      return PAL[i % PAL.length]
    })
    chart.current = new Chart(ref.current, {
      type: 'bar',
      data: { labels, datasets: [{ label, data: values, backgroundColor: colors, borderRadius: 5, borderSkipped: false }] },
      options: {
        ...base(),
        indexAxis: vertical ? 'x' : 'y',
      },
    })
    return () => chart.current?.destroy()
  }, [data, color])
  return <div style={{ position: 'relative', height }}><canvas ref={ref} aria-label={label} /></div>
}

export function DonutChart({ data = [], height = 170, cutout = '68%' }) {
  const ref = useRef()
  const chart = useRef()
  useEffect(() => {
    if (!ref.current) return
    chart.current?.destroy()
    chart.current = new Chart(ref.current, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.name || d.cat || d.fmt || d.res || d.sub || ''),
        datasets: [{ data: data.map(d => Number(d.n || d.value || 0)), backgroundColor: PAL.slice(0, data.length), borderWidth: 0, hoverOffset: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout,
        animation: { duration: 700 },
        plugins: { legend: { display: false }, tooltip: {
          backgroundColor: '#12151f', titleColor: '#94a3b8', bodyColor: '#f1f5f9',
          borderColor: '#1e2236', borderWidth: 1, cornerRadius: 8, padding: 10,
        }},
      },
    })
    return () => chart.current?.destroy()
  }, [data])

  const total = data.reduce((s, d) => s + Number(d.n || d.value || 0), 0)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', height, width: height, flexShrink: 0 }}>
        <canvas ref={ref} aria-label="Donut chart" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
        {data.slice(0, 7).map((d, i) => {
          const val = Number(d.n || d.value || 0)
          const pct = total > 0 ? ((val / total) * 100).toFixed(0) : 0
          const label = d.name || d.cat || d.fmt || d.res || d.sub || '—'
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-2)' }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: PAL[i % PAL.length], flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              <span style={{ fontWeight: 500, color: 'var(--text-1)' }}>{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function MultiLineChart({ datasets = [], labels = [], height = 180 }) {
  const ref = useRef()
  const chart = useRef()
  useEffect(() => {
    if (!ref.current) return
    chart.current?.destroy()
    chart.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map((ds, i) => ({
          label: ds.label, data: ds.data,
          borderColor: PAL[i % PAL.length], borderWidth: 2,
          backgroundColor: 'transparent', tension: .4, pointRadius: 0,
        }))
      },
      options: base(),
    })
    return () => chart.current?.destroy()
  }, [datasets, labels])
  return <div style={{ position: 'relative', height }}><canvas ref={ref} aria-label="Multi-line chart" /></div>
}
