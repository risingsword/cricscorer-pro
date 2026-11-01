# AGENTS.md

## Project
CricScorer Pro is a React + Vite cricket scoring application packaged for Android with Capacitor and backed by Firebase.

## Goals for automated coding agents
- Preserve scoring correctness above visual changes.
- Do not silently change cricket rules or scoring semantics.
- Keep UI responsive and mobile-first.
- Prefer small, reviewable commits.
- Never commit secrets, signing keys, service-account credentials, or local environment files.

## Required checks before proposing a change
Run, when relevant:

```bash
npm ci
npm run lint
npm run build
```

For Android-affecting changes also run:

```bash
npx cap sync android
cd android
./gradlew assembleDebug
```

On Windows use `gradlew.bat`.

## Key areas
- `src/context/` — match/application state; treat changes here as high risk.
- `src/pages/LiveScoring.jsx` — live match scoring UI.
- `src/pages/Scorecard.jsx` — match scorecard presentation.
- `src/pages/Analytics.jsx` — statistics and charts.
- `src/pages/PlayerProfile.jsx` — player-level stats/profile.
- `android/` — Capacitor native Android project.

## Versioning and releases
- Use semantic-style tags such as `v1.0.10`.
- Keep `package.json`, Android `versionName`, and release tag aligned when preparing a formal release.
- Increment Android `versionCode` for each Android release.
- Pushing a `v*` tag triggers the GitHub release workflow.

## Pull requests
Every PR should include:
- concise summary
- affected screens / rules
- test evidence
- screenshots for meaningful UI changes
- note any migration, Firebase, or Android impact

## Safety
Do not weaken Firebase rules, authentication, ownership checks, or data validation without explicitly documenting the reason and impact.
