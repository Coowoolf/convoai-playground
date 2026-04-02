'use client'

import { useEffect, useState, useCallback } from 'react'

// --- Types ---

interface TelemetryData {
  total: Record<string, number>
  daily: Record<string, number>
  errors: Record<string, number>
  since: string
}

// --- Funnel definition ---

const FUNNEL_STEPS = [
  { key: 'install', label: 'Install' },
  { key: 'qs_start', label: 'Quickstart Start' },
  { key: 'qs_step1', label: 'Credentials' },
  { key: 'qs_step2', label: 'LLM Setup' },
  { key: 'qs_step3', label: 'TTS Setup' },
  { key: 'qs_step4', label: 'ASR Setup' },
  { key: 'qs_step5_agent', label: 'Agent Started' },
  { key: 'qs_step5_voice', label: 'Voice Chat' },
  { key: 'qs_step6', label: 'Completed' },
]

const AGENT_EVENTS = [
  { key: 'agent_start', label: 'Agent Start' },
  { key: 'agent_join', label: 'Agent Join' },
  { key: 'agent_stop', label: 'Agent Stop' },
]

// --- Helpers ---

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0]
}

function getTodayCount(daily: Record<string, number>, event: string): number {
  return daily[`${event}:${todayKey()}`] || 0
}

// --- Component ---

export default function DashboardPage() {
  const [data, setData] = useState<TelemetryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/t')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: TelemetryData = await res.json()
      setData(json)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + 30s auto-refresh
  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30_000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Derived values
  const total = data?.total || {}
  const daily = data?.daily || {}
  const errors = data?.errors || {}

  const totalInstalls = total['install'] || 0
  const totalCompleted = total['qs_step6'] || 0
  const completionRate = totalInstalls > 0 ? ((totalCompleted / totalInstalls) * 100).toFixed(1) : '0.0'

  const todayInstalls = getTodayCount(daily, 'install')
  const todayStarts = getTodayCount(daily, 'qs_start')
  const activeToday = todayInstalls + todayStarts

  // Top error
  const sortedErrors = Object.entries(errors).sort((a, b) => b[1] - a[1])
  const topError = sortedErrors.length > 0 ? sortedErrors[0] : null

  // Max value for funnel bar scaling
  const funnelMax = Math.max(1, ...FUNNEL_STEPS.map(s => total[s.key] || 0))

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>ConvoAI Usage Dashboard</h1>
          <span style={styles.liveIndicator}>
            <span style={styles.liveDot} />
            Live
          </span>
        </div>
        <div style={styles.headerRight}>
          {lastUpdated && (
            <span style={styles.timestamp}>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <a href="/" style={styles.backLink}>Back to Playground</a>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div style={styles.errorBanner}>
          Failed to load telemetry: {error}. Retrying...
        </div>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <span style={styles.loadingText}>Loading telemetry data...</span>
        </div>
      )}

      {/* Key Metric Cards */}
      <div style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>Total Installs</div>
          <div style={styles.metricValue}>{formatNumber(totalInstalls)}</div>
          <div style={styles.metricSub}>+{todayInstalls} today</div>
        </div>
        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>Completion Rate</div>
          <div style={styles.metricValue}>{completionRate}%</div>
          <div style={styles.metricSub}>{formatNumber(totalCompleted)} completed</div>
        </div>
        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>Active Today</div>
          <div style={styles.metricValue}>{formatNumber(activeToday)}</div>
          <div style={styles.metricSub}>installs + starts</div>
        </div>
        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>Top Error</div>
          <div style={{ ...styles.metricValue, fontSize: '1.25rem', color: topError ? '#f87171' : '#6b7280' }}>
            {topError ? topError[0] : 'None'}
          </div>
          <div style={styles.metricSub}>
            {topError ? `${topError[1]} occurrences` : 'No errors recorded'}
          </div>
        </div>
      </div>

      {/* Main content: Funnel + Sidebar */}
      <div style={styles.contentGrid}>
        {/* Funnel Chart */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Quickstart Funnel</h2>
          <p style={styles.cardSubtitle}>User progression through the quickstart flow</p>
          <div style={styles.funnelContainer}>
            {FUNNEL_STEPS.map((step, i) => {
              const count = total[step.key] || 0
              const prevCount = i === 0 ? count : (total[FUNNEL_STEPS[i - 1].key] || 0)
              const conversion = prevCount > 0 ? ((count / prevCount) * 100).toFixed(0) : '---'
              const barWidth = funnelMax > 0 ? Math.max(2, (count / funnelMax) * 100) : 2

              return (
                <div key={step.key} style={styles.funnelRow}>
                  <div style={styles.funnelLabel}>
                    <span style={styles.funnelStepName}>{step.label}</span>
                    {i > 0 && (
                      <span style={{
                        ...styles.funnelConversion,
                        color: Number(conversion) >= 90 ? '#34d399'
                          : Number(conversion) >= 70 ? '#fbbf24'
                          : Number(conversion) === 0 || conversion === '---' ? '#6b7280'
                          : '#f87171',
                      }}>
                        {conversion}%
                      </span>
                    )}
                  </div>
                  <div style={styles.funnelBarTrack}>
                    <div
                      style={{
                        ...styles.funnelBar,
                        width: `${barWidth}%`,
                        background: i === 0
                          ? 'linear-gradient(90deg, #818cf8, #a78bfa)'
                          : i === FUNNEL_STEPS.length - 1
                          ? 'linear-gradient(90deg, #34d399, #6ee7b7)'
                          : 'linear-gradient(90deg, #60a5fa, #93c5fd)',
                      }}
                    />
                  </div>
                  <div style={styles.funnelCount}>{formatNumber(count)}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right sidebar */}
        <div style={styles.sidebar}>
          {/* Agent Events */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Agent Events</h2>
            <div style={styles.agentList}>
              {AGENT_EVENTS.map(evt => {
                const count = total[evt.key] || 0
                const todayN = getTodayCount(daily, evt.key)
                return (
                  <div key={evt.key} style={styles.agentRow}>
                    <div>
                      <div style={styles.agentLabel}>{evt.label}</div>
                      <div style={styles.agentSub}>+{todayN} today</div>
                    </div>
                    <div style={styles.agentCount}>{formatNumber(count)}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Error Breakdown */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Error Breakdown</h2>
            {sortedErrors.length === 0 ? (
              <p style={styles.emptyState}>No errors recorded</p>
            ) : (
              <div style={styles.errorList}>
                {sortedErrors.slice(0, 10).map(([type, count]) => (
                  <div key={type} style={styles.errorRow}>
                    <span style={styles.errorType}>{type}</span>
                    <span style={styles.errorCount}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Today Breakdown */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Today&apos;s Activity</h2>
            <div style={styles.agentList}>
              {FUNNEL_STEPS.map(step => {
                const todayN = getTodayCount(daily, step.key)
                if (todayN === 0) return null
                return (
                  <div key={step.key} style={styles.agentRow}>
                    <div style={styles.agentLabel}>{step.label}</div>
                    <div style={styles.agentCount}>{todayN}</div>
                  </div>
                )
              })}
              {FUNNEL_STEPS.every(step => getTodayCount(daily, step.key) === 0) && (
                <p style={styles.emptyState}>No activity yet today</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={styles.footer}>
        <span>Tracking since {data?.since ? new Date(data.since).toLocaleDateString() : '---'}</span>
        <span style={styles.footerDot} />
        <span>Auto-refreshes every 30s</span>
        <span style={styles.footerDot} />
        <span>convobench.org</span>
      </footer>
    </div>
  )
}

// --- Styles (dark theme, analytics aesthetic) ---

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0a0a0f',
    color: '#e5e7eb',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: '24px',
    maxWidth: 1280,
    margin: '0 auto',
  },

  // Header
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    flexWrap: 'wrap',
    gap: 16,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#f9fafb',
    margin: 0,
  },
  liveIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: '0.75rem',
    fontWeight: 500,
    color: '#34d399',
    background: 'rgba(52, 211, 153, 0.1)',
    padding: '4px 10px',
    borderRadius: 9999,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#34d399',
    animation: 'pulse 2s infinite',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  timestamp: {
    fontSize: '0.8rem',
    color: '#6b7280',
  },
  backLink: {
    fontSize: '0.8rem',
    color: '#818cf8',
    textDecoration: 'none',
  },

  // Error banner
  errorBanner: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#f87171',
    borderRadius: 8,
    padding: '10px 16px',
    marginBottom: 24,
    fontSize: '0.85rem',
  },

  // Loading
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
    gap: 16,
  },
  spinner: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '3px solid #1f2937',
    borderTopColor: '#818cf8',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    color: '#6b7280',
    fontSize: '0.9rem',
  },

  // Metric cards
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  metricCard: {
    background: '#111118',
    border: '1px solid #1f2937',
    borderRadius: 12,
    padding: '20px 24px',
  },
  metricLabel: {
    fontSize: '0.75rem',
    fontWeight: 500,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 8,
  },
  metricValue: {
    fontSize: '2rem',
    fontWeight: 700,
    color: '#f9fafb',
    lineHeight: 1.2,
  },
  metricSub: {
    fontSize: '0.8rem',
    color: '#4b5563',
    marginTop: 4,
  },

  // Content grid
  contentGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 340px',
    gap: 24,
    alignItems: 'start',
  },

  // Cards
  card: {
    background: '#111118',
    border: '1px solid #1f2937',
    borderRadius: 12,
    padding: 24,
    marginBottom: 0,
  },
  cardTitle: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#f9fafb',
    margin: '0 0 4px 0',
  },
  cardSubtitle: {
    fontSize: '0.8rem',
    color: '#4b5563',
    margin: '0 0 20px 0',
  },

  // Funnel
  funnelContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  funnelRow: {
    display: 'grid',
    gridTemplateColumns: '160px 1fr 60px',
    alignItems: 'center',
    gap: 12,
  },
  funnelLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  funnelStepName: {
    fontSize: '0.85rem',
    color: '#d1d5db',
    whiteSpace: 'nowrap' as const,
  },
  funnelConversion: {
    fontSize: '0.7rem',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  },
  funnelBarTrack: {
    height: 24,
    background: '#1a1a24',
    borderRadius: 6,
    overflow: 'hidden',
  },
  funnelBar: {
    height: '100%',
    borderRadius: 6,
    transition: 'width 0.6s ease',
    minWidth: 4,
  },
  funnelCount: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#e5e7eb',
    textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums',
  },

  // Sidebar
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },

  // Agent events
  agentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 12,
  },
  agentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    background: '#0d0d14',
    borderRadius: 8,
  },
  agentLabel: {
    fontSize: '0.85rem',
    color: '#d1d5db',
  },
  agentSub: {
    fontSize: '0.7rem',
    color: '#4b5563',
    marginTop: 2,
  },
  agentCount: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#f9fafb',
    fontVariantNumeric: 'tabular-nums',
  },

  // Errors
  errorList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 12,
  },
  errorRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: 'rgba(239, 68, 68, 0.05)',
    borderRadius: 8,
    border: '1px solid rgba(239, 68, 68, 0.1)',
  },
  errorType: {
    fontSize: '0.8rem',
    color: '#fca5a5',
    fontFamily: "'SF Mono', 'Monaco', 'Consolas', monospace",
  },
  errorCount: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#f87171',
    fontVariantNumeric: 'tabular-nums',
  },

  // Empty state
  emptyState: {
    fontSize: '0.85rem',
    color: '#4b5563',
    padding: '16px 0',
    textAlign: 'center' as const,
    margin: 0,
  },

  // Footer
  footer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginTop: 32,
    paddingTop: 24,
    borderTop: '1px solid #1f2937',
    fontSize: '0.75rem',
    color: '#4b5563',
    flexWrap: 'wrap',
  },
  footerDot: {
    width: 3,
    height: 3,
    borderRadius: '50%',
    background: '#374151',
    display: 'inline-block',
  },
}
