# Release Strategy Spec

## Context

Orca is at v0.0.1 with zero git tags, no release automation, no auto-update, and no version display. CI validates (lint/typecheck/test/build) but never publishes. Users currently have no way to get updates other than building from source. This spec covers automated versioning, version display in the UI, CI-driven release builds, and auto-update.

**Current state of relevant files:**
- `web/package.json` — version `0.0.1`, has `build:mac` script using electron-builder
- `web/electron-builder.yml` — macOS DMG+ZIP for arm64/x64, hardened runtime, no publish config
- `web/electron.vite.config.ts` — three-target build (main/preload/renderer), no `define` constants
- `web/src/main/index.ts` — Electron entry point, no updater logic
- `web/src/preload/index.ts` — `OrcaAPI` interface with `db`, `pty`, `agent`, `lifecycle` namespaces
- `web/src/renderer/components/layout/Sidebar.tsx` — sidebar with header + nav, no footer
- `.github/workflows/ci.yml` — validates on push/PR, no release job

---

## Phase 1: Version Display

**Goal**: Show `v0.0.2 (abc1234)` in the sidebar so users and developers can identify what build they're running.

### Approach: Build-time injection via Vite `define`

No IPC, no preload changes, no runtime file reads. Vite's `define` option replaces global constants at compile time — the simplest possible approach.

### File changes

#### 1. `web/electron.vite.config.ts`

Add `define` to `main` and `renderer` configs with `__APP_VERSION__` and `__GIT_HASH__` constants.

#### 2. `web/src/renderer/types/build-info.d.ts` (new file)

Type declarations for the build-time constants.

#### 3. `web/src/renderer/components/layout/Sidebar.tsx`

Add version footer at the bottom of the expanded sidebar.

### Verification

Run `bun run dev` in `web/`, expand the sidebar, confirm version + hash appear at the bottom.

---

## Phase 2: Auto Version Bump + Signed GitHub Release

**Goal**: Every merge to main that touches `web/` or `shared/` automatically bumps the patch version, tags it, builds signed+notarized macOS DMG/ZIP, and publishes a GitHub Release.

### Versioning strategy

- **Source of truth**: `web/package.json` version field
- **Auto-bump**: Patch version incremented automatically (0.0.1 -> 0.0.2 -> 0.0.3...)
- **Manual override**: Developer bumps minor/major in `web/package.json` before merging. The workflow detects the version is already newer than the latest tag and skips the auto-bump, just tags + releases it.
- **Tag format**: `v{major}.{minor}.{patch}` (e.g., `v0.0.2`)
- No conventional commits tooling, no commitlint, no semantic-release. Just patch bumps.

### One-time setup: GitHub repository secrets

| Secret | Purpose | How to obtain |
|--------|---------|---------------|
| `RELEASE_PAT` | GitHub PAT with `contents: write` to push version bump commit + tag | GitHub Settings > Developer Settings > Personal Access Tokens |
| `MACOS_CERTIFICATE` | Base64-encoded .p12 containing Developer ID Application cert + private key | Keychain Access > export cert as .p12, then `base64 -i cert.p12` |
| `MACOS_CERTIFICATE_PWD` | Password used when exporting the .p12 | Set during export |
| `KEYCHAIN_PASSWORD` | Arbitrary password for the temporary CI keychain | Make one up |
| `APPLE_ID` | Apple ID email used for notarization | Your Apple Developer account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization API | appleid.apple.com > Sign-In and Security > App-Specific Passwords |
| `APPLE_TEAM_ID` | 10-character Apple Developer Team ID | developer.apple.com > Membership |

### File changes

#### 1. `web/electron-builder.yml`

Add `publish` block (GitHub provider) and `notarize` under `mac`.

#### 2. `.github/workflows/release.yml` (new file)

Three-job workflow:
1. **version** (ubuntu) — bump patch, commit, tag, push
2. **build** (macos, matrix arm64+x64) — build, sign, notarize, publish to GitHub Release
3. **release** (ubuntu) — verify release was created

### Verification

1. Configure all GitHub secrets
2. Push a commit touching `web/` or `shared/` to main
3. Confirm: tag created, signed DMG+ZIP built, GitHub Release published

---

## Phase 3: Auto-Update

**Goal**: The app checks for updates on GitHub Releases, downloads in the background, and prompts the user to restart when ready.

Phase 2's signed+notarized builds are a hard prerequisite.

### File changes

1. **`web/src/main/updater.ts`** (new) — `electron-updater` integration, checks on launch + every 4h
2. **`web/src/main/index.ts`** — wire updater init + install IPC handler
3. **`web/src/main/ipc/channels.ts`** — add `UPDATE_INSTALL` channel
4. **`web/src/preload/index.ts`** — add `updates` namespace to `OrcaAPI`
5. **`web/src/renderer/components/layout/AppShell.tsx`** — update-ready banner

### Verification

1. Install a release build, push a new version, confirm update banner appears
2. Click "Restart & Update", confirm app installs and relaunches

---

## Implementation Order

| Phase | Depends on | Files changed |
|-------|-----------|---------------|
| 1: Version display | Nothing | `electron.vite.config.ts`, `build-info.d.ts` (new), `Sidebar.tsx` |
| 2: Signed release CI | GitHub secrets (manual) | `electron-builder.yml`, `release.yml` (new) |
| 3: Auto-update | Phase 2 working | `updater.ts` (new), `index.ts`, `channels.ts`, `preload/index.ts`, `AppShell.tsx`, `package.json` |

## Potential challenges

1. **Native module cross-compilation**: `macos-latest` (ARM) building for x64 may need `macos-13` (Intel) runner instead.
2. **First release bootstrap**: No tags exist — first run creates `v0.0.1`.
3. **Version bump commit re-triggering CI**: Mitigated by tag-exists check (`should_release=false`).
4. **electron-updater on public repos**: Works without auth (60 req/hr rate limit per IP).
