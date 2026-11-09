use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug)]
pub struct ProjectsConfig {
    pub projects: Vec<Value>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ConfigSetResult {
    pub ok: bool,
}

pub fn get_projects(config_file: &PathBuf) -> Vec<Value> {
    if config_file.exists() {
        if let Ok(raw) = fs::read_to_string(config_file) {
            if let Ok(parsed) = serde_json::from_str::<ProjectsConfig>(&raw) {
                return parsed.projects;
            }
        }
    }

    let default_val: Vec<Value> = Vec::new();
    set_projects(config_file, default_val.clone());
    default_val
}

pub fn set_projects(config_file: &PathBuf, projects: Vec<Value>) -> ConfigSetResult {
    let cfg = ProjectsConfig { projects };
    if let Some(parent) = config_file.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json_str) = serde_json::to_string_pretty(&cfg) {
        let _ = fs::write(config_file, json_str);
        ConfigSetResult { ok: true }
    } else {
        ConfigSetResult { ok: false }
    }
}

