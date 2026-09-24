import { SAMPLE_COMMENTS } from '../../src/sampleData';
import {
  isDailyThread,
  SUBREDDIT,
  workoutComments,
  workoutSummary,
  type RedditComment,
  type RedditPost,
} from '../../src/redditThread';

export interface RedditEnv {
  REDDIT_CLIENT_ID?: string;
  REDDIT_CLIENT_SECRET?: string;
  FAKE_REDDIT?: string;
}

export interface DetectedWorkout {
  threadId: string;
  summary: string;
}

const USER_AGENT = 'web:class-preview-notifier:v0.1 (by /u/heftyitaliannyc)';
// Ignore threads older than this so yesterday's thread never triggers a push.
const MAX_THREAD_AGE_S = 20 * 60 * 60;

async function getToken(env: RedditEnv): Promise<string> {
  // With a secret (web/script app) use client_credentials; an installed app has
  // no secret and uses the installed_client grant instead.
  const body = env.REDDIT_CLIENT_SECRET
    ? 'grant_type=client_credentials'
    : `grant_type=${encodeURIComponent('https://oauth.reddit.com/grants/installed_client')}&device_id=DO_NOT_TRACK_THIS_DEVICE`;
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET ?? ''}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body,
  });
  if (!res.ok) throw new Error(`Reddit auth failed (${res.status})`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function redditGet(token: string, path: string): Promise<any> {
  const res = await fetch(`https://oauth.reddit.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`Reddit request failed (${res.status}) for ${path}`);
  return res.json();
}

function fakeWorkout(): DetectedWorkout {
  const [top] = SAMPLE_COMMENTS[0];
  const today = new Date().toISOString().slice(0, 10);
  return { threadId: `fake-${today}`, summary: workoutSummary({ ...top, id: 'fake', permalink: '', stickied: false }) };
}

/**
 * Returns today's workout if the daily thread now has one, skipping the comment
 * fetch when `knownThreadId` is already the latest thread.
 */
export async function detectWorkout(env: RedditEnv, knownThreadId?: string): Promise<DetectedWorkout | null> {
  if (env.FAKE_REDDIT === '1') return fakeWorkout();
  if (!env.REDDIT_CLIENT_ID) {
    console.warn('REDDIT_CLIENT_ID is not set; skipping Reddit check');
    return null;
  }

  const token = await getToken(env);
  const listing = await redditGet(token, `/r/${SUBREDDIT}/new?limit=25&raw_json=1`);
  const now = Date.now() / 1000;
  const thread: RedditPost | undefined = listing.data.children
    .map((c: any) => c.data as RedditPost)
    .find((p: RedditPost) => isDailyThread(p) && now - p.created_utc < MAX_THREAD_AGE_S);
  if (!thread || thread.id === knownThreadId) return null;

  const [, comments] = await redditGet(token, `/comments/${thread.id}?sort=top&depth=1&limit=50&raw_json=1`);
  const topLevel: RedditComment[] = comments.data.children.filter((c: any) => c.kind === 't1').map((c: any) => c.data);
  const [best] = workoutComments(topLevel);
  return best ? { threadId: thread.id, summary: workoutSummary(best) } : null;
}
