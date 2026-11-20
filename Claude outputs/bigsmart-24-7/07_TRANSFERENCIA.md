# 07 · Transferencia

**Versión fuente:** extensión "Site Sheet - Cookie" 1.8.4. Zip SHA-256 `2323449c59894797ee55519b20151d3c25ad449f0f13880d1a53e735f8926795` (= el zip del paquete). `background.js` SHA-256 `b74225de8a9af48a671bbd4befc9ad99d68bd486c45cb75e5d8a746efb473637`. Apps Script: `Site Sheet/apps-script/Rastreo.gs`, `RastreoOdoo.gs`, `ExtTurno.gs`, `WebAPI.gs`.

**Hallazgos:**
- Reglas reales: extensión cada 10 min, 40 guías, pausa 4 s, 3 intentos, vuelta ≤ 7 min, reintento 2 min (no ante verificación); Sheet 14 días, cada 3 h por guía, reintento 10 min, alerta tras 6 fallas, estados finales por código.
- La página pide el historial a `api.bigsmart.mx/api/order-logs/<GUIA>` con un `Authorization: Bearer` que arma su propio script; sin él, 401.
- Desde scripts y navegadores no reales, Cloudflare desafió (19-nov). En el Chrome del usuario, nunca.

**Decisiones:** no usar `order-logs` sin permiso de BigSmart; solo lectura; no evadir verificaciones; no migrar otros módulos.

**Bloqueos:** la viabilidad de un servicio en la nube depende de la prueba N1 (VPS + Playwright, 1 carga). El contenedor de Claude no tiene salida a `bigsmart.mx`.

**Pendientes:** correo a BigSmart; aprobación y proveedor para N1; segunda computadora encendida (opción D) mientras tanto.

**04_POC:** no se creó: ninguna alternativa en servidor quedó comprobada como permitida y viable todavía.

**Comandos de despliegue:** ninguno en esta fase.
