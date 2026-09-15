@echo off
cd /d "%~dp0"
echo Starting server...
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
echo.
echo powershell.exe has exited. If something went wrong, check the messages above.
pause
