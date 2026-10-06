# n38worth — Windows desktop client (Tauri 2)

The game's PC Windows shell (PC_WINDOWS_PORT_STUDY.md, 2026-10-06 ruling:
web + Android retired, Windows-local only). **Wave 2 architecture:** the exe
BUNDLES the statically exported UI (`out/` via `scripts/build-desktop-client.mjs`)
and talks to the live API cross-origin — every `/api/*` fetch is rewritten to
`https://n38worth.com` with a Bearer token (`src/lib/desktop-client.ts`,
`src/lib/session-compat.tsx`, `/api/client-session`, `src/proxy.ts`). The
webview user agent carries the `n38worth-windows/<version>` token that the
Windows-only gate admits.

## Prerequisites (this dev machine already has all of them)

- Rust (rustup, MSVC toolchain) + VS C++ Build Tools (for `link.exe`)
- Node deps: `npm install` (the `@tauri-apps/cli` devDependency is installed)
- WebView2 Runtime — preinstalled on Windows 11 / most Windows 10; the NSIS
  installer downloads the bootstrapper when missing
- `desktop/tauri-updater.key` (gitignored) — updater signing private key

## Daily development loop — ZERO Vercel cost

Terminal 1:

    npm run dev            # next dev on :3000 (local; gate is dev-off)

Terminal 2:

    npm run desktop:dev    # Tauri window → http://localhost:3000

The proxy gate only activates with `NODE_ENV=production`, so local browser
tabs and the dev exe both see the game normally. **Careful:** local dev talks
to the SAME Neon database as production (see AGENTS.md) — for throwaway
testing, point `.env.local` `DATABASE_URL` at a Neon dev branch first.

Deploy to Vercel ONLY when server code changes (API routes, crons, proxy,
i18n JSON). UI-only changes ship via the desktop release (below) — no Vercel
deploy needed anymore.

## Builds

- `npm run desktop:build` — Stage A shell (remote-loads n38worth.com); dev
  fallback, not the product
- `npm run desktop:export` — static UI export only → `out/`
- `npm run desktop:dist` — export + bundled exe + NSIS installer + updater
  artifacts (requires `TAURI_SIGNING_PRIVATE_KEY_PATH`)
- `node scripts/desktop-release.mjs --notes "..."` — full release: build +
  publish to the PUBLIC repo's GitHub Releases (ex4n1m0/n38worth-master),
  which is also the auto-updater endpoint

Artifacts: `desktop/src-tauri/target/release/bundle/nsis/` —
`n38worth_<version>_x64-setup.exe` (installer) +
`.nsis.zip`/`.nsis.zip.sig` (updater payloads) +
`latest.json` (written by the release script).

## Auto-update

The exe checks the updater endpoint on launch and installs newer signed
builds passively (`tauri.bundled.conf.json` → `plugins.updater`). Bump
`version` in `tauri.conf.json` → run the release script — players update on
next launch. The private key must never leave this machine (gitignored);
the matching public key is embedded in `tauri.bundled.conf.json`.

## Keeping the UA token in sync

`tauri.conf.json` → `app.windows[0].userAgent` (ends with
`n38worth-windows/<version>`). `src/proxy.ts` matches the substring
`n38worth-windows`. Bump the version freely; never rename the token without
updating the gate.

## Owner browser bypass (production checks in Chrome)

Visit `https://n38worth.com/api/dev-preview` once (optionally `?next=/city`)
to set a 30-day `n38-web-preview` cookie; the gate then lets that browser
through. Kill switch for the whole gate: `WINDOWS_ONLY=false` env on Vercel.

## Known wave-2 limitations

- OAuth (Google/Facebook) login is web-only — the exe cannot complete the
  browser redirect; username/password (and demo "demo") login is the desktop
  path (`/api/client-session`)
- The exe's bundled UI updates only via a new desktop release; server-driven
  strings/pages still ride Vercel deploys

