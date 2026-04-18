import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./index.css";

interface NetworkStats {
  tcp_packets: number;
  udp_packets: number;
  is_game_detected: boolean;
  packet_loss_pct: number;
  jitter_ms: number;
  multipath_count: number;
  detected_server_ip?: string | null;
}

function App() {
  const [ping, setPing] = useState(0);
  const [regionPings, setRegionPings] = useState({ na: 0, eu: 0, asia: 0, mumbai: 0 });
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [autoDetect, setAutoDetect] = useState(true);
  const [autoStartup, setAutoStartup] = useState(false);
  const [isGameDetected, setIsGameDetected] = useState(false);
  const [stats, setStats] = useState<NetworkStats>({
    tcp_packets: 0, udp_packets: 0, is_game_detected: false,
    packet_loss_pct: 0, jitter_ms: 0, multipath_count: 2
  });
  const [packetHistory, setPacketHistory] = useState<number[]>([]);
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
  // multipathCount state moved lower to group with persistence logic

  const GAMES = [
    {
      id: 'valorant', name: 'Valorant', icon: 'V', color: '#fa4454',
      ports: '7000-8000 (Dynamic)',
      executables: ['valorant.exe', 'valorant-win64-shipping.exe', 'riotclientservices.exe'],
      tcp_ports: [2099, 5222, 5223],
      udp_ports: [7000, 7100, 7200, 7300, 7400, 7500, 7600, 7700, 7800, 7900], // Common fallback
      udp_ranges: [[7000, 8000]], // The REAL game traffic range
      test_ip: '206.127.144.1',
      // Common Windows install paths for launcher logic
      executable_path: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
      launch_args: '--launch-product=valorant --launch-patchline=live',
      manual_mode_type: 'folder',
      launcher_rel_path: 'Riot Client\\RiotClientServices.exe',
      // Riot Games actual game server IP ranges (NA, EU, Asia)
      server_ips: ['206.127.144.1', '185.40.64.1', '162.249.73.1', '103.28.54.1'],
    },
    {
      id: 'league', name: 'League of Legends', icon: 'L', color: '#005a82',
      ports: '5000-5500, 8088',
      executables: ['league of legends.exe', 'riotclientux.exe'],
      tcp_ports: [2099, 5222, 5223, 80, 443],
      udp_ports: [5000, 8088],
      udp_ranges: [[5000, 5500]],
      test_ip: '104.160.131.3',
      executable_path: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
      launch_args: '--launch-product=league_of_legends --launch-patchline=live',
      manual_mode_type: 'folder',
      launcher_rel_path: 'Riot Client\\RiotClientServices.exe',
      server_ips: ['104.160.131.3', '104.160.141.3', '104.160.144.1'],
    },
    {
      id: 'cs2', name: 'Counter-Strike 2', icon: 'C', color: '#de9b35',
      ports: '27015-27030',
      executables: ['cs2.exe'],
      tcp_ports: [27015, 27036],
      udp_ports: [27015, 27020],
      udp_ranges: [[27000, 27100]],
      test_ip: '162.254.192.1',
      executable_path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe',
      launch_args: '-high -novid',
      server_ips: ['162.254.192.1', '162.254.193.1', '162.254.196.1'],
    },
    {
      id: 'apex', name: 'Apex Legends', icon: 'A', color: '#ff4b24',
      ports: '37005-37015',
      executables: ['r5apex.exe'],
      tcp_ports: [80, 443, 9946, 9947, 9988, 17502, 42127],
      udp_ports: [37005, 37015],
      udp_ranges: [[37000, 37020]],
      test_ip: '185.50.104.1',
      executable_path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Apex Legends\\r5apex.exe',
      launch_args: '-high -novid',
      manual_mode_type: 'file',
      server_ips: ['185.50.104.1', '185.50.108.1', '45.33.0.1'],
    },
  ];

  const REGIONS = [
    { id: 'na', name: 'North America', ip: '8.8.8.8' },
    { id: 'eu', name: 'Europe (Frankfurt)', ip: '7.7.7.7' },
    { id: 'asia', name: 'Asia (Singapore)', ip: '1.1.1.1' },
    { id: 'mumbai', name: 'India (Mumbai)', ip: '15.206.0.1' }
  ];

  // Load saved settings or defaults
  const [selectedGame, setSelectedGame] = useState(() => {
    const saved = localStorage.getItem('selectedGameId');
    return GAMES.find(g => g.id === saved) || GAMES[0];
  });

  const [selectedRegion, setSelectedRegion] = useState(() => {
    const saved = localStorage.getItem('selectedRegionId');
    const region = REGIONS.find(r => r.id === saved);
    // User requested persistence for region.
    // If saved is 'mumbai', region should be found.
    return region || REGIONS[2];
  });

  const [multipathCount, setMultipathCount] = useState(() => {
    const saved = localStorage.getItem('multipathCount');
    return saved ? parseInt(saved, 10) : 2;
  });

  const [autoLaunch, setAutoLaunch] = useState(() => {
    const saved = localStorage.getItem('autoLaunch');
    return saved === 'true';
  });

  const [hardwareAccel, setHardwareAccel] = useState(() => {
    const saved = localStorage.getItem('hardwareAccel');
    return saved !== 'false'; // Default to true
  });

  // Save settings when changed
  useEffect(() => { localStorage.setItem('selectedGameId', selectedGame.id); }, [selectedGame]);
  useEffect(() => { localStorage.setItem('selectedRegionId', selectedRegion.id); }, [selectedRegion]);
  useEffect(() => { localStorage.setItem('multipathCount', multipathCount.toString()); }, [multipathCount]);
  useEffect(() => { localStorage.setItem('autoLaunch', autoLaunch.toString()); }, [autoLaunch]);
  useEffect(() => { localStorage.setItem('hardwareAccel', hardwareAccel.toString()); }, [hardwareAccel]);
  useEffect(() => { localStorage.setItem('hardwareAccel', hardwareAccel.toString()); }, [hardwareAccel]);

  // Sync configuration to backend (Reactive)
  useEffect(() => {
    // 2. Sync Multipath Count
    invoke('set_multipath_count', { count: multipathCount })
      .catch(e => console.error("Failed to set multipath:", e));
  }, [multipathCount]);

  // Handle Game Change with built-in debounce logic to prevent rapid restarts
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
          test_ip: game.test_ip,
          server_ips: game.server_ips,
        }
      });
    } catch (e) {
      console.error("Failed to sync game config:", e);
    }
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<NetworkStats>("network-stats", (event) => {
        setStats(event.payload);
        setIsGameDetected(event.payload.is_game_detected);
        setPacketHistory(prev => {
          const total = event.payload.tcp_packets + event.payload.udp_packets;
          const newHistory = [...prev, total];
          if (newHistory.length > 50) return newHistory.slice(1);
          return newHistory;
        });
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

  // Real ping measurement & Benchmarking
  useEffect(() => {
    let interval: number | undefined;
    if (isOptimizing) {
      const fetchPings = async () => {
        try {
          const hosts = [selectedRegion.ip, ...REGIONS.map(r => r.ip)];
          const latencies = await invoke<number[]>("get_multiple_latencies", { hosts });
          setPing(latencies[0]);
          setRegionPings({
            na: latencies[1],
            eu: latencies[2],
            asia: latencies[3],
            mumbai: latencies[4]
          });
        } catch (error) {
          console.error("Ping failed:", error);
        }
      };
      fetchPings();
      interval = setInterval(fetchPings, 5000);
    } else {
      setPing(0);
      setRegionPings({ na: 0, eu: 0, asia: 0, mumbai: 0 });
    }
    return () => clearInterval(interval);
  }, [isOptimizing, selectedRegion]);

  const toggleOptimization = async () => {
    try {
      if (isOptimizing) {
        await invoke("stop_optimization");
        setIsOptimizing(false);
      } else {
        // Start optimization first
        await invoke("start_optimization");
        setIsOptimizing(true);

        // If auto-launch is enabled, trigger the game launch too
        if (autoLaunch) {
          launchGame();
        }
      }
    } catch (error) {
      console.error("Failed to toggle optimization:", error);
      alert("Error: Make sure you are running as Administrator!");
    }
  };

  const launchGame = async () => {
    try {
      const isManual = manualModeGames.includes(selectedGame.id);
      let currentPath = isManual 
        ? customPaths[selectedGame.id] 
        : selectedGame.executable_path;

      // Handle folder-based launchers (like Valorant/Riot Client)
      if (isManual && (selectedGame as any).manual_mode_type === 'folder' && currentPath) {
        // If the user selected a directory, we append the relative launcher path
        // We try both with and without the "Riot Client" subfolder in case they selected that directly
        const relPath = (selectedGame as any).launcher_rel_path;
        if (relPath) {
          // Note: This is a bit of a heuristic but works for standard Riot installs
          if (currentPath.endsWith('Riot Client') || currentPath.endsWith('Riot Client\\')) {
             currentPath = currentPath.endsWith('\\') ? currentPath + 'RiotClientServices.exe' : currentPath + '\\RiotClientServices.exe';
          } else {
             currentPath = currentPath.endsWith('\\') ? currentPath + relPath : currentPath + '\\' + relPath;
          }
        }
      }

      if (!currentPath) {
        if (isManual) {
          alert("Please find the game executable manually first!");
        } else {
          alert("Default launch path not configured for this game yet!");
        }
        return;
      }

      // Pass arguments separately to fix Windows "cannot find file" error
      const args = selectedGame.launch_args
        ? selectedGame.launch_args.split(' ').filter(a => a.length > 0)
        : [];

      const res = await invoke("run_game_executable", {
        path: currentPath,
        args
      });
      console.log(res);
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
        filters: isFolderMode ? undefined : [{
          name: 'Executable',
          extensions: ['exe']
        }]
      });
      if (selected && typeof selected === 'string') {
        setCustomPaths(prev => ({ ...prev, [gameId]: selected }));
      }
    } catch (e) {
      console.error("Failed to open dialog:", e);
    }
  };

  const toggleManualMode = (gameId: string) => {
    setManualModeGames(prev =>
      prev.includes(gameId)
        ? prev.filter(id => id !== gameId)
        : [...prev, gameId]
    );
  };


  const handleMultipathChange = async (count: number) => {
    setMultipathCount(count);
    try {
      await invoke('set_multipath_count', { count });
    } catch (e) {
      console.error("Failed to set multipath count:", e);
    }
  };

  // Packet loss colour: green <2%, yellow <10%, red >=10%
  const lossColor = (pct: number) =>
    pct < 2 ? '#10b981' : pct < 10 ? '#f59e0b' : '#f43f5e';

  // Jitter colour: green <15ms, yellow <40ms, red >=40ms
  const jitterColor = (ms: number) =>
    ms < 15 ? '#10b981' : ms < 40 ? '#f59e0b' : '#f43f5e';

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div
          className={`sidebar-icon ${currentView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setCurrentView('dashboard')}
          title="Dashboard"
        >🏠</div>
        <div
          className={`sidebar-icon ${currentView === 'games' ? 'active' : ''}`}
          onClick={() => setCurrentView('games')}
          title="Game Selection"
        >🎮</div>
        <div
          className={`sidebar-icon ${currentView === 'settings' ? 'active' : ''}`}
          onClick={() => setCurrentView('settings')}
          title="Settings"
        >⚙️</div>
        <div
          className="sidebar-icon donate-btn"
          onClick={() => openUrl(DONATION_LINK).catch(() => window.open(DONATION_LINK, '_blank'))}
          title="Support the Developer ❤️"
          style={{ marginTop: '1rem', color: '#f43f5e', background: 'rgba(244, 63, 94, 0.05)' }}
        >💖</div>
        <div className="sidebar-footer">
          <div className="sidebar-icon">🔑</div>
        </div>
      </aside>

      <main className="main-content">
        <header>
          <div className="logo-text">MINUS LAG</div>
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
                <div className="ping-display">
                  <span className="ping-value">{ping || '--'}</span>
                  <span className="ping-unit">ms</span>
                </div>
                <div className="stats-row">
                  <div className="stat-pill">
                    <span className="stat-label">TCP Packets</span>
                    <span className="stat-value">{stats.tcp_packets.toLocaleString()}</span>
                  </div>
                  <div className="stat-pill">
                    <span className="stat-label">UDP Packets</span>
                    <span className="stat-value">{stats.udp_packets.toLocaleString()}</span>
                  </div>
                </div>

                {/* Route quality stats — only show when optimizing */}
                {isOptimizing && (
                  <div className="stats-row" style={{ marginTop: '0.5rem' }}>
                    <div className="stat-pill">
                      <span className="stat-label">Packet Loss</span>
                      <span className="stat-value" style={{ color: lossColor(stats.packet_loss_pct) }}>
                        {stats.packet_loss_pct}%
                      </span>
                    </div>
                    <div className="stat-pill">
                      <span className="stat-label">Jitter</span>
                      <span className="stat-value" style={{ color: jitterColor(stats.jitter_ms) }}>
                        {stats.jitter_ms}ms
                      </span>
                    </div>
                  </div>
                )}

                {/* Detected Live Server IP */}
                {isOptimizing && stats.detected_server_ip && (
                  <div className="stat-pill" style={{ marginTop: '0.5rem', width: '100%', justifyContent: 'center' }}>
                    <span className="stat-label">Active Server</span>
                    <span className="stat-value" style={{ color: 'var(--primary-color)', fontSize: '0.9rem' }}>
                      {stats.detected_server_ip}
                    </span>
                  </div>
                )}

                <div className="optimization-tags" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {isOptimizing && (
                    <>
                      <span className="tag-pill" style={{ background: isGameDetected ? 'rgba(16, 210, 255, 0.1)' : '' }}>
                        {isGameDetected ? 'PID Detection: Active' : 'Port Detection: Active'}
                      </span>
                      <span className="tag-pill" style={{ background: 'rgba(16, 185, 129, 0.12)' }}>
                        Multipath: {stats.multipath_count === 3 ? 'Extreme' : 'Normal'}
                      </span>
                      <span className="tag-pill">Game Ports Only</span>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <button
                    className="btn-primary"
                    onClick={toggleOptimization}
                    style={{ flex: 1, marginTop: 0, background: isOptimizing ? 'var(--accent-color)' : 'var(--primary-color)' }}
                  >
                    {isOptimizing ? "Stop Optimization" : "Start Optimization"}
                  </button>
                  <button
                    className={`btn-secondary ${autoLaunch ? 'launch-active' : ''}`}
                    onClick={() => setAutoLaunch(!autoLaunch)}
                    title={autoLaunch ? "Game will launch on optimization start" : "Game launch is disabled"}
                    style={{
                      width: '60px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.65rem',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      gap: '2px',
                      padding: '0.5rem',
                      borderRadius: '12px',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <span style={{ fontSize: '0.9rem' }}>{autoLaunch ? '🚀' : '🛰️'}</span>
                    AUTO
                  </button>
                </div>

                <div className="region-benchmark">
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>Global Benchmarks</div>
                  <div style={{ display: 'flex', gap: '0.8rem', background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px' }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>NA</div>
                      <div style={{ fontWeight: 600, color: '#10b981' }}>{regionPings.na || '--'}ms</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                      <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>EU</div>
                      <div style={{ fontWeight: 600, color: '#3b82f6' }}>{regionPings.eu || '--'}ms</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                      <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>SGP</div>
                      <div style={{ fontWeight: 600, color: '#f59e0b' }}>{regionPings.asia || '--'}ms</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>BOM</div>
                      <div style={{ fontWeight: 600, color: '#a855f7' }}>{regionPings.mumbai || '--'}ms</div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="card active-optimization">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0 }}>Region: {selectedRegion.name}</h3>
                  <select
                    value={selectedRegion.id}
                    onChange={(e) => {
                      const region = REGIONS.find(r => r.id === e.target.value);
                      if (region) setSelectedRegion(region);
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--glass-border)',
                      color: 'white',
                      borderRadius: '4px',
                      padding: '2px 8px',
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    {REGIONS.filter(r => r.id === 'asia' || r.id === 'mumbai').map(r => (
                      <option key={r.id} value={r.id} style={{ background: '#1a1a2e' }}>{r.name.split(' (')[1].replace(')', '')}</option>
                    ))}
                  </select>
                </div>
                <div className="game-list">
                  <div className="game-item active">
                    <div className="game-info">
                      <div className="game-icon" style={{ background: selectedGame.color, position: 'relative' }}>
                        <span style={{ color: 'white', fontWeight: 900, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {selectedGame.icon}
                        </span>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{selectedGame.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Ports: {selectedGame.ports}</div>
                      </div>
                    </div>
                    {isOptimizing && <div className="optimization-active-badge">ACTIVE</div>}
                  </div>
                </div>
                <div className="route-status" style={{ marginTop: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Route Status</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--primary-color)' }}>{isOptimizing ? 'Optimized' : 'Normal'}</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: isOptimizing ? '100%' : '0%' }}></div>
                  </div>
                </div>
                <button
                  className="btn-secondary"
                  style={{ marginTop: '1rem' }}
                  onClick={() => setCurrentView('games')}
                >
                  Switch Game
                </button>
              </section>
            </div>

            <section className="card" style={{ flex: 1, marginTop: '2rem' }}>
              <h3>Network Activity (Packets/sec)</h3>
              <div className="activity-graph">
                {packetHistory.map((val, i) => (
                  <div key={i} style={{
                    flex: 1,
                    background: "var(--primary-color)",
                    height: `${Math.min(100, (val / 100) * 100)}%`,
                    opacity: 0.3 + (i / 50),
                    borderRadius: "2px",
                    transition: "height 0.3s ease"
                  }}></div>
                ))}
                {packetHistory.length === 0 && Array(30).fill(0).map((_, i) => (
                  <div key={i} style={{
                    flex: 1,
                    background: "var(--glass-border)",
                    height: "2px",
                    borderRadius: "2px"
                  }}></div>
                ))}
              </div>
            </section>
          </div>
        )}

        {currentView === 'games' && (
          <div className="view-fade-in">
            <h2 style={{ marginBottom: '1.5rem' }}>Select Your Game</h2>
            <div className="game-grid">
              {GAMES.map(game => (
                <div
                  key={game.id}
                  className={`game-card ${selectedGame.id === game.id ? 'selected' : ''}`}
                  onClick={() => {
                    handleGameChange(game);
                    setCurrentView('dashboard');
                  }}
                >
                  <div className="game-card-icon" style={{ background: game.color }}>{game.icon}</div>
                  <div className="game-card-name">{game.name}</div>
                  <div className="game-card-ports">{game.ports.split(',')[0]}</div>
                  
                  <div className="manual-mode-container" onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 700 }}>{manualModeGames.includes(game.id) ? 'MANUAL' : 'DEFAULT'}</span>
                      <div 
                        className={`toggle-switch mini ${manualModeGames.includes(game.id) ? 'active' : ''}`}
                        onClick={() => toggleManualMode(game.id)}
                      ></div>
                    </div>
                    
                    {manualModeGames.includes(game.id) && (
                      <button
                        className="btn-find-dir"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFindExecutable(game.id);
                        }}
                        title={customPaths[game.id] || "No path set"}
                        style={{ marginTop: 0, background: customPaths[game.id] ? 'rgba(16, 210, 255, 0.1)' : '' }}
                      >
                        {customPaths[game.id] 
                          ? "📁 Folder Set" 
                          : (game as any).manual_mode_type === 'folder' ? "📂 Find Riot Games Folder" : "📂 Find .exe"}
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
                <div>
                  <div style={{ fontWeight: 600 }}>Launch on Startup</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Automatically start MINUS LAG with Windows</div>
                </div>
                <div
                  className={`toggle-switch ${autoStartup ? 'active' : ''}`}
                  onClick={async () => {
                    try {
                      if (autoStartup) {
                        await disable();
                        setAutoStartup(false);
                      } else {
                        await enable();
                        setAutoStartup(true);
                      }
                    } catch (e) {
                      console.error("Failed to toggle autostart:", e);
                      alert("Failed to change startup settings. Registry access may be restricted.");
                    }
                  }}
                ></div>
              </div>
              <div className="setting-item">
                <div>
                  <div style={{ fontWeight: 600 }}>Hardware Acceleration</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Use GPU for UI rendering</div>
                </div>
                <div
                  className={`toggle-switch ${hardwareAccel ? 'active' : ''}`}
                  onClick={() => setHardwareAccel(!hardwareAccel)}
                ></div>
              </div>
              <div className="setting-item">
                <div>
                  <div style={{ fontWeight: 600 }}>Active Optimization Mode</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Automatically detect game processes for PID-level filtering</div>
                </div>
                <div
                  className={`toggle-switch ${autoDetect ? 'active' : ''}`}
                  onClick={() => setAutoDetect(!autoDetect)}
                ></div>
              </div>

              {/* Multipath UDP duplication slider */}
              <div className="setting-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>UDP Multipath Duplication</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    Send each game UDP packet multiple times to eliminate packet loss.
                    Higher = less loss, slightly more bandwidth used.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                  {[2, 3].map(n => (
                    <button
                      key={n}
                      onClick={() => handleMultipathChange(n)}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: `1px solid ${multipathCount === n ? 'var(--primary-color)' : 'var(--glass-border)'}`,
                        background: multipathCount === n ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
                        color: multipathCount === n ? 'var(--primary-color)' : 'var(--text-dim)',
                        cursor: 'pointer',
                        fontWeight: multipathCount === n ? 700 : 400,
                        fontSize: '0.85rem',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {n === 2 ? 'Normal' : 'Extreme'}
                    </button>
                  ))}
                </div>
              </div>


              <div className="setting-item">
                <div>
                  <div style={{ fontWeight: 600 }}>Create "No UAC" Shortcut</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    Create a desktop shortcut that skips the Admin prompt (Requires current Run value to be Admin)
                  </div>
                </div>
                <button
                  className="btn-secondary"
                  style={{ fontSize: '0.7rem', padding: '0.4rem 0.8rem', background: 'var(--primary-color)' }}
                  onClick={async () => {
                    try {
                      const res = await invoke<string>("create_uac_bypass");
                      alert(res);
                    } catch (e) {
                      alert("Error: " + e);
                    }
                  }}
                >Create Shortcut</button>
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
