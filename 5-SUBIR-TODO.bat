@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
call _config.bat
title Subir todo

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

REM Un git que murio a media operacion deja candados y TODO git se niega.
REM No basta index.lock: HEAD.lock tumba el commit y deja pasar el resto
REM del bat como si nada.
del /f /q ".git\index.lock" ".git\HEAD.lock" ".git\config.lock" >nul 2>&1
del /f /q ".git\objects\maintenance.lock" >nul 2>&1
del /f /q ".git\refs\heads\*.lock" >nul 2>&1

echo.
call :CEN - "SUBIR TODO  -  Apps Script y GitHub"
call :CEN AZUL "----------------------------------------------------"
echo.

call :IZQP AZUL "[1/4]" "  Credenciales en el codigo"
call _seguro.bat
if errorlevel 1 goto FUGADETECTADA
call :IZQ - "limpio" 7
call :COLUMNAS

call :BUSCARGIT

call :IZQP AZUL "[2/4]" "  Apps Script"
if not exist ".clasp.json" goto SINCLASP
REM clasp push --force con la carpeta vacia BORRA el proyecto.
if not exist "apps-script\appsscript.json" goto SINBACKEND
call clasp push --force >nul 2>"%TEMP%\ss_e.txt"
if errorlevel 1 goto CLASPFALLO
call :IZQ - "ok" 7
call :PUBLICARVERSION
goto GITPART

:SINCLASP
call :IZQ - "saltado" 7
goto GITPART

:GITPART

call :IZQP AZUL "[3/4]" "  Cambios por subir"
if not exist ".git" goto NOTREPO
"!GIT!" remote get-url origin >nul 2>&1
if errorlevel 1 goto NOORIGIN

REM Contar sin meter un pipe dentro del for: el git de GitHub Desktop vive
REM en una ruta con espacios y cmd parte la orden.
set "TMPST=%TEMP%\ss_c.txt"
"!GIT!" status --porcelain > "!TMPST!" 2>nul
set CAMBIOS=0
for /f %%C in ('find /c /v "" ^< "!TMPST!"') do set CAMBIOS=%%C
del "!TMPST!" >nul 2>&1

REM Arbol limpio NO quiere decir que no falte nada por subir: puede haber
REM commits hechos y sin push.
set PENDIENTES=0
"!GIT!" rev-list --count @{u}..HEAD > "%TEMP%\ss_p.txt" 2>nul
if exist "%TEMP%\ss_p.txt" set /p PENDIENTES=<"%TEMP%\ss_p.txt"
del "%TEMP%\ss_p.txt" >nul 2>&1
if not defined PENDIENTES set PENDIENTES=0

set "HUBO="
if "!CAMBIOS!"=="0" goto SINCAMBIOS
call :IZQ - "!CAMBIOS! archivo(s)" 7
echo.
set "MSG=%MSG_DEFAULT%"
echo.

call :IZQP AZUL "[4/4]" "  Commit y push"
"!GIT!" add -A
if errorlevel 1 goto FAIL
"!GIT!" commit -q -m "!MSG!"
if errorlevel 1 goto COMMITFAIL
"!GIT!" push -q origin %GH_BRANCH%
if errorlevel 1 goto PUSHFAIL
set "HUBO=1"
goto VERIFICA

:SINCAMBIOS
call :IZQ - "ninguno" 7
call :IZQP AZUL "[4/4]" "  Commit y push"
if "!PENDIENTES!"=="0" goto VERIFICA
"!GIT!" push -q origin %GH_BRANCH%
if errorlevel 1 goto PUSHFAIL
set "HUBO=1"

REM El push devolviendo 0 no prueba que GitHub quedo igual que la carpeta.
REM Se compara el commit de aqui contra el que de verdad tiene origin.
:VERIFICA
set LOCAL=
set REMOTO=
"!GIT!" rev-parse HEAD > "%TEMP%\ss_l.txt" 2>nul
if exist "%TEMP%\ss_l.txt" set /p LOCAL=<"%TEMP%\ss_l.txt"
del "%TEMP%\ss_l.txt" >nul 2>&1
"!GIT!" ls-remote origin %GH_BRANCH% > "%TEMP%\ss_r.txt" 2>nul
if exist "%TEMP%\ss_r.txt" set /p REMOTO=<"%TEMP%\ss_r.txt"
del "%TEMP%\ss_r.txt" >nul 2>&1
if not defined LOCAL goto NOCUADRA
if not defined REMOTO goto NOCUADRA
if /i not "!LOCAL:~0,10!"=="!REMOTO:~0,10!" goto NOCUADRA
if defined HUBO call :IZQ - "subido y verificado" 7
if not defined HUBO call :IZQ - "al dia y verificado" 7

echo.
call :CEN AZUL "----------------------------------------------------"
echo.
if defined PUBLICAR goto VER_FALLO
call :CEN VERDE "Listo."
goto VER_FIN

:VER_FALLO
call :CEN ROJO "{EXC}  EL WEB APP NO SE ACTUALIZO: el codigo nuevo no esta en vivo"
call :CEN - "Lee el aviso de arriba. Al volver a correr este .bat no gasta otra version."
echo.
pause
exit /b 1

:VER_FIN
echo.
call :CEN - "esta ventana se cierra sola en 15 s"
echo.
call :LOGO
exit /b 0

:SINBACKEND
echo.
call :CEN ROJO "x  apps-script VACIA - no se subio nada"
echo.
pause
exit /b 1

:CLASPFALLO
type "%TEMP%\ss_e.txt"
echo.
call :CEN ROJO "x  FALLO EL PUSH A APPS SCRIPT"
call :CEN - "API apagada o sesion caducada: 1-INSTALAR-CLASP.bat"
echo.
pause
exit /b 1

:COLUMNAS
REM Recordatorio, no bloquea: avisa si hay codigo NUEVO que lee columnas por posicion.
where node >nul 2>&1
if errorlevel 1 exit /b 0
if not exist "%~dp0_columnas.js" exit /b 0
node "%~dp0_columnas.js" >"%TEMP%\col_o.txt" 2>&1
if errorlevel 2 goto COLNOPUDE
if errorlevel 1 goto COLNUEVAS
exit /b 0
:COLNUEVAS
call :IZQ ROJO "{EXC}  columnas por posicion NUEVAS: leer por encabezado" 7
type "%TEMP%\col_o.txt"
exit /b 0
:COLNOPUDE
call :IZQ ROJO "{EXC}  no pude revisar columnas" 7
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

REM Version nueva + Web App al dia, SOLA (ella ya no publica ni implementa a mano).
REM Detalle y reglas en _publicar.js. PUBLICAR queda con valor solo si fallo.
:PUBLICARVERSION
set "PUBLICAR="
where node >nul 2>&1
if errorlevel 1 goto PUB_SINNODE
node "%~dp0_publicar.js"
if errorlevel 1 set "PUBLICAR=FALLO"
exit /b 0

:PUB_SINNODE
call :IZQ ROJO "x  falta node: no se publico la version" 7
set "PUBLICAR=FALLO"
exit /b 0

:NOCUADRA
call :IZQ ROJO "no cuadra con GitHub" 7
echo.
call :CEN ROJO "x  NO PUDE CONFIRMAR QUE SUBIO"
call :CEN - "Abre GitHub Desktop y revisa si quedo el ultimo commit."
echo.
pause
exit /b 1

:FAIL
call :IZQ - "fallo" 7
echo.
call :CEN ROJO "x  FALLO GIT"
call :CEN - "Abre GitHub Desktop: ahi se ve que paso."
echo.
pause
exit /b 1

:COMMITFAIL
call :IZQ - "fallo" 7
echo.
call :CEN ROJO "x  NO SE HIZO EL COMMIT"
call :CEN - "Nada se subio. Abre GitHub Desktop y revisa."
echo.
pause
exit /b 1

:PUSHFAIL
call :IZQ - "fallo" 7
echo.
call :CEN ROJO "x  FALLO EL PUSH"
call :CEN - "Sin internet o sin permiso en el repo."
echo.
pause
exit /b 1

:NOGIT
call :IZQ - "sin git" 7
echo.
call :CEN ROJO "x  NO ENCUENTRO GIT"
call :CEN - "Instala GitHub Desktop o git-scm.com/download/win"
echo.
pause
exit /b 1

:NOTREPO
call :IZQ - "no es repo" 7
echo.
call :CEN ROJO "x  ESTA CARPETA NO ES UN REPOSITORIO"
call :CEN - "GitHub Desktop > File > Add local repository"
echo.
pause
exit /b 1

:NOORIGIN
call :IZQ - "sin origin" 7
echo.
call :CEN ROJO "x  EL REPO NO APUNTA A GITHUB"
call :CEN - "GitHub Desktop > Publish repository, y llena _config.bat"
echo.
pause
exit /b 1

:FUGADETECTADA
echo.
call :CEN ROJO "x  DETENIDO - POSIBLE CREDENCIAL EN EL CODIGO"
call :CEN - "Quitala del archivo; si ya se subio antes, rotala."
echo.
pause
exit /b 1

:LOGO
where node >nul 2>&1
if errorlevel 1 goto SINLOGO
if not exist "%~dp0logo-animado.js" goto SINLOGO
node "%~dp0logo-animado.js" giro marca 15 12
goto :eof

:SINLOGO
timeout /t 15 /nobreak >nul
goto :eof

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
