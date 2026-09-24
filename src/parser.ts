import type { Station, WorkoutSection } from './types';

// Community posts are free-form markdown, so we match common header words
// ("Tread:", "**Rower**", "## Floor", "Weight room") to split them by station.
const STATION_PATTERNS: [Station, RegExp][] = [
  ['tread', /^(tread(mill)?s?|run|power walk)/i],
  ['row', /^(row(er|ing)?s?|water ?rower)/i],
  ['floor', /^(floor|weight ?room|strength|trx|bench)/i],
];

const TEMPLATE_PATTERN =
  /\b(strength\s*50|esp|endurance|power|tornado|2g|3g|dri-?tri|everest|lift\s*45|strength)\b/i;

function stripMarkdown(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, '')
    .replace(/^>\s*/, '')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/^\s*[-*+]\s+/, '• ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function detectHeader(line: string): { station: Station; title: string; rest: string } | null {
  // A header is a short line like "Tread:" or "Rower - 3 rounds:" or "**Floor**".
  const clean = stripMarkdown(line).replace(/^•\s*/, '');
  const [head, ...restParts] = clean.split(/:\s*/);
  if (head.length > 40) return null;
  for (const [station, pattern] of STATION_PATTERNS) {
    if (pattern.test(head)) {
      return { station, title: head.trim(), rest: restParts.join(': ').trim() };
    }
  }
  return null;
}

export function parseWorkout(body: string): WorkoutSection[] {
  const sections: WorkoutSection[] = [];
  let current: WorkoutSection = { station: 'notes', title: 'Overview', lines: [] };

  // Casual posts often run stations together: "Did the 5am. Tread: pushes. Rower: ladders."
  const normalized = body.replace(/([.!?])\s+(?=(tread|row|floor|weight ?room)\w*\s*:)/gi, '$1\n');

  for (const raw of normalized.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const header = detectHeader(raw);
    if (header) {
      if (current.lines.length) sections.push(current);
      current = { station: header.station, title: header.title, lines: [] };
      if (header.rest) current.lines.push(header.rest);
    } else {
      current.lines.push(stripMarkdown(raw));
    }
  }
  if (current.lines.length) sections.push(current);
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
