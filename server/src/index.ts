import { workoutSummary } from '../../src/redditThread';
import type { DailyWorkout } from '../../src/types';
import { sendPushes, type PushMessage } from './push';
import { fetchDailyWorkout, latestDailyDate, type RedditEnv } from './reddit';

interface Env extends RedditEnv {
  DB: D1Database;
}

interface Current {
  date: string; // the daily thread date a push has gone out for
  summary: string;
  foundAt: string;
}

// Hold notifications outside 6:00–21:59 in each device's own time zone.
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 6;
// Re-fetch a cached day older than this, so edits and deletions on Reddit propagate.
const WORKOUT_TTL_MS = 6 * 60 * 60 * 1000;
const PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const localHour = (tz: string, now: Date) =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now));

async function readState<T>(env: Env, key: string): Promise<T | null> {
  const row = await env.DB.prepare(`SELECT value FROM state WHERE key = ?1`).bind(key).first<{ value: string }>();
  return row ? (JSON.parse(row.value) as T) : null;
}

async function writeState(env: Env, key: string, value: unknown) {
  await env.DB.prepare(`INSERT INTO state (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(key, JSON.stringify(value))
    .run();
}

/** Returns the cached workout for a date, fetching and caching it when missing or stale. */
async function getWorkout(env: Env, date: string): Promise<DailyWorkout | null> {
  const cached = await readState<DailyWorkout>(env, `workout:${date}`);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < WORKOUT_TTL_MS) return cached;
  const fresh = await fetchDailyWorkout(env, date);
  if (fresh) await writeState(env, `workout:${date}`, fresh);
  return fresh ?? cached;
}

async function deliver(env: Env, current: Current, now: Date) {
  const { results } = await env.DB.prepare(`SELECT token, timezone FROM devices WHERE last_thread_id IS NOT ?1`)
    .bind(current.date)
    .all<{ token: string; timezone: string }>();
  const due = results.filter((d) => {
    const h = localHour(d.timezone, now);
    return h >= QUIET_END_HOUR && h < QUIET_START_HOUR;
  });
  if (!due.length) return;

  const messages: PushMessage[] = due.map((d) => ({
    to: d.token,
    title: "Today's workout is up",
    body: current.summary,
    data: { date: current.date },
  }));
  const outcomes = await sendPushes(messages);
  const statements = [...outcomes].flatMap(([token, outcome]) => {
    if (outcome === 'sent') return [env.DB.prepare(`UPDATE devices SET last_thread_id = ?1 WHERE token = ?2`).bind(current.date, token)];
    if (outcome === 'unregistered') return [env.DB.prepare(`DELETE FROM devices WHERE token = ?1`).bind(token)];
    return [];
  });
  if (statements.length) await env.DB.batch(statements);
  console.log(`Delivered ${current.date}: ${[...outcomes.values()].join(', ')}`);
}

export async function runCheck(env: Env, now = new Date()) {
  const date = await latestDailyDate(env);
  if (!date) return;
  const workout = await getWorkout(env, date);
  if (!workout || !workout.posts.length) return;

  let current = await readState<Current>(env, 'current');
  if (current?.date !== date) {
    current = { date, summary: workoutSummary(workout.posts[0].body), foundAt: now.toISOString() };
    await writeState(env, 'current', current);
    console.log(`New workout detected for ${date}`);
  }
  await deliver(env, current, now);
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
  // Start already caught up on the current workout, so enabling doesn't fire one immediately.
  const current = await readState<Current>(env, 'current');
  await env.DB.prepare(
    `INSERT INTO devices (token, timezone, last_thread_id) VALUES (?1, ?2, ?3)
     ON CONFLICT(token) DO UPDATE SET timezone = excluded.timezone`,
  )
    .bind(token, timezone, current?.date ?? null)
    .run();
  return json({ ok: true });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/workout' && request.method === 'GET') {
      const date = url.searchParams.get('date') ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date=YYYY-MM-DD required' }, 400);
      try {
        return json({ workout: await getWorkout(env, date) });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'fetch failed' }, 502);
      }
    }
    if (url.pathname === '/devices' && (request.method === 'POST' || request.method === 'DELETE')) {
      return handleDevices(request, env);
    }
    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, current: await readState(env, 'current') });
    }
    return json({ error: 'Not found' }, 404);
  },

  async scheduled(_c, env, ctx) {
    ctx.waitUntil(runCheck(env));
  },
} satisfies ExportedHandler<Env>;
