// Cuts a public desktop release (wave 2): builds the bundled exe + updater
// artifacts, then publishes them to the PUBLIC repo's GitHub Releases
// (ex4n1m0/n38worth-master) — which doubles as the Tauri updater endpoint
// (desktop/src-tauri/tauri.bundled.conf.json).
//
// Usage: node scripts/desktop-release.mjs [--notes "release notes"]
// Requires: gh CLI authenticated; desktop/tauri-updater.key present
// (gitignored). The exe's window title/version come from tauri.conf.json.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const conf = JSON.parse(
  readFileSync(resolve(root, "desktop/src-tauri/tauri.conf.json"), "utf8")
);
const version = conf.version;
const productName = conf.productName; // n38worth
const REPO = "ex4n1m0/n38worth-master";
const TAG = `desktop-v${version}`;

const notesIdx = process.argv.indexOf("--notes");
const notes =
  notesIdx !== -1 ? process.argv[notesIdx + 1] : `n38worth Windows client ${version}`;

const keyPath = resolve(root, "desktop/tauri-updater.key");
if (!existsSync(keyPath)) {
  console.error(`[desktop-release] missing ${keyPath} — updater signing key required`);
  process.exit(1);
}

console.log(`[desktop-release] building v${version} (export + tauri bundle)…`);
execSync("npm run desktop:dist", {
  stdio: "inherit",
  cwd: root,
  env: {
    ...process.env,
    // build/bundle take the key itself (or a path) via this variable —
    // the _PATH variant is only for `tauri signer sign`.
    TAURI_SIGNING_PRIVATE_KEY: keyPath,
  },
});

const bundleDir = resolve(root, `desktop/src-tauri/target/release/bundle/nsis`);
const setupExe = resolve(bundleDir, `${productName}_${version}_x64-setup.exe`);
const setupSig = `${setupExe}.sig`;

for (const f of [setupExe, setupSig]) {
  if (!existsSync(f)) {
    console.error(`[desktop-release] expected artifact missing: ${f}`);
    process.exit(1);
  }
}

// Tauri 2.x NSIS updater artifact = the signed installer itself (.exe.sig),
// no zip wrapper.
const signature = readFileSync(setupSig, "utf8").trim();
const latestJson = JSON.stringify(
  {
    version,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        signature,
        url: `https://github.com/${REPO}/releases/download/${TAG}/${productName}_${version}_x64-setup.exe`,
      },
    },
  },
  null,
  2
);

execSync(
  `gh release create "${TAG}" --repo ${REPO} --title "n38worth ${version}" --notes "${notes.replace(/"/g, '\\"')}" "${setupExe}" "${setupSig}" -`,
  { stdio: ["inherit", "inherit", "inherit"], cwd: root, input: latestJson }
);
console.log(
  `[desktop-release] published ${TAG} → https://github.com/${REPO}/releases/tag/${TAG}`
);
