use parking_lot::Mutex;
#[cfg(target_os = "linux")]
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, LogicalPosition, Manager, Position, WebviewWindow, Window};

static PET_DRAG_ORIGIN: Mutex<Option<(f64, f64, f64, f64)>> = Mutex::new(None);
static PET_WINDOW_SIZE: Mutex<(f64, f64)> = Mutex::new((96.0, 104.0));
#[cfg(target_os = "linux")]
static PET_LEAVE_WIRED: AtomicBool = AtomicBool::new(false);

/// Réapplique les attributs « toujours au premier plan » et « tous les bureaux »
/// sur la fenêtre compagnon (utile après mapping/déplacement sous Linux et Windows).
pub fn enforce_pet_topmost(pet_win: &WebviewWindow) {
    #[cfg(not(target_os = "linux"))]
    let _ = pet_win.set_resizable(false);

    let _ = pet_win.set_maximizable(false);
    let _ = pet_win.set_skip_taskbar(true);
    let _ = pet_win.set_visible_on_all_workspaces(true);
    let _ = pet_win.set_always_on_top(true);

    #[cfg(target_os = "linux")]
    {
        let win_clone = pet_win.clone();
        let _ = pet_win.run_on_main_thread(move || {
            use gtk::gdk;
            use gtk::prelude::*;
            if let Ok(gtk_win) = win_clone.gtk_window() {
                gtk_win.set_type_hint(gdk::WindowTypeHint::Dock);
                gtk_win.set_keep_above(true);
                gtk_win.stick();
                if let Some(gdk_win) = gtk_win.window() {
                    gdk_win.set_type_hint(gdk::WindowTypeHint::Dock);
                }

                if !PET_LEAVE_WIRED.swap(true, Ordering::SeqCst) {
                    gtk_win.add_events(gdk::EventMask::LEAVE_NOTIFY_MASK);
                    let emit_win = win_clone.clone();
                    gtk_win.connect_leave_notify_event(move |_, event| {
                        if event.detail() != gdk::NotifyType::Inferior {
                            let _ = emit_win.emit("pet:pointer-left", ());
                        }
                        gtk::glib::Propagation::Proceed
                    });

                    if let Ok(vbox) = win_clone.default_vbox() {
                        for child in vbox.children() {
                            child.add_events(gdk::EventMask::LEAVE_NOTIFY_MASK);
                            let emit_child = win_clone.clone();
                            child.connect_leave_notify_event(move |_, event| {
                                if event.detail() != gdk::NotifyType::Inferior {
                                    let _ = emit_child.emit("pet:pointer-left", ());
                                }
                                gtk::glib::Propagation::Proceed
                            });
                        }
                    }
                }
            }
        });
    }
}

/// Applique la taille logique exacte à la fenêtre du compagnon, en contournant
/// la taille minimale par défaut de 200x200 et le verrou de redimensionnement GTK3 sous Linux.
fn apply_pet_size(pet_win: &WebviewWindow, width: f64, height: f64) {
    let target_w = width.max(52.0).ceil();
    let target_h = height.max(64.0).ceil();

    #[cfg(target_os = "linux")]
    {
        let win_clone = pet_win.clone();
        let w_i32 = target_w as i32;
        let h_i32 = target_h as i32;
        let _ = pet_win.run_on_main_thread(move || {
            use gtk::gdk;
            use gtk::prelude::*;
            if let Ok(vbox) = win_clone.default_vbox() {
                vbox.set_size_request(1, 1);
                for child in vbox.children() {
                    child.set_size_request(1, 1);
                }
            }
            if let Ok(gtk_win) = win_clone.gtk_window() {
                gtk_win.set_resizable(true);
                gtk_win.set_size_request(w_i32, h_i32);
                let geom = gdk::Geometry::new(
                    w_i32,
                    h_i32,
                    w_i32,
                    h_i32,
                    w_i32,
                    h_i32,
                    0,
                    0,
                    0.0,
                    0.0,
                    gdk::Gravity::NorthWest,
                );
                let picky_none: Option<&gtk::Window> = None;
                gtk_win.set_geometry_hints(
                    picky_none,
                    Some(&geom),
                    gdk::WindowHints::MIN_SIZE
                        | gdk::WindowHints::MAX_SIZE
                        | gdk::WindowHints::BASE_SIZE,
                );
                gtk_win.resize(w_i32, h_i32);
                if let Some(gdk_win) = gtk_win.window() {
                    gdk_win.resize(w_i32, h_i32);
                }
            }
        });
    }

    #[cfg(not(target_os = "linux"))]
    {
        use tauri::{LogicalSize, Size};
        let (old_w, old_h) = *PET_WINDOW_SIZE.lock();
        let min_bounds = Size::Logical(LogicalSize::new(target_w.min(old_w), target_h.min(old_h)));
        let max_bounds = Size::Logical(LogicalSize::new(target_w.max(old_w), target_h.max(old_h)));
        let target_size = Size::Logical(LogicalSize::new(target_w, target_h));

        let _ = pet_win.set_min_size(Some(min_bounds));
        let _ = pet_win.set_max_size(Some(max_bounds));
        let _ = pet_win.set_size(target_size);
        let _ = pet_win.set_min_size(Some(target_size));
        let _ = pet_win.set_max_size(Some(target_size));
    }
}

/// Place la fenêtre compagnon au centre de l'écran actif (sur le moniteur de la fenêtre principale).
fn center_pet_on_screen(app: &AppHandle, pet_win: &WebviewWindow, width: f64, height: f64) {
    let monitor = app
        .get_webview_window("main")
        .and_then(|main_win| main_win.current_monitor().ok().flatten())
        .or_else(|| pet_win.current_monitor().ok().flatten())
        .or_else(|| pet_win.primary_monitor().ok().flatten());

    let Some(monitor) = monitor else {
        let _ = pet_win.center();
        return;
    };

    let scale = monitor.scale_factor();
    let mon_pos = monitor.position().to_logical::<f64>(scale);
    let mon_size = monitor.size().to_logical::<f64>(scale);
    let cx = (mon_pos.x + (mon_size.width - width) / 2.0).round();
    let cy = (mon_pos.y + (mon_size.height - height) / 2.0).round();

    let _ = pet_win.set_position(Position::Logical(LogicalPosition::new(cx, cy)));

    #[cfg(target_os = "linux")]
    {
        let win_clone = pet_win.clone();
        let x_i32 = cx as i32;
        let y_i32 = cy as i32;
        let _ = pet_win.run_on_main_thread(move || {
            use gtk::prelude::*;
            if let Ok(gtk_win) = win_clone.gtk_window() {
                gtk_win.move_(x_i32, y_i32);
            }
        });
    }
}

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
        let (cur_w, cur_h) = *PET_WINDOW_SIZE.lock();
        apply_pet_size(&pet_win, cur_w, cur_h);
        enforce_pet_topmost(&pet_win);
        center_pet_on_screen(&app, &pet_win, cur_w, cur_h);
        let _ = pet_win.show();
        apply_pet_size(&pet_win, cur_w, cur_h);
        enforce_pet_topmost(&pet_win);
        center_pet_on_screen(&app, &pet_win, cur_w, cur_h);
    }
}

#[tauri::command]
pub fn pet_hide(app: AppHandle) {
    *PET_DRAG_ORIGIN.lock() = None;
    if let Some(pet_win) = app.get_webview_window("pet") {
        let _ = pet_win.hide();
    }
}

#[tauri::command]
pub fn pet_restore_main(app: AppHandle) {
    *PET_DRAG_ORIGIN.lock() = None;
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

/// Adapte la taille de la fenêtre du pet au rectangle utile de son contenu tout en
/// gardant le bas-centre (les pieds du compagnon) ancré au même point à l'écran.
#[tauri::command]
pub fn pet_sync_bounds(app: AppHandle, width: f64, height: f64) {
    if !width.is_finite() || !height.is_finite() {
        return;
    }
    if PET_DRAG_ORIGIN.lock().is_some() {
        return;
    }

    let target_w = width.max(52.0).ceil();
    let target_h = height.max(64.0).ceil();

    let (old_w, old_h) = *PET_WINDOW_SIZE.lock();
    if (target_w - old_w).abs() < 1.0 && (target_h - old_h).abs() < 1.0 {
        return;
    }

    if let Some(pet_win) = app.get_webview_window("pet") {
        let next_pos = pet_win.outer_position().ok().map(|phys_pos| {
            let scale = pet_win.scale_factor().unwrap_or(1.0);
            let logical = phys_pos.to_logical::<f64>(scale);
            let new_x = logical.x + (old_w - target_w) / 2.0;
            let new_y = logical.y + (old_h - target_h);
            (new_x, new_y)
        });

        apply_pet_size(&pet_win, target_w, target_h);

        if let Some((new_x, new_y)) = next_pos {
            let _ = pet_win.set_position(Position::Logical(LogicalPosition::new(new_x, new_y)));
        }

        *PET_WINDOW_SIZE.lock() = (target_w, target_h);
        enforce_pet_topmost(&pet_win);
    }
}

/// Démarre un déplacement manuel par positionnement direct afin d'éviter
/// l'aperçu d'ancrage/agrandissement du gestionnaire de fenêtres aux bords de l'écran.
#[tauri::command]
pub fn pet_start_drag(app: AppHandle, screen_x: f64, screen_y: f64) {
    if let Some(pet_win) = app.get_webview_window("pet") {
        enforce_pet_topmost(&pet_win);
        if let Ok(phys_pos) = pet_win.outer_position() {
            let scale = pet_win.scale_factor().unwrap_or(1.0);
            let logical = phys_pos.to_logical::<f64>(scale);
            *PET_DRAG_ORIGIN.lock() = Some((logical.x, logical.y, screen_x, screen_y));
        }
    }
}

#[tauri::command]
pub fn pet_update_drag(app: AppHandle, screen_x: f64, screen_y: f64) {
    let origin = *PET_DRAG_ORIGIN.lock();
    if let Some((win_x, win_y, start_x, start_y)) = origin {
        if let Some(pet_win) = app.get_webview_window("pet") {
            let next_x = win_x + (screen_x - start_x);
            let next_y = win_y + (screen_y - start_y);
            let _ = pet_win.set_position(Position::Logical(LogicalPosition::new(next_x, next_y)));
        }
    }
}

#[tauri::command]
pub fn pet_end_drag(app: AppHandle) {
    *PET_DRAG_ORIGIN.lock() = None;
    if let Some(pet_win) = app.get_webview_window("pet") {
        enforce_pet_topmost(&pet_win);
    }
}

#[tauri::command]
pub async fn pet_is_cursor_inside(app: AppHandle) -> bool {
    let Some(pet_win) = app.get_webview_window("pet") else {
        return false;
    };
    if !pet_win.is_visible().unwrap_or(false) {
        return false;
    }

    #[cfg(target_os = "linux")]
    {
        let (tx, rx) = std::sync::mpsc::sync_channel(1);
        let win_clone = pet_win.clone();
        if pet_win
            .run_on_main_thread(move || {
                use gtk::prelude::*;
                let mut inside = false;
                if let Ok(gtk_win) = win_clone.gtk_window() {
                    if let Some(target_gdk) = gtk_win.window() {
                        if let Some(pointer) =
                            gtk_win.display().default_seat().and_then(|s| s.pointer())
                        {
                            if let (Some(win_under), _, _) = pointer.window_at_position() {
                                inside = win_under.toplevel() == target_gdk;
                            }
                        }
                    }
                }
                let _ = tx.send(inside);
            })
            .is_err()
        {
            return false;
        }
        return rx
            .recv_timeout(std::time::Duration::from_millis(100))
            .unwrap_or(false);
    }

    #[cfg(not(target_os = "linux"))]
    {
        let (Ok(cursor), Ok(pos), Ok(size)) = (
            pet_win.cursor_position(),
            pet_win.outer_position(),
            pet_win.outer_size(),
        ) else {
            return false;
        };
        let left = pos.x as f64;
        let top = pos.y as f64;
        let right = left + size.width as f64;
        let bottom = top + size.height as f64;
        cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= bottom
    }
}
