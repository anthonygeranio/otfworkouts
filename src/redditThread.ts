// Shared by the app and the notifier server so both agree on what counts as
// "the daily thread" and "a workout comment". Works on the RSS feed shapes.
import { guessTemplate, looksLikeWorkout, parseWorkout } from './parser';
import type { FeedComment, FeedPost } from './rssParser';

export const SUBREDDIT = 'orangetheory';

// Confirmed against the live subreddit (Sept 2026): every daily thread is titled
// "Daily Workout and General Chat for <Weekday>, MM/DD/YY" (one older variant
// inserts "thread"). Matching the phrase avoids false hits like "First workout…".
export const THREAD_TITLE_PATTERN = /daily workout and general chat/i;

export function isDailyThread(post: Pick<FeedPost, 'title'>): boolean {
  return THREAD_TITLE_PATTERN.test(post.title);
}

/**
 * The comments that actually describe a workout, keeping the feed's order (which
 * is Reddit's "top" sort). Chatter replies are dropped; an image with a workout-y
 * caption (e.g. "2G intel") is kept even when it has little text.
 */
export function workoutComments(comments: FeedComment[]): FeedComment[] {
  return comments.filter((c) => looksLikeWorkout(c.body) || (c.imageUrls.length > 0 && looksWorkoutish(c.body)));
}

function looksWorkoutish(body: string): boolean {
  return /\b(intel|template|2g|3g|tread|row|floor|block|phase|dri-?tri|hyrox)\b/i.test(body);
}

/** Short notification text, e.g. "Endurance · Tread, Rower, Floor". */
export function workoutSummary(body: string): string {
  const sections = parseWorkout(body).filter((s) => s.station !== 'notes');
  const stations = [...new Set(sections.map((s) => ({ tread: 'Tread', row: 'Rower', floor: 'Floor' })[s.station as 'tread']))];
  const template = guessTemplate(body.split('\n')[0]);
  return [template, stations.join(', ')].filter(Boolean).join(' · ') || "Tap to see today's class.";
}
