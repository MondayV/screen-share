@echo off
echo Starting two PC-Connect instances for local testing...
echo.
echo Instance 1 will start now. Use it to start sharing (Host).
echo Instance 2 will start after you close this window. Use it to join (Participant).
echo.
start "" npx electron-vite dev
timeout /t 3 >nul
start "" npx electron-vite dev
echo Both instances started!
