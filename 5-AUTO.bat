@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Subida automatica
set "MODO=%~1"
set "RAIZ=%~dp0"
set "CFG=%RAIZ%.git\sitesheet-auto"
set "LOG=%CFG%\auto.log"
set "LOCK=%CFG%\lock.txt"
set "TAREA=SiteSheet-Auto-Subir"
set "SS_LOCK=%LOCK%"
set "SS_RAIZ=%RAIZ%"
set "LOGOJS=%RAIZ%logo-animado.js"
set "FALLO="
set "NT=0"
if exist "%RAIZ%_config.bat" call "%RAIZ%_config.bat" >nul 2>&1
set "SS_URL=https://script.google.com/macros/s/%WEBAPP_DEPLOY_ID%/exec"
set "SS_PC=%COMPUTERNAME%"

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


if not exist "%RAIZ%.git" (
  echo.
  echo   Esta carpeta no es el repositorio. Pon este bat junto a 5-SUBIR-TODO.bat.
  if /i not "%MODO%"=="auto" pause
  exit /b 1
)
if not exist "%CFG%" mkdir "%CFG%"

call :BUSCARGIT
if errorlevel 1 (
  if /i "%MODO%"=="auto" ( >>"%LOG%" echo %date% %time% no encuentro git & exit /b 1 )
  echo.
  call :CEN ROJO "{EXC}  NO ENCUENTRO GIT  (instala GitHub Desktop o Git for Windows)"
  pause
  exit /b 1
)

if /i "%MODO%"=="auto" goto AUTO
if /i "%MODO%"=="quitar" goto QUITAR
goto MANUAL

:AUTO
REM Marca de vida: cada vuelta deja la hora aqui (asi se sabe que la tarea corre aunque no haya nada que subir)
>"%CFG%\latido.txt" echo %date% %time%
call :HERMANOS
if exist "%LOCK%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "if (((Get-Date) - (Get-Item -LiteralPath $env:SS_LOCK).LastWriteTime).TotalMinutes -gt 30) { exit 1 } else { exit 0 }"
  if not errorlevel 1 exit /b 0
)
>"%LOCK%" echo %date% %time%
call :HAYCAMBIOS
if errorlevel 1 (
  call :LATIDO vuelta "sin cambios por subir"
  del /f /q "%LOCK%" >nul 2>&1
  exit /b 0
)
call :ESTABLE
if errorlevel 1 (
  >>"%LOG%" echo %date% %time% hay archivos que cambiaron hace menos de 4 min: espero a la siguiente vuelta
  call :LATIDO vuelta "hay archivos recien cambiados: espero a la siguiente vuelta"
  del /f /q "%LOCK%" >nul 2>&1
  exit /b 0
)
call :GATE
if errorlevel 1 (
  >>"%LOG%" echo %date% %time% NO SUBO: !FALLO!
  call :LATIDO no_sube "!FALLO!"
  del /f /q "%LOCK%" >nul 2>&1
  exit /b 1
)
>>"%LOG%" echo %date% %time% pruebas ok ^(!NT!^): corro 5-SUBIR-TODO.bat
call "%RAIZ%5-SUBIR-TODO.bat" <nul >"%CFG%\ultimo-5.txt" 2>&1
set "RC=!errorlevel!"
if "!RC!"=="0" (
  >>"%LOG%" echo %date% %time% SUBIDO: 5-SUBIR-TODO.bat termino bien
  call :LATIDO subido "5-SUBIR-TODO termino bien (!NT! pruebas)"
) else (
  >>"%LOG%" echo %date% %time% FALLO el 5-SUBIR-TODO.bat ^(codigo !RC!^): ver .git\sitesheet-auto\ultimo-5.txt
  call :LATIDO fallo "5-SUBIR-TODO fallo con codigo !RC!"
)
del /f /q "%LOCK%" >nul 2>&1
exit /b !RC!

:MANUAL
echo.
call :CEN - "SUBIDA AUTOMATICA  -  Site Sheet"
call :CEN AZUL "----------------------------------------------------"
echo.
call :IZQP AZUL "[1/2]" "  Pruebas (no sube nada)"
call :GATE
if errorlevel 1 goto MANUALFALLA
call :IZQ - "ok: !NT! pruebas pasaron" 7
call :IZQP AZUL "[2/2]" "  Tarea programada"
schtasks /query /tn "%TAREA%" >nul 2>&1
if not errorlevel 1 (
  call :IZQ - "ya existe: corre cada 15 min" 7
  goto MANUALOK
)
set "SINO="
set /p SINO=          Quieres que corra sola cada 15 min? (S/N): 
if /i not "!SINO!"=="S" goto MANUALOK
goto INSTALAR

:INSTALAR
set "V=%CFG%\oculto.vbs"
>"%V%" echo Set sh = CreateObject("WScript.Shell")
>>"%V%" echo sh.Run "cmd /c ""%~f0"" auto", 0, True
schtasks /create /tn "%TAREA%" /tr "wscript.exe //B \"%V%\"" /sc minute /mo 15 /f >nul 2>&1
if errorlevel 1 goto INSTALARFALLA
call :IZQ - "tarea creada: corre cada 15 min, sin ventana" 7
call :IZQ - "lo que hace queda en .git\sitesheet-auto\auto.log" 7
goto MANUALOK

:INSTALARFALLA
call :IZQ ROJO "{EXC}  no pude crear la tarea: corre este bat como administrador" 7
pause
exit /b 1

:MANUALFALLA
echo.
call :CEN AZUL "----------------------------------------------------"
echo.
call :CEN ROJO "{EXC}  NO PASA: !FALLO!"
call :CEN - "No instale nada. Manda esta pantalla a Claude y lo arreglo."
echo.
pause
exit /b 1

:MANUALOK
echo.
call :CEN AZUL "----------------------------------------------------"
echo.
call :CEN VERDE "Listo."
echo.
call :CEN - "esta ventana se cierra sola en 15 s"
echo.
call :LOGO
exit /b 0

:QUITAR
schtasks /delete /tn "%TAREA%" /f >nul 2>&1
echo.
call :CEN - "Tarea quitada. La subida vuelve a ser solo con 5-SUBIR-TODO.bat"
echo.
timeout /t 8 /nobreak >nul
exit /b 0

:LATIDO
REM Avisa al Sheet como le fue a esta vuelta (la fila de la hoja Reporte y el Log lo leen). Sin clave. Si no hay internet, solo lo anota aqui.
set "SS_EV=%~1"
set "SS_DET=%~2"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $b = @{ accion = 'auto_latido'; evento = $env:SS_EV; pc = $env:SS_PC; detalle = $env:SS_DET } | ConvertTo-Json -Compress; $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $env:SS_URL -Body $b -ContentType 'text/plain; charset=utf-8' -TimeoutSec 25; if ($r.Content -match 'ok.{1,5}true') { exit 0 } else { $c = [string]$r.Content; Write-Output ('respuesta rara: ' + $c.Substring(0, [Math]::Min(100, $c.Length))); exit 2 } } catch { Write-Output ('error: ' + $_.Exception.Message); exit 1 }" >"%TEMP%\ss_latido.txt" 2>&1
if errorlevel 1 (
  set "SS_ERR="
  if exist "%TEMP%\ss_latido.txt" set /p SS_ERR=<"%TEMP%\ss_latido.txt"
  >>"%LOG%" echo %date% %time% no pude avisar al Sheet: !SS_ERR!
)
exit /b 0

:HERMANOS
REM Autos de los proyectos hermanos (carpeta junto a esta). Idempotente: si el proyecto existe, crea su 5-AUTO.bat solo si falta
REM (desde hermanos\<proyecto>-5-AUTO.bat) y crea su tarea de Windows solo si falta. Si ya estan, no toca nada.
call :HERMANO electrobot Electrobot-Auto-Subir
call :HERMANO WM_Inv WMInv-Auto-Subir
exit /b 0

:HERMANO
set "HP=%~1"
set "HT=%~2"
set "HD=%RAIZ%..\%HP%\"
if not exist "%HD%.git" exit /b 0
if not exist "%HD%5-AUTO.bat" (
  if not exist "%RAIZ%hermanos\%HP%-5-AUTO.bat" exit /b 0
  copy /y "%RAIZ%hermanos\%HP%-5-AUTO.bat" "%HD%5-AUTO.bat" >nul 2>&1
  >>"%LOG%" echo %date% %time% hermano %HP%: cree su 5-AUTO.bat
)
if not exist "%HD%5-AUTO.bat" exit /b 0
schtasks /query /tn "%HT%" >nul 2>&1
if not errorlevel 1 exit /b 0
call "%HD%5-AUTO.bat" instalar callado >nul 2>&1
schtasks /query /tn "%HT%" >nul 2>&1
if errorlevel 1 (
  >>"%LOG%" echo %date% %time% hermano %HP%: NO pude crear su tarea %HT%
) else (
  >>"%LOG%" echo %date% %time% hermano %HP%: tarea %HT% creada ^(corre cada 15 min^)
)
exit /b 0

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
    findstr /b /c:"FALLA" "%CFG%\t.txt" >nul 2>&1
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
if not exist "%LOGOJS%" goto SINLOGO
node "%LOGOJS%" giro marca 15 12
goto :eof

:SINLOGO
timeout /t 15 /nobreak >nul
goto :eof
