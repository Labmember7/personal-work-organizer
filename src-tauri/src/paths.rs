use std::path::{Path, PathBuf};
use std::fs;
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug)]
pub struct PluginDir {
    pub dir: PathBuf,
    pub origin: String, // "builtin" | "user"
}

pub fn resolve_base_dir() -> PathBuf {
    if let Ok(portable_dir) = std::env::var("PORTABLE_EXECUTABLE_DIR") {
        return PathBuf::from(portable_dir);
    }
    if let Ok(appimage) = std::env::var("APPIMAGE") {
        if let Some(parent) = Path::new(&appimage).parent() {
            return parent.to_path_buf();
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            // If running inside target/debug or target/release, point to project root
            let p_str = parent.to_string_lossy();
            if p_str.contains("target") {
                let mut curr = parent.to_path_buf();
                while let Some(up) = curr.parent() {
                    if curr.ends_with("target") {
                        return up.to_path_buf();
                    }
                    curr = up.to_path_buf();
                }
            }
            return parent.to_path_buf();
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn get_data_dir(app: Option<&AppHandle>) -> PathBuf {
    let base = resolve_base_dir();
    let candidates = [
        base.join("data"),
        if let Some(a) = app {
            a.path().app_data_dir().map(|d| d.join("data")).unwrap_or_else(|_| base.join("data"))
        } else {
            base.join("data")
        },
    ];

    for candidate in candidates {
        if !candidate.exists() {
            let _ = fs::create_dir_all(&candidate);
        }
        if candidate.exists() {
            // Test write permission
            let test_file = candidate.join(".write_test");
            if fs::write(&test_file, b"test").is_ok() {
                let _ = fs::remove_file(&test_file);
                return candidate;
            }
        }
    }

    base.join("data")
}

pub fn get_images_dir(app: Option<&AppHandle>) -> PathBuf {
    let dir = get_data_dir(app).join("images");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

pub fn get_projects_config_file(app: Option<&AppHandle>) -> PathBuf {
    get_data_dir(app).join("projects.config.json")
}

pub fn get_store_file(app: Option<&AppHandle>) -> PathBuf {
    get_data_dir(app).join("store.json")
}

pub fn get_plugin_dirs(app: Option<&AppHandle>) -> Vec<PluginDir> {
    let mut dirs = Vec::new();
    let base = resolve_base_dir();

    // Builtin plugins:
    let builtin_candidate = if let Some(a) = app {
        if let Ok(res_dir) = a.path().resource_dir() {
            res_dir.join("plugins")
        } else {
            base.join("plugins")
        }
    } else {
        base.join("plugins")
    };

    let builtin_dir = if builtin_candidate.exists() {
        builtin_candidate
    } else {
        base.join("plugins")
    };
    dirs.push(PluginDir {
        dir: builtin_dir,
        origin: "builtin".to_string(),
    });

    // User plugins:
    let user_dir = base.join("plugins");
    if !dirs.iter().any(|d| d.dir == user_dir) {
        if !user_dir.exists() {
            let _ = fs::create_dir_all(&user_dir);
        }
        dirs.push(PluginDir {
            dir: user_dir,
            origin: "user".to_string(),
        });
    }

    dirs
}

