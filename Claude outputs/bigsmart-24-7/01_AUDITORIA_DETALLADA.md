# 01 · Auditoría detallada del lector de la Paquetería Dedicada Walmart (BigSmart) — extensión 1.8.4

Fecha: 20-nov-2026. Método: lectura del código fuente real (no se ejecutó la extensión ni se abrió el sitio para esta fase).

## 0. Identidad de la fuente (verificada)

| Archivo | SHA-256 |
|---|---|
| `extension-cookie-1.8.4.zip` (el del paquete) | `2323449c59894797ee55519b20151d3c25ad449f0f13880d1a53e735f8926795` |
| Mismo hash que el zip generado en la carpeta `Site Sheet` (deploy 1.8.4) | ✅ idéntico |
| `extension-cookie/background.js` dentro de 1.8.4 | `b74225de8a9af48a671bbd4befc9ad99d68bd486c45cb75e5d8a746efb473637` |

La auditoría preliminar del paquete dice que el Apps Script "no se aportó". **Sí está disponible**: vive en la misma carpeta (`Site Sheet\apps-script\Rastreo.gs`, `RastreoOdoo.gs`, `WebAPI.gs`, `ExtTurno.gs`). Abajo se documentan sus reglas reales.

## 1. Mapa del módulo de rastreo (background.js 1.8.4)

| Pieza | Línea | Qué hace |
|---|---|---|
| Constantes `RQ_*` | 994–998 | ciclo, lote, pausa, intentos, duración de vuelta |
| `rqAbrir(tabId, destino)` | 1002 | navega la pestaña de trabajo y espera (hasta 45 s) a que `status === 'complete'` **y** la URL sea del host destino |
| `enBigSmart()` | 1018–1038 | se inyecta en la página; lee el Shadow DOM (ver §3) |
| `enFedex()` | ~1042 | lector FedEx (fuera del alcance 24/7) |
| `rqCiclo(forzar)` | 1074–1132 | planificador de una vuelta |
| `tengoTurno()` | 96 | turno entre computadoras (Sheet `ext_turno`, caché 60 s, válido 20 min) |
| Alarma `rastreo` | 1308 | `periodInMinutes: RQ_CADA_MIN` |
| `REINT_MIN`, `REINT_SI`, `conReintento` | 1318–1326 | reintento rápido de lecturas fallidas |

## 2. Reglas comprobadas en el código

### 2.1 Extensión (background.js)
| Regla | Valor | Dónde |
|---|---|---|
| Ciclo | **cada 10 min** (`RQ_CADA_MIN = 10`); no hay ciclo de 5 min | 994, 1308 |
| Máximo por vuelta | **40 guías** (`RQ_LOTE = 40`) | 995, filtro en rqCiclo |
| Pausa entre guías | **4 s** (`RQ_PAUSA_MS = 4000`) | 996 |
| Intentos por guía en la misma vuelta | **3** (`RQ_INTENTOS`), espera 5 s × intento entre ellos | 997, bucle `while` |
| Duración máxima de vuelta | **7 min** (`RQ_VUELTA_MAX_MS`); lo que falte queda para la siguiente | 998 |
| Reintento de vuelta fallida | **2 min** (`REINT_MIN`) solo para `ocupado/red/sheet/rq_fallas…`; **no** para verificación humana (`cf`), sin sesión ni compras | 1318–1319 |
| Tope de espera de inyección | 60 s (`conTope`) | rqCiclo |
| Turno | solo trabaja la computadora con turno, salvo botón manual (`forzar`) | rqCiclo línea 1 |
| Filtro de entrada | guía `^[A-Za-z0-9]{8,30}$` y `paq` = `BIGSMART` o `FEDEX` | rqCiclo |
| Verificación humana | si aparece, **se detiene la vuelta** y se reporta; nunca se intenta resolver | `enBigSmart` + `if (r.cf) break` |
| Pestaña | una pestaña propia inactiva, `autoDiscardable:false`, se cierra al final | rqCiclo |

### 2.2 Apps Script (Rastreo.gs) — reglas de negocio
| Regla | Valor |
|---|---|
| Qué guías | ventas de **Ventas Walmart de los últimos 14 días** (`RQ_DIAS`); guía de `ENVIO GUIA` (site) o, si falta, de `TRACKING` (Seller Center); **no WFS** |
| Paquetería por formato | `MXFDDWM\d+` → BIGSMART; 10–15 dígitos → FEDEX; otra → no se consulta |
| Cadencia por guía | **cada 3 h** (`RQ_CADA_H`) mientras no tenga estado final |
| Guía que falló | se vuelve a pedir a los **10 min** (`RQ_REINT_MIN`) |
| Alerta roja | solo si la misma guía lleva **6 lecturas seguidas** sin datos (`RQ_FALLAS_ALERTA`, ~1 h) |
| Orden | las de `Fecha consulta` más vieja primero; lote de 40 |
| Finales (se dejan de buscar) | ENTREGADO, ROBADO, PERDIDO, DEVUELTO, CANCELADO CLIENTE (catálogo `RQ_BS` por código; texto si el código es nuevo) |
| 14 días sin final | `SIN FINAL EN 14 DIAS` y deja de buscarse |
| Escritura | hoja `PAQUETERIA` + columnas `PAQ …` en Ventas Walmart; empaque de Odoo (solo lectura) en `RastreoOdoo.gs` |
| Candado | `LockService` (lista 15 s, resultado 30 s); si está ocupado responde `nota: 'ocupado'` |

## 3. Cómo lee el Shadow DOM (`enBigSmart`)

1. Hasta **40 veces, cada 1 s**: primero revisa verificación humana en `document.title` + primeros 2000 caracteres del body (`verifique que es un ser humano | verify you are human | checking your browser | just a moment`) → `{ok:false, cf:true}`.
2. `document.querySelector('bigsmart-tracking').shadowRoot`.
3. Si hay `li.log`: por cada uno toma el texto (espacios colapsados) de `.log__code` → `cod`, `.log__activity` → `txt`, `.log__date` → `fecha`, `.log__location` → `lugar` (máx. 60). Estado actual: `.stage--current .stage__name` → `resumen`.
4. Si no hay logs pero hay `.feedback__text--error` → `{ok:false, error:…}` (guía no encontrada).
5. A los 40 s sin datos → `{ok:false, error:'… no mostro el historial'}`.
6. Orden: **lo más reciente primero** (verificado hoy con una guía real: 210 → 200 → 107 → … → 101).
7. Salida: `{ok, resumen, eventos:[{cod, txt, fecha, lugar}]}` (formato de fecha de la página: `19 nov 2026, 06:56 p.m.`).

## 4. Qué se reutiliza y qué se diseña de nuevo

| Pieza | Reutilizable tal cual | Nota |
|---|---|---|
| Selectores y lógica de `enBigSmart` | ✅ | función pura de DOM; corre igual en Playwright (`page.evaluate`) |
| Detección de verificación humana | ✅ | misma regla: detener y avisar |
| Reglas del Sheet (`rastreo_lista`/`rastreo_resultado`, catálogo, finales, 14 días, 3 h) | ✅ | el worker remoto puede llamar las **mismas** acciones del Web App con la misma clave |
| Turno (`ext_turno`) | ✅ | el worker se registra como una "computadora" más → no hay rastreo doble |
| Planificador (`rqCiclo`) | ⚠️ adaptar | cambiar `chrome.tabs/scripting` por Playwright; mismos tiempos |
| Pestaña/ventana de Chrome, `chrome.storage`, alarmas | ❌ rediseñar | en servidor: cron/loop + archivo/BD |
| Historial persistente + API REST propia | ❌ nuevo | hoy el historial vive en el Sheet (PAQUETERIA) |
| Cancelaciones, compra de guías, Seller Center, Odoo, cookie | 🚫 fuera de alcance | **no se migran ni se ejecutan** |

## 5. Hallazgos previos ya documentados (19-nov, en el Chrome real del usuario)

- La página llama a `https://api.bigsmart.mx/api/order-logs/<GUIA>?populate=true&summary=true&language=es`; **desde fuera responde 401 "No autenticado"**.
- Desde scripts (Apps Script `UrlFetchApp`) y desde el navegador integrado de la app, el sitio mostró la verificación "Verifique que es un ser humano". En el Chrome real del usuario no.
- La API pública documentada (`api.bigsmart.mx/docs`) solo cubre login y creación de órdenes, **no rastreo**.
- Decisión del usuario (19-nov): no usar esa API interna; leer la página pública. Hay un correo listo para pedir acceso oficial a BigSmart.

Estos puntos se reconfirman en la Fase 2 con una guía de prueba (ver `02_EVIDENCIA_NETWORK.md`).

## 6. Riesgos detectados en el código actual (no bloquean)

- La página de FedEx sale en español en el Chrome del usuario y `enFedex` busca "Travel History"; revisar (fuera del alcance 24/7).
- `rqCiclo` depende de que exista una ventana de Chrome; si no hay, abre una minimizada.
