# App Privacy answers (App Store Connect → App Privacy)

Apple asks you to declare data collection. Answer exactly this — it matches what
the app actually does (see docs/privacy.html).

## "Do you or your third-party partners collect data from this app?"
**Yes** — but only if the user enables notifications. (Apple counts optional data.)

## Data types collected

### 1. Identifiers → Device ID
- **What:** the push notification token (an anonymous Expo/APNs token).
- **Linked to the user's identity?** No.
- **Used for tracking?** No.
- **Purposes:** App Functionality (to deliver the requested notification).

### 2. Other Data → "Other Data Types"  (label it: "Time zone")
- **What:** the device's IANA time zone name, to schedule quiet hours.
- **Linked to the user's identity?** No.
- **Used for tracking?** No.
- **Purposes:** App Functionality.

## Everything else
- No Contact Info, Health, Financial, Location, Browsing/Search History,
  Contacts, User Content, Usage Data, Diagnostics, or Purchases collected.
- No third-party advertising. No analytics SDKs.
- "Tracking" (ATT): **No** — the app does not track, so no App Tracking
  Transparency prompt is needed.

## Note if asked about accounts
- The app has no account system and no login.
