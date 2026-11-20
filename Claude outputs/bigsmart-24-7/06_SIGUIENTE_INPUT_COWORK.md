# 06 · Siguiente encargo (para continuar)

Contexto: leer `01`–`05` de esta carpeta. Fuente: extensión 1.8.4 (SHA-256 del zip `2323449c…8926795`) + `apps-script/Rastreo.gs`.

Decisiones pendientes del usuario:
1. ¿Se envía hoy el correo a BigSmart pidiendo acceso oficial al rastreo? (opción A legítima)
2. ¿Se aprueba la prueba N1: un VPS pequeño, Playwright, UNA carga de la página con una guía autorizada? Indicar proveedor/región.
3. Mientras tanto, ¿se prepara una segunda computadora siempre encendida con la extensión (opción D, sin código nuevo)?

Siguiente paso técnico si N1 se aprueba: script de prueba de solo lectura en `Claude outputs/bigsmart-24-7/04_POC/` que abre la página con Playwright, ejecuta la misma lógica de `enBigSmart()` y guarda el resultado en un archivo local. Sin llamar al Web App, sin worker permanente. Se detiene ante verificación humana.

Límites que siguen vigentes: solo lectura; no evadir Cloudflare/CAPTCHA; no usar `order-logs` sin permiso de BigSmart; no migrar otros módulos.
