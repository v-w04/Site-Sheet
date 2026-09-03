@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
call _config.bat
title Actualizar desde GitHub

echo.
echo  =======================================================
echo    BAJANDO CAMBIOS DE GITHUB
echo  =======================================================
echo.
echo  Corre esto ANTES de empezar a trabajar, sobre todo si
echo  usaste otra computadora la ultima vez.
echo.

call :BUSCARGIT
if errorlevel 1 goto NOGIT

echo  [1/2] Revisando si tienes cambios sin subir...
for /f %%C in ('"!GIT!" status --porcelain 2^>nul ^| find /c /v ""') do set CAMBIOS=%%C

if not "!CAMBIOS!"=="0" (
    echo.
    echo  OJO: tienes !CAMBIOS! archivo^(s^) con cambios locales sin subir:
    echo.
    "!GIT!" status --short
    echo.
    echo  Si bajas ahora, git va a intentar mezclarlos.
    echo  Si prefieres subirlos primero, cierra esto y corre 5-SUBIR-TODO.bat
    echo.
    pause
)

echo.
echo  [2/2] Bajando de origin...
"!GIT!" pull origin %GH_BRANCH%
if errorlevel 1 goto PULLFAIL

echo.
echo  =======================================================
echo    ACTUALIZADO
echo  =======================================================
echo.
pause
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
echo  ERROR: no encuentro git.
echo  Instalalo de https://git-scm.com/download/win o usa GitHub Desktop.
echo.
pause
exit /b 1

:PULLFAIL
echo.
echo  ERROR al bajar los cambios.
echo.
echo  Si dice "conflict" o "would be overwritten":
echo  editaste el mismo archivo en las dos computadoras.
echo  Abre GitHub Desktop, ahi se resuelve mas facil.
echo.
pause
exit /b 1
