# Vista previa SysDash en Windows (PowerShell)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not $env:DASHBOARD_TOKEN) {
  $env:DASHBOARD_TOKEN = "cambiar-en-produccion"
  Write-Host "Usando DASHBOARD_TOKEN por defecto. Define otro: `$env:DASHBOARD_TOKEN='tu_token'" -ForegroundColor Yellow
}
Set-Location backend
Write-Host "SysDash: http://127.0.0.1:8001  (token: $($env:DASHBOARD_TOKEN))" -ForegroundColor Cyan
python app.py
