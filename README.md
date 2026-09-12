# Love Wonders — setup

A static web app (no build step, all files flat in one folder) using
Firebase Auth + Firestore. No Firebase Storage and no billing plan needed —
photos are compressed to small JPEGs in the browser and stored as data
strings directly on the Firestore document.

## 1. Firebase project
1. Create a project at console.firebase.google.com.
2. Enable **Authentication** → Sign-in providers → turn on **Email/Password** and **Google**.
3. Enable **Firestore** (production mode).
4. Project settings → General → add a **Web app** → copy the config values into `firebase-config.js` (must be a plain `export const firebaseConfig = {...}` — not the console's own init snippet).

## 2. Firestore security rules
Paste into Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }
    match /threads/{threadId} {
      allow read: if request.auth != null && request.auth.uid in resource.data.participants;
      allow create, update: if request.auth != null
        && request.auth.uid in request.resource.data.participants;
    }
    match /threads/{threadId}/messages/{messageId} {
      allow read: if request.auth != null && threadId.matches('.*' + request.auth.uid + '.*');
      allow create: if request.auth != null && request.resource.data.from == request.auth.uid;
    }
    match /reports/{reportId} {
      allow create: if request.auth != null && request.resource.data.reporterUid == request.auth.uid;
      allow read, update, delete: if false; // reports are write-only from the client; review them in the console
    }
  }
}
```

## 2b. Firestore indexes (required for Messages to load)
The Messages inbox queries `threads` by `participants array-contains <you>`
ordered by `lastAt desc` — Firestore needs a composite index for that combo,
and it won't exist yet on a fresh project. Without it, the inbox listener
fails silently (you'll see a `failed-precondition ... requires an index`
error in the console) and just sits on its loading state — the app itself
now recovers gracefully and shows a retry message, but the index still
needs to be created for Messages to actually work.

Two ways to create it:
- **Fastest:** open the app, trigger the error once, and click the link
  Firestore prints in the browser console (`...firestore/indexes?create_composite=...`) —
  it pre-fills everything.
- **Or deploy directly:** this project ships a `firestore.indexes.json` with
  the same index already defined. Run `firebase deploy --only firestore:indexes`
  from the project folder (needs the Firebase CLI + `firebase init` done once
  to link it to your project).

Either way, the index takes a minute or two to finish building after you
create it.

## 3. How the ID-code privacy system works
Nothing about it lives in security rules. A member's social links and extra
photos are AES-encrypted **in the browser** using their own ID code as the
key (`crypto-utils.js`), before the ciphertext is ever written to
Firestore. Anyone can technically read that field — it's unreadable noise
without the code. Handing someone your code is what unlocks it, and
**renewing your code re-encrypts with a new key**, which is what silently
revokes everyone who only had the old one.

This means: don't lose the code as the owner (you need it to re-save your
own private fields), and treat it like a shared secret, not a password —
there's no "forgot code" recovery by design. (Forgotten *passwords* are
handled separately — see below.)

## 4. What's in the app
- **Auth**: email/password and Google sign-in, plus a "Forgot password?"
  link on the login screen (Firebase's own reset-email flow).
- **Profile**: name, bio, a real photo upload (resized in-browser, no file
  URLs to paste), age/gender/country/city/ethnicity/nationality, a public
  member number (`LW-######`, for direct lookup — separate from your
  private ID code), relationship intent, religion, education, occupation,
  languages spoken and free-text interest tags, an "online now" status
  (toggleable) kept fresh by `presence.js`, and a separate "Your taste"
  section for age-range/country/ethnicity/nationality preferences.
- **Discover**: text search (name/bio/city/country/member number), a
  filter panel (age, country, ethnicity, nationality, language, religion,
  relationship intent, online-now, has-photo), sortable by newest or most
  active, savable filter presets (per-device, via `localStorage`), a
  "Your likes" row, and a "Recommended for you" row that scores every
  visible member against your taste preferences (`recommend.js`) and
  shows the best matches first — it never hides anyone, it just re-orders.
- **Likes**: tap the heart on any card or profile to like someone — it's
  stored on your own user doc (`likes: [uid, …]`), so no extra security
  rule is needed to see who liked whom back. A mutual like shows a small
  note on their profile.
- **Privacy**: only photo, name, bio, age and rough location are public.
  Social links and extra photos stay encrypted until someone enters the
  owner's code.
- **Safety**: Block (hides someone from your Discover permanently) and
  Report (writes to a `reports` collection for manual review) on every
  profile, plus a Help & Safety card in Settings with basic guidelines
  and a direct contact link (artyourtaste@gmail.com).
- **Messages**: a dedicated inbox page (`messages.html`) listing every
  conversation you've started — avatar, name, last message preview,
  relative timestamp, and an unread dot — next to a real chat panel:
  header with the other person's photo, date dividers, per-message
  timestamps, a "seen" tick once they've opened the thread, a typing
  indicator, an auto-growing input (Enter to send, Shift+Enter for a new
  line), and an empty state on a fresh conversation. The same chat panel
  also opens inline from a profile card in Discover. Each thread is
  backed by a `threads/{id}` doc (`participants`, `lastText`, `lastAt`,
  `lastFrom`, `lastRead.{uid}`, `typing.{uid}`) plus its
  `threads/{id}/messages` subcollection — that's what makes the inbox
  and read/typing state possible. Firestore will likely prompt you once
  for a composite index on `threads` (`participants` array-contains +
  `lastAt` order) the first time the inbox query runs — just follow the
  link it gives you in the console.
- **Theme**: colors are sampled straight from `favicon.jpg` — a warm
  coral accent (H22 S85% L56%) from the heart, a deep teal background
  from the water, gold/black by default, RGB sliders to retune the
  accent, and a light/dark mode toggle — all saved to `localStorage` and
  applied on every page via `theme.js`.

## 5. Running it
Any static file server works, e.g.:
```
npx serve .
```
Firebase Auth requires the page be served over `http://localhost` or
`https://`, not opened as a bare `file://` path.

## 6. Theme & notifications (new)
- **Theme**: a full "deep space" reskin — Orbitron/Rajdhani fonts, a
  violet/cyan duotone accent (still retunable live from Settings, same
  RGB picker as before), an animated starfield + nebula canvas behind
  every page (`starfield.js`), glassmorphism cards, and large border
  radii throughout (pill buttons, rounded panels — nothing sharp-cornered).
- **Save confirmations**: every save action across the app (profile,
  taste preferences, filter presets, likes, blocks, reports, ID code
  renewal, theme changes) now raises a themed, stacked toast
  (`notifications.js`) confirming it went through — a drop-in
  replacement for each page's old one-off toast div.
- **Taste-match notifications**: a bell icon (top bar, every
  authenticated page) with an unread badge and a history dropdown. While
  the app is open, it watches Firestore live for brand-new signups and,
  if they score against your saved taste preferences (`recommend.js`),
  raises an in-app notification plus a real browser Notification (if you
  grant permission when prompted). This works across tabs/windows in the
  background but — like the existing chat live-updates — still needs the
  tab open somewhere; see the point below on true push for when it's
  fully closed.
- **New-responder notifications**: the same bell/toast/browser-Notification
  pipeline also watches your message threads live and fires the moment
  someone "reaches out" — either their first message to you in a brand-new
  thread, or a reply back after you messaged them first (`lastFrom` on the
  thread is them, and it's new since the tab opened). The Messages inbox
  (`messages.html`) also has an **All / New responders** filter with a live
  count badge, so you can see exactly who's waiting on a reply from you
  without scanning the whole list.

## 7. App icon
All app icons — browser tab favicon, iOS/Android home-screen icon, and the
PWA install icon on desktop and mobile — are generated from `favicon.jpg`
(the heart-splash photo) rather than linking that raw file directly, since
it's a tall 694×1138 photo, not a square icon; forcing a non-square image
into an icon slot gets stretched or oddly cropped differently by every OS.
Generated once from the source photo via Pillow (see the script history in
this project if you ever need to regenerate it after swapping the photo):
- A square crop from the top of the photo (full splash + heart, since the
  plain lower reflection wasn't adding anything at icon size).
- Plain full-bleed PNGs at 16/32/48/96/192/512px plus a 180px
  `apple-touch-icon.png`, and a multi-size `favicon.ico` for older browsers.
- Two **maskable** PWA icons (192/512px) — Android/desktop launchers apply
  their own mask shape (circle, squircle, rounded square) and clip anything
  outside a centered safe zone, so these scale the art down onto a padded
  canvas in a teal sampled from the photo itself, instead of risking the
  heart or splash tips getting cut off.
`manifest.json` lists all five PWA sizes with the correct `purpose` per
icon (`any` vs `maskable`), and every page's `<head>` links the favicon set
and `apple-touch-icon.png` directly — swap in `favicon.jpg` and re-run the
same crop/resize steps if the source photo ever changes.

## 8. Still worth adding later
- No *background* push for new messages or new-member taste matches —
  both fire live (in-app toast/bell + browser Notification) whenever a tab
  is open, per section 6 above, but nothing arrives while the app is fully
  closed. True background push would need a service worker + FCM
  (or similar) and, for reliability, a small backend — out of scope for
  this static-file setup for now.
- No video calls or in-app translation — both need external services
  (WebRTC/TURN infrastructure, a translation API) rather than something
  that fits a no-backend static app.
- No native iOS/Android app — the manifest makes it installable as a PWA,
  which covers the "usable on your phone" need without a native build.
- No paid membership tiers — everything is free and unlimited by design;
  add tiers later only if that becomes a goal.
- The Discover feed loads every user in one query; once the member count
  grows you'll want to paginate instead.
- Reports land in Firestore but there's no admin screen to review them —
  check the `reports` collection directly in the Firebase console for now.
