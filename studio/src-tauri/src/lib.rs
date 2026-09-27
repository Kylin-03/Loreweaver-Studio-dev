mod appearance;
mod asset_cache;
mod engine;
mod files;
mod host_local;
mod llm;
mod local_config;
mod media;
mod panel_serve;
mod room_book;
mod transport_bridge;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(transport_bridge::TransportState::default())
        .manage(panel_serve::PanelServeState::default())
        .manage(host_local::HostLocalState::default())
        // Tier-2 panel iframes load from this opaque-origin static scheme;
        // it serves only registered, hash-verified panel assets.
        .register_uri_scheme_protocol("panel", |ctx, request| {
            panel_serve::handle_panel_request(ctx.app_handle(), &request)
        })
        .invoke_handler(tauri::generate_handler![
            transport_bridge::transport_connect,
            transport_bridge::transport_send,
            transport_bridge::transport_disconnect,
            appearance::appearance_import_background,
            appearance::appearance_load_background,
            appearance::appearance_remove_background,
            appearance::appearance_copy_background,
            room_book::room_book_list,
            room_book::room_book_save,
            room_book::room_book_credentials,
            room_book::room_book_rename,
            local_config::local_config_read,
            local_config::local_config_save,
            files::write_text_file,
            files::write_binary_file,
            files::read_file_base64,
            files::write_pack_source,
            engine::probe_engine_cli,
            engine::run_engine_cli,
            host_local::host_local_start,
            host_local::host_local_stop,
            host_local::host_local_status,
            llm::llm_chat,
            asset_cache::asset_cache_status,
            asset_cache::asset_fetch,
            asset_cache::asset_read_base64,
            media::media_prepare,
            media::media_upload,
            panel_serve::panel_serve_register,
            panel_serve::panel_serve_unregister
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                // Tauri exits the process without dropping managed state. Stop
                // and reap the owned host while its async runtime is still alive.
                let _ = tauri::async_runtime::block_on(host_local::host_local_stop(
                    app.clone(),
                    app.state::<host_local::HostLocalState>(),
                ));
            }
        });
}
