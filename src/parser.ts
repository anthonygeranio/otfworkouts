import type { Station, WorkoutSection } from './types';

// OTF "intel" comments put each block on its own line, with the steps inside a
// block separated by " * " (an inline bullet), e.g.
//   "Tread Block 1 - 10 minutes * Goal: ... * 240m tread @ 1% * Back-to-back: ..."
// Casual posts instead use "Tread:" style headers. We handle both.
const STATION_PATTERNS: [Station, RegExp][] = [
  ['tread', /tread|treadmill|\brun\b|power ?walk/i],
  ['row', /\brow(er|ing)?\b|water ?rower/i],
  ['floor', /floor|weight ?room|\bbench\b|strength|trx/i],
];

const TEMPLATE_PATTERN =
  /\b(strength\s*50|esp|endurance|power|tornado|2g|3g|dri-?tri|everest|lift\s*45|strength)\b/i;

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s*/, '')
    .replace(/^>\s*/, '')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/, '')
    .trim();
}

function stationFor(header: string): Station | null {
  for (const [station, pattern] of STATION_PATTERNS) if (pattern.test(header)) return station;
  return null;
}

// A block header names a station and is a heading, not a mid-workout instruction:
// "Tread Block 1 - 10 minutes", "Rower", "Floor Block - 12 minutes circuit".
// Transitions like "90 sec to transition to the rower" start with a number, so
// requiring the line to start with a station word (or contain "block"/"circuit")
// keeps them out.
function headerStation(segment: string): Station | null {
  const s = segment.trim();
  // Headers are short and heading-like; a long sentence that merely contains
  // "block" (e.g. "a whole 10 minute block dedicated to…") is not a header.
  if (s.length > 60 || /^\d/.test(s)) return null;
  if (/\b(block|circuit)\b/i.test(s) || /^(tread|treadmill|row|rower|floor|weight ?room|bench|run|power ?walk)\b/i.test(s)) {
    return stationFor(s);
  }
  return null;
}

export function parseWorkout(body: string): WorkoutSection[] {
  const sections: WorkoutSection[] = [];
  let current: WorkoutSection = { station: 'notes', title: 'Overview', lines: [] };
  const flush = () => {
    if (current.lines.length || current.station !== 'notes') sections.push(current);
  };

  for (const rawLine of body.split(/\r?\n/)) {
    const line = stripMarkdown(rawLine);
    if (!line) continue;

    // Split the line into an optional header plus " * "-separated bullets.
    const [head, ...bullets] = line.split(/\s+\*\s+/);
    const station = headerStation(head);

    if (station) {
      flush();
      current = { station, title: head.replace(/\s*[-–—:]\s*$/, '').trim(), lines: [] };
      bullets.forEach((b) => current.lines.push(stripMarkdown(b)));
    } else if (current.station === 'notes') {
      // Intro lines before the first block become the overview.
      [head, ...bullets].forEach((b) => current.lines.push(stripMarkdown(b)));
    } else if (bullets.length) {
      // A bulleted line with no station header — keep the bullets in the current block.
      [head, ...bullets].forEach((b) => current.lines.push(stripMarkdown(b)));
    } else {
      // A lone line between blocks is a transition, e.g. "90 sec to the rower".
      current.lines.push(`→ ${head}`);
    }
  }
  flush();
  return sections;
}

export function guessTemplate(text: string): string | undefined {
  const match = text.match(TEMPLATE_PATTERN);
  if (!match) return undefined;
  return match[1].replace(/\s+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** A comment is worth showing if it describes at least one station. */
export function looksLikeWorkout(body: string): boolean {
  return parseWorkout(body).some((s) => s.station !== 'notes');
}
