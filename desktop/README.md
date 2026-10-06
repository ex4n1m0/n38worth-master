# n38worth — Windows desktop client (Tauri 2)

The game's PC Windows shell (PC_WINDOWS_PORT_STUDY.md, 2026-10-06 ruling:
web + Android retired, Windows-local only). Stage A architecture: the shell
loads the live site — `https://n38worth.com/` in release builds,
`http://localhost:3000` in dev — inside a WebView2 window whose user agent
carries the `n38worth-windows/<version>` token. The server-side Windows-only
gate (`src/proxy.ts`) admits that token and turns every other visitor away to
`/windows-only`.

## Prerequisites (this dev machine already has all of them)

- Rust (rustup, MSVC toolchain) + VS C++ Build Tools (for `link.exe`)
- Node deps: `npm install` (the `@tauri-apps/cli` devDependency is installed)
- WebView2 Runtime — preinstalled on Windows 11 / most Windows 10; the NSIS
  installer downloads the bootstrapper when missing

## Daily development loop — ZERO Vercel cost

Terminal 1:

    npm run dev            # next dev on :3000 (local; gate is dev-off)

Terminal 2:

    npm run desktop:dev    # Tauri window → http://localhost:3000

The proxy gate only activates with `NODE_ENV=production`, so local browser
tabs and the dev exe both see the game normally. **Careful:** local dev talks
to the SAME Neon database as production (see AGENTS.md) — for throwaway
testing, point `.env.local` `DATABASE_URL` at a Neon dev branch first.

Deploy to Vercel only when SERVER code changes (API routes, crons, proxy,
i18n dictionaries used server-side). UI work is verified in the local exe and
rides along with the next server deploy (Stage A). Stage B (bundled UI +
updater, study §7 M4) removes even that coupling.

## Building the installer

    npm run desktop:build

Output:

- EXE: `desktop/src-tauri/target/release/n38worth.exe`
- NSIS installer:
  `desktop/src-tauri/target/release/bundle/nsis/n38worth_1.0.0_x64-setup.exe`

The build validates `tauri.conf.json` against the Tauri 2 schema — if you
change window/UA config, the compile step is the checker.

## Keeping the UA token in sync

`tauri.conf.json` → `app.windows[0].userAgent` (ends with
`n38worth-windows/1.0.0`). `src/proxy.ts` matches the substring
`n38worth-windows`. Bump the version freely; never rename the token without
updating the gate.

## Owner browser bypass (production checks in Chrome)

The gate plants no obstacles for the owner: visit
`https://n38worth.com/api/dev-preview` once (optionally `?next=/city`) to set
a 30-day `n38-web-preview` cookie; the gate then lets that browser through.
Kill switch for the whole gate: `WINDOWS_ONLY=false` env var on Vercel.

## Not yet in Stage A (see study §7)

- Bundled UI + signed updater (M4) — until then UI changes ship with server
  deploys
- Token (Bearer) auth + system-browser OAuth for the webview (M4) — Stage A
  uses same-origin cookie login; username/password works in-window today,
  Google/Facebook login is not available in the exe yet
- Steam/itch distribution decision (study §9 Q1)
- Graphics ladder G1+ (three.js WebGPURenderer)
