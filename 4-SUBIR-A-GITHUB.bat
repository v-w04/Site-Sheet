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
echo.

for /f %%C in ('"!GIT!" status --porcelain 2^>nul ^| find /c /v ""') do set CAMBIOS=%%C
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
