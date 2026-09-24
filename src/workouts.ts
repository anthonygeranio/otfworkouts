import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchDailyWorkout, isRedditConfigured } from './reddit';
import { sampleWorkout } from './sampleData';
import type { DailyWorkout } from './types';

const CACHE_PREFIX = 'workout:';

export function dateFor(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function readCache(date: string): Promise<DailyWorkout | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + date);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeCache(workout: DailyWorkout) {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + workout.date, JSON.stringify(workout));
  } catch {
    // Cache is best-effort.
  }
}

// Reddit content must not outlive deletions by its authors, so cached days
// expire and are refetched rather than kept indefinitely.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function isFresh(workout: DailyWorkout): boolean {
  return Date.now() - Date.parse(workout.fetchedAt) < CACHE_TTL_MS;
}

/**
 * Serves a day from cache while it's fresh (unless `preferCache` is false, as on
 * pull-to-refresh), otherwise refetches. Expired entries are discarded, never shown.
 */
export async function loadWorkout(daysAgo: number, preferCache = true): Promise<DailyWorkout | null> {
  const date = dateFor(daysAgo);
  if (!isRedditConfigured()) return sampleWorkout(date, daysAgo);

  let cached = await readCache(date);
  if (cached && !isFresh(cached)) {
    await AsyncStorage.removeItem(CACHE_PREFIX + date).catch(() => {});
    cached = null;
  }
  if (cached && preferCache) return cached;

  try {
    const fresh = await fetchDailyWorkout(date);
    if (fresh) await writeCache(fresh);
    else await AsyncStorage.removeItem(CACHE_PREFIX + date).catch(() => {});
    return fresh;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}
