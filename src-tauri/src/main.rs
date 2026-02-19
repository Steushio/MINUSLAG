// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

fn main() {
    // ── AUTOMATIC FIX: Ensure WinDivert driver files are in the current directory ──
    // The installer sometimes bundles them into a 'resources' subdirectory.
    // We check and move them up if needed so the driver loads correctly.
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let files = ["WinDivert.dll", "WinDivert64.sys"];
            let resource_dir = exe_dir.join("resources");

            for file in &files {
                let target_path = exe_dir.join(file);
                if !target_path.exists() {
                    let source_path = resource_dir.join(file);
                    if source_path.exists() {
                        let _ = std::fs::copy(&source_path, &target_path);
                    }
                }
            }
        }
    }

    let builder = tauri::Builder::default();
    let builder = tauri_app_lib::run_lib(builder);

    builder
        .setup(|app| {
            // Check for --minimized argument
            let args: Vec<String> = std::env::args().collect();
            if args.contains(&"--minimized".to_string()) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            // Resolve the resources path and set it as a DLL search directory
            use tauri::path::BaseDirectory;
            if let Ok(resource_path) = app.path().resolve("resources", BaseDirectory::Resource) {
                #[cfg(windows)]
                {
                    use std::os::windows::ffi::OsStrExt;
                    let path_wide: Vec<u16> = resource_path
                        .as_os_str()
                        .encode_wide()
                        .chain(Some(0))
                        .collect();
                    unsafe {
                        windows_sys::Win32::System::LibraryLoader::SetDllDirectoryW(
                            path_wide.as_ptr(),
                        );
                    }
                    println!("Set DLL directory to: {:?}", resource_path);
                }
            }

            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .on_menu_event(
                    move |app: &tauri::AppHandle, event| match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    },
                )
                .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event| {
                    let _ = tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.center();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                window.hide().unwrap();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
