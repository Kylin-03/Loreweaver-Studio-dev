//! Saved connection identities, not campaign storage. The server owns campaign data.
//! Native storage keeps invite keys out of browser persistence and room-list responses.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::Write,
    path::Path,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

static WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRoom {
    pub id: String,
    pub server_id: String,
    pub room: String,
    pub name: String,
    pub identity: String,
    pub role: String,
    pub home: Option<String>,
    pub last_used: u64,
}

#[derive(Clone, Serialize, Deserialize)]
struct Record {
    summary: SavedRoom,
    ticket: String,
    key: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionRecord {
    ticket: String,
    key: String,
    room: String,
    name: String,
    identity: String,
    role: String,
    home: Option<String>,
}

#[derive(Serialize)]
pub struct Credentials {
    ticket: String,
    key: String,
}

fn read(path: &Path) -> Result<Vec<Record>, String> {
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| "roomBook.corrupt".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(_) => Err("roomBook.readFailed".into()),
    }
}

fn write(path: &Path, records: &[Record]) -> Result<(), String> {
    let parent = path.parent().ok_or("roomBook.writeFailed")?;
    std::fs::create_dir_all(parent).map_err(|_| "roomBook.writeFailed")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|_| "roomBook.writeFailed")?;
    let bytes = serde_json::to_vec(records).map_err(|_| "roomBook.writeFailed")?;
    temp.write_all(&bytes).map_err(|_| "roomBook.writeFailed")?;
    temp.as_file()
        .sync_all()
        .map_err(|_| "roomBook.writeFailed")?;
    temp.persist(path).map_err(|_| "roomBook.writeFailed")?;
    Ok(())
}

fn make_record(input: ConnectionRecord) -> Result<Record, String> {
    if input.room.is_empty()
        || input.identity.is_empty()
        || input.room.chars().any(char::is_control)
        || input.identity.chars().any(char::is_control)
        || input.role.is_empty()
        || input.role.len() > 50
        || input.key.is_empty()
        || input.key.len() > 4096
        || input.room.len() > 200
        || input.name.len() > 500
        || input.identity.len() > 200
        || input.ticket.len() > 16384
    {
        return Err("roomBook.invalid".into());
    }
    let ticket: iroh_tickets::endpoint::EndpointTicket =
        input.ticket.parse().map_err(|_| "roomBook.invalid")?;
    let server_id = ticket.endpoint_addr().id.to_string();
    // Relay/direct addresses may change. Endpoint identity, room and authenticated user do not.
    let id = format!(
        "{:x}",
        Sha256::digest(format!("{}\0{}\0{}", server_id, input.room, input.identity))
    );
    Ok(Record {
        summary: SavedRoom {
            id,
            server_id,
            room: input.room,
            name: input.name,
            identity: input.identity,
            role: input.role,
            home: input.home,
            last_used: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        },
        ticket: input.ticket,
        key: input.key,
    })
}

fn upsert(records: &mut Vec<Record>, mut record: Record) -> SavedRoom {
    if let Some(previous) = records.iter().find(|r| r.summary.id == record.summary.id) {
        // A welcome knows the room id before the state frame supplies its display name.
        if record.summary.name == record.summary.room {
            record.summary.name.clone_from(&previous.summary.name);
        }
        if record.summary.home.is_none() {
            record.summary.home.clone_from(&previous.summary.home);
        }
    }
    records.retain(|r| r.summary.id != record.summary.id);
    let summary = record.summary.clone();
    records.push(record);
    summary
}

fn rename(records: &mut [Record], id: &str, name: &str) -> Result<(), String> {
    if name.len() > 500 || name.chars().any(char::is_control) {
        return Err("roomBook.invalid".into());
    }
    let active = records
        .iter()
        .find(|r| r.summary.id == id)
        .ok_or("roomBook.missing")?
        .summary
        .clone();
    for record in records
        .iter_mut()
        .filter(|r| r.summary.server_id == active.server_id && r.summary.room == active.room)
    {
        record.summary.name = if name.trim().is_empty() {
            active.room.clone()
        } else {
            name.trim().to_owned()
        };
    }
    Ok(())
}

#[tauri::command]
pub fn room_book_rename(app: AppHandle, id: String, name: String) -> Result<(), String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "roomBook.writeFailed")?;
    let path = path(&app)?;
    let mut records = read(&path)?;
    rename(&mut records, &id, &name)?;
    write(&path, &records)
}

fn path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| "roomBook.readFailed")?
        .join("room-book.json"))
}

#[tauri::command]
pub fn room_book_list(app: AppHandle) -> Result<Vec<SavedRoom>, String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "roomBook.readFailed")?;
    let mut items: Vec<_> = read(&path(&app)?)?.into_iter().map(|r| r.summary).collect();
    items.sort_by_key(|r| std::cmp::Reverse(r.last_used));
    Ok(items)
}

#[tauri::command]
pub fn room_book_save(app: AppHandle, connection: ConnectionRecord) -> Result<SavedRoom, String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "roomBook.writeFailed")?;
    let path = path(&app)?;
    let mut records = read(&path)?;
    let record = make_record(connection)?;
    let summary = upsert(&mut records, record);
    write(&path, &records)?;
    Ok(summary)
}

#[tauri::command]
pub fn room_book_credentials(app: AppHandle, id: String) -> Result<Credentials, String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "roomBook.readFailed")?;
    let record = read(&path(&app)?)?
        .into_iter()
        .find(|r| r.summary.id == id)
        .ok_or("roomBook.missing")?;
    Ok(Credentials {
        ticket: record.ticket,
        key: record.key,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(identity: &str) -> ConnectionRecord {
        ConnectionRecord {
            ticket: "endpointacxfr74igmsbvsbnn73wcecg5vt3kbzncqwfrdiampuufwnhkublmaa".into(),
            key: format!("key-{identity}"),
            room: "room-a".into(),
            name: "Campaign".into(),
            identity: identity.into(),
            role: "player".into(),
            home: None,
        }
    }
    #[test]
    fn endpoint_identity_survives_address_change_but_users_remain_distinct() {
        let first = make_record(fixture("alice")).unwrap();
        let parsed: iroh_tickets::endpoint::EndpointTicket = first.ticket.parse().unwrap();
        let mut moved = fixture("alice");
        moved.ticket = iroh_tickets::endpoint::EndpointTicket::new(
            parsed
                .endpoint_addr()
                .clone()
                .with_ip_addr("127.0.0.1:4567".parse().unwrap()),
        )
        .to_string();
        let second = make_record(moved).unwrap();
        assert_ne!(first.ticket, second.ticket);
        assert_eq!(first.summary.id, second.summary.id);
        assert_ne!(
            first.summary.id,
            make_record(fixture("bob")).unwrap().summary.id
        );
    }
    #[test]
    fn identities_keep_distinct_credentials_and_rename_only_the_same_room() {
        let mut records = vec![];
        let alice = upsert(&mut records, make_record(fixture("alice")).unwrap());
        upsert(&mut records, make_record(fixture("bob")).unwrap());
        let mut other = fixture("alice");
        other.room = "room-b".into();
        upsert(&mut records, make_record(other).unwrap());
        rename(&mut records, &alice.id, "Updated campaign").unwrap();
        assert_eq!(records[0].key, "key-alice");
        assert_eq!(records[1].key, "key-bob");
        assert_eq!(records[1].summary.name, "Updated campaign");
        assert_eq!(records[2].summary.name, "Campaign");
        let mut returning = fixture("alice");
        returning.name = returning.room.clone();
        returning.key = "rotated-key".into();
        let saved = upsert(&mut records, make_record(returning).unwrap());
        assert_eq!(records.len(), 3);
        assert_eq!(saved.name, "Updated campaign");
        assert_eq!(records.last().unwrap().key, "rotated-key");
    }
    #[test]
    fn save_roundtrip_does_not_expose_keys_in_summary() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("rooms.json");
        let summary = SavedRoom {
            id: "id".into(),
            server_id: "server".into(),
            room: "room".into(),
            name: "campaign".into(),
            identity: "user".into(),
            role: "keeper".into(),
            home: None,
            last_used: 1,
        };
        write(
            &path,
            &[Record {
                summary,
                ticket: "ticket".into(),
                key: "private-sentinel".into(),
            }],
        )
        .unwrap();
        let saved = read(&path).unwrap();
        assert_eq!(saved[0].key, "private-sentinel");
        assert!(!serde_json::to_string(&saved[0].summary)
            .unwrap()
            .contains("private-sentinel"));
        write(&path, &saved).unwrap();
        assert_eq!(read(&path).unwrap().len(), 1);
    }
    #[test]
    fn damaged_book_is_not_silently_replaced() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("rooms.json");
        std::fs::write(&path, "broken").unwrap();
        assert!(read(&path).is_err());
    }
}
