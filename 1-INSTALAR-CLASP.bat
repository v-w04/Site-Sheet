@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
call _config.bat
title Instalar clasp

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

echo.
echo   INSTALAR CLASP                    una sola vez
echo   %AZUL%----------------------------------------------------%FIN%
echo.

echo   %AZUL%[1/3]%FIN%  Node.js . . . . . . . . . . . . . .
where node >nul 2>&1
if errorlevel 1 goto NONODE
for /f "delims=" %%V in ('node --version') do echo          %%V
echo.

echo   %AZUL%[2/3]%FIN%  Instalando clasp . . . . . . . . .
call npm install -g @google/clasp
if errorlevel 1 goto NPMFAIL
echo          ok
echo.

echo   %AZUL%[3/3]%FIN%  Autorizar tu cuenta de Google . . .
echo.
echo          Se abre el navegador. Entra con la MISMA cuenta
echo          donde vive el Apps Script.
echo.
pause
call clasp login

echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
echo   %ROJO%^^!  FALTA UNA COSA, TAMBIEN UNA SOLA VEZ%FIN%
echo.
echo      Entra a https://script.google.com/home/usersettings
echo      y prende el switch "Google Apps Script API".
echo.
echo   El scriptId ya esta puesto en .clasp.json
echo.
echo %VERDE%  clasp instalado. Despues usa 2-SUBIR-A-APPSCRIPT.bat%FIN%
echo.
call :LOGO
exit /b 0

:NONODE
echo          no instalado
echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
echo   %ROJO%x  NO TIENES NODE.JS%FIN%
echo.
echo      Descargalo de https://nodejs.org
echo      Elige la version LTS y dale siguiente-siguiente.
echo      Cuando termine, vuelve a correr este archivo.
echo.
pause
exit /b 1

:NPMFAIL
echo          fallo
echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
echo   %ROJO%x  NO SE PUDO INSTALAR CLASP%FIN%
echo.
echo      Click derecho en este archivo y elige
echo      "Ejecutar como administrador".
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
