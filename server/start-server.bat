@echo off
rem PlanForge Studio - start the local network server (default port 8080; usage: start-server.bat [port])
cd /d "%~dp0"
set PORT=%1
if "%PORT%"=="" set PORT=8080
title PlanForge Studio server :%PORT%
start "" "http://localhost:%PORT%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port %PORT%
pause
