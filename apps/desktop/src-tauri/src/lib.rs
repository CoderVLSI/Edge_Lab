use tauri::{Manager, Window, Emitter};
use std::process::Stdio;
use std::io::{BufRead, BufReader};

/// List connected serial ports via native serialport crate
#[tauri::command]
fn list_serial_ports() -> Vec<String> {
    serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.port_name)
        .collect()
}

/// Run an arbitrary shell command (pio, git, etc.), streaming output lines as
/// "shell-line" events. Emits "shell-done" with exit code when finished.
/// Runs on a background thread so it does NOT block the Tauri runtime.
#[tauri::command]
fn run_shell(
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    window: Window,
) -> Result<(), String> {
    let win1 = window.clone();
    let win2 = window.clone();
    let win3 = window.clone();

    std::thread::spawn(move || {
        let mut cmd = std::process::Command::new(&program);
        cmd.args(&args);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        if let Some(ref dir) = cwd {
            cmd.current_dir(dir);
        }

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let _ = win1.emit(
                    "shell-line",
                    format!("Error: failed to start '{}': {}", program, e),
                );
                let _ = win1.emit("shell-done", -1i32);
                return;
            }
        };

        let stdout = child.stdout.take().expect("stdout pipe");
        let stderr = child.stderr.take().expect("stderr pipe");

        // Stream stdout on its own thread
        let t1 = std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().flatten() {
                let _ = win1.emit("shell-line", line);
            }
        });

        // Stream stderr on its own thread
        let t2 = std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().flatten() {
                let _ = win2.emit("shell-line", line);
            }
        });

        t1.join().ok();
        t2.join().ok();

        let code = child
            .wait()
            .map(|s| s.code().unwrap_or(-1))
            .unwrap_or(-1);

        let _ = win3.emit("shell-done", code);
    });

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![list_serial_ports, run_shell])
        .setup(|app| {
            #[cfg(debug_assertions)]
            app.get_webview_window("main").unwrap().open_devtools();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
