import { buildWorkout, titleDate } from '../../src/buildWorkout';
import { isDailyThread, SUBREDDIT } from '../../src/redditThread';
import { parseFeedPosts, type FeedPost } from '../../src/rssParser';
import { sampleWorkout } from '../../src/sampleData';
import type { DailyWorkout } from '../../src/types';

export interface RedditEnv {
  FAKE_REDDIT?: string;
}

// Reddit publishes these RSS feeds for readers. Identify honestly and back off on 429.
const USER_AGENT = 'web:otf-workouts:v0.2 (+https://github.com/anthonygeranio/otfworkouts)';
const BASE = 'https://www.reddit.com';

async function fetchFeed(path: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/atom+xml' } });
    if (res.ok) return res.text();
    if (res.status === 429 && attempt === 0) {
      const retryAfter = Math.min(Number(res.headers.get('Retry-After')) || 3, 10);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    throw new Error(`Reddit RSS ${res.status} for ${path}`);
  }
  throw new Error(`Reddit RSS retry exhausted for ${path}`);
}

const threadId36 = (fullId: string) => fullId.replace(/^t3_/, '');

/**
 * The subreddit listing. Fetch this ONCE per run and pass it around — it is ~170KB
 * and re-downloading it per day is what previously tripped Reddit's rate limiting.
 */
export async function fetchListing(env: RedditEnv): Promise<string | null> {
  if (env.FAKE_REDDIT === '1') return '';
  try {
    return await fetchFeed(`/r/${SUBREDDIT}/new/.rss?limit=100`);
  } catch (e) {
    console.warn(`listing fetch failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/**
 * The daily threads in a listing, newest first. We persist this small index so we
 * rarely need the big listing again — Reddit rate-limits it aggressively.
 */
export function parseDailyThreads(listing: string): FeedPost[] {
  return parseFeedPosts(listing).filter(isDailyThread);
}

export const threadDate = (t: FeedPost) => titleDate(t.title);

/** Builds the workout for a known thread. One small comment fetch, no listing needed. */
export async function workoutForThread(
  env: RedditEnv,
  thread: FeedPost,
  date: string,
): Promise<DailyWorkout | null> {
  if (env.FAKE_REDDIT === '1') return sampleWorkout(date, 0);
  const comments = await fetchFeed(`/comments/${threadId36(thread.id)}/.rss?sort=top&limit=50`);
  return buildWorkout(thread, comments, date);
}
