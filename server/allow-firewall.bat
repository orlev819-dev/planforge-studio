@echo off
rem Run as administrator once: allows other devices on PRIVATE networks to reach port 8080.
net session >nul 2>&1
if errorlevel 1 (
  echo Please right-click this file and choose "Run as administrator".
  pause
  exit /b 1
)
netsh advfirewall firewall delete rule name="PlanForge Studio 8080" >nul 2>&1
netsh advfirewall firewall add rule name="PlanForge Studio 8080" dir=in action=allow protocol=TCP localport=8080 profile=private
echo.
echo Done. If your network is set to "Public" in Windows, switch it to "Private" (Settings ^> Network ^> properties).
pause
