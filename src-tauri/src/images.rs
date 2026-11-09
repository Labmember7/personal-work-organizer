use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

const MAX_IMAGE_DIMENSION: u32 = 1600;
const JPEG_QUALITY: u8 = 82;

#[derive(Serialize, Deserialize, Debug)]
pub struct ImageSaveResult {
    pub url: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ImagePruneResult {
    pub removed: usize,
}

pub fn save_image(images_dir: &PathBuf, buffer: &[u8]) -> Result<ImageSaveResult, String> {
    let img = image::load_from_memory(buffer).map_err(|e| format!("Image illisible: {}", e))?;
    let (w, h) = (img.width(), img.height());

    let resized = if w > MAX_IMAGE_DIMENSION || h > MAX_IMAGE_DIMENSION {
        img.resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, FilterType::Lanczos3)
    } else {
        img
    };

    let (final_w, final_h) = (resized.width(), resized.height());
    let mut jpeg_bytes = Vec::new();
    let rgb_img = resized.to_rgb8();

    let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_bytes, JPEG_QUALITY);
    encoder
        .encode(
            rgb_img.as_raw(),
            final_w,
            final_h,
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("Encodage JPEG impossible: {}", e))?;

    let file_name = format!("{}.jpg", Uuid::new_v4());
    if !images_dir.exists() {
        let _ = fs::create_dir_all(images_dir);
    }
    let target_path = images_dir.join(&file_name);
    fs::write(&target_path, jpeg_bytes).map_err(|e| format!("Écriture impossible: {}", e))?;

    Ok(ImageSaveResult {
        url: format!("app-image://local/{}", file_name),
        width: final_w,
        height: final_h,
    })
}

pub fn prune_images(images_dir: &PathBuf, used_files: Vec<String>) -> ImagePruneResult {
    let keep: HashSet<String> = used_files.into_iter().collect();
    let re = Regex::new(r"^[\w-]+\.jpg$").unwrap();
    let mut removed = 0;

    if let Ok(entries) = fs::read_dir(images_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if re.is_match(&name) && !keep.contains(&name) {
                        if fs::remove_file(entry.path()).is_ok() {
                            removed += 1;
                        }
                    }
                }
            }
        }
    }

    ImagePruneResult { removed }
}

