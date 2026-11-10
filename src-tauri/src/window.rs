use tauri::{AppHandle, Emitter, Manager, Window};

#[tauri::command]
pub fn window_minimize(window: Window) {
    let _ = window.minimize();
    let _ = window.emit("main:minimized-changed", true);
}

#[tauri::command]
pub fn window_toggle_maximize(window: Window) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
pub fn window_close(window: Window) {
    let _ = window.close();
}

#[tauri::command]
pub fn window_is_maximized(window: Window) -> bool {
    window.is_maximized().unwrap_or(false)
}

#[tauri::command]
pub fn pet_show(app: AppHandle) {
    if let Some(pet_win) = app.get_webview_window("pet") {
        let _ = pet_win.show();
    }
}

#[tauri::command]
pub fn pet_hide(app: AppHandle) {
    if let Some(pet_win) = app.get_webview_window("pet") {
        let _ = pet_win.hide();
    }
}

#[tauri::command]
pub fn pet_restore_main(app: AppHandle) {
    if let Some(pet_win) = app.get_webview_window("pet") {
        let _ = pet_win.hide();
    }
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.unminimize();
        let _ = main_win.show();
        let _ = main_win.set_focus();
        let _ = main_win.emit("main:minimized-changed", false);
    }
}

