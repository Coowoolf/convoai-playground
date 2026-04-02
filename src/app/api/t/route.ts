import { NextRequest, NextResponse } from 'next/server'

// ─── Valid Events ───────────────────────────────────────────────────────────

const VALID_EVENTS = new Set([
  'install', 'qs_start', 'qs_step1', 'qs_step2', 'qs_step3', 'qs_step4',
  'qs_step5_agent', 'qs_step5_voice', 'qs_step6',
  'agent_start', 'agent_join', 'agent_stop', 'error',
])

const FUNNEL_STEPS = [
  'qs_start', 'qs_step1', 'qs_step2', 'qs_step3', 'qs_step4',
  'qs_step5_agent', 'qs_step5_voice', 'qs_step6',
]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// ─── Upstash Redis REST Client ──────────────────────────────────────────────

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN

async function redis(command: string[]): Promise<unknown> {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  try {
    const res = await fetch(`${REDIS_URL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    })
    const json = await res.json()
    return json.result
  } catch { return null }
}

async function hincrby(key: string, field: string, n: number): Promise<void> {
  await redis(['HINCRBY', key, field, String(n)])
}

async function hgetall(key: string): Promise<Record<string, number>> {
  const result = await redis(['HGETALL', key]) as string[] | null
  if (!result || !Array.isArray(result)) return {}
  const map: Record<string, number> = {}
  for (let i = 0; i < result.length; i += 2) {
    map[result[i]] = Number(result[i + 1]) || 0
  }
  return map
}

async function lpush(key: string, value: string): Promise<void> {
  await redis(['LPUSH', key, value])
}

async function ltrim(key: string, start: number, stop: number): Promise<void> {
  await redis(['LTRIM', key, String(start), String(stop)])
}

async function lrange(key: string, start: number, stop: number): Promise<string[]> {
  const result = await redis(['LRANGE', key, String(start), String(stop)]) as string[] | null
  return result ?? []
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── OPTIONS ────────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// ─── POST ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event, session_id, error_type, ts } = body as {
      event?: string; session_id?: string; ts?: number;
      region?: string; error_type?: string; version?: string
    }

    if (!event || !VALID_EVENTS.has(event)) {
      return NextResponse.json({ ok: false, error: 'Invalid event' }, { status: 400, headers: CORS })
    }

    const timestamp = ts ?? Date.now()
    const dateKey = `${event}:${today()}`

    // Increment counters
    await Promise.all([
      hincrby('convoai:counts', event, 1),
      hincrby('convoai:daily', dateKey, 1),
      event === 'error' && error_type ? hincrby('convoai:errors', error_type, 1) : Promise.resolve(),
    ])

    // Store session event for timing
    if (session_id) {
      await lpush('convoai:events', JSON.stringify({ event, session_id, ts: timestamp }))
      await ltrim('convoai:events', 0, 4999) // keep last 5000 events
    }

    return NextResponse.json({ ok: true }, { headers: CORS })
  } catch (err) {
    console.error('[telemetry] POST error:', err)
    return NextResponse.json({ ok: false }, { status: 500, headers: CORS })
  }
}

// ─── Timing Calculations ────────────────────────────────────────────────────

interface StepTiming { step: string; avgSeconds: number; medianSeconds: number; count: number }
interface SessionSummary { session_id: string; totalSeconds: number; stepsCompleted: number; reachedStep: string }

function calculateTimings(events: { event: string; session_id: string; ts: number }[]): {
  stepAverages: StepTiming[]; recentSessions: SessionSummary[]
} {
  // Group by session
  const sessionMap = new Map<string, { event: string; ts: number }[]>()
  for (const e of events) {
    if (!sessionMap.has(e.session_id)) sessionMap.set(e.session_id, [])
    sessionMap.get(e.session_id)!.push({ event: e.event, ts: e.ts })
  }

  const stepDurations: Record<string, number[]> = {}
  const recentSessions: SessionSummary[] = []

  for (const [sid, evts] of sessionMap) {
    if (evts.length < 2) continue
    const sorted = [...evts].sort((a, b) => a.ts - b.ts)

    for (let i = 1; i < sorted.length; i++) {
      const dur = Math.round((sorted[i].ts - sorted[i - 1].ts) / 1000)
      if (dur >= 0 && dur < 1800) {
        const key = `${sorted[i - 1].event} → ${sorted[i].event}`
        if (!stepDurations[key]) stepDurations[key] = []
        stepDurations[key].push(dur)
      }
    }

    const totalSec = Math.round((sorted[sorted.length - 1].ts - sorted[0].ts) / 1000)
    recentSessions.push({
      session_id: sid.slice(0, 4) + '****',
      totalSeconds: totalSec,
      stepsCompleted: sorted.length,
      reachedStep: sorted[sorted.length - 1].event,
    })
  }

  const stepAverages: StepTiming[] = Object.entries(stepDurations).map(([step, durs]) => {
    const s = [...durs].sort((a, b) => a - b)
    return {
      step,
      avgSeconds: Math.round(s.reduce((a, b) => a + b, 0) / s.length),
      medianSeconds: s[Math.floor(s.length / 2)],
      count: s.length,
    }
  }).sort((a, b) => {
    const ai = FUNNEL_STEPS.findIndex(s => a.step.startsWith(s))
    const bi = FUNNEL_STEPS.findIndex(s => b.step.startsWith(s))
    return ai - bi
  })

  recentSessions.sort((a, b) => b.totalSeconds - a.totalSeconds)

  return { stepAverages, recentSessions: recentSessions.slice(0, 20) }
}

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const [total, daily, errors, rawEvents] = await Promise.all([
      hgetall('convoai:counts'),
      hgetall('convoai:daily'),
      hgetall('convoai:errors'),
      lrange('convoai:events', 0, 4999),
    ])

    // Parse events for timing
    const events: { event: string; session_id: string; ts: number }[] = []
    for (const raw of rawEvents) {
      try { events.push(JSON.parse(raw)) } catch { /* skip */ }
    }

    const { stepAverages, recentSessions } = calculateTimings(events)

    return NextResponse.json({
      total, daily, errors,
      timing: { stepAverages, recentSessions, sessionsTracked: new Set(events.map(e => e.session_id)).size },
      since: 'persistent',
    }, { headers: CORS })
  } catch (err) {
    console.error('[telemetry] GET error:', err)
    return NextResponse.json({
      total: {}, daily: {}, errors: {},
      timing: { stepAverages: [], recentSessions: [], sessionsTracked: 0 },
      since: 'error',
    }, { headers: CORS })
  }
}
