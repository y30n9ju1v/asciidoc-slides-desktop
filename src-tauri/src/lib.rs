mod asset_paths;
mod document_store;
mod fs_scope_commands;
// Shared SafeDocument contract; this app reads only the block vocabulary.
#[path = "../../packages/asciidoc-typst/rust/src/safe_document.rs"]
#[allow(dead_code)]
mod safe_document;
mod slide_compiler;
mod slide_deck;
mod slide_writer;
#[path = "../../packages/asciidoc-typst/rust/src/typst_font.rs"]
#[allow(dead_code)]
mod typst_font;

/// Emitted when a deck arrives while the app is running (macOS "Open With").
pub const LAUNCH_DOCUMENT_EVENT: &str = "launch-document";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(fs_scope_commands::LaunchDocument::from_args())
        .invoke_handler(tauri::generate_handler![
            document_store::save_document_atomic,
            asset_paths::resolve_deck_asset,
            fs_scope_commands::choose_document_to_open,
            fs_scope_commands::choose_deck_folder,
            fs_scope_commands::take_launch_document,
            fs_scope_commands::choose_document_save_path,
            fs_scope_commands::choose_export_file,
            slide_compiler::export_slides_pdf,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(|_app, _event| {
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = &_event {
            use tauri::{Emitter, Manager};
            let launch = _app.state::<fs_scope_commands::LaunchDocument>();
            if launch.offer_urls(urls) {
                let _ = _app.emit(LAUNCH_DOCUMENT_EVENT, ());
            }
        }
    });
}
