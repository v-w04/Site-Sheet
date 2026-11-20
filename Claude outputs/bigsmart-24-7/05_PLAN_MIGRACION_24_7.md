# 05 · Plan de migración a 24/7

## Fase 0 — Ya disponible (sin código nuevo)
- Instalar la extensión 1.8.4 en una segunda computadora que se quede encendida (pasos en `site-sheet/instalar-extension-otra-pc.md`). El **turno** (`ext_turno`, 15 min) hace que solo una trabaje y la otra tome el relevo si la primera se apaga.
- Configurar esa máquina: sin suspensión, Chrome al iniciar sesión, Windows Update fuera de horario.

## Fase 1 — Pedir acceso oficial a BigSmart (opción A legítima)
- Enviar el correo preparado solicitando acceso de lectura al rastreo (API o webhook) para las guías de Electronics México.
- Si lo conceden: cliente HTTP en servidor con su credencial oficial; la extensión deja de leer BigSmart.

## Fase 2 — Prueba N1 (decide B)
- Con aprobación: un VPS pequeño, Playwright, **una sola** carga de la página con una guía autorizada.
- Si sale el historial → seguir a Fase 3. Si sale verificación de Cloudflare → B/C descartadas; quedarse con D (y A si BigSmart responde).

## Fase 3 — Worker B (solo si N1 sale bien)
`Web App rastreo_lista` → worker (cada 10 min, 40 guías, pausa 4 s, 3 intentos, vuelta ≤ 7 min, se detiene ante verificación) → `enBigSmart()` reutilizado con `page.evaluate` → `Web App rastreo_resultado`.
- El worker pide **turno** como una computadora más (`ext_turno`) → no hay rastreo doble; la extensión local sigue con sus demás módulos.
- Para que la extensión local deje de rastrear sin apagarse: interruptor "rastreo solo en el servidor" (opción en el Sheet), no desinstalar.
- Historial persistente: la hoja PAQUETERIA ya lo es; opcional base de datos propia después.

## Fase 4 — API propia (opcional)
`GET /v1/health`, `GET /v1/trackings`, `GET /v1/trackings/{guia}`, `GET /v1/trackings/{guia}/events`, con clave. Lee de lo ya guardado; nunca consulta a BigSmart en línea.

## Nunca
Migrar cancelaciones, compras de guías, Seller Center, Odoo o la cookie del site; evadir verificaciones; reutilizar la credencial interna de `order-logs`.
