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

if exist ".git\index.lock" del /f /q ".git\index.lock" >nul 2>&1

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
call clasp push --force
if errorlevel 1 goto PUSHFAIL
echo          ok

echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
if "!PUBLICAR!"=="?" goto VER_NOSE
if defined PUBLICAR goto VER_SI
echo %VERDE%  No hace falta publicar version: lo que cambio no lo corre el Web App.%FIN%
goto VER_FIN

:VER_SI
echo   %ROJO%!  TIENES QUE PUBLICAR VERSION NUEVA%FIN%
echo.
echo      Cambiaste codigo que SI corre la URL del dashboard.
echo      En el editor de Apps Script:
echo.
echo        Implementar ^> Administrar implementaciones
echo        icono de lapiz ^> Version: Nueva version ^> Implementar
echo.
echo      "Nueva implementacion" NO sirve: genera otra URL y deja
echo      la anterior huerfana. Siempre editar la que ya existe.
goto VER_FIN

:VER_NOSE
echo   No pude revisar que archivos cambiaron ^(no hay git^).
echo   Regla: publica version solo si tocaste WebAPI.gs, Auth.gs,
echo   Login.gs, Config.gs, Api.gs, Stock.gs, Precios.gs o Log.gs.

:VER_FIN
echo.
echo %VERDE%  Codigo actualizado en Apps Script.%FIN%
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
echo.
echo      Corre primero 1-INSTALAR-CLASP.bat
echo.
pause
exit /b 1

:NOSCRIPTID
echo   %ROJO%x  EL scriptId SIGUE EN PLACEHOLDER%FIN%
echo.
echo      Abre .clasp.json con el Bloc de notas y pon el ID
echo      de tu proyecto. Sale de la URL del editor, entre
echo      /projects/ y /edit
echo.
pause
exit /b 1

:PUSHFAIL
echo          fallo
echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
echo   %ROJO%x  FALLO EL PUSH A APPS SCRIPT%FIN%
echo.
echo      "User has not enabled the Apps Script API"
echo         script.google.com/home/usersettings, prende el switch
echo.
echo      "Invalid credentials" o "not logged in"
echo         vuelve a correr 1-INSTALAR-CLASP.bat
echo.
echo      "script not found" o "Requested entity was not found"
echo         revisa el scriptId en .clasp.json, y que hayas
echo         entrado con la cuenta duena del proyecto
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
