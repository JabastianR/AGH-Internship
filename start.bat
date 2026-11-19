@echo off
title ARIA - AI Virtual Avatar Assistant
echo.
echo  Starting ARIA AI Virtual Avatar Assistant...
echo.

set "ROOT=%~dp0"

:: Start backend in a new window
echo [1/2] Starting backend...
start "ARIA Backend" /D "%ROOT%backend" "%ROOT%backend\.venv\Scripts\uvicorn.exe" main:app --host 127.0.0.1 --port 8000

timeout /t 2 /nobreak >nul

:: Start frontend in a new window
echo [2/2] Starting frontend...
start "ARIA Frontend" /D "%ROOT%frontend" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo  ARIA is running!
echo   Frontend : http://localhost:5173
echo   Backend  : http://127.0.0.1:8000
echo   API Docs : http://127.0.0.1:8000/docs
echo.
echo  Open http://localhost:5173 in your browser.
echo  Close the backend and frontend windows to stop.
echo.
pause
