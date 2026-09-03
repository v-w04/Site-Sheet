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
REM El repo local existe, pero eso no basta: para hacer push tiene que
REM haber un remoto. Sin esto el push truena con un mensaje ilegible.
"!GIT!" remote get-url origin >nul 2>&1
if errorlevel 1 goto NOORIGIN

REM Contar cambios sin meter un pipe dentro del for.
REM Cuando git vive en GitHub Desktop la ruta trae espacios, y cmd se come
REM la comilla del inicio y la del final de la linea del for: la orden queda
REM partida y truena con "el nombre de archivo... no son correctos".
REM Con archivo temporal no hay comillas que romper.
set "TMPST=%TEMP%\sitesheet_status.txt"
"!GIT!" status --porcelain > "!TMPST!" 2>nul
set CAMBIOS=0
for /f %%C in ('find /c /v "" ^< "!TMPST!"') do set CAMBIOS=%%C
del "!TMPST!" >nul 2>&1
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

:NOORIGIN
echo.
echo  =======================================================
echo    FALTA PUBLICAR EL REPO EN GITHUB
echo  =======================================================
echo.
echo  Esta carpeta YA es repositorio de git, pero todavia no
echo  apunta a ningun repo en GitHub, asi que no hay a donde subir.
echo.
echo  Hazlo una sola vez con GitHub Desktop:
echo.
echo    1. File - Add local repository
echo    2. Elige esta carpeta
echo    3. Publish repository
echo.
echo  Ahi decides si lo dejas privado o publico. El codigo no trae
echo  credenciales, pero esa decision es tuya.
echo.
echo  Despues pon tu usuario y el nombre del repo en _config.bat
echo  y vuelve a correr esto.
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
