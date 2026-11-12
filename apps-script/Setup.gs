/**
 * ============================================================
 *  Setup — menu del Sheet y captura de credenciales
 * ============================================================
 *
 *  Nada de credenciales toca un archivo. El patron comun es
 *  "edita la constante, corre la funcion y acuerdate de regresar
 *  el placeholder" — funciona hasta que alguien lo olvida, y
 *  entonces la credencial se va al historial de git para siempre.
 *
 *  Aqui se escribe en una ventanita y va directo a
 *  PropertiesService. No hay nada que se pueda olvidar de borrar.
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();

  /* Menu por AREA DE TRABAJO: arriba lo diario, abajo lo de una vez (salud, configuracion y mantenimiento).
     Dentro de cada familia, los pasos en el orden en que se hacen. La explicacion de cada opcion esta en la hoja
     "📖 Guía del menú" (Organizar.gs, ORG_GUIA_MENU): si cambias algo aqui, cambialo alla. */
  ui.createMenu('SITE SHEET')
    .addItem('💲 Actualizar precios y killers (todo en orden)', 'actualizarPreciosTodo')
    .addSeparator()
    .addSubMenu(
      ui.createMenu('🔥 Killers')
        .addItem('📋 Actualizar parrillas por KAM', 'parrillasActualizar')
        .addItem('⬇️ Bajar killers del site (y recalcular todo)', 'killersBajarYRecalcular')
        .addSubMenu(ui.createMenu('🎯 Killers activos y Comparar Walmart')
          .addItem('🔄 Actualizar Killers activos y Comparar Walmart', 'killersActivosActualizar')
          .addItem('🎚️ Bandas de Comparar Walmart (DEJAR / REVISAR KAM)', 'compararBandas'))
        .addSubMenu(ui.createMenu('✉️ Envíos a KAMs')
          .addItem('1 · Solicitud del mes (todo)', 'solicitudKillersEnviar')
          .addItem('2 · Nuevos + faltantes (sin killer)', 'nuevosKillersEnviar')
          .addItem('3 · SOLO los nuevos', 'soloNuevosKillersEnviar')
          .addItem('4 · Bajo mínimo', 'kcEnviar')
          .addSeparator()
          .addItem('🔎 Revisar correos de killers enviados', 'killersRevisarEnviados')
          .addItem('✅ Verificar envíos en Gmail (columna en Envios killers)', 'kvVerificarMenu'))
        .addSubMenu(ui.createMenu('📉 Bajo mínimo')
          .addItem('📊 Calcular killers bajo mínimo', 'kdBajar')
          .addItem('📋 Actualizar hoja Correo', 'kcActualizar')
          .addItem('📄 Archivo de promociones para el site', 'promosArchivoWalmart'))
    )
    .addSubMenu(
      ui.createMenu('💲 Precios')
        .addItem('📤 Actualizar EXPORTAR, MINIMO y MAXIMO', 'exportarPreciosWalmart')
        .addItem('🔍 Revisar precios erróneos de ventas Walmart', 'preciosErroneosRevisar')
        .addSubMenu(ui.createMenu('🏷 Cambio de precios (pasos 1 a 5)')
          .addItem('1 · 🆕 Nuevo cambio', 'wmNuevoCambio')
          .addItem('1b · 📋 Pegar SKUs', 'wmPegarSkus')
          .addItem('2 · ✅ Marcar lo filtrado', 'wmMarcarFiltrados')
          .addItem('2 · 🔤 Marcar por texto', 'wmMarcarPorTexto')
          .addItem('2 · ☑️ Marcar todo', 'wmMarcarTodo')
          .addItem('2 · ⬜ Desmarcar todo', 'wmDesmarcarTodo')
          .addItem('3 · ✖️ Aplicar factor de precio', 'wmAplicarFactor')
          .addItem('4 · 📅 Aplicar fechas', 'wmAplicarFechas')
          .addItem('5 · 📄 GENERAR ARCHIVO WALMART', 'wmGenerarArchivo'))
    )
    .addSubMenu(
      ui.createMenu('📈 Ventas')
        .addItem('🗃️ Bajar histórico de ventas Walmart (site)', 'ventasHistoricoBajar')
        .addItem('📈 Bajar ventas 30 dias', 'ventas30Bajar')
        .addSubMenu(ui.createMenu('💰 Venta total y killers (resumen del mes)')
          .addItem('💰 Actualizar ventas con killer', 'ventasKillersActualizar')
          .addItem('🔁 Rehacer un mes cerrado', 'ventasKillersRehacerMes'))
        .addSubMenu(ui.createMenu('🟣 Ventas CVA')
          .addItem('🟣 Bajar ventas CVA (Odoo)', 'ventasCvaBajar')
          .addItem('✉️ Mandar correo CVA pendiente', 'ventasCvaCorreoAhora'))
    )
    .addSubMenu(
      ui.createMenu('🚫 Pedidos y casos')
        .addItem('🔎 Consultar pedidos (site + guías)', 'cpConsultar')
        .addItem('🌐 Abrir rastreo de todos los pedidos', 'cpAbrirTodos')
        .addItem('💸 Bajar cobro distinto', 'cobroDistintoBajar')
        .addItem('📂 Casos Walmart (revisar)', 'casosWalmartRevisar')
        .addItem('📬 Pedidos en riesgo (revisar)', 'pedidosRiesgoRevisar')
        .addSubMenu(ui.createMenu('📦 Sobreventa')
          .addItem('📦 Revisar sobreventa (Walmart)', 'revisarSobreventa')
          .addItem('👁 Ver qué cancelaría la sobreventa', 'cancelacionesSobreventaVer')
          .addItem('❌ Cancelar en Odoo las marcadas de sobreventa', 'cancelacionesSobreventaMarcadas'))
        .addSubMenu(ui.createMenu('❌ Cancelaciones')
          .addItem('📥 Leer cancelaciones del correo', 'cancelacionesBajar')
          .addItem('📋 Pendientes de cancelar en el site', 'cancelacionesPendientesSite')
          .addItem('🧾 Verificar cancelaciones en Odoo', 'cancelacionesVerificarOdoo')
          .addItem('🧪 Probar cancelación en Walmart (solo lee)', 'cancelacionesWalmartProbar')
          .addItem('❌ CANCELAR EN WALMART las marcadas', 'cancelacionesWalmartCancelar')
          .addSubMenu(ui.createMenu('⚙️ Configurar')
            .addItem('🔑 Guardar PIN y quién cancela', 'cancelacionesGuardarPin')
            .addItem('🔑 Guardar credenciales Walmart (API)', 'cancelacionesWalmartCredenciales')
            .addItem('⏱️ Activar cancelaciones automáticas', 'cancelacionesActivarTrigger')
            .addItem('🎨 Formato de cancelaciones', 'cancelacionesFormato')
            .addItem('↔️ Ordenar columnas de cancelaciones', 'cancelacionesOrdenarColumnas')))
        .addSubMenu(ui.createMenu('📄 Plantillas de caso Walmart')
          .addItem('1 · Llenar datos (pedido o SKU)', 'plantillasCasoLlenar')
          .addItem('2 · Descargar: no se generó la guía', 'plantillasCasoSinGuia')
          .addItem('3 · Descargar: publicado y no visible (cualquier problema de publicación)', 'plantillasCasoNoVisible'))
    )
    .addSubMenu(
      ui.createMenu('🏬 Catálogo Walmart')
        .addItem('⬇️ Bajar catálogo de Walmart', 'wmWalmartBajar')
        .addItem('🔁 Actualizar hoja Republicar', 'republicarActualizar')
        .addSubMenu(ui.createMenu('⬇️ Bajar del site (corre solo cada hora)')
          .addItem('🏷️ Bajar promociones del site', 'promosBajar')
          .addItem('💰 Bajar comisiones del site', 'comisionesBajar')
          .addItem('📦 Bajar catalogo CVA', 'cvaCatalogoBajar'))
        .addSubMenu(ui.createMenu('📋 Walmart EDI')
          .addItem('📋 Bajar lista Walmart EDI', 'ediBajar')
          .addItem('🔀 Cruzar EDI vs Bloqueados', 'cruzarEdiBloqueados'))
        .addSubMenu(ui.createMenu('🧾 Listas para Walmart')
          .addItem('📦 GTINs para convertir a WFS', 'wmGtinsParaConvertir')
          .addItem('🚫 Productos inactivos', 'wmProductosInactivos')
          .addItem('🧹 Publicaciones viejas a dar de baja', 'resParaDesactivar'))
        .addSubMenu(ui.createMenu('🧬 Concentrado y variantes')
          .addItem('🧱 Armar Concentrado', 'armarConcentrado')
          .addItem('🧬 Armar Variantes', 'armarVariantes')
          .addItem('🔗 Asignar variante a mano', 'asignarVariante')
          .addItem('💰 Buscar oportunidades', 'armarOportunidades'))
    )
    .addSubMenu(
      ui.createMenu('🚚 Logística')
        .addSubMenu(ui.createMenu('🚚 Envíos WFS')
          .addItem('📥 Actualizar ventas y calcular', 'wfsActualizarMenu')
          .addItem('▶ Calcular envío WFS (sin traer ventas)', 'wfsCalcularMenu')
          .addSeparator()
          .addItem('🚚 Nuevo envío (hoja ENVIO)', 'wfsNuevoEnvio')
          .addItem('✏️ Cambiar choferes y camionetas de un envío', 'wfsCambiarChoferes')
          .addItem('📤 Copia para autorización', 'wfsAutorizaCopia')
          .addItem('📥 Traer autorizado', 'wfsAutorizaTraer')
          .addItem('📦 Crear traslado en Odoo (envío autorizado)', 'wfsTrasladoOdoo')
          .addItem('📄 Archivo para importar el envío en Odoo', 'wfsArchivoImportarOdoo')
          .addItem('📄 Plantilla de Walmart (WFS)', 'wfsPlantillaWalmart')
          .addItem('📑 PDF del envío (CATEGORIA, NOMBRE, SKU, AUTORIZADO, GTIN)', 'wfsPdfEnvio')
          .addItem('🗄 Archivar envíos y limpiar', 'wfsArchivarEnvios')
          .addSeparator()
          .addSubMenu(ui.createMenu('🧰 Herramientas WFS')
            .addItem('🗑 Quitar copias sobrantes', 'wfsAutorizaHuerfanas')
            .addItem('🚫 Restricciones WFS', 'wfsRestricciones')
            .addItem('📊 Ver estado de WFS', 'wfsVerEstado')
            .addItem('⏰ Encender cálculo automático (cada hora)', 'wfsEncenderAuto')
            .addItem('🛑 Apagar cálculo automático', 'wfsApagarAuto')))
        .addSubMenu(ui.createMenu('🚛 Recolección Walmart')
          .addItem('📊 Estado (envío diario y formulario)', 'recMenuEstado')
          .addItem('🧪 Probar sin enviar', 'recMenuProbar')
          .addItem('📨 Enviar ahora', 'recMenuEnviarAhora')
          .addSeparator()
          .addItem('▶️ Instalar envío diario (L-V 7am)', 'recMenuInstalar')
          .addItem('🛑 Quitar envío diario', 'recMenuQuitar'))
    )
    .addSubMenu(
      ui.createMenu('🧾 Cotizaciones')
        .addItem('🆕 Nueva cotización', 'cotNueva')
        .addItem('🔎 Buscar productos', 'cotBuscar')
        .addItem('📄 Generar cotización', 'cotGenerar')
        .addSeparator()
        .addItem('📚 Abrir historial', 'cotAbrirHistorial')
        .addItem('🧩 Reglas de búsqueda', 'cotReglas')
        .addItem('🔗 Usar otro libro de historial', 'cotCambiarHistorial')
    )
    .addSeparator()
    .addSubMenu(
      ui.createMenu('🩺 Salud y diagnóstico')
        .addItem('🩺 Salud del Sheet', 'saludMenu')
        .addItem('🧪 Probar conexión', 'uiProbar')
        .addItem('👁 Ver qué está configurado', 'uiEstado')
        .addItem('📊 Consumo de UrlFetch hoy', 'uiConsumo')
        .addItem('♻️ Reintentar tras cuota agotada', 'limpiarFlagCuota')
        .addItem('🔑 Probar credenciales de killers', 'killersProbarCredenciales')
        .addItem('🧭 Revisar columnas de todas las hojas', 'revisarColumnas')
        .addSubMenu(ui.createMenu('🔍 Revisiones de datos')
          .addItem('🔍 Revisar Concentrado', 'revisarConcentrado')
          .addItem('🔍 Revisar variantes', 'revisarVariantes')
          .addItem('🔍 Revisar triggers de esta cuenta', 'revisarTriggers')
          .addItem('🔍 SKUs del inventario que faltan en Odoo', 'revisarFaltantesEnCatalogo')
          .addItem('🔍 Marcas y colores sin traducir', 'revisarSinTraducir')
          .addItem('🔍 Revisar encabezados de las hojas', 'revisarEncabezados')
          .addItem('🧬 Ver estructura de killers', 'killersVerEstructura'))
    )
    .addSubMenu(
      ui.createMenu('⚙️ Configuración y mantenimiento')
        .addSubMenu(ui.createMenu('⏱ Corridas automáticas')
          .addItem('🔍 Ver triggers de este proyecto', 'verTriggers')
          .addItem('▶️ Activar TODAS las corridas', 'instalarTriggers')
          .addItem('🛑 Quitar corridas', 'uiQuitarTriggers'))
        .addSubMenu(ui.createMenu('📥 Históricos de una vez')
          .addItem('📥 Traer septiembre y meses del archivo (una vez)', 'traerHistoricoSeptiembre')
          .addItem('📥 Traer TODO de Venta Diaria (una vez)', 'ventaDiariaTraerTodo'))
        .addSubMenu(ui.createMenu('🛠 Mantenimiento')
          .addItem('🔄 Bajar TODO ahora', 'uiBajarTodo')
          .addItem('🗂️ Ordenar hojas e índice', 'orgOrdenar')
          .addItem('⬇️ Descargar una hoja como Excel', 'descargarHoja')
          .addSeparator()
          .addItem('💲 Solo precios (6 hojas)', 'uiPrecios')
          .addItem('📦 Solo inventario', 'uiStock')
          .addItem('🗂 Bajar catálogo de Odoo', 'uiSincronizarCatalogo')
          .addSeparator()
          .addItem('♻️ Rehacer hoja Walmart (forzado)', 'wmWalmartBajarForzado')
          .addItem('🧩 Rehacer hoja Inventarios', 'uiRehacerInventarios')
          .addItem('💥 Forzar rebajada completa', 'uiForzar')
          .addSeparator()
          .addItem('🧹 Quitar respaldos y hojas viejas', 'limpiarHojasViejas')
          .addItem('🧹 Limpiar Log', 'uiLimpiarLog'))
        .addSubMenu(ui.createMenu('🌐 Site y extensión')
          .addItem('🔑 Configurar token API', 'uiSetToken')
          .addItem('🔐 Login automático del site', 'uiSetLogin')
          .addItem('🔁 Renovar cookie ahora', 'uiRenovarCookie')
          .addItem('🍪 Actualizar cookie a mano', 'uiSetCookie')
          .addItem('🧩 Clave de la extensión', 'uiClaveExtension')
          .addItem('✏️ Poner ruta de precios a mano', 'uiSetRutaPrecios')
          .addItem('✏️ Poner ruta de killers a mano', 'killersRutaAMano'))
        .addSubMenu(ui.createMenu('🗄 Odoo')
          .addItem('🗄 Conectar Odoo', 'uiConectarOdoo')
          .addItem('🔑 Guardar correo y contraseña de Odoo', 'uiOdooLogin')
          .addItem('🔐 Estado de la sesión de Odoo', 'odooEstadoSesion')
          .addItem('🩺 Diagnóstico de permisos de Odoo', 'odooDiagnostico')
          .addItem('🧹 Borrar correo y contraseña de Odoo', 'uiOdooLoginBorrar'))
        .addSubMenu(ui.createMenu('📋 Este libro y avisos')
          .addItem('🏬 Conectar Walmart Dashboard', 'wmDashboardConectar')
          .addItem('📋 Capturar ID del Sheet', 'uiSetSheetId')
          .addItem('🔒 Password del dashboard', 'uiSetPassword')
          .addItem('📧 Poner correo de avisos', 'uiSetCorreoAvisos')
          .addSeparator()
          .addItem('🗑 Borrar TODAS las credenciales', 'uiBorrarTodo'))
    )
    .addToUi();
}

/* ================ CREDENCIALES ================ */

function uiSetToken() {
  var ui = SpreadsheetApp.getUi();
  var actual = props_().getProperty(PROP.TOKEN);

  var r = ui.prompt('Token API',
    'Actual: ' + (actual ? 'configurado (' + actual.length + ' caracteres)' : '(ninguno)') + '\n\n' +
    'Pega tu llave del site (empieza con emk_). Solo lectura.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var v = String(r.getResponseText() || '').trim().replace(/^["']|["']$/g, '');
  if (!v) { alertLog_(ui, 'No se guardo nada (campo vacio).'); return; }

  props_().setProperty(PROP.TOKEN, v);
  alertLog_(ui, 'Token guardado', 'Corre "Probar conexion" para validarlo.', ui.ButtonSet.OK);
}

function uiSetLogin() {
  var ui = SpreadsheetApp.getUi();
  var p = props_();

  var aviso = alertLog_(ui, 'Login automático',
    'El script entra solo al site cuando la cookie se cae.\n\n' +
    'Ojo: tu contraseña queda en Script Properties (no en el repo);\n' +
    'quien edite este Apps Script podría leerla. Mejor: token de API.\n\n' +
    '¿Continuamos?',
    ui.ButtonSet.YES_NO);
  if (aviso !== ui.Button.YES) return;

  var u = ui.prompt('Correo del site',
    'El de electronicsmexico.site',
    ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  var usuario = String(u.getResponseText() || '').trim();
  if (!usuario) return;

  var c = ui.prompt('Contraseña del site',
    'Se guarda en Script Properties, no en el repo.',
    ui.ButtonSet.OK_CANCEL);
  if (c.getSelectedButton() !== ui.Button.OK) return;
  var clave = String(c.getResponseText() || '');
  if (!clave) return;

  p.setProperties({ SITE_USER: usuario, SITE_PASS: clave }, false);

  // Se prueba de una vez: guardar credenciales que no sirven y enterarse
  // dentro de una semana, cuando venza la cookie, es lo peor que puede pasar.
  alertLog_(ui, 'Guardado', 'Lo pruebo con un login real.', ui.ButtonSet.OK);

  var ok = false;
  try { ok = renovarCookie_(); } catch (e) {} finally { flushLog_(); }

  if (ok) {
    var extra = '';
    try {
      var t = fetchSitio_(RUTA_STOCK);
      extra = '\nEl site contestó: ' + (t.total_skus || 0) + ' SKUs.';
    } catch (e) { extra = '\nCookie guardada, pero el endpoint falló: ' + e.message; }

    alertLog_(ui, '✅ Login automático funcionando',
      'Cookie nueva guardada.' + extra + '\nSi se cae, se reconecta solo.',
      ui.ButtonSet.OK);
  } else {
    alertLog_(ui, 'No pude entrar',
      'Detalle en el Log.\n' +
      'Causas comunes: correo/contraseña, ruta de login distinta, captcha.',
      ui.ButtonSet.OK);
  }
}

function uiRenovarCookie() {
  var ui = SpreadsheetApp.getUi();

  if (!puedeRenovarSolo_()) {
    alertLog_(ui, 'Falta el login',
      'Primero configura 🔐 Login automático del site.', ui.ButtonSet.OK);
    return;
  }

  var ok = false;
  try { ok = renovarCookie_(); } finally { flushLog_(); }

  alertLog_(ui, ok ? '✅ Cookie renovada' : 'No se pudo',
    ok ? 'Cookie nueva guardada.'
       : 'Detalle en el Log.',
    ui.ButtonSet.OK);
}

function uiSetCookie() {
  var ui = SpreadsheetApp.getUi();
  var actual = props_().getProperty(PROP.COOKIE);

  var r = ui.prompt('Cookie de sesion (respaldo)',
    'Actual: ' + (actual ? actual.substring(0, 20) + '...' : '(ninguna)') + '\n\n' +
    'Valor de la cookie "session" (empieza con eyJ...).\n' +
    'DevTools > Application > Cookies. Vence sola: mejor el token.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var v = String(r.getResponseText() || '').trim()
    .replace(/^session\s*=\s*/i, '').replace(/^["']|["']$/g, '').trim();
  if (!v) { alertLog_(ui, 'No se guardo nada (campo vacio).'); return; }

  guardarCookie_(v);
  alertLog_(ui, 'Cookie guardada', 'Corre "Probar conexion" para validarla.', ui.ButtonSet.OK);
}

/** Correo al que llegan los avisos (cookie vencida, etc.). Se guarda en Script Properties. */
function uiSetCorreoAvisos() {
  var ui = SpreadsheetApp.getUi();
  var actual = props_().getProperty('AVISO_CORREO') || '';
  var r = ui.prompt('Correo de avisos',
    'Actual: ' + (actual || '(ninguno)') + '\n\n' +
    'Correo para los avisos (cookie vencida, etc.):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var v = String(r.getResponseText() || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { alertLog_(ui, 'Ese correo no se ve bien. No se guardo nada.'); return; }
  props_().setProperty('AVISO_CORREO', v);
  propsUser_().deleteProperty('AVISO_CRED_DIA');
  alertLog_(ui, 'Listo', 'Los avisos van a ' + v + '.', ui.ButtonSet.OK);
}

/* ================ DESCUBRIR EL ENDPOINT DE PRECIOS ================ */

function uiSetRutaPrecios() {
  var ui = SpreadsheetApp.getUi();

  var r = ui.prompt('Ruta de precios',
    'Actual: ' + (metodoPrecios_().toUpperCase()) + ' ' +
    (props_().getProperty(PROP.RUTA_PRE) || '(ninguna)') + '\n\n' +
    'Sin dominio. Ej: /precios-em/api/lista',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var ruta = String(r.getResponseText() || '').trim();
  if (!ruta) return;

  var r2 = alertLog_(ui, '¿Con qué método?',
    '/precios-em/api/* es POST.\n\n' +
    'SÍ = POST (filtros en JSON)\nNO = GET (filtros en la URL)',
    ui.ButtonSet.YES_NO);
  var metodo = (r2 === ui.Button.YES) ? 'post' : 'get';

  props_().setProperties({ RUTA_PRECIOS: ruta, METODO_PRECIOS: metodo }, false);
  props_().deleteProperty('PLANTILLA_PRECIOS');   // volver a la de cada metodo

  var r3 = ui.prompt('Cómo recibe master y banda',
    'Plantilla actual:\n' + plantillaPrecios_() + '\n\n' +
    '{master} se cambia por elemex o cva\n' +
    '{banda} se cambia por minimo, normal o maximo\n\n' +
    'Enter para dejar la de siempre.',
    ui.ButtonSet.OK_CANCEL);
  if (r3.getSelectedButton() === ui.Button.OK) {
    var pl = String(r3.getResponseText() || '').trim();
    if (pl) props_().setProperty('PLANTILLA_PRECIOS', pl);
  }

  alertLog_(ui, 'Guardado',
    metodo.toUpperCase() + ' ' + ruta + '\n' + plantillaPrecios_(),
    ui.ButtonSet.OK);
}

/* ================ RESTO DE LA CONFIG ================ */

function uiSetSheetId() {
  var ui = SpreadsheetApp.getUi();
  var activo = SpreadsheetApp.getActiveSpreadsheet();

  var r = ui.prompt('ID del Sheet',
    'La parte larga de la URL, entre /d/ y /edit.\n\n' +
    (activo ? 'Esta hoja es:\n' + activo.getId() : ''),
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var v = String(r.getResponseText() || '').trim();
  if (!v) return;
  props_().setProperty(PROP.SHEET_ID, v);
  alertLog_(ui, 'Guardado', 'ID del Sheet configurado.', ui.ButtonSet.OK);
}

function uiSetPassword() {
  var ui = SpreadsheetApp.getUi();

  var r = ui.prompt('Password del dashboard',
    'Minimo 12 caracteres, y que no sea palabra de diccionario:\n' +
    'el dashboard esta en internet y el password es el unico porton.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var pw = String(r.getResponseText() || '');
  if (pw.length < 12) {
    alertLog_(ui, 'Muy corto', 'Necesita al menos 12 caracteres. No se guardo nada.', ui.ButtonSet.OK);
    return;
  }

  var r2 = ui.prompt('Repitelo', 'Solo para asegurar que no hubo dedazo.', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  if (String(r2.getResponseText() || '') !== pw) {
    alertLog_(ui, 'No coinciden', 'No se guardo nada.', ui.ButtonSet.OK);
    return;
  }

  guardarPassword_(pw);
  alertLog_(ui, 'Guardado',
    'Se guarda como hash: si lo olvidas, pon uno nuevo.',
    ui.ButtonSet.OK);
}

/* ================ DIAGNOSTICO ================ */

function uiProbar() {
  var ui = SpreadsheetApp.getUi();
  var lineas = [];

  try {
    var stock = fetchSitio_(RUTA_STOCK);
    lineas.push('INVENTARIO  OK');
    lineas.push('  SKUs: ' + (stock.total_skus || 0) +
                '  |  items: ' + (stock.items ? stock.items.length : 0) +
                '  |  cache: ' + (stock.cache ? 'si' : 'no') +
                ' (' + (stock.edad || 0) + 's)');
  } catch (e) {
    lineas.push('INVENTARIO  FALLO');
    lineas.push('  ' + String(e.message).split('\n')[0]);
  }

  lineas.push('');

  var ruta = props_().getProperty(PROP.RUTA_PRE);
  if (!ruta) {
    lineas.push('PRECIOS  sin configurar');
    lineas.push('  Corre "Descubrir endpoint de precios"');
  } else {
    try {
      var pre = traerPrecios_('elemex', 'normal');
      lineas.push('PRECIOS  OK  (' + metodoPrecios_().toUpperCase() + ' ' + ruta + ')');
      lineas.push('  ' + pre.texto.length + ' bytes en la respuesta');
    } catch (e) {
      lineas.push('PRECIOS  FALLO');
      lineas.push('  ' + String(e.message).split('\n')[0]);
    }
  }

  lineas.push('');
  lineas.push('UrlFetch usadas hoy: ' + fetchHoy_());

  flushLog_();
  alertLog_(ui, 'Prueba de conexion', lineas.join('\n'), ui.ButtonSet.OK);
}

/** Dice QUE esta configurado. Nunca muestra los valores. */
function uiEstado() {
  var ui = SpreadsheetApp.getUi();
  var p = props_();

  var revisar = [
    ['Token API',          PROP.TOKEN],
    ['Cookie (respaldo)',  PROP.COOKIE],
    ['ID del Sheet',       PROP.SHEET_ID],
    ['Ruta de precios',    PROP.RUTA_PRE],
    ['Password dashboard', PROP.PW_HASH],
    ['Login automático',   PROP_LOGIN.PASS]
  ];

  var lineas = revisar.map(function (r) {
    return (p.getProperty(r[1]) ? '  OK     ' : '  FALTA  ') + r[0];
  });

  lineas.push('');
  var dias = cookieEdadDias_();
  if (dias >= 0) lineas.push('Cookie capturada hace ' + dias + ' día(s)');
  lineas.push('Renovación de cookie: ' +
    (puedeRenovarSolo_() ? 'automática (el script hace login solo)' : 'manual'));
  lineas.push('Modo de autenticacion: ' +
    (p.getProperty(PROP.TOKEN) ? 'token (bien)'
      : p.getProperty(PROP.COOKIE) ? 'cookie (vence sola, migra a token)'
      : 'ninguno'));
  lineas.push('Plantilla de precios: ' + plantillaPrecios_());
  lineas.push('UrlFetch hoy: ' + fetchHoy_());
  lineas.push('Cuota agotada hoy: ' + (cuotaAgotadaHoy_() ? 'SI' : 'no'));

  alertLog_(ui, 'Configuracion',
    lineas.join('\n') + '\n\nPor seguridad no se muestran los valores.',
    ui.ButtonSet.OK);
}

function uiConsumo() {
  var quien = '';
  try { quien = Session.getEffectiveUser().getEmail() || ''; } catch (e) {}

  var l = [];
  l.push('Cuenta: ' + (quien || '(no disponible)'));
  l.push('Llamadas de ESTE script hoy: ' + fetchHoy_());
  l.push('Cuota agotada hoy: ' + (cuotaAgotadaHoy_() ? 'SÍ' : 'no'));

  var ev = evidenciaCuota_();
  if (ev) {
    l.push('');
    l.push('LO QUE DIJO GOOGLE (' + ev.hora + '):');
    l.push('  ' + ev.mensaje);
    l.push('');
    l.push('Si ese mensaje NO habla de cuota ni de "demasiadas veces",');
    l.push('entonces fue una falsa alarma: usa ♻️ Reintentar y sigue.');
  }

  l.push('');
  l.push('La cuota es POR CUENTA DE GOOGLE, no por proyecto: 20,000 al día');
  l.push('en cuenta personal, 100,000 en Workspace, y la comparten TODOS');
  l.push('tus proyectos de Apps Script.');
  l.push('');
  l.push('Cuenta LLAMADAS, no datos: las 8 hojas de aquí son unas 800 al día.');
  l.push('Si ese número de arriba es bajo y aun así truena, el culpable es');
  l.push('otro script de esta misma cuenta:');
  l.push('  script.google.com/home/executions → filtra por hoy → ordena por ejecuciones');

  alertLog_(SpreadsheetApp.getUi(), 'UrlFetch hoy', l.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Borra las huellas para que la proxima corrida reescriba todo. */
function uiForzar() {
  var p = props_();
  var todas = p.getProperties();
  var n = 0;
  for (var k in todas) {
    if (k.indexOf(PROP_HUELLA) === 0) { p.deleteProperty(k); n++; }
  }
  alertLog_(SpreadsheetApp.getUi(), 'Listo',
    n + ' huellas borradas: la próxima corrida reescribe todo.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function uiBorrarTodo() {
  var ui = SpreadsheetApp.getUi();
  var r = alertLog_(ui, 'Borrar credenciales',
    'Borra token, cookie, password, login del site, clave de la extensión,\n' +
    'correo de avisos y Odoo (el PIN se queda).\n' +
    'Todo deja de funcionar hasta capturarlos. ¿Continuar?',
    ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;

  // Credenciales y conexiones: token, cookie, password del dashboard, login del site,
  // clave de la extension, correo de avisos y Odoo. El PIN de cancelacion NO (se borra
  // aparte, guardandolo de nuevo desde Cancelaciones).
  var p = props_(), n = 0;
  var llaves = [];
  [PROP, PROP_LOGIN, PROP_ODOO].forEach(function (o) { for (var k in o) llaves.push(o[k]); });
  llaves.push(EXT_PROP_CLAVE, 'AVISO_CORREO');
  llaves.forEach(function (k) { if (p.getProperty(k) !== null) { p.deleteProperty(k); n++; } });
  try { propsUser_().deleteProperty('AVISO_CRED_DIA'); } catch (e) {}
  alertLog_(ui, 'Borrado',
    n + ' datos borrados. El PIN y quién cancela en Odoo se quedan.',
    ui.ButtonSet.OK);
}

/* ================ CORRIDAS ================ */

function bajarTodo() {
  // Inventario PRIMERO (~10 s): los precios pueden usar hasta PRECIOS_PRESUPUESTO_MS y, si iban
  // antes, el inventario se quedaba sin tiempo y Apps Script mataba la corrida
  // a los 6 min ("Excedio el tiempo maximo de ejecucion").
  var stk = descargarTodoStock();
  var pre = descargarPrecios();
  return { precios: pre, stock: stk };
}

function uiBajarTodo() {
  var ui = SpreadsheetApp.getUi();
  toast_('Empezando. Tarda de 2 a 5 min; ve el avance en la hoja Log.', 'SITE SHEET', 20);
  try {
    var r = bajarTodo();
    var ocup = [];
    if (r.stock.estado === 'ocupado') ocup.push('inventario');
    if (r.precios.estado === 'ocupado') ocup.push('precios');
    if (ocup.length) {
      alertLog_(ui, 'Ocupado', 'Hay otra corrida en curso: no se bajo ' + ocup.join(' ni ') +
        '. Intenta en un par de minutos.', ui.ButtonSet.OK);
      return;
    }
    alertLog_(ui, 'Listo',
      'Precios: ' + r.precios.actualizadas + ' actualizadas, ' +
      r.precios.sinCambio + ' sin cambios, ' + r.precios.fallidas + ' con error\n' +
      'Inventario: ' + r.stock.stock.estado + '\n' +
      'Negativos: ' + r.stock.negativos.estado,
      ui.ButtonSet.OK);
  } catch (e) {
    alertLog_(ui, 'Fallo', String(e), ui.ButtonSet.OK);
  }
}

function uiPrecios() {
  var ui = SpreadsheetApp.getUi();
  try {
    var r = descargarPrecios();
    if (r.estado === 'ocupado') { alertLog_(ui, 'Precios', 'Hay otra corrida en curso. Intenta en un par de minutos.', ui.ButtonSet.OK); return; }
    var det = r.detalle.map(function (d) {
      return '  ' + d.hoja + ': ' + d.estado + (d.filas ? ' (' + d.filas + ')' : '');
    }).join('\n');
    alertLog_(ui, 'Precios', det, ui.ButtonSet.OK);
  } catch (e) {
    alertLog_(ui, 'Fallo', String(e), ui.ButtonSet.OK);
  }
}

function uiStock() {
  var ui = SpreadsheetApp.getUi();
  try {
    var r = descargarTodoStock();
    if (r.estado === 'ocupado') { alertLog_(ui, 'Inventario', 'Hay otra corrida en curso. Intenta en un par de minutos.', ui.ButtonSet.OK); return; }
    alertLog_(ui, 'Inventario',
      'Actual: ' + r.stock.estado + (r.stock.filas ? ' (' + r.stock.filas + ')' : '') + '\n' +
      'Negativo: ' + r.negativos.estado + (r.negativos.filas ? ' (' + r.negativos.filas + ')' : ''),
      ui.ButtonSet.OK);
  } catch (e) {
    alertLog_(ui, 'Fallo', String(e), ui.ButtonSet.OK);
  }
}

function uiQuitarTriggers() {
  // Todos los de esta cuenta (fijos, de una vez, cancelaciones, recoleccion y edicion): es para pausar todo.
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); n++; });
  alertLog_(SpreadsheetApp.getUi(), 'Triggers',
    n + ' corridas quitadas de esta cuenta.\nLas de otra cuenta solo las borra esa cuenta.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function uiLimpiarLog() {
  limpiarLog_();
  toast_('Log limpiado', 'SITE SHEET', 4);
}
