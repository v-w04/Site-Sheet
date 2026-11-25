@echo off
setlocal enabledelayedexpansion
title Site Sheet - Actualizar extension (Dell)
set "AUTO=%~1"

REM ---- Colores (si la consola los acepta) ----
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

set "CFG=%APPDATA%\SiteSheet-Dell"
if not exist "%CFG%" mkdir "%CFG%"
set "RUTAF=%CFG%\ruta.txt"
set "LOG=%CFG%\actualizar.log"
set "SS_URL=https://codeload.github.com/v-w04/Site-Sheet/zip/refs/heads/main"
set "SS_ZIP=%TEMP%\sitesheet-ext.zip"
set "SS_TMP=%TEMP%\sitesheet-ext"
set "TAREA=SiteSheet-Dell-Actualizar"

if /i not "%AUTO%"=="auto" (
  echo.
  echo   ACTUALIZAR EXTENSION                 Dell
  echo   %AZUL%----------------------------------------------------%FIN%
)

REM ---- [1/4] Carpeta de la extension ----
set "CARPETA="
if exist "%RUTAF%" set /p CARPETA=<"%RUTAF%"
if not defined CARPETA (
  if /i "%AUTO%"=="auto" ( >>"%LOG%" echo %date% %time% sin carpeta guardada & exit /b 1 )
  echo.
  echo   Pega la ruta de la carpeta de la extension.
  echo   La ves en Chrome: chrome://extensions - Site Sheet - Cookie - Detalles.
  echo   Puedes pegarla tal cual sale, aunque empiece con ~ .
  echo   Si es una Dell nueva, escribe una ruta nueva, por ejemplo C:\SiteSheet\extension-cookie
  echo.
  set /p CARPETA=  Ruta: 
  set "CARPETA=!CARPETA:"=!"
  if not defined CARPETA goto SINRUTA
  REM Chrome muestra la ruta como ~\Documents\...: el ~ es tu carpeta de usuario
  if "!CARPETA:~0,1!"=="~" set "CARPETA=%USERPROFILE%!CARPETA:~1!"
  if not exist "!CARPETA!" (
    set "CREAR="
    echo   Esa carpeta no existe: !CARPETA!
    set /p CREAR=  La creo? ^(S/N^): 
    if /i not "!CREAR!"=="S" goto SINRUTA
    mkdir "!CARPETA!" >nul 2>&1
  )
  if not exist "!CARPETA!" goto SINRUTA
  >"%RUTAF%" echo !CARPETA!
)
if not exist "!CARPETA!" goto SINRUTA
if /i not "%AUTO%"=="auto" (
  echo   %AZUL%[1/4]%FIN%  Carpeta . . . . . . . . . . . . . .
  echo          !CARPETA!
)

REM ---- Version que tiene hoy ----
set "SS_CARPETA=!CARPETA!"
set "VANTES=ninguna"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { (Get-Content -Raw -LiteralPath (Join-Path $env:SS_CARPETA 'manifest.json') | ConvertFrom-Json).version } catch { 'ninguna' }" > "%CFG%\v.txt" 2>nul
set /p VANTES=<"%CFG%\v.txt"

REM ---- [2/4] Descargar de GitHub ----
if /i not "%AUTO%"=="auto" echo   %AZUL%[2/4]%FIN%  Bajando de GitHub . . . . . . . . .
if exist "%SS_ZIP%" del /f /q "%SS_ZIP%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri $env:SS_URL -OutFile $env:SS_ZIP; exit 0 } catch { Write-Output $_.Exception.Message; exit 1 }" > "%CFG%\e.txt" 2>&1
if errorlevel 1 goto FALLODESCARGA
if not exist "%SS_ZIP%" goto FALLODESCARGA
if /i not "%AUTO%"=="auto" echo          ok

REM ---- [3/4] Descomprimir ----
if /i not "%AUTO%"=="auto" echo   %AZUL%[3/4]%FIN%  Descomprimiendo . . . . . . . . . .
if exist "%SS_TMP%" rmdir /s /q "%SS_TMP%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Expand-Archive -Force -LiteralPath $env:SS_ZIP -DestinationPath $env:SS_TMP; exit 0 } catch { Write-Output $_.Exception.Message; exit 1 }" > "%CFG%\e.txt" 2>&1
if errorlevel 1 goto FALLOZIP
set "ORIGEN="
for /d %%D in ("%SS_TMP%\*") do if exist "%%D\extension-cookie\manifest.json" set "ORIGEN=%%D\extension-cookie"
if not defined ORIGEN goto FALLOZIP
if /i not "%AUTO%"=="auto" echo          ok

REM ---- [4/4] Copiar a la carpeta de la extension ----
if /i not "%AUTO%"=="auto" echo   %AZUL%[4/4]%FIN%  Copiando archivos . . . . . . . . .
robocopy "!ORIGEN!" "!CARPETA!" /E /R:2 /W:2 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto FALLOCOPIA

REM ---- Verificar de verdad: la version de la carpeta debe ser la que bajo ----
set "SS_ORIGEN=!ORIGEN!"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $a=(Get-Content -Raw -LiteralPath (Join-Path $env:SS_CARPETA 'manifest.json') | ConvertFrom-Json).version; $b=(Get-Content -Raw -LiteralPath (Join-Path $env:SS_ORIGEN 'manifest.json') | ConvertFrom-Json).version; if ($a -eq $b) { Write-Output $a; exit 0 } else { Write-Output ('carpeta ' + $a + ' pero GitHub ' + $b); exit 1 } } catch { Write-Output $_.Exception.Message; exit 1 }" > "%CFG%\v.txt" 2>&1
if errorlevel 1 goto FALLOCOPIA
set /p VAHORA=<"%CFG%\v.txt"
rmdir /s /q "%SS_TMP%" >nul 2>&1
del /f /q "%SS_ZIP%" >nul 2>&1
>>"%LOG%" echo %date% %time% ok !VANTES! a !VAHORA!

if /i "%AUTO%"=="auto" exit /b 0

echo          ok
echo.
echo   %AZUL%----------------------------------------------------%FIN%
echo.
if "!VANTES!"=="!VAHORA!" (
  echo %VERDE%  Ya estaba al dia: version !VAHORA!.%FIN%
) else (
  echo %VERDE%  Actualizada: !VANTES! a !VAHORA!.%FIN%
)
echo   Chrome la recarga sola en 1 o 2 minutos si no esta ocupada.
echo   Si la quieres ya: chrome://extensions - Site Sheet - Cookie - Recargar.
echo.

REM ---- Que se actualice sola cada 15 min ----
schtasks /query /tn "%TAREA%" >nul 2>&1
if not errorlevel 1 (
  echo   Ya se actualiza sola cada 15 min ^(tarea %TAREA%^).
  goto FINAL
)
set "SINO="
set /p SINO=  Quieres que se actualice sola cada 15 min? (S/N): 
if /i "!SINO!"=="S" (
  schtasks /create /tn "%TAREA%" /tr "\"%~f0\" auto" /sc minute /mo 15 /f >nul 2>&1
  if errorlevel 1 (
    echo %ROJO%  x  No pude crear la tarea. Corre este bat de nuevo como administrador.%FIN%
  ) else (
    echo %VERDE%  Listo: se actualiza sola cada 15 min.%FIN%
    echo   Para quitarla: schtasks /delete /tn "%TAREA%" /f
  )
)
:FINAL
echo.
pause
exit /b 0

:SINRUTA
echo.
echo   %ROJO%x  NO TENGO UNA CARPETA VALIDA%FIN%
echo   Borra el archivo %RUTAF% y vuelve a correr este bat.
echo.
if /i not "%AUTO%"=="auto" pause
exit /b 1

:FALLODESCARGA
>>"%LOG%" echo %date% %time% fallo descarga
if /i "%AUTO%"=="auto" exit /b 1
echo.
echo   %ROJO%x  NO PUDE BAJAR DE GITHUB%FIN%
echo   Revisa que la Dell tenga internet. Lo que dijo Windows:
type "%CFG%\e.txt"
echo.
echo   No se cambio nada. Repite el bat; si sigue, manda este texto a Claude.
echo.
pause
exit /b 1

:FALLOZIP
>>"%LOG%" echo %date% %time% fallo al descomprimir
if /i "%AUTO%"=="auto" exit /b 1
echo.
echo   %ROJO%x  EL ARCHIVO BAJADO NO SE PUDO ABRIR%FIN%
type "%CFG%\e.txt"
echo.
echo   No se cambio nada. Repite el bat; si sigue, manda este texto a Claude.
echo.
pause
exit /b 1

:FALLOCOPIA
>>"%LOG%" echo %date% %time% fallo al copiar o verificar
if /i "%AUTO%"=="auto" exit /b 1
echo.
echo   %ROJO%x  LA CARPETA NO QUEDO CON LA VERSION NUEVA%FIN%
type "%CFG%\v.txt" 2>nul
echo.
echo   Cierra Chrome un momento y repite el bat; si sigue, manda este texto a Claude.
echo.
pause
exit /b 1
