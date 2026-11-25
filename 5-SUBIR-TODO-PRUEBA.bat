@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Subir todo - PRUEBA

REM PRUEBA DE ASPECTO: no sube nada, no toca clasp ni git. Columna central: titulos centrados, cuerpo justificado a la izquierda. Cierra a los 15 s. No cambia el tamano de la ventana.

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

set "SPC=          "
set "SPC=%SPC%%SPC%"
set "SPC=%SPC%%SPC%"
set "SPC=%SPC%%SPC%"
set "SPC=%SPC%%SPC%"
set "SPC=%SPC%%SPC%"

cls

echo.
call :CEN - "SUBIR TODO  -  PRUEBA DE ASPECTO  -  no sube nada"
call :CEN AZUL "----------------------------------------------------"
echo.
call :IZQP AZUL "[1/4]" "  Credenciales en el codigo"
timeout /t 1 /nobreak >nul
call :IZQ - "limpio" 7
call :IZQP AZUL "[2/4]" "  Apps Script"
timeout /t 1 /nobreak >nul
call :IZQ - "ok" 7
call :IZQP AZUL "[3/4]" "  Cambios por subir"
timeout /t 1 /nobreak >nul
call :IZQ - "3 archivo(s)" 7
call :IZQP AZUL "[4/4]" "  Commit y push"
timeout /t 1 /nobreak >nul
call :IZQ - "subido y verificado" 7
echo.
call :CEN AZUL "----------------------------------------------------"
echo.
call :CEN VERDE "Listo."
echo.
call :CEN ROJO "{EXC}  ASI SE VE UN AVISO ROJO (de ejemplo)"
call :CEN - "una linea de remedio, centrada debajo"
echo.
call :CEN - "esta ventana se cierra sola en 15 s"
echo.
call :LOGO
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

:LOGO
where node >nul 2>&1
if errorlevel 1 goto SINLOGO
if not exist "%~dp0logo-animado.js" goto SINLOGO
node "%~dp0logo-animado.js" giro marca 15 12
goto :eof

:SINLOGO
timeout /t 15 /nobreak >nul
goto :eof
