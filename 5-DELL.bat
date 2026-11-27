@echo off
setlocal enabledelayedexpansion
title Actualizar extension (%COMPUTERNAME%)
set "AUTO=%~1"
set "CFG=%APPDATA%\SiteSheet-Dell"
if not exist "%CFG%" mkdir "%CFG%"
set "RUTAF=%CFG%\ruta.txt"
set "LOG=%CFG%\actualizar.log"
set "LOGOJS=%CFG%\logo-animado.js"
set "SS_URL=https://codeload.github.com/v-w04/Site-Sheet/zip/refs/heads/main"
set "SS_ZIP=%TEMP%\sitesheet-ext.zip"
set "SS_TMP=%TEMP%\sitesheet-ext"
set "TAREA=SiteSheet-Dell-Actualizar"
set "FIJO=%CFG%\5-DELL.bat"
set "LANZ=%CFG%\lanzar.cmd"
set "TRAB=%CFG%\trabajo.cmd"
set "OCULTO=%CFG%\oculto.vbs"
REM Direccion del Web App del Sheet (la misma de _config.bat; no es una clave). Aqui avisa como le va a esta computadora.
set "SS_WEB=https://script.google.com/macros/s/AKfycby85T2KwoDZb-kTPFlXbyXcTR9aMiRQZNzHhvgkHSb13JXX0NeYJUH0kAABi-GWWZHB/exec"
set "SS_PC=%COMPUTERNAME%"

REM 27-nov: la vuelta automatica YA NO toca la tarea de Windows. Antes hacia schtasks /change y, si Windows pedia la clave de la cuenta, la pregunta salia oculta (>archivo) y la ventana se quedaba negra y parada para siempre (2 ventanas colgadas en la Dell). La tarea solo se crea al correr este bat a mano.

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



if /i not "%AUTO%"=="auto" (
  echo.
  call :CEN - "ACTUALIZAR EXTENSION  -  Dell"
  call :CEN AZUL "----------------------------------------------------"
  echo.
)

REM ---- [1/4] Carpeta de la extension ----
set "CARPETA="
if exist "%RUTAF%" set /p CARPETA=<"%RUTAF%"
REM Una ruta guardada que empieza con ~ o que no trae unidad (C:) no sirve: se expande o se vuelve a pedir
if defined CARPETA if "!CARPETA:~0,1!"=="~" set "CARPETA=%USERPROFILE%!CARPETA:~1!"
if defined CARPETA if not "!CARPETA:~1,1!"==":" set "CARPETA="
if not defined CARPETA (
  if /i "%AUTO%"=="auto" ( >>"%LOG%" echo %date% %time% sin carpeta guardada & exit /b 1 )
  call :IZQ - "Pega la ruta de la carpeta de la extension." 2
  call :IZQ - "La ves en Chrome: chrome://extensions - Site Sheet - Cookie - Detalles." 2
  call :IZQ - "Puedes pegarla tal cual sale, aunque empiece con ~" 2
  call :IZQ - "Dell nueva: escribe una ruta nueva, ej. C:\SiteSheet\extension-cookie" 2
  echo.
  set /p CARPETA=          Ruta: 
  set "CARPETA=!CARPETA:"=!"
  if not defined CARPETA goto SINRUTA
  REM Chrome muestra la ruta como ~\Documents\...: el ~ es tu carpeta de usuario
  if "!CARPETA:~0,1!"=="~" set "CARPETA=%USERPROFILE%!CARPETA:~1!"
  if not "!CARPETA:~1,1!"==":" goto SINRUTA
  if not exist "!CARPETA!" (
    set "CREAR="
    call :IZQ - "Esa carpeta no existe: !CARPETA!" 2
    set /p CREAR=          La creo? ^(S/N^): 
    if /i not "!CREAR!"=="S" goto SINRUTA
    mkdir "!CARPETA!" >nul 2>&1
  )
  if not exist "!CARPETA!" goto SINRUTA
  >"%RUTAF%" echo !CARPETA!
)
if not exist "!CARPETA!" goto SINRUTA
if /i not "%AUTO%"=="auto" (
  call :IZQP AZUL "[1/4]" "  Carpeta de la extension"
  call :IZQ - "!CARPETA!" 7
)

REM ---- Version que tiene hoy ----
set "SS_CARPETA=!CARPETA!"
set "VANTES=ninguna"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { (Get-Content -Raw -LiteralPath (Join-Path $env:SS_CARPETA 'manifest.json') | ConvertFrom-Json).version } catch { 'ninguna' }" > "%CFG%\v.txt" 2>nul
set /p VANTES=<"%CFG%\v.txt"

REM ---- [2/4] Descargar de GitHub ----
if /i not "%AUTO%"=="auto" call :IZQP AZUL "[2/4]" "  Bajando de GitHub"
if exist "%SS_ZIP%" del /f /q "%SS_ZIP%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -TimeoutSec 90 -Uri $env:SS_URL -OutFile $env:SS_ZIP; exit 0 } catch { Write-Output $_.Exception.Message; exit 1 }" > "%CFG%\e.txt" 2>&1
if errorlevel 1 goto FALLODESCARGA
if not exist "%SS_ZIP%" goto FALLODESCARGA
if /i not "%AUTO%"=="auto" call :IZQ - "ok" 7

REM ---- [3/4] Descomprimir y revisar que no sea una version mas vieja ----
if /i not "%AUTO%"=="auto" call :IZQP AZUL "[3/4]" "  Descomprimiendo"
if exist "%SS_TMP%" rmdir /s /q "%SS_TMP%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Expand-Archive -Force -LiteralPath $env:SS_ZIP -DestinationPath $env:SS_TMP; exit 0 } catch { Write-Output $_.Exception.Message; exit 1 }" > "%CFG%\e.txt" 2>&1
if errorlevel 1 goto FALLOZIP
set "ORIGEN="
for /d %%D in ("%SS_TMP%\*") do if exist "%%D\extension-cookie\manifest.json" set "ORIGEN=%%D\extension-cookie"
if not defined ORIGEN goto FALLOZIP
set "SS_ORIGEN=!ORIGEN!"
for /d %%D in ("%SS_TMP%\*") do if exist "%%D\logo-animado.js" copy /y "%%D\logo-animado.js" "%LOGOJS%" >nul 2>&1
REM Este mismo bat tambien se actualiza solo: si GitHub trae uno distinto, se deja como 5-DELL.nuevo y el lanzador lo cambia en la siguiente vuelta (un bat no se reescribe a si mismo mientras corre).
for /d %%D in ("%SS_TMP%\*") do if exist "%%D\5-DELL.bat" (
  fc /b "%%D\5-DELL.bat" "%FIJO%" >nul 2>&1
  if errorlevel 1 copy /y "%%D\5-DELL.bat" "%CFG%\5-DELL.nuevo" >nul 2>&1
)
REM Si GitHub todavia trae una version MAS VIEJA que la de la carpeta, no se baja nada (evita regresar la extension)
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $a=[version](Get-Content -Raw -LiteralPath (Join-Path $env:SS_CARPETA 'manifest.json') | ConvertFrom-Json).version; $b=[version](Get-Content -Raw -LiteralPath (Join-Path $env:SS_ORIGEN 'manifest.json') | ConvertFrom-Json).version; if ($b -lt $a) { Write-Output ('GitHub trae ' + $b + ' y la carpeta ya tiene ' + $a); exit 3 } else { exit 0 } } catch { exit 0 }" > "%CFG%\e.txt" 2>&1
if "!errorlevel!"=="3" goto GITHUBVIEJO
if /i not "%AUTO%"=="auto" call :IZQ - "ok" 7

REM ---- [4/4] Copiar a la carpeta de la extension ----
if /i not "%AUTO%"=="auto" call :IZQP AZUL "[4/4]" "  Copiando archivos"
robocopy "!ORIGEN!" "!CARPETA!" /E /R:2 /W:2 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto FALLOCOPIA

REM ---- Verificar de verdad: la version de la carpeta debe ser la que bajo ----
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $a=(Get-Content -Raw -LiteralPath (Join-Path $env:SS_CARPETA 'manifest.json') | ConvertFrom-Json).version; $b=(Get-Content -Raw -LiteralPath (Join-Path $env:SS_ORIGEN 'manifest.json') | ConvertFrom-Json).version; if ($a -eq $b) { Write-Output $a; exit 0 } else { Write-Output ('carpeta ' + $a + ' pero GitHub ' + $b); exit 1 } } catch { Write-Output $_.Exception.Message; exit 1 }" > "%CFG%\v.txt" 2>&1
if errorlevel 1 goto FALLOCOPIA
set /p VAHORA=<"%CFG%\v.txt"
rmdir /s /q "%SS_TMP%" >nul 2>&1
del /f /q "%SS_ZIP%" >nul 2>&1
>>"%LOG%" echo %date% %time% ok !VANTES! a !VAHORA!
if "!VANTES!"=="!VAHORA!" ( call :LATIDO vuelta "al dia, version !VAHORA!" ) else ( call :LATIDO actualizado "!VANTES! a !VAHORA!" )

if /i "%AUTO%"=="auto" exit /b 0

call :IZQ - "ok" 7
echo.
call :CEN AZUL "----------------------------------------------------"
echo.
if "!VANTES!"=="!VAHORA!" (
  call :CEN VERDE "Ya estaba al dia: version !VAHORA!"
) else (
  call :CEN VERDE "Actualizada: !VANTES! a !VAHORA!"
)
call :CEN - "Chrome la recarga sola en 1 o 2 minutos si no esta ocupada."
echo.

REM ---- Que se actualice sola cada 15 min ----
REM La tarea se vuelve a crear SIEMPRE y apunta a una copia fija de este bat (en %CFG%), asi no se rompe si mueves o borras el bat que bajaste.
if /i not "%~f0"=="%FIJO%" (
  copy /y "%~f0" "%FIJO%" >nul 2>&1
  del /f /q "%CFG%\5-DELL.nuevo" >nul 2>&1
)
schtasks /delete /tn "%TAREA%" /f >nul 2>&1 <nul
call :ESCRIBIROCULTO
REM 27-nov: la tarea se crea con PowerShell (sesion interactiva: NO pide clave), con bateria permitida, sin empalmar vueltas y con tope de 10 min por vuelta (si una se cuelga, Windows la mata). Si PowerShell falla, se intenta schtasks con la entrada cerrada (<nul) para que nunca se quede esperando una clave.
set "SS_OCULTO=%OCULTO%"
set "SS_TAREA=%TAREA%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('//B \"' + $env:SS_OCULTO + '\"'); $t = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650); $s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10); $p = New-ScheduledTaskPrincipal -UserId ($env:USERDOMAIN + '\' + $env:USERNAME) -LogonType Interactive -RunLevel Limited; Register-ScheduledTask -TaskName $env:SS_TAREA -Action $a -Trigger $t -Settings $s -Principal $p -Force | Out-Null; exit 0 } catch { Write-Output $_.Exception.Message; exit 1 }" >"%TEMP%\ss_tarea.txt" 2>&1 <nul
if errorlevel 1 schtasks /create /tn "%TAREA%" /tr "wscript.exe //B \"%OCULTO%\"" /sc minute /mo 15 /f >>"%TEMP%\ss_tarea.txt" 2>&1 <nul
if errorlevel 1 (
  set "SS_ERR="
  if exist "%TEMP%\ss_tarea.txt" set /p SS_ERR=<"%TEMP%\ss_tarea.txt"
  >>"%LOG%" echo %date% %time% no pude crear la tarea: !SS_ERR!
  echo.
  call :CEN VERDE "La extension SI quedo actualizada."
  call :CEN ROJO "{EXC}  Pero Windows no me dejo programar la tarea automatica."
  call :CEN - "Windows dice: !SS_ERR!"
  call :LATIDO fallo "no pude crear la tarea: !SS_ERR!"
  pause
  exit /b 1
)
if not exist "%LANZ%" goto SINLANZ
if not exist "%FIJO%" (
  call :CEN ROJO "{EXC}  No pude guardar la copia fija en %CFG%"
  pause
  exit /b 1
)
call :CEN VERDE "Listo: se actualiza sola cada 15 min."
call :CEN - "Copia fija y lanzador en %CFG%"
call :CEN - "Este bat tambien se actualiza solo desde GitHub."
call :CEN - "Lo que hace queda en %CFG%\actualizar.log"
>>"%LOG%" echo %date% %time% tarea %TAREA% creada apuntando a %FIJO%
call :LATIDO vuelta "tarea creada: se actualiza sola cada 15 min"

:FINAL
echo.
call :CEN - "esta ventana se cierra sola en 15 s"
echo.
call :LOGO
exit /b 0

:SINLANZ
call :CEN ROJO "{EXC}  No pude crear el lanzador en %CFG%"
call :LATIDO fallo "no pude crear el lanzador"
pause
exit /b 1

:ESCRIBIROCULTO
REM trabajo.cmd = lo que de verdad hace la vuelta. oculto.vbs lo corre sin ventana. lanzar.cmd queda solo como puente por si la tarea todavia apunta a el.
>"%TRAB%" echo @echo off
>>"%TRAB%" echo set "D=%%~dp0"
>>"%TRAB%" echo if exist "%%D%%5-DELL.nuevo" move /y "%%D%%5-DELL.nuevo" "%%D%%5-DELL.bat" ^>nul 2^>^&1
>>"%TRAB%" echo call "%%D%%5-DELL.bat" auto
>"%OCULTO%" echo Set sh = CreateObject("WScript.Shell")
>>"%OCULTO%" echo sh.Run "cmd /c ""%TRAB%""", 0, True
>"%LANZ%" echo @echo off
>>"%LANZ%" echo echo Actualizando la extension en segundo plano. Esta ventana se cierra sola.
>>"%LANZ%" echo wscript.exe //B "%%~dp0oculto.vbs"
exit /b 0

:OCULTAR
REM oculto2.ok = ya quedaron trabajo.cmd, lanzar.cmd y oculto.vbs nuevos y la tarea apunta al vbs.
if exist "%CFG%\oculto2.ok" exit /b 0
call :ESCRIBIROCULTO
schtasks /change /tn "%TAREA%" /tr "wscript.exe //B \"%OCULTO%\"" >"%TEMP%\ss_oculta.txt" 2>&1 <nul
if errorlevel 1 goto OCULTARFALLO
>"%CFG%\oculto2.ok" echo %date% %time%
>>"%LOG%" echo %date% %time% tarea %TAREA% ahora corre oculta, sin ventana
call :LATIDO vuelta "la tarea ya corre oculta"
exit /b 0

:OCULTARFALLO
set "SS_ERR="
if exist "%TEMP%\ss_oculta.txt" set /p SS_ERR=<"%TEMP%\ss_oculta.txt"
>>"%LOG%" echo %date% %time% no pude pasar la tarea a oculta: !SS_ERR!
if exist "%CFG%\oculto.fallo" exit /b 0
>"%CFG%\oculto.fallo" echo %date% %time%
call :LATIDO fallo "no pude pasar la tarea a oculta: !SS_ERR!"
exit /b 0

:LATIDO
REM Avisa al Sheet como le fue a esta vuelta (la fila del Reporte y el Log lo leen). Sin clave. Si no hay internet, solo lo anota aqui.
set "SS_EV=%~1"
set "SS_DET=%~2"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $b = @{ accion = 'auto_latido'; tarea = 'actualizador'; evento = $env:SS_EV; pc = $env:SS_PC; detalle = $env:SS_DET } | ConvertTo-Json -Compress; $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $env:SS_WEB -Body $b -ContentType 'text/plain; charset=utf-8' -TimeoutSec 25; if ($r.Content -match 'ok.{1,5}true') { exit 0 } else { $c = [string]$r.Content; Write-Output ('respuesta rara: ' + $c.Substring(0, [Math]::Min(100, $c.Length))); exit 2 } } catch { Write-Output ('error: ' + $_.Exception.Message); exit 1 }" >"%TEMP%\ss_latido.txt" 2>&1
if errorlevel 1 (
  set "SS_ERR="
  if exist "%TEMP%\ss_latido.txt" set /p SS_ERR=<"%TEMP%\ss_latido.txt"
  >>"%LOG%" echo %date% %time% no pude avisar al Sheet: !SS_ERR!
)
exit /b 0

:GITHUBVIEJO
rmdir /s /q "%SS_TMP%" >nul 2>&1
del /f /q "%SS_ZIP%" >nul 2>&1
set /p MSG=<"%CFG%\e.txt"
>>"%LOG%" echo %date% %time% sin cambio: !MSG!
call :LATIDO vuelta "sin cambio: GitHub aun no tiene la version nueva"
if /i "%AUTO%"=="auto" exit /b 0
echo.
call :CEN AZUL "----------------------------------------------------"
echo.
call :CEN - "No cambie nada: !MSG!"
call :CEN - "GitHub todavia no tiene la version nueva. Corre el 5 en FORCEV y repite."
echo.
pause
exit /b 0

:SINRUTA
call :LATIDO fallo "sin carpeta valida de la extension"
echo.
call :CEN ROJO "{EXC}  NO TENGO UNA CARPETA VALIDA"
call :CEN - "Borra el archivo %RUTAF% y vuelve a correr este bat."
echo.
if /i not "%AUTO%"=="auto" pause
exit /b 1

:FALLODESCARGA
>>"%LOG%" echo %date% %time% fallo descarga
call :LATIDO fallo "no pude bajar de GitHub"
if /i "%AUTO%"=="auto" exit /b 1
echo.
call :CEN ROJO "{EXC}  NO PUDE BAJAR DE GITHUB"
call :CEN - "Revisa que la Dell tenga internet. Lo que dijo Windows:"
type "%CFG%\e.txt"
echo.
call :CEN - "No se cambio nada. Repite el bat; si sigue, manda esta pantalla a Claude."
echo.
pause
exit /b 1

:FALLOZIP
>>"%LOG%" echo %date% %time% fallo al descomprimir
call :LATIDO fallo "el archivo bajado no se pudo abrir"
if /i "%AUTO%"=="auto" exit /b 1
echo.
call :CEN ROJO "{EXC}  EL ARCHIVO BAJADO NO SE PUDO ABRIR"
type "%CFG%\e.txt"
echo.
call :CEN - "No se cambio nada. Repite el bat; si sigue, manda esta pantalla a Claude."
echo.
pause
exit /b 1

:FALLOCOPIA
>>"%LOG%" echo %date% %time% fallo al copiar o verificar
call :LATIDO fallo "no se pudo copiar la version nueva a la carpeta"
if /i "%AUTO%"=="auto" exit /b 1
echo.
call :CEN ROJO "{EXC}  LA CARPETA NO QUEDO CON LA VERSION NUEVA"
type "%CFG%\v.txt" 2>nul
echo.
call :CEN - "Cierra Chrome un momento y repite el bat; si sigue, manda esta pantalla a Claude."
echo.
pause
exit /b 1

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
