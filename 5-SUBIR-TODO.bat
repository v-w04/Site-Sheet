@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
call _config.bat
title Subir todo - Apps Script + GitHub

echo.
echo  =======================================================
echo    SUBIR TODO
echo    Apps Script  +  GitHub
echo  =======================================================
echo.

echo  Revisando que no haya credenciales en el codigo...
call _seguro.bat
if errorlevel 1 goto FUGADETECTADA
echo  Limpio.
echo.

REM ================= PARTE 1: APPS SCRIPT =================
echo  ###  PARTE 1 de 2 - APPS SCRIPT  ###
echo.

if not exist ".clasp.json" (
    echo  Saltando: no hay .clasp.json
    goto GITPART
)

call clasp push --force
if errorlevel 1 (
    echo.
    echo  ADVERTENCIA: fallo el push a Apps Script.
    echo  Continuo con GitHub de todos modos.
    echo.
    pause
) else (
    echo.
    echo  Apps Script actualizado.
)
echo.

REM ================= PARTE 2: GITHUB =================
:GITPART
echo  ###  PARTE 2 de 2 - GITHUB  ###
echo.

call :BUSCARGIT
if errorlevel 1 goto NOGIT
if not exist ".git" goto NOTREPO

for /f %%C in ('"!GIT!" status --porcelain 2^>nul ^| find /c /v ""') do set CAMBIOS=%%C
if "!CAMBIOS!"=="0" (
    echo  No hay cambios para GitHub.
    goto FIN
)

echo  Archivos con cambios: !CAMBIOS!
"!GIT!" status --short
echo.

set "MSG="
set /p "MSG=  Mensaje del commit [Enter para uno automatico]: "
if "!MSG!"=="" set "MSG=%MSG_DEFAULT%"
echo.

"!GIT!" add -A
"!GIT!" commit -m "!MSG!"
"!GIT!" push origin %GH_BRANCH%
if errorlevel 1 (
    echo.
    echo  ERROR en el push a GitHub. Revisa el mensaje de arriba.
    echo  Si dice Authentication failed, abre GitHub Desktop una vez.
    echo.
    pause
    exit /b 1
)

:FIN
echo.
echo  =======================================================
echo    TODO LISTO
echo  =======================================================
echo.
echo  Apps Script: codigo actualizado
echo  Repo:        https://github.com/%GH_USER%/%GH_REPO%
echo  Dashboard:   https://%GH_USER%.github.io/%GH_REPO%/
echo.
echo  RECORDATORIO: si cambiaste el backend y quieres que la URL
echo  del dashboard lo use, publica una version nueva:
echo  Implementar - Administrar implementaciones - lapiz -
echo  Version: Nueva version - Implementar
echo.
pause
exit /b 0

:BUSCARGIT
set "GIT=git"
where git >nul 2>&1
if not errorlevel 1 exit /b 0
for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
    if exist "%%D\resources\app\git\cmd\git.exe" set "GIT=%%D\resources\app\git\cmd\git.exe"
)
if exist "%ProgramFiles%\Git\cmd\git.exe" set "GIT=%ProgramFiles%\Git\cmd\git.exe"
if "!GIT!"=="git" exit /b 1
exit /b 0

:FUGADETECTADA
echo.
echo  =======================================================
echo    DETENIDO - POSIBLE CREDENCIAL EN EL CODIGO
echo  =======================================================
echo.
echo  No se subio nada, ni a Apps Script ni a GitHub.
echo.
echo  La cookie y el password se capturan desde el menu del
echo  Sheet y viven en PropertiesService. No tienen por que
echo  estar en un archivo.
echo.
pause
exit /b 1

:NOGIT
echo  ERROR: no encuentro git. Usa GitHub Desktop para esta parte.
echo.
pause
exit /b 1

:NOTREPO
echo  Esta carpeta todavia no es repositorio de git.
echo  Abre GitHub Desktop - File - Add local repository - esta carpeta.
echo.
pause
exit /b 1
