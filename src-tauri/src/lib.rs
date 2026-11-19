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
use std::time::{Duration, Instant};
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
async fn config_get_projects(app: AppHandle) -> Vec<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let config_file = get_projects_config_file(Some(&app));
        config::get_projects(&config_file)
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
async fn config_set_projects(app: AppHandle, projects: Vec<Value>) -> config::ConfigSetResult {
    tauri::async_runtime::spawn_blocking(move || {
        let config_file = get_projects_config_file(Some(&app));
        config::set_projects(&config_file, projects)
    })
    .await
    .unwrap_or(config::ConfigSetResult { ok: false })
}

#[tauri::command]
async fn images_save(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<images::ImageSaveResult, String> {
    let bytes: Vec<u8> = match request.body() {
        tauri::ipc::InvokeBody::Raw(raw) => raw.clone(),
        tauri::ipc::InvokeBody::Json(val) => val
            .get("buffer")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|n| n.as_u64().map(|b| b as u8))
                    .collect()
            })
            .ok_or_else(|| "Charge utile image invalide".to_string())?,
    };
    tauri::async_runtime::spawn_blocking(move || {
        let images_dir = get_images_dir(Some(&app));
        images::save_image(&images_dir, &bytes)
    })
    .await
    .map_err(|e| format!("Tâche image interrompue: {}", e))?
}

#[tauri::command]
async fn images_prune(app: AppHandle, used_files: Vec<String>) -> images::ImagePruneResult {
    tauri::async_runtime::spawn_blocking(move || {
        let images_dir = get_images_dir(Some(&app));
        images::prune_images(&images_dir, used_files)
    })
    .await
    .unwrap_or(images::ImagePruneResult { removed: 0 })
}

#[tauri::command]
async fn plugins_list(app: AppHandle) -> Vec<RawPluginEntry> {
    tauri::async_runtime::spawn_blocking(move || {
        let dirs = get_plugin_dirs(Some(&app));
        plugins::list_plugins(&dirs)
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
async fn plugins_save_file(
    app: AppHandle,
    payload: data_io::PluginSaveFilePayload,
) -> data_io::ExportResult {
    tauri::async_runtime::spawn_blocking(move || data_io::save_plugin_file(&app, payload))
        .await
        .unwrap_or(data_io::ExportResult {
            canceled: true,
            file_path: None,
        })
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
    let last_emit = Arc::new(Mutex::new(Instant::now() - Duration::from_secs(1)));

    let mut watcher = match notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if res.is_ok() {
            let mut last = last_emit.lock();
            if last.elapsed() >= Duration::from_millis(150) {
                *last = Instant::now();
                let _ = app_handle.emit("host:reload", json!({ "id": plugin_id }));
            }
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
async fn data_export(app: AppHandle, payload: Value) -> data_io::ExportResult {
    tauri::async_runtime::spawn_blocking(move || data_io::export_data(&app, &payload))
        .await
        .unwrap_or(data_io::ExportResult {
            canceled: true,
            file_path: None,
        })
}

#[tauri::command]
async fn data_import(app: AppHandle) -> data_io::ImportResult {
    tauri::async_runtime::spawn_blocking(move || data_io::import_data(&app))
        .await
        .unwrap_or(data_io::ImportResult {
            canceled: true,
            file_path: None,
            error: None,
            data: None,
        })
}

use window::{
    enforce_pet_topmost, pet_end_drag, pet_hide, pet_is_cursor_inside, pet_restore_main,
    pet_show, pet_start_drag, pet_sync_bounds, pet_update_drag, window_close,
    window_is_maximized, window_minimize, window_toggle_maximize,
};

#[cfg(target_os = "linux")]
fn sanitize_linux_env() {
    let in_snap = std::env::var_os("SNAP").is_some();

    // Supprime les variables GTK/GIO/GSettings injectées par un conteneur Snap
    // (ex. terminal intégré VS Code Snap) pour éviter des conflits de schémas
    // GLib/WebKitGTK avec l'environnement système hôte.
    for key in [
        "GSETTINGS_SCHEMA_DIR",
        "GTK_PATH",
        "GTK_EXE_PREFIX",
        "GIO_MODULE_DIR",
        "GTK_IM_MODULE_FILE",
        "LOCPATH",
    ] {
        if let Ok(val) = std::env::var(key) {
            if in_snap || val.contains("/snap/") {
                std::env::remove_var(key);
            }
        }
    }

    if let Ok(orig) = std::env::var("XDG_DATA_DIRS_VSCODE_SNAP_ORIG") {
        if !orig.is_empty() {
            std::env::set_var("XDG_DATA_DIRS", orig);
        }
    } else if let Ok(xdg) = std::env::var("XDG_DATA_DIRS") {
        let mut filtered: Vec<&str> = xdg
            .split(':')
            .filter(|p| !p.is_empty() && !p.contains("/snap"))
            .collect();
        for sys_dir in ["/usr/local/share", "/usr/share"] {
            if !filtered.iter().any(|p| p.trim_end_matches('/') == sys_dir) {
                filtered.insert(0, sys_dir);
            }
        }
        std::env::set_var("XDG_DATA_DIRS", filtered.join(":"));
    }

    let host_schemas = std::path::Path::new("/usr/share/glib-2.0/schemas");
    if host_schemas.join("gschemas.compiled").exists() {
        std::env::set_var("GSETTINGS_SCHEMA_DIR", host_schemas);
    }

    if let Ok(mods) = std::env::var("GTK_MODULES") {
        let cleaned: Vec<&str> = mods
            .split(':')
            .filter(|m| !m.is_empty() && *m != "appmenu-gtk-module")
            .collect();
        if cleaned.is_empty() {
            std::env::remove_var("GTK_MODULES");
        } else {
            std::env::set_var("GTK_MODULES", cleaned.join(":"));
        }
    }

    if std::env::var_os("GDK_BACKEND").map_or(true, |v| v.is_empty())
        && std::env::var_os("DISPLAY").is_some_and(|v| !v.is_empty())
    {
        // Sous GTK3 Wayland natif, alwaysOnTop / stick / skipTaskbar / move_ sont
        // ignorés ; on privilégie X11/XWayland quand DISPLAY est actif.
        std::env::set_var("GDK_BACKEND", "x11,wayland");
    }
}

pub fn run() {
    #[cfg(target_os = "linux")]
    sanitize_linux_env();

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
                match event {
                    tauri::WindowEvent::Focused(true) => {
                        let _ = window.emit("main:minimized-changed", false);
                    }
                    tauri::WindowEvent::Focused(false) | tauri::WindowEvent::Resized(_) => {
                        if window.is_minimized().unwrap_or(false) {
                            let _ = window.emit("main:minimized-changed", true);
                            if let Some(pet_win) = window.app_handle().get_webview_window("pet") {
                                if pet_win.is_visible().unwrap_or(false) {
                                    enforce_pet_topmost(&pet_win);
                                }
                            }
                        }
                    }
                    _ => {}
                }
            } else if window.label() == "pet" {
                match event {
                    tauri::WindowEvent::Focused(_)
                    | tauri::WindowEvent::Moved(_)
                    | tauri::WindowEvent::Resized(_) => {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.set_always_on_top(true);
                        }
                    }
                    _ => {}
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
            pet_sync_bounds,
            pet_start_drag,
            pet_update_drag,
            pet_end_drag,
            pet_is_cursor_inside,
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
