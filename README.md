<div align="center">

# 🏏 CricScorer Pro

### A modern cricket scoring app for Android

[![Android](https://img.shields.io/badge/Platform-Android-3DDC84?style=flat-square&logo=android&logoColor=white)](https://github.com/risingsword/cricscorer-pro/releases)
[![Version](https://img.shields.io/badge/version-1.0.9-2563EB?style=flat-square)](package.json)
[![License](https://img.shields.io/badge/license-MIT-16A34A?style=flat-square)](LICENSE)

**Score matches ball-by-ball, manage players and tournaments, and view detailed cricket statistics from your phone.**

[📦 Download APK](https://github.com/risingsword/cricscorer-pro/releases) · [🐛 Report a Bug](https://github.com/risingsword/cricscorer-pro/issues)

</div>

---

## 📱 About the App

CricScorer Pro is built for **Android phones** and is designed for local, gully and club cricket scoring.

The app handles the complete match flow—from team and player setup to live scoring, scorecards, player statistics and match history.

## ✨ Features

- 🏏 **Live ball-by-ball scoring**
- 📊 **Complete batting and bowling scorecards**
- 👤 **Player profiles and career statistics**
- 🏆 **Tournament creation and management**
- 🕘 **Match history**
- ⚙️ **Custom match settings**
- ✍️ **Manual score entry**
- 📈 **Analytics and performance tracking**
- ☁️ **Firebase-backed account and data support**
- 🔐 **Google sign-in on Android**
- 📤 **Sharing and PDF support**

## 📦 Download

Android builds are published on the **GitHub Releases** page.

➡️ **[Open Releases](https://github.com/risingsword/cricscorer-pro/releases)**

Each release can include the APK together with release notes describing what changed.

## 🛠️ Built With

CricScorer Pro is an Android application built with:

- **React** for the app interface
- **Capacitor** for the Android application layer
- **Firebase** for authentication and cloud-backed data
- **Framer Motion** for animations
- **Recharts** for statistics and charts

> React/Vite are implementation details used to build the Android app. CricScorer Pro is presented and distributed as a phone app.

## 🚀 Releases

The repository includes automated Android release tooling.

When a version tag such as `v1.0.10` is pushed, GitHub Actions can build the Android APK and create a GitHub Release automatically.

This keeps the release process simple when new versions are prepared with Codex or other development tools.

<details>
<summary><b>👨‍💻 Developer setup</b></summary>

<br>

This section is only for contributors or development tools. Normal app users do not need any of these commands.

### Requirements

- Node.js 22+
- npm
- Android Studio / Android SDK
- Compatible JDK

### Install dependencies

```bash
git clone https://github.com/risingsword/cricscorer-pro.git
cd cricscorer-pro
npm ci
```

### Run during development

```bash
npm run dev
```

### Build and sync Android

```bash
npm run build
npx cap sync android
```

### Build Android APK

Linux/macOS:

```bash
cd android
./gradlew assembleDebug
```

Windows:

```powershell
cd android
.\gradlew.bat assembleDebug
```

### Codex

Repository-specific instructions for Codex are available in [`AGENTS.md`](AGENTS.md).

</details>

## 🔐 Security

Private signing keys, passwords, service-account credentials and other secrets must never be committed to the repository.

## 📄 License

Licensed under the [MIT License](LICENSE).

---

<div align="center">

**CricScorer Pro** · Built for cricket on Android 🏏📱

</div>
