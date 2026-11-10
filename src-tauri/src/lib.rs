mod config;
mod data_io;
mod images;
mod paths;
mod plugins;
mod protocols;
mod store;
mod window;

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use paths::{get_images_dir, get_plugin_dirs, get_projects_config_file, get_store_file};
use plugins::RawPluginEntry;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct AppState {
    pub store: store::Store,
    pub watchers: Arc<Mutex<HashMap<String, RecommendedWatcher>>>,
}

#[tauri::command]
fn storage_get(state: State<'_, AppState>, key: String) -> Option<store::StorageGetResult> {
    state.store.get(&key).map(|value| store::StorageGetResult { key, value })
}

#[tauri::command]
fn storage_set(state: State<'_, AppState>, key: String, value: Value) -> store::StorageSetResult {
    state.store.set(key.clone(), value);
    store::StorageSetResult { key, ok: true }
}

#[tauri::command]
fn storage_delete(state: State<'_, AppState>, key: String) -> store::StorageDeleteResult {
    let deleted = state.store.delete(&key);
    store::StorageDeleteResult { key, deleted }
}

#[tauri::command]
fn storage_list(state: State<'_, AppState>, prefix: Option<String>) -> store::StorageListResult {
    let keys = state.store.list(prefix.as_deref());
    store::StorageListResult { keys, prefix }
}

#[tauri::command]
fn config_get_projects(app: AppHandle) -> Vec<Value> {
    let config_file = get_projects_config_file(Some(&app));
    config::get_projects(&config_file)
}

#[tauri::command]
fn config_set_projects(app: AppHandle, projects: Vec<Value>) -> config::ConfigSetResult {
    let config_file = get_projects_config_file(Some(&app));
    config::set_projects(&config_file, projects)
}

#[tauri::command]
fn images_save(app: AppHandle, buffer: Vec<u8>) -> Result<images::ImageSaveResult, String> {
    let images_dir = get_images_dir(Some(&app));
    images::save_image(&images_dir, &buffer)
}

#[tauri::command]
fn images_prune(app: AppHandle, used_files: Vec<String>) -> images::ImagePruneResult {
    let images_dir = get_images_dir(Some(&app));
    images::prune_images(&images_dir, used_files)
}

#[tauri::command]
fn plugins_list(app: AppHandle) -> Vec<RawPluginEntry> {
    let dirs = get_plugin_dirs(Some(&app));
    plugins::list_plugins(&dirs)
}

#[tauri::command]
fn plugins_save_file(app: AppHandle, payload: data_io::PluginSaveFilePayload) -> data_io::ExportResult {
    data_io::save_plugin_file(&app, payload)
}

#[tauri::command]
fn plugins_watch(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    dir: String,
) -> Value {
    let app_handle = app.clone();
    let plugin_id = id.clone();

    let mut watcher = match notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if res.is_ok() {
            let _ = app_handle.emit("host:reload", json!({ "id": plugin_id }));
        }
    }) {
        Ok(w) => w,
        Err(e) => return json!({ "ok": false, "reason": e.to_string() }),
    };

    let watch_path = PathBuf::from(&dir);
    if let Err(e) = watcher.watch(&watch_path, RecursiveMode::Recursive) {
        return json!({ "ok": false, "reason": e.to_string() });
    }

    state.watchers.lock().insert(id, watcher);
    json!({ "ok": true })
}

#[tauri::command]
fn data_export(app: AppHandle, payload: Value) -> data_io::ExportResult {
    data_io::export_data(&app, &payload)
}

#[tauri::command]
fn data_import(app: AppHandle) -> data_io::ImportResult {
    data_io::import_data(&app)
}

use window::{
    pet_hide, pet_restore_main, pet_show, window_close, window_is_maximized, window_minimize,
    window_toggle_maximize,
};

pub fn run() {
    let store_file = get_store_file(None);
    let app_store = store::Store::new(store_file);

    let app_state = AppState {
        store: app_store,
        watchers: Arc::new(Mutex::new(HashMap::new())),
    };

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::Focused(focused) = event {
                    if *focused {
                        let _ = window.emit("main:minimized-changed", false);
                    }
                }
            }
        })
        .register_uri_scheme_protocol("app-image", |ctx, request| {
            protocols::handle_app_image(ctx.app_handle(), &request)
        })
        .register_uri_scheme_protocol("app-plugin", |ctx, request| {
            protocols::handle_app_plugin(ctx.app_handle(), &request)
        })
        .invoke_handler(tauri::generate_handler![
            storage_get,
            storage_set,
            storage_delete,
            storage_list,
            config_get_projects,
            config_set_projects,
            images_save,
            images_prune,
            plugins_list,
            plugins_save_file,
            plugins_watch,
            data_export,
            data_import,
            window_minimize,
            window_toggle_maximize,
            window_close,
            window_is_maximized,
            pet_show,
            pet_hide,
            pet_restore_main,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            let state = app_handle.state::<AppState>();
            state.store.flush();
        }
    });
}
