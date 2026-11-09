use crate::paths::{get_images_dir, get_plugin_dirs, resolve_base_dir};
use crate::plugins::{
    read_plugin_html, read_plugin_resource, wrap_plugin_html, PLUGIN_CSP,
    PLUGIN_CSP_V2,
};
use regex::Regex;
use std::fs;
use tauri::http::{header, Request, Response, StatusCode};
use tauri::AppHandle;

pub fn handle_app_image(
    app: &AppHandle,
    request: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let path = request.uri().path();
    let file_name = path.trim_start_matches('/');

    let re = Regex::new(r"^[\w-]+\.jpg$").unwrap();
    if !re.is_match(file_name) {
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(b"Invalid file name".to_vec())
            .unwrap();
    }

    let images_dir = get_images_dir(Some(app));
    let target = images_dir.join(file_name);

    if target.exists() {
        if let Ok(bytes) = fs::read(&target) {
            return Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "image/jpeg")
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .body(bytes)
                .unwrap();
        }
    }

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(b"Not found".to_vec())
        .unwrap()
}

pub fn handle_app_plugin(
    app: &AppHandle,
    request: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let uri = request.uri();
    let host = uri.host().unwrap_or("");
    let path = uri.path();
    let rel_path = path.trim_start_matches('/');

    let dirs = get_plugin_dirs(Some(app));

    if host == "local" {
        if let Some(html) = read_plugin_html(&dirs, rel_path) {
            // Read SDK
            let sdk = read_sdk_js(app);
            let wrapped = wrap_plugin_html(&html, &sdk);
            return Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                .header("Content-Security-Policy", PLUGIN_CSP)
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .body(wrapped.into_bytes())
                .unwrap();
        }
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(b"Not found".to_vec())
            .unwrap();
    }

    // host is plugin id (v2)
    if rel_path == "@trk/sdk.js" || rel_path.starts_with("@trk/") {
        let sdk_mjs = read_sdk_mjs(app);
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/javascript; charset=utf-8")
            .header("Content-Security-Policy", PLUGIN_CSP_V2)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(sdk_mjs.into_bytes())
            .unwrap();
    }

    // Locate plugin root for host
    for pdir in &dirs {
        let candidate = pdir.dir.join(host);
        if candidate.is_dir() {
            if let Some((data, mime)) = read_plugin_resource(&candidate, rel_path) {
                return Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, mime)
                    .header("Content-Security-Policy", PLUGIN_CSP_V2)
                    .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                    .body(data)
                    .unwrap();
            }
        }
    }

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(b"Not found".to_vec())
        .unwrap()
}

fn read_sdk_js(app: &AppHandle) -> String {
    let dirs = get_plugin_dirs(Some(app));
    for d in &dirs {
        let candidate = d.dir.join("sdk").join("trk-plugin-sdk.js");
        if candidate.exists() {
            if let Ok(content) = fs::read_to_string(candidate) {
                return content;
            }
        }
    }
    // Fallback to base
    let base = resolve_base_dir().join("plugins").join("sdk").join("trk-plugin-sdk.js");
    fs::read_to_string(base).unwrap_or_default()
}

fn read_sdk_mjs(app: &AppHandle) -> String {
    let dirs = get_plugin_dirs(Some(app));
    for d in &dirs {
        let candidate = d.dir.join("sdk").join("trk-plugin-sdk.mjs");
        if candidate.exists() {
            if let Ok(content) = fs::read_to_string(candidate) {
                return content;
            }
        }
    }
    let base = resolve_base_dir().join("plugins").join("sdk").join("trk-plugin-sdk.mjs");
    fs::read_to_string(base).unwrap_or_default()
}

