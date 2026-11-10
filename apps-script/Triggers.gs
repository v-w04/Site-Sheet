/**
 * ============================================================
 *  Triggers — corridas automaticas
 * ============================================================
 *
 * Idempotente: borra los suyos antes de crearlos, asi que correrlo
 * dos veces no deja corridas encimadas.
 *
 * IMPORTANTE: un trigger le pertenece a la cuenta que lo instalo.
 * getProjectTriggers() solo devuelve los de TU cuenta. Si en un
 * proyecto quedaron triggers de otra persona, no se pueden ver ni
 * borrar desde aqui: esa cuenta tiene que entrar y borrarlos ella.
 * Por eso este proyecto arranca en un Sheet y un script nuevos.
 *
 * En este proyecto las corridas van instaladas desde
 * soporte.electronics.inventario@gmail.com, porque la cuota de
 * UrlFetch es por cuenta y la principal se agota temprano.
 * Esa cuenta necesita acceso al Sheet Y al libro WALMART DASHBOARD.
 */

var FUNCIONES_PROGRAMADAS = [
  'descargarPrecios', 'descargarTodoStock', 'bajarTodo',
  'wmWalmartBajar', 'refrescoDiarioWalmart', 'killersProgramado', 'sobreventaAuto',
  'catalogoContinuar', 'refrescoDiarioResto', 'cancelacionesAutoReintento', 'cancelacionesLecturaReintento', 'wfsAuto', 'ventasProgramado', 'ventasHistoricoContinuar'
];

/**
 * Estos no son fijos: se agendan solos, de una sola vez, cuando hacen falta
 * (vuelta siguiente del catalogo y cierre del refresco diario). Se borran al
 * dispararse. Reinstalar (instalarTriggers) NO los borra: cortaria una bajada
 * del catalogo o un reintento de cancelacion a medias. "Quitar corridas" si.
 * revisarTriggers() no los reporta como faltantes.
 */
var FUNCIONES_DE_UNA_VEZ = ['catalogoContinuar', 'refrescoDiarioResto', 'cancelacionesAutoReintento', 'cancelacionesLecturaReintento', 'ventasHistoricoContinuar'];

/**
 * Cada cuantos minutos se refresca la hoja Walmart desde el dashboard.
 * Medido del Sync_Log del dashboard (6 dias de corridas):
 *   syncMain  cada 15 min  -> reescribe las 3,341 filas de Inventario
 *   chunk     cada 30 min  -> barre 80 SKUs de Inv_Normal
 * Se jala al mismo ritmo que la fuente. Si el dashboard no ha corrido desde
 * la ultima vez, wmWalmartBajar sale en un segundo sin reescribir nada.
 */
var TRIGGER_WALMART_MINUTOS = 15;

/** A que hora corre el refresco diario (0-23, hora del Sheet). */
var TRIGGER_DIARIO_HORA = 7;

/**
 * Killers: se revisa el site cada hora. Solo se reescribe la hoja cuando la
 * extension subio una tanda nueva (ver killersProgramado en Killers.gs). Antes
 * era a las 8am solo ciertos dias y una tanda subida despues se quedaba sin
 * bajar.
 */
var TRIGGER_KILLERS_HORAS = 1;

/** Sobreventa Walmart (Odoo): cada cuantos minutos se refresca (igual que en Venta Diaria). */
var TRIGGER_SOBREVENTA_MINUTOS = 30;

/**
 * Cuatro cadencias distintas, y no es capricho:
 *
 * El inventario cambia todo el dia y su endpoint es ligero.
 *
 * Los precios pesan ~3 MB por combinacion — seis son casi 20 MB por corrida —
 * y cambian de vez en cuando, no cada rato. Pedirlos cada 15 minutos serian
 * casi 2 GB al dia contra tu propio servidor para redescubrir que no cambio
 * nada. Cada hora es de sobra.
 *
 * La hoja Walmart NO gasta cuota: lee el libro WALMART DASHBOARD con
 * openById, que es una lectura de script. Va cada 15 minutos porque ese es el
 * ritmo real del dashboard (medido de su Sync_Log). Si el dashboard no ha
 * corrido desde la ultima vez, la corrida sale en un segundo sin reescribir.
 *
 * Variantes y Oportunidades son fotos, no formulas vivas, asi que se rehacen
 * una vez al dia temprano. El Concentrado no entra aqui: es puro ARRAYFORMULA
 * y se actualiza solo cuando cambian sus fuentes.
 *
 * La cuota de UrlFetch aguanta todo esto sin despeinarse; lo que se cuida es
 * el ancho de banda de tu site.
 */
function instalarTriggers() {
  // Google deja maximo 20 activadores por cuenta en este proyecto. Para no llegar al tope se borran TODOS los de esta
  // cuenta (repetidos y de funciones que ya no existen incluidos) y se vuelven a poner los fijos mas los opcionales
  // que esta cuenta ya tenia encendidos (cancelaciones, recoleccion, edicion de parrillas).
  var antes = {};
  ScriptApp.getProjectTriggers().forEach(function (t) { antes[t.getHandlerFunction()] = (antes[t.getHandlerFunction()] || 0) + 1; });
  var nAntes = ScriptApp.getProjectTriggers().length;
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('descargarTodoStock')
    .timeBased().everyMinutes(TRIGGER_MINUTOS).create();

  ScriptApp.newTrigger('descargarPrecios')
    .timeBased().everyHours(TRIGGER_PRECIOS_HORAS).create();

  ScriptApp.newTrigger('wmWalmartBajar')
    .timeBased().everyMinutes(TRIGGER_WALMART_MINUTOS).create();

  ScriptApp.newTrigger('refrescoDiarioWalmart')
    .timeBased().atHour(TRIGGER_DIARIO_HORA).everyDays(1).create();

  ScriptApp.newTrigger('killersProgramado')
    .timeBased().everyHours(TRIGGER_KILLERS_HORAS).create();

  ScriptApp.newTrigger('sobreventaAuto')
    .timeBased().everyMinutes(TRIGGER_SOBREVENTA_MINUTOS).create();

  // WFS: ventas 30 dias -> calculo de la propuesta (Wfs.gs). Se pausa solo si hay trabajo a mano; no envia nada.
  ScriptApp.newTrigger('wfsAuto')
    .timeBased().everyHours(1).create();

  // Ventas y precios (lo que venia de Venta Diaria Odoo): ventas Walmart, CVA, precios erroneos, Killers activos,
  // Comparar Walmart, Casos Walmart y EXPORTAR. Trigger aparte para que la cadena de killers no se quede sin tiempo.
  ScriptApp.newTrigger('ventasProgramado')
    .timeBased().everyHours(1).create();

  // Opcionales: solo si esta cuenta ya los tenia.
  var opc = [];
  if (antes['cancelacionesProgramado_'] || antes['cancelacionesAutoProgramado_']) {
    ScriptApp.newTrigger('cancelacionesProgramado_').timeBased().everyHours(1).create();
    ScriptApp.newTrigger('cancelacionesAutoProgramado_').timeBased().atHour(6).everyDays(1).create();
    opc.push('cancelaciones');
  }
  if (antes[REC_HANDLER]) { try { recInstalar_(); opc.push('recoleccion (1 diario)'); } catch (e) { logWarn_('TRIGGER', 'No se pudo reinstalar recoleccion: ' + e.message); } }
  if (antes['parOnEdit_']) { try { parAsegurarTriggerEdicion_(); opc.push('edicion de parrillas'); } catch (e) {} }
  var nAhora = ScriptApp.getProjectTriggers().length;
  logInfo_('TRIGGER', 'Activadores de esta cuenta: ' + nAntes + ' antes -> ' + nAhora + ' ahora (tope de Google: 20)' + (opc.length ? ' · opcionales que ya tenias: ' + opc.join(', ') : ''), antes);

  var quien = tgQuien_();

  logInfo_('TRIGGER', 'Instalados por ' + (quien || 'cuenta no legible') + ': inventario cada ' + TRIGGER_MINUTOS +
                      ' min, precios cada ' + TRIGGER_PRECIOS_HORAS + ' h, Walmart cada ' +
                      TRIGGER_WALMART_MINUTOS + ' min, refresco diario a las ' + TRIGGER_DIARIO_HORA +
                      ', killers cada ' + TRIGGER_KILLERS_HORAS + ' h (solo si hay tanda nueva), sobreventa cada ' + TRIGGER_SOBREVENTA_MINUTOS + ' min, calculo WFS cada hora, ventas y precios (Venta Diaria) cada hora');
  flushLog_();

  try {
    alertLog_(SpreadsheetApp.getUi(), 'Corridas automáticas',
      'Inventario: ' + TRIGGER_MINUTOS + ' min\n' +
      'Precios: ' + TRIGGER_PRECIOS_HORAS + ' h\n' +
      'Walmart: ' + TRIGGER_WALMART_MINUTOS + ' min\n' +
      'Catálogo, Variantes, Oportunidades: ' + TRIGGER_DIARIO_HORA + ':00\n' +
      'Killers: cada hora (si hay tanda nueva)\n' +
      'Sobreventa: ' + TRIGGER_SOBREVENTA_MINUTOS + ' min\n' +
      'Cálculo WFS: cada hora\n' +
      'Ventas, CVA, precios erróneos, killers, EXPORTAR: cada hora\n\n' +
      'Activadores: ' + nAntes + ' -> ' + nAhora + ' (tope 20)\n' +
      (opc.length ? 'Se quedan: ' + opc.join(', ') + '\n' : '') +
      'Cuenta: ' + (quien || 'la que tiene abierta la hoja') + ' (necesita acceso a WALMART DASHBOARD)',
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { /* desde el editor, sin UI */ }
}

/**
 * Refresco diario de las hojas que son fotos, no formulas.
 *
 * Va en dos tiempos porque el catalogo de Odoo puede tardar mas de los 6
 * minutos que Apps Script le da a una ejecucion (el 26, 28 y 29-sep se corto
 * y ni Variantes ni Oportunidades corrieron):
 *
 *   1) refrescoDiarioWalmart  arranca la bajada del catalogo. Si no termina
 *      en una vuelta, sigue sola con catalogoContinuar cada minuto.
 *   2) refrescoDiarioResto    cuando el catalogo cierra (bien o mal), corre
 *      Variantes y Oportunidades y escribe el FINISH del refresco.
 *
 * Si el catalogo falla, Variantes y Oportunidades igual corren con el
 * catalogo que ya habia: no se cae todo por una.
 */
function refrescoDiarioWalmart() {
  logStart_('WALMART', 'Refresco diario');
  flushLog_();

  var r;
  try {
    r = catalogoPaso_({ nuevo: true, origen: 'diario' });
  } catch (e) {
    r = { ok: false, error: e.message };
  }

  // Si el catalogo ni siquiera pudo arrancar, catTerminar_ no agenda el
  // resto: se agenda aqui para que Variantes y Oportunidades no se queden.
  if (!r.ok && (r.error === 'ocupado' || !catEstado_())) {
    if (!ScriptApp.getProjectTriggers().some(function (t) {
      return t.getHandlerFunction() === 'refrescoDiarioResto';
    })) {
      PropertiesService.getScriptProperties().setProperty(PROP_CAT_RESULTADO, JSON.stringify(r));
      tgUnaVez_('refrescoDiarioResto', 60 * 1000);
    }
  }
  flushLog_();
  return r;
}

/** Segundo tiempo del refresco diario: Variantes, Oportunidades y el cierre. */
function refrescoDiarioResto() {
  tgBorrarUnaVez_('refrescoDiarioResto');

  // Una vez al dia: que ninguna hoja fuente haya perdido o renombrado columnas.
  try { revisarEsquemas_(SpreadsheetApp.getActive()); } catch (e) {}

  var props = PropertiesService.getScriptProperties();
  var cat = null;
  try { cat = JSON.parse(props.getProperty(PROP_CAT_RESULTADO) || 'null'); } catch (e) {}
  props.deleteProperty(PROP_CAT_RESULTADO);

  var ok = 0, fallos = [];

  if (cat && cat.ok) {
    ok++;
    logOk_('WALMART', 'Catalogo refrescada');
  } else {
    fallos.push('Catalogo: ' + (cat ? cat.error : 'sin resultado'));
    logWarn_('WALMART', 'Catalogo no se actualizo (' + (cat ? cat.error : 'sin resultado') +
                        '); Variantes y Oportunidades usan el que ya habia');
  }

  var pasos = [
    ['Variantes',     function () { armarVariantes(); }],
    ['Oportunidades', function () { armarOportunidades(); }]
  ];

  pasos.forEach(function (p) {
    try {
      p[1]();
      ok++;
      logOk_('WALMART', p[0] + ' refrescada');
    } catch (e) {
      fallos.push(p[0] + ': ' + e.message);
      logWarn_('WALMART', p[0] + ' fallo: ' + e.message);
    }
  });

  logFinish_('WALMART', 'Refresco diario', { ok: ok, fallos: fallos.length, detalle: fallos });
  flushLog_();
  return { ok: ok, fallos: fallos };
}

/** Agenda fn una sola vez dentro de ms. Si ya habia una pendiente, la reemplaza. */
function tgUnaVez_(fn, ms) {
  tgBorrarUnaVez_(fn);
  try {
    ScriptApp.newTrigger(fn).timeBased().after(ms).create();
  } catch (e) {
    // "demasiados activadores" (tope de Google por cuenta y script): deja en el Log CUANTOS hay y de que funcion,
    // para saber cual sobra (Menu > Ver triggers) en vez de solo ver el aviso de Google.
    try {
      var por = {}, todos = ScriptApp.getProjectTriggers();
      todos.forEach(function (t) { var h = t.getHandlerFunction(); por[h] = (por[h] || 0) + 1; });
      logWarn_('TRIGGERS', 'No pude agendar "' + fn + '": ' + String(e.message).split('.')[0] + '. Triggers de esta cuenta: ' + todos.length + ' → ' +
        Object.keys(por).map(function (h) { return h + ' x' + por[h]; }).join(', '), { total: todos.length, por: por });
    } catch (x) {}
    throw e;
  }
}

function tgBorrarUnaVez_(fn) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t);
  });
}

/** Lista TODOS los triggers visibles, no solo los nuestros. */
function verTriggers() {
  var ui = SpreadsheetApp.getUi();
  var todos = ScriptApp.getProjectTriggers();
  var quien = tgQuien_();

  var nota =
    '\n\nCorridas que no salen aquí son de otra cuenta: solo esa cuenta las borra.';

  if (!todos.length) {
    alertLog_(ui, 'Triggers visibles: 0',
      'Cuenta: ' + (quien || 'la que tiene abierta esta hoja') + '\nSin triggers en este proyecto.' + nota,
      ui.ButtonSet.OK);
    return;
  }

  var lineas = todos.map(function (t, i) {
    return (i + 1) + ') ' + t.getHandlerFunction() + '  -  ' + t.getEventType() +
           '  -  id: ' + t.getUniqueId();
  });

  alertLog_(ui, 'Triggers visibles: ' + todos.length,
    'Cuenta: ' + (quien || 'la que tiene abierta esta hoja') + '\n\n' + lineas.join('\n') + nota, ui.ButtonSet.OK);
}

/**
 * Diagnostico: dice si esta cuenta puede hacer todo lo que los triggers
 * necesitan. Correrlo DESDE la cuenta que instala los triggers.
 */
function revisarTriggers() {
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}

  var quien = tgQuien_();

  var mios = ScriptApp.getProjectTriggers().filter(function (t) {
    return FUNCIONES_PROGRAMADAS.indexOf(t.getHandlerFunction()) !== -1;
  });

  var lineas = ['Cuenta: ' + (quien || 'la que tiene abierta esta hoja'), ''];
  lineas.push('Triggers de este proyecto instalados por esta cuenta: ' + mios.length);
  FUNCIONES_PROGRAMADAS.forEach(function (fn) {
    var hay = mios.some(function (t) { return t.getHandlerFunction() === fn; });
    if (fn === 'bajarTodo') return;              // ese es manual
    if (FUNCIONES_DE_UNA_VEZ.indexOf(fn) !== -1) return;   // se agendan solos
    lineas.push('   ' + (hay ? 'SI ' : 'NO ') + fn);
  });

  // Acceso al libro del dashboard
  lineas.push('');
  try {
    var id = PropertiesService.getScriptProperties().getProperty('WM_DASHBOARD_ID');
    if (!id) {
      lineas.push('WALMART DASHBOARD: no configurado (corre wmDashboardConectar)');
    } else {
      var libro = SpreadsheetApp.openById(id);
      lineas.push('WALMART DASHBOARD: acceso OK  -> ' + libro.getName());
    }
  } catch (e) {
    lineas.push('WALMART DASHBOARD: SIN ACCESO desde esta cuenta.');
    lineas.push('   Compartele el libro a ' + (quien || 'esta cuenta') + ' o el trigger wmWalmartBajar va a fallar.');
  }

  // Ultima actividad del log
  try {
    var h = SpreadsheetApp.getActive().getSheetByName(HOJA.LOG);
    if (h && h.getLastRow() > 1) {
      var ult = h.getRange(h.getLastRow(), 1, 1, 4).getValues()[0];
      lineas.push('');
      lineas.push('Ultima linea del Log: ' + ult[0] + '  ' + ult[1] + '  ' + ult[2] + '  ' + ult[3]);
    }
  } catch (e) {}

  var msg = lineas.join('\n');
  Logger.log(msg);
  if (ui) alertLog_(ui, 'Revision de triggers', msg, ui.ButtonSet.OK);
  return msg;
}

/**
 * El correo de la cuenta, o cadena vacia si no se puede leer.
 *
 * getEmail() depende de un permiso (userinfo.email) que este proyecto no
 * pide: el manifiesto declara oauthScopes a mano y ese no esta en la lista.
 * Agregarlo obligaria a reautorizar todo el proyecto y los triggers se
 * quedarian parados hasta que alguien aceptara el permiso otra vez, y todo
 * eso nomas para pintar un correo en un aviso. No vale la pena: cuando
 * viene vacio se redacta sin el correo.
 */
function tgQuien_() {
  var e = '';
  try { e = Session.getEffectiveUser().getEmail() || ''; } catch (x) {}
  if (!e) { try { e = Session.getActiveUser().getEmail() || ''; } catch (x) {} }
  return e;
}
