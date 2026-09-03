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
        .addItem('🔬 Analizar la página de precios', 'uiAnalizarPagina')
        .addItem('🧬 Ver estructura de la respuesta', 'uiEstructura')
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

function uiAnalizarPagina() {
  var ui = SpreadsheetApp.getUi();

  try { authHeaders_(); }
  catch (e) {
    ui.alert('Falta la credencial', String(e), ui.ButtonSet.OK);
    return;
  }

  ui.alert('Analizando /precios-em',
    'Voy a leer la página y sus scripts para ver por dónde pide ella misma\n' +
    'los datos. Son unas 10 llamadas. Tarda unos segundos.',
    ui.ButtonSet.OK);

  var rep;
  try {
    rep = analizarPaginaPrecios_();
  } catch (e) {
    ui.alert('Falló el análisis', String(e), ui.ButtonSet.OK);
    return;
  } finally {
    flushLog_();
  }

  var l = [];
  l.push('Página: ' + rep.bytes + ' bytes');
  l.push('');

  var buena = rep.rutas.filter(function (r) { return r.esJson; })[0];

  if (rep.rutas.length) {
    l.push('RUTAS QUE PIDE LA PÁGINA:');
    rep.rutas.forEach(function (r) {
      l.push('  ' + (r.esJson ? '[JSON] ' : '       ') +
             (r.metodo || 'GET') + ' ' + r.ruta +
             '  (' + r.codigo + (r.bytes ? ', ' + r.bytes + ' bytes' : '') + ')');
    });
  } else {
    l.push('No encontré que la página pida datos por su cuenta.');
  }

  l.push('');
  if (rep.incrustado) {
    l.push('DATOS INCRUSTADOS EN EL HTML — sí se pueden leer de ahí:');
    l.push('  ' + rep.incrustado.substring(0, 200));
  } else {
    l.push('No hay datos incrustados en el HTML.');
  }

  if (rep.scripts.length) {
    l.push('');
    l.push('Scripts de la página: ' + rep.scripts.slice(0, 6).join(', '));
  }

  if (rep.nota) { l.push(''); l.push(rep.nota); }

  if (buena) {
    props_().setProperties({
      RUTA_PRECIOS:   buena.ruta.split('?')[0],
      METODO_PRECIOS: (buena.metodo || 'GET').toLowerCase()
    }, false);
    l.push('');
    l.push('SE GUARDÓ: ' + (buena.metodo || 'GET') + ' ' + buena.ruta);
    l.push('Muestra: ' + (buena.muestra || '').substring(0, 250));
    l.push('');
    l.push('Corre 💲 Solo precios para ver si arma bien las hojas.');
  }

  ui.alert(buena ? '✅ Encontrado' : 'Resultado del análisis', l.join('\n'), ui.ButtonSet.OK);
  logInfo_('ANALISIS', 'Analisis de /precios-em', rep);
  flushLog_();
}

function uiEstructura() {
  var ui = SpreadsheetApp.getUi();

  if (!props_().getProperty(PROP.RUTA_PRE)) {
    ui.alert('Falta la ruta', 'Corre primero 🔬 Analizar la página de precios.', ui.ButtonSet.OK);
    return;
  }

  ui.alert('Revisando la respuesta',
    'Voy a pedir dos combinaciones distintas y compararlas.\n\n' +
    'Sirve para dos cosas: ver dónde viene la tabla dentro del JSON, y\n' +
    'confirmar que el filtro de master y banda realmente cambia el\n' +
    'resultado — si las dos respuestas fueran idénticas, el site estaría\n' +
    'ignorando lo que le mandamos y las 6 hojas saldrían iguales.\n\n' +
    'Son 2 llamadas de varios MB. Tarda.',
    ui.ButtonSet.OK);

  var l = [];

  try {
    var a = traerPrecios_('elemex', 'maximo');
    var da = JSON.parse(a.texto);

    l.push('LLAVES DE PRIMER NIVEL:');
    for (var k in da) {
      var v = da[k];
      var tipo = Array.isArray(v) ? ('arreglo[' + v.length + ']')
               : (v === null) ? 'null'
               : (typeof v === 'object') ? ('objeto{' + Object.keys(v).length + '}')
               : (typeof v + ': ' + String(v).substring(0, 40));
      l.push('  ' + k + '  →  ' + tipo);
    }

    var lista = encontrarLista_(da);
    l.push('');
    l.push('TABLA DETECTADA: ' + lista.length + ' registros');

    if (lista.length) {
      var campos = Object.keys(lista[0]);
      l.push('Campos (' + campos.length + '):');
      l.push('  ' + campos.join(', ').substring(0, 600));
      l.push('');
      l.push('PRIMER REGISTRO:');
      l.push('  ' + JSON.stringify(lista[0]).substring(0, 500));
    }

    // ¿El filtro sirve? Si dos combinaciones distintas dan lo mismo, no.
    Utilities.sleep(500);
    var b = traerPrecios_('cva', 'minimo');
    l.push('');
    l.push('FILTRO:');
    if (sha256_(a.texto) === sha256_(b.texto)) {
      l.push('  ⚠️ elemex/maximo y cva/minimo devolvieron EXACTAMENTE lo mismo.');
      l.push('  El site está ignorando los parámetros: las 6 hojas saldrían iguales.');
      l.push('  Hay que averiguar cómo se le pide el filtro de verdad.');
    } else {
      l.push('  ✅ Cambian según master y banda. Las 6 hojas van a ser distintas.');
      try {
        var db = JSON.parse(b.texto);
        l.push('  elemex/maximo → banda=' + da.banda + ', ' + lista.length + ' registros');
        l.push('  cva/minimo    → banda=' + db.banda + ', ' + encontrarLista_(db).length + ' registros');
      } catch (e) {}
    }

    l.push('');
    l.push('Tamaño por llamada: ' + Math.round(a.texto.length / 1024) + ' KB');

  } catch (e) {
    l.push('FALLÓ: ' + String(e.message).split('\n')[0]);
  } finally {
    flushLog_();
  }

  ui.alert('Estructura de la respuesta', l.join('\n'), ui.ButtonSet.OK);
}

function uiSetRutaPrecios() {
  var ui = SpreadsheetApp.getUi();

  var r = ui.prompt('Ruta de precios',
    'Actual: ' + (metodoPrecios_().toUpperCase()) + ' ' +
    (props_().getProperty(PROP.RUTA_PRE) || '(ninguna)') + '\n\n' +
    'La ruta que devuelve el JSON de precios, sin el dominio.\n' +
    'Ejemplo: /precios-em/api/lista',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var ruta = String(r.getResponseText() || '').trim();
  if (!ruta) return;

  var r2 = ui.alert('¿Con qué método?',
    'GET  = los filtros van en la URL\n' +
    'POST = los filtros van en el cuerpo, como JSON\n\n' +
    'Las rutas /precios-em/api/* de tu site son POST.\n\n' +
    'SÍ = POST     NO = GET',
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

  ui.alert('Guardado',
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
