import { sendPushes, type PushMessage } from './push';
import { detectWorkout, type DetectedWorkout, type RedditEnv } from './reddit';

interface Env extends RedditEnv {
  DB: D1Database;
}

interface CurrentWorkout extends DetectedWorkout {
  foundAt: string;
}

// Hold notifications outside 6:00–21:59 in each device's own time zone.
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 6;
// Stop delivering a workout this long after it was detected (tomorrow's will replace it).
const DELIVERY_WINDOW_MS = 16 * 60 * 60 * 1000;
const PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function localHour(tz: string, now: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now));
}

async function getCurrent(env: Env): Promise<CurrentWorkout | null> {
  const row = await env.DB.prepare(`SELECT value FROM state WHERE key = 'current'`).first<{ value: string }>();
  return row ? JSON.parse(row.value) : null;
}

async function setCurrent(env: Env, current: CurrentWorkout) {
  await env.DB.prepare(
    `INSERT INTO state (key, value) VALUES ('current', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  )
    .bind(JSON.stringify(current))
    .run();
}

async function deliver(env: Env, current: CurrentWorkout, now: Date) {
  if (now.getTime() - Date.parse(current.foundAt) > DELIVERY_WINDOW_MS) return;

  const { results } = await env.DB.prepare(`SELECT token, timezone FROM devices WHERE last_thread_id IS NOT ?1`)
    .bind(current.threadId)
    .all<{ token: string; timezone: string }>();
  const due = results.filter((d) => {
    const hour = localHour(d.timezone, now);
    return hour >= QUIET_END_HOUR && hour < QUIET_START_HOUR;
  });
  if (!due.length) return;

  const messages: PushMessage[] = due.map((d) => ({
    to: d.token,
    title: "Today's workout is up",
    body: current.summary || "Tap to see today's class.",
    data: { threadId: current.threadId },
  }));
  const outcomes = await sendPushes(messages);

  const statements = [...outcomes].flatMap(([token, outcome]) => {
    if (outcome === 'sent') {
      return [env.DB.prepare(`UPDATE devices SET last_thread_id = ?1 WHERE token = ?2`).bind(current.threadId, token)];
    }
    if (outcome === 'unregistered') return [env.DB.prepare(`DELETE FROM devices WHERE token = ?1`).bind(token)];
    return []; // 'failed' is retried on the next run.
  });
  if (statements.length) await env.DB.batch(statements);
  console.log(`Delivered ${current.threadId}: ${[...outcomes.values()].join(', ')}`);
}

export async function runCheck(env: Env, now = new Date()) {
  let current = await getCurrent(env);
  const detected = await detectWorkout(env, current?.threadId);
  if (detected && detected.threadId !== current?.threadId) {
    current = { ...detected, foundAt: now.toISOString() };
    await setCurrent(env, current);
    console.log(`New workout detected in thread ${current.threadId}`);
  }
  if (current) await deliver(env, current, now);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function handleDevices(request: Request, env: Env): Promise<Response> {
  let body: { token?: unknown; timezone?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const { token, timezone } = body;
  if (typeof token !== 'string' || !PUSH_TOKEN_PATTERN.test(token)) return json({ error: 'Invalid push token' }, 400);

  if (request.method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM devices WHERE token = ?1`).bind(token).run();
    return json({ ok: true });
  }

  if (!isValidTimezone(timezone)) return json({ error: 'Invalid timezone' }, 400);
  // New devices start as already notified about the current workout, so turning
  // notifications on doesn't immediately fire one.
  const current = await getCurrent(env);
  await env.DB.prepare(
    `INSERT INTO devices (token, timezone, last_thread_id) VALUES (?1, ?2, ?3)
     ON CONFLICT(token) DO UPDATE SET timezone = excluded.timezone`,
  )
    .bind(token, timezone, current?.threadId ?? null)
    .run();
  return json({ ok: true });
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/devices' && (request.method === 'POST' || request.method === 'DELETE')) {
      return handleDevices(request, env);
    }
    if (pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, current: await getCurrent(env) });
    }
    return json({ error: 'Not found' }, 404);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runCheck(env));
  },
} satisfies ExportedHandler<Env>;
