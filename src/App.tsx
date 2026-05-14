import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open as openDialog, ask, message } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import "./index.css";

interface OptimizationResult {
  ram_cleared_gb: number;
  timer_resolution: number;
}

interface NetworkStats {
  tcp_packets: number;
  udp_packets: number;
  is_game_detected: boolean;
  packet_loss_pct: number;
  jitter_ms: number;
  multipath_count: number;
  detected_server_ip?: string | null;
  current_ping: number;
}

function App() {
  const [ping, setPing] = useState(0);
  const [regionPings, setRegionPings] = useState({ na: 0, eu: 0, singapore: 0, india: 0, japan: 0, brazil: 0 });
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [autoDetect, setAutoDetect] = useState(true);
  const [autoStartup, setAutoStartup] = useState(false);
  const [isGameDetected, setIsGameDetected] = useState(false);
  const [autoMinimize, setAutoMinimize] = useState(() => {
    const saved = localStorage.getItem('autoMinimize');
    return saved !== 'false';
  });
  const [stats, setStats] = useState<NetworkStats>({
    tcp_packets: 0, udp_packets: 0, is_game_detected: false,
    packet_loss_pct: 0, jitter_ms: 0, multipath_count: 1, current_ping: 0
  });
  const [optResult, setOptResult] = useState<OptimizationResult | null>(null);

  const [customPaths, setCustomPaths] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('customGamePaths');
    return saved ? JSON.parse(saved) : {};
  });

  const [manualModeGames, setManualModeGames] = useState<string[]>(() => {
    const saved = localStorage.getItem('manualModeGames');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('customGamePaths', JSON.stringify(customPaths));
  }, [customPaths]);

  useEffect(() => {
    localStorage.setItem('manualModeGames', JSON.stringify(manualModeGames));
  }, [manualModeGames]);

  const [showDonationPopup, setShowDonationPopup] = useState(false);
  const DONATION_LINK = "https://steushio.github.io/steushio-stream-support/";

  useEffect(() => {
    const firstOpen = localStorage.getItem('firstOpenTimestamp');
    const hasShown = localStorage.getItem('hasShownDonationPopup');

    if (!firstOpen) {
      localStorage.setItem('firstOpenTimestamp', Date.now().toString());
    } else if (!hasShown) {
      const firstOpenTime = parseInt(firstOpen, 10);
      const now = Date.now();
      const oneDayInMs = 24 * 60 * 60 * 1000;

      // If at least 24 hours have passed since first open
      if (now - firstOpenTime >= oneDayInMs) {
        setShowDonationPopup(true);
      }
    }
  }, []);

  const handleDonate = () => {
    localStorage.setItem('hasShownDonationPopup', 'true');
    setShowDonationPopup(false);
    openUrl(DONATION_LINK).catch(() => window.open(DONATION_LINK, '_blank'));
  };

  const closeDonationPopup = () => {
    localStorage.setItem('hasShownDonationPopup', 'true');
    setShowDonationPopup(false);
  };

  const GAMES = [
    {
      id: 'valorant', name: 'Valorant', icon: 'V', color: '#fa4454',
      ports: '7000-8000 (Dynamic)',
      executables: ['valorant.exe', 'valorant-win64-shipping.exe', 'riotclientservices.exe'],
      tcp_ports: [2099, 5222, 5223],
      udp_ports: [7000, 7100, 7200, 7300, 7400, 7500, 7600, 7700, 7800, 7900], 
      udp_ranges: [[7000, 8000]], 
      test_ip: '103.28.54.1',
      executable_path: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
      launch_args: '--launch-product=valorant --launch-patchline=live',
      manual_mode_type: 'folder',
      launcher_rel_path: 'Riot Client\\RiotClientServices.exe',
      server_ips: ['103.28.54.1', '103.28.54.162'],
      filter: ''
    },
    {
      id: 'fortnite', name: 'Fortnite', icon: 'F', color: '#fdea11',
      ports: '9000-9100 (UDP)',
      executables: ['fortniteclient-win64-shipping.exe', 'fortnitelauncher.exe', 'epicgameslauncher.exe'],
      tcp_ports: [80, 443, 5222],
      udp_ports: [9000, 9100],
      udp_ranges: [[9000, 9100]],
      test_ip: '1.1.1.1',
      executable_path: 'C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe',
      launch_args: '',
      manual_mode_type: 'folder',
      launcher_rel_path: 'Epic Games\\Launcher\\Portal\\Binaries\\Win32\\EpicGamesLauncher.exe',
      server_ips: ['52.5.1.1'],
      filter: ''
    },
    {
      id: 'cs2', name: 'CS2', icon: 'C', color: '#de9b35',
      ports: '27000-27100 (UDP)',
      executables: ['cs2.exe', 'steam.exe'],
      tcp_ports: [27015, 27030],
      udp_ports: [27000, 27100, 27015, 27020],
      udp_ranges: [[27000, 27100]],
      test_ip: '1.1.1.1',
      executable_path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe',
      launch_args: '-game csgo',
      manual_mode_type: 'folder',
      launcher_rel_path: 'Steam\\steam.exe',
      server_ips: ['155.133.248.1'],
      filter: ''
    },
    {
      id: 'warzone', name: 'Warzone', icon: 'W', color: '#2ecc71',
      ports: '3000-3100 (UDP)',
      executables: ['cod.exe', 'battlenet.exe'],
      tcp_ports: [1119, 3724],
      udp_ports: [3000, 3100, 3074],
      udp_ranges: [[3000, 3100]],
      test_ip: '8.8.8.8',
      executable_path: 'C:\\Program Files (x86)\\Call of Duty\\_retail_\\cod.exe',
      launch_args: '',
      manual_mode_type: 'file',
      server_ips: ['185.34.106.1'],
      filter: ''
    },
    {
      id: 'apex', name: 'Apex', icon: 'A', color: '#e74c3c',
      ports: '37000-38000 (UDP)',
      executables: ['r5apex.exe', 'origin.exe', 'ea.exe'],
      tcp_ports: [80, 443, 9988, 10000, 17502, 42127],
      udp_ports: [37000, 38000],
      udp_ranges: [[37000, 38000]],
      test_ip: '8.8.8.8',
      executable_path: 'C:\\Program Files\\EA Games\\Apex\\r5apex.exe',
      launch_args: '',
      manual_mode_type: 'file',
      server_ips: ['1.1.1.1'],
      filter: ''
    },
    {
      id: 'r6s', name: 'R6 Siege', icon: 'R', color: '#3498db',
      ports: '10000-11000 (UDP)',
      executables: ['rainbowsix.exe', 'uplay.exe'],
      tcp_ports: [80, 443, 14000, 14008, 14020, 14021, 14022, 14023, 14024],
      udp_ports: [3074, 6015],
      udp_ranges: [[10000, 10099]],
      test_ip: '1.1.1.1',
      executable_path: "C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games\\Tom Clancy's Rainbow Six Siege\\RainbowSix.exe",
      launch_args: '',
      manual_mode_type: 'file',
      server_ips: [],
      filter: ''
    }
  ];

  const REGIONS = [
    { id: 'na', name: 'North America', ip: '8.8.8.8' },
    { id: 'eu', name: 'Europe', ip: '1.1.1.1' },
    { id: 'singapore', name: 'Asia (Singapore)', ip: '103.28.54.1' },
    { id: 'india', name: 'India (Mumbai)', ip: '103.28.54.162' },
    { id: 'japan', name: 'Asia (Japan)', ip: '1.1.1.1' },
    { id: 'brazil', name: 'South America', ip: '8.8.8.8' }
  ];

  const [selectedGame, setSelectedGame] = useState(() => {
    const saved = localStorage.getItem('selectedGameId');
    return GAMES.find(g => g.id === saved) || GAMES[0];
  });

  const [selectedRegion, setSelectedRegion] = useState(() => {
    const saved = localStorage.getItem('selectedRegionId');
    const region = REGIONS.find(r => r.id === saved);
    return region || REGIONS[2];
  });

  const [multipathCount, setMultipathCount] = useState(() => {
    const saved = localStorage.getItem('multipathCount');
    return saved ? parseInt(saved, 10) : 1;
  });

  const [autoLaunch, setAutoLaunch] = useState(() => {
    const saved = localStorage.getItem('autoLaunch');
    return saved === 'true';
  });

  const [autoOptimize, setAutoOptimize] = useState(() => {
    const saved = localStorage.getItem('autoOptimize');
    return saved !== 'false';
  });

  const [hardwareAccel, setHardwareAccel] = useState(() => {
    const saved = localStorage.getItem('hardwareAccel');
    return saved !== 'false';
  });

  useEffect(() => { localStorage.setItem('selectedGameId', selectedGame.id); }, [selectedGame]);
  useEffect(() => { localStorage.setItem('selectedRegionId', selectedRegion.id); }, [selectedRegion]);
  useEffect(() => { localStorage.setItem('multipathCount', multipathCount.toString()); }, [multipathCount]);
  useEffect(() => { localStorage.setItem('autoLaunch', autoLaunch.toString()); }, [autoLaunch]);
  useEffect(() => { localStorage.setItem('autoOptimize', autoOptimize.toString()); }, [autoOptimize]);
  useEffect(() => { localStorage.setItem('hardwareAccel', hardwareAccel.toString()); }, [hardwareAccel]);
  useEffect(() => { localStorage.setItem('autoMinimize', autoMinimize.toString()); }, [autoMinimize]);

  useEffect(() => {
    invoke('set_multipath_count', { count: multipathCount })
      .catch(e => console.error("Failed to set multipath:", e));
  }, [multipathCount]);

  const handleGameChange = async (game: typeof GAMES[0]) => {
    if (selectedGame.id === game.id) return;
    setSelectedGame(game);
    try {
      await invoke('set_active_game', {
        config: {
          id: game.id,
          name: game.name,
          executables: game.executables,
          tcp_ports: game.tcp_ports,
          udp_ports: game.udp_ports,
          udp_ranges: game.udp_ranges,
          test_ip: selectedRegion.ip,
          server_ips: [selectedRegion.ip],
        }
      });
    } catch (e) {
      console.error("Failed to sync game config:", e);
    }
  };

  const handleRegionChange = async (regionId: string) => {
    const region = REGIONS.find(r => r.id === regionId);
    if (region) {
      setSelectedRegion(region);
      try {
        await invoke('set_active_game', {
          config: {
            id: selectedGame.id,
            name: selectedGame.name,
            executables: selectedGame.executables,
            tcp_ports: selectedGame.tcp_ports,
            udp_ports: selectedGame.udp_ports,
            udp_ranges: selectedGame.udp_ranges,
            test_ip: region.ip,
            server_ips: [region.ip],
          }
        });
      } catch (e) {
        console.error("Failed to sync region config:", e);
      }
    }
  };

  useEffect(() => {
    const syncInitialConfig = async () => {
      try {
        await invoke('set_active_game', {
          config: {
            id: selectedGame.id,
            name: selectedGame.name,
            executables: selectedGame.executables,
            tcp_ports: selectedGame.tcp_ports,
            udp_ports: selectedGame.udp_ports,
            udp_ranges: selectedGame.udp_ranges,
            test_ip: selectedRegion.ip,
            server_ips: [selectedRegion.ip],
          }
        });
      } catch (e) {
        console.error("Failed to sync initial config:", e);
      }
    };
    syncInitialConfig();

    let unlisten: (() => void) | undefined;
    const setupListener = async () => {
      unlisten = await listen<NetworkStats>("network-stats", (event) => {
        setStats(event.payload);
        setIsGameDetected(event.payload.is_game_detected);
        
        // Update main ping from live route measurement if game is detected
        if (event.payload.is_game_detected && event.payload.detected_server_ip) {
           setPing(event.payload.current_ping);
        }
      });
    };
    setupListener();
    const checkAutostart = async () => {
      try {
        const enabled = await isEnabled();
        setAutoStartup(enabled);
      } catch (e) {
        console.error("Failed to check autostart status:", e);
      }
    };
    checkAutostart();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Auto-update logic
  useEffect(() => {
    const checkUpdates = async () => {
      try {
        const update = await check();
        if (update) {
          const yes = await ask(
            `A new version (${update.version}) is available. Would you like to update now?\n\n${update.body || ''}`, 
            { title: 'Update Available', kind: 'info' }
          );

          if (yes) {
            await update.downloadAndInstall();
            await message('Update installed successfully! The app will now restart.', { title: 'Update Complete', kind: 'info' });
            await relaunch();
          }
        }
      } catch (e) {
        console.error("Update check failed:", e);
      }
    };
    checkUpdates();
  }, []);

  useEffect(() => {
    if (isGameDetected && autoMinimize && isOptimizing) {
       const timer = setTimeout(async () => {
         try {
           const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
           const win = getCurrentWebviewWindow();
           await win.hide();
         } catch (e) {
           console.error("Failed to auto-minimize:", e);
         }
       }, 3000);
       return () => clearTimeout(timer);
    }
  }, [isGameDetected, autoMinimize, isOptimizing]);

  useEffect(() => {
    let interval: number | undefined;
    if (isOptimizing) {
      const fetchPings = async () => {
        try {
          const hosts = [selectedRegion.ip, ...REGIONS.map(r => r.ip)];
          const latencies = await invoke<number[]>("get_multiple_latencies", { hosts });
          
          // Use detected game server IP for main ping if available, else use selected region
          if (!stats.detected_server_ip) {
            setPing(latencies[0]);
          }
          
          setRegionPings({
            na: latencies[1],
            eu: latencies[2],
            singapore: latencies[3],
            india: latencies[4],
            japan: latencies[5],
            brazil: latencies[6]
          });
        } catch (error) {
          console.error("Ping failed:", error);
        }
      };
      fetchPings();
      interval = setInterval(fetchPings, 5000);
    } else {
      setPing(0);
      setRegionPings({ na: 0, eu: 0, singapore: 0, india: 0, japan: 0, brazil: 0 });
    }
    return () => clearInterval(interval);
  }, [isOptimizing, selectedRegion]);

  const runOptimization = async () => {
    try {
      await invoke("apply_registry_optimizations");
      const res = await invoke<string>("optimize_system", { servicesToStop: [] });
      setOptResult(JSON.parse(res));
    } catch (e) {
      console.error("Optimization failed:", e);
    }
  };

  const toggleOptimization = async () => {
    try {
      if (isOptimizing) {
        await invoke("stop_optimization");
        setIsOptimizing(false);
      } else {
        await invoke("start_optimization");
        setIsOptimizing(true);
        if (autoOptimize) runOptimization();
        if (autoLaunch) launchGame();
      }
    } catch (error) {
      console.error("Failed to toggle optimization:", error);
      alert("Error: " + error);
    }
  };

  const launchGame = async () => {
    try {
      if (autoOptimize) runOptimization();
      const isManual = manualModeGames.includes(selectedGame.id);
      let currentPath = isManual ? customPaths[selectedGame.id] : selectedGame.executable_path;
      if (isManual && (selectedGame as any).manual_mode_type === 'folder' && currentPath) {
        const relPath = (selectedGame as any).launcher_rel_path;
        if (relPath) {
          if (currentPath.endsWith('Riot Client') || currentPath.endsWith('Riot Client\\')) {
             currentPath = currentPath.endsWith('\\') ? currentPath + 'RiotClientServices.exe' : currentPath + '\\RiotClientServices.exe';
          } else {
             currentPath = currentPath.endsWith('\\') ? currentPath + relPath : currentPath + '\\' + relPath;
          }
        }
      }
      if (!currentPath) {
        alert(isManual ? "Please find the game executable manually first!" : "Default launch path not configured for this game yet!");
        return;
      }
      const args = selectedGame.launch_args ? selectedGame.launch_args.split(' ').filter(a => a.length > 0) : [];
      await invoke("run_game_executable", { path: currentPath, args, minimize: autoMinimize });
    } catch (error) {
      console.error("Launch failed:", error);
      alert("Failed to launch game. Check path in settings.");
    }
  };

  const handleFindExecutable = async (gameId: string) => {
    const game = GAMES.find(g => g.id === gameId);
    try {
      const isFolderMode = (game as any)?.manual_mode_type === 'folder';
      const selected = await openDialog({
        multiple: false,
        directory: isFolderMode,
        filters: isFolderMode ? undefined : [{ name: 'Executable', extensions: ['exe'] }]
      });
      if (selected && typeof selected === 'string') {
        setCustomPaths(prev => ({ ...prev, [gameId]: selected }));
      }
    } catch (e) { console.error("Failed to open dialog:", e); }
  };

  const toggleManualMode = (gameId: string) => {
    setManualModeGames(prev => prev.includes(gameId) ? prev.filter(id => id !== gameId) : [...prev, gameId]);
  };

  const handleMultipathChange = async (count: number) => {
    setMultipathCount(count);
    try { await invoke('set_multipath_count', { count }); } catch (e) { console.error("Failed to set multipath count:", e); }
  };

  const lossColor = (pct: number) => pct < 2 ? '#10b981' : pct < 10 ? '#f59e0b' : '#f43f5e';
  const jitterColor = (ms: number) => ms < 15 ? '#10b981' : ms < 40 ? '#f59e0b' : '#f43f5e';

  return (
    <div className="app-container">

      <aside className="sidebar">
        <div className={`sidebar-icon ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentView('dashboard')} title="Dashboard">🏠</div>
        <div className={`sidebar-icon ${currentView === 'games' ? 'active' : ''}`} onClick={() => setCurrentView('games')} title="Game Selection">🎮</div>
        <div className={`sidebar-icon ${currentView === 'settings' ? 'active' : ''}`} onClick={() => setCurrentView('settings')} title="Settings">⚙️</div>
        <div className="sidebar-icon donate-btn" onClick={() => openUrl(DONATION_LINK).catch(() => window.open(DONATION_LINK, '_blank'))} title="Support the Developer ❤️" style={{ marginTop: '1rem', color: '#f43f5e', background: 'rgba(244, 63, 94, 0.05)' }}>💖</div>
        <div className="sidebar-footer"><div className="sidebar-icon">🔑</div></div>
      </aside>

      <main className="main-content">
        <header>
          <div style={{ position: 'absolute', top: '10px', left: '10px', fontSize: '0.6rem', color: 'var(--text-dim)', pointerEvents: 'none' }}>v1.0.3</div>
          <div className="logo-text">MINUS LAG <span style={{ fontSize: '0.6rem', opacity: 0.6, verticalAlign: 'super' }}>v1.0.3</span></div>
          <div className="status-badge">
            <div className="status-dot" style={{ background: isOptimizing ? '#10b981' : '#f43f5e' }}></div>
            {isOptimizing ? 'Optimization Active' : 'System Ready'}
          </div>
        </header>

        {currentView === 'dashboard' && (
          <div className="view-fade-in">
            <div className="dashboard-grid">
              <section className="card">
                <h3>Current Latency</h3>
                <div className="ping-display"><span className="ping-value">{ping || '--'}</span><span className="ping-unit">ms</span></div>
                <div className="stats-row">
                  <div className="stat-pill"><span className="stat-label">TCP Packets</span><span className="stat-value">{stats.tcp_packets.toLocaleString()}</span></div>
                  <div className="stat-pill"><span className="stat-label">UDP Packets</span><span className="stat-value">{stats.udp_packets.toLocaleString()}</span></div>
                </div>
                {isOptimizing && (
                  <div className="stats-row" style={{ marginTop: '0.5rem' }}>
                    <div className="stat-pill"><span className="stat-label">Packet Loss</span><span className="stat-value" style={{ color: lossColor(stats.packet_loss_pct) }}>{stats.packet_loss_pct}%</span></div>
                    <div className="stat-pill"><span className="stat-label">Jitter</span><span className="stat-value" style={{ color: jitterColor(stats.jitter_ms) }}>{stats.jitter_ms}ms</span></div>
                  </div>
                )}
                {isOptimizing && stats.detected_server_ip && (
                  <div className="stat-pill" style={{ marginTop: '0.5rem', width: '100%', justifyContent: 'center' }}>
                    <span className="stat-label">Active Server</span>
                    <span className="stat-value" style={{ color: 'var(--primary-color)', fontSize: '0.9rem' }}>{stats.detected_server_ip}</span>
                  </div>
                )}
                <div className="optimization-tags" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {isOptimizing && (
                    <>
                      <span className="tag-pill" style={{ background: isGameDetected ? 'rgba(16, 210, 255, 0.1)' : '' }}>{isGameDetected ? 'PID Detection: Active' : 'Port Detection: Active'}</span>
                      <span className="tag-pill" style={{ background: 'rgba(16, 185, 129, 0.12)' }}>Packet Loss Fix: {stats.multipath_count === 1 ? 'Normal' : stats.multipath_count === 2 ? 'Medium' : 'Extreme'}</span>
                      <span className="tag-pill">Game Ports Only</span>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <button className="btn-primary" onClick={toggleOptimization} style={{ flex: 1, marginTop: 0, background: isOptimizing ? 'var(--accent-color)' : 'var(--primary-color)' }}>
                    {isOptimizing ? "Stop Optimization" : "Start Optimization"}
                  </button>
                  <button className={`btn-secondary ${autoLaunch ? 'launch-active' : ''}`} onClick={() => setAutoLaunch(!autoLaunch)} title={autoLaunch ? "Game will launch on optimization start" : "Game launch is disabled"} style={{ width: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700, gap: '2px', padding: '0.5rem', borderRadius: '12px', transition: 'all 0.3s ease' }}>
                    <span style={{ fontSize: '0.9rem' }}>{autoLaunch ? '🚀' : '🛰️'}</span>AUTO
                  </button>
                </div>
                <div style={{ marginBottom: '1rem', padding: '0.8rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Packet Loss Fix</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: 600 }}>{multipathCount === 1 ? 'Normal' : multipathCount === 2 ? 'Medium' : 'Extreme'}</span>
                  </div>
                  <input type="range" min="1" max="3" step="1" value={multipathCount} onChange={(e) => handleMultipathChange(parseInt(e.target.value))} style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary-color)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}><span>Normal</span><span>Medium</span><span>Extreme</span></div>
                </div>
                <div className="region-benchmark">
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>Global Benchmarks</div>
                  <div style={{ display: 'flex', gap: '0.8rem', background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px', overflowX: 'auto' }}>
                    <div style={{ flex: 1, minWidth: '60px', textAlign: 'center' }}><div style={{ fontSize: '0.65rem', opacity: 0.6 }}>NA</div><div style={{ fontWeight: 600, color: '#10b981' }}>{regionPings.na || '--'}ms</div></div>
                    <div style={{ flex: 1, minWidth: '60px', textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)' }}><div style={{ fontSize: '0.65rem', opacity: 0.6 }}>EU</div><div style={{ fontWeight: 600, color: '#3b82f6' }}>{regionPings.eu || '--'}ms</div></div>
                    <div style={{ flex: 1, minWidth: '60px', textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)' }}><div style={{ fontSize: '0.65rem', opacity: 0.6 }}>SGP</div><div style={{ fontWeight: 600, color: '#f59e0b' }}>{regionPings.singapore || '--'}ms</div></div>
                    <div style={{ flex: 1, minWidth: '60px', textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)' }}><div style={{ fontSize: '0.65rem', opacity: 0.6 }}>IND</div><div style={{ fontWeight: 600, color: '#a855f7' }}>{regionPings.india || '--'}ms</div></div>
                    <div style={{ flex: 1, minWidth: '60px', textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)' }}><div style={{ fontSize: '0.65rem', opacity: 0.6 }}>JPN</div><div style={{ fontWeight: 600, color: '#ef4444' }}>{regionPings.japan || '--'}ms</div></div>
                    <div style={{ flex: 1, minWidth: '60px', textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)' }}><div style={{ fontSize: '0.65rem', opacity: 0.6 }}>BRZ</div><div style={{ fontWeight: 600, color: '#10b981' }}>{regionPings.brazil || '--'}ms</div></div>
                  </div>
                </div>
              </section>

              <section className="card active-optimization">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0 }}>Region: {selectedRegion.name}</h3>
                  <select value={selectedRegion.id} onChange={(e) => handleRegionChange(e.target.value)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                    {REGIONS.map(r => (<option key={r.id} value={r.id} style={{ background: '#1a1a2e' }}>{r.name}</option>))}
                  </select>
                </div>
                <div className="game-list">
                  <div className="game-item active">
                    <div className="game-info">
                      <div className="game-icon" style={{ background: selectedGame.color, position: 'relative' }}><span style={{ color: 'white', fontWeight: 900, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{selectedGame.icon}</span></div>
                      <div><div style={{ fontWeight: 600 }}>{selectedGame.name}</div><div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Ports: {selectedGame.ports}</div></div>
                    </div>
                    {isOptimizing && <div className="optimization-active-badge">ACTIVE</div>}
                  </div>
                </div>
                <div className="route-status" style={{ marginTop: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}><span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Route Status</span><span style={{ fontSize: '0.8rem', color: 'var(--primary-color)' }}>{isOptimizing ? 'Optimized' : 'Normal'}</span></div>
                  <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: isOptimizing ? '100%' : '0%' }}></div></div>
                </div>
                <button className="btn-secondary" style={{ marginTop: '1rem' }} onClick={() => setCurrentView('games')}>Switch Game</button>
              </section>
            </div>

            <section className="card" style={{ flex: 1, marginTop: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <h3 style={{ margin: 0 }}>Game Booster</h3>
                </div>
                <span className="tag-pill" style={{ background: 'rgba(16, 210, 255, 0.1)', color: 'var(--primary-color)' }}>{autoOptimize ? 'Auto Mode Active' : 'Manual Mode'}</span>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div className="setting-item" style={{ padding: '0.5rem 0', borderBottom: 'none' }}>
                    <div><div style={{ fontWeight: 600 }}>Optimize RAM</div><div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Apply tweaks when game starts</div></div>
                    <div className={`toggle-switch ${autoOptimize ? 'active' : ''}`} onClick={() => setAutoOptimize(!autoOptimize)}></div>
                  </div>
                </div>
                <div style={{ flex: 1.5, minWidth: '250px', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.8rem', color: 'var(--primary-color)' }}>Optimization Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                    <div><div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>RAM Cache Cleared</div><div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{optResult ? `${optResult.ram_cleared_gb} GB` : '--'}</div></div>
                    <div><div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Current Latency</div><div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#10b981' }}>{optResult ? `${optResult.timer_resolution}ms` : '--'}</div></div>
                    <div><div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Status</div><div style={{ fontWeight: 700, fontSize: '0.9rem', color: optResult ? '#10b981' : 'var(--text-dim)', paddingTop: '0.2rem' }}>{optResult ? 'Fully Optimized' : 'Pending'}</div></div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {currentView === 'games' && (
          <div className="view-fade-in">
            <h2 style={{ marginBottom: '1.5rem' }}>Select Your Game</h2>
            <div className="game-grid">
              {GAMES.map(game => (
                <div key={game.id} className={`game-card ${selectedGame.id === game.id ? 'selected' : ''}`} onClick={() => { handleGameChange(game); setCurrentView('dashboard'); }}>
                  <div className="game-card-icon" style={{ background: game.color }}>{game.icon}</div>
                  <div className="game-card-name">{game.name}</div>
                  <div className="game-card-ports">{game.ports.split(',')[0]}</div>
                  <div className="manual-mode-container" onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 700 }}>{manualModeGames.includes(game.id) ? 'MANUAL' : 'DEFAULT'}</span>
                      <div className={`toggle-switch mini ${manualModeGames.includes(game.id) ? 'active' : ''}`} onClick={() => toggleManualMode(game.id)}></div>
                    </div>
                    {manualModeGames.includes(game.id) && (
                      <button className="btn-find-dir" onClick={(e) => { e.stopPropagation(); handleFindExecutable(game.id); }} title={customPaths[game.id] || "No path set"} style={{ marginTop: 0, background: customPaths[game.id] ? 'rgba(16, 210, 255, 0.1)' : '' }}>
                        {customPaths[game.id] ? "📁 Folder Set" : (game as any).manual_mode_type === 'folder' ? "📂 Find Riot Games Folder" : "📂 Find .exe"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentView === 'settings' && (
          <div className="view-fade-in settings-view">
            <h2 style={{ marginBottom: '1.5rem' }}>System Settings</h2>
            <section className="card">
              <div className="setting-item">
                <div><div style={{ fontWeight: 600 }}>Launch on Startup</div><div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Automatically start MINUS LAG with Windows</div></div>
                <div className={`toggle-switch ${autoStartup ? 'active' : ''}`} onClick={async () => { try { if (autoStartup) { await disable(); setAutoStartup(false); } else { await enable(); setAutoStartup(true); } } catch (e) { console.error("Failed to toggle autostart:", e); alert("Failed to change startup settings. Registry access may be restricted."); } }}></div>
              </div>
              <div className="setting-item">
                <div><div style={{ fontWeight: 600 }}>Hardware Acceleration</div><div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Use GPU for UI rendering</div></div>
                <div className={`toggle-switch ${hardwareAccel ? 'active' : ''}`} onClick={() => setHardwareAccel(!hardwareAccel)}></div>
              </div>
              <div className="setting-item">
                <div><div style={{ fontWeight: 600 }}>Active Optimization Mode</div><div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Automatically detect game processes for PID-level filtering</div></div>
                <div className={`toggle-switch ${autoDetect ? 'active' : ''}`} onClick={() => setAutoDetect(!autoDetect)}></div>
              </div>
              <div className="setting-item">
                <div><div style={{ fontWeight: 600 }}>Auto Minimize to Tray</div><div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Automatically hide window when game is detected</div></div>
                <div className={`toggle-switch ${autoMinimize ? 'active' : ''}`} onClick={() => setAutoMinimize(!autoMinimize)}></div>
              </div>
              <div className="setting-item">
                <div><div style={{ fontWeight: 600 }}>Create "No UAC" Shortcut</div><div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Create a desktop shortcut that skips the Admin prompt (Requires current Run value to be Admin)</div></div>
                <button className="btn-secondary" style={{ fontSize: '0.7rem', padding: '0.4rem 0.8rem', background: 'var(--primary-color)' }} onClick={async () => { try { const res = await invoke<string>("create_uac_bypass"); alert(res); } catch (e) { alert("Error: " + e); } }}>Create Shortcut</button>
              </div>
            </section>
          </div>
        )}
      </main>

      {showDonationPopup && (
        <div className="modal-overlay">
          <div className="modal-content donation-modal view-fade-in">
            <div className="donation-icon">🎁</div>
            <h2>Enjoying MINUS LAG?</h2>
            <p>We hope the app is helping you reduce lag! If you find it useful, consider supporting the development with a small donation.</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeDonationPopup}>Maybe Later</button>
              <button className="btn-primary" onClick={handleDonate}>Support Now ❤️</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
