# ARIA — AI Virtual Avatar Assistant
# Windows PowerShell Startup Script
# Run this from the project root: D:\INTERN 1 folder\16.11.2026- Avatar\

Write-Host "Starting ARIA AI Virtual Avatar Assistant..." -ForegroundColor Cyan

$ProjectRoot = $PSScriptRoot

# Start backend
Write-Host "`n[1/2] Starting backend (FastAPI)..." -ForegroundColor Yellow
$backendJob = Start-Process -FilePath "$ProjectRoot\backend\.venv\Scripts\uvicorn.exe" `
  -ArgumentList "main:app --host 127.0.0.1 --port 8000" `
  -WorkingDirectory "$ProjectRoot\backend" `
  -PassThru `
  -WindowStyle Normal

Start-Sleep 2
Write-Host "    Backend started (PID: $($backendJob.Id))" -ForegroundColor Green

# Start frontend
Write-Host "[2/2] Starting frontend (Vite)..." -ForegroundColor Yellow
$frontendJob = Start-Process -FilePath "npm" `
  -ArgumentList "run dev" `
  -WorkingDirectory "$ProjectRoot\frontend" `
  -PassThru `
  -WindowStyle Normal

Start-Sleep 3
Write-Host "    Frontend started (PID: $($frontendJob.Id))" -ForegroundColor Green

Write-Host "`nARIA is running!" -ForegroundColor Cyan
Write-Host "  Frontend : http://localhost:5173" -ForegroundColor White
Write-Host "  Backend  : http://127.0.0.1:8000" -ForegroundColor White
Write-Host "  API Docs : http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host "`nPress Ctrl+C or close this window to stop." -ForegroundColor Gray

# Keep script alive
try {
  Wait-Process -Id $backendJob.Id, $frontendJob.Id
} catch {
  Write-Host "`nStopping servers..." -ForegroundColor Yellow
  Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue
  Stop-Process -Id $frontendJob.Id -Force -ErrorAction SilentlyContinue
}
