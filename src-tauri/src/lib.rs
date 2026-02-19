mod networking;
use networking::NetworkingState;
use tauri::State;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

use std::net::IpAddr;
use std::time::Duration;
use std::sync::Arc;
use futures::future::join_all;

#[tauri::command]
async fn get_server_latency(host: String) -> Result<u64, String> {
    let addr: IpAddr = host.parse().map_err(|e| format!("Invalid IP address: {}", e))?;
    let client = Client::new(&Config::default()).map_err(|e| format!("Failed to create ping client: {}", e))?;
    let mut pinger = client.pinger(addr, PingIdentifier(111)).await;
    pinger.timeout(Duration::from_secs(1));
    
    match pinger.ping(PingSequence(0), &[0; 8]).await {
        Ok((_, duration)) => Ok(duration.as_millis() as u64),
        Err(e) => Err(format!("Ping error: {}", e)),
    }
}

#[tauri::command]
async fn get_multiple_latencies(hosts: Vec<String>) -> Result<Vec<u64>, String> {
    let client = Arc::new(Client::new(&Config::default()).map_err(|e| format!("Ping client error: {}", e))?);
    let mut tasks = Vec::new();

    for (i, host) in hosts.into_iter().enumerate() {
        let client = client.clone();
        tasks.push(tokio::spawn(async move {
            if let Ok(addr) = host.parse::<IpAddr>() {
                let mut pinger = client.pinger(addr, PingIdentifier(200 + i as u16)).await;
                pinger.timeout(Duration::from_secs(1));
                if let Ok((_, duration)) = pinger.ping(PingSequence(0), &[0; 8]).await {
                    return duration.as_millis() as u64;
                }
            }
            0
        }));
    }

    let results = join_all(tasks).await;
    Ok(results.into_iter().map(|r| r.unwrap_or(0)).collect())
}
use surge_ping::{Client, Config, PingIdentifier, PingSequence};

#[tauri::command]
fn apply_no_delay_fix() -> Result<String, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_LOCAL_MACHINE);
    let path = r"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces";

    let interfaces = hkcu
        .open_subkey(path)
        .map_err(|e| format!("Failed to open TCP interfaces key: {}", e))?;

    let mut count = 0;
    for name in interfaces.enum_keys().map(|x| x.unwrap()) {
        if let Ok(iface_key) = interfaces.open_subkey_with_flags(&name, KEY_ALL_ACCESS) {
            // Send ACK immediately (no delayed ACK batching)
            let _: () = iface_key.set_value("TcpAckFrequency", &1u32).unwrap_or(());
            // Disable Nagle's algorithm (no buffering small packets)
            let _: () = iface_key.set_value("TCPNoDelay", &1u32).unwrap_or(());
            count += 1;
        }
    }

    if count > 0 {
        Ok(format!(
            "Successfully optimized {} network interfaces!",
            count
        ))
    } else {
        Err("No network interfaces found to optimize. Try running as Administrator.".into())
    }
}

#[tauri::command]
fn start_optimization<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<NetworkingState>,
) -> Result<String, String> {
    state.start(app).map(|_| "Optimization started".to_string())
}

#[tauri::command]
fn stop_optimization(state: State<NetworkingState>) {
    state.stop();
}

use networking::GameConfig;

// Debug Logger
fn log_debug(msg: &str) {
    use std::fs::OpenOptions;
    use std::io::Write;
    let path = "debug_log.txt";
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[{:?}] {}", std::time::SystemTime::now(), msg);
    }
}

#[tauri::command]
fn set_active_game<R: tauri::Runtime>(config: GameConfig, state: State<NetworkingState>, app: tauri::AppHandle<R>) -> Result<(), String> {
    log_debug(&format!("Command: set_active_game. Game: {}", config.name));
    
    // Also update game server IPs for route quality measurement
    if let Ok(mut ips) = state.game_server_ips.write() {
        *ips = config.server_ips.clone();
    }
    
    let was_running = state.is_running.load(std::sync::atomic::Ordering::SeqCst);
    
    // Stop if running to release WinDivert handle and filter
    if was_running {
        state.stop();
        // Short wait to ensure threads spin down (optional but safer)
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    if let Ok(mut active_game) = state.active_game.write() {
        *active_game = Some(config);
    } else {
        return Err("Failed to acquire write lock for active game".into());
    }

    // Restart if it was running, now with new filter
    if was_running {
         state.start(app).map_err(|e| e.to_string())?;
         log_debug("Optimization Restarted for new game config.");
    }
    
    Ok(())
}


/// Set how many times each UDP game packet is duplicated.
/// 1 = no duplication (passthrough), 2 = send twice, 3 = send three times.
/// Higher values reduce packet loss at the cost of slightly more bandwidth.
#[tauri::command]
fn set_multipath_count(count: usize, state: State<NetworkingState>) {
    let clamped = count.clamp(1, 3);
    state.multipath_count.store(clamped, std::sync::atomic::Ordering::SeqCst);
}

/// Update the game server IPs used for route quality measurement.
/// Called automatically by set_active_game, but can also be called manually.
#[tauri::command]
fn set_game_servers(ips: Vec<String>, state: State<NetworkingState>) -> Result<(), String> {
    if let Ok(mut server_ips) = state.game_server_ips.write() {
        *server_ips = ips;
        Ok(())
    } else {
        Err("Failed to acquire write lock for game server IPs".into())
    }
}


#[tauri::command]
fn create_uac_bypass() -> Result<String, String> {
    use std::process::Command;
    use std::env;

    let exe_path = env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = exe_path.to_str().ok_or("Invalid path")?;
    let user = env::var("USERNAME").unwrap_or_else(|_| "SYSTEM".to_string());

    // PowerShell script to create UAC bypass
    let ps_script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$exePath = "{}"
$taskName = "StartMinusLag"

# 1. Registry RunAsAdmin
$regPath = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers"
if (-not (Test-Path $regPath)) {{ New-Item -Path $regPath -Force | Out-Null }}
Set-ItemProperty -Path $regPath -Name $exePath -Value "~ RUNASADMIN"

# 2. Scheduled Task
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute $exePath
$principal = New-ScheduledTaskPrincipal -UserId "{}" -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings | Out-Null

# 3. Shortcut
$WshShell = New-Object -comObject WScript.Shell
$shortcutPath = "$env:USERPROFILE\Desktop\Launch MINUS LAG.lnk"
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "schtasks.exe"
$Shortcut.Arguments = "/run /tn `"$taskName`""
$Shortcut.IconLocation = "$exePath,0"
$Shortcut.Save()
"#,
        exe_str, user
    );

    let temp_dir = env::temp_dir();
    let script_path = temp_dir.join("minus_lag_bypass.ps1");
    std::fs::write(&script_path, ps_script).map_err(|e| e.to_string())?;

    // Run as standard user (the app is already Admin, so this inherits Admin)
    let output = Command::new("powershell")
        .args(&["-ExecutionPolicy", "Bypass", "-File", script_path.to_str().unwrap()])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok("UAC Bypass configured! Check your Desktop for the new shortcut.".into())
}

pub fn run_lib<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .manage(NetworkingState::new())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .invoke_handler(tauri::generate_handler![
            greet,
            start_optimization,
            stop_optimization,
            get_server_latency,
            get_multiple_latencies,
            set_active_game,
            apply_no_delay_fix,
            set_multipath_count,
            set_game_servers,
            create_uac_bypass,
            networking::run_game_executable,
        ])
}
