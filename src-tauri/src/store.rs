use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StorageGetResult {
    pub key: String,
    pub value: Value,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StorageSetResult {
    pub key: String,
    pub ok: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StorageDeleteResult {
    pub key: String,
    pub deleted: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StorageListResult {
    pub keys: Vec<String>,
    pub prefix: Option<String>,
}

pub struct StoreInner {
    pub cache: HashMap<String, Value>,
    pub file_path: PathBuf,
    pub dirty: bool,
}

#[derive(Clone)]
pub struct Store {
    inner: Arc<RwLock<StoreInner>>,
    debounce_running: Arc<AtomicBool>,
}

impl Store {
    pub fn new(file_path: PathBuf) -> Self {
        let mut cache = HashMap::new();
        let candidates = [file_path.clone(), PathBuf::from(format!("{}.bak", file_path.display()))];

        for candidate in &candidates {
            if candidate.exists() {
                if let Ok(content) = fs::read_to_string(candidate) {
                    if let Ok(parsed) = serde_json::from_str::<HashMap<String, Value>>(&content) {
                        cache = parsed;
                        break;
                    }
                }
            }
        }

        Self {
            inner: Arc::new(RwLock::new(StoreInner {
                cache,
                file_path,
                dirty: false,
            })),
            debounce_running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn get(&self, key: &str) -> Option<Value> {
        let inner = self.inner.read();
        inner.cache.get(key).cloned()
    }

    pub fn set(&self, key: String, value: Value) {
        {
            let mut inner = self.inner.write();
            inner.cache.insert(key, value);
            inner.dirty = true;
        }
        self.schedule_write();
    }

    pub fn delete(&self, key: &str) -> bool {
        let existed = {
            let mut inner = self.inner.write();
            let rem = inner.cache.remove(key).is_some();
            if rem {
                inner.dirty = true;
            }
            rem
        };
        if existed {
            self.schedule_write();
        }
        existed
    }

    pub fn list(&self, prefix: Option<&str>) -> Vec<String> {
        let inner = self.inner.read();
        inner
            .cache
            .keys()
            .filter(|k| match prefix {
                Some(p) => k.starts_with(p),
                None => true,
            })
            .cloned()
            .collect()
    }

    pub fn flush(&self) {
        let mut inner = self.inner.write();
        if !inner.dirty {
            return;
        }
        Self::write_to_disk(&inner);
        inner.dirty = false;
    }

    fn schedule_write(&self) {
        if self.debounce_running.swap(true, Ordering::SeqCst) {
            return;
        }

        let inner_clone = Arc::clone(&self.inner);
        let debounce_clone = Arc::clone(&self.debounce_running);

        thread::spawn(move || {
            thread::sleep(Duration::from_millis(200));
            debounce_clone.store(false, Ordering::SeqCst);

            let mut inner = inner_clone.write();
            if inner.dirty {
                Self::write_to_disk(&inner);
                inner.dirty = false;
            }
        });
    }

    fn write_to_disk(inner: &StoreInner) {
        let file = &inner.file_path;
        let tmp = PathBuf::from(format!("{}.tmp", file.display()));
        let bak = PathBuf::from(format!("{}.bak", file.display()));

        if let Some(parent) = file.parent() {
            let _ = fs::create_dir_all(parent);
        }

        if let Ok(json_str) = serde_json::to_string_pretty(&inner.cache) {
            if fs::write(&tmp, json_str).is_ok() {
                if file.exists() {
                    let _ = fs::copy(file, &bak);
                }
                let _ = fs::rename(&tmp, file);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_store_crud() {
        let dir = std::env::temp_dir().join(format!("trk_store_test_{}", uuid::Uuid::new_v4()));
        let store_file = dir.join("store.json");
        let store = Store::new(store_file.clone());

        assert_eq!(store.get("foo"), None);
        store.set("foo".to_string(), json!({ "bar": 123 }));
        assert_eq!(store.get("foo"), Some(json!({ "bar": 123 })));

        let keys = store.list(Some("f"));
        assert_eq!(keys, vec!["foo"]);

        store.flush();
        assert!(store_file.exists());

        let store2 = Store::new(store_file.clone());
        assert_eq!(store2.get("foo"), Some(json!({ "bar": 123 })));

        assert!(store.delete("foo"));
        assert_eq!(store.get("foo"), None);
        store.flush();

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn test_store_backup_fallback() {
        let dir = std::env::temp_dir().join(format!("trk_store_bak_test_{}", uuid::Uuid::new_v4()));
        let store_file = dir.join("store.json");
        let store = Store::new(store_file.clone());

        store.set("k1".to_string(), json!("v1"));
        store.flush();

        store.set("k2".to_string(), json!("v2"));
        store.flush();

        // Corrupt main store.json
        fs::write(&store_file, b"corrupted json content").unwrap();

        // New store should recover from store.json.bak
        let store_recovered = Store::new(store_file.clone());
        assert!(store_recovered.get("k1").is_some());

        let _ = fs::remove_dir_all(dir);
    }
}

