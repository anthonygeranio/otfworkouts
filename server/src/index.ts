import { workoutSummary } from '../../src/redditThread';
import type { FeedPost } from '../../src/rssParser';
import type { DailyWorkout } from '../../src/types';
import { sendPushes, type PushMessage } from './push';
import { fetchListing, parseDailyThreads, threadDate, workoutForThread, type RedditEnv } from './reddit';

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
const DAY_MS = 24 * 60 * 60 * 1000;
// A finished day's thread no longer changes, so we fetch it once and keep it. Reddit
// rate-limits hard, and re-reading settled days is what starved the days that mattered.
// Today and yesterday stay refreshable: today's thread fills up as the day goes on, and
// "yesterday" by UTC can still be today in US time zones. If a post from a sealed day is
// reported, handleReport drops that day so a removal on Reddit still propagates.
const SEAL_AFTER_DAYS = 2;

const isSealed = (date: string) => Date.now() - Date.parse(`${date}T00:00:00Z`) >= SEAL_AFTER_DAYS * DAY_MS;

function cacheUsable(cached: DailyWorkout | null, date: string): cached is DailyWorkout {
  if (!cached) return false;
  return isSealed(date) || Date.now() - Date.parse(cached.fetchedAt) < WORKOUT_TTL_MS;
}
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

/**
 * Returns the cached workout for a date, fetching and caching it when missing or
 * stale. Reddit sometimes rate-limits (429) our fetches; on any fetch error we
 * fall back to the cached copy or null and never throw, so the app shows a clean
 * empty state instead of an error.
 */
interface ThreadIndex {
  threads: FeedPost[];
  fetchedAt: string;
}

// Reddit heavily rate-limits the big listing, so we keep a small index of the
// daily threads and only refresh it occasionally. If a refresh is throttled we
// keep using the stored index rather than failing the run.
const THREAD_INDEX_TTL_MS = 30 * 60 * 1000;

async function getThreads(env: Env): Promise<FeedPost[]> {
  const stored = await readState<ThreadIndex>(env, 'threads');
  if (stored && Date.now() - Date.parse(stored.fetchedAt) < THREAD_INDEX_TTL_MS) return stored.threads;

  const listing = await fetchListing(env);
  if (!listing) {
    if (stored) {
      console.warn(`listing throttled; using stored thread index (${stored.threads.length} threads)`);
      return stored.threads;
    }
    return [];
  }
  const threads = parseDailyThreads(listing);
  if (threads.length) await writeState(env, 'threads', { threads, fetchedAt: new Date().toISOString() });
  return threads;
}

async function getWorkout(env: Env, date: string, threads?: FeedPost[]): Promise<DailyWorkout | null> {
  const cached = await readState<DailyWorkout>(env, `workout:${date}`);
  if (cacheUsable(cached, date)) return cached;
  try {
    const list = threads ?? (await getThreads(env));
    const thread = list.find((t) => threadDate(t) === date);
    if (!thread) return cached;
    const fresh = await workoutForThread(env, thread, date);
    if (fresh) await writeState(env, `workout:${date}`, fresh);
    return fresh ?? cached;
  } catch (e) {
    await noteFailure(env, date);
    console.warn(`getWorkout(${date}) fetch failed, serving cache/null: ${e instanceof Error ? e.message : e}`);
    return cached;
  }
}

/**
 * Warms recent days using a listing we already have, so each day costs one small
 * comment fetch instead of re-downloading the whole listing. Best-effort: any
 * failure is logged and skipped so the run always finishes.
 */
// After a throttled fetch, leave that day alone for a while instead of retrying it
// every run — repeatedly hammering a 429'd day is what starves the days that would
// have succeeded.
const FAIL_BACKOFF_MS = 25 * 60 * 1000;

async function recentlyFailed(env: Env, date: string): Promise<boolean> {
  const at = await readState<string>(env, `fail:${date}`);
  return !!at && Date.now() - Date.parse(at) < FAIL_BACKOFF_MS;
}

const noteFailure = (env: Env, date: string) => writeState(env, `fail:${date}`, new Date().toISOString());

async function warmRecentDays(env: Env, threads: FeedPost[], skip: Set<string>, budget = 2) {
  let fetched = 0;
  for (const thread of threads) {
    if (fetched >= budget) break;
    const date = threadDate(thread);
    if (!date || skip.has(date)) continue;
    const cached = await readState<DailyWorkout>(env, `workout:${date}`);
    if (cacheUsable(cached, date)) continue;
    if (await recentlyFailed(env, date)) continue;
    try {
      const fresh = await workoutForThread(env, thread, date);
      if (fresh) {
        await writeState(env, `workout:${date}`, fresh);
        console.log(`warmed ${date} (${fresh.posts.length} posts)`);
      }
    } catch (e) {
      await noteFailure(env, date);
      console.warn(`warm ${date} failed: ${e instanceof Error ? e.message : e}`);
    }
    fetched++;
    await new Promise((r) => setTimeout(r, 1500)); // gentle on Reddit
  }
}

// A workout is posted every day, so `current` falling this far behind means the pipeline
// is broken, not that the community went quiet. The last outage ran nine days unnoticed.
const STALE_AFTER_HOURS = 36;

async function staleness(env: Env) {
  const current = await readState<Current>(env, 'current');
  if (!current) return { stale: true, lastFound: null, hoursBehind: null };
  const hoursBehind = Math.floor((Date.now() - Date.parse(`${current.date}T00:00:00Z`)) / (60 * 60 * 1000));
  return { stale: hoursBehind >= STALE_AFTER_HOURS, lastFound: current.date, hoursBehind };
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
  const threads = await getThreads(env);
  if (!threads.length) {
    console.warn('runCheck: no thread index available, skipping this run');
    return;
  }
  console.log(`runCheck: ${threads.length} daily threads, newest ${threadDate(threads[0])}`);

  // Newest first. The next day's thread is usually posted the evening before and
  // has no workout yet, so fall through to the most recent day that actually has one.
  const attempted = new Set<string>();
  for (const thread of threads.slice(0, 3)) {
    const date = threadDate(thread);
    if (!date || (await recentlyFailed(env, date))) continue;
    attempted.add(date);
    let workout: DailyWorkout | null = null;
    try {
      workout = await getWorkout(env, date, threads);
    } catch (e) {
      await noteFailure(env, date);
      console.warn(`runCheck ${date} failed: ${e instanceof Error ? e.message : e}`);
    }
    if (!workout || !workout.posts.length) continue;

    let current = await readState<Current>(env, 'current');
    if (current?.date !== date) {
      current = { date, summary: workoutSummary(workout.posts[0].body), foundAt: now.toISOString() };
      await writeState(env, 'current', current);
      console.log(`New workout detected for ${date}`);
    }
    await deliver(env, current, now);
    break;
  }

  // Keep recent days warm so past-day taps are served from cache, not a live fetch.
  await warmRecentDays(env, threads.slice(0, 8), attempted);

  const health = await staleness(env);
  if (health.stale) {
    console.error(`STALE: no workout found since ${health.lastFound ?? 'ever'} (${health.hoursBehind}h behind)`);
  }
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

/**
 * Sealed days are never re-fetched, so a post removed on Reddit would otherwise stay in
 * our cache forever. Dropping the day that holds a reported post makes the next request
 * for it fetch fresh, which is where a removal (or an edit) takes effect.
 */
async function invalidateDayForPost(env: Env, postId: string) {
  // Reddit ids look like "t1_19rj7hx6b4g2t"; anything else we don't put into a LIKE
  // pattern. `_` is a LIKE wildcard, so escape it rather than let it match loosely.
  if (!/^[a-z0-9_]+$/i.test(postId)) return;
  const needle = `%"${postId.replace(/[%_\\]/g, '\\$&')}"%`;
  const row = await env.DB.prepare(
    `SELECT key FROM state WHERE key LIKE 'workout:%' AND value LIKE ?1 ESCAPE '\\' LIMIT 1`,
  )
    .bind(needle)
    .first<{ key: string }>();
  if (!row) return;
  await env.DB.prepare(`DELETE FROM state WHERE key = ?1`).bind(row.key).run();
  console.log(`Report on ${postId}: cleared ${row.key} so a removal propagates`);
}

async function handleReport(request: Request, env: Env): Promise<Response> {
  let body: { postId?: unknown; author?: unknown; permalink?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (typeof body.postId !== 'string' || body.postId.length > 64) return json({ error: 'postId required' }, 400);
  const author = typeof body.author === 'string' ? body.author.slice(0, 64) : null;
  const permalink = typeof body.permalink === 'string' ? body.permalink.slice(0, 300) : null;
  await env.DB.prepare(`INSERT INTO reports (post_id, author, permalink) VALUES (?1, ?2, ?3)`)
    .bind(body.postId, author, permalink)
    .run();
  console.log(`Report received for post ${body.postId} by ${author}`);
  await invalidateDayForPost(env, body.postId);
  return json({ ok: true });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/workout' && request.method === 'GET') {
      const date = url.searchParams.get('date') ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date=YYYY-MM-DD required' }, 400);
      // getWorkout never throws; a missing day returns { workout: null } so the
      // app shows a friendly empty state rather than an error.
      return json({ workout: await getWorkout(env, date) });
    }
    if (url.pathname === '/devices' && (request.method === 'POST' || request.method === 'DELETE')) {
      return handleDevices(request, env);
    }
    if (url.pathname === '/report' && request.method === 'POST') {
      return handleReport(request, env);
    }
    // Manual trigger for the same work the cron does: lets us run/verify the check
    // on demand (and acts as a fallback if the scheduled trigger misfires).
    if (url.pathname === '/run-check' && request.method === 'POST') {
      try {
        await runCheck(env);
        return json({ ok: true, current: await readState(env, 'current') });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
      }
    }
    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, current: await readState(env, 'current'), ...(await staleness(env)) });
    }
    return json({ error: 'Not found' }, 404);
  },

  async scheduled(_c, env, ctx) {
    ctx.waitUntil(runCheck(env));
  },
} satisfies ExportedHandler<Env>;
