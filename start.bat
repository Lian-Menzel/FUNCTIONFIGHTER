@echo off
rem ============================================================
rem  FUNCTION FIGHTER - Multiplayer-Server starten
rem  Doppelklick genuegt. Es wird nur Python gebraucht,
rem  keine weiteren Bibliotheken.
rem ============================================================
chcp 65001 >nul
title Function Fighter - Server
cd /d "%~dp0"

set "PY="
py -3 --version >nul 2>&1 && set "PY=py -3"
if not defined PY (
  python --version >nul 2>&1 && set "PY=python"
)
if not defined PY (
  python3 --version >nul 2>&1 && set "PY=python3"
)

if not defined PY (
  echo.
  echo  Python wurde auf diesem PC nicht gefunden.
  echo.
  echo  So installierst du es ^(einmalig^):
  echo    1. https://www.python.org/downloads/ oeffnen und Python herunterladen
  echo    2. Beim Installieren den Haken bei "Add python.exe to PATH" setzen
  echo    3. Danach start.bat noch einmal doppelklicken
  echo.
  echo  Oder in einer Eingabeaufforderung:  winget install Python.Python.3.12
  echo.
  pause
  exit /b 1
)

%PY% server.py
echo.
echo  Der Server wurde beendet.
pause
