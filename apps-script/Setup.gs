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

  ui.createMenu('SITE SHEET')
    .addItem('🔄 Bajar TODO ahora', 'uiBajarTodo')
    .addSeparator()
    .addItem('💲 Solo precios (6 hojas)', 'uiPrecios')
    .addItem('📦 Solo inventario', 'uiStock')
    .addSeparator()
    .addSubMenu(
      ui.createMenu('⚙️ Configuración')
        .addItem('🔑 Configurar token API', 'uiSetToken')
        .addItem('🍪 Actualizar cookie (respaldo)', 'uiSetCookie')
        .addSeparator()
        .addItem('🔎 Descubrir endpoint de precios', 'uiDescubrirPrecios')
        .addItem('✏️ Poner ruta de precios a mano', 'uiSetRutaPrecios')
        .addItem('📋 Capturar ID del Sheet', 'uiSetSheetId')
        .addItem('🔒 Password del dashboard', 'uiSetPassword')
        .addSeparator()
        .addItem('🧪 Probar conexión', 'uiProbar')
        .addItem('👁 Ver qué está configurado', 'uiEstado')
        .addItem('📊 Consumo de UrlFetch hoy', 'uiConsumo')
        .addItem('♻️ Reintentar tras cuota agotada', 'limpiarFlagCuota')
        .addSeparator()
        .addItem('💥 Forzar rebajada completa', 'uiForzar')
        .addItem('🗑 Borrar TODAS las credenciales', 'uiBorrarTodo')
    )
    .addSubMenu(
      ui.createMenu('⏱ Triggers')
        .addItem('🔍 Ver triggers de este proyecto', 'verTriggers')
        .addItem('▶️ Activar corridas cada ' + TRIGGER_MINUTOS + ' min', 'instalarTriggers')
        .addItem('🛑 Quitar corridas', 'uiQuitarTriggers')
    )
    .addSeparator()
    .addItem('🧹 Limpiar Log', 'uiLimpiarLog')
    .addToUi();
}

/* ================ CREDENCIALES ================ */

function uiSetToken() {
  var ui = SpreadsheetApp.getUi();
  var actual = props_().getProperty(PROP.TOKEN);

  var r = ui.prompt('Token API',
    'Actual: ' + (actual ? 'configurado (' + actual.length + ' caracteres)' : '(ninguno)') + '\n\n' +
    'Pega el token que tienes en el servidor como STOCK_API_KEY.\n' +
    'No expira: se configura una vez y sirve para todas las cuentas.\n\n' +
    'Esta es la forma correcta. La cookie es un parche que vence solo.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var v = String(r.getResponseText() || '').trim().replace(/^["']|["']$/g, '');
  if (!v) { ui.alert('No se guardo nada (campo vacio).'); return; }

  props_().setProperty(PROP.TOKEN, v);
  ui.alert('Token guardado', 'Corre "Probar conexion" para validarlo.', ui.ButtonSet.OK);
}

function uiSetCookie() {
  var ui = SpreadsheetApp.getUi();
  var actual = props_().getProperty(PROP.COOKIE);

  var r = ui.prompt('Cookie de sesion (respaldo)',
    'Actual: ' + (actual ? actual.substring(0, 20) + '...' : '(ninguna)') + '\n\n' +
    'Pega el VALOR de la cookie "session" (empieza con eyJ...):\n' +
    'DevTools > Application > Cookies > electronicsmexico.site\n\n' +
    'OJO: esto vence cada tantos dias y no hay forma de renovarlo solo.\n' +
    'Apps Script corre en Google, no en tu navegador: no puede ver tu\n' +
    'sesion ni saber cuando haces login. El token es la solucion real.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var v = String(r.getResponseText() || '').trim()
    .replace(/^session\s*=\s*/i, '').replace(/^["']|["']$/g, '').trim();
  if (!v) { ui.alert('No se guardo nada (campo vacio).'); return; }

  props_().setProperty(PROP.COOKIE, v);
  ui.alert('Cookie guardada', 'Corre "Probar conexion" para validarla.', ui.ButtonSet.OK);
}

/* ================ DESCUBRIR EL ENDPOINT DE PRECIOS ================ */

function uiDescubrirPrecios() {
  var ui = SpreadsheetApp.getUi();

  // Sin credencial no tiene caso: cada intento truena antes de tocar el site
  // y el resultado parece "la ruta no existe" cuando en realidad no salimos.
  try {
    authHeaders_();
  } catch (e) {
    ui.alert('Falta la credencial',
      'Todavía no hay token ni cookie configurados, así que la búsqueda ni ' +
      'siquiera llegaría al site.\n\n' +
      'Primero: Configuración > 🔑 Configurar token API.\n' +
      'Si el servidor aún no valida X-API-Key en estas rutas, usa 🍪 la cookie ' +
      'como respaldo y luego vuelve aquí.',
      ui.ButtonSet.OK);
    return;
  }

  ui.alert('Buscando el endpoint',
    'Voy a probar unas rutas candidatas contra el site, con tu credencial ' +
    'puesta, para ver cuál devuelve JSON.\n\n' +
    'Son unas 7 llamadas, una sola vez. Tarda unos segundos.',
    ui.ButtonSet.OK);

  var hallazgos;
  try {
    hallazgos = descubrirEndpointPrecios_();
  } catch (e) {
    ui.alert('Falló la búsqueda', String(e), ui.ButtonSet.OK);
    return;
  } finally {
    flushLog_();
  }

  var lineas = hallazgos.map(function (h) {
    return (h.sirve ? '  SIRVE  ' : '         ') + h.ruta + '  →  ' + h.resultado;
  });

  var buena = hallazgos.filter(function (h) { return h.sirve; })[0];

  if (buena) {
    props_().setProperty(PROP.RUTA_PRE, buena.ruta.split('?')[0]);
    ui.alert('✅ Encontrado',
      lineas.join('\n') + '\n\n' +
      'Se guardó: ' + buena.ruta + '\n\n' +
      'Muestra de la respuesta:\n' + (buena.muestra || '').substring(0, 250),
      ui.ButtonSet.OK);
    return;
  }

  // Si TODAS fallaron por lo mismo, el problema es ese, no las rutas.
  var comun = hallazgos.filter(function (h) {
    return h.resultado === hallazgos[0].resultado;
  }).length === hallazgos.length;

  if (comun && /credencial|autoriza|401|403|rechazado|expirada/i.test(hallazgos[0].resultado)) {
    ui.alert('El site rechazó la credencial',
      lineas.join('\n') + '\n\n' +
      'Las siete fallaron igual, así que esto NO dice nada sobre si las rutas ' +
      'existen: no pasamos de la puerta.\n\n' +
      'Revisa que el token sea idéntico al STOCK_API_KEY del servidor, y que ' +
      'estas rutas ya validen el header X-API-Key. Con cookie, que no haya vencido.',
      ui.ButtonSet.OK);
    return;
  }

  ui.alert('No encontré endpoint de datos',
    lineas.join('\n') + '\n\n' +
    'Ninguna candidata devolvió JSON. Lo más probable es que /precios-em solo ' +
    'sea la página, y no exista una ruta hermana de datos como sí la tiene ' +
    '/stock-odoo con /stock-odoo-data.\n\n' +
    'La solución limpia es agregarla en el servidor: la misma consulta que ya ' +
    'alimenta la tabla, devuelta como JSON, validando X-API-Key. El README trae ' +
    'el snippet listo.\n\n' +
    'Cuando exista, ponla con "✏️ Poner ruta de precios a mano".',
    ui.ButtonSet.OK);
}

function uiSetRutaPrecios() {
  var ui = SpreadsheetApp.getUi();
  var actual = props_().getProperty(PROP.RUTA_PRE) || '(ninguna)';

  var r = ui.prompt('Ruta de precios',
    'Actual: ' + actual + '\n\n' +
    'La ruta que devuelve el JSON de precios, sin el dominio.\n' +
    'Ejemplo: /precios-em-data',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var v = String(r.getResponseText() || '').trim();
  if (!v) return;
  props_().setProperty(PROP.RUTA_PRE, v);

  var r2 = ui.prompt('Como recibe master y banda',
    'Plantilla actual: ' + plantillaPrecios_() + '\n\n' +
    '{master} se cambia por elemex o cva\n' +
    '{banda} se cambia por minimo, normal o maximo\n\n' +
    'Enter para dejar la de siempre.',
    ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() === ui.Button.OK) {
    var p = String(r2.getResponseText() || '').trim();
    if (p) props_().setProperty('PLANTILLA_PRECIOS', p);
  }

  ui.alert('Guardado', 'Ruta: ' + v + '\nPlantilla: ' + plantillaPrecios_(), ui.ButtonSet.OK);
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
  ui.alert('Guardado', 'ID del Sheet configurado.', ui.ButtonSet.OK);
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
    ui.alert('Muy corto', 'Necesita al menos 12 caracteres. No se guardo nada.', ui.ButtonSet.OK);
    return;
  }

  var r2 = ui.prompt('Repitelo', 'Solo para asegurar que no hubo dedazo.', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  if (String(r2.getResponseText() || '') !== pw) {
    ui.alert('No coinciden', 'No se guardo nada.', ui.ButtonSet.OK);
    return;
  }

  guardarPassword_(pw);
  ui.alert('Guardado',
    'Como hash con sal. El password en claro no queda en ningun lado:\n' +
    'si se te olvida no hay forma de recuperarlo, solo de poner uno nuevo.',
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
      var pre = fetchSitio_(rutaPrecios_('elemex', 'normal'), { crudo: true });
      lineas.push('PRECIOS  OK  (' + ruta + ')');
      lineas.push('  ' + pre.texto.length + ' bytes en la respuesta');
    } catch (e) {
      lineas.push('PRECIOS  FALLO');
      lineas.push('  ' + String(e.message).split('\n')[0]);
    }
  }

  lineas.push('');
  lineas.push('UrlFetch usadas hoy: ' + fetchHoy_());

  flushLog_();
  ui.alert('Prueba de conexion', lineas.join('\n'), ui.ButtonSet.OK);
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
    ['Password dashboard', PROP.PW_HASH]
  ];

  var lineas = revisar.map(function (r) {
    return (p.getProperty(r[1]) ? '  OK     ' : '  FALTA  ') + r[0];
  });

  lineas.push('');
  lineas.push('Modo de autenticacion: ' +
    (p.getProperty(PROP.TOKEN) ? 'token (bien)'
      : p.getProperty(PROP.COOKIE) ? 'cookie (vence sola, migra a token)'
      : 'ninguno'));
  lineas.push('Plantilla de precios: ' + plantillaPrecios_());
  lineas.push('UrlFetch hoy: ' + fetchHoy_());
  lineas.push('Cuota agotada hoy: ' + (cuotaAgotadaHoy_() ? 'SI' : 'no'));

  ui.alert('Configuracion',
    lineas.join('\n') + '\n\nPor seguridad no se muestran los valores.',
    ui.ButtonSet.OK);
}

function uiConsumo() {
  var quien = '';
  try { quien = Session.getEffectiveUser().getEmail() || ''; } catch (e) {}

  SpreadsheetApp.getUi().alert('UrlFetch hoy',
    'Cuenta: ' + (quien || '(no disponible)') + '\n' +
    'Llamadas de este script: ' + fetchHoy_() + '\n' +
    'Cuota agotada hoy: ' + (cuotaAgotadaHoy_() ? 'SI' : 'no') + '\n\n' +
    'Cuota diaria: 20,000 personal / 100,000 Workspace, POR CUENTA.\n' +
    'La cuota cuenta LLAMADAS, no datos: seis hojas cada 15 minutos son\n' +
    'unas 576 al dia. Si este numero es bajo y aun asi truena, otro script\n' +
    'de esta misma cuenta se la esta comiendo:\n' +
    'script.google.com/home/executions',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Borra las huellas para que la proxima corrida reescriba todo. */
function uiForzar() {
  var p = props_();
  var todas = p.getProperties();
  var n = 0;
  for (var k in todas) {
    if (k.indexOf(PROP_HUELLA) === 0) { p.deleteProperty(k); n++; }
  }
  SpreadsheetApp.getUi().alert('Listo',
    n + ' huellas borradas. La proxima corrida va a reescribir todas las hojas ' +
    'aunque los datos sean identicos.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function uiBorrarTodo() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Borrar credenciales',
    'Esto deja el proyecto sin configuracion y deja de funcionar\n' +
    'hasta que la captures de nuevo. Continuar?',
    ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;

  var p = props_();
  for (var k in PROP) p.deleteProperty(PROP[k]);
  ui.alert('Borrado', 'PropertiesService quedo limpio.', ui.ButtonSet.OK);
}

/* ================ CORRIDAS ================ */

function bajarTodo() {
  var pre = descargarPrecios();
  var stk = descargarTodoStock();
  return { precios: pre, stock: stk };
}

function uiBajarTodo() {
  var ui = SpreadsheetApp.getUi();
  try {
    var r = bajarTodo();
    ui.alert('Listo',
      'Precios: ' + r.precios.actualizadas + ' actualizadas, ' +
      r.precios.sinCambio + ' sin cambios, ' + r.precios.fallidas + ' con error\n' +
      'Inventario: ' + r.stock.stock.estado + '\n' +
      'Negativos: ' + r.stock.negativos.estado,
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Fallo', String(e), ui.ButtonSet.OK);
  }
}

function uiPrecios() {
  var ui = SpreadsheetApp.getUi();
  try {
    var r = descargarPrecios();
    var det = r.detalle.map(function (d) {
      return '  ' + d.hoja + ': ' + d.estado + (d.filas ? ' (' + d.filas + ')' : '');
    }).join('\n');
    ui.alert('Precios', det, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Fallo', String(e), ui.ButtonSet.OK);
  }
}

function uiStock() {
  var ui = SpreadsheetApp.getUi();
  try {
    var r = descargarTodoStock();
    ui.alert('Inventario',
      'Actual: ' + r.stock.estado + (r.stock.filas ? ' (' + r.stock.filas + ')' : '') + '\n' +
      'Negativo: ' + r.negativos.estado + (r.negativos.filas ? ' (' + r.negativos.filas + ')' : ''),
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Fallo', String(e), ui.ButtonSet.OK);
  }
}

function uiQuitarTriggers() {
  var n = borrarTriggers();
  SpreadsheetApp.getUi().alert('Triggers',
    'Se quitaron ' + n + ' corridas de ESTA cuenta.\n\n' +
    'Los triggers son de quien los instala: si hay de otra cuenta, ' +
    'solo esa cuenta puede borrarlos.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function uiLimpiarLog() {
  limpiarLog_();
  toast_('Log limpiado', 'SITE SHEET', 4);
}
