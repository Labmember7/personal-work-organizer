use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize, Deserialize, Debug)]
pub struct ExportResult {
    pub canceled: bool,
    #[serde(rename = "filePath", skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ImportResult {
    pub canceled: bool,
    #[serde(rename = "filePath", skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PluginSaveFilePayload {
    pub name: Option<String>,
    pub mime: Option<String>,
    pub base64: Option<String>,
    pub text: Option<String>,
}

pub fn export_data(app: &AppHandle, payload: &Value) -> ExportResult {
    let now = chrono_or_simple_date();
    let default_name = format!("suivi-travaux-{}.json", now);

    let file_path = app
        .dialog()
        .file()
        .set_title("Exporter les données")
        .set_file_name(&default_name)
        .add_filter("Fichier JSON", &["json"])
        .blocking_save_file();

    if let Some(fp) = file_path {
        let path = fp.as_path().unwrap_or(std::path::Path::new("")).to_path_buf();
        if let Ok(formatted) = serde_json::to_string_pretty(payload) {
            if fs::write(&path, formatted).is_ok() {
                return ExportResult {
                    canceled: false,
                    file_path: Some(path.to_string_lossy().to_string()),
                };
            }
        }
    }

    ExportResult {
        canceled: true,
        file_path: None,
    }
}

pub fn import_data(app: &AppHandle) -> ImportResult {
    let file_path = app
        .dialog()
        .file()
        .set_title("Importer des données")
        .add_filter("Fichier JSON", &["json"])
        .blocking_pick_file();

    if let Some(fp) = file_path {
        let path = fp.as_path().unwrap_or(std::path::Path::new("")).to_path_buf();
        match fs::read_to_string(&path) {
            Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                Ok(data) => ImportResult {
                    canceled: false,
                    file_path: Some(path.to_string_lossy().to_string()),
                    data: Some(data),
                    error: None,
                },
                Err(_) => ImportResult {
                    canceled: false,
                    file_path: Some(path.to_string_lossy().to_string()),
                    data: None,
                    error: Some("invalid".to_string()),
                },
            },
            Err(_) => ImportResult {
                canceled: false,
                file_path: Some(path.to_string_lossy().to_string()),
                data: None,
                error: Some("invalid".to_string()),
            },
        }
    } else {
        ImportResult {
            canceled: true,
            file_path: None,
            data: None,
            error: None,
        }
    }
}

pub fn save_plugin_file(app: &AppHandle, payload: PluginSaveFilePayload) -> ExportResult {
    let default_name = payload.name.unwrap_or_else(|| "export".to_string());

    let file_path = app
        .dialog()
        .file()
        .set_title("Exporter")
        .set_file_name(&default_name)
        .blocking_save_file();

    if let Some(fp) = file_path {
        let path = fp.as_path().unwrap_or(std::path::Path::new("")).to_path_buf();
        if let Some(text) = payload.text {
            if fs::write(&path, text).is_ok() {
                return ExportResult {
                    canceled: false,
                    file_path: Some(path.to_string_lossy().to_string()),
                };
            }
        } else if let Some(base64_str) = payload.base64 {
            // decode base64
            if let Ok(bytes) = base64_decode(&base64_str) {
                if fs::write(&path, bytes).is_ok() {
                    return ExportResult {
                        canceled: false,
                        file_path: Some(path.to_string_lossy().to_string()),
                    };
                }
            }
        }
    }

    ExportResult {
        canceled: true,
        file_path: None,
    }
}

fn chrono_or_simple_date() -> String {
    use std::time::SystemTime;
    let duration = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // Rough YYYY-MM-DD from days since 1970
    let days = secs / 86400;
    // Approximating date string without heavy chrono dependency:
    let mut year = 1970;
    let mut d = days;
    loop {
        let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
        let days_in_year = if leap { 366 } else { 365 };
        if d < days_in_year {
            break;
        }
        d -= days_in_year;
        year += 1;
    }
    let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    let month_days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let mut month = 1;
    for &md in &month_days {
        if d < md {
            break;
        }
        d -= md;
        month += 1;
    }
    let day = d + 1;
    format!("{:04}-{:02}-{:02}", year, month, day)
}

fn base64_decode(input: &str) -> Result<Vec<u8>, ()> {
    const B64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut table = [0xFFu8; 256];
    for (i, &c) in B64_CHARS.iter().enumerate() {
        table[c as usize] = i as u8;
    }

    let clean: Vec<u8> = input
        .bytes()
        .filter(|&b| b != b'\r' && b != b'\n' && b != b' ' && b != b'=')
        .collect();

    let mut out = Vec::with_capacity((clean.len() * 3) / 4);
    for chunk in clean.chunks(4) {
        let b0 = *table.get(*chunk.get(0).unwrap_or(&0) as usize).unwrap_or(&0xFF);
        let b1 = *table.get(*chunk.get(1).unwrap_or(&0) as usize).unwrap_or(&0xFF);
        if b0 == 0xFF || b1 == 0xFF {
            continue;
        }
        out.push((b0 << 2) | (b1 >> 4));

        if chunk.len() > 2 {
            let b2 = *table.get(*chunk.get(2).unwrap_or(&0) as usize).unwrap_or(&0xFF);
            if b2 != 0xFF {
                out.push((b1 << 4) | (b2 >> 2));
                if chunk.len() > 3 {
                    let b3 = *table.get(*chunk.get(3).unwrap_or(&0) as usize).unwrap_or(&0xFF);
                    if b3 != 0xFF {
                        out.push((b2 << 6) | b3);
                    }
                }
            }
        }
    }
    Ok(out)
}

