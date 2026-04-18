use pnet_packet::ip::IpNextHeaderProtocols;
use pnet_packet::udp::UdpPacket;
use pnet_packet::Packet;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::net::IpAddr;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::sync::RwLock;
use std::thread;
use std::time::Duration;
use sysinfo::{PidExt, ProcessExt, System, SystemExt};
use tauri::Emitter;
use windivert::prelude::*;
use surge_ping::{Client, Config, PingIdentifier, PingSequence};

// Debug Logger
fn log_debug(msg: &str) {
    use std::fs::OpenOptions;
    use std::io::Write;
    let path = "debug_log.txt";
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[{:?}] {}", std::time::SystemTime::now(), msg);
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct GameConfig {
    pub id: String,
    pub name: String,
    pub executables: Vec<String>,
    pub tcp_ports: Vec<u16>,
    pub udp_ports: Vec<u16>,
    pub udp_ranges: Vec<(u16, u16)>,
    pub test_ip: String,
    /// Actual game server IPs for route quality measurement
    pub server_ips: Vec<String>,
}

pub struct NetworkingState {
    pub is_running: Arc<AtomicBool>,
    pub auto_detect: Arc<AtomicBool>,
    pub tcp_count: Arc<AtomicUsize>,
    pub udp_count: Arc<AtomicUsize>,
    pub active_game: Arc<RwLock<Option<GameConfig>>>,
    pub detected_pids: Arc<RwLock<HashSet<u32>>>,
    pub dynamic_ports: Arc<RwLock<HashSet<u16>>>,
    /// How many times to send each UDP game packet (1 = no duplication, 2-3 = multipath)
    pub multipath_count: Arc<AtomicUsize>,
    /// Estimated packet loss percentage (0-100), scaled x10 for precision (e.g. 25 = 2.5%)
    pub packet_loss_pct: Arc<AtomicUsize>,
    /// Estimated jitter in milliseconds
    pub jitter_ms: Arc<AtomicUsize>,
    /// Game server IPs to measure route quality against
    pub game_server_ips: Arc<RwLock<Vec<String>>>,
    /// The actual game server IP detected from live traffic
    pub detected_server_ip: Arc<RwLock<Option<String>>>,
}

impl NetworkingState {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            auto_detect: Arc::new(AtomicBool::new(true)),
            tcp_count: Arc::new(AtomicUsize::new(0)),
            udp_count: Arc::new(AtomicUsize::new(0)),
            active_game: Arc::new(RwLock::new(None)),
            detected_pids: Arc::new(RwLock::new(HashSet::new())),
            dynamic_ports: Arc::new(RwLock::new(HashSet::new())),
            multipath_count: Arc::new(AtomicUsize::new(2)),
            packet_loss_pct: Arc::new(AtomicUsize::new(0)),
            jitter_ms: Arc::new(AtomicUsize::new(0)),
            game_server_ips: Arc::new(RwLock::new(Vec::new())),
            detected_server_ip: Arc::new(RwLock::new(None)),
        }
    }

    pub fn start<R: tauri::Runtime>(&self, app: tauri::AppHandle<R>) -> Result<(), String> {
        if self.is_running.load(Ordering::SeqCst) {
            return Err("Optimization already running".into());
        }

        let is_running = self.is_running.clone();
        let auto_detect = self.auto_detect.clone();
        let tcp_count = self.tcp_count.clone();
        let udp_count = self.udp_count.clone();
        let active_game = self.active_game.clone();
        let detected_pids = self.detected_pids.clone();
        let dynamic_ports = self.dynamic_ports.clone();
        let multipath_count = self.multipath_count.clone();
        let packet_loss_pct = self.packet_loss_pct.clone();
        let jitter_ms = self.jitter_ms.clone();
        let game_server_ips = self.game_server_ips.clone();

        is_running.store(true, Ordering::SeqCst);
        tcp_count.store(0, Ordering::SeqCst);
        udp_count.store(0, Ordering::SeqCst);
        packet_loss_pct.store(0, Ordering::SeqCst);
        jitter_ms.store(0, Ordering::SeqCst);
        if let Ok(mut detected_ip) = self.detected_server_ip.write() {
            *detected_ip = None;
        }
        
        log_debug("Optimization started.");

        // ── Thread 1: Process detection + dynamic port scanning ──────────────
        let is_running_proc = is_running.clone();
        let auto_detect_proc = auto_detect.clone();
        let active_game_proc = active_game.clone();
        let detected_pids_proc = detected_pids.clone();
        let dynamic_ports_proc = dynamic_ports.clone();

        thread::spawn(move || {
            let mut sys = System::new_all();
            while is_running_proc.load(Ordering::SeqCst) {
                if auto_detect_proc.load(Ordering::Relaxed) {
                    sys.refresh_processes();

                    let game_execs = if let Ok(game_opt) = active_game_proc.read() {
                        game_opt
                            .as_ref()
                            .map(|g| g.executables.clone())
                            .unwrap_or_default()
                    } else {
                        Vec::new()
                    };

                    let mut new_pids = HashSet::new();
                    
                    // Log candidate processes only when they change or periodically, not every scan.
                    use std::sync::atomic::AtomicU64;
                    static LAST_LOG_TS: AtomicU64 = AtomicU64::new(0);
                    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
                    let last = LAST_LOG_TS.load(Ordering::Relaxed);
                    let should_log = last == 0 || now - last > 60;

                    if should_log {
                        for (pid, process) in sys.processes() {
                            let name = process.name().to_lowercase();
                            if name.contains("valorant") || name.contains("riot") || name.contains("cs2") {
                                log_debug(&format!("Found Candidate Process: {} (PID: {})", process.name(), pid));
                            }
                        }
                        LAST_LOG_TS.store(now, Ordering::Relaxed);
                    }

                    for (pid, process) in sys.processes() {
                        let proc_name = process.name().to_lowercase();
                        if game_execs.iter().any(|e| proc_name == e.to_lowercase()) {
                            new_pids.insert(pid.as_u32());
                        }
                    }

                    if let Ok(mut pids_lock) = detected_pids_proc.write() {
                        *pids_lock = new_pids.clone();
                    }
                    
                    if !new_pids.is_empty() {
                         // Removed frequent PID log
                    }

                    // Windows IP Helper: scan ports of detected PIDs
                    let mut current_dynamic_ports = HashSet::new();
                    if !new_pids.is_empty() {
                        use windows_sys::Win32::NetworkManagement::IpHelper::{
                            GetExtendedTcpTable, GetExtendedUdpTable, TCP_TABLE_OWNER_PID_ALL,
                        };
                        use windows_sys::Win32::Networking::WinSock::AF_INET;

                        const UDP_TABLE_OWNER_PID: i32 = 1;

                        unsafe {
                            // TCP Table
                            let mut dw_size = 0;
                            GetExtendedTcpTable(
                                std::ptr::null_mut(),
                                &mut dw_size,
                                0,
                                AF_INET as u32,
                                TCP_TABLE_OWNER_PID_ALL as i32,
                                0,
                            );
                            let mut buffer = vec![0u8; dw_size as usize];
                            if GetExtendedTcpTable(
                                buffer.as_mut_ptr() as *mut _,
                                &mut dw_size,
                                0,
                                AF_INET as u32,
                                TCP_TABLE_OWNER_PID_ALL,
                                0,
                            ) == 0
                            {
                                let num_entries = *(buffer.as_ptr() as *const u32);
                                let entries_ptr = buffer.as_ptr().add(4) as *const u8;
                                for i in 0..num_entries {
                                    let row_ptr = entries_ptr.add(i as usize * 24);
                                    let local_port_raw = *(row_ptr.add(8) as *const u32);
                                    let owning_pid = *(row_ptr.add(20) as *const u32);
                                    if new_pids.contains(&owning_pid) {
                                        let port = u16::from_be(local_port_raw as u16);
                                        current_dynamic_ports.insert(port);
                                    }
                                }
                            }

                            // UDP Table
                            dw_size = 0;
                            GetExtendedUdpTable(
                                std::ptr::null_mut(),
                                &mut dw_size,
                                0,
                                AF_INET as u32,
                                UDP_TABLE_OWNER_PID as i32,
                                0,
                            );
                            let mut buffer_udp = vec![0u8; dw_size as usize];
                            if GetExtendedUdpTable(
                                buffer_udp.as_mut_ptr() as *mut _,
                                &mut dw_size,
                                0,
                                AF_INET as u32,
                                UDP_TABLE_OWNER_PID as i32,
                                0,
                            ) == 0
                            {
                                let num_entries = *(buffer_udp.as_ptr() as *const u32);
                                let entries_ptr = buffer_udp.as_ptr().add(4) as *const u8;
                                for i in 0..num_entries {
                                    let row_ptr = entries_ptr.add(i as usize * 12);
                                    let local_port_raw = *(row_ptr.add(4) as *const u32);
                                    let owning_pid = *(row_ptr.add(8) as *const u32);
                                    if new_pids.contains(&owning_pid) {
                                        let port = u16::from_be(local_port_raw as u16);
                                        current_dynamic_ports.insert(port);
                                    }
                                }
                            }
                        }
                    }

                    if let Ok(mut ports_lock) = dynamic_ports_proc.write() {
                        *ports_lock = current_dynamic_ports;
                    }
                }
                thread::sleep(Duration::from_secs(3));
            }
        });

        // ── Thread 2: Route quality measurement (ping + jitter + loss) ────────
        // Pings game server IPs every 2s, tracks last 20 samples to compute
        // jitter (max-min) and packet loss %. This is what ExitLag calls
        // "route quality" — we measure it so the user can see real numbers.
        let is_running_rq = is_running.clone();
        let packet_loss_pct_rq = packet_loss_pct.clone();
        let jitter_ms_rq = jitter_ms.clone();
        let game_server_ips_rq = game_server_ips.clone();
        let detected_server_ip_rq = self.detected_server_ip.clone();

        thread::spawn(move || {
            // Create a single-threaded Tokio runtime for async pinging
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();

            rt.block_on(async {
                // Ring buffer of the last 20 RTT samples (u64 ms, u64::MAX = loss)
                const WINDOW: usize = 20;
                let mut samples: Vec<Option<u64>> = Vec::with_capacity(WINDOW);
                let mut seq = 0u16;
                
                // Create ICMP client (requires Admin, which we have)
                let client = match Client::new(&Config::default()) {
                    Ok(c) => c,
                    Err(e) => {
                        eprintln!("Failed to create ICMP client: {}", e);
                        return; // Exit thread if we can't create client
                    }
                };

                while is_running_rq.load(Ordering::SeqCst) {
                    // Priority 1: Detected live server IP
                    // Priority 2: Configured test IP (first valid one)
                    let target_ip: Option<IpAddr> = {
                        let detected = detected_server_ip_rq.read().ok();
                        let detected_addr = detected.as_ref().and_then(|d| d.as_ref().and_then(|s| s.parse::<IpAddr>().ok()));
                        
                        if detected_addr.is_some() {
                            detected_addr
                        } else {
                            let ips = game_server_ips_rq.read().ok();
                            ips.and_then(|list| list.iter().find_map(|s| s.parse::<IpAddr>().ok()))
                        }
                    };
                    
                    // Target IP logging removed for resource optimization

                    let rtt: Option<u64> = if let Some(addr) = target_ip {
                        seq = seq.wrapping_add(1);
                        ping_once_async(&client, addr, 999, seq).await
                    } else {
                        // No game selected or no IP -> treat as no data (not loss)
                        None 
                    };

                    // If we have no target, don't record loss. Just wait.
                    if target_ip.is_none() {
                         thread::sleep(Duration::from_secs(1));
                         continue;
                    }

                    // Maintain rolling window
                    if samples.len() >= WINDOW {
                        samples.remove(0);
                    }
                    samples.push(rtt);

                    if samples.len() >= 4 {
                        // Packet loss = fraction of None samples
                        let lost = samples.iter().filter(|s| s.is_none()).count();
                        let loss_pct = (lost * 100) / samples.len();
                        packet_loss_pct_rq.store(loss_pct, Ordering::Relaxed);

                        // Jitter = max RTT - min RTT among successful pings
                        let rtts: Vec<u64> = samples.iter().filter_map(|s| *s).collect();
                        if rtts.len() >= 2 {
                            let min_rtt = *rtts.iter().min().unwrap();
                            let max_rtt = *rtts.iter().max().unwrap();
                            jitter_ms_rq.store((max_rtt - min_rtt) as usize, Ordering::Relaxed);
                        }
                    }

                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
            });
        });

        // ── Thread 3: Stats emission ──────────────────────────────────────────
        let is_running_stats = is_running.clone();
        let tcp_count_stats = tcp_count.clone();
        let udp_count_stats = udp_count.clone();
        let app_stats = app.clone();
        let detected_pids_stats = detected_pids.clone();
        let packet_loss_pct_stats = packet_loss_pct.clone();
        let jitter_ms_stats = jitter_ms.clone();
        let multipath_count_stats = multipath_count.clone();
        let detected_server_ip_stats = self.detected_server_ip.clone();

        thread::spawn(move || {
            while is_running_stats.load(Ordering::SeqCst) {
                let is_game_active = if let Ok(pids) = detected_pids_stats.read() {
                    !pids.is_empty()
                } else {
                    false
                };

                let stats = {
                    let detected_ip = detected_server_ip_stats.read().ok().and_then(|d| d.clone());
                    serde_json::json!({
                        "tcp_packets": tcp_count_stats.load(Ordering::Relaxed),
                        "udp_packets": udp_count_stats.load(Ordering::Relaxed),
                        "is_game_detected": is_game_active,
                        "packet_loss_pct": packet_loss_pct_stats.load(Ordering::Relaxed),
                        "jitter_ms": jitter_ms_stats.load(Ordering::Relaxed),
                        "multipath_count": multipath_count_stats.load(Ordering::Relaxed),
                        "detected_server_ip": detected_ip,
                    })
                };
                let _ = app_stats.emit("network-stats", stats);
                thread::sleep(Duration::from_secs(1));
            }
        });

        // ── Build precise WinDivert filter from game config ───────────────────
        // Only game-port packets are intercepted. All other traffic (browser,
        // WARP, Discord, Windows Update) passes through the kernel untouched.
        let filter_string = {
            let game_opt = active_game.read().ok();
            let game_ref = game_opt.as_ref().and_then(|g| g.as_ref());

            // Known VPN/tunnel ports — always exclude to avoid breaking WARP etc.
            let vpn_exclusion =
                "dst.Port != 2408 and dst.Port != 51820 and dst.Port != 500 and dst.Port != 4500";

            if let Some(game) = game_ref {
                let mut port_clauses: Vec<String> = Vec::new();

                for (start, end) in &game.udp_ranges {
                    port_clauses.push(format!(
                        "(udp and dst.Port >= {} and dst.Port <= {})",
                        start, end
                    ));
                }
                for port in &game.udp_ports {
                    port_clauses.push(format!("(udp and dst.Port == {})", port));
                }
                // TCP: Only intercept specific game ports (keep specific to avoid web overhead)
                for port in &game.tcp_ports {
                    port_clauses.push(format!("(tcp and dst.Port == {})", port));
                }
                
                // ALSO: Capture traffic from detected PIDs (Dynamic Source Ports) if any
                // This requires a separate clause or we assume PIDs use matched destination ports?
                // Actually, Windows Firewall / WinDivert filter usually targets DST ports for outbound.
                // Dynamic PID capture is hard to filter in kernel without valid ports.
                // So we rely on the specific ports. PID detection helps IDENTIFY packets in user-space.

                if port_clauses.is_empty() {
                    format!("outbound and (tcp or udp) and {}", vpn_exclusion)
                } else {
                    let ports_combined = port_clauses.join(" or ");
                     format!("outbound and ({}) and {}", ports_combined, vpn_exclusion)
                }
            } else {
                format!("outbound and (tcp or udp) and {}", vpn_exclusion)
            }
        };

        let detected_server_ip_divert = self.detected_server_ip.clone();
        // ── Thread 4: WinDivert packet loop (high priority) ──────────────────
        thread::spawn(move || {
            // Elevate this thread to highest priority — minimises processing jitter
            #[cfg(windows)]
            unsafe {
                let handle = windows_sys::Win32::System::Threading::GetCurrentThread();
                windows_sys::Win32::System::Threading::SetThreadPriority(
                    handle,
                    windows_sys::Win32::System::Threading::THREAD_PRIORITY_HIGHEST,
                );
            }

            let divert: WinDivert<NetworkLayer> =
                match WinDivert::network(&filter_string, 0, WinDivertFlags::default()) {
                    Ok(d) => d,
                    Err(e) => {
                        eprintln!("Failed to open WinDivert: {}", e);
                        is_running.store(false, Ordering::SeqCst);
                        return;
                    }
                };

            let mut buffer = [0u8; 65535];
            while is_running.load(Ordering::SeqCst) {
                match divert.recv(&mut buffer) {
                    Ok(packet) => {
                        let mut is_game_traffic = false;
                        let mut is_udp = false;

                        if let Some(ipv4) = pnet_packet::ipv4::Ipv4Packet::new(packet.data.as_ref()) {
                            match ipv4.get_next_level_protocol() {
                                IpNextHeaderProtocols::Tcp => {
                                    // TCP is already filtered by static rules (port specific), so it is game traffic.
                                    // Use static filter for TCP to avoid analyzing web traffic overhead.
                                    tcp_count.fetch_add(1, Ordering::Relaxed);
                                    if let Err(e) = divert.send(&packet) {
                                        eprintln!("Failed to re-inject TCP packet: {}", e);
                                    }
                                    continue; // Done with TCP
                                }
                                IpNextHeaderProtocols::Udp => {
                                    is_udp = true;
                                    // Check if this UDP packet is game traffic (Static or Dynamic)
                                    if let Some(udp) = UdpPacket::new(ipv4.payload()) {
                                        let src_port = udp.get_source();
                                        let dst_port = udp.get_destination();

                                        // 1. Check Dynamic Ports (Match Source Port = Local Process)
                                        if let Ok(ports) = dynamic_ports.read() {
                                            if ports.contains(&src_port) {
                                                is_game_traffic = true;
                                            }
                                        }

                                        // 2. Fallback: Static Config
                                        if !is_game_traffic {
                                            if let Ok(g_opt) = active_game.read() {
                                                if let Some(g) = g_opt.as_ref() {
                                                     // Update: use proper port check including ranges
                                                     let in_range = g.udp_ports.contains(&dst_port) || 
                                                                    g.udp_ranges.iter().any(|(s, e)| dst_port >= *s && dst_port <= *e);

                                                     if in_range {
                                                         is_game_traffic = true;
                                                     }
                                                }
                                            }
                                        }

                                        if is_game_traffic {
                                            // Update detected server IP
                                            if let Ok(mut detected) = detected_server_ip_divert.write() {
                                                let dst_ip = ipv4.get_destination().to_string();
                                                if detected.as_ref() != Some(&dst_ip) {
                                                    *detected = Some(dst_ip);
                                                }
                                            }
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }

                        if is_udp {
                            if is_game_traffic {
                                udp_count.fetch_add(1, Ordering::Relaxed);
                                // ── UDP MULTIPATH DUPLICATION ──────────────────────
                                let copies = multipath_count.load(Ordering::Relaxed).max(1);
                                for _ in 0..copies {
                                    if let Err(e) = divert.send(&packet) {
                                        eprintln!("Failed to send UDP copy: {}", e);
                                        break;
                                    }
                                }
                            } else {
                                // Passthrough for non-game UDP (Discord, etc.)
                                let _ = divert.send(&packet);
                            }
                        } else if !is_udp {
                             // Non-IP or other protocol (shouldn't happen with our filter, but just in case)
                             let _ = divert.send(&packet);
                        }
                    }
                    Err(e) => {
                        eprintln!("WinDivert recv error: {}", e);
                        break;
                    }
                }
            }
            is_running.store(false, Ordering::SeqCst);
        });

        Ok(())
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
        // Reset quality stats on stop
        self.packet_loss_pct.store(0, Ordering::SeqCst);
        self.jitter_ms.store(0, Ordering::SeqCst);
    }
}

/// Async ICMP ping to `addr` with a 1-second timeout.
async fn ping_once_async(client: &Client, addr: IpAddr, id: u16, seq: u16) -> Option<u64> {
    let mut pinger = client.pinger(addr, PingIdentifier(id)).await;
    pinger.timeout(Duration::from_secs(1));
    match pinger.ping(PingSequence(seq), &[0; 8]).await {
        Ok((_, duration)) => {
            Some(duration.as_millis() as u64)
        },
        Err(_) => {
            None
        },
    }
}

#[tauri::command]
pub fn run_game_executable(path: String, args: Vec<String>) -> Result<String, String> {
    use std::process::Command;
    log_debug(&format!("Launching game: {} with args: {:?}", path, args));
    
    let result = if cfg!(windows) {
        Command::new("cmd")
            .arg("/C")
            .arg("start")
            .arg("")
            .arg(&path)
            .args(&args)
            .spawn()
    } else {
        Command::new(&path)
            .args(&args)
            .spawn()
    };

    match result {
        Ok(_) => Ok(format!("Launched: {} with {} args", path, args.len())),
        Err(e) => Err(format!("Failed to launch {}: {}", path, e)),
    }
}

