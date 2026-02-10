// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

/// Suspend/sleep the system. Cross-platform support for macOS, Windows, and Linux.
#[tauri::command]
fn suspend_system() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("pmset")
            .args(["sleepnow"])
            .output()
            .map_err(|e| format!("Failed to suspend: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32.exe")
            .args(["powrprof.dll,SetSuspendState", "0", "1", "0"])
            .output()
            .map_err(|e| format!("Failed to suspend: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("systemctl")
            .args(["suspend"])
            .output()
            .map_err(|e| format!("Failed to suspend: {}", e))?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![suspend_system])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
