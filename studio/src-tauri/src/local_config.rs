//! Local host startup configuration. Secrets stay in component memory, never logs.
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

const MAX_BYTES: usize = 1024 * 1024;
static WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalConfig {
    pub home: String,
    pub text: String,
    pub revision: String,
    pub encoding: String,
    pub backup_path: Option<String>,
}

fn env_path(home: &str) -> Result<PathBuf, String> {
    let root = Path::new(home);
    if !root.is_absolute() || !root.is_dir() {
        return Err("config_home".into());
    }
    let root = root.canonicalize().map_err(|_| "config_home")?;
    let path = root.join(".env");
    // Never follow a redirected config file outside the selected host home.
    if path.exists()
        && (fs::symlink_metadata(&path)
            .map_err(|_| "config_read")?
            .file_type()
            .is_symlink()
            || path.canonicalize().map_err(|_| "config_read")?.parent() != Some(root.as_path()))
    {
        return Err("config_path".into());
    }
    Ok(path)
}

fn read_bytes(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match fs::metadata(path) {
        Ok(meta) if meta.len() > MAX_BYTES as u64 => return Err("config_size".into()),
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("config_read".into()),
    }
    let bytes = fs::read(path).map_err(|_| "config_read")?;
    if bytes.len() > MAX_BYTES {
        return Err("config_size".into());
    }
    Ok(Some(bytes))
}

fn revision(bytes: Option<&[u8]>) -> String {
    bytes
        .map(|v| format!("{:x}", Sha256::digest(v)))
        .unwrap_or_else(|| "missing".into())
}

fn decode(bytes: &[u8]) -> Result<(String, &'static str), String> {
    let plain = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes);
    if let Ok(text) = std::str::from_utf8(plain) {
        return Ok((
            text.to_owned(),
            if plain.len() == bytes.len() {
                "utf8"
            } else {
                "utf8Bom"
            },
        ));
    }
    if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
        return Err("config_encoding".into());
    }
    let (text, errors) = encoding_rs::GBK.decode_without_bom_handling(bytes);
    if errors {
        return Err("config_encoding".into());
    }
    // Round-trip is required: never silently replace invalid bytes with U+FFFD.
    let (encoded, _, errors) = encoding_rs::GBK.encode(&text);
    if errors || encoded.as_ref() != bytes {
        return Err("config_encoding".into());
    }
    Ok((text.into_owned(), "gbk"))
}

fn validate(text: &str) -> Result<(), String> {
    if text.len() > MAX_BYTES {
        return Err("config_size".into());
    }
    if text.contains('\0') || text.contains('\u{fffd}') {
        return Err("config_encoding".into());
    }
    let mut keys = HashSet::new();
    let mut remaining = text;
    while !remaining.is_empty() {
        remaining = remaining.trim_start();
        if remaining.is_empty() {
            break;
        }
        if remaining.starts_with('#') {
            remaining = remaining
                .split_once('\n')
                .map(|(_, rest)| rest)
                .unwrap_or("");
            continue;
        }
        if let Some(rest) = remaining.strip_prefix("export ") {
            remaining = rest.trim_start();
        }
        let key_len = remaining
            .bytes()
            .take_while(|b| b.is_ascii_alphanumeric() || *b == b'_')
            .count();
        if key_len == 0 || remaining.as_bytes()[0].is_ascii_digit() {
            return Err("config_syntax".into());
        }
        let key = &remaining[..key_len];
        if !keys.insert(key.to_owned()) {
            return Err("config_duplicate".into());
        }
        remaining = remaining[key_len..].trim_start_matches([' ', '\t']);
        remaining = remaining
            .strip_prefix('=')
            .ok_or("config_syntax")?
            .trim_start_matches([' ', '\t']);
        if let Some(quote) = remaining.chars().next().filter(|c| *c == '\'' || *c == '"') {
            // python-dotenv allows escaped quotes/backslashes, including in single quotes.
            let mut chars = remaining[1..].char_indices();
            let mut end = None;
            while let Some((i, c)) = chars.next() {
                if c == '\\' {
                    if let Some((_, next)) = chars.clone().next() {
                        if next == quote || next == '\\' {
                            chars.next();
                            continue;
                        }
                    }
                }
                if c == quote {
                    end = Some(i + 2);
                    break;
                }
            }
            remaining = &remaining[end.ok_or("config_syntax")?..];
            let tail_end = remaining.find('\n').unwrap_or(remaining.len());
            let tail = remaining[..tail_end].trim();
            if !tail.is_empty() && !tail.starts_with('#') {
                return Err("config_syntax".into());
            }
        }
        remaining = remaining
            .split_once('\n')
            .map(|(_, rest)| rest)
            .unwrap_or("");
    }
    Ok(())
}

fn snapshot(path: &Path, backup_path: Option<String>) -> Result<LocalConfig, String> {
    let bytes = read_bytes(path)?;
    let (text, encoding) = decode(bytes.as_deref().unwrap_or_default())?;

    Ok(LocalConfig {
        home: path
            .parent()
            .ok_or("config_home")?
            .to_string_lossy()
            .into_owned(),
        text,
        revision: revision(bytes.as_deref()),
        encoding: encoding.into(),
        backup_path,
    })
}

#[tauri::command]
pub fn local_config_read(home: String) -> Result<LocalConfig, String> {
    snapshot(&env_path(&home)?, None)
}

#[tauri::command]
pub fn local_config_save(
    home: String,
    text: String,
    expected_revision: String,
) -> Result<LocalConfig, String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "config_write")?;
    validate(&text)?;

    let path = env_path(&home)?;
    let original = read_bytes(&path)?;
    if revision(original.as_deref()) != expected_revision {
        return Err("config_conflict".into());
    }
    let root = path.parent().ok_or("config_home")?;
    let mut staged = tempfile::NamedTempFile::new_in(root).map_err(|_| "config_write")?;
    staged
        .write_all(text.as_bytes())
        .map_err(|_| "config_write")?;
    staged.as_file().sync_all().map_err(|_| "config_write")?;
    // Backup contains the original bytes, preserving even a legacy encoding.
    let backup_path = if let Some(bytes) = &original {
        let mut backup = tempfile::Builder::new()
            .prefix(".env.backup-")
            .tempfile_in(root)
            .map_err(|_| "config_write")?;
        backup.write_all(bytes).map_err(|_| "config_write")?;
        backup.as_file().sync_all().map_err(|_| "config_write")?;
        let (_, backup) = backup.keep().map_err(|_| "config_write")?;
        Some(backup.to_string_lossy().into_owned())
    } else {
        None
    };
    // Recheck immediately before atomic replacement, including external editors.
    if revision(read_bytes(&path)?.as_deref()) != expected_revision {
        return Err("config_conflict".into());
    }
    staged.persist(&path).map_err(|_| "config_write")?;
    Ok(LocalConfig {
        home: root.to_string_lossy().into_owned(),
        revision: revision(Some(text.as_bytes())),
        text,
        encoding: "utf8".into(),
        backup_path,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn encoding_conversion_is_lossless() {
        let text = "# 中文配置\nTRPG_LOCALE=zh\n";
        let (gbk, _, _) = encoding_rs::GBK.encode(text);
        assert_eq!(decode(&gbk).unwrap(), (text.to_owned(), "gbk"));
        assert_eq!(decode(b"\xef\xbb\xbfTRPG_LOCALE=zh").unwrap().1, "utf8Bom");
        assert!(decode(&[0xff, 0xfe, 0x00]).is_err());
    }
    #[test]
    fn python_dotenv_quoted_values_and_multiline_comments_are_valid() {
        assert!(validate("PATH='D:\\\\players\\'s\\\\data'\nX=\"first\nsecond\" # note\n").is_ok());
        assert!(validate("X='value' trailing").is_err());
        assert!(validate("X=1\n# 中文\nY=2").is_ok());
    }
    #[test]
    fn invalid_and_duplicate_lines_never_leak_secrets() {
        assert_eq!(
            validate("SECRET='private-value"),
            Err("config_syntax".into())
        );
        assert_eq!(validate("X=1\nX=2"), Err("config_duplicate".into()));
    }
    #[test]
    fn saves_preserve_backup_and_reject_stale_writes() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path().to_string_lossy().into_owned();
        let original = b"# existing\nUNKNOWN=keep\n";
        fs::write(dir.path().join(".env"), original).unwrap();
        let loaded = local_config_read(home.clone()).unwrap();
        let saved = local_config_save(
            home.clone(),
            "# existing\nUNKNOWN=keep\nNEW=value\n".into(),
            loaded.revision.clone(),
        )
        .unwrap();
        assert_eq!(fs::read(saved.backup_path.unwrap()).unwrap(), original);
        assert_eq!(
            local_config_save(home, "NEW=other".into(), loaded.revision)
                .err()
                .unwrap(),
            "config_conflict"
        );
    }
    #[test]
    fn missing_file_creation_does_not_overwrite_an_external_file() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path().to_string_lossy().into_owned();
        let loaded = local_config_read(home.clone()).unwrap();
        assert_eq!(loaded.revision, "missing");
        fs::write(dir.path().join(".env"), "EXTERNAL=1").unwrap();
        assert_eq!(
            local_config_save(home, "NEW=2".into(), loaded.revision)
                .err()
                .unwrap(),
            "config_conflict"
        );
    }
}
