// Shared by the app and the notifier server, so both agree on what counts as
// "the daily thread" and "a workout comment".
import { guessTemplate, looksLikeWorkout, parseWorkout } from './parser';

export const SUBREDDIT = 'orangetheory';
// Title words the daily thread uses. Confirm against the live subreddit.
export const THREAD_TITLE_PATTERN = /daily|workout of the day|today'?s workout/i;

export interface RedditPost {
  id: string;
  title: string;
  permalink: string;
  created_utc: number;
}

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  score: number;
  permalink: string;
  stickied: boolean;
}

export function isDailyThread(post: RedditPost): boolean {
  return THREAD_TITLE_PATTERN.test(post.title);
}

/** Top-level comments that describe at least one station, in the order given. */
export function workoutComments(comments: RedditComment[]): RedditComment[] {
  return comments.filter((c) => !c.stickied && looksLikeWorkout(c.body));
}

/** Short notification text, e.g. "Endurance · Tread, Rower, Floor". */
export function workoutSummary(comment: RedditComment): string {
  const sections = parseWorkout(comment.body).filter((s) => s.station !== 'notes');
  const stations = [...new Set(sections.map((s) => ({ tread: 'Tread', row: 'Rower', floor: 'Floor' })[s.station as 'tread']))];
  const template = guessTemplate(comment.body.split('\n')[0]);
  return [template, stations.join(', ')].filter(Boolean).join(' · ');
}
