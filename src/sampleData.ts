import { guessTemplate, parseWorkout } from './parser';
import type { DailyWorkout } from './types';

// Invented placeholder workouts, written the way community comments look so they
// exercise the real parser. Shown only when no Reddit client id is configured.
export const SAMPLE_COMMENTS: Record<number, { author: string; score: number; body: string }[]> = {
  0: [
    {
      author: 'sample_user_1',
      score: 142,
      body: `Endurance day, 2G. Blocks repeat twice.

**Tread:**
- 3:00 base, 2:00 push at +1%
- 1:00 all out @ 4%
- 30s recovery, repeat

**Rower:**
- 300m, 250m, 200m
- Each one faster than the last

**Floor:**
- 10 goblet squats
- 10 alternating reverse lunges
- 12 bent-over rows
- 30s plank shoulder taps`,
    },
    {
      author: 'sample_user_2',
      score: 38,
      body: `Did the 5am. Tread: long pushes, not many all outs. Kept it 2% for the power walkers.
Rower: ladders, bring water.
Floor: squats and lunges, arms were light.`,
    },
  ],
  1: [
    {
      author: 'sample_user_3',
      score: 97,
      body: `Strength 50 – lower body focus

## Floor
1. Deadlift x 12
2. Split squat x 10 / side
3. Glute bridge on bench x 15
4. TRX hamstring curl x 10

## Tread
- 6 x 45s push, 30s base
- Finish with a 1:00 all out

## Rower
- 150m sprints between floor blocks`,
    },
  ],
  2: [
    {
      author: 'sample_user_4',
      score: 120,
      body: `Power, 3G. Short and nasty.

Tread: 30s all outs x 6, 30s recovery between
Rower: 200m @ max, 1 min rest, x 3
Floor:
- Skater jumps x 20
- Push press x 10
- Medicine ball slams x 12`,
    },
  ],
};

export function sampleWorkout(date: string, daysAgo: number): DailyWorkout | null {
  const comments = SAMPLE_COMMENTS[daysAgo];
  if (!comments) return null;
  const posts = comments.map((c, i) => ({
    id: `sample-${daysAgo}-${i}`,
    author: c.author,
    score: c.score,
    permalink: 'https://www.reddit.com/r/orangetheory/',
    body: c.body,
    sections: parseWorkout(c.body),
  }));
  return {
    date,
    threadTitle: 'Daily workout thread (sample data)',
    threadUrl: 'https://www.reddit.com/r/orangetheory/',
    template: guessTemplate(comments[0].body.split('\n')[0]),
    posts,
    source: 'sample',
    fetchedAt: new Date().toISOString(),
  };
}
