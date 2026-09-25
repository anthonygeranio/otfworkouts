import type { DailyWorkout } from './types';

// The app reads workouts from our own notifier server (see server/), which fetches
// and parses Reddit's public RSS once for everyone. Set in .env; empty = sample data.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

export const useSampleData = () => API_URL.length === 0;

/** Gets the parsed workout for a date (YYYY-MM-DD) from our server. */
export async function fetchDailyWorkout(date: string): Promise<DailyWorkout | null> {
  const res = await fetch(`${API_URL}/workout?date=${date}`);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const { workout } = (await res.json()) as { workout: DailyWorkout | null };
  return workout;
}
