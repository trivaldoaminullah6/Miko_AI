@echo off
taskkill /F /IM electron.exe >nul 2>&1
cd /d "C:\Users\MyBook Hype AMD\AI_Destop\assistant-pet"
if not exist "node_modules\@xterm\xterm" (
  call npm install --no-audit --no-fund
)
start "" ".\node_modules\electron\dist\electron.exe" . --no-sandbox --disable-gpu
