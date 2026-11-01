<div align="center">

# 🏏 CricScorer Pro

### Modern cricket scoring, player analytics and match management for Android & the web

[![Version](https://img.shields.io/badge/version-1.0.9-2563EB?style=flat-square)](package.json)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF?style=flat-square&logo=capacitor&logoColor=white)](https://capacitorjs.com/)
[![Firebase](https://img.shields.io/badge/Firebase-12-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/license-MIT-16A34A?style=flat-square)](LICENSE)

**Score local cricket matches ball-by-ball, manage players and tournaments, and review detailed scorecards and analytics.**

[Features](#-features) · [Getting Started](#-getting-started) · [Android](#-android-build) · [Releases](#-releases) · [Development](#-development)

</div>

---

## ✨ Features

- **Live ball-by-ball scoring** with dedicated innings and match-flow screens
- **Complete scorecards** for batting, bowling and match results
- **Player profiles & statistics** with dedicated analytics views
- **Match history** for reviewing previously scored games
- **Tournament management** including tournament creation and match organization
- **Match configuration** for custom local-cricket formats
- **Manual score entry** when a full live-scoring flow is not needed
- **Firebase integration** for authentication and cloud-backed app data
- **Google sign-in support** in the Android application
- **Responsive web UI + Android app** powered by React, Vite and Capacitor

## 🧱 Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | React 18, React Router |
| Build | Vite 7 |
| Mobile | Capacitor 8, Android |
| Backend / Sync | Firebase |
| Motion | Framer Motion |
| Charts | Recharts |
| Local data | IndexedDB (`idb`) |
| PDF / sharing | jsPDF, html2canvas, Capacitor Share |

## 🚀 Getting Started

### Requirements

- Node.js 22+
- npm
- For Android builds: Android Studio / Android SDK and a compatible JDK

### Install

```bash
git clone https://github.com/risingsword/cricscorer-pro.git
cd cricscorer-pro
npm ci
```

### Run locally

```bash
npm run dev
```

### Production web build

```bash
npm run build
```

## 🤖 Android Build

Build the web application, sync it into the native project, then build Android:

```bash
npm ci
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

On Windows PowerShell, use:

```powershell
npm ci
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

The debug APK is generated under:

```text
android/app/build/outputs/apk/debug/
```

## 📦 Releases

This repository includes a GitHub Actions release workflow.

A tag matching `v*` triggers an Android build and creates a GitHub Release with the generated installable debug APK attached.

Example:

```bash
git checkout main
git pull
git tag v1.0.10
git push origin v1.0.10
```

GitHub will then build the app and publish the release automatically.

> **Production signing:** the automated workflow currently creates a debug-signed APK so releases work without storing a private Android signing key in the repository. A Play Store / production release should use a protected keystore stored in GitHub Actions secrets.

## 🧑‍💻 Development

Useful commands:

```bash
npm run dev      # Start Vite development server
npm run lint     # Run ESLint
npm run build    # Create production web build
npm run preview  # Preview production build
```

### Repository layout

```text
cricscorer-pro/
├── src/
│   ├── components/      # Reusable UI and scoring components
│   ├── context/         # Application state / match state
│   ├── hooks/           # React hooks
│   ├── pages/           # App screens (scoring, analytics, players, etc.)
│   └── utils/           # Shared utilities
├── android/             # Capacitor Android project
├── public/              # Public web assets
├── .github/             # CI, release and contribution automation
├── AGENTS.md            # Codex repository instructions
└── package.json
```

## 🤝 Contributing

1. Create a branch from `main`.
2. Make the change.
3. Run `npm run lint` and `npm run build`.
4. Open a pull request with a clear summary and test notes.

For Codex, repository-specific instructions are kept in [`AGENTS.md`](AGENTS.md).

## 🔐 Security

Do not commit private signing keys, service-account credentials, passwords or other secrets. Firebase client configuration should be treated according to Firebase's security model, while privileged credentials must remain outside the repository.

## 📄 License

Licensed under the [MIT License](LICENSE).

---

<div align="center">

Built for fast, reliable local cricket scoring. 🏏

</div>
