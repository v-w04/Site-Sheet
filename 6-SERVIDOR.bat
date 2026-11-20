@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
call _config.bat
title Servidor - actualizar solo

REM ============================================================
REM  6-SERVIDOR.bat  (20-nov-2026)
REM  Para la computadora SERVIDOR (siempre prendida). NO sube nada.
REM  - Doble clic: instala una tarea de Windows que cada 15 min baja
REM    de GitHub lo que se subio con 5-SUBIR-TODO.bat en la PC principal.
REM    La extension (cargada desde ESTA carpeta) se recarga sola en 1 min.
REM  - "6-SERVIDOR.bat auto": lo que corre la tarea, en silencio.
REM  Si aqui hay cambios sin subir, NO baja (nunca mezcla) y lo anota.
REM ============================================================

set "BIT=%~dp0_servidor.log"
if /i "%~1"=="auto" goto AUTO

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
echo   SERVIDOR                    actualizar solo cada 15 min
echo   %AZUL%----------------------------------------------------%FIN%

call :BUSCARGIT
if errorlevel 1 goto NOGIT

echo   %AZUL%[1/2]%FIN%  Bajando de GitHub ahora . . . . . .
call :BAJAR
if errorlevel 1 goto FALLO
echo          ok

echo   %AZUL%[2/2]%FIN%  Tarea de Windows cada 15 min . . . .
schtasks /create /f /sc minute /mo 15 /tn "Site Sheet - actualizar servidor" /tr "\"%~f0\" auto" >nul 2>"%TEMP%\ss_t.txt"
if errorlevel 1 goto TAREAFALLO
echo          ok

echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
echo %VERDE%  Listo. Esta computadora se actualiza sola cada 15 min.%FIN%
echo      Carga la extension desde: %~dp0extension-cookie
echo      Bitacora: _servidor.log
echo.
pause
exit /b 0

:AUTO
call :BUSCARGIT
if errorlevel 1 (
  echo %date% %time% sin git>> "%BIT%"
  exit /b 1
)
call :BAJAR
exit /b %errorlevel%

:BAJAR
REM Candados de un git que murio a media operacion
del /f /q ".git\index.lock" ".git\HEAD.lock" ".git\config.lock" >nul 2>&1
set "TMPST=%TEMP%\ss_servidor_st.txt"
"!GIT!" status --porcelain --untracked-files=no > "!TMPST!" 2>nul
set CAMBIOS=0
for /f %%C in ('find /c /v "" ^< "!TMPST!"') do set CAMBIOS=%%C
del "!TMPST!" >nul 2>&1
if not "!CAMBIOS!"=="0" (
  echo %date% %time% NO BAJE: !CAMBIOS! archivo^(s^) cambiados aqui. En el servidor no se edita nada.>> "%BIT%"
  exit /b 1
)
"!GIT!" pull -q --ff-only origin %GH_BRANCH% >nul 2>"%TEMP%\ss_servidor_e.txt"
if errorlevel 1 (
  echo %date% %time% fallo el pull>> "%BIT%"
  type "%TEMP%\ss_servidor_e.txt">> "%BIT%"
  exit /b 1
)
echo %date% %time% ok>> "%BIT%"
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
echo   %ROJO%x  NO ENCUENTRO GIT%FIN%
echo      Instala GitHub Desktop, entra con tu cuenta y clona el repo %GH_USER%/%GH_REPO%.
echo.
pause
exit /b 1

:FALLO
echo          fallo
echo.
type "%BIT%" 2>nul
echo.
echo   %ROJO%x  NO SE PUDO BAJAR%FIN%
echo      Si dice que hay cambios aqui: en el servidor no se edita nada. Descartalos en GitHub Desktop.
echo.
pause
exit /b 1

:TAREAFALLO
echo          fallo
type "%TEMP%\ss_t.txt"
echo.
echo   %ROJO%x  NO SE PUDO CREAR LA TAREA%FIN%
echo      Corre este archivo con clic derecho - Ejecutar como administrador.
echo.
pause
exit /b 1
