@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python 3 chua duoc cai hoac chua nam trong PATH.
  echo Cai Python 3.10+ va chon Add Python to PATH.
  pause
  exit /b 1
)
echo Dang mo Song - Wi-Fi Studio tai http://127.0.0.1:8765
echo Giu cua so nay mo khi su dung. Nhan Ctrl+C de dung dich vu.
python launcher.py
pause
