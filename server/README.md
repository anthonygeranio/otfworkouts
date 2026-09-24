# Class Preview notifier

A Cloudflare Worker that checks the r/orangetheory daily thread every 10 minutes
and sends one "Today's workout is up" push to each subscribed phone when the
first workout comment appears. Pushes are held until 6am in each phone's time zone.

It stores only push tokens, time zones, and the id of the last thread it
announced. It never stores Reddit comment text.

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
4. Once Reddit approves API access: `npx wrangler secret put REDDIT_CLIENT_ID`
   (and `REDDIT_CLIENT_SECRET` if the Reddit app type has one).
5. `npm run deploy`, then put the printed URL in the app's `.env` as `EXPO_PUBLIC_API_URL`.

## Endpoints

- `POST /devices` `{ token, timezone }` subscribes a phone.
- `DELETE /devices` `{ token }` unsubscribes it.
- `GET /health` shows the most recently detected workout.
