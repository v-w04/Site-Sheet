# 02 · Evidencia de red — página de rastreo de la Paquetería Dedicada Walmart (BigSmart)

Fecha: 20-nov-2026, 11:25 h. Herramienta: **Claude in Chrome** en el Chrome real del usuario (Windows). Capacidades usadas: navegación, lectura de peticiones de red (`read_network_requests`: URL, método, estado; **no** muestra cabeceras ni cuerpo) y JavaScript de solo lectura en la página. No se usó DevTools ni HAR.
Guía de prueba: una guía real del usuario, autorizada por él (se omite en este documento: `<GUIA>`). **Una sola carga de página** (más una recarga para iniciar la captura). No hubo verificación humana.

## Confirmado

| # | Hallazgo | Evidencia |
|---|---|---|
| C1 | La página `https://bigsmart.mx/tracking/?trackingNumber=<GUIA>` carga 2 scripts propios (`/js/bs-lang.js`, `/js/p-<hash>.js`) y hace **una sola petición de datos**. | Lista de recursos (`performance`) |
| C2 | Petición de datos: **`GET https://api.bigsmart.mx/api/order-logs/<GUIA>?populate=true&summary=true&language=es&_=<timestamp>`** → **200** en el Chrome del usuario. | `read_network_requests` |
| C3 | El historial **llega por HTTP (JSON por fetch)** y el componente `<bigsmart-tracking>` lo pinta en su Shadow DOM; el extractor actual lee ese resultado ya pintado. | C2 + `li.log` = 12 eventos, etapa actual leída |
| C4 | El script del componente arma la petición con cabecera **`Authorization: Bearer <valor>`**. El valor **no** es un atributo del componente, **no** sale de `localStorage`/cookies, **no** hay una llamada de login antes; se construye dentro del script público. (No se transcribe el valor.) | conteo de cadenas en `/js/p-<hash>.js` |
| C5 | No hay Turnstile/reCAPTCHA en el script del componente. | conteo de cadenas = 0 |
| C6 | En este Chrome no apareció la verificación "eres humano" en la prueba de hoy ni en la lectura de 106 guías de la mañana (20-nov 9:35–9:40, 4 a la vez). | lectura de vencidos |

## Confirmado antes (19-nov, mismo Chrome) — no repetido hoy

| # | Hallazgo |
|---|---|
| P1 | La misma URL de `order-logs` **sin** esa cabecera responde **401 "No autenticado"**. |
| P2 | Desde Apps Script (`UrlFetchApp`) y desde el navegador integrado de la app, `bigsmart.mx` respondió con la **verificación de Cloudflare** ("Verifique que es un ser humano"). |
| P3 | La API pública documentada (`api.bigsmart.mx/docs`) solo cubre login y creación de órdenes; **no** tiene rastreo. |

## No confirmado (requiere prueba aparte)

| # | Pregunta | Cómo se confirmaría |
|---|---|---|
| N1 | ¿Un servidor (IP de centro de datos) recibe la verificación de Cloudflare al abrir la página pública? | 1 sola carga con Playwright desde el VPS candidato, con aprobación del usuario. El contenedor de Claude no tiene salida a `bigsmart.mx`, por eso no se probó aquí. |
| N2 | ¿El `Bearer` es fijo, rota o depende del dominio/origen? | No se investiga: usarlo desde un servidor sería reutilizar una credencial interna del sitio sin permiso (ver decisión abajo). |
| N3 | Estructura exacta del JSON de `order-logs`. | No se descargó el cuerpo para no reutilizar la credencial; el extractor actual ya obtiene `cod/txt/fecha/lugar/estado` del DOM. |

## Decisión aplicada (del usuario, 19-nov y 20-nov)

No usar la API interna (`order-logs`) desde fuera de la página: exige una credencial que pertenece al sitio. Solo se **observó**. La vía legítima a la opción A es **pedir acceso oficial a BigSmart** (hay un correo preparado).

## Relación con el extractor actual

`order-logs` (JSON) → el componente `<bigsmart-tracking>` lo pinta → `enBigSmart()` lee `li.log` (`.log__code/.log__activity/.log__date/.log__location`) y `.stage--current .stage__name`. Leer la página pública = mismos datos que el JSON, sin tocar la credencial.
