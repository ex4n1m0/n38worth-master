/// Thin shell around the n38worth game client.
///
/// The window's user agent carries the `n38worth-windows/<version>` token —
/// the server's Windows-only gate (src/proxy.ts) admits requests carrying it
/// and turns everyone else away to /windows-only. Keep that token in sync
/// with the gate when bumping.
///
/// The UI itself is the statically exported web app (out/, built by
/// scripts/build-desktop-client.mjs) bundled into the binary; all game data
/// flows to https://n38worth.com/api/* with a Bearer token (see
/// src/lib/desktop-client.ts).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Best-effort auto-update on launch: check the endpoint, and if
            // a newer signed build exists, download + install it (passive
            // progress) before the game window settles. Never fatal.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_updater::UpdaterExt;
                let updater = match handle.updater() {
                    Ok(u) => u,
                    Err(_) => return,
                };
                match updater.check().await {
                    Ok(Some(update)) => {
                        let _ = update.download_and_install(|_, _| {}, || {}).await;
                    }
                    _ => {}
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
