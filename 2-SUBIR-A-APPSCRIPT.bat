@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
call _config.bat
title Subir a Apps Script

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

REM Un git que murio a media operacion deja candados y TODO git se niega.
REM No basta index.lock: HEAD.lock tumba el commit y deja pasar el resto.
del /f /q ".git\index.lock" ".git\HEAD.lock" ".git\config.lock" >nul 2>&1
del /f /q ".git\objects\maintenance.lock" >nul 2>&1
del /f /q ".git\refs\heads\*.lock" >nul 2>&1

echo.
echo   SUBIR A APPS SCRIPT               solo el backend
echo   %AZUL%----------------------------------------------------%FIN%
echo.

if not exist ".clasp.json" goto NOCONFIG
findstr /C:"PON_AQUI" .clasp.json >nul 2>&1
if not errorlevel 1 goto NOSCRIPTID

REM Se revisa ANTES del push: despues del commit el status sale vacio.
call :BUSCARGIT
if errorlevel 1 set "PUBLICAR=?"
if not "!PUBLICAR!"=="?" call :REVISARVERSION

echo   %AZUL%[1/2]%FIN%  Archivos del backend . . . . . . .
set ARCHIVOS=0
for %%F in (apps-script\*.gs) do set /a ARCHIVOS+=1
echo          !ARCHIVOS! archivos .gs
echo.

echo   %AZUL%[2/2]%FIN%  Subiendo con clasp . . . . . . . .
REM clasp push --force con la carpeta vacia BORRA el proyecto.
if not exist "apps-script\appsscript.json" goto SINBACKEND
call clasp push --force >nul 2>"%TEMP%\ss_e.txt"
if errorlevel 1 goto PUSHFAIL
echo          ok

echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
if "!PUBLICAR!"=="?" goto VER_NOSE
if defined PUBLICAR goto VER_SI
echo %VERDE%  Codigo actualizado en Apps Script.%FIN%
goto VER_FIN

:VER_SI
echo   %ROJO%^^!  FALTA PUBLICAR VERSION%FIN%
goto VER_FIN

:VER_NOSE
echo   %ROJO%^^!  NO SE SI FALTA PUBLICAR VERSION%FIN%

:VER_FIN
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

:REVISARVERSION
REM Decide SOLA si hay que publicar version nueva del Web App, en vez de
REM soltar un "si cambiaste el backend..." que obligue a investigar.
REM Estos son los archivos que la URL del dashboard ejecuta. Los demas
REM (menu del Sheet y triggers) no pasan por el Web App.
set "PUBLICAR="
set "TMPV=%TEMP%\sitesheet_ver.txt"
"!GIT!" status --porcelain > "!TMPV!" 2>nul
if not exist "!TMPV!" goto NOSEVERSION
for %%A in (WebAPI.gs Auth.gs Login.gs Config.gs Api.gs Stock.gs Precios.gs Log.gs) do (
    findstr /I /C:"apps-script/%%A" "!TMPV!" >nul 2>&1 && set "PUBLICAR=1"
)
del "!TMPV!" >nul 2>&1
exit /b 0

:NOSEVERSION
set "PUBLICAR=?"
exit /b 0

:NOCONFIG
echo   %ROJO%x  NO ENCUENTRO .clasp.json%FIN%
echo      Corre primero 1-INSTALAR-CLASP.bat
echo.
pause
exit /b 1

:NOSCRIPTID
echo   %ROJO%x  EL scriptId SIGUE EN PLACEHOLDER%FIN%
echo      Ponlo en .clasp.json: sale de la URL del editor, entre /projects/ y /edit
echo.
pause
exit /b 1

:SINBACKEND
echo.
echo   %ROJO%x  apps-script VACIA - no se subio nada%FIN%
echo.
pause
exit /b 1

:PUSHFAIL
echo          fallo
echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
type "%TEMP%\ss_e.txt"
echo.
echo   %ROJO%x  FALLO EL PUSH A APPS SCRIPT%FIN%
echo      API apagada o sesion caducada: 1-INSTALAR-CLASP.bat
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
