# Force Run as Administrator via Registry Compatibility Layer
$exePath = "C:\Program Files\MINUS LAG\minus-lag.exe"
$regPath = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers"

if (-not (Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
}
try {
    # The "~ RUNASADMIN" value tells Windows to always prompt for Admin for this EXE
    Set-ItemProperty -Path $regPath -Name $exePath -Value "~ RUNASADMIN" -ErrorAction Stop
    Write-Host "[+] Registry configured: 'Run as Administrator' flag set."
} catch {
    Write-Error "Failed to set registry key: $_"
}

# Create UAC Bypass via Scheduled Task
$taskName = "StartMinusLag"
try {
    # Remove existing task if any
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

    $user = $env:USERNAME
    $action = New-ScheduledTaskAction -Execute $exePath
    # We don't necessarily need a trigger (it's run manually), but AtLogon is optional user preference.
    # Leaving triggers empty so it's only manual.
    
    # Run with Highest Privileges (Admin) but as the interactive user
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0
    
    Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings | Out-Null
    Write-Host "[+] Scheduled Task '$taskName' created with Highest Privileges."

    # Create Desktop Shortcut
    $WshShell = New-Object -comObject WScript.Shell
    $shortcutPath = "$env:USERPROFILE\Desktop\Launch MINUS LAG.lnk"
    $Shortcut = $WshShell.CreateShortcut($shortcutPath)
    $Shortcut.TargetPath = "C:\Windows\System32\schtasks.exe"
    $Shortcut.Arguments = "/run /tn `"$taskName`""
    $Shortcut.IconLocation = "$exePath,0"
    $Shortcut.Description = "Launch MINUS LAG with Admin privileges (No UAC Prompt)"
    $Shortcut.Save()
    Write-Host "[+] Shortcut created on Desktop: $shortcutPath"
    
} catch {
    Write-Error "Failed to create scheduled task or shortcut: $_"
}
