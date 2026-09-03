/**
 * Configuracion del frontend
 * ---------------------------------------------------------
 * URL del Web App de Apps Script (deployment de Site Sheet).
 *
 * Esta URL es publica — va en el repo — pero sin el password
 * configurado en Apps Script no devuelve un solo dato.
 *
 * Si algun dia haces un deployment NUEVO (no una version nueva
 * del mismo), la URL cambia y hay que actualizarla aqui.
 *
 * NOTA: se usa `var` a proposito, no `const`. Las declaraciones
 * con const/let en el nivel superior NO crean propiedad en
 * `window`, y app.js necesita leerla desde ahi.
 */
var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby85T2KwoDZb-kTPFlXbyXcTR9aMiRQZNzHhvgkHSb13JXX0NeYJUH0kAABi-GWWZHB/exec';

// Redundante pero explicito: garantiza el acceso via window
window.APPS_SCRIPT_URL = APPS_SCRIPT_URL;
