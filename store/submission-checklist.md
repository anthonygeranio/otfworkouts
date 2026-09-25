# Submission checklist — OTF Workouts

Work top to bottom. ✅ = done in the repo. 👉 = needs you (account/manual).

## 1. Assets & metadata (✅ ready in repo)
- ✅ App icon: `assets/icon.png` (1024×1024, opaque)
- ✅ Screenshots: `store-assets/screenshot-*-1290x2796.png`
- ✅ Listing copy: `store/listing.md`
- ✅ App Privacy answers: `store/app-privacy-answers.md`
- ✅ Reviewer notes: `store/review-notes.md`
- ✅ Privacy policy page: `docs/privacy.html`

## 2. Host the privacy policy (👉 you, ~2 min, free)
Apple requires a public Privacy Policy URL.
1. On GitHub: repo **Settings → Pages**.
2. Source: **Deploy from a branch**, branch **main**, folder **/docs**. Save.
3. Wait ~1 min. Your URL becomes:
   `https://anthonygeranio.github.io/otfworkouts/privacy.html`
4. Open it to confirm it loads. (It's already in `store/listing.md`.)

## 3. Apple Developer Program (👉 you, $99/yr)
- Enroll at https://developer.apple.com/programs/ (1–2 days to approve).

## 4. Decide the name/branding (👉 you)
- Read `store/IMPORTANT-trademark.md` and choose final name + icon.
- If you rename: tell me and I'll update `app.json` `name`, the screenshots, and copy.

## 5. Build & test (I can drive once #3 is done)
- `eas build --platform ios --profile production`  (cloud build, no Mac needed)
- First build will ask to create an App Store Connect app record + bundle ID
  (`com.anthonygeranio.otfworkouts`) — say yes.
- `eas submit --platform ios --latest`  → uploads to App Store Connect.
- Add yourself as a TestFlight tester and try the real build before public review.

## 6. App Store Connect listing (👉 you, I'll guide field-by-field)
- Create the app (if not auto-created), pick category Health & Fitness.
- Paste everything from `store/listing.md`.
- Upload the two screenshots from `store-assets/`.
- Fill **App Privacy** from `store/app-privacy-answers.md`.
- Fill **App Review Information** notes from `store/review-notes.md`; sign-in: No.
- Set age rating 4+, price Free.
- Submit for review.

## 7. After review
- Typical review time: ~24–48 hours.
- If rejected on 4.1/5.2 (branding), the fix is the descriptive rename in step 4.

## Server reminder
The notifier server must stay deployed (Cloudflare) and the app's `.env`
`EXPO_PUBLIC_API_URL` must point to it in the production build. It already does.
