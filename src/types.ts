export type Station = 'tread' | 'row' | 'floor' | 'notes';

export interface WorkoutSection {
  station: Station;
  title: string;
  lines: string[];
}

/** One community-posted description of the day's class (a Reddit comment). */
export interface WorkoutPost {
  id: string;
  author: string;
  score: number;
  permalink: string;
  body: string;
  sections: WorkoutSection[];
}

export interface DailyWorkout {
  /** YYYY-MM-DD, in the thread's local day. */
  date: string;
  threadTitle: string;
  threadUrl: string;
  /** e.g. "Strength 50", "ESP", "Tornado" — best guess pulled from the top post. */
  template?: string;
  /** Highest-voted post first. */
  posts: WorkoutPost[];
  source: 'reddit' | 'sample';
  fetchedAt: string;
}
