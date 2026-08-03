Write-Output "Initiating Build Sequence"

dotnet build-server shutdown
if (Test-Path obj) { Remove-Item -Recurse -Force obj }
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

dotnet build --configuration Release
if ($LASTEXITCODE -ne 0) {
    Write-Host "First build failed (likely file lock), retrying..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    dotnet build --configuration Release
    if ($LASTEXITCODE -ne 0) { Write-Host "Build failed, aborting import." -ForegroundColor Red; exit 1 }
}

pac solution import --path bin\Release\Solution.zip --publish-changes
if ($LASTEXITCODE -ne 0) { Write-Host "Import failed." -ForegroundColor Red; exit 1 }

Write-Host "Build and import complete." -ForegroundColor Green
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
[System.Windows.Forms.MessageBox]::Show($owner, "Your build is done!", "Notification") | Out-Null
$owner.Dispose()