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
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
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

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #08080c 0%, #0c0c14 100%)', color: '#e4e4e7', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              ⚡🐦 ConvoAI
            </h1>
            <span style={{ padding: '4px 12px', borderRadius: 20, background: '#10b98120', color: '#10b981', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: 'pulse 2s infinite' }} />
              Live
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#52525b' }}>
            Updated {lastUpdate || '...'}
          </div>
        </div>

        {/* ── Metric Cards ──────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'Total Installs', value: fmt(installs), sub: `+${todayCount('install')} today`, color: '#60a5fa' },
            { label: 'Completion Rate', value: `${completionRate}%`, sub: `${fmt(completed)} completed`, color: '#10b981' },
            { label: 'Active Today', value: fmt(todayCount('install') + todayCount('qs_start') + todayCount('agent_start') + todayCount('agent_join')), sub: 'installs + starts + joins', color: '#a78bfa' },
            { label: 'Top Error', value: topError?.[0] ?? 'None', sub: topError ? `${topError[1]} occurrences` : 'No errors', color: topError ? '#ef4444' : '#52525b' },
          ].map((card, i) => (
            <div key={i} style={{
              background: '#111118',
              border: '1px solid #1e1e2e',
              borderRadius: 12,
              padding: '20px 24px',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${card.color}, transparent)` }} />
              <div style={{ fontSize: 11, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{card.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fafafa', marginBottom: 4 }}>{card.value}</div>
              <div style={{ fontSize: 12, color: '#52525b' }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Main Grid ─────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, marginBottom: 32 }}>

          {/* ── Funnel ────────────────────────────────────────── */}
          <div style={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 12, padding: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px', color: '#fafafa' }}>Quickstart Funnel</h2>
            <p style={{ fontSize: 13, color: '#52525b', margin: '0 0 24px' }}>User progression through the quickstart flow</p>

            {FUNNEL.map((step, i) => {
              const count = t[step.key] ?? 0
              const prev = i > 0 ? (t[FUNNEL[i - 1].key] ?? 0) : 0
              const rate = i > 0 ? pct(count, prev) : ''
              const barWidth = maxFunnel > 0 ? Math.max((count / maxFunnel) * 100, count > 0 ? 3 : 0.5) : 0.5
              const barColor = i === FUNNEL.length - 1
                ? '#10b981'
                : i < 3 ? '#60a5fa' : i < 6 ? '#818cf8' : '#a78bfa'

              return (
                <div key={step.key} style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ width: 28, fontSize: 16, textAlign: 'center', flexShrink: 0 }}>{step.icon}</div>
                  <div style={{ width: 80, fontSize: 13, color: '#a1a1aa', flexShrink: 0 }}>{step.label}</div>
                  <div style={{ width: 40, fontSize: 11, color: i > 0 && count < prev * 0.7 ? '#ef4444' : '#52525b', textAlign: 'right', flexShrink: 0 }}>
                    {rate}
                  </div>
                  <div style={{ flex: 1, margin: '0 12px', height: 20, background: '#1a1a24', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: `${barWidth}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${barColor}, ${barColor}80)`,
                      borderRadius: 4,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <div style={{ width: 48, textAlign: 'right', fontSize: 14, fontWeight: 600, color: '#fafafa', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(count)}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Right Column ──────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Agent Events */}
            <div style={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 12, padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#fafafa', margin: '0 0 16px' }}>Agent Events</h3>
              {['agent_start', 'agent_join', 'agent_stop'].map(key => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#a1a1aa' }}>{key.replace('agent_', '').replace(/^./, c => c.toUpperCase())}</div>
                    <div style={{ fontSize: 11, color: '#3f3f46' }}>+{todayCount(key)} today</div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#fafafa', fontVariantNumeric: 'tabular-nums' }}>{fmt(t[key])}</div>
                </div>
              ))}
            </div>

            {/* Errors */}
            <div style={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 12, padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#fafafa', margin: '0 0 16px' }}>Errors</h3>
              {Object.keys(data?.errors ?? {}).length === 0
                ? <div style={{ fontSize: 13, color: '#3f3f46' }}>No errors recorded ✨</div>
                : Object.entries(data!.errors).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([type, count]) => (
                  <div key={type} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: '#ef4444', fontFamily: 'monospace' }}>{type}</div>
                    <div style={{ fontSize: 12, color: '#71717a' }}>{count}</div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>

        {/* ── Timing Section ────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>

          {/* Step Timing */}
          <div style={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 12, padding: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px', color: '#fafafa' }}>⏱ Step Timing</h2>
            <p style={{ fontSize: 13, color: '#52525b', margin: '0 0 20px' }}>Average time between each step</p>

            {(!timing?.stepAverages || timing.stepAverages.length === 0)
              ? <div style={{ fontSize: 13, color: '#3f3f46', textAlign: 'center', padding: 32 }}>Waiting for session data...</div>
              : timing.stepAverages.map((s, i) => {
                const barW = Math.min((s.avgSeconds / 120) * 100, 100) // 2 min = full bar
                const barColor = s.avgSeconds < 15 ? '#10b981' : s.avgSeconds < 60 ? '#f59e0b' : '#ef4444'
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ fontSize: 12, color: '#a1a1aa' }}>{s.step}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: barColor, fontVariantNumeric: 'tabular-nums' }}>
                        avg {fmtTime(s.avgSeconds)} · med {fmtTime(s.medianSeconds)} · n={s.count}
                      </div>
                    </div>
                    <div style={{ height: 6, background: '#1a1a24', borderRadius: 3 }}>
                      <div style={{ width: `${barW}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                )
              })
            }
          </div>

          {/* Recent Sessions */}
          <div style={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 12, padding: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px', color: '#fafafa' }}>👤 Recent Sessions</h2>
            <p style={{ fontSize: 13, color: '#52525b', margin: '0 0 20px' }}>
              {timing?.sessionsTracked ?? 0} sessions tracked
            </p>

            {(!timing?.recentSessions || timing.recentSessions.length === 0)
              ? <div style={{ fontSize: 13, color: '#3f3f46', textAlign: 'center', padding: 32 }}>Waiting for sessions...</div>
              : (
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {timing.recentSessions.map((s, i) => {
                    const completed = s.reachedStep === 'qs_step6'
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a1a24' }}>
                        <div>
                          <div style={{ fontSize: 13, color: '#a1a1aa' }}>
                            <span style={{ fontFamily: 'monospace', color: '#71717a' }}>{s.session_id}</span>
                            {' → '}
                            <span style={{ color: completed ? '#10b981' : '#f59e0b' }}>
                              {s.reachedStep.replace('qs_', '').replace('step', 'S')}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: '#3f3f46' }}>{s.stepsCompleted} steps</div>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: s.totalSeconds < 120 ? '#10b981' : s.totalSeconds < 300 ? '#f59e0b' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtTime(s.totalSeconds)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            }
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', padding: '24px 0 48px', fontSize: 12, color: '#3f3f46' }}>
          <span>ConvoAI CLI — </span>
          <a href="https://github.com/Coowoolf/convoai-cli" style={{ color: '#60a5fa', textDecoration: 'none' }}>GitHub</a>
          <span> · </span>
          <a href="https://www.npmjs.com/package/convoai" style={{ color: '#60a5fa', textDecoration: 'none' }}>npm</a>
          <span> · </span>
          <span>curl -fsSL https://convobench.org/install.sh | bash</span>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
