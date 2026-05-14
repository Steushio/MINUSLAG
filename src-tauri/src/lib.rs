pub mod networking;
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

#[tauri::command]
async fn optimize_system(services_to_stop: Vec<String>, state: State<'_, NetworkingState>) -> Result<String, String> {
    if let Ok(mut stopped) = state.stopped_services.write() {
        *stopped = services_to_stop.clone();
    }

    use std::process::Command;
    use std::os::windows::process::CommandExt;
    
    // Set Timer Resolution to 0.5ms (5000 units of 100-ns)
    unsafe {
        let ntdll = windows_sys::Win32::System::LibraryLoader::GetModuleHandleA("ntdll.dll\0".as_ptr());
        if ntdll != 0 {
            let func_name = "NtSetTimerResolution\0";
            let addr = windows_sys::Win32::System::LibraryLoader::GetProcAddress(ntdll, func_name.as_ptr());
            if let Some(func) = addr {
                let nt_set_timer_resolution: extern "system" fn(u32, i8, *mut u32) -> i32 = std::mem::transmute(func);
                let mut current_res = 0;
                nt_set_timer_resolution(5000, 1, &mut current_res);
            }
        }
    }

    let services_array = services_to_stop.iter().map(|s| format!("\"{}\"", s)).collect::<Vec<_>>().join(", ");
    let ps_script = format!(r#"
$ErrorActionPreference = 'SilentlyContinue'

$stopped = 0
$services = @({})
if ($services.Count -gt 0) {{
    $to_stop = Get-Service -Name $services -ErrorAction SilentlyContinue | Where-Object {{ $_.Status -eq 'Running' }}
    if ($to_stop) {{
        $to_stop | Set-Service -StartupType Manual
        $to_stop | Stop-Service -Force
        $stopped = $to_stop.Count
    }}
}}
"#, services_array);

    let ps_script_part2 = r#"
$code = @"
using System;
using System.Runtime.InteropServices;

public class Ram {
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetSystemFileCacheSize(IntPtr MinimumFileCacheSize, IntPtr MaximumFileCacheSize, int Flags);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern bool LookupPrivilegeValue(string lpSystemName, string lpName, out LUID lpLuid);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool AdjustTokenPrivileges(IntPtr TokenHandle, bool DisableAllPrivileges, ref TOKEN_PRIVILEGES NewState, uint BufferLength, IntPtr PreviousState, IntPtr ReturnLength);

    [DllImport("ntdll.dll")]
    static extern uint NtSetSystemInformation(int SystemInformationClass, IntPtr SystemInformation, int SystemInformationLength);

    [StructLayout(LayoutKind.Sequential)]
    struct LUID {
        public uint LowPart;
        public int HighPart;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct TOKEN_PRIVILEGES {
        public uint PrivilegeCount;
        public LUID Luid;
        public uint Attributes;
    }

    public static void Clear() {
        // 1. Flush System File Cache
        try { SetSystemFileCacheSize(new IntPtr(-1), new IntPtr(-1), 0); } catch {}

        // 2. Clear Standby List (requires SeProfileSingleProcessPrivilege)
        try {
            IntPtr tokenHandle;
            if (OpenProcessToken(System.Diagnostics.Process.GetCurrentProcess().Handle, 0x0020 | 0x0008, out tokenHandle)) {
                LUID luid;
                if (LookupPrivilegeValue(null, "SeProfileSingleProcessPrivilege", out luid)) {
                    TOKEN_PRIVILEGES tp = new TOKEN_PRIVILEGES();
                    tp.PrivilegeCount = 1;
                    tp.Luid = luid;
                    tp.Attributes = 2; // SE_PRIVILEGE_ENABLED
                    AdjustTokenPrivileges(tokenHandle, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);

                    IntPtr ptr = Marshal.AllocHGlobal(4);
                    // SystemMemoryListCommand: 4 = EmptyStandbyList
                    Marshal.WriteInt32(ptr, 4);
                    NtSetSystemInformation(80, ptr, 4);
                    Marshal.FreeHGlobal(ptr);
                }
            }
        } catch {}
    }
}
"@
Add-Type -TypeDefinition $code
try {
    $before = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
    [Ram]::Clear()
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
    $after = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
    $cleared_kb = $after - $before
    if ($cleared_kb -lt 0) { $cleared_kb = 0 }
    $ram_cleared = [Math]::Round($cleared_kb / 1024 / 1024, 2)
} catch { $ram_cleared = 0 }

$result = @{
    services_optimized = $stopped
    ram_cleared_gb = $ram_cleared
    timer_resolution = 0.5
}
$result | ConvertTo-Json -Compress
"#;
    let ps_script = format!("{}\n{}", ps_script, ps_script_part2);

    let output = tokio::task::spawn_blocking(move || {
        Command::new("powershell")
            .args(&["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    let out_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if out_str.is_empty() || !out_str.starts_with('{') {
        Ok(r#"{"services_optimized":0,"processes_cleared":0,"timer_resolution":0.5}"#.to_string())
    } else {
        Ok(out_str)
    }
}

#[tauri::command]
async fn revert_system(state: State<'_, NetworkingState>) -> Result<String, String> {
    revert_system_internal(state.inner()).await
}

pub async fn revert_system_internal(state: &NetworkingState) -> Result<String, String> {
    use std::process::Command;
    use std::os::windows::process::CommandExt;

    let services_to_start = if let Ok(stopped) = state.stopped_services.read() {
        stopped.clone()
    } else {
        Vec::new()
    };

    // Revert Timer Resolution
    unsafe {
        let ntdll = windows_sys::Win32::System::LibraryLoader::GetModuleHandleA("ntdll.dll\0".as_ptr());
        if ntdll != 0 {
            let func_name = "NtSetTimerResolution\0";
            let addr = windows_sys::Win32::System::LibraryLoader::GetProcAddress(ntdll, func_name.as_ptr());
            if let Some(func) = addr {
                let nt_set_timer_resolution: extern "system" fn(u32, i8, *mut u32) -> i32 = std::mem::transmute(func);
                let mut current_res = 0;
                // SetResolution = 0 means revert to default
                nt_set_timer_resolution(5000, 0, &mut current_res);
            }
        }
    }

    if services_to_start.is_empty() {
        return Ok("No services to revert".to_string());
    }

    let services_array = services_to_start.iter().map(|s| format!("\"{}\"", s)).collect::<Vec<_>>().join(", ");
    let ps_script = format!(r#"
$ErrorActionPreference = 'SilentlyContinue'
$services = @({})
$reverted = 0
if ($services.Count -gt 0) {{
    $to_start = Get-Service -Name $services -ErrorAction SilentlyContinue | Where-Object {{ $_.Status -ne 'Running' }}
    if ($to_start) {{
        foreach ($svc in $to_start) {{
            try {{
                $svc | Set-Service -StartupType Automatic -ErrorAction SilentlyContinue
                $svc | Start-Service -ErrorAction SilentlyContinue
                $reverted++
                Start-Sleep -Milliseconds 50
            }} catch {{}}
        }}
    }}
}}
Write-Output $reverted
"#, services_array);

    let _output = tokio::task::spawn_blocking(move || {
        Command::new("powershell")
            .args(&["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
            .creation_flags(0x08000000)
            .output()
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    Ok("Reverted services".to_string())
}

pub fn spawn_detached_revert(state: &NetworkingState) -> Result<(), String> {
    use std::process::Command;
    use std::os::windows::process::CommandExt;

    let services_to_start = if let Ok(stopped) = state.stopped_services.read() {
        stopped.clone()
    } else {
        Vec::new()
    };

    // Revert Timer Resolution (sync is fine here, it's instant)
    unsafe {
        let ntdll = windows_sys::Win32::System::LibraryLoader::GetModuleHandleA("ntdll.dll\0".as_ptr());
        if ntdll != 0 {
            let func_name = "NtSetTimerResolution\0";
            let addr = windows_sys::Win32::System::LibraryLoader::GetProcAddress(ntdll, func_name.as_ptr());
            if let Some(func) = addr {
                let nt_set_timer_resolution: extern "system" fn(u32, i8, *mut u32) -> i32 = std::mem::transmute(func);
                let mut current_res = 0;
                nt_set_timer_resolution(5000, 0, &mut current_res);
            }
        }
    }

    if services_to_start.is_empty() {
        return Ok(());
    }

    let services_array = services_to_start.iter().map(|s| format!("\"{}\"", s)).collect::<Vec<_>>().join(", ");
    let ps_script = format!(r#"
$ErrorActionPreference = 'SilentlyContinue'
$services = @({})
if ($services.Count -gt 0) {{
    $to_start = Get-Service -Name $services -ErrorAction SilentlyContinue | Where-Object {{ $_.Status -ne 'Running' }}
    if ($to_start) {{
        foreach ($svc in $to_start) {{
            try {{
                $svc | Set-Service -StartupType Automatic -ErrorAction SilentlyContinue
                $svc | Start-Service -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 10
            }} catch {{}}
        }}
    }}
}}
"#, services_array);

    // Spawn as a completely detached process so it lives after we die
    Command::new("powershell")
        .args(&["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
        .creation_flags(0x08000000 | 0x00000008) // CREATE_NO_WINDOW | DETACHED_PROCESS
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn run_lib<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .manage(NetworkingState::new())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .invoke_handler(tauri::generate_handler![
            greet,
            start_optimization,
            stop_optimization,
            get_server_latency,
            get_multiple_latencies,
            set_active_game,
            set_multipath_count,
            set_game_servers,
            create_uac_bypass,
            optimize_system,
            revert_system,
            networking::run_game_executable,
        ])
}
