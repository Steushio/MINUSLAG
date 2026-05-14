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
  services_optimized: number;
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
}

function App() {
  const [ping, setPing] = useState(0);
  const [regionPings, setRegionPings] = useState({ na: 0, eu: 0, asia: 0, mumbai: 0 });
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
    packet_loss_pct: 0, jitter_ms: 0, multipath_count: 1
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
      test_ip: '206.127.144.1',
      executable_path: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
      launch_args: '--launch-product=valorant --launch-patchline=live',
      manual_mode_type: 'folder',
      launcher_rel_path: 'Riot Client\\RiotClientServices.exe',
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
    {
      id: 'r6', name: 'Rainbow Six Siege', icon: '6', color: '#ffb300',
      ports: '10000-10099',
      executables: ['rainbowsix.exe', 'rainbowsix_vulkan.exe'],
      tcp_ports: [80, 443, 14000, 14008, 14020, 14021, 14022, 14023, 14024],
      udp_ports: [3074, 6015],
      udp_ranges: [[10000, 10099]],
      test_ip: '216.58.200.142',
      executable_path: "C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games\\Tom Clancy's Rainbow Six Siege\\RainbowSix.exe",
      launch_args: '',
      manual_mode_type: 'file',
      server_ips: [],
    },
  ];

  const REGIONS = [
    { id: 'na', name: 'North America', ip: '8.8.8.8' },
    { id: 'eu', name: 'Europe (Frankfurt)', ip: '7.7.7.7' },
    { id: 'asia', name: 'Asia (Singapore)', ip: '1.1.1.1' },
    { id: 'mumbai', name: 'India (Mumbai)', ip: '15.206.0.1' }
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

  const SERVICE_LIST = [
    { id: "tzautoupdate", desc: "Time Zone Auto Update", category: "recommended" },
    { id: "PeerDistSvc", desc: "BranchCache (Network Optimization)", category: "recommended" },
    { id: "autotimesvc", desc: "Cellular Time Sync", category: "recommended" },
    { id: "DusmSvc", desc: "Data Usage Monitoring", category: "recommended" },
    { id: "DoSvc", desc: "Delivery Optimization (P2P Updates)", category: "recommended" },
    { id: "diagsvc", desc: "Diagnostic Execution", category: "recommended" },
    { id: "DPS", desc: "Diagnostic Policy Service", category: "recommended" },
    { id: "WdiServiceHost", desc: "Diagnostic Service Host", category: "recommended" },
    { id: "WdiSystemHost", desc: "Diagnostic System Host", category: "recommended" },
    { id: "MapsBroker", desc: "Downloaded Maps Manager", category: "recommended" },
    { id: "EntAppSvc", desc: "Enterprise App Management", category: "recommended" },
    { id: "fhsvc", desc: "File History Service", category: "recommended" },
    { id: "UsoSvc", desc: "Update Orchestrator (Windows Update)", category: "recommended" },
    { id: "vds", desc: "Virtual Disk Service", category: "recommended" },
    { id: "VSS", desc: "Volume Shadow Copy (Backups)", category: "recommended" },
    { id: "WalletService", desc: "Microsoft Wallet Service", category: "recommended" },
    { id: "webthreatdefusersvc", desc: "Web Threat Protection (User)", category: "recommended" },
    { id: "webthreatdefsvc", desc: "Web Threat Protection Service", category: "recommended" },
    { id: "TokenBroker", desc: "Windows Token Broker", category: "recommended" },
    { id: "TimeBrokerSvc", desc: "Background Tasks Timing", category: "recommended" },
    { id: "TapiSrv", desc: "Telephony (Phone/Dialup)", category: "recommended" },
    { id: "SysMain", desc: "Superfetch (Disk Caching)", category: "recommended" },
    { id: "OneSyncSvc", desc: "Account Syncing (Mail/Calendar)", category: "recommended" },
    { id: "StorSvc", desc: "Storage Service", category: "recommended" },
    { id: "WiaRpc", desc: "Still Image Acquisition (Scanners)", category: "recommended" },
    { id: "SNMPTrap", desc: "SNMP Monitoring Service", category: "recommended" },
    { id: "SCPolicySvc", desc: "Smart Card Policy", category: "recommended" },
    { id: "ScDeviceEnum", desc: "Smart Card Device Enumeration", category: "recommended" },
    { id: "SCardSvr", desc: "Smart Card Login", category: "recommended" },
    { id: "shpamsvc", desc: "Shared PC Account Manager", category: "recommended" },
    { id: "RemoteAccess", desc: "Routing and Remote Access", category: "recommended" },
    { id: "TrkWks", desc: "Distributed Link Tracking", category: "recommended" },
    { id: "MSDTC", desc: "Distributed Transaction Coord.", category: "recommended" },
    { id: "HvHost", desc: "Hyper-V Host Service", category: "recommended" },
    { id: "vmickvpexchange", desc: "Hyper-V Data Exchange", category: "recommended" },
    { id: "vmicguestinterface", desc: "Hyper-V Guest Interface", category: "recommended" },
    { id: "vmicshutdown", desc: "Hyper-V Guest Shutdown", category: "recommended" },
    { id: "vmicheartbeat", desc: "Hyper-V Heartbeat", category: "recommended" },
    { id: "vmicvmsession", desc: "Hyper-V VM Session", category: "recommended" },
    { id: "vmicrdv", desc: "Hyper-V Remote Desktop", category: "recommended" },
    { id: "vmictimesync", desc: "Hyper-V Time Sync", category: "recommended" },
    { id: "vmicvss", desc: "Hyper-V Shadow Copy", category: "recommended" },
    { id: "MessagingService", desc: "Windows Messaging", category: "recommended" },
    { id: "wlidsvc", desc: "Microsoft Account Sign-in", category: "recommended" },
    { id: "AppVClient", desc: "Microsoft App-V Client", category: "recommended" },
    { id: "cloudidsvc", desc: "Microsoft Cloud Identity", category: "recommended" },
    { id: "MicrosoftCopilotElevationService", desc: "Microsoft Copilot", category: "recommended" },
    { id: "MicrosoftEdgeElevationService", desc: "Microsoft Edge Service", category: "recommended" },
    { id: "edgeupdate", desc: "Microsoft Edge Update", category: "recommended" },
    { id: "edgeupdatem", desc: "Microsoft Edge Update (Manual)", category: "recommended" },
    { id: "swprv", desc: "Software Shadow Copy Provider", category: "recommended" },
    { id: "CscService", desc: "Offline Files Service", category: "recommended" },
    { id: "defragsvc", desc: "Disk Defragmenter", category: "recommended" },
    { id: "P9RdrService", desc: "Plan 9 Redirector (WSL)", category: "recommended" },
    { id: "WpcMonSvc", desc: "Parental Controls", category: "recommended" },
    { id: "SEMgrSvc", desc: "Payments and NFC Manager", category: "recommended" },
    { id: "wercplsupport", desc: "Problem Reports & Solutions", category: "recommended" },
    { id: "PcaSvc", desc: "Compatibility Assistant", category: "recommended" },
    { id: "RmSvc", desc: "Radio Management", category: "recommended" },
    { id: "RasAuto", desc: "Remote Access Auto Connect", category: "recommended" },
    { id: "RasMan", desc: "Remote Access Conn. Manager", category: "recommended" },
    { id: "SessionEnv", desc: "Remote Desktop Config", category: "recommended" },
    { id: "TermService", desc: "Remote Desktop Services", category: "recommended" },
    { id: "UmRdpService", desc: "RDP Port Redirector", category: "recommended" },
    { id: "RemoteRegistry", desc: "Remote Registry Service", category: "recommended" },
    { id: "RetailDemo", desc: "Retail Demo Service", category: "recommended" },
    { id: "WarpJITSvc", desc: "Warp JIT Service" , category: "recommended" },
    { id: "SDRSVC", desc: "Windows Backup", category: "recommended" },
    { id: "WbioSrvc", desc: "Windows Biometric (Fingerprint)", category: "recommended" },
    { id: "wcncsvc", desc: "Windows Connect Now", category: "recommended" },
    { id: "workfolderssvc", desc: "Work Folders", category: "recommended" },
    { id: "wuauserv", desc: "Windows Update Service", category: "recommended" },
    { id: "WerSvc", desc: "Windows Error Reporting", category: "recommended" },
    { id: "wisvc", desc: "Windows Insider Service", category: "recommended" },
    { id: "WMPNetworkSvc", desc: "WMP Network Sharing", category: "recommended" },
    { id: "WSearch", desc: "Windows Search Indexing", category: "recommended" },
    { id: "MixedRealityOpenXRSvc", desc: "Windows Mixed Reality", category: "recommended" },
    { id: "WinRM", desc: "Windows Remote Management", category: "recommended" },
    { id: "icssvc", desc: "Windows Mobile Hotspot", category: "recommended" },
    { id: "Spooler", desc: "Print Spooler", category: "safe" },
    { id: "PrintNotify", desc: "Printer Notifications", category: "safe" },
    { id: "PrintWorkflowUserSvc", desc: "Print Workflow Service", category: "safe" },
    { id: "XblAuthManager", desc: "Xbox Live Auth", category: "safe" },
    { id: "XblGameSave", desc: "Xbox Live Game Save", category: "safe" },
    { id: "XboxNetApiSvc", desc: "Xbox Live Networking", category: "safe" },
    { id: "XboxGipSvc", desc: "Xbox Accessory Management", category: "safe" },
    { id: "BcastDVRUserService", desc: "Game DVR (Recording)", category: "safe" },
    { id: "SensorService", desc: "System Sensor Service", category: "safe" },
    { id: "SensrSvc", desc: "Sensor Monitoring", category: "safe" },
    { id: "SensorDataService", desc: "Sensor Data Collection", category: "safe" },
    { id: "PenService", desc: "Pen and Touch Input", category: "safe" },
    { id: "PhoneSvc", desc: "Phone Service (Link to Phone)", category: "safe" },
    { id: "WPDBusEnum", desc: "Portable Device Enumerator", category: "safe" },
    { id: "W32Time", desc: "Windows Time Sync", category: "safe" },
    { id: "LanmanWorkstation", desc: "Network Share Client", category: "caution" },
    { id: "Themes", desc: "Desktop Themes & Visuals", category: "caution" },
    { id: "seclogon", desc: "Secondary Logon Service", category: "caution" },
    { id: "FontCache", desc: "Windows Font Cache", category: "caution" },
    { id: "Netlogon", desc: "Network Domain Login", category: "caution" },
    { id: "BDESVC", desc: "BitLocker Drive Encryption", category: "caution" },
  ];

  const [enabledServices, setEnabledServices] = useState<string[]>(() => {
    const saved = localStorage.getItem('enabledServices');
    return saved ? JSON.parse(saved) : SERVICE_LIST.map(s => s.id);
  });

  const [showServiceSettings, setShowServiceSettings] = useState(false);

  useEffect(() => {
    localStorage.setItem('enabledServices', JSON.stringify(enabledServices));
  }, [enabledServices]);

  const toggleService = (serviceId: string) => {
    setEnabledServices(prev => 
      prev.includes(serviceId) ? prev.filter(s => s !== serviceId) : [...prev, serviceId]
    );
  };

  const toggleCategory = (category: string, enable: boolean) => {
    const categoryIds = SERVICE_LIST.filter(s => s.category === category).map(s => s.id);
    setEnabledServices(prev => {
      const filtered = prev.filter(id => !categoryIds.includes(id));
      return enable ? [...filtered, ...categoryIds] : filtered;
    });
  };

  const toggleAll = (enable: boolean) => {
    setEnabledServices(enable ? SERVICE_LIST.map(s => s.id) : []);
  };

  const runOptimization = async () => {
    try {
      const res = await invoke<string>("optimize_system", { servicesToStop: enabledServices });
      setOptResult(JSON.parse(res));
    } catch (e) {
      console.error("Optimization failed:", e);
    }
  };

  const revertOptimization = async () => {
    try {
      await invoke("revert_system");
      setOptResult(null);
      alert("Services reverted to normal!");
    } catch (e) {
      console.error("Revert failed:", e);
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
      alert("Error: Make sure you are running as Administrator!");
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
      await invoke("run_game_executable", { path: currentPath, args });
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
      {showServiceSettings && (
        <div className="modal-overlay" onClick={() => setShowServiceSettings(false)}>
          <div className="modal-content card" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>Optimization Services</h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>Configure which background tasks to suppress</div>
              </div>
              <button className="btn-secondary" style={{ width: 'auto', padding: '6px 16px' }} onClick={() => setShowServiceSettings(false)}>Close</button>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', border: '1px solid var(--glass-border)' }}>
               <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Master Toggle</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Enable or disable all optimizations at once</div>
               </div>
               <div style={{ display: 'flex', gap: '0.8rem' }}>
                  <button className="btn-secondary" style={{ width: 'auto', padding: '4px 12px', fontSize: '0.75rem' }} onClick={() => toggleAll(true)}>Enable All</button>
                  <button className="btn-secondary" style={{ width: 'auto', padding: '4px 12px', fontSize: '0.75rem' }} onClick={() => toggleAll(false)}>Disable All</button>
               </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.5rem' }}>
              {[
                { id: 'recommended', label: '🚀 Highly Recommended', color: '#10b981' },
                { id: 'safe', label: "🎮 Safe if you don't use these features", color: '#3b82f6' },
                { id: 'caution', label: '⚠️ Exercise Caution (Optional)', color: '#f59e0b' }
              ].map(cat => (
                <div key={cat.id} style={{ marginBottom: '1.5rem' }}>
                  <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-color)', padding: '0.5rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${cat.color}44`, marginBottom: '0.8rem' }}>
                    <span style={{ fontWeight: 700, color: cat.color, fontSize: '0.9rem' }}>{cat.label}</span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn-secondary" style={{ width: 'auto', padding: '2px 8px', fontSize: '0.65rem', borderRadius: '4px' }} onClick={() => toggleCategory(cat.id, true)}>All ON</button>
                      <button className="btn-secondary" style={{ width: 'auto', padding: '2px 8px', fontSize: '0.65rem', borderRadius: '4px' }} onClick={() => toggleCategory(cat.id, false)}>All OFF</button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                    {SERVICE_LIST.filter(s => s.category === cat.id).map(svc => (
                      <div key={svc.id} className="setting-item" style={{ padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', borderBottom: 'none', flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary-color)' }}>{svc.id}</span>
                          <div className={`toggle-switch mini ${enabledServices.includes(svc.id) ? 'active' : ''}`} onClick={() => toggleService(svc.id)}></div>
                        </div>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', lineHeight: '1.2' }}>{svc.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
                  <div style={{ display: 'flex', gap: '0.8rem', background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px' }}>
                    <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '0.65rem', opacity: 0.6 }}>NA</div><div style={{ fontWeight: 600, color: '#10b981' }}>{regionPings.na || '--'}ms</div></div>
                    <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)', borderRight: '1px solid rgba(255,255,255,0.1)' }}><div style={{ fontSize: '0.65rem', opacity: 0.6 }}>EU</div><div style={{ fontWeight: 600, color: '#3b82f6' }}>{regionPings.eu || '--'}ms</div></div>
                    <div style={{ flex: 1, textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)' }}><div style={{ fontSize: '0.65rem', opacity: 0.6 }}>SGP</div><div style={{ fontWeight: 600, color: '#f59e0b' }}>{regionPings.asia || '--'}ms</div></div>
                    <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '0.65rem', opacity: 0.6 }}>BOM</div><div style={{ fontWeight: 600, color: '#a855f7' }}>{regionPings.mumbai || '--'}ms</div></div>
                  </div>
                </div>
              </section>

              <section className="card active-optimization">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0 }}>Region: {selectedRegion.name}</h3>
                  <select value={selectedRegion.id} onChange={(e) => { const region = REGIONS.find(r => r.id === e.target.value); if (region) setSelectedRegion(region); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                    {REGIONS.filter(r => r.id === 'asia' || r.id === 'mumbai').map(r => (<option key={r.id} value={r.id} style={{ background: '#1a1a2e' }}>{r.name.split(' (')[1].replace(')', '')}</option>))}
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
                  <button className="sidebar-icon" style={{ background: 'rgba(255,255,255,0.05)', fontSize: '0.8rem', padding: '4px', borderRadius: '6px', width: '28px', height: '28px' }} onClick={() => setShowServiceSettings(true)} title="Service Settings">⚙️</button>
                </div>
                <span className="tag-pill" style={{ background: 'rgba(16, 210, 255, 0.1)', color: 'var(--primary-color)' }}>{autoOptimize ? 'Auto Mode Active' : 'Manual Mode'}</span>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div className="setting-item" style={{ padding: '0.5rem 0', borderBottom: 'none' }}>
                    <div><div style={{ fontWeight: 600 }}>Auto Optimize on Start</div><div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Apply tweaks when game starts</div></div>
                    <div className={`toggle-switch ${autoOptimize ? 'active' : ''}`} onClick={() => setAutoOptimize(!autoOptimize)}></div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button className="btn-primary" style={{ flex: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={runOptimization}><span>⚡</span> Optimize Now</button>
                    <button className="btn-secondary" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0.5rem', fontSize: '0.85rem' }} onClick={revertOptimization} title="Revert services to normal"><span>🔄</span></button>
                  </div>
                </div>
                <div style={{ flex: 1.5, minWidth: '250px', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.8rem', color: 'var(--primary-color)' }}>Optimization Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                    <div><div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Services Optimized</div><div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{optResult ? optResult.services_optimized : '--'}</div></div>
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
