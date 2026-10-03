use std::path::{Component, Path, PathBuf};
use tauri_plugin_fs::FsExt;

pub(crate) fn is_plain_relative(path: &str) -> bool {
    let path = Path::new(path);
    !path.as_os_str().is_empty() && path.components().all(|c| matches!(c, Component::Normal(_)))
}

pub(crate) fn resolve_within_root(root: &Path, relative: &str) -> Option<PathBuf> {
    if !is_plain_relative(relative) {
        return None;
    }
    let canonical_root = root.canonicalize().ok()?;
    let resolved = canonical_root.join(relative).canonicalize().ok()?;
    resolved.starts_with(&canonical_root).then_some(resolved)
}

/// Recheck the document boundary even when another folder was granted earlier.
#[tauri::command]
pub async fn resolve_deck_asset<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    document_root: String,
    relative_path: String,
) -> Result<String, String> {
    let root = Path::new(&document_root);
    if !app.fs_scope().is_allowed(root) {
        return Err("Choose the deck folder before reading its assets.".into());
    }
    let resolved = resolve_within_root(root, &relative_path)
        .ok_or("Asset is missing or outside the deck folder.")?;
    if !app.fs_scope().is_allowed(root.join(&relative_path))
        || !app.fs_scope().is_allowed(&resolved)
        || !resolved.is_file()
    {
        return Err("Asset is outside the selected filesystem scope or is not a file.".into());
    }
    resolved
        .into_os_string()
        .into_string()
        .map_err(|_| "Asset path is not valid Unicode.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    #[test]
    fn refuses_symlinks_outside_the_deck_even_when_both_folders_are_allowed() {
        let root = std::env::temp_dir().join(format!("slides-resolve-{}", std::process::id()));
        let deck = root.join("deck");
        let other = root.join("other");
        std::fs::create_dir_all(&deck).unwrap();
        std::fs::create_dir_all(&other).unwrap();
        std::fs::write(other.join("secret.png"), b"secret").unwrap();
        std::fs::write(deck.join("ok.png"), b"ok").unwrap();
        std::os::unix::fs::symlink(other.join("secret.png"), deck.join("escape.png")).unwrap();
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_fs::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        app.fs_scope().allow_directory(&root, true).unwrap();
        let resolve = |name: &str| {
            tauri::async_runtime::block_on(resolve_deck_asset(
                app.handle().clone(),
                deck.to_string_lossy().into_owned(),
                name.into(),
            ))
        };
        assert!(resolve("escape.png").is_err());
        assert!(resolve("../other/secret.png").is_err());
        assert!(resolve("ok.png").is_ok());
        std::fs::remove_dir_all(root).unwrap();
    }
}
