@echo off
setlocal enabledelayedexpansion
title Instalar servidor Site Sheet

REM ============================================================
REM  INSTALAR-SERVIDOR.bat  (20-nov-2026)  -  se corre UNA vez en la computadora servidor
REM  1. Instala Git si no esta (winget).
REM  2. Baja el proyecto de GitHub a Documentos\GitHub\Site Sheet (pide entrar a GitHub la 1a vez).
REM  3. Corre 6-SERVIDOR.bat: tarea de Windows que se actualiza sola cada 15 min.
REM  4. Abre la carpeta de la extension y Chrome en chrome://extensions para cargarla.
REM  No sube nada. No guarda claves.
REM ============================================================

set "REPO=https://github.com/v-w04/Site-Sheet.git"
set "DESTINO=%USERPROFILE%\Documents\GitHub\Site Sheet"

set "ESC="
for /f %%E in ('echo prompt $E ^| cmd') do set "ESC=%%E"
set "AZUL=" & set "VERDE=" & set "ROJO=" & set "FIN="
if defined ESC set "AZUL=%ESC%[38;2;31;148;249m"
if defined ESC set "VERDE=%ESC%[38;2;63;185;80m"
if defined ESC set "ROJO=%ESC%[38;2;248;81;73m"
if defined ESC set "FIN=%ESC%[0m"

echo.
echo   INSTALAR SERVIDOR                         Site Sheet
echo   %AZUL%----------------------------------------------------%FIN%

echo   %AZUL%[1/4]%FIN%  Git . . . . . . . . . . . . . . . .
call :BUSCARGIT
if not errorlevel 1 goto TIENEGIT
echo          no esta: instalando con winget (puede pedir permiso)
winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements --silent
call :BUSCARGIT
if errorlevel 1 goto NOGIT
:TIENEGIT
echo          ok

echo   %AZUL%[2/4]%FIN%  Bajar el proyecto de GitHub . . . .
if exist "%DESTINO%\.git" (
  echo          ya estaba: %DESTINO%
  goto CLONADO
)
if not exist "%USERPROFILE%\Documents\GitHub" mkdir "%USERPROFILE%\Documents\GitHub"
echo          si se abre una ventana de GitHub, entra con tu cuenta v-w04
"!GIT!" clone "%REPO%" "%DESTINO%"
if errorlevel 1 goto NOCLON
:CLONADO
echo          ok

echo   %AZUL%[3/4]%FIN%  Actualizarse solo cada 15 min . . .
if not exist "%DESTINO%\6-SERVIDOR.bat" goto NO6
schtasks /create /f /sc minute /mo 15 /tn "Site Sheet - actualizar servidor" /tr "\"%DESTINO%\6-SERVIDOR.bat\" auto" >nul 2>"%TEMP%\ss_t.txt"
if errorlevel 1 goto NOTAREA
echo          ok

echo   %AZUL%[4/4]%FIN%  Abrir la carpeta de la extension . .
start "" explorer "%DESTINO%\extension-cookie"
start "" chrome "chrome://extensions"
echo          ok

echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo %VERDE%  Listo. Falta solo cargar la extension en Chrome:%FIN%
echo      1. En chrome://extensions prende "Modo de desarrollador".
echo      2. Quita la extension que cargaste del zip (si estaba).
echo      3. "Cargar extension sin empaquetar" y elige:
echo         %DESTINO%\extension-cookie
echo      4. Opciones: revisa URL, clave y nombre "Servidor".
echo.
pause
exit /b 0

:BUSCARGIT
set "GIT="
where git >nul 2>&1
if not errorlevel 1 set "GIT=git"
if exist "%ProgramFiles%\Git\cmd\git.exe" set "GIT=%ProgramFiles%\Git\cmd\git.exe"
for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
  if not defined GIT if exist "%%D\resources\app\git\cmd\git.exe" set "GIT=%%D\resources\app\git\cmd\git.exe"
)
if not defined GIT exit /b 1
exit /b 0

:NOGIT
echo.
echo   %ROJO%x  NO PUDE INSTALAR GIT%FIN%
echo      Descargalo de git-scm.com/download/win, instalalo con todo lo que trae por defecto
echo      y vuelve a correr este archivo.
echo.
pause
exit /b 1

:NOCLON
echo.
echo   %ROJO%x  NO SE PUDO BAJAR EL PROYECTO%FIN%
echo      Revisa que entraste a GitHub con la cuenta v-w04 y que hay internet. Vuelve a correr este archivo.
echo.
pause
exit /b 1

:NO6
echo.
echo   %ROJO%x  FALTA 6-SERVIDOR.bat EN GITHUB%FIN%
echo      En tu PC principal corre 5-SUBIR-TODO.bat y despues vuelve a correr este archivo aqui.
echo.
pause
exit /b 1

:NOTAREA
type "%TEMP%\ss_t.txt"
echo.
echo   %ROJO%x  NO SE PUDO CREAR LA TAREA%FIN%
echo      Clic derecho en este archivo - Ejecutar como administrador.
echo.
pause
exit /b 1
