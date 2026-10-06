/// Thin shell around the n38worth web client (Stage A: remote-loaded UI).
///
/// The window's user agent carries the `n38worth-windows/<version>` token —
/// the server's Windows-only gate (src/proxy.ts) admits requests carrying it
/// and turns everyone else away to /windows-only. Keep that token in sync
/// with the gate when bumping.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
