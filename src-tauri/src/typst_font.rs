//! Local font policy. No font files are embedded or downloaded by Slides.
pub const SANS_FONT_FAMILIES: &[&str] = &[
    "Apple SD Gothic Neo",
    "Malgun Gothic",
    "Noto Sans CJK KR",
    "Arial",
    "DejaVu Sans",
];
pub const SERIF_FONT_FAMILIES: &[&str] = &[
    "AppleMyungjo",
    "Batang",
    "Noto Serif CJK KR",
    "Georgia",
    "DejaVu Serif",
];
pub const MONO_FONT_FAMILIES: &[&str] = &["Menlo", "Consolas", "DejaVu Sans Mono"];
pub const MATH_FONT_FAMILIES: &[&str] = &[
    "STIX Two Math",
    "Cambria Math",
    "Latin Modern Math",
    "New Computer Modern Math",
];

#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut names: Vec<String> = typst_kit::fonts::system()
            .map(|(_, info)| info.family.to_string())
            .filter(|name| !name.starts_with('.') && !name.chars().any(char::is_control))
            .collect();
        names.sort_unstable();
        names.dedup();
        names
    })
    .await
    .map_err(|error| error.to_string())
}
