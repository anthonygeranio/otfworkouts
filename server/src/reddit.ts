import { buildWorkout, findDailyThread, titleDate } from '../../src/buildWorkout';
import { isDailyThread, SUBREDDIT } from '../../src/redditThread';
import { parseFeedPosts } from '../../src/rssParser';
import { sampleWorkout } from '../../src/sampleData';
import type { DailyWorkout } from '../../src/types';

export interface RedditEnv {
  FAKE_REDDIT?: string;
}

// Reddit publishes these RSS feeds for readers. Identify honestly and back off on 429.
const USER_AGENT = 'web:class-preview:v0.2 (daily workout reader by /u/heftyitaliannyc)';
const BASE = 'https://www.reddit.com';

async function fetchFeed(path: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/atom+xml' } });
    if (res.ok) return res.text();
    if (res.status === 429 && attempt === 0) {
      const retryAfter = Math.min(Number(res.headers.get('Retry-After')) || 5, 30);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    throw new Error(`Reddit RSS ${res.status} for ${path}`);
  }
  throw new Error(`Reddit RSS retry exhausted for ${path}`);
}

const threadId36 = (fullId: string) => fullId.replace(/^t3_/, '');

/** The current daily thread's date (YYYY-MM-DD), for the cron to know what "today" is. */
export async function latestDailyDate(env: RedditEnv): Promise<string | null> {
  if (env.FAKE_REDDIT === '1') return new Date().toISOString().slice(0, 10);
  const listing = await fetchFeed(`/r/${SUBREDDIT}/new/.rss?limit=100`);
  const latest = parseFeedPosts(listing).find(isDailyThread);
  return latest ? titleDate(latest.title) : null;
}

/** Fetches and parses the daily workout for `date`, or null if none is posted. */
export async function fetchDailyWorkout(env: RedditEnv, date: string): Promise<DailyWorkout | null> {
  if (env.FAKE_REDDIT === '1') return sampleWorkout(date, 0);

  const listing = await fetchFeed(`/r/${SUBREDDIT}/new/.rss?limit=100`);
  const thread = findDailyThread(listing, date);
  if (!thread) return null;
  const comments = await fetchFeed(`/comments/${threadId36(thread.id)}/.rss?sort=top&limit=50`);
  return buildWorkout(thread, comments, date);
}
