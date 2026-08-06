@echo off
setlocal

where pnpm.cmd >nul 2>nul
if errorlevel 1 (
  echo pnpm was not found on PATH.
  echo Install it with: npm install --global pnpm@10.32.1
  pause
  exit /b 1
)

start "Company Portal API" /D "%~dp0" cmd /k "pnpm.cmd dev:api"
start "Company Portal Web" /D "%~dp0" cmd /k "pnpm.cmd dev:web"

echo Company Portal localhost is starting...
echo.
echo API: http://localhost:4000
echo Web: http://localhost:5180/
echo.
echo Keep the two opened terminal windows running.
pause
