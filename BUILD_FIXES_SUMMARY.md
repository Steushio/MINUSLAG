# Build Fixes Applied

## Issues Fixed

1. **Tauri Command Attribute Error** (src-tauri/src/lib.rs:200)
   - Fixed: Changed `#[tauri::command(rename = "optimize-system", rename_all = "kebab-case")]` 
   - To: `#[tauri::command(rename_all = "snake_case")]`
   - Reason: "kebab-case" is not a valid option for rename_all

2. **Missing Single Instance Permission** (src-tauri/capabilities/default.json)
   - Fixed: Removed `single-instance:default` from capabilities array
   - Reason: The tauri-plugin-single-instance plugin doesn't expose this as a capability permission in Tauri 2.x

3. **Window Visibility** (src-tauri/tauri.conf.json)
   - Fixed: Changed `"visible": false` to `"visible": true`
   - Reason: App was starting hidden (system tray only), making it appear non-functional

4. **WebView2 Runtime Configuration** (src-tauri/tauri.conf.json)
   - Fixed: Added webviewInstallMode under bundle.windows:
     ```json
     "windows": {
       "webviewInstallMode": {
         "type": "downloadBootstrapper",
         "silent": false
       }
     }
     ```
   - Reason: Ensures WebView2 runtime is automatically installed if missing

5. **GPU Acceleration Handling** (src-tauri/src/main.rs)
   - Fixed: Made GPU flags less aggressive and added enable path
   - Changed from: Hard-coded aggressive disable flags
   - To: Conditional flags that enable GPU when not explicitly disabled

## Files Modified
- src-tauri/src/lib.rs (line 200)
- src-tauri/capabilities/default.json (line 13 removed)
- src-tauri/tauri.conf.json (lines 20-21 changed, 35-39 added)
- src-tauri/src/main.rs (lines 36-41 updated)

## Tested Build
The application now builds successfully and produces:
- Portable executable: src-tauri/target/release/minuslag.exe
- MSI installer: src-tauri/target/release/bundle/msi/MINUS LAG_1.0.3_x64_en-US.msi
- EXE installer: src-tauri/target/release/bundle/nsis/MINUS LAG_1.0.3_x64-setup.exe

## Troubleshooting Steps
If you still experience issues:

1. **Black Screen / WebView2 Issues**:
   - Ensure WebView2 Runtime is installed (download from Microsoft)
   - Try launching with `--disable-gpu` flag: `minuslag.exe --disable-gpu`
   - Run as Administrator (required for service optimization)

2. **Application Not Starting**:
   - Check %LOCALAPPDATA%\MINUS LAG\debug_log.txt for errors
   - Delete the config folder to reset settings: %LOCALAPPDATA%\MINUS LAG\
   - Ensure Windows is up to date

3. **Optimization Issues**:
   - Start with minimal services selected in Service Settings
   - Avoid stopping critical services like Windows Update, Print Spooler, etc.
   - The optimization modifies system services - use with caution

## Notes
- The optimization features modify Windows services and timer resolution
- These changes require Administrator privileges
- Some optimizations may affect system functionality if critical services are stopped
- Always create a system restore point before aggressive optimization