use parking_lot::{Condvar, Mutex, RwLock};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
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
    pub cache: HashMap<String, Arc<Value>>,
    pub file_path: PathBuf,
    pub dirty: bool,
}

struct WriteSignal {
    pending: Mutex<bool>,
    condvar: Condvar,
}

#[derive(Clone)]
pub struct Store {
    inner: Arc<RwLock<StoreInner>>,
    signal: Arc<WriteSignal>,
    /// Sérialise les écritures disque entre le thread de fond et `flush()` sans
    /// bloquer le `RwLock` mémoire pendant la sérialisation JSON / I/O disque.
    disk_lock: Arc<Mutex<()>>,
}

impl Store {
    pub fn new(file_path: PathBuf) -> Self {
        let mut cache = HashMap::new();
        let candidates = [
            file_path.clone(),
            PathBuf::from(format!("{}.bak", file_path.display())),
        ];

        for candidate in &candidates {
            if candidate.exists() {
                if let Ok(content) = fs::read_to_string(candidate) {
                    if let Ok(parsed) = serde_json::from_str::<HashMap<String, Value>>(&content) {
                        cache = parsed.into_iter().map(|(k, v)| (k, Arc::new(v))).collect();
                        break;
                    }
                }
            }
        }

        let inner = Arc::new(RwLock::new(StoreInner {
            cache,
            file_path,
            dirty: false,
        }));
        let signal = Arc::new(WriteSignal {
            pending: Mutex::new(false),
            condvar: Condvar::new(),
        });
        let disk_lock = Arc::new(Mutex::new(()));

        // Thread unique d'écriture asynchrone avec regroupement (debounce 200ms)
        let inner_bg = Arc::clone(&inner);
        let signal_bg = Arc::clone(&signal);
        let disk_bg = Arc::clone(&disk_lock);
        let _ = thread::Builder::new()
            .name("trk-store-writer".into())
            .spawn(move || loop {
                {
                    let mut pending = signal_bg.pending.lock();
                    while !*pending {
                        signal_bg.condvar.wait(&mut pending);
                    }
                    *pending = false;
                }
                thread::sleep(Duration::from_millis(200));
                Self::flush_inner(&inner_bg, &disk_bg);
            });

        Self {
            inner,
            signal,
            disk_lock,
        }
    }

    pub fn get(&self, key: &str) -> Option<Value> {
        let inner = self.inner.read();
        inner.cache.get(key).map(|v| (**v).clone())
    }

    pub fn set(&self, key: String, value: Value) {
        {
            let mut inner = self.inner.write();
            inner.cache.insert(key, Arc::new(value));
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
        Self::flush_inner(&self.inner, &self.disk_lock);
    }

    fn flush_inner(inner_lock: &RwLock<StoreInner>, disk_lock: &Mutex<()>) {
        // Sérialise les écritures disque tout en relâchant le RwLock immédiatement
        // après le clonage du snapshot : les lectures/écritures IPC ne bloquent jamais.
        let _disk_guard = disk_lock.lock();
        let snapshot = {
            let mut inner = inner_lock.write();
            if !inner.dirty {
                return;
            }
            inner.dirty = false;
            (inner.file_path.clone(), inner.cache.clone())
        };
        Self::write_to_disk(&snapshot.0, &snapshot.1);
    }

    fn schedule_write(&self) {
        let mut pending = self.signal.pending.lock();
        if !*pending {
            *pending = true;
            self.signal.condvar.notify_one();
        }
    }

    fn write_to_disk(file: &Path, cache: &HashMap<String, Arc<Value>>) {
        let tmp = PathBuf::from(format!("{}.tmp", file.display()));
        let bak = PathBuf::from(format!("{}.bak", file.display()));

        if let Some(parent) = file.parent() {
            let _ = fs::create_dir_all(parent);
        }

        // Sérialisation directe en flux vers le fichier temporaire (évite un tampon
        // String intermédiaire de plusieurs Mo et le clonage profond des valeurs).
        let wrote_ok = File::create(&tmp)
            .and_then(|f| {
                let mut writer = BufWriter::new(f);
                serde_json::to_writer(&mut writer, cache)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
                writer.flush()
            })
            .is_ok();

        if wrote_ok {
            if file.exists() {
                let _ = fs::copy(file, &bak);
            }
            let _ = fs::rename(&tmp, file);
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
        let dir =
            std::env::temp_dir().join(format!("trk_store_bak_test_{}", uuid::Uuid::new_v4()));
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
