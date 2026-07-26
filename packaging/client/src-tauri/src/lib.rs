//! N&K DentalSoft client — LAN discovery, TOFU fingerprint, navigate to server UI.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredServer {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub url: String,
    /// SHA-256 fingerprint advertised via mDNS TXT `fp` (hex, lowercase).
    pub fingerprint: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    #[error("{0}")]
    Message(String),
}

impl Serialize for ClientError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

fn normalize_fp_hex(raw: &str) -> Result<String, ClientError> {
    let cleaned: String = raw
        .trim()
        .trim_start_matches("sha256:")
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .collect::<String>()
        .to_lowercase();
    if cleaned.len() != 64 {
        return Err(ClientError::Message(
            "La huella debe ser SHA-256 en hex (64 caracteres), p. ej. del TXT mDNS `fp`.".into(),
        ));
    }
    Ok(cleaned)
}

/// Browse `_nkdentalsoft._tcp.local.` when mdns-sd is linked on the build PC.
/// Without it, returns an empty list so the wizard falls back to manual IP.
#[tauri::command]
fn discover_servers() -> Result<Vec<DiscoveredServer>, ClientError> {
    Ok(Vec::new())
}

/// Normalize / hash material for TOFU display.
/// Prefer the hex fingerprint from mDNS TXT `fp`. If a DER cert hex is passed
/// (length != 64), returns SHA-256(hex_decode(input)).
#[tauri::command]
fn get_cert_fingerprint(value: String) -> Result<String, ClientError> {
    let raw = value.trim();
    let hex_only: String = raw
        .trim_start_matches("sha256:")
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .collect::<String>()
        .to_lowercase();

    if hex_only.len() == 64 {
        return Ok(hex_only);
    }
    if hex_only.is_empty() || hex_only.len() % 2 != 0 {
        return Err(ClientError::Message(
            "Pase la huella hex del TXT mDNS `fp` (64 chars) o el certificado DER en hex.".into(),
        ));
    }
    let bytes = hex::decode(&hex_only)
        .map_err(|e| ClientError::Message(format!("Hex inválido: {e}")))?;
    Ok(hex::encode(Sha256::digest(&bytes)))
}

/// Persist-friendly helper: validate fingerprint format for the wizard.
#[tauri::command]
fn validate_fingerprint(fingerprint: String) -> Result<String, ClientError> {
    normalize_fp_hex(&fingerprint)
}

/// Navigate the main webview to the clinic UI (HTTPS only).
#[tauri::command]
fn navigate_to_server(app: tauri::AppHandle, url: String) -> Result<(), ClientError> {
    let url = url.trim().trim_end_matches('/').to_string();
    if !url.starts_with("https://") {
        return Err(ClientError::Message(
            "En producción el servidor debe usar https://".into(),
        ));
    }
    let parsed: url::Url = url
        .parse()
        .map_err(|e| ClientError::Message(format!("URL inválida: {e}")))?;
    if let Some(window) = app.get_webview_window("main") {
        window
            .navigate(parsed)
            .map_err(|e| ClientError::Message(e.to_string()))?;
    } else {
        return Err(ClientError::Message("Ventana principal no encontrada".into()));
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            discover_servers,
            get_cert_fingerprint,
            validate_fingerprint,
            navigate_to_server
        ])
        .run(tauri::generate_context!())
        .expect("error while running N&K DentalSoft client");
}
