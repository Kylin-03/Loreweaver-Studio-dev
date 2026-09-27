//! Local-only appearance image storage. No arbitrary path is accepted from WebView.
use base64::Engine;
use image::{ImageFormat, ImageReader};
use sha2::{Digest, Sha256};
use std::{
    io::{Cursor, Read},
    path::{Path, PathBuf},
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

const MAX_BYTES: u64 = 12 * 1024 * 1024;
const MAX_PIXELS: u64 = 24_000_000;

fn validate(bytes: &[u8]) -> Result<&'static str, String> {
    if bytes.len() as u64 > MAX_BYTES {
        return Err("appearance.tooLarge".into());
    }
    let format = image::guess_format(bytes).map_err(|_| "appearance.invalidImage")?;
    let mime = match format {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::WebP => "image/webp",
        _ => return Err("appearance.invalidImage".into()),
    };
    let (w, h) = ImageReader::with_format(Cursor::new(bytes), format)
        .into_dimensions()
        .map_err(|_| "appearance.invalidImage")?;
    if w == 0 || h == 0 || w > 8192 || h > 8192 || u64::from(w) * u64::from(h) > MAX_PIXELS {
        return Err("appearance.dimensions".into());
    }
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().map_err(|_| "appearance.invalidImage")?;
    Ok(mime)
}
fn read_image(path: &Path) -> Result<Vec<u8>, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() > MAX_BYTES {
        return Err("appearance.tooLarge".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    validate(&bytes)?;
    Ok(bytes)
}
fn image_name(scope: Option<&str>) -> Result<String, String> {
    match scope {
        None => Ok("background.image".into()),
        Some(scope) if !scope.is_empty() && scope.len() <= 4096 => {
            // Scope is an identity, never a path. Hashing also keeps room names off disk.
            Ok(format!(
                "background-{:x}.image",
                Sha256::digest(scope.as_bytes())
            ))
        }
        Some(_) => Err("appearance.invalidScope".into()),
    }
}
fn image_path(app: &tauri::AppHandle, scope: Option<&str>) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("appearance")
        .join(image_name(scope)?))
}
fn data_url(bytes: &[u8]) -> Result<String, String> {
    Ok(format!(
        "data:{};base64,{}",
        validate(bytes)?,
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}
#[tauri::command]
pub async fn appearance_import_background(
    app: tauri::AppHandle,
    window: tauri::Window,
    scope: Option<String>,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dest = image_path(&app, scope.as_deref())?;
        let selected = app
            .dialog()
            .file()
            .set_parent(&window)
            .add_filter("PNG / JPEG / WebP", &["png", "jpg", "jpeg", "webp"])
            .blocking_pick_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|e| e.to_string())?;
        let bytes = read_image(&path)?;
        let url = data_url(&bytes)?;
        std::fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
        // Validate fully before replacing the last good copy.
        std::fs::write(dest, &bytes).map_err(|e| e.to_string())?;
        Ok(Some(url))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn appearance_copy_background(
    app: tauri::AppHandle,
    source: Option<String>,
    destination: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let from = image_path(&app, source.as_deref())?;
        let to = image_path(&app, Some(&destination))?;
        let bytes = read_image(&from)?;
        std::fs::create_dir_all(to.parent().unwrap()).map_err(|e| e.to_string())?;
        std::fs::write(to, bytes).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn appearance_load_background(
    app: tauri::AppHandle,
    scope: Option<String>,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = image_path(&app, scope.as_deref())?;
        if !path.exists() {
            return Ok(None);
        }
        data_url(&read_image(&path)?).map(Some)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn appearance_remove_background(
    app: tauri::AppHandle,
    scope: Option<String>,
) -> Result<(), String> {
    let path = image_path(&app, scope.as_deref())?;
    match tokio::fs::remove_file(path).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn room_images_are_isolated_and_cannot_escape_storage() {
        assert_eq!(image_name(None).unwrap(), "background.image");
        let one = image_name(Some("server-a/room/table")).unwrap();
        assert_eq!(one, image_name(Some("server-a/room/table")).unwrap());
        assert_ne!(one, image_name(Some("server-b/room/table")).unwrap());
        let traversal = image_name(Some("../../other.file")).unwrap();
        assert!(!traversal.contains('/') && !traversal.contains('\\'));
        assert!(image_name(Some("")).is_err());
        assert!(image_name(Some(&"x".repeat(4097))).is_err());
    }
    fn png(w: u32, h: u32) -> Vec<u8> {
        let mut buf = Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(w, h)
            .write_to(&mut buf, ImageFormat::Png)
            .unwrap();
        buf.into_inner()
    }
    #[test]
    fn decodes_real_image_and_rejects_truncated_or_active_formats() {
        assert_eq!(validate(&png(2, 2)).unwrap(), "image/png");
        assert!(validate(b"<svg xmlns='http://www.w3.org/2000/svg'/>").is_err());
        assert!(validate(&png(2, 2)[..20]).is_err());
    }
    #[test]
    fn bounds_bytes_and_dimensions() {
        assert_eq!(
            validate(&vec![0; MAX_BYTES as usize + 1]).unwrap_err(),
            "appearance.tooLarge"
        );
        assert_eq!(
            validate(&png(8193, 1)).unwrap_err(),
            "appearance.dimensions"
        );
    }
}
