// Parses Reddit's public Atom feeds (…/.rss). No DOM APIs, so it runs in the app,
// in a Cloudflare Worker, and in Node. Reddit's feed markup is simple and stable,
// so targeted regexes are enough; anything unparseable is skipped, not thrown.

export interface FeedPost {
  id: string; // e.g. "t3_abc123"
  title: string;
  permalink: string;
  createdUtc: number;
}

export interface FeedComment {
  id: string; // e.g. "t1_abc123"
  author: string; // without "/u/"
  body: string; // plain text, markdown/HTML stripped
  permalink: string;
  imageUrls: string[]; // workouts posted as screenshots
}

function decodeEntities(s: string): string {
  return s
    .replace(/&(?:amp|#38);/g, '&')
    .replace(/&(?:lt|#60);/g, '<')
    .replace(/&(?:gt|#62);/g, '>')
    .replace(/&(?:quot|#34);/g, '"')
    .replace(/&(?:apos|#39);/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function tag(entry: string, name: string): string {
  const m = entry.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : '';
}

function attr(entry: string, name: string, a: string): string {
  const m = entry.match(new RegExp(`<${name}[^>]*\\b${a}="([^"]*)"`));
  return m ? m[1] : '';
}

function entries(xml: string): string[] {
  return xml.split('<entry>').slice(1).map((e) => e.slice(0, e.indexOf('</entry>')));
}

function relativePermalink(href: string): string {
  return href.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '');
}

/** Posts from a subreddit listing feed (…/r/<sub>/new/.rss). */
export function parseFeedPosts(xml: string): FeedPost[] {
  return entries(xml).flatMap((e) => {
    const id = decodeEntities(tag(e, 'id')).trim();
    if (!id.startsWith('t3_')) return [];
    const created = Date.parse(tag(e, 'updated') || tag(e, 'published'));
    return [
      {
        id,
        title: decodeEntities(tag(e, 'title')).trim(),
        permalink: relativePermalink(decodeEntities(attr(e, 'link', 'href'))),
        createdUtc: Number.isNaN(created) ? 0 : Math.floor(created / 1000),
      },
    ];
  });
}

/** Top-level comments from a post feed (…/comments/<id>/.rss). Feed order = Reddit's sort order. */
export function parseFeedComments(xml: string): FeedComment[] {
  return entries(xml).flatMap((e) => {
    const id = decodeEntities(tag(e, 'id')).trim();
    if (!id.startsWith('t1_')) return []; // skips the post entry itself
    // content is HTML that has itself been entity-encoded, so decode before stripping.
    const rawHtml = decodeEntities(tag(e, 'content'));
    const imageUrls = [...rawHtml.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)]
      .map((m) => m[1])
      .filter((u) => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u) || /(?:i|preview)\.redd\.it/.test(u));
    const body = decodeEntities(
      rawHtml
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<br\s*\/?>(?!\n)/gi, '\n')
        .replace(/<[^>]+>/g, ''),
    )
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return [
      {
        id,
        author: decodeEntities(tag(e, 'name')).replace(/^\/u\//, '').trim(),
        body,
        permalink: relativePermalink(decodeEntities(attr(e, 'link', 'href'))),
        imageUrls: [...new Set(imageUrls)],
      },
    ];
  });
}
