//! Native pickers are the only way paths enter the fs scope: no command
//! accepts an arbitrary WebView path for a grant.
use tauri::{command, AppHandle, Runtime};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_fs::FsExt;

fn path_from_selection(selected: FilePath) -> Result<String, String> {
    selected
        .into_path()
        .map_err(|error| error.to_string())?
        .into_os_string()
        .into_string()
        .map_err(|_| "The selected path is not valid Unicode.".to_string())
}

fn grant_file<R: Runtime>(
    app: &AppHandle<R>,
    selected: Option<FilePath>,
) -> Result<Option<String>, String> {
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = path_from_selection(selected)?;
    app.fs_scope()
        .allow_file(&path)
        .map_err(|error| error.to_string())?;
    Ok(Some(path))
}

/// True for folders too broad to grant just because one file in them was
/// opened: the filesystem root, the home folder, or any ancestor of it.
fn is_broad_directory(directory: &std::path::Path, home: Option<&std::path::Path>) -> bool {
    directory.parent().is_none() || home.is_some_and(|home| home.starts_with(directory))
}

/// Grants a deck's folder to both the fs plugin (images, file tree) and the
/// asset protocol, which streams local videos in ranges for playback instead
/// of loading whole files into the WebView. Both scopes constrain access to
/// the same folder; operation permissions are controlled by capabilities.
fn grant_deck_folder<R: Runtime>(
    app: &AppHandle<R>,
    folder: &std::path::Path,
) -> Result<(), String> {
    use tauri::Manager;
    app.fs_scope()
        .allow_directory(folder, true)
        .map_err(|error| error.to_string())?;
    app.asset_protocol_scope()
        .allow_directory(folder, true)
        .map_err(|error| error.to_string())
}

/// A deck's images live next to it (`image::images/chart.png[]`), so a deck
/// the user picked also grants read access to its own folder - unless that
/// folder is the home folder or broader, where one file must not expose
/// everything under it ("Open folder" remains the explicit way to do that).
/// Asset reads re-check containment in that folder (see slide_compiler.rs).
fn grant_deck<R: Runtime>(
    app: &AppHandle<R>,
    selected: Option<FilePath>,
) -> Result<Option<String>, String> {
    use tauri::Manager;
    let path = grant_file(app, selected)?;
    let home = app.path().home_dir().ok();
    if let Some(parent) = path
        .as_deref()
        .and_then(|p| std::path::Path::new(p).parent())
        .filter(|parent| !is_broad_directory(parent, home.as_deref()))
    {
        grant_deck_folder(app, parent)?;
    }
    Ok(path)
}

#[command]
pub async fn choose_document_to_open<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<String>, String> {
    grant_deck(
        &app,
        app.dialog()
            .file()
            .add_filter("AsciiDoc", &["adoc", "asciidoc", "txt"])
            .blocking_pick_file(),
    )
}

#[command]
pub async fn choose_document_save_path<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<String>, String> {
    grant_deck(
        &app,
        app.dialog()
            .file()
            .set_file_name("slides.adoc")
            .add_filter("AsciiDoc", &["adoc"])
            .blocking_save_file(),
    )
}

/// A folder the user picked, with the AsciiDoc decks directly inside it.
#[derive(serde::Serialize)]
pub struct DeckFolder {
    pub folder: String,
    pub decks: Vec<String>,
}

fn is_asciidoc(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| matches!(ext.to_ascii_lowercase().as_str(), "adoc" | "asciidoc"))
}

/// Lists the decks directly inside `folder`, sorted by name.
fn list_decks(folder: &std::path::Path) -> Result<Vec<String>, String> {
    let mut decks: Vec<String> = std::fs::read_dir(folder)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && is_asciidoc(path))
        .filter_map(|path| path.into_os_string().into_string().ok())
        .collect();
    decks.sort();
    Ok(decks)
}

/// Opens a folder picker and grants recursive scope to the picked folder,
/// so a deck inside it and its images can be read.
#[command]
pub async fn choose_deck_folder<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<DeckFolder>, String> {
    let Some(selected) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let folder = path_from_selection(selected)?;
    grant_deck_folder(&app, std::path::Path::new(&folder))?;
    let decks = list_decks(std::path::Path::new(&folder))?;
    Ok(Some(DeckFolder { folder, decks }))
}

/// A deck the app was asked to open from outside: the command line
/// (`asciidoc-slides deck.adoc`) or, on macOS, Finder's "Open With" /
/// double-click, which arrives as `RunEvent::Opened` rather than argv.
/// Handed to the frontend once.
pub struct LaunchDocument(pub std::sync::Mutex<Option<std::path::PathBuf>>);

/// An existing AsciiDoc file, canonicalized; anything else is ignored.
fn launch_deck(path: std::path::PathBuf) -> Option<std::path::PathBuf> {
    (path.is_file() && is_asciidoc(&path))
        .then(|| path.canonicalize().ok())
        .flatten()
}

impl LaunchDocument {
    pub fn from_args() -> Self {
        let path = std::env::args_os()
            .skip(1)
            .map(std::path::PathBuf::from)
            .find_map(launch_deck);
        Self(std::sync::Mutex::new(path))
    }

    /// Records the first deck among opened file URLs; true when one was found.
    pub fn offer_urls<'a>(&self, urls: impl IntoIterator<Item = &'a tauri::Url>) -> bool {
        let deck = urls
            .into_iter()
            .filter_map(|url| url.to_file_path().ok())
            .find_map(launch_deck);
        match (deck, self.0.lock()) {
            (Some(deck), Ok(mut slot)) => {
                *slot = Some(deck);
                true
            }
            _ => false,
        }
    }
}

/// Returns the launch deck once, granting it and its folder like a picked deck:
/// the user chose it by launching the app with it.
#[command]
pub async fn take_launch_document<R: Runtime>(
    app: AppHandle<R>,
    launch: tauri::State<'_, LaunchDocument>,
) -> Result<Option<String>, String> {
    let Some(path) = launch.0.lock().map_err(|error| error.to_string())?.take() else {
        return Ok(None);
    };
    grant_deck(&app, Some(FilePath::Path(path)))
}

/// A save picker for an export; the returned path already has file scope.
#[command]
pub async fn choose_export_file<R: Runtime>(
    app: AppHandle<R>,
    default_path: String,
    filter_name: String,
    extensions: Vec<String>,
) -> Result<Option<String>, String> {
    let extension_refs = extensions.iter().map(String::as_str).collect::<Vec<_>>();
    grant_file(
        &app,
        app.dialog()
            .file()
            .set_file_name(default_path)
            .add_filter(filter_name, &extension_refs)
            .blocking_save_file(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_scope_keeps_sensitive_paths_denied_after_folder_grant() {
        use tauri::Manager;
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().app.security.asset_protocol.scope =
            serde_json::from_value(config["app"]["security"]["assetProtocol"]["scope"].clone())
                .unwrap();
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_fs::init())
            .build(context)
            .unwrap();
        let home = app.path().home_dir().unwrap();
        grant_deck_folder(app.handle(), &home).unwrap();
        let scope = app.asset_protocol_scope();
        assert!(scope.is_allowed(home.join("movie.mp4")));
        for directory in [".ssh", ".aws", ".gnupg", "Library/Keychains"] {
            assert!(!scope.is_allowed(home.join(directory).join("secret.mp4")));
        }
    }

    #[test]
    fn never_grants_home_or_broader_for_a_single_file() {
        let home = std::path::Path::new("/Users/me");
        assert!(is_broad_directory(std::path::Path::new("/"), Some(home)));
        assert!(is_broad_directory(
            std::path::Path::new("/Users"),
            Some(home)
        ));
        assert!(is_broad_directory(home, Some(home)));
        assert!(!is_broad_directory(&home.join("talks"), Some(home)));
        assert!(!is_broad_directory(
            std::path::Path::new("/Volumes/usb/talks"),
            Some(home)
        ));
    }

    #[test]
    fn lists_only_asciidoc_files_in_the_folder() {
        let root = std::env::temp_dir().join(format!("deck-folder-{}", std::process::id()));
        std::fs::create_dir_all(root.join("images")).unwrap();
        for name in ["b.adoc", "a.ASCIIDOC", "notes.txt", "images/c.adoc"] {
            std::fs::write(root.join(name), "").unwrap();
        }
        let names: Vec<String> = list_decks(&root)
            .unwrap()
            .into_iter()
            .map(|p| {
                std::path::Path::new(&p)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert_eq!(names, vec!["a.ASCIIDOC", "b.adoc"]);
        std::fs::remove_dir_all(root).unwrap();
    }
}
