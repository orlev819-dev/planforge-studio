# PlanForge Studio - local network web server (Windows PowerShell 5.1+, no installation needed)
# Serves the files in .\www on http://<this-pc>:<port>/ to every device on the local network.
param([int]$Port = 8080)
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'www'))
if (-not (Test-Path (Join-Path $root 'index.html'))) { Write-Host "www\index.html not found in $root" -ForegroundColor Red; exit 1 }

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.svg' = 'image/svg+xml'; '.json' = 'application/json'; '.webmanifest' = 'application/manifest+json'
  '.png' = 'image/png'; '.ico' = 'image/x-icon'; '.txt' = 'text/plain; charset=utf-8'
}

try {
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
  $listener.Start()
} catch {
  Write-Host "Cannot listen on port $Port (already in use?). Try: start-server.bat 8090" -ForegroundColor Red
  exit 1
}

$ips = @()
try { $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -ExpandProperty IPAddress }
catch { $ips = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | Where-Object { $_.AddressFamily -eq 'InterNetwork' -and -not $_.ToString().StartsWith('127.') } | ForEach-Object { $_.ToString() } }

Write-Host ''
Write-Host '  PlanForge Studio server is running' -ForegroundColor Green
Write-Host "  This PC:            http://localhost:$Port   (Bluetooth laser works here)"
foreach ($ip in $ips) { Write-Host "  Other devices (LAN): http://${ip}:$Port" -ForegroundColor Cyan }
Write-Host '  Keep this window open. Close it (or Ctrl+C) to stop the server.'
Write-Host ''

function Send-Response($stream, [int]$code, [string]$status, [string]$type, [byte[]]$body, [bool]$head) {
  $hdr = "HTTP/1.1 $code $status`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nCache-Control: no-cache`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
  $h = [System.Text.Encoding]::ASCII.GetBytes($hdr)
  $stream.Write($h, 0, $h.Length)
  if (-not $head -and $body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 5000
    $client.SendTimeout = 30000
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 8192, $true)
    $line = $reader.ReadLine()
    if (-not $line) { continue }
    while ($true) { $h = $reader.ReadLine(); if ($h -eq $null -or $h -eq '') { break } }
    $parts = $line.Split(' ')
    $method = $parts[0]
    $head = ($method -eq 'HEAD')
    if ($method -ne 'GET' -and -not $head) { Send-Response $stream 405 'Method Not Allowed' 'text/plain' ([System.Text.Encoding]::ASCII.GetBytes('405')) $false; continue }
    $path = [System.Uri]::UnescapeDataString(($parts[1].Split('?')[0]))
    if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
    $full = [System.IO.Path]::GetFullPath((Join-Path $root ($path.TrimStart('/').Replace('/', '\'))))
    if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { Send-Response $stream 403 'Forbidden' 'text/plain' ([System.Text.Encoding]::ASCII.GetBytes('403')) $head; continue }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
      if ([System.IO.Path]::GetExtension($full) -eq '') { $full = Join-Path $root 'index.html' }
      else { Send-Response $stream 404 'Not Found' 'text/plain' ([System.Text.Encoding]::ASCII.GetBytes('404')) $head; continue }
    }
    $ext = [System.IO.Path]::GetExtension($full).ToLower()
    $type = $mime[$ext]; if (-not $type) { $type = 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($full)
    Send-Response $stream 200 'OK' $type $bytes $head
    Write-Host ("{0}  {1}  {2}" -f (Get-Date -Format 'HH:mm:ss'), $client.Client.RemoteEndPoint.Address, $path) -ForegroundColor DarkGray
  } catch {
    # client disconnected or timed out: ignore and keep serving
  } finally {
    $client.Close()
  }
}
