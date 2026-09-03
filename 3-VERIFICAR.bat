@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
call _config.bat
title Verificar el entorno

echo.
echo  =======================================================
echo    VERIFICACION
echo  =======================================================
echo.

echo  [1] Node.js
where node >nul 2>&1
if errorlevel 1 (echo      NO instalado) else (node --version)
echo.

echo  [2] clasp
where clasp >nul 2>&1
if errorlevel 1 (echo      NO instalado) else (call clasp --version)
echo.

echo  [3] Sesion de Google
if exist "%USERPROFILE%\.clasprc.json" (
  echo      Sesion iniciada
) else (
  if exist ".clasprc.json" (
    echo      Sesion iniciada - credenciales locales
  ) else (
    echo      NO has iniciado sesion - corre 1-INSTALAR-CLASP.bat
  )
)
echo.

echo  [4] Archivo .clasp.json
if exist ".clasp.json" (type .clasp.json) else (echo      NO existe)
echo.

echo  [5] Archivos del backend
if exist "apps-script" (dir /b apps-script) else (echo      NO existe la carpeta apps-script)
echo.

echo  [6] Archivos del frontend
if exist "docs" (dir /b docs) else (echo      NO existe la carpeta docs)
echo.

echo  [7] URL del Web App en docs\config.js
findstr /C:"PON_AQUI" docs\config.js >nul 2>&1
if not errorlevel 1 (
  echo      FALTA - sigue en placeholder
) else (
  echo      Puesta
)
echo.

echo  [8] git
set "GIT=git"
where git >nul 2>&1
if errorlevel 1 (
  for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
      if exist "%%D\resources\app\git\cmd\git.exe" set "GIT=%%D\resources\app\git\cmd\git.exe"
  )
  if exist "%ProgramFiles%\Git\cmd\git.exe" set "GIT=%ProgramFiles%\Git\cmd\git.exe"
)
if "!GIT!"=="git" (
  where git >nul 2>&1
  if errorlevel 1 (echo      NO encontrado) else ("!GIT!" --version)
) else (
  "!GIT!" --version
)
if exist ".git" (echo      Esta carpeta ya es repositorio) else (echo      Todavia NO es repositorio - ver README)
echo.

echo  [9] Revision de credenciales en el codigo
call _seguro.bat
if errorlevel 1 (
  echo      HAY ALGO SOSPECHOSO - revisa las alertas de arriba
) else (
  echo      Limpio
)
echo.

echo  =======================================================
echo.
pause
