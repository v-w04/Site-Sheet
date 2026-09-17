@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
call _config.bat
title Subir todo - Apps Script + GitHub

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
echo   SUBIR TODO                  Apps Script y GitHub
echo   %AZUL%----------------------------------------------------%FIN%
echo.

echo   %AZUL%[1/4]%FIN%  Credenciales en el codigo . . . . .
call _seguro.bat
if errorlevel 1 goto FUGADETECTADA
echo          limpio
echo.

REM Se revisa ANTES de tocar nada: despues del commit el status sale vacio.
call :BUSCARGIT
if errorlevel 1 set "PUBLICAR=?"
if not "!PUBLICAR!"=="?" call :REVISARVERSION

echo   %AZUL%[2/4]%FIN%  Subiendo a Apps Script . . . . . .
set "APPSOK="
if not exist ".clasp.json" goto SINCLASP
call clasp push --force
if errorlevel 1 goto CLASPFALLO
set "APPSOK=1"
echo          ok
goto GITPART

:SINCLASP
echo          saltado ^(no hay .clasp.json^)
goto GITPART

:CLASPFALLO
echo          %ROJO%fallo - sigo con GitHub%FIN%

:GITPART
echo.
call :BUSCARGIT
if errorlevel 1 goto NOGIT
if not exist ".git" goto NOTREPO
"!GIT!" remote get-url origin >nul 2>&1
if errorlevel 1 goto NOORIGIN

echo   %AZUL%[3/4]%FIN%  Cambios por subir . . . . . . . . .
set "TMPST=%TEMP%\sitesheet_status.txt"
"!GIT!" status --porcelain > "!TMPST!" 2>nul
set CAMBIOS=0
for /f %%C in ('find /c /v "" ^< "!TMPST!"') do set CAMBIOS=%%C
del "!TMPST!" >nul 2>&1
if "!CAMBIOS!"=="0" goto SINCAMBIOS
echo          !CAMBIOS! archivo^(s^)
echo.
"!GIT!" status --short
echo.

set "MSG="
set /p "MSG=  Mensaje del commit [Enter para uno automatico]: "
if "!MSG!"=="" set "MSG=%MSG_DEFAULT%"
echo.

echo   %AZUL%[4/4]%FIN%  Commit y push . . . . . . . . . . .
"!GIT!" add -A
if errorlevel 1 goto FAIL
"!GIT!" commit -m "!MSG!"
if errorlevel 1 goto FAIL
"!GIT!" push origin %GH_BRANCH%
if errorlevel 1 goto PUSHFAIL
echo          ok
goto RESUMEN

:SINCAMBIOS
echo          ninguno
echo   %AZUL%[4/4]%FIN%  Commit y push . . . . . . . . . . .
echo          nada que subir

:RESUMEN
echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
if defined APPSOK echo   Apps Script   codigo actualizado
if not defined APPSOK echo   Apps Script   %ROJO%no se subio%FIN%
echo   Repo          https://github.com/%GH_USER%/%GH_REPO%
echo   Dashboard     https://%GH_USER%.github.io/%GH_REPO%/
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
echo %VERDE%  Listo.%FIN%
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

:FUGADETECTADA
echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
echo   %ROJO%x  DETENIDO - POSIBLE CREDENCIAL EN EL CODIGO%FIN%
echo.
echo      No se hizo commit de nada.
echo.
echo      En este proyecto ninguna credencial deberia vivir en un
echo      archivo: la cookie del sitio y el password del dashboard
echo      se capturan desde el menu del Sheet y quedan en
echo      PropertiesService de Google.
echo.
echo      Quita el valor del codigo y vuelve a correr esto.
echo.
echo      Si el valor YA se subio antes, borrarlo ahora no lo saca
echo      del historial: hay que rotar la credencial.
echo.
pause
exit /b 1

:NOORIGIN
echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
echo   %ROJO%!  FALTA PUBLICAR EL REPO EN GITHUB%FIN%
echo.
echo      Esta carpeta YA es repositorio de git, pero no apunta
echo      a ningun repo en GitHub, asi que no hay a donde subir.
echo.
echo      Con GitHub Desktop, una sola vez:
echo        1. File ^> Add local repository
echo        2. Elige esta carpeta
echo        3. Publish repository
echo.
echo      Despues pon tu usuario y el repo en _config.bat
echo.
pause
exit /b 1

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

:NOTREPO
echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
echo   %ROJO%!  ESTA CARPETA NO ES REPOSITORIO DE GIT%FIN%
echo.
echo      Abre GitHub Desktop:
echo        File ^> Add local repository ^> elige esta carpeta
echo        Acepta crear el repositorio aqui
echo        Luego Publish repository
echo.
pause
exit /b 1

:PUSHFAIL
echo          fallo
echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
echo   %ROJO%x  FALLO EL PUSH A GITHUB%FIN%
echo.
echo      "Authentication failed"
echo         abre GitHub Desktop una vez para renovar la sesion
echo      "rejected - non-fast-forward"
echo         alguien subio cambios: corre 0-ACTUALIZAR.bat primero
echo      "src refspec main does not match any"
echo         tu rama quiza se llama master: cambialo en _config.bat
echo.
pause
exit /b 1

:FAIL
echo          fallo
echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
echo   %ROJO%x  ALGO SALIO MAL EN GIT%FIN%
echo.
echo      Revisa el mensaje de arriba.
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
