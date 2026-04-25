use std::fs;
use std::path::PathBuf;
use std::time::Duration;

const UPDATER_URL_TXT: &str = include_str!("../updater_url.txt");

const KSB_ALLOWED_PREFIX: &str = "https://register.ksb.bg/";

fn ensure_ksb_https_url(url: &str) -> Result<(), String> {
    let u = url.trim();
    if !u.starts_with(KSB_ALLOWED_PREFIX) {
        return Err("Позволени са само https заявки към register.ksb.bg.".into());
    }
    Ok(())
}

/// GET/POST към КСБ регистър (HTML), за да няма CORS във фронтенда.
#[tauri::command]
async fn ksb_http_request(method: String, url: String, body: Option<String>) -> Result<String, String> {
    ensure_ksb_https_url(&url)?;
    let m = method.trim().to_uppercase();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = match m.as_str() {
        "GET" => client.get(url),
        "POST" => client
            .post(url)
            .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8"),
        _ => return Err("method трябва да е GET или POST.".into()),
    };
    if let Some(b) = body {
        if !b.is_empty() {
            req = req.body(b);
        }
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.text().await.map_err(|e| e.to_string())
}

/// EUR→USD курс (колко USD за 1 EUR) от Frankfurter — извиква се от десктопа, без CORS.
#[tauri::command]
async fn fetch_frankfurter_eur_usd() -> Result<Option<f64>, String> {
    let url = "https://api.frankfurter.app/latest?from=EUR&to=USD";
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let n = v
        .get("rates")
        .and_then(|r| r.get("USD"))
        .and_then(|x| x.as_f64());
    Ok(n)
}

/// Хеширане на парола за нов служител (Supabase `staff_users.password_hash`).
#[tauri::command]
fn bcrypt_hash_password(password: String) -> Result<String, String> {
    if password.len() < 4 {
        return Err("Паролата трябва да е поне 4 символа.".into());
    }
    bcrypt::hash(password, 10).map_err(|e| e.to_string())
}

/// Проверка на парола срещу bcrypt хеш (вход на служител).
#[tauri::command]
fn bcrypt_verify_password(password: String, hash: String) -> Result<bool, String> {
    bcrypt::verify(&password, &hash).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_screenshot(data: String, path: String) -> Result<(), String> {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
    let bytes = BASE64.decode(&data).map_err(|e| e.to_string())?;
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn save_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(())
}

// --- In-app update (сваля NSIS/инсталатор от `downloadUrl`, пуска го и приключваме процеса) ---

fn read_updater_manifest_url() -> Option<String> {
    for line in UPDATER_URL_TXT.lines() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        if t.starts_with("https://") {
            return Some(t.to_string());
        }
    }
    None
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateManifest {
    version: String,
    download_url: String,
    release_notes: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub download_url: String,
    pub release_notes: Option<String>,
}

fn current_package_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn get_app_version() -> String {
    current_package_version()
}

#[tauri::command]
async fn check_for_updates() -> Result<Option<UpdateInfo>, String> {
    if cfg!(debug_assertions) {
        return Ok(None);
    }
    let Some(manifest_url) = read_updater_manifest_url() else {
        return Ok(None);
    };
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(manifest_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Манифест: HTTP {}", resp.status()));
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let m: UpdateManifest = serde_json::from_str(&text).map_err(|e| format!("JSON манифест: {e}"))?;
    let current_v = semver::Version::parse(env!("CARGO_PKG_VERSION")).map_err(|e| e.to_string())?;
    let latest_v = semver::Version::parse(m.version.trim()).map_err(|e| format!("Версия в манифест: {e}"))?;
    if latest_v > current_v {
        let download = m.download_url.trim();
        if !download.starts_with("https://") {
            return Err("downloadUrl в манифеста трябва да е https://".into());
        }
        return Ok(Some(UpdateInfo {
            current: current_package_version(),
            latest: m.version,
            download_url: download.to_string(),
            release_notes: m.release_notes,
        }));
    }
    Ok(None)
}

#[derive(serde::Deserialize)]
struct DownloadUpdatePayload {
    #[serde(rename = "downloadUrl")]
    download_url: String,
}

fn path_for_batch_quoted(p: &std::path::Path) -> String {
    p.to_string_lossy().replace('\"', "\"\"")
}

/// NSIS: тихо `/S` → ъпгрейд, после `start` на същия .exe. Пуска скрит `cmd` batch и приключва този процес.
#[tauri::command]
async fn apply_automatic_update(_app: tauri::AppHandle, args: DownloadUpdatePayload) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Err("Update в dev режим е изключен.".into());
    }
    if !cfg!(target_os = "windows") {
        return Err("Автоматичното обновяване е за Windows.".into());
    }

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let inst_path = {
        let url = args.download_url.trim();
        if !url.starts_with("https://") {
            return Err("Само https:// за сваляне.".into());
        }
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(600))
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("Сваляне: HTTP {}", resp.status()));
        }
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        let peek = &bytes[..bytes.len().min(8000)];
        if let Ok(s) = std::str::from_utf8(peek) {
            let low = s.to_ascii_lowercase();
            if low.contains("<!doctype") || low.contains("<html") {
                return Err("Сървърът върна HTML, не .exe. Ползвай директен https линк." .into());
            }
        }
        if bytes.len() < 64_000 {
            return Err("Файлът е твърде малък за валиден Windows инсталатор." .into());
        }
        if bytes.get(0..2) != Some(b"MZ") {
            return Err("Файлът не е Windows .exe (няма PE заглавка)." .into());
        }
        let path = std::env::temp_dir().join("klienti_update_installer.exe");
        std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
        path
    };

    let i = path_for_batch_quoted(&inst_path);
    let a = path_for_batch_quoted(&exe);
    let content = format!(
        "@echo off\r\nchcp 65001 >NUL\r\ntimeout /t 2 /nobreak >NUL\r\n\"{}\" /S\r\nif errorlevel 1 exit /b 1\r\nstart \"\" \"{}\"\r\n",
        i, a
    );
    let bat: PathBuf = std::env::temp_dir().join(format!("klienti_update_{}.cmd", std::process::id()));
    std::fs::write(&bat, &content).map_err(|e| e.to_string())?;
    {
        use std::process::Command;
        #[cfg(windows)]
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let comspec = std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string());
        let mut c = Command::new(comspec);
        c.arg("/C").arg("call").arg(&bat);
        #[cfg(windows)]
        c.creation_flags(CREATE_NO_WINDOW);
        c.spawn().map_err(|e| e.to_string())?;
    }
    // Даваме време на invoke да върне Ok, иначе фронтендът мисли за грешка при разкъсване.
    let _ = std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(500));
        std::process::exit(0);
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            ksb_http_request,
            fetch_frankfurter_eur_usd,
            bcrypt_hash_password,
            bcrypt_verify_password,
            save_text_file,
            save_screenshot,
            get_app_version,
            check_for_updates,
            apply_automatic_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
