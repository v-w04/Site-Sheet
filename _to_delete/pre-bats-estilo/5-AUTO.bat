@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Site Sheet - Subida automatica
set "MODO=%~1"
set "RAIZ=%~dp0"
set "CFG=%RAIZ%.git\sitesheet-auto"
set "LOG=%CFG%\auto.log"
set "LOCK=%CFG%\lock.txt"
set "TAREA=SiteSheet-Auto-Subir"
set "SS_LOCK=%LOCK%"
set "SS_RAIZ=%RAIZ%"
set "FALLO="
set "NT=0"

if not exist "%RAIZ%.git" (
  echo.
  echo   Esta carpeta no es el repositorio. Pon este bat junto a 5-SUBIR-TODO.bat.
  if /i not "%MODO%"=="auto" pause
  exit /b 1
)
if not exist "%CFG%" mkdir "%CFG%"

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

call :BUSCARGIT
if errorlevel 1 (
  if /i "%MODO%"=="auto" ( >>"%LOG%" echo %date% %time% no encuentro git & exit /b 1 )
  echo.
  echo   %ROJO%x  NO ENCUENTRO GIT%FIN%  ^(instala GitHub Desktop o Git for Windows^)
  pause
  exit /b 1
)

if /i "%MODO%"=="auto" goto AUTO
if /i "%MODO%"=="quitar" goto QUITAR
goto MANUAL

REM ======================================================================
REM  AUTO: lo corre la tarea programada cada 15 min, sin ventana y sin preguntar
REM ======================================================================
:AUTO
if exist "%LOCK%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "if (((Get-Date) - (Get-Item -LiteralPath $env:SS_LOCK).LastWriteTime).TotalMinutes -gt 30) { exit 1 } else { exit 0 }"
  if not errorlevel 1 exit /b 0
)
>"%LOCK%" echo %date% %time%
call :HAYCAMBIOS
if errorlevel 1 (
  del /f /q "%LOCK%" >nul 2>&1
  exit /b 0
)
call :ESTABLE
if errorlevel 1 (
  >>"%LOG%" echo %date% %time% hay archivos que cambiaron hace menos de 4 min: espero a la siguiente vuelta
  del /f /q "%LOCK%" >nul 2>&1
  exit /b 0
)
call :GATE
if errorlevel 1 (
  >>"%LOG%" echo %date% %time% NO SUBO: !FALLO!
  del /f /q "%LOCK%" >nul 2>&1
  exit /b 1
)
>>"%LOG%" echo %date% %time% pruebas ok ^(!NT!^): corro 5-SUBIR-TODO.bat
call "%RAIZ%5-SUBIR-TODO.bat" <nul >"%CFG%\ultimo-5.txt" 2>&1
set "RC=!errorlevel!"
if "!RC!"=="0" (
  >>"%LOG%" echo %date% %time% SUBIDO: 5-SUBIR-TODO.bat termino bien
) else (
  >>"%LOG%" echo %date% %time% FALLO el 5-SUBIR-TODO.bat ^(codigo !RC!^): ver .git\sitesheet-auto\ultimo-5.txt
)
del /f /q "%LOCK%" >nul 2>&1
exit /b !RC!

REM ======================================================================
REM  MANUAL: doble clic. Revisa que todo pase (no sube nada) y ofrece instalar la tarea
REM ======================================================================
:MANUAL
echo.
echo   SUBIDA AUTOMATICA                 Site Sheet
echo   %AZUL%----------------------------------------------------%FIN%
echo.
echo   %AZUL%[1/2]%FIN%  Revisando que todo pase ^(no sube nada^) . . .
call :GATE
if errorlevel 1 goto MANUALFALLA
echo          ok: !NT! pruebas pasaron
echo.
echo   %AZUL%[2/2]%FIN%  Tarea programada . . . . . . . . . . . . .
schtasks /query /tn "%TAREA%" >nul 2>&1
if not errorlevel 1 (
  echo          ya existe ^(%TAREA%^): corre cada 15 min
  goto MANUALFIN
)
set "SINO="
set /p SINO=  Quieres que corra sola cada 15 min? (S/N): 
if /i not "!SINO!"=="S" goto MANUALFIN
goto INSTALAR

:INSTALAR
set "V=%CFG%\oculto.vbs"
>"%V%" echo Set sh = CreateObject("WScript.Shell")
>>"%V%" echo sh.Run "cmd /c ""%~f0"" auto", 0, True
schtasks /create /tn "%TAREA%" /tr "wscript.exe //B \"%V%\"" /sc minute /mo 15 /f >nul 2>&1
if errorlevel 1 goto INSTALARFALLA
echo.
echo %VERDE%  Listo: cada 15 min revisa si hay cambios; si las pruebas pasan, los sube solo.%FIN%
echo   Lo que hace queda escrito en .git\sitesheet-auto\auto.log
echo   Para quitarla: 5-AUTO.bat quitar
goto MANUALFIN

:INSTALARFALLA
echo.
echo   %ROJO%x  No pude crear la tarea. Cierra esto y corre el bat como administrador.%FIN%
goto MANUALFIN

:MANUALFALLA
echo.
echo   %ROJO%x  NO PASA: !FALLO!%FIN%
echo   No instale nada. Manda esta pantalla a Claude y lo arreglo.
echo.
pause
exit /b 1

:MANUALFIN
echo.
pause
exit /b 0

:QUITAR
schtasks /delete /tn "%TAREA%" /f >nul 2>&1
echo.
echo   Tarea quitada. Desde ahora la subida es solo con 5-SUBIR-TODO.bat.
echo.
pause
exit /b 0

REM ======================================================================
REM  Subrutinas
REM ======================================================================
:HAYCAMBIOS
"!GIT!" status --porcelain > "%CFG%\st.txt" 2>nul
set "N=0"
for /f %%C in ('find /c /v "" ^< "%CFG%\st.txt"') do set "N=%%C"
if not "!N!"=="0" exit /b 0
set "PEND=0"
"!GIT!" rev-list --count @{u}..HEAD > "%CFG%\pe.txt" 2>nul
if exist "%CFG%\pe.txt" set /p PEND=<"%CFG%\pe.txt"
if not "!PEND!"=="0" exit /b 0
exit /b 1

:ESTABLE
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=(Get-Date).AddMinutes(-4); $x=Get-ChildItem -LiteralPath $env:SS_RAIZ -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](\.git|_to_delete|node_modules)[\\/]' -and $_.LastWriteTime -gt $c } | Select-Object -First 1; if ($x) { exit 1 } else { exit 0 }"
exit /b %errorlevel%

:GATE
set "NT=0"
where node >nul 2>&1
if errorlevel 1 (
  set "FALLO=no encuentro node: no puedo correr las pruebas"
  exit /b 1
)
call "%RAIZ%_seguro.bat" >nul 2>&1
if errorlevel 1 (
  set "FALLO=_seguro.bat: posible credencial en el codigo"
  exit /b 1
)
for %%T in ("%RAIZ%pruebas\t*.js") do (
  if /i not "%%~nxT"=="t_enc.js" (
    node "%%~fT" > "%CFG%\t.txt" 2>&1
    if errorlevel 1 (
      set "FALLO=%%~nxT fallo"
      exit /b 1
    )
    findstr /c:"FALLA" "%CFG%\t.txt" >nul 2>&1
    if not errorlevel 1 (
      set "FALLO=%%~nxT dice FALLA"
      exit /b 1
    )
    set /a NT+=1
  )
)
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
