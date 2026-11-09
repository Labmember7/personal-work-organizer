use crate::paths::PluginDir;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

pub const PLUGIN_CSP: &str =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; \
     img-src data: blob:; font-src data:; connect-src 'none'; \
     form-action 'none'; base-uri 'none'";

pub const PLUGIN_CSP_V2: &str =
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; \
     img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; \
     form-action 'none'; base-uri 'none'";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RawPluginEntry {
    pub file: String,
    pub origin: String, // "builtin" | "user"
    #[serde(rename = "manifestJson")]
    pub manifest_json: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub root: Option<String>,
    #[serde(rename = "specJson", skip_serializing_if = "Option::is_none")]
    pub spec_json: Option<String>,
    #[serde(rename = "panelSpecs", skip_serializing_if = "Option::is_none")]
    pub panel_specs: Option<HashMap<String, String>>,
}

pub fn extract_manifest_block(html: &str) -> Option<String> {
    let re = Regex::new(r#"(?i)<script[^>]*\bid=["']trk-plugin["'][^>]*>([\s\S]*?)</script>"#).ok()?;
    let caps = re.captures(html)?;
    let body = caps.get(1)?.as_str().trim();
    if body.is_empty() {
        None
    } else {
        Some(body.to_string())
    }
}

pub fn list_plugins(dirs: &[PluginDir]) -> Vec<RawPluginEntry> {
    let mut entries = Vec::new();

    // 1. Discover v1 (*.html)
    for pdir in dirs {
        if let Ok(dir_entries) = fs::read_dir(&pdir.dir) {
            for entry in dir_entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_file() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.to_lowercase().ends_with(".html") {
                            match fs::read_to_string(entry.path()) {
                                Ok(html) => {
                                    let manifest_json = extract_manifest_block(&html);
                                    let error = if manifest_json.is_none() {
                                        Some("no-manifest".to_string())
                                    } else {
                                        None
                                    };
                                    entries.push(RawPluginEntry {
                                        file: name,
                                        origin: pdir.origin.clone(),
                                        manifest_json,
                                        error,
                                        id: None,
                                        root: None,
                                        spec_json: None,
                                        panel_specs: None,
                                    });
                                }
                                Err(_) => {
                                    entries.push(RawPluginEntry {
                                        file: name,
                                        origin: pdir.origin.clone(),
                                        manifest_json: None,
                                        error: Some("unreadable".to_string()),
                                        id: None,
                                        root: None,
                                        spec_json: None,
                                        panel_specs: None,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Discover v2 (folders)
    for pdir in dirs {
        if let Ok(dir_entries) = fs::read_dir(&pdir.dir) {
            for entry in dir_entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        let folder_path = entry.path();
                        let manifest_path = folder_path.join("manifest.json");
                        if manifest_path.exists() {
                            if let Ok(mut manifest_json) = fs::read_to_string(&manifest_path) {
                                // strip BOM if present
                                if manifest_json.starts_with('\u{FEFF}') {
                                    manifest_json.remove(0);
                                }
                                let mut id = None;
                                let mut spec_json = None;
                                let mut panel_specs = HashMap::new();

                                if let Ok(val) = serde_json::from_str::<Value>(&manifest_json) {
                                    if let Some(m_id) = val.get("id").and_then(|v| v.as_str()) {
                                        id = Some(m_id.to_string());
                                    }

                                    if let Some(views) = val.pointer("/contributes/views").and_then(|v| v.as_array()) {
                                        if let Some(decl) = views.iter().find(|v| {
                                            v.get("kind").and_then(|k| k.as_str()) == Some("declarative")
                                                && v.get("spec").and_then(|s| s.as_str()).is_some()
                                        }) {
                                            if let Some(spec_rel) = decl.get("spec").and_then(|s| s.as_str()) {
                                                if let Ok(spec_text) = fs::read_to_string(folder_path.join(spec_rel)) {
                                                    spec_json = Some(spec_text);
                                                }
                                            }
                                        }
                                    }

                                    if let Some(panels) = val.pointer("/contributes/taskPanels").and_then(|v| v.as_array()) {
                                        for p in panels {
                                            if p.get("kind").and_then(|k| k.as_str()) == Some("declarative") {
                                                if let (Some(pid), Some(spec_rel)) = (
                                                    p.get("id").and_then(|v| v.as_str()),
                                                    p.get("spec").and_then(|v| v.as_str()),
                                                ) {
                                                    if let Ok(spec_text) = fs::read_to_string(folder_path.join(spec_rel)) {
                                                        panel_specs.insert(pid.to_string(), spec_text);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                let folder_name = folder_path.file_name().unwrap_or_default().to_string_lossy().to_string();
                                let resolved_id = id.unwrap_or(folder_name);

                                entries.push(RawPluginEntry {
                                    file: format!("{}/manifest.json", resolved_id),
                                    origin: pdir.origin.clone(),
                                    manifest_json: Some(manifest_json),
                                    error: None,
                                    id: Some(resolved_id),
                                    root: Some(folder_path.to_string_lossy().to_string()),
                                    spec_json,
                                    panel_specs: if panel_specs.is_empty() { None } else { Some(panel_specs) },
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    entries
}

pub fn read_plugin_html(dirs: &[PluginDir], file: &str) -> Option<String> {
    let re = Regex::new(r"^[\w-]+\.html$").ok()?;
    if !re.is_match(file) {
        return None;
    }

    let mut found = None;
    for pdir in dirs {
        let full = pdir.dir.join(file);
        if full.exists() {
            if let Ok(html) = fs::read_to_string(full) {
                found = Some(html);
            }
        }
    }
    found
}

pub fn wrap_plugin_html(html: &str, sdk_source: &str) -> String {
    let inject = format!("<meta charset=\"utf-8\">\n<script>{}</script>\n", sdk_source);
    let head_re = Regex::new(r"(?i)<head[^>]*>").unwrap();
    if let Some(mat) = head_re.find(html) {
        let end = mat.end();
        format!("{}{}{}", &html[..end], inject, &html[end..])
    } else {
        format!("{}{}", inject, html)
    }
}

pub fn read_plugin_resource(root: &Path, rel_path: &str) -> Option<(Vec<u8>, String)> {
    if rel_path.is_empty() || Path::new(rel_path).is_absolute() {
        return None;
    }
    if rel_path.split(['/', '\\']).any(|s| s == "..") {
        return None;
    }

    let full = root.join(rel_path);
    let real_root = fs::canonicalize(root).ok()?;
    let real_full = fs::canonicalize(&full).ok()?;

    if !real_full.starts_with(&real_root) {
        return None;
    }
    if !real_full.is_file() {
        return None;
    }

    let data = fs::read(&real_full).ok()?;
    let mime = mime_for_path(&real_full);
    Some((data, mime))
}

pub fn mime_for_path(path: &Path) -> String {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "html" | "htm" => "text/html; charset=utf-8".to_string(),
        "js" | "mjs" => "text/javascript; charset=utf-8".to_string(),
        "css" => "text/css; charset=utf-8".to_string(),
        "json" | "map" => "application/json".to_string(),
        "svg" => "image/svg+xml".to_string(),
        "png" => "image/png".to_string(),
        "jpg" | "jpeg" => "image/jpeg".to_string(),
        "gif" => "image/gif".to_string(),
        "webp" => "image/webp".to_string(),
        "woff2" => "font/woff2".to_string(),
        "woff" => "font/woff".to_string(),
        "ttf" => "font/ttf".to_string(),
        _ => "application/octet-stream".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_manifest_block() {
        let html = r#"
            <!DOCTYPE html>
            <html>
            <head>
              <script id="trk-plugin" type="application/json">
                {"id": "test-plugin", "version": "1.0.0"}
              </script>
            </head>
            </html>
        "#;
        let manifest = extract_manifest_block(html);
        assert!(manifest.is_some());
        assert!(manifest.unwrap().contains(r#""id": "test-plugin""#));
    }

    #[test]
    fn test_wrap_plugin_html() {
        let html = "<html><head><title>Test</title></head><body></body></html>";
        let sdk = "window.TrkPlugin = {};";
        let wrapped = wrap_plugin_html(html, sdk);
        assert!(wrapped.contains("<script>window.TrkPlugin = {};</script>"));
    }

    #[test]
    fn test_mime_for_path() {
        assert_eq!(mime_for_path(Path::new("index.html")), "text/html; charset=utf-8");
        assert_eq!(mime_for_path(Path::new("bundle.js")), "text/javascript; charset=utf-8");
        assert_eq!(mime_for_path(Path::new("style.css")), "text/css; charset=utf-8");
        assert_eq!(mime_for_path(Path::new("image.jpg")), "image/jpeg");
        assert_eq!(mime_for_path(Path::new("font.woff2")), "font/woff2");
    }
}

