import { NextRequest, NextResponse } from 'next/server'

// Valid event names from the CLI telemetry
const VALID_EVENTS = new Set([
  'install',
  'qs_start',
  'qs_step1',
  'qs_step2',
  'qs_step3',
  'qs_step4',
  'qs_step5_agent',
  'qs_step5_voice',
  'qs_step6',
  'agent_start',
  'agent_join',
  'agent_stop',
  'error',
])

// Quickstart funnel step order (for timing calculations)
const FUNNEL_STEPS = [
  'qs_start', 'qs_step1', 'qs_step2', 'qs_step3', 'qs_step4',
  'qs_step5_agent', 'qs_step5_voice', 'qs_step6',
]

// ─── In-Memory Storage ──────────────────────────────────────────────────────

const counters = new Map<string, number>()
const dailyCounters = new Map<string, number>()
const errorCounts = new Map<string, number>()
const instanceStartTime = new Date().toISOString()

// Per-session events for timing: session_id → [{event, ts}]
interface SessionEvent { event: string; ts: number }
const sessions = new Map<string, SessionEvent[]>()
const MAX_SESSIONS = 500 // keep last N sessions to avoid memory bloat

// ─── Vercel KV (optional) ───────────────────────────────────────────────────

let kv: {
  hincrby: (key: string, field: string, increment: number) => Promise<number>
  hgetall: (key: string) => Promise<Record<string, number> | null>
  lpush: (key: string, ...values: string[]) => Promise<number>
  lrange: (key: string, start: number, end: number) => Promise<string[]>
} | null = null

async function initKV() {
  if (kv) return
  try {
    if (process.env.KV_REST_API_URL) {
      const mod = await (Function('return import("@vercel/kv")')() as Promise<{ kv: typeof kv }>)
      kv = mod.kv
    }
  } catch {}
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// ─── OPTIONS ────────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// ─── POST: receive telemetry events ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    await initKV()

    const body = await request.json()
    const { event, session_id, error_type, ts } = body as {
      event?: string
      session_id?: string
      ts?: number
      region?: string
      error_type?: string
      version?: string
    }

    if (!event || !VALID_EVENTS.has(event)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or missing event' },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const timestamp = ts ?? Date.now()
    const dateKey = `${event}:${today()}`

    // Store session event for timing
    if (session_id) {
      if (!sessions.has(session_id)) {
        // Evict oldest session if at capacity
        if (sessions.size >= MAX_SESSIONS) {
          const oldest = sessions.keys().next().value
          if (oldest) sessions.delete(oldest)
        }
        sessions.set(session_id, [])
      }
      sessions.get(session_id)!.push({ event, ts: timestamp })

      // Also persist to KV if available
      if (kv) {
        try {
          await kv.lpush('convoai:events', JSON.stringify({ event, session_id, ts: timestamp }))
        } catch {}
      }
    }

    // Increment counters
    if (kv) {
      await Promise.all([
        kv.hincrby('convoai:counts', event, 1),
        kv.hincrby('convoai:daily', dateKey, 1),
        event === 'error' && error_type
          ? kv.hincrby('convoai:errors', error_type, 1)
          : Promise.resolve(),
      ])
    } else {
      counters.set(event, (counters.get(event) || 0) + 1)
      dailyCounters.set(dateKey, (dailyCounters.get(dateKey) || 0) + 1)
      if (event === 'error' && error_type) {
        errorCounts.set(error_type, (errorCounts.get(error_type) || 0) + 1)
      }
    }

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  } catch (err) {
    console.error('[telemetry] POST error:', err)
    return NextResponse.json(
      { ok: false, error: 'Server error' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}

// ─── Timing Calculations ────────────────────────────────────────────────────

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
  stepTimings: { step: string; seconds: number }[]
}

function calculateTimings(): { stepAverages: StepTiming[]; recentSessions: SessionSummary[] } {
  const stepDurations: Record<string, number[]> = {}
  const recentSessions: SessionSummary[] = []

  for (const [sid, events] of sessions) {
    if (events.length < 2) continue

    // Sort by timestamp
    const sorted = [...events].sort((a, b) => a.ts - b.ts)
    const sessionStepTimings: { step: string; seconds: number }[] = []

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      const durSec = Math.round((curr.ts - prev.ts) / 1000)

      // Only count reasonable durations (< 30 minutes)
      if (durSec >= 0 && durSec < 1800) {
        const stepKey = `${prev.event} → ${curr.event}`
        if (!stepDurations[stepKey]) stepDurations[stepKey] = []
        stepDurations[stepKey].push(durSec)
        sessionStepTimings.push({ step: stepKey, seconds: durSec })
      }
    }

    const totalSec = Math.round((sorted[sorted.length - 1].ts - sorted[0].ts) / 1000)
    const lastStep = sorted[sorted.length - 1].event

    recentSessions.push({
      session_id: sid.slice(0, 4) + '****',
      totalSeconds: totalSec,
      stepsCompleted: sorted.length,
      reachedStep: lastStep,
      stepTimings: sessionStepTimings,
    })
  }

  // Calculate averages per step transition
  const stepAverages: StepTiming[] = []
  for (const [step, durations] of Object.entries(stepDurations)) {
    const sorted = [...durations].sort((a, b) => a - b)
    const avg = Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length)
    const median = sorted[Math.floor(sorted.length / 2)]
    stepAverages.push({ step, avgSeconds: avg, medianSeconds: median, count: sorted.length })
  }

  // Sort step averages by funnel order
  stepAverages.sort((a, b) => {
    const aIdx = FUNNEL_STEPS.findIndex(s => a.step.startsWith(s))
    const bIdx = FUNNEL_STEPS.findIndex(s => b.step.startsWith(s))
    return aIdx - bIdx
  })

  // Sort sessions newest first, limit to 20
  recentSessions.sort((a, b) => b.totalSeconds - a.totalSeconds)

  return { stepAverages, recentSessions: recentSessions.slice(0, 20) }
}

// ─── GET: read counters + timing for dashboard ──────────────────────────────

export async function GET() {
  try {
    await initKV()

    let total: Record<string, number> = {}
    let daily: Record<string, number> = {}
    let errors: Record<string, number> = {}

    if (kv) {
      total = (await kv.hgetall('convoai:counts')) || {}
      daily = (await kv.hgetall('convoai:daily')) || {}
      errors = (await kv.hgetall('convoai:errors')) || {}
    } else {
      for (const [k, v] of counters) total[k] = v
      for (const [k, v] of dailyCounters) daily[k] = v
      for (const [k, v] of errorCounts) errors[k] = v
    }

    const { stepAverages, recentSessions } = calculateTimings()

    return NextResponse.json(
      {
        total,
        daily,
        errors,
        timing: {
          stepAverages,
          recentSessions,
          sessionsTracked: sessions.size,
        },
        since: instanceStartTime,
      },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error('[telemetry] GET error:', err)
    return NextResponse.json(
      { total: {}, daily: {}, errors: {}, timing: { stepAverages: [], recentSessions: [], sessionsTracked: 0 }, since: instanceStartTime },
      { headers: CORS_HEADERS }
    )
  }
}
