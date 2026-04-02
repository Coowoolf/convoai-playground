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

// In-memory counters (persists within a single serverless instance lifecycle)
const counters = new Map<string, number>()
const dailyCounters = new Map<string, number>() // key: "event:YYYY-MM-DD"
const errorCounts = new Map<string, number>() // key: error_type
const instanceStartTime = new Date().toISOString()

// Try to use Vercel KV if available
let kv: {
  hincrby: (key: string, field: string, increment: number) => Promise<number>
  hgetall: (key: string) => Promise<Record<string, number> | null>
} | null = null

async function initKV() {
  if (kv) return
  try {
    if (process.env.KV_REST_API_URL) {
      // Dynamic import -- @vercel/kv may not be installed locally
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = await (Function('return import("@vercel/kv")')() as Promise<{ kv: typeof kv }>)
      kv = mod.kv
    }
  } catch {
    // @vercel/kv not installed or not configured -- fall back to in-memory
  }
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// ---- OPTIONS (CORS preflight) ----
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// ---- POST: receive telemetry events ----
export async function POST(request: NextRequest) {
  try {
    await initKV()

    const body = await request.json()
    const { event, error_type } = body as {
      event?: string
      session_id?: string
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

    const dateKey = `${event}:${today()}`

    if (kv) {
      // Persist to Vercel KV
      await Promise.all([
        kv.hincrby('convoai:counts', event, 1),
        kv.hincrby('convoai:daily', dateKey, 1),
        event === 'error' && error_type
          ? kv.hincrby('convoai:errors', error_type, 1)
          : Promise.resolve(),
      ])
    } else {
      // In-memory fallback
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

// ---- GET: read counters for the dashboard ----
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

    return NextResponse.json(
      { total, daily, errors, since: instanceStartTime },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error('[telemetry] GET error:', err)
    return NextResponse.json(
      { total: {}, daily: {}, errors: {}, since: instanceStartTime },
      { headers: CORS_HEADERS }
    )
  }
}
