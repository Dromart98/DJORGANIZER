/// Starts the desktop shell.
///
/// Native file-system commands are intentionally absent from this foundation.
/// The production web origin receives no Tauri IPC capability.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run DJOrganizer desktop");
}
