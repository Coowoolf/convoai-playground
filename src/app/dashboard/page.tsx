'use client'

import { useEffect, useState, useCallback } from 'react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface StepTiming {
  step: string
  avgSeconds: number
  medianSeconds: number
  count: number
}

interface SessionSummary {
  session_id: string
  totalSeconds: number
  stepsCompleted: number
  reachedStep: string
}

interface TelemetryData {
  total: Record<string, number>
  daily: Record<string, number>
  errors: Record<string, number>
  timing: {
    stepAverages: StepTiming[]
    recentSessions: SessionSummary[]
    sessionsTracked: number
  }
  since: string
}

// ─── Funnel definition ──────────────────────────────────────────────────────

const FUNNEL = [
  { key: 'install', label: 'Install', icon: '📦' },
  { key: 'qs_start', label: 'Quickstart', icon: '🚀' },
  { key: 'qs_step1', label: 'Credentials', icon: '🔑' },
  { key: 'qs_step2', label: 'LLM', icon: '🧠' },
  { key: 'qs_step3', label: 'TTS', icon: '🔊' },
  { key: 'qs_step4', label: 'ASR', icon: '🎙' },
  { key: 'qs_step5_agent', label: 'Agent Live', icon: '⚡' },
  { key: 'qs_step5_voice', label: 'Voice Chat', icon: '🗣' },
  { key: 'qs_step6', label: 'Completed', icon: '✅' },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | undefined): string {
  return (n ?? 0).toLocaleString()
}

function pct(a: number, b: number): string {
  if (!b) return '—'
  return Math.round((a / b) * 100) + '%'
}

function fmtTime(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData] = useState<TelemetryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/t', { cache: 'no-store' })
      const json = await res.json()
      setData(json)
      setLastUpdate(new Date().toLocaleTimeString())
    } catch { /* */ } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 15000)
    return () => clearInterval(timer)
  }, [fetchData])

  const t = data?.total ?? {}
  const d = data?.daily ?? {}
  const today = new Date().toISOString().split('T')[0]
  const todayKey = (k: string) => `${k}:${today}`
  const todayCount = (k: string) => d[todayKey(k)] ?? 0
  const installs = t.install ?? 0
  const completed = t.qs_step6 ?? 0
  const completionRate = installs > 0 ? ((completed / installs) * 100).toFixed(1) : '0.0'
  const topError = Object.entries(data?.errors ?? {}).sort((a, b) => b[1] - a[1])[0]
  const maxFunnel = Math.max(...FUNNEL.map(s => t[s.key] ?? 0), 1)
  const timing = data?.timing

  if (loading) {
    return (
      <div className="page"><div className="container" style={{ textAlign: 'center', paddingTop: 120 }}>
        <div style={{ fontSize: 32 }}>⚡🐦</div>
        <div style={{ color: '#52525b', marginTop: 12 }}>Loading...</div>
      </div></div>
    )
  }

  return (
    <div className="page">
      <div className="container">

        {/* Header */}
        <div className="header">
          <div className="header-left">
            <h1 className="title">⚡🐦 ConvoAI</h1>
            <span className="live-badge"><span className="live-dot" />Live</span>
          </div>
          <div className="updated">Updated {lastUpdate || '...'}</div>
        </div>

        {/* Metric Cards */}
        <div className="cards">
          {[
            { label: 'Total Installs', value: fmt(installs), sub: `+${todayCount('install')} today`, color: '#60a5fa' },
            { label: 'Completion Rate', value: `${completionRate}%`, sub: `${fmt(completed)} completed`, color: '#10b981' },
            { label: 'Active Today', value: fmt(todayCount('install') + todayCount('qs_start') + todayCount('agent_start') + todayCount('agent_join')), sub: 'installs + starts', color: '#a78bfa' },
            { label: 'Top Error', value: topError?.[0]?.slice(0, 16) ?? 'None', sub: topError ? `${topError[1]}x` : 'No errors', color: topError ? '#ef4444' : '#52525b' },
          ].map((card, i) => (
            <div key={i} className="card">
              <div className="card-accent" style={{ background: `linear-gradient(90deg, ${card.color}, transparent)` }} />
              <div className="card-label">{card.label}</div>
              <div className="card-value">{card.value}</div>
              <div className="card-sub">{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Funnel + Sidebar */}
        <div className="main-grid">
          <div className="panel">
            <h2 className="panel-title">Quickstart Funnel</h2>
            <p className="panel-sub">User progression through the quickstart flow</p>
            {FUNNEL.map((step, i) => {
              const count = t[step.key] ?? 0
              const prev = i > 0 ? (t[FUNNEL[i - 1].key] ?? 0) : 0
              const rate = i > 0 ? pct(count, prev) : ''
              const barWidth = maxFunnel > 0 ? Math.max((count / maxFunnel) * 100, count > 0 ? 3 : 0.5) : 0.5
              const barColor = i === FUNNEL.length - 1 ? '#10b981' : i < 3 ? '#60a5fa' : i < 6 ? '#818cf8' : '#a78bfa'
              return (
                <div key={step.key} className="funnel-row">
                  <div className="funnel-icon">{step.icon}</div>
                  <div className="funnel-label">{step.label}</div>
                  <div className="funnel-rate" style={{ color: i > 0 && count < prev * 0.7 ? '#ef4444' : '#52525b' }}>{rate}</div>
                  <div className="funnel-bar-bg">
                    <div className="funnel-bar" style={{ width: `${barWidth}%`, background: `linear-gradient(90deg, ${barColor}, ${barColor}80)` }} />
                  </div>
                  <div className="funnel-count">{fmt(count)}</div>
                </div>
              )
            })}
          </div>

          <div className="sidebar">
            {/* Agent Events */}
            <div className="panel">
              <h3 className="panel-title-sm">Agent Events</h3>
              {['agent_start', 'agent_join', 'agent_stop'].map(key => (
                <div key={key} className="stat-row">
                  <div>
                    <div className="stat-label">{key.replace('agent_', '').replace(/^./, c => c.toUpperCase())}</div>
                    <div className="stat-sub">+{todayCount(key)} today</div>
                  </div>
                  <div className="stat-value">{fmt(t[key])}</div>
                </div>
              ))}
            </div>

            {/* Errors */}
            <div className="panel">
              <h3 className="panel-title-sm">Errors</h3>
              {Object.keys(data?.errors ?? {}).length === 0
                ? <div className="empty">No errors ✨</div>
                : Object.entries(data!.errors).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([type, count]) => (
                  <div key={type} className="error-row">
                    <div className="error-type">{type}</div>
                    <div className="error-count">{count}</div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>

        {/* Timing */}
        <div className="timing-grid">
          <div className="panel">
            <h2 className="panel-title">⏱ Step Timing</h2>
            <p className="panel-sub">Average time between each step</p>
            {(!timing?.stepAverages?.length)
              ? <div className="empty" style={{ padding: 32 }}>Waiting for session data...</div>
              : timing.stepAverages.map((s, i) => {
                const barW = Math.min((s.avgSeconds / 120) * 100, 100)
                const barColor = s.avgSeconds < 15 ? '#10b981' : s.avgSeconds < 60 ? '#f59e0b' : '#ef4444'
                return (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div className="timing-header">
                      <div className="timing-label">{s.step}</div>
                      <div className="timing-value" style={{ color: barColor }}>
                        {fmtTime(s.avgSeconds)} avg
                      </div>
                    </div>
                    <div className="timing-bar-bg">
                      <div className="timing-bar" style={{ width: `${barW}%`, background: barColor }} />
                    </div>
                  </div>
                )
              })
            }
          </div>

          <div className="panel">
            <h2 className="panel-title">👤 Sessions</h2>
            <p className="panel-sub">{timing?.sessionsTracked ?? 0} tracked</p>
            {(!timing?.recentSessions?.length)
              ? <div className="empty" style={{ padding: 32 }}>Waiting for sessions...</div>
              : <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {timing.recentSessions.map((s, i) => {
                  const done = s.reachedStep === 'qs_step6'
                  return (
                    <div key={i} className="session-row">
                      <div>
                        <span className="session-id">{s.session_id}</span>
                        <span className="session-arrow"> → </span>
                        <span style={{ color: done ? '#10b981' : '#f59e0b' }}>
                          {s.reachedStep.replace('qs_', '').replace('step', 'S')}
                        </span>
                        <div className="stat-sub">{s.stepsCompleted} steps</div>
                      </div>
                      <div className="session-time" style={{ color: s.totalSeconds < 120 ? '#10b981' : s.totalSeconds < 300 ? '#f59e0b' : '#ef4444' }}>
                        {fmtTime(s.totalSeconds)}
                      </div>
                    </div>
                  )
                })}
              </div>
            }
          </div>
        </div>

        {/* Footer */}
        <div className="footer">
          ConvoAI CLI —{' '}
          <a href="https://github.com/Coowoolf/convoai-cli">GitHub</a> ·{' '}
          <a href="https://www.npmjs.com/package/convoai">npm</a> ·{' '}
          <span className="footer-cmd">curl -fsSL https://convobench.org/install.sh | bash</span>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }

        .page { min-height: 100vh; background: linear-gradient(180deg, #08080c, #0c0c14); color: #e4e4e7; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .container { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }

        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
        .header-left { display: flex; align-items: center; gap: 12px; }
        .title { font-size: 24px; font-weight: 700; margin: 0; background: linear-gradient(135deg, #60a5fa, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .live-badge { padding: 3px 10px; border-radius: 20px; background: #10b98120; color: #10b981; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 5px; }
        .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; display: inline-block; animation: pulse 2s infinite; }
        .updated { font-size: 12px; color: #52525b; }

        .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
        .card { background: #111118; border: 1px solid #1e1e2e; border-radius: 12px; padding: 16px 20px; position: relative; overflow: hidden; }
        .card-accent { position: absolute; top: 0; left: 0; right: 0; height: 2px; }
        .card-label { font-size: 10px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
        .card-value { font-size: 24px; font-weight: 700; color: #fafafa; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .card-sub { font-size: 11px; color: #52525b; }

        .main-grid { display: grid; grid-template-columns: 1fr 320px; gap: 16px; margin-bottom: 24px; }
        .sidebar { display: flex; flex-direction: column; gap: 16px; }

        .panel { background: #111118; border: 1px solid #1e1e2e; border-radius: 12px; padding: 20px; }
        .panel-title { font-size: 15px; font-weight: 600; margin: 0 0 4px; color: #fafafa; }
        .panel-title-sm { font-size: 13px; font-weight: 600; color: #fafafa; margin: 0 0 14px; }
        .panel-sub { font-size: 12px; color: #52525b; margin: 0 0 20px; }

        .funnel-row { display: flex; align-items: center; margin-bottom: 10px; }
        .funnel-icon { width: 24px; font-size: 14px; text-align: center; flex-shrink: 0; }
        .funnel-label { width: 72px; font-size: 12px; color: #a1a1aa; flex-shrink: 0; }
        .funnel-rate { width: 36px; font-size: 10px; text-align: right; flex-shrink: 0; }
        .funnel-bar-bg { flex: 1; margin: 0 8px; height: 18px; background: #1a1a24; border-radius: 4px; overflow: hidden; }
        .funnel-bar { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
        .funnel-count { width: 40px; text-align: right; font-size: 13px; font-weight: 600; color: #fafafa; font-variant-numeric: tabular-nums; }

        .stat-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .stat-label { font-size: 12px; color: #a1a1aa; }
        .stat-sub { font-size: 10px; color: #3f3f46; }
        .stat-value { font-size: 18px; font-weight: 700; color: #fafafa; font-variant-numeric: tabular-nums; }

        .empty { font-size: 12px; color: #3f3f46; text-align: center; }
        .error-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
        .error-type { font-size: 11px; color: #ef4444; font-family: monospace; overflow: hidden; text-overflow: ellipsis; }
        .error-count { font-size: 11px; color: #71717a; flex-shrink: 0; margin-left: 8px; }

        .timing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .timing-header { display: flex; justify-content: space-between; margin-bottom: 4px; flex-wrap: wrap; gap: 4px; }
        .timing-label { font-size: 11px; color: #a1a1aa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
        .timing-value { font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; flex-shrink: 0; }
        .timing-bar-bg { height: 5px; background: #1a1a24; border-radius: 3px; }
        .timing-bar { height: 100%; border-radius: 3px; transition: width 0.6s ease; }

        .session-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #1a1a24; }
        .session-id { font-family: monospace; color: #71717a; font-size: 12px; }
        .session-arrow { color: #3f3f46; font-size: 12px; }
        .session-time { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; flex-shrink: 0; }

        .footer { text-align: center; padding: 20px 0 40px; font-size: 11px; color: #3f3f46; }
        .footer a { color: #60a5fa; text-decoration: none; }
        .footer-cmd { display: none; }

        /* ── Mobile ──────────────────────────────── */
        @media (max-width: 768px) {
          .container { padding: 16px 12px; }
          .title { font-size: 20px; }
          .cards { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .card { padding: 12px 14px; }
          .card-value { font-size: 20px; }
          .main-grid { grid-template-columns: 1fr; }
          .timing-grid { grid-template-columns: 1fr; }
          .funnel-label { width: 60px; font-size: 11px; }
          .funnel-rate { width: 30px; font-size: 9px; }
          .funnel-icon { width: 20px; font-size: 12px; }
          .funnel-count { width: 32px; font-size: 12px; }
          .funnel-bar-bg { height: 14px; }
        }

        @media (max-width: 480px) {
          .cards { grid-template-columns: 1fr 1fr; }
          .funnel-rate { display: none; }
          .funnel-label { width: 56px; font-size: 10px; }
          .timing-label { font-size: 10px; }
          .timing-value { font-size: 10px; }
        }
      `}</style>
    </div>
  )
}
