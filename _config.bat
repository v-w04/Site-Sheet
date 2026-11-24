@echo off
REM ============================================================
REM  Configuracion del proyecto - EDITA SOLO ESTE ARCHIVO
REM ============================================================
REM  Los demas .bat leen de aqui. Si cambias de repo o de usuario,
REM  se cambia en un solo lugar.
REM
REM  Aqui NO va ninguna credencial. Nada de cookies, passwords ni
REM  llaves: eso vive en PropertiesService de Apps Script y se
REM  captura desde el menu del Sheet.
REM ============================================================

set "PROYECTO=Site Sheet"
set "GH_USER=v-w04"
set "GH_REPO=Site-Sheet"
set "GH_BRANCH=main"
set "MSG_DEFAULT=Actualiza Site Sheet"

REM Implementacion del Web App que se actualiza SOLA con cada subida
REM (_publicar.js la usa: version nueva + misma URL /exec). Es el id
REM que va dentro de la URL del Web App; la URL es publica a proposito.
set "WEBAPP_DEPLOY_ID=AKfycby85T2KwoDZb-kTPFlXbyXcTR9aMiRQZNzHhvgkHSb13JXX0NeYJUH0kAABi-GWWZHB"
