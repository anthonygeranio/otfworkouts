# Class Preview

An unofficial mobile app that shows the day's Orangetheory class, as posted by
members in the r/orangetheory daily thread.

## Run it

    npm install
    npx expo start        # scan the QR code with Expo Go on your phone
    npx expo start --web  # or preview in a browser

It uses built-in sample data until you point it at your server.

## Connect real data

The app doesn't call Reddit directly. Your own server (in `server/`) reads Reddit's
public RSS feed once, parses the workout, and serves it to every phone — so Reddit
sees one polite reader instead of thousands of app opens.

1. Deploy the server (see `server/README.md`).
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the server's URL.

## How it works

- `server/` fetches the r/orangetheory daily thread's comment RSS every 10 min, parses it, caches it, and pushes subscribers when the workout first appears.
- `src/rssParser.ts` + `src/buildWorkout.ts` turn Reddit's Atom feed into the app's data (shared by app and server).
- `src/parser.ts` turns each free-form comment into Tread / Rower / Floor sections.
- `src/reddit.ts` reads the parsed workout from the server; `src/workouts.ts` caches each day on the device for up to 6 hours, so deleted comments drop out. Pulling down refreshes.

## Notifications

The bell button subscribes the phone to a push when the day's workout is posted.
This needs the notifier server in `server/` deployed (see `server/README.md`),
`EXPO_PUBLIC_API_URL` set, and an EAS project id (`npx eas-cli init`).
Push works in Expo Go on iPhone; Android needs a development build.

Not affiliated with Orangetheory Fitness. Keep it free, credit the posters, and follow Reddit's API terms.
