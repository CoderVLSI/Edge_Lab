@echo off
title Edge Lab IDE
color 0A
cls

echo.
echo  ███████╗██████╗  ██████╗ ███████╗    ██╗      █████╗ ██████╗
echo  ██╔════╝██╔══██╗██╔════╝ ██╔════╝    ██║     ██╔══██╗██╔══██╗
echo  █████╗  ██║  ██║██║  ███╗█████╗      ██║     ███████║██████╔╝
echo  ██╔══╝  ██║  ██║██║   ██║██╔══╝      ██║     ██╔══██║██╔══██╗
echo  ███████╗██████╔╝╚██████╔╝███████╗    ███████╗██║  ██║██████╔╝
echo  ╚══════╝╚═════╝  ╚═════╝ ╚══════╝    ╚══════╝╚═╝  ╚═╝╚═════╝
echo.
echo  AI-Powered Embedded IDE
echo  ─────────────────────────────────────────────────────────────
echo.

:: ── Check Node.js ──────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] Node.js is not installed.
  echo  Download from: https://nodejs.org  ^(LTS version^)
  pause
  exit /b 1
)

:: ── Check pnpm ──────────────────────────────────────────────────
where pnpm >nul 2>&1
if errorlevel 1 (
  echo  [!] Installing pnpm...
  call npm install -g pnpm
)

:: ── Create .env if missing ──────────────────────────────────────
if not exist ".env" (
  echo  [!] First-time setup: creating config...
  copy ".env.example" ".env" >nul

  :: Auto-generate JWT secret
  powershell -Command "(Get-Content '.env') -replace 'JWT_SECRET=change-me-in-production-use-long-random-string', ('JWT_SECRET=' + [System.Guid]::NewGuid().ToString()) | Set-Content '.env'"

  :: Set projects dir to local folder
  powershell -Command "(Get-Content '.env') -replace 'PROJECTS_DIR=E:/Edge-lab/projects', ('PROJECTS_DIR=' + (Get-Location).Path.Replace('\','/') + '/projects') | Set-Content '.env'"

  echo  [OK] Config ready. You can add API keys inside the app.
  echo.
)

:: ── Create projects dir ─────────────────────────────────────────
if not exist "projects" mkdir projects

:: ── Install deps if needed ──────────────────────────────────────
if not exist "node_modules" (
  echo  [!] First run: installing dependencies ^(takes ~2 min^)...
  echo.
  call pnpm install
  echo.
)

:: ── Start API server ────────────────────────────────────────────
echo  [1/2] Starting API server...
start "Edge Lab API" /min cmd /c "cd /d "%~dp0backend\api" && pnpm dev"

:: Wait for API to be ready
set /a attempts=0
:wait_api
timeout /t 1 /nobreak >nul
set /a attempts+=1
curl -s http://localhost:4000/health >nul 2>&1
if errorlevel 1 (
  if %attempts% lss 30 goto wait_api
  echo  [ERROR] API server failed to start. Check "Edge Lab API" window for errors.
  pause
  exit /b 1
)
echo  [ OK] API ready ^(http://localhost:4000^)

:: ── Start web app ───────────────────────────────────────────────
echo  [2/2] Starting web IDE...
start "Edge Lab Web" /min cmd /c "cd /d "%~dp0apps\web" && pnpm dev"

:: Wait for web app
set /a attempts=0
:wait_web
timeout /t 2 /nobreak >nul
set /a attempts+=1
curl -s http://localhost:3000 >nul 2>&1
if errorlevel 1 (
  if %attempts% lss 45 goto wait_web
  echo  [ERROR] Web IDE failed to start. Check "Edge Lab Web" window for errors.
  pause
  exit /b 1
)
echo  [ OK] IDE ready ^(http://localhost:3000^)

:: ── Open browser ────────────────────────────────────────────────
echo.
echo  ─────────────────────────────────────────────────────────────
echo   Edge Lab is running!
echo.
echo   1. The browser will open now
echo   2. Click the  gear ^(⚙^) icon in the toolbar
echo   3. Paste your Anthropic or OpenAI API key
echo   4. Start chatting with the AI agent!
echo  ─────────────────────────────────────────────────────────────
echo.

start "" "http://localhost:3000/editor/my-esp32-project"

echo  Press any key to stop Edge Lab...
pause >nul

:: ── Cleanup ─────────────────────────────────────────────────────
echo  Stopping services...
taskkill /f /fi "WINDOWTITLE eq Edge Lab API*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq Edge Lab Web*" >nul 2>&1
timeout /t 1 /nobreak >nul
echo  Goodbye!
