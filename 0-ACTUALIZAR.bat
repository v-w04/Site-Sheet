@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
call _config.bat
title Actualizar desde GitHub

REM ---- Color de marca ----
set "ESC="
for /f %%E in ('echo prompt $E ^| cmd') do set "ESC=%%E"
set "AZUL="
set "VERDE="
set "ROJO="
set "FIN="
if defined ESC set "AZUL=%ESC%[38;2;31;148;249m"
if defined ESC set "VERDE=%ESC%[38;2;63;185;80m"
if defined ESC set "ROJO=%ESC%[38;2;248;81;73m"
if defined ESC set "FIN=%ESC%[0m"

REM Si un git murio a media operacion queda el candado y todo git se niega.
if exist ".git\index.lock" del /f /q ".git\index.lock" >nul 2>&1

echo.
echo   ACTUALIZAR                        bajar de GitHub
echo   %AZUL%----------------------------------------------------%FIN%
echo.
echo   Corre esto ANTES de empezar, sobre todo si usaste
echo   otra computadora la ultima vez.
echo.

call :BUSCARGIT
if errorlevel 1 goto NOGIT

echo   %AZUL%[1/2]%FIN%  Cambios locales sin subir . . . . .
REM Contar sin meter un pipe dentro del for: con git en GitHub Desktop la
REM ruta trae espacios y cmd parte la orden. Con archivo temporal no pasa.
set "TMPST=%TEMP%\sitesheet_status.txt"
"!GIT!" status --porcelain > "!TMPST!" 2>nul
set CAMBIOS=0
for /f %%C in ('find /c /v "" ^< "!TMPST!"') do set CAMBIOS=%%C
del "!TMPST!" >nul 2>&1

if "!CAMBIOS!"=="0" goto SINPENDIENTES
echo          !CAMBIOS! archivo^(s^)
echo.
"!GIT!" status --short
echo.
echo   %ROJO%!  DECIDE ANTES DE SEGUIR%FIN%
echo.
echo      Si bajas ahora, git va a intentar mezclarlos.
echo      Para subirlos primero: cierra esto y corre 5-SUBIR-TODO.bat
echo.
pause
goto BAJAR

:SINPENDIENTES
echo          ninguno

:BAJAR
echo.
echo   %AZUL%[2/2]%FIN%  Bajando de origin . . . . . . . . .
"!GIT!" pull origin %GH_BRANCH%
if errorlevel 1 goto PULLFAIL

echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
echo %VERDE%  Actualizado. Ya puedes trabajar.%FIN%
echo.
call :LOGO
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

:NOGIT
echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
echo   %ROJO%x  NO ENCUENTRO GIT%FIN%
echo.
echo      Instalalo de https://git-scm.com/download/win
echo      o usa GitHub Desktop.
echo.
pause
exit /b 1

:PULLFAIL
echo          fallo
echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
echo   %ROJO%x  NO SE PUDO BAJAR%FIN%
echo.
echo      Si dice "conflict" o "would be overwritten", editaste
echo      el mismo archivo en las dos computadoras.
echo      Abre GitHub Desktop: ahi se resuelve mas facil.
echo.
pause
exit /b 1

:LOGO
REM --- Logo animado ---
REM Va ANTES del pause: se dibuja solo, al terminar el trabajo.
REM Sin cls, para no borrar el reporte que se acaba de leer.
REM Solo en salidas exitosas. Un fallo no se celebra.
where node >nul 2>&1
if errorlevel 1 goto SINLOGO
if not exist "%~dp0logo-animado.js" goto SINLOGO
node "%~dp0logo-animado.js" giro marca 0 12
goto :eof

:SINLOGO
pause
goto :eof
