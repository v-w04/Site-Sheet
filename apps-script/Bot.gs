/**
 * ============================================================
 *  Bot — correr desde el bot (Electrobot) las opciones del menú SITE SHEET
 * ============================================================
 *
 * BOT_MENU es la lista de las opciones del menú, SACADA de onOpen (Setup.gs): mismo orden, mismas etiquetas,
 * mismas funciones. Si cambias el menú, cambia también esta lista (la prueba t112.js compara las dos y avisa).
 * No se inventó nada: cada fila es un addItem real.
 *
 * Seguridad (misma puerta que la extensión: la "Clave de la extensión" del menú, con bloqueo tras varios fallos):
 *   - Lista blanca: solo corre una función que esté en BOT_MENU. El bot manda el nombre; aquí se vuelve a comprobar.
 *   - modo 'sheet'     → NO corre desde el bot: credenciales (nunca viajan por chat), envíos con ventana de PRUEBA y
 *                         cuenta regresiva, pasos que necesitan tu selección en la hoja, o cosas retiradas. El bot solo dice dónde está en el menú.
 *   - modo 'confirmar' → el bot debe mandar confirmado:true (la persona escribió "confirmar <opción>").
 *   - modo 'ok'        → corre directo.
 *   - Un dato que pida una opción (prompt) solo se contesta con lo que mande el bot en "entrada"; si el prompt
 *     habla de token/contraseña/clave/PIN/cookie se rechaza aunque venga entrada.
 *   - Una ventana con botones (formulario) NO se contesta sola: queda como "necesita ventana" y no se hace nada.
 *   - Todo queda en la hoja Log (etapa BOT).
 *
 * Cómo corre: doPost recibe 'bot_ejecutar', guarda el trabajo y programa UN activador de una sola vez (después de ~2 s)
 * que ejecuta la función SIN ventanas (las ventanas se simulan y su texto se guarda como resultado). Así una opción larga
 * no se corta por el tiempo de espera del navegador/bot; el bot pregunta con 'bot_estado'. El activador se borra solo.
 */

var BOT_ETAPA = 'BOT';
var BOT_PROP = 'BOT_JOB_';
var BOT_MAX_JOBS = 20;
var BOT_DIAG = 'botDiagnostico_';
var BOT_SECRETO_RE = /token|contrase|password|clave|\bpin\b|cookie|llave|secret/i;

/* {sec, etiqueta, fn, modo, motivo}  — GENERADO de onOpen; no editar a mano sin cambiar el menu */
var BOT_MENU = [
  {"sec": "", "etiqueta": "💲 Actualizar precios y killers (todo en orden)", "fn": "actualizarPreciosTodo", "modo": "ok", "motivo": ""},
  {"sec": "🔥 Killers", "etiqueta": "📋 Actualizar parrillas por KAM", "fn": "parrillasActualizar", "modo": "ok", "motivo": ""},
  {"sec": "🔥 Killers", "etiqueta": "⬇️ Bajar killers del site (y recalcular todo)", "fn": "killersBajarYRecalcular", "modo": "ok", "motivo": ""},
  {"sec": "🔥 Killers › 🎯 Killers activos y Comparar Walmart", "etiqueta": "🔄 Actualizar Killers activos y Comparar Walmart", "fn": "killersActivosActualizar", "modo": "ok", "motivo": ""},
  {"sec": "🔥 Killers › 🎯 Killers activos y Comparar Walmart", "etiqueta": "🎚️ Bandas de Comparar Walmart (DEJAR / REVISAR KAM)", "fn": "compararBandas", "modo": "ok", "motivo": ""},
  {"sec": "🔥 Killers › ✉️ Envíos a KAMs", "etiqueta": "1 · Solicitud del mes (todo)", "fn": "solicitudKillersEnviar", "modo": "sheet", "motivo": "Envío real (correo, Odoo o Walmart): se confirma en la ventana del Sheet, con PRUEBA primero y cuenta regresiva."},
  {"sec": "🔥 Killers › ✉️ Envíos a KAMs", "etiqueta": "2 · Nuevos + faltantes (sin killer)", "fn": "nuevosKillersEnviar", "modo": "sheet", "motivo": "Envío real (correo, Odoo o Walmart): se confirma en la ventana del Sheet, con PRUEBA primero y cuenta regresiva."},
  {"sec": "🔥 Killers › ✉️ Envíos a KAMs", "etiqueta": "3 · SOLO los nuevos", "fn": "soloNuevosKillersEnviar", "modo": "sheet", "motivo": "Envío real (correo, Odoo o Walmart): se confirma en la ventana del Sheet, con PRUEBA primero y cuenta regresiva."},
  {"sec": "🔥 Killers › ✉️ Envíos a KAMs", "etiqueta": "4 · Bajo mínimo", "fn": "kcEnviar", "modo": "sheet", "motivo": "Envío real (correo, Odoo o Walmart): se confirma en la ventana del Sheet, con PRUEBA primero y cuenta regresiva."},
  {"sec": "🔥 Killers › ✉️ Envíos a KAMs", "etiqueta": "🔎 Revisar correos de killers enviados", "fn": "killersRevisarEnviados", "modo": "ok", "motivo": ""},
  {"sec": "🔥 Killers › ✉️ Envíos a KAMs", "etiqueta": "✅ Verificar envíos en Gmail (columna en Envios killers)", "fn": "kvVerificarMenu", "modo": "ok", "motivo": ""},
  {"sec": "🔥 Killers › 📉 Bajo mínimo", "etiqueta": "📊 Calcular killers bajo mínimo", "fn": "kdBajar", "modo": "ok", "motivo": ""},
  {"sec": "🔥 Killers › 📉 Bajo mínimo", "etiqueta": "📋 Actualizar hoja Correo", "fn": "kcActualizar", "modo": "ok", "motivo": ""},
  {"sec": "🔥 Killers › 📉 Bajo mínimo", "etiqueta": "📄 Archivo de promociones para el site", "fn": "promosArchivoWalmart", "modo": "ok", "motivo": ""},
  {"sec": "💲 Precios", "etiqueta": "📤 Actualizar EXPORTAR, MINIMO y MAXIMO", "fn": "exportarPreciosWalmart", "modo": "ok", "motivo": ""},
  {"sec": "💲 Precios", "etiqueta": "🔍 Revisar precios erróneos de ventas Walmart", "fn": "preciosErroneosRevisar", "modo": "ok", "motivo": ""},
  {"sec": "💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)", "etiqueta": "1 · 🆕 Nuevo cambio", "fn": "wmNuevoCambio", "modo": "sheet", "motivo": "Necesita tu selección o una ventana con opciones dentro de la hoja."},
  {"sec": "💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)", "etiqueta": "1b · 📋 Pegar SKUs", "fn": "wmPegarSkus", "modo": "sheet", "motivo": "Necesita tu selección o una ventana con opciones dentro de la hoja."},
  {"sec": "💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)", "etiqueta": "2 · ✅ Marcar lo filtrado", "fn": "wmMarcarFiltrados", "modo": "sheet", "motivo": "Necesita tu selección o una ventana con opciones dentro de la hoja."},
  {"sec": "💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)", "etiqueta": "2 · 🔤 Marcar por texto", "fn": "wmMarcarPorTexto", "modo": "ok", "motivo": ""},
  {"sec": "💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)", "etiqueta": "2 · ☑️ Marcar todo", "fn": "wmMarcarTodo", "modo": "ok", "motivo": ""},
  {"sec": "💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)", "etiqueta": "2 · ⬜ Desmarcar todo", "fn": "wmDesmarcarTodo", "modo": "ok", "motivo": ""},
  {"sec": "💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)", "etiqueta": "3 · ✖️ Aplicar factor de precio", "fn": "wmAplicarFactor", "modo": "confirmar", "motivo": ""},
  {"sec": "💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)", "etiqueta": "4 · 📅 Aplicar fechas", "fn": "wmAplicarFechas", "modo": "confirmar", "motivo": ""},
  {"sec": "💲 Precios › 🏷 Cambio de precios (pasos 1 a 5)", "etiqueta": "5 · 📄 GENERAR ARCHIVO WALMART", "fn": "wmGenerarArchivo", "modo": "sheet", "motivo": "Necesita tu selección o una ventana con opciones dentro de la hoja."},
  {"sec": "📈 Ventas", "etiqueta": "🗃️ Bajar histórico de ventas Walmart (site)", "fn": "ventasHistoricoBajar", "modo": "ok", "motivo": ""},
  {"sec": "📈 Ventas", "etiqueta": "📈 Bajar ventas 30 dias", "fn": "ventas30Bajar", "modo": "ok", "motivo": ""},
  {"sec": "📈 Ventas › 💰 Venta total y killers (resumen del mes)", "etiqueta": "💰 Actualizar ventas con killer", "fn": "ventasKillersActualizar", "modo": "ok", "motivo": ""},
  {"sec": "📈 Ventas › 💰 Venta total y killers (resumen del mes)", "etiqueta": "🔁 Rehacer un mes cerrado", "fn": "ventasKillersRehacerMes", "modo": "sheet", "motivo": "Necesita tu selección o una ventana con opciones dentro de la hoja."},
  {"sec": "📈 Ventas › 🟣 Ventas CVA", "etiqueta": "🟣 Bajar ventas CVA (Odoo)", "fn": "ventasCvaBajar", "modo": "ok", "motivo": ""},
  {"sec": "📈 Ventas › 🟣 Ventas CVA", "etiqueta": "✉️ Mandar correo CVA pendiente", "fn": "ventasCvaCorreoAhora", "modo": "confirmar", "motivo": ""},
  {"sec": "📈 Ventas › 🧩 Combos", "etiqueta": "1 · Armar / actualizar candidatos (misma categoría)", "fn": "combosCandidatosActualizar", "modo": "ok", "motivo": ""},
  {"sec": "📈 Ventas › 🧩 Combos", "etiqueta": "2 · Pasar los SI a depurados (para el site)", "fn": "combosDepurar", "modo": "confirmar", "motivo": ""},
  {"sec": "🚫 Pedidos y casos", "etiqueta": "🔎 Consultar pedidos (site + guías)", "fn": "cpConsultar", "modo": "ok", "motivo": ""},
  {"sec": "🚫 Pedidos y casos", "etiqueta": "🌐 Abrir rastreo de todos los pedidos", "fn": "cpAbrirTodos", "modo": "ok", "motivo": ""},
  {"sec": "🚫 Pedidos y casos", "etiqueta": "💸 Bajar cobro distinto", "fn": "cobroDistintoBajar", "modo": "ok", "motivo": ""},
  {"sec": "🚫 Pedidos y casos", "etiqueta": "📂 Casos Walmart (revisar)", "fn": "casosWalmartRevisar", "modo": "ok", "motivo": ""},
  {"sec": "🚫 Pedidos y casos", "etiqueta": "📝 Casos: decidir y generar textos", "fn": "casosDecidirMenu", "modo": "ok", "motivo": ""},
  {"sec": "🚫 Pedidos y casos", "etiqueta": "📬 Pedidos en riesgo (revisar)", "fn": "pedidosRiesgoRevisar", "modo": "ok", "motivo": ""},
  {"sec": "🚫 Pedidos y casos › 📦 Sobreventa", "etiqueta": "📦 Revisar sobreventa (Walmart)", "fn": "revisarSobreventa", "modo": "ok", "motivo": ""},
  {"sec": "🚫 Pedidos y casos › 📦 Sobreventa", "etiqueta": "👁 Ver qué cancelaría la sobreventa", "fn": "cancelacionesSobreventaVer", "modo": "ok", "motivo": ""},
  {"sec": "🚫 Pedidos y casos › 📦 Sobreventa", "etiqueta": "❌ Cancelar en Odoo las marcadas de sobreventa", "fn": "cancelacionesSobreventaMarcadas", "modo": "confirmar", "motivo": ""},
  {"sec": "🚫 Pedidos y casos › ❌ Cancelaciones", "etiqueta": "📥 Leer cancelaciones del correo", "fn": "cancelacionesBajar", "modo": "ok", "motivo": ""},
  {"sec": "🚫 Pedidos y casos › ❌ Cancelaciones", "etiqueta": "📋 Pendientes de cancelar en el site", "fn": "cancelacionesPendientesSite", "modo": "ok", "motivo": ""},
  {"sec": "🚫 Pedidos y casos › ❌ Cancelaciones", "etiqueta": "📦 Marcar paquetería avisada", "fn": "cancelacionesMarcarAvisadas", "modo": "sheet", "motivo": "Pide confirmación en una ventana del Sheet: se corre desde el menú del Sheet."},
  {"sec": "🚫 Pedidos y casos › ❌ Cancelaciones", "etiqueta": "🧾 Verificar cancelaciones en Odoo", "fn": "cancelacionesVerificarOdoo", "modo": "ok", "motivo": ""},
  {"sec": "🚫 Pedidos y casos › ❌ Cancelaciones › ⚙️ Configurar", "etiqueta": "🔑 Guardar PIN y quién cancela", "fn": "cancelacionesGuardarPin", "modo": "sheet", "motivo": "Pide o borra credenciales: se captura en el Sheet, nunca por el bot."},
  {"sec": "🚫 Pedidos y casos › ❌ Cancelaciones › ⚙️ Configurar", "etiqueta": "⏱️ Activar cancelaciones automáticas", "fn": "cancelacionesActivarTrigger", "modo": "confirmar", "motivo": ""},
  {"sec": "🚫 Pedidos y casos › ❌ Cancelaciones › ⚙️ Configurar", "etiqueta": "🎨 Formato de cancelaciones", "fn": "cancelacionesFormato", "modo": "ok", "motivo": ""},
  {"sec": "🚫 Pedidos y casos › ❌ Cancelaciones › ⚙️ Configurar", "etiqueta": "↔️ Ordenar columnas de cancelaciones", "fn": "cancelacionesOrdenarColumnas", "modo": "ok", "motivo": ""},
  {"sec": "🚫 Pedidos y casos › 📄 Plantillas de caso Walmart", "etiqueta": "1 · Llenar datos (pedido o SKU)", "fn": "plantillasCasoLlenar", "modo": "ok", "motivo": ""},
  {"sec": "🚫 Pedidos y casos › 📄 Plantillas de caso Walmart", "etiqueta": "2 · Descargar: no se generó la guía", "fn": "plantillasCasoSinGuia", "modo": "ok", "motivo": ""},
  {"sec": "🚫 Pedidos y casos › 📄 Plantillas de caso Walmart", "etiqueta": "3 · Descargar: publicado y no visible (cualquier problema de publicación)", "fn": "plantillasCasoNoVisible", "modo": "ok", "motivo": ""},
  {"sec": "🏬 Catálogo Walmart", "etiqueta": "⬇️ Bajar catálogo de Walmart", "fn": "wmWalmartBajar", "modo": "ok", "motivo": ""},
  {"sec": "🏬 Catálogo Walmart", "etiqueta": "🔁 Actualizar hoja Republicar", "fn": "republicarActualizar", "modo": "ok", "motivo": ""},
  {"sec": "🏬 Catálogo Walmart › ⬇️ Bajar del site (corre solo cada hora)", "etiqueta": "🏷️ Bajar promociones del site", "fn": "promosBajar", "modo": "ok", "motivo": ""},
  {"sec": "🏬 Catálogo Walmart › ⬇️ Bajar del site (corre solo cada hora)", "etiqueta": "💰 Bajar comisiones del site", "fn": "comisionesBajar", "modo": "ok", "motivo": ""},
  {"sec": "🏬 Catálogo Walmart › ⬇️ Bajar del site (corre solo cada hora)", "etiqueta": "📦 Bajar catalogo CVA", "fn": "cvaCatalogoBajar", "modo": "ok", "motivo": ""},
  {"sec": "🏬 Catálogo Walmart › 📋 Walmart EDI", "etiqueta": "📋 Bajar lista Walmart EDI", "fn": "ediBajar", "modo": "ok", "motivo": ""},
  {"sec": "🏬 Catálogo Walmart › 📋 Walmart EDI", "etiqueta": "🔀 Cruzar EDI vs Bloqueados", "fn": "cruzarEdiBloqueados", "modo": "ok", "motivo": ""},
  {"sec": "🏬 Catálogo Walmart › 🧾 Listas para Walmart", "etiqueta": "📦 GTINs para convertir a WFS", "fn": "wmGtinsParaConvertir", "modo": "ok", "motivo": ""},
  {"sec": "🏬 Catálogo Walmart › 🧾 Listas para Walmart", "etiqueta": "🚫 Productos inactivos", "fn": "wmProductosInactivos", "modo": "ok", "motivo": ""},
  {"sec": "🏬 Catálogo Walmart › 🧾 Listas para Walmart", "etiqueta": "🧹 Publicaciones viejas a dar de baja", "fn": "resParaDesactivar", "modo": "ok", "motivo": ""},
  {"sec": "🏬 Catálogo Walmart › 🧬 Concentrado y variantes", "etiqueta": "🧱 Armar Concentrado", "fn": "armarConcentrado", "modo": "ok", "motivo": ""},
  {"sec": "🏬 Catálogo Walmart › 🧬 Concentrado y variantes", "etiqueta": "🧬 Armar Variantes", "fn": "armarVariantes", "modo": "ok", "motivo": ""},
  {"sec": "🏬 Catálogo Walmart › 🧬 Concentrado y variantes", "etiqueta": "🔗 Asignar variante a mano", "fn": "asignarVariante", "modo": "sheet", "motivo": "Necesita tu selección o una ventana con opciones dentro de la hoja."},
  {"sec": "🏬 Catálogo Walmart › 🧬 Concentrado y variantes", "etiqueta": "💰 Buscar oportunidades", "fn": "armarOportunidades", "modo": "ok", "motivo": ""},
  {"sec": "🚚 Logística › 🚚 Envíos WFS", "etiqueta": "📥 Actualizar ventas y calcular", "fn": "wfsActualizarMenu", "modo": "ok", "motivo": ""},
  {"sec": "🚚 Logística › 🚚 Envíos WFS", "etiqueta": "▶ Calcular envío WFS (sin traer ventas)", "fn": "wfsCalcularMenu", "modo": "ok", "motivo": ""},
  {"sec": "🚚 Logística › 🚚 Envíos WFS", "etiqueta": "🚚 Nuevo envío (hoja ENVIO)", "fn": "wfsNuevoEnvio", "modo": "sheet", "motivo": "Necesita tu selección o una ventana con opciones dentro de la hoja."},
  {"sec": "🚚 Logística › 🚚 Envíos WFS", "etiqueta": "✏️ Cambiar choferes y camionetas de un envío", "fn": "wfsCambiarChoferes", "modo": "sheet", "motivo": "Necesita tu selección o una ventana con opciones dentro de la hoja."},
  {"sec": "🚚 Logística › 🚚 Envíos WFS", "etiqueta": "📤 Copia para autorización", "fn": "wfsAutorizaCopia", "modo": "sheet", "motivo": "Envío real (correo, Odoo o Walmart): se confirma en la ventana del Sheet, con PRUEBA primero y cuenta regresiva."},
  {"sec": "🚚 Logística › 🚚 Envíos WFS", "etiqueta": "📥 Traer autorizado", "fn": "wfsAutorizaTraer", "modo": "sheet", "motivo": "Envío real (correo, Odoo o Walmart): se confirma en la ventana del Sheet, con PRUEBA primero y cuenta regresiva."},
  {"sec": "🚚 Logística › 🚚 Envíos WFS", "etiqueta": "📦 Crear traslado en Odoo (envío autorizado)", "fn": "wfsTrasladoOdoo", "modo": "sheet", "motivo": "Envío real (correo, Odoo o Walmart): se confirma en la ventana del Sheet, con PRUEBA primero y cuenta regresiva."},
  {"sec": "🚚 Logística › 🚚 Envíos WFS", "etiqueta": "📄 Archivo para importar el envío en Odoo", "fn": "wfsArchivoImportarOdoo", "modo": "ok", "motivo": ""},
  {"sec": "🚚 Logística › 🚚 Envíos WFS", "etiqueta": "📄 Plantilla de Walmart (WFS)", "fn": "wfsPlantillaWalmart", "modo": "sheet", "motivo": "Envío real (correo, Odoo o Walmart): se confirma en la ventana del Sheet, con PRUEBA primero y cuenta regresiva."},
  {"sec": "🚚 Logística › 🚚 Envíos WFS", "etiqueta": "📑 PDF del envío (CATEGORIA, NOMBRE, SKU, AUTORIZADO, GTIN)", "fn": "wfsPdfEnvio", "modo": "ok", "motivo": ""},
  {"sec": "🚚 Logística › 🚚 Envíos WFS", "etiqueta": "🗄 Archivar envíos y limpiar", "fn": "wfsArchivarEnvios", "modo": "confirmar", "motivo": ""},
  {"sec": "🚚 Logística › 🚚 Envíos WFS › 🧰 Herramientas WFS", "etiqueta": "🗑 Quitar copias sobrantes", "fn": "wfsAutorizaHuerfanas", "modo": "sheet", "motivo": "Necesita tu selección o una ventana con opciones dentro de la hoja."},
  {"sec": "🚚 Logística › 🚚 Envíos WFS › 🧰 Herramientas WFS", "etiqueta": "🚫 Restricciones WFS", "fn": "wfsRestricciones", "modo": "ok", "motivo": ""},
  {"sec": "🚚 Logística › 🚚 Envíos WFS › 🧰 Herramientas WFS", "etiqueta": "📊 Ver estado de WFS", "fn": "wfsVerEstado", "modo": "ok", "motivo": ""},
  {"sec": "🚚 Logística › 🚚 Envíos WFS › 🧰 Herramientas WFS", "etiqueta": "⏰ Encender cálculo automático (cada hora)", "fn": "wfsEncenderAuto", "modo": "confirmar", "motivo": ""},
  {"sec": "🚚 Logística › 🚚 Envíos WFS › 🧰 Herramientas WFS", "etiqueta": "🛑 Apagar cálculo automático", "fn": "wfsApagarAuto", "modo": "confirmar", "motivo": ""},
  {"sec": "🚚 Logística › 🚛 Recolección Walmart", "etiqueta": "📊 Estado (envío diario y formulario)", "fn": "recMenuEstado", "modo": "ok", "motivo": ""},
  {"sec": "🚚 Logística › 🚛 Recolección Walmart", "etiqueta": "🧪 Probar sin enviar", "fn": "recMenuProbar", "modo": "ok", "motivo": ""},
  {"sec": "🚚 Logística › 🚛 Recolección Walmart", "etiqueta": "📨 Enviar ahora", "fn": "recMenuEnviarAhora", "modo": "confirmar", "motivo": ""},
  {"sec": "🚚 Logística › 🚛 Recolección Walmart", "etiqueta": "📅 Pedir para otra fecha…", "fn": "recMenuOtraFecha", "modo": "sheet", "motivo": "Envío real (correo, Odoo o Walmart): se confirma en la ventana del Sheet, con PRUEBA primero y cuenta regresiva."},
  {"sec": "🚚 Logística › 🚛 Recolección Walmart", "etiqueta": "▶️ Instalar envío diario (L-V 7am)", "fn": "recMenuInstalar", "modo": "confirmar", "motivo": ""},
  {"sec": "🚚 Logística › 🚛 Recolección Walmart", "etiqueta": "🛑 Quitar envío diario", "fn": "recMenuQuitar", "modo": "confirmar", "motivo": ""},
  {"sec": "🧾 Cotizaciones", "etiqueta": "🆕 Nueva cotización", "fn": "cotNueva", "modo": "sheet", "motivo": "Necesita tu selección o una ventana con opciones dentro de la hoja."},
  {"sec": "🧾 Cotizaciones", "etiqueta": "🔎 Buscar productos", "fn": "cotBuscar", "modo": "sheet", "motivo": "Necesita tu selección o una ventana con opciones dentro de la hoja."},
  {"sec": "🧾 Cotizaciones", "etiqueta": "📄 Generar cotización", "fn": "cotGenerar", "modo": "ok", "motivo": ""},
  {"sec": "🧾 Cotizaciones", "etiqueta": "📚 Abrir historial", "fn": "cotAbrirHistorial", "modo": "ok", "motivo": ""},
  {"sec": "🧾 Cotizaciones", "etiqueta": "🧩 Reglas de búsqueda", "fn": "cotReglas", "modo": "ok", "motivo": ""},
  {"sec": "🧾 Cotizaciones", "etiqueta": "🔗 Usar otro libro de historial", "fn": "cotCambiarHistorial", "modo": "confirmar", "motivo": ""},
  {"sec": "🩺 Salud y diagnóstico", "etiqueta": "🩺 Salud del Sheet", "fn": "saludMenu", "modo": "ok", "motivo": ""},
  {"sec": "🩺 Salud y diagnóstico", "etiqueta": "📋 Reporte del día (hoja)", "fn": "reporteMenu", "modo": "ok", "motivo": ""},
  {"sec": "🩺 Salud y diagnóstico", "etiqueta": "🧪 Probar conexión", "fn": "uiProbar", "modo": "ok", "motivo": ""},
  {"sec": "🩺 Salud y diagnóstico", "etiqueta": "👁 Ver qué está configurado", "fn": "uiEstado", "modo": "ok", "motivo": ""},
  {"sec": "🩺 Salud y diagnóstico", "etiqueta": "📊 Consumo de UrlFetch hoy", "fn": "uiConsumo", "modo": "ok", "motivo": ""},
  {"sec": "🩺 Salud y diagnóstico", "etiqueta": "♻️ Reintentar tras cuota agotada", "fn": "limpiarFlagCuota", "modo": "ok", "motivo": ""},
  {"sec": "🩺 Salud y diagnóstico", "etiqueta": "🔑 Probar credenciales de killers", "fn": "killersProbarCredenciales", "modo": "ok", "motivo": ""},
  {"sec": "🩺 Salud y diagnóstico", "etiqueta": "🧭 Revisar columnas de todas las hojas", "fn": "revisarColumnas", "modo": "ok", "motivo": ""},
  {"sec": "🩺 Salud y diagnóstico › 🔍 Revisiones de datos", "etiqueta": "🔍 Revisar Concentrado", "fn": "revisarConcentrado", "modo": "ok", "motivo": ""},
  {"sec": "🩺 Salud y diagnóstico › 🔍 Revisiones de datos", "etiqueta": "🔍 Revisar variantes", "fn": "revisarVariantes", "modo": "ok", "motivo": ""},
  {"sec": "🩺 Salud y diagnóstico › 🔍 Revisiones de datos", "etiqueta": "🔍 Revisar triggers de esta cuenta", "fn": "revisarTriggers", "modo": "ok", "motivo": ""},
  {"sec": "🩺 Salud y diagnóstico › 🔍 Revisiones de datos", "etiqueta": "🔍 SKUs del inventario que faltan en Odoo", "fn": "revisarFaltantesEnCatalogo", "modo": "ok", "motivo": ""},
  {"sec": "🩺 Salud y diagnóstico › 🔍 Revisiones de datos", "etiqueta": "🔍 Marcas y colores sin traducir", "fn": "revisarSinTraducir", "modo": "ok", "motivo": ""},
  {"sec": "🩺 Salud y diagnóstico › 🔍 Revisiones de datos", "etiqueta": "🔍 Revisar encabezados de las hojas", "fn": "revisarEncabezados", "modo": "ok", "motivo": ""},
  {"sec": "🩺 Salud y diagnóstico › 🔍 Revisiones de datos", "etiqueta": "🧬 Ver estructura de killers", "fn": "killersVerEstructura", "modo": "ok", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › ⏱ Corridas automáticas", "etiqueta": "🔍 Ver triggers de este proyecto", "fn": "verTriggers", "modo": "ok", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › ⏱ Corridas automáticas", "etiqueta": "▶️ Activar TODAS las corridas", "fn": "instalarTriggers", "modo": "confirmar", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › ⏱ Corridas automáticas", "etiqueta": "🛑 Quitar corridas", "fn": "uiQuitarTriggers", "modo": "confirmar", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 📥 Históricos de una vez", "etiqueta": "📥 Traer septiembre y meses del archivo (una vez)", "fn": "traerHistoricoSeptiembre", "modo": "sheet", "motivo": "Lee Venta Diaria Odoo, que ya se retiró: no se corre desde el bot."},
  {"sec": "⚙️ Configuración y mantenimiento › 📥 Históricos de una vez", "etiqueta": "📥 Traer TODO de Venta Diaria (una vez)", "fn": "ventaDiariaTraerTodo", "modo": "sheet", "motivo": "Lee Venta Diaria Odoo, que ya se retiró: no se corre desde el bot."},
  {"sec": "⚙️ Configuración y mantenimiento › 🛠 Mantenimiento", "etiqueta": "🔄 Bajar TODO ahora", "fn": "uiBajarTodo", "modo": "ok", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🛠 Mantenimiento", "etiqueta": "🗂️ Ordenar hojas e índice", "fn": "orgOrdenar", "modo": "confirmar", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🛠 Mantenimiento", "etiqueta": "⬇️ Descargar una hoja como Excel", "fn": "descargarHoja", "modo": "ok", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🛠 Mantenimiento", "etiqueta": "💲 Solo precios (6 hojas)", "fn": "uiPrecios", "modo": "ok", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🛠 Mantenimiento", "etiqueta": "📦 Solo inventario", "fn": "uiStock", "modo": "ok", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🛠 Mantenimiento", "etiqueta": "🗂 Bajar catálogo de Odoo", "fn": "uiSincronizarCatalogo", "modo": "ok", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🛠 Mantenimiento", "etiqueta": "♻️ Rehacer hoja Walmart (forzado)", "fn": "wmWalmartBajarForzado", "modo": "confirmar", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🛠 Mantenimiento", "etiqueta": "🧩 Rehacer hoja Inventarios", "fn": "uiRehacerInventarios", "modo": "confirmar", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🛠 Mantenimiento", "etiqueta": "💥 Forzar rebajada completa", "fn": "uiForzar", "modo": "confirmar", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🛠 Mantenimiento", "etiqueta": "🧹 Quitar respaldos y hojas viejas", "fn": "limpiarHojasViejas", "modo": "confirmar", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🛠 Mantenimiento", "etiqueta": "🧹 Limpiar Log", "fn": "uiLimpiarLog", "modo": "confirmar", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🌐 Site y extensión", "etiqueta": "🔑 Configurar token API", "fn": "uiSetToken", "modo": "sheet", "motivo": "Pide o borra credenciales: se captura en el Sheet, nunca por el bot."},
  {"sec": "⚙️ Configuración y mantenimiento › 🌐 Site y extensión", "etiqueta": "🔐 Login automático del site", "fn": "uiSetLogin", "modo": "sheet", "motivo": "Pide o borra credenciales: se captura en el Sheet, nunca por el bot."},
  {"sec": "⚙️ Configuración y mantenimiento › 🌐 Site y extensión", "etiqueta": "🔁 Renovar cookie ahora", "fn": "uiRenovarCookie", "modo": "ok", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🌐 Site y extensión", "etiqueta": "🍪 Actualizar cookie a mano", "fn": "uiSetCookie", "modo": "sheet", "motivo": "Pide o borra credenciales: se captura en el Sheet, nunca por el bot."},
  {"sec": "⚙️ Configuración y mantenimiento › 🌐 Site y extensión", "etiqueta": "🧩 Clave de la extensión", "fn": "uiClaveExtension", "modo": "sheet", "motivo": "Pide o borra credenciales: se captura en el Sheet, nunca por el bot."},
  {"sec": "⚙️ Configuración y mantenimiento › 🌐 Site y extensión", "etiqueta": "✏️ Poner ruta de precios a mano", "fn": "uiSetRutaPrecios", "modo": "confirmar", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🌐 Site y extensión", "etiqueta": "✏️ Poner ruta de killers a mano", "fn": "killersRutaAMano", "modo": "confirmar", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🗄 Odoo", "etiqueta": "🗄 Conectar Odoo", "fn": "uiConectarOdoo", "modo": "sheet", "motivo": "Pide o borra credenciales: se captura en el Sheet, nunca por el bot."},
  {"sec": "⚙️ Configuración y mantenimiento › 🗄 Odoo", "etiqueta": "🔑 Guardar correo y contraseña de Odoo", "fn": "uiOdooLogin", "modo": "sheet", "motivo": "Pide o borra credenciales: se captura en el Sheet, nunca por el bot."},
  {"sec": "⚙️ Configuración y mantenimiento › 🗄 Odoo", "etiqueta": "🔐 Estado de la sesión de Odoo", "fn": "odooEstadoSesion", "modo": "ok", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🗄 Odoo", "etiqueta": "🩺 Diagnóstico de permisos de Odoo", "fn": "odooDiagnostico", "modo": "ok", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 🗄 Odoo", "etiqueta": "🧹 Borrar correo y contraseña de Odoo", "fn": "uiOdooLoginBorrar", "modo": "sheet", "motivo": "Pide o borra credenciales: se captura en el Sheet, nunca por el bot."},
  {"sec": "⚙️ Configuración y mantenimiento › 📋 Este libro y avisos", "etiqueta": "🏬 Conectar Walmart Dashboard", "fn": "wmDashboardConectar", "modo": "sheet", "motivo": "Pide o borra credenciales: se captura en el Sheet, nunca por el bot."},
  {"sec": "⚙️ Configuración y mantenimiento › 📋 Este libro y avisos", "etiqueta": "📋 Capturar ID del Sheet", "fn": "uiSetSheetId", "modo": "confirmar", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 📋 Este libro y avisos", "etiqueta": "🔒 Password del dashboard", "fn": "uiSetPassword", "modo": "sheet", "motivo": "Pide o borra credenciales: se captura en el Sheet, nunca por el bot."},
  {"sec": "⚙️ Configuración y mantenimiento › 📋 Este libro y avisos", "etiqueta": "📧 Poner correo de avisos", "fn": "uiSetCorreoAvisos", "modo": "confirmar", "motivo": ""},
  {"sec": "⚙️ Configuración y mantenimiento › 📋 Este libro y avisos", "etiqueta": "🗑 Borrar TODAS las credenciales", "fn": "uiBorrarTodo", "modo": "sheet", "motivo": "Pide o borra credenciales: se captura en el Sheet, nunca por el bot."}
];

/** Ruta tal como la ve la persona en el Sheet. */
function botRuta_(fila) {
  return 'SITE SHEET › ' + (fila.sec ? fila.sec + ' › ' : '') + fila.etiqueta;
}

function botBuscar_(fn) {
  for (var i = 0; i < BOT_MENU.length; i++) if (BOT_MENU[i].fn === fn) return BOT_MENU[i];
  return null;
}

function botFila_(f, i) {
  return { n: i + 1, sec: f.sec, etiqueta: f.etiqueta, fn: f.fn, modo: f.modo, motivo: f.motivo || '', ruta: botRuta_(f) };
}

/** Puerta de las acciones bot_*: devuelve un objeto JSON (doPost lo envuelve). */
function botAtender_(p) {
  var err = csAutorizar_(p); if (err) return err;
  try {
    var a = String(p.accion || '');
    if (a === 'bot_menu') return { ok: true, total: BOT_MENU.length, menu: BOT_MENU.map(botFila_) };
    if (a === 'bot_ejecutar') return botEncolar_(p);
    if (a === 'bot_estado') return botEstado_(p);
    if (a === 'bot_diagnostico') return botEncolar_({ fn: BOT_DIAG, confirmado: true });
    return { ok: false, error: 'accion_bot_desconocida' };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e).slice(0, 300) };
  }
}

/* ---------------- cola de trabajos (Script Properties) ---------------- */

function botLeer_(id) {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(BOT_PROP + id) || 'null'); } catch (e) { return null; }
}
function botGuardar_(j) {
  PropertiesService.getScriptProperties().setProperty(BOT_PROP + j.id, JSON.stringify(j));
}
function botTodos_() {
  var props = PropertiesService.getScriptProperties().getProperties(), out = [];
  Object.keys(props).forEach(function (k) {
    if (k.indexOf(BOT_PROP) !== 0) return;
    try { out.push(JSON.parse(props[k])); } catch (e) {}
  });
  out.sort(function (a, b) { return Number(a.creado) - Number(b.creado); });
  return out;
}
function botPodar_() {
  var todos = botTodos_(), sp = PropertiesService.getScriptProperties();
  while (todos.length > BOT_MAX_JOBS) sp.deleteProperty(BOT_PROP + todos.shift().id);
}

function botEntradaLimpia_(e) {
  var a = Array.isArray(e) ? e : (e == null || e === '' ? [] : [e]);
  return a.slice(0, 5).map(function (x) { return String(x).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 500); });
}

function botEncolar_(p) {
  var fn = String(p.fn || '');
  var diag = fn === BOT_DIAG;
  var fila = diag ? { sec: '', etiqueta: '🧪 Diagnóstico del bot', fn: BOT_DIAG, modo: 'ok', motivo: '' } : botBuscar_(fn);
  if (!fila) return { ok: false, error: 'no_esta_en_el_menu' };
  var modo = fila.modo;
  if (modo === 'sheet') return { ok: false, error: 'solo_desde_el_sheet', motivo: fila.motivo, ruta: botRuta_(fila), etiqueta: fila.etiqueta };
  if (modo === 'confirmar' && p.confirmado !== true) return { ok: false, error: 'falta_confirmar', ruta: botRuta_(fila), etiqueta: fila.etiqueta };
  if (!diag && typeof globalThis[fn] !== 'function') return { ok: false, error: 'la_funcion_no_existe' };

  var activos = botTodos_().filter(function (j) {
    return (j.estado === 'en_cola' || j.estado === 'corriendo') && Date.now() - Number(j.creado) < 10 * 60000;
  });
  if (activos.length) { var uno = activos.pop(); return { ok: false, error: 'ocupado', job: uno.id, etiqueta: uno.etiqueta }; }

  var j = { id: Utilities.getUuid().replace(/-/g, '').slice(0, 8), fn: fn, etiqueta: fila.etiqueta, modo: modo, confirmado: p.confirmado === true,
            entrada: botEntradaLimpia_(p.entrada), estado: 'en_cola', creado: Date.now() };
  botGuardar_(j);
  botPodar_();
  try { ScriptApp.newTrigger('botTrabajo').timeBased().after(2000).create(); }
  catch (e) {
    j.estado = 'error'; j.error = 'No se pudo programar la corrida: ' + String(e.message || e).slice(0, 160); botGuardar_(j);
    return { ok: false, error: 'sin_activador', detalle: j.error };
  }
  logInfo_(BOT_ETAPA, 'El bot pidió: ' + fila.etiqueta + ' (' + fn + ')' + (j.confirmado ? ' · confirmado' : ''));
  flushLog_();
  return { ok: true, job: j.id, etiqueta: fila.etiqueta };
}

function botEstado_(p) {
  var id = String(p.job || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
  var j = id ? botLeer_(id) : botTodos_().pop();
  if (!j) return { ok: false, error: 'no_existe' };
  // Si el activador no llegó (Google a veces lo pierde), la corrida se hace desde la consulta para que no se quede en cola.
  if (j.estado === 'en_cola' && Date.now() - Number(j.creado) > 75000) {
    logWarn_(BOT_ETAPA, 'El activador no arrancó la corrida de ' + j.etiqueta + '; se corre desde la consulta del bot');
    flushLog_();
    botTrabajo();
    j = botLeer_(j.id) || j;
  }
  return { ok: true, job: botVista_(j) };
}
function botVista_(j) {
  return { id: j.id, fn: j.fn, etiqueta: j.etiqueta, estado: j.estado, creado: j.creado || 0, inicio: j.inicio || 0, fin: j.fin || 0, salida: j.salida || '', retorno: j.retorno || '', necesita: j.necesita || [],
           error: j.error || '', seg: j.fin && j.inicio ? Math.round((j.fin - j.inicio) / 1000) : 0, ventanas: j.shim === false ? 'sin simular' : 'simuladas' };
}

/* ---------------- ejecución sin ventanas ---------------- */

function botBorrarActivadores_() {
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'botTrabajo') { try { ScriptApp.deleteTrigger(t); } catch (e) {} }
    });
  } catch (e) {}
}

/** La llama el activador de una sola vez que programó botEncolar_. OJO: sin guion bajo al final; Google no deja que un activador llame una función privada. */
function botTrabajo() {
  botBorrarActivadores_();
  var j = botTodos_().filter(function (x) { return x.estado === 'en_cola'; })[0];
  if (!j) return;
  j.estado = 'corriendo'; j.inicio = Date.now(); botGuardar_(j);
  var r = botCorrer_(j);
  j.salida = r.salida; j.retorno = r.retorno; j.necesita = r.necesita; j.error = r.error; j.shim = r.shim;
  j.estado = r.error ? 'error' : (r.necesita.length ? 'necesita' : 'ok');
  j.fin = Date.now();
  // Una propiedad guarda ~9 KB: si el resultado no cabe, se recorta.
  try { botGuardar_(JSON.stringify(j).length <= 8500 ? j : botMinimo_(j)); } catch (e) { botGuardar_(botMinimo_(j)); }
  var resumen = j.etiqueta + ' → ' + j.estado + (j.error ? ': ' + j.error : '') + (j.necesita.length ? ' · ' + j.necesita[0] : '');
  if (j.estado === 'ok') logOk_(BOT_ETAPA, 'Bot terminó: ' + resumen);
  else if (j.estado === 'necesita') logWarn_(BOT_ETAPA, 'Bot no pudo terminar: ' + resumen);
  else logErr_(BOT_ETAPA, 'Bot falló: ' + resumen);
  flushLog_();
}
function botMinimo_(j) {
  j.salida = String(j.salida || '').slice(0, 1500); j.retorno = String(j.retorno || '').slice(0, 500);
  j.necesita = (j.necesita || []).slice(0, 2).map(function (x) { return String(x).slice(0, 200); });
  j.error = String(j.error || '').slice(0, 300); j.entrada = [];
  return j;
}

function botQuitarEtiquetas_(html) {
  return String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>|<\/h\d>/gi, '\n')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

/** Ventana falsa: contesta lo seguro y anota todo. Nada de lo que pida una ventana con botones se contesta solo. */
function botUiFalsa_(j, sal, necesita) {
  var B = { OK: 'OK', CANCEL: 'CANCEL', YES: 'YES', NO: 'NO', CLOSE: 'CLOSE' };
  var BS = { OK: 'OK', OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO', YES_NO_CANCEL: 'YES_NO_CANCEL' };
  var anota = function (t) { if (t) sal.push(String(t)); };
  var par = function (a, b) { return typeof b === 'string' ? { titulo: String(a), texto: b } : { titulo: '', texto: String(a == null ? '' : a) }; };
  var ui = {
    Button: B, ButtonSet: BS,
    alert: function (a, b, c) {
      var pr = par(a, b), bs = typeof b === 'string' ? c : b, pregunta = bs !== undefined && bs !== BS.OK;
      anota((pr.titulo ? pr.titulo + ': ' : '') + pr.texto);
      if (!pregunta) return B.OK;
      if (j.confirmado && j.modo === 'confirmar') return (bs === BS.OK_CANCEL) ? B.OK : B.YES;
      necesita.push('pregunta: ' + (pr.titulo ? pr.titulo + ' — ' : '') + pr.texto.slice(0, 220));
      return (bs === BS.YES_NO) ? B.NO : B.CANCEL;
    },
    prompt: function (a, b) {
      var pr = par(a, b), txt = pr.titulo + ' ' + pr.texto;
      var resp = function (btn, v) { return { getSelectedButton: function () { return btn; }, getResponseText: function () { return v; } }; };
      anota('(pidió un dato) ' + txt.trim().slice(0, 200));
      if (BOT_SECRETO_RE.test(txt)) { necesita.push('dato sensible: ' + txt.trim().slice(0, 160) + ' (esto se captura en el Sheet, nunca por el bot)'); return resp(B.CANCEL, ''); }
      if (j.entrada && j.entrada.length) return resp(B.OK, j.entrada.shift());
      necesita.push('dato: ' + txt.trim().slice(0, 220));
      return resp(B.CANCEL, '');
    },
    showModalDialog: function (out, titulo) { botVentana_(out, titulo, sal, necesita); },
    showModelessDialog: function (out, titulo) { botVentana_(out, titulo, sal, necesita); },
    showSidebar: function (out) { botVentana_(out, 'Panel', sal, necesita); },
    createMenu: function () { var m = { addItem: function () { return m; }, addSeparator: function () { return m; }, addSubMenu: function () { return m; }, addToUi: function () {} }; return m; }
  };
  return ui;
}
function botVentana_(out, titulo, sal, necesita) {
  var html = '';
  try { html = out && out.getContent ? out.getContent() : String(out || ''); } catch (e) {}
  if (/google\.script\.run/.test(html)) { necesita.push('ventana con botones: ' + String(titulo || '') + ' (se contesta en el Sheet)'); return; }
  var t = botQuitarEtiquetas_(html).replace(/Entendido\s*$/, '').trim();
  sal.push((titulo ? titulo + ': ' : '') + t.slice(0, 1500));
}

/** Pone la ventana falsa en SpreadsheetApp.getUi y en los avisos propios del proyecto; devuelve cómo deshacerlo. */
function botPonerUi_(fake, sal, necesita, j) {
  var G = globalThis, resto = [], shim = false;
  var orig = G.SpreadsheetApp;
  try {
    var prox = new Proxy(orig, { get: function (t, k) { if (k === 'getUi') return function () { return fake; }; var v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
    G.SpreadsheetApp = prox;
    shim = G.SpreadsheetApp === prox;
    if (shim) resto.push(function () { G.SpreadsheetApp = orig; });
  } catch (e) { shim = false; }
  var cambia = function (nombre, f) {
    if (typeof G[nombre] !== 'function') return;
    var antes = G[nombre];
    try { G[nombre] = f; if (G[nombre] === f) resto.push(function () { G[nombre] = antes; }); } catch (e) {}
  };
  // Mismos avisos del proyecto, sin ventana: dejan su texto en la salida y en el Log (dlgLog_), igual que siempre.
  cambia('dlgInfo_', function (titulo, texto, tipo) { try { dlgLog_(tipo, titulo, texto); } catch (e) {} sal.push(String(titulo) + ': ' + String(texto == null ? '' : texto).slice(0, 1500)); });
  cambia('alertLog_', function (ui, a, b, c) { return fake.alert(a, b, c); });
  cambia('dlgEnvio_', function (cfg) { necesita.push('ventana de envío: ' + String((cfg && cfg.titulo) || 'envío') + ' (PRUEBA y envío real se confirman en el Sheet)'); });
  cambia('dlgOpciones_', function (cfg) { necesita.push('ventana con opciones: ' + String((cfg && cfg.titulo) || 'opciones') + ' (se elige en el Sheet)'); });
  return { shim: shim, deshacer: function () { while (resto.length) { try { resto.pop()(); } catch (e) {} } } };
}

function botCorrer_(j) {
  var sal = [], necesita = [], ret, error = '';
  var fake = botUiFalsa_(j, sal, necesita);
  var puesto = botPonerUi_(fake, sal, necesita, j);
  try {
    var f = j.fn === BOT_DIAG ? botDiagnostico_ : globalThis[j.fn];
    if (typeof f !== 'function') throw new Error('la función no existe');
    ret = f();
  } catch (e) {
    error = String(e && e.message ? e.message : e).split('\n')[0].slice(0, 300);
  } finally {
    puesto.deshacer();
  }
  var retorno = '';
  if (typeof ret === 'string') retorno = ret;
  else if (ret && typeof ret === 'object') { try { retorno = String(ret.resumen || ret.mensaje || JSON.stringify(ret)); } catch (e) {} }
  return { salida: sal.join('\n').slice(0, 3500), retorno: retorno.slice(0, 1200), necesita: necesita, error: error, shim: puesto.shim };
}

/** Prueba inocua para ver, desde el bot, que las ventanas se simulan en este despliegue. No escribe nada en las hojas. */
function botDiagnostico_() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Diagnóstico', 'Esta ventana se simula desde el bot.', ui.ButtonSet.OK);
  dlgInfo_('Diagnóstico', 'Aviso con formato simulado.', 'ok');
  return 'ventanas simuladas (alert devolvió ' + r + '); hoja activa: ' + (SpreadsheetApp.getActive() ? SpreadsheetApp.getActive().getName() : 'ninguna');
}
