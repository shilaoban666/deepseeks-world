@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PORT=5383"
set "URL=http://127.0.0.1:%PORT%/town.html?quality=high"
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"

rem 服务器没在跑就先起一个（最小化的窗口，关掉它不影响游戏也能继续玩，只是刷新会 404）
powershell -NoProfile -Command "if (Test-NetConnection -ComputerName 127.0.0.1 -Port %PORT% -InformationLevel Quiet -WarningAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo 正在启动本地服务器 http://127.0.0.1:%PORT%/ ...
  start "deepseek-world-server" /min cmd /c "npm run serve"
  timeout /t 4 >nul
)

echo 用独立显卡打开小鲸鱼的世界 ...
start "" "%CHROME%" --force_high_performance_gpu --enable-gpu-rasterization --ignore-gpu-blocklist --use-angle=d3d11 --enable-zero-copy --window-size=1720,1020 "%URL%"
exit /b 0
