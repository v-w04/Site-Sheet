@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
call _config.bat
title Verificar el entorno

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
echo   VERIFICAR                         nada se modifica
echo   %AZUL%----------------------------------------------------%FIN%
echo.

set FALTA=0

echo   Node.js
where node >nul 2>&1
if errorlevel 1 goto V_NONODE
for /f "delims=" %%V in ('node --version') do echo      %%V
goto V_CLASP
:V_NONODE
echo      %ROJO%no instalado%FIN%
set FALTA=1

:V_CLASP
echo   clasp
where clasp >nul 2>&1
if errorlevel 1 goto V_NOCLASP
for /f "delims=" %%V in ('clasp --version 2^>nul') do echo      %%V
goto V_SESION
:V_NOCLASP
echo      %ROJO%no instalado%FIN%
set FALTA=1

:V_SESION
echo   Sesion de Google
if exist "%USERPROFILE%\.clasprc.json" goto V_SESOK
if exist ".clasprc.json" goto V_SESLOCAL
echo      %ROJO%sin iniciar - corre 1-INSTALAR-CLASP.bat%FIN%
set FALTA=1
goto V_CLASPJSON
:V_SESLOCAL
echo      iniciada ^(credenciales locales^)
goto V_CLASPJSON
:V_SESOK
echo      iniciada

:V_CLASPJSON
echo   .clasp.json
if not exist ".clasp.json" goto V_NOCJ
findstr /C:"PON_AQUI" .clasp.json >nul 2>&1
if not errorlevel 1 goto V_CJPLACE
echo      con scriptId
goto V_BACK
:V_CJPLACE
echo      %ROJO%sigue en placeholder%FIN%
set FALTA=1
goto V_BACK
:V_NOCJ
echo      %ROJO%no existe%FIN%
set FALTA=1

:V_BACK
echo   Backend
if not exist "apps-script" goto V_NOBACK
set ARCHIVOS=0
for %%F in (apps-script\*.gs) do set /a ARCHIVOS+=1
echo      !ARCHIVOS! archivos .gs
goto V_FRONT
:V_NOBACK
echo      %ROJO%no existe la carpeta apps-script%FIN%
set FALTA=1

:V_FRONT
echo   Frontend
if not exist "docs" goto V_NOFRONT
echo      carpeta docs presente
goto V_URL
:V_NOFRONT
echo      %ROJO%no existe la carpeta docs%FIN%
set FALTA=1

:V_URL
echo   URL del Web App en docs\config.js
if not exist "docs\config.js" goto V_NOURL
findstr /C:"PON_AQUI" docs\config.js >nul 2>&1
if not errorlevel 1 goto V_URLPLACE
echo      puesta
goto V_GIT
:V_URLPLACE
echo      %ROJO%sigue en placeholder%FIN%
set FALTA=1
goto V_GIT
:V_NOURL
echo      %ROJO%no existe docs\config.js%FIN%
set FALTA=1

:V_GIT
echo   git
call :BUSCARGIT
if errorlevel 1 goto V_NOGIT
for /f "delims=" %%V in ('"!GIT!" --version') do echo      %%V
if exist ".git" goto V_REPO
echo      %ROJO%esta carpeta todavia no es repositorio%FIN%
set FALTA=1
goto V_SEGURO
:V_REPO
echo      repositorio listo
goto V_SEGURO
:V_NOGIT
echo      %ROJO%no encontrado%FIN%
set FALTA=1

:V_SEGURO
echo   Credenciales en el codigo
call _seguro.bat
if errorlevel 1 goto V_SUCIO
echo      limpio
goto V_FINAL
:V_SUCIO
echo      %ROJO%hay algo sospechoso - ver arriba%FIN%
set FALTA=1

:V_FINAL
echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
if "!FALTA!"=="0" goto V_TODOBIEN
echo   %ROJO%!  FALTAN COSAS%FIN%
echo.
echo      Arriba en rojo esta lo que hay que resolver.
echo.
pause
exit /b 1

:V_TODOBIEN
echo %VERDE%  Todo en orden. No falta nada.%FIN%
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
