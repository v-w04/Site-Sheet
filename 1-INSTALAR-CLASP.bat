@echo off
cd /d "%~dp0"
call _config.bat
title Instalar clasp

echo.
echo  =======================================================
echo    INSTALACION DE CLASP - se hace UNA SOLA VEZ
echo  =======================================================
echo.

echo  [1/3] Revisando Node.js...
where node >nul 2>&1
if errorlevel 1 goto NONODE
node --version
echo.

echo  [2/3] Instalando clasp...
call npm install -g @google/clasp
if errorlevel 1 goto NPMFAIL
echo  clasp instalado.
echo.

echo  [3/3] Autorizando tu cuenta de Google...
echo.
echo  Se abrira tu navegador.
echo  Inicia sesion con la MISMA cuenta donde esta el Apps Script.
echo.
pause
call clasp login
echo.

echo  =======================================================
echo    LISTO
echo  =======================================================
echo.
echo  FALTA UNA COSA, tambien una sola vez:
echo.
echo  Activa la Apps Script API en:
echo    https://script.google.com/home/usersettings
echo    Prende el switch "Google Apps Script API"
echo.
echo  El scriptId ya esta puesto en .clasp.json
echo.
echo  Despues usa 2-SUBIR-A-APPSCRIPT.bat cada vez.
echo.
pause
exit /b 0

:NONODE
echo.
echo  ERROR: No tienes Node.js instalado.
echo.
echo  Descargalo de https://nodejs.org
echo  Elige la version LTS y dale siguiente-siguiente.
echo  Cuando termine, vuelve a correr este archivo.
echo.
pause
exit /b 1

:NPMFAIL
echo.
echo  ERROR: Fallo la instalacion de clasp.
echo.
echo  Intenta asi: click derecho en este archivo
echo  y elige "Ejecutar como administrador"
echo.
pause
exit /b 1
