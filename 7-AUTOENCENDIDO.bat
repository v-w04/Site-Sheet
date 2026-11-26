@echo off
setlocal enabledelayedexpansion
title Autoencendido (esta computadora)
set "OK=0"
set "FALTA=0"

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

REM ---- Para acomodar el texto en la columna central ----
set "SPC=          "
set "SPC=%SPC%%SPC%"
set "SPC=%SPC%%SPC%"
set "SPC=%SPC%%SPC%"
set "SPC=%SPC%%SPC%"
set "SPC=%SPC%%SPC%"

REM ============================================================
REM  7-AUTOENCENDIDO.bat  (26-nov-2026)  -  se corre UNA vez en cada computadora que trabaja sola (FORCEV, Dell, Corsair)
REM  Deja la parte de Windows lista para que, tras un apagon o un reinicio, la computadora vuelva a trabajar sin que nadie la toque:
REM    1. Nunca se suspende ni hiberna conectada a la corriente (y cerrar la tapa no hace nada).
REM    2. Chrome abre solo al iniciar sesion (ahi vive la extension).
REM  Lo que NO puede hacer un bat y se hace a mano (lo dice al final): el BIOS (prender sola al volver la luz) y el inicio de sesion automatico de Windows (pide tu contrasena: la escribes tu, nunca este bat).
REM  No sube nada, no guarda claves, no toca el proyecto.
REM ============================================================

echo.
call :CEN - "AUTOENCENDIDO  -  %COMPUTERNAME%"
call :CEN AZUL "----------------------------------------------------"
echo.

REM ---- [1/3] Energia ----
call :IZQ AZUL "[1/3]  Energia (conectada a la corriente)" 0
set "E1=0"
powercfg /change standby-timeout-ac 0 >nul 2>&1
if errorlevel 1 set "E1=1"
powercfg /change hibernate-timeout-ac 0 >nul 2>&1
if errorlevel 1 set "E1=1"
powercfg /change disk-timeout-ac 0 >nul 2>&1
if errorlevel 1 set "E1=1"
REM Cerrar la tapa conectada a la corriente: no hacer nada (en una PC de escritorio no existe y no pasa nada)
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 >nul 2>&1
powercfg /setactive SCHEME_CURRENT >nul 2>&1
if "%E1%"=="0" (
  call :IZQP VERDE "ok  " "nunca suspende ni apaga el disco con corriente" 2
  set /a OK+=1
) else (
  call :IZQP ROJO "x   " "no pude cambiar la energia: corre este bat como administrador" 2
  set /a FALTA+=1
)
echo.

REM ---- [2/3] Chrome al iniciar sesion ----
call :IZQ AZUL "[2/3]  Chrome al iniciar sesion" 0
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined CHROME (
  call :IZQP ROJO "x   " "no encontre Chrome en esta computadora" 2
  set /a FALTA+=1
  goto PASO3
)
set "INICIO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SS_LNK=%INICIO%\Chrome (Site Sheet).lnk"
set "SS_EXE=%CHROME%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:SS_LNK); $s.TargetPath = $env:SS_EXE; $s.Arguments = '--restore-last-session'; $s.Save(); exit 0 } catch { exit 1 }" >nul 2>&1
if exist "%SS_LNK%" (
  call :IZQP VERDE "ok  " "Chrome abre solo al iniciar sesion" 2
  set /a OK+=1
) else (
  call :IZQP ROJO "x   " "no pude crear el acceso en Inicio" 2
  set /a FALTA+=1
)
echo.

:PASO3
REM ---- [3/3] Lo que se hace a mano ----
call :IZQ AZUL "[3/3]  Lo que se hace a mano (una vez)" 0
call :IZQ - "A) BIOS: entra al BIOS al prender (F2 o Supr; Dell: F2)." 2
call :IZQ - "   Busca 'AC Power Recovery' / 'Restore on AC Power Loss'" 2
call :IZQ - "   (Dell portatil: 'AC Behavior' = Wake on AC) y ponlo en ENCENDER." 2
call :IZQ - "B) Inicio de sesion automatico: abre netplwiz (Win + R)," 2
call :IZQ - "   quita 'Los usuarios deben escribir su nombre...' y" 2
call :IZQ - "   escribe tu contrasena AHI. Si no sale esa casilla:" 2
call :IZQ - "   Configuracion - Cuentas - Opciones de inicio de sesion -" 2
call :IZQ - "   apaga 'Requerir Windows Hello' y vuelve a abrir netplwiz." 2
call :IZQ - "C) Prueba: apaga, desconecta la corriente 10 s, conecta." 2
call :IZQ - "   Debe prender sola, abrir Chrome y volver a reportar." 2
echo.
call :CEN AZUL "----------------------------------------------------"
echo.
if "%FALTA%"=="0" (
  call :CEN VERDE "Windows quedo listo (2 de 2). Faltan A y B a mano."
) else (
  call :CEN ROJO "{EXC}  Falto algo en Windows: mira las lineas en rojo."
)
echo.
pause
exit /b 0

REM  Diseno: una COLUMNA central de 60 columnas. Titulos, veredicto y logo van CENTRADOS; el cuerpo va JUSTIFICADO a la izquierda de la columna.
REM  :CEN COLOR "texto"                      centrado en la ventana (titulos, veredicto, avisos)
REM  :IZQ COLOR "texto" [sangria]            a la izquierda de la columna (pasos y resultados)
REM  :IZQP COLOR "parte con color" "parte sin color" [sangria]
REM  COLOR = AZUL, VERDE, ROJO o - (sin color). {EXC} se imprime como el signo de admiracion.
REM  El ancho de la ventana se lee en cada llamada con mode con.
:CEN
call :CENP %1 %2 ""
exit /b 0

:IZQ
call :IZQP %1 %2 "" %3
exit /b 0

:CENP
setlocal disabledelayedexpansion
call :ANCHO
set "CC="
if /i "%~1"=="AZUL" set "CC=%AZUL%"
if /i "%~1"=="VERDE" set "CC=%VERDE%"
if /i "%~1"=="ROJO" set "CC=%ROJO%"
set "A=_%~2"
set "B=_%~3"
set "A=%A:{EXC}=!%"
set "B=%B:{EXC}=!%"
set "A=%A:~1%"
set "B=%B:~1%"
set "ALL=_%A%%B%"
set "L=0"
:CENP_L
set "CH="
call set "CH=%%ALL:~%L%,1%%"
if not defined CH goto CENP_P
set /a L+=1
goto CENP_L
:CENP_P
set /a L-=1
set /a P=(COLS-L)/2
if %P% lss 0 set "P=0"
call set "PAD=%%SPC:~0,%P%%%"
echo(%PAD%%CC%%A%%FIN%%B%
endlocal
exit /b 0

:IZQP
setlocal disabledelayedexpansion
call :ANCHO
set "CC="
if /i "%~1"=="AZUL" set "CC=%AZUL%"
if /i "%~1"=="VERDE" set "CC=%VERDE%"
if /i "%~1"=="ROJO" set "CC=%ROJO%"
set "A=_%~2"
set "B=_%~3"
set "A=%A:{EXC}=!%"
set "B=%B:{EXC}=!%"
set "A=%A:~1%"
set "B=%B:~1%"
set "I=%~4"
if not defined I set "I=0"
set /a P=(COLS-60)/2+I
if %P% lss 0 set "P=0"
call set "PAD=%%SPC:~0,%P%%%"
echo(%PAD%%CC%%A%%FIN%%B%
endlocal
exit /b 0

:ANCHO
set "COLS=80"
set "N=0"
for /f "tokens=2 delims=:" %%a in ('mode con ^| findstr /r "[0-9]"') do call :ANCHO2 %%a
if %COLS% lss 40 set "COLS=80"
if %COLS% gtr 500 set "COLS=80"
exit /b 0

:ANCHO2
set /a N+=1
if %N%==2 set /a COLS=%1
exit /b 0
