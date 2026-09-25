// Pure transform: Reddit RSS text -> the app's DailyWorkout. No network here, so
// it runs the same in the server and in tests.
import { guessTemplate, parseWorkout } from './parser';
import { isDailyThread, workoutComments } from './redditThread';
import { parseFeedComments, parseFeedPosts, type FeedPost } from './rssParser';
import type { DailyWorkout, WorkoutPost } from './types';

export function localDate(utcSeconds: number): string {
  const d = new Date(utcSeconds * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The date is written in the title ("…for Friday, 09/25/26"), which is far more
 * reliable than the post timestamp across time zones. Returns YYYY-MM-DD, or null.
 */
export function titleDate(title: string): string | null {
  const m = title.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const [, mm, dd, yy] = m;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/** Finds the daily thread for `date` (YYYY-MM-DD) in a subreddit listing feed. */
export function findDailyThread(listingXml: string, date: string): FeedPost | null {
  return (
    parseFeedPosts(listingXml).find(
      (p) => isDailyThread(p) && (titleDate(p.title) ?? localDate(p.createdUtc)) === date,
    ) ?? null
  );
}

/** Builds the day's workout from the thread's comment feed. Returns null if no workout was posted yet. */
export function buildWorkout(thread: FeedPost, commentsXml: string, date: string): DailyWorkout | null {
  const posts: WorkoutPost[] = workoutComments(parseFeedComments(commentsXml)).map((c) => ({
    id: c.id,
    author: c.author,
    score: null, // RSS omits vote counts; feed order already reflects "top".
    permalink: c.permalink.startsWith('http') ? c.permalink : `https://www.reddit.com${c.permalink}`,
    body: c.body,
    sections: parseWorkout(c.body),
    imageUrls: c.imageUrls.length ? c.imageUrls : undefined,
  }));
  if (!posts.length) return null;

  const topText = `${thread.title} ${posts[0].body.split('\n')[0]}`;
  return {
    date,
    threadTitle: thread.title,
    threadUrl: `https://www.reddit.com${thread.permalink}`,
    template: guessTemplate(topText),
    posts,
    source: 'reddit',
    fetchedAt: new Date().toISOString(),
  };
}
