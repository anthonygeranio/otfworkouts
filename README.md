# Class Preview

An unofficial mobile app that shows the day's Orangetheory class, as posted by
members in the r/orangetheory daily thread.

## Run it

    npm install
    npx expo start        # scan the QR code with Expo Go on your phone
    npx expo start --web  # or preview in a browser

It uses built-in sample data until you add a Reddit client id.

## Connect real Reddit data

1. Go to https://www.reddit.com/prefs/apps, click "create another app", and choose **installed app**.
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_REDDIT_CLIENT_ID`.
3. Check `THREAD_TITLE_PATTERN` in `src/reddit.ts` against the subreddit's real daily-thread title.

## How it works

- `src/reddit.ts` gets an app-only OAuth token, finds the day's thread, and pulls its top-level comments sorted by votes.
- `src/parser.ts` turns each free-form comment into Tread / Rower / Floor sections.
- `src/workouts.ts` caches each day on the device for up to 6 hours, so deleted Reddit comments drop out. Pulling down refreshes.

Not affiliated with Orangetheory Fitness. Keep it free, credit the posters, and follow Reddit's API terms.
