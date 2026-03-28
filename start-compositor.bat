@echo off
cd /d "%~dp0"
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul
start /B node dist/server/server/index.js
timeout /t 3 /nobreak >nul
start http://localhost:3000/painel
