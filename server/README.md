# Class Preview notifier

A Cloudflare Worker that reads r/orangetheory's public RSS feed every 10 minutes,
parses the day's workout, and:
- serves it to the app at `GET /workout?date=YYYY-MM-DD` (so phones hit this server,
  not Reddit — Reddit sees one polite reader), and
- sends one "Today's workout is up" push to each subscribed phone when the workout
  first appears, held until 6am in each phone's time zone.

No Reddit API key is needed — it uses the public `.rss` feeds Reddit publishes for
readers, identifying itself honestly and backing off on 429. Parsed workouts are
cached for 6 hours (so deletions propagate); it also stores push tokens and time zones.

## Local test (no accounts needed)

    npm install
    cp .dev.vars.example .dev.vars     # FAKE_REDDIT=1 uses sample workouts
    npm run db:init:local
    npm run dev
    # in another terminal, trigger the 10-minute check by hand:
    curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/10+*+*+*+*"
    curl http://localhost:8787/health

## Deploy

1. Create a free Cloudflare account, then `npx wrangler login`.
2. `npx wrangler d1 create class-preview`, then paste the printed `database_id` into `wrangler.jsonc`.
3. `npm run db:init`
4. `npm run deploy`, then put the printed URL in the app's `.env` as `EXPO_PUBLIC_API_URL`.

No secrets to set — the public RSS feeds need no key.

## Endpoints

- `GET /workout?date=YYYY-MM-DD` returns the parsed workout for that day (or `{ workout: null }`).
- `POST /devices` `{ token, timezone }` subscribes a phone.
- `DELETE /devices` `{ token }` unsubscribes it.
- `GET /health` shows the most recently detected workout.
