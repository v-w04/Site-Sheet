@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
call _config.bat
title Subir a GitHub

echo.
echo  =======================================================
echo    SUBIENDO A GITHUB
echo  =======================================================
echo.

echo  [0/5] Revisando que no haya credenciales en el codigo...
call _seguro.bat
if errorlevel 1 goto FUGADETECTADA
echo        Limpio.
echo.

call :BUSCARGIT
if errorlevel 1 goto NOGIT

echo  [1/5] Estado del repositorio
if not exist ".git" goto NOTREPO
"!GIT!" status --short
REM El repo local existe, pero eso no basta: para hacer push tiene que
REM haber un remoto. Sin esto el push truena con un mensaje ilegible.
"!GIT!" remote get-url origin >nul 2>&1
if errorlevel 1 goto NOORIGIN
echo.

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
    echo  No hay cambios que subir. Todo esta al dia.
    echo.
    pause
    exit /b 0
)

echo  [2/5] Archivos con cambios: !CAMBIOS!
echo.
set "MSG="
set /p "MSG=  Mensaje del commit [Enter para uno automatico]: "
if "!MSG!"=="" set "MSG=%MSG_DEFAULT%"
echo.

echo  [3/5] Agregando archivos
"!GIT!" add -A
if errorlevel 1 goto FAIL

echo  [4/5] Creando commit
"!GIT!" commit -m "!MSG!"
if errorlevel 1 goto FAIL

echo  [5/5] Subiendo a origin
"!GIT!" push origin %GH_BRANCH%
if errorlevel 1 goto PUSHFAIL

echo.
echo  =======================================================
echo    SUBIDO A GITHUB
echo  =======================================================
echo.
echo  Repo:      https://github.com/%GH_USER%/%GH_REPO%
echo  Dashboard: https://%GH_USER%.github.io/%GH_REPO%/
echo.
echo  GitHub Pages tarda 1-2 minutos en publicar.
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
echo  No se hizo commit de nada.
echo.
echo  En este proyecto ninguna credencial deberia vivir en un
echo  archivo: la cookie del sitio y el password del dashboard
echo  se capturan desde el menu del Sheet y quedan en
echo  PropertiesService de Google.
echo.
echo  Quita el valor del codigo y vuelve a correr esto.
echo.
echo  Si el valor YA se subio antes, borrarlo ahora no lo saca
echo  del historial: hay que rotar la credencial. Osea, sacar
echo  una cookie nueva del sitio.
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
echo  ERROR: No encuentro git.
echo  Instalalo de https://git-scm.com/download/win o usa GitHub Desktop.
echo.
pause
exit /b 1

:NOTREPO
echo  Esta carpeta todavia no es un repositorio de git.
echo.
echo  Abre GitHub Desktop:
echo    File - Add local repository - elige esta carpeta
echo    Te va a ofrecer crear el repositorio aqui: acepta
echo    Luego Publish repository
echo.
echo  Marca o desmarca "Keep this code private" segun quieras.
echo  El codigo no trae credenciales, pero eso lo decides tu.
echo.
pause
exit /b 1

:PUSHFAIL
echo.
echo  ERROR: fallo el push.
echo.
echo  - "Authentication failed"
echo      Abre GitHub Desktop una vez para renovar la sesion
echo  - "rejected - non-fast-forward"
echo      Alguien subio cambios. Corre 0-ACTUALIZAR.bat primero
echo  - "src refspec main does not match any"
echo      Tu rama quiza se llama master. Cambialo en _config.bat
echo.
pause
exit /b 1

:FAIL
echo.
echo  ERROR: revisa el mensaje de arriba.
echo.
pause
exit /b 1
