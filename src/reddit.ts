import { guessTemplate, parseWorkout } from './parser';
import { isDailyThread, SUBREDDIT, workoutComments, type RedditComment } from './redditThread';
import type { DailyWorkout, WorkoutPost } from './types';

// Register an "installed app" at https://www.reddit.com/prefs/apps and put its
// client id in .env as EXPO_PUBLIC_REDDIT_CLIENT_ID. Installed apps have no
// secret, so the id is safe to ship inside the app binary.
const CLIENT_ID = process.env.EXPO_PUBLIC_REDDIT_CLIENT_ID ?? '';
const USER_AGENT = 'mobile:class-preview:v0.1 (community workout reader)';

export const isRedditConfigured = () => CLIENT_ID.length > 0;

let token: { value: string; expiresAt: number } | null = null;

function deviceId(): string {
  // Reddit wants a stable 20–30 char id per install; a random one per session is acceptable.
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}

async function getToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${CLIENT_ID}:`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: `grant_type=${encodeURIComponent('https://oauth.reddit.com/grants/installed_client')}&device_id=${deviceId()}`,
  });
  if (!res.ok) throw new Error(`Reddit auth failed (${res.status})`);
  const json = await res.json();
  token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return token.value;
}

async function redditGet(path: string): Promise<any> {
  const res = await fetch(`https://oauth.reddit.com${path}`, {
    headers: { Authorization: `Bearer ${await getToken()}`, 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`Reddit request failed (${res.status})`);
  return res.json();
}

function localDate(utcSeconds: number): string {
  const d = new Date(utcSeconds * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Finds the daily thread for `date` (YYYY-MM-DD) and returns its top workout comments. */
export async function fetchDailyWorkout(date: string): Promise<DailyWorkout | null> {
  const listing = await redditGet(`/r/${SUBREDDIT}/new?limit=100&raw_json=1`);
  const thread = listing.data.children
    .map((c: any) => c.data)
    .find((p: any) => isDailyThread(p) && localDate(p.created_utc) === date);
  if (!thread) return null;

  const [, comments] = await redditGet(`/comments/${thread.id}?sort=top&depth=1&limit=50&raw_json=1`);
  const topLevel: RedditComment[] = comments.data.children.filter((c: any) => c.kind === 't1').map((c: any) => c.data);
  const posts: WorkoutPost[] = workoutComments(topLevel).map((c) => ({
    id: c.id,
    author: c.author,
    score: c.score,
    permalink: `https://www.reddit.com${c.permalink}`,
    body: c.body,
    sections: parseWorkout(c.body),
  }));

  const topOverview = posts[0]?.sections.find((s) => s.station === 'notes')?.lines.join(' ') ?? '';
  return {
    date,
    threadTitle: thread.title,
    threadUrl: `https://www.reddit.com${thread.permalink}`,
    template: guessTemplate(`${thread.title} ${topOverview}`),
    posts,
    source: 'reddit',
    fetchedAt: new Date().toISOString(),
  };
}
