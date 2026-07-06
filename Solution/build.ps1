Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
dotnet build --configuration Release
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed, aborting import." -ForegroundColor Red; exit 1 }
pac solution import --path bin\Release\Solution.zip --publish-changes