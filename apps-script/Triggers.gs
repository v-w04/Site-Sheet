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
  'wmWalmartBajar', 'refrescoDiarioWalmart', 'killersProgramado'
];

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
 * A que hora se revisan los killers. Una hora despues del refresco diario
 * para no encimar dos corridas pesadas.
 *
 * El trigger dispara todos los dias, pero killersProgramado() solo trabaja
 * los dias 1, 10, 15, 16, 20, 25 y el ultimo del mes: el resto sale en un
 * instante. Se hace asi y no con un trigger por dia porque Apps Script no
 * sabe agendar "el dia 15": solo diario, semanal o cada N horas.
 */
var TRIGGER_KILLERS_HORA = 8;

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
  borrarTriggers();

  ScriptApp.newTrigger('descargarTodoStock')
    .timeBased().everyMinutes(TRIGGER_MINUTOS).create();

  ScriptApp.newTrigger('descargarPrecios')
    .timeBased().everyHours(TRIGGER_PRECIOS_HORAS).create();

  ScriptApp.newTrigger('wmWalmartBajar')
    .timeBased().everyMinutes(TRIGGER_WALMART_MINUTOS).create();

  ScriptApp.newTrigger('refrescoDiarioWalmart')
    .timeBased().atHour(TRIGGER_DIARIO_HORA).everyDays(1).create();

  ScriptApp.newTrigger('killersProgramado')
    .timeBased().atHour(TRIGGER_KILLERS_HORA).everyDays(1).create();

  var quien = tgQuien_();

  logInfo_('TRIGGER', 'Instalados por ' + (quien || 'cuenta no legible') + ': inventario cada ' + TRIGGER_MINUTOS +
                      ' min, precios cada ' + TRIGGER_PRECIOS_HORAS + ' h, Walmart cada ' +
                      TRIGGER_WALMART_MINUTOS + ' min, refresco diario a las ' + TRIGGER_DIARIO_HORA +
                      ', killers a las ' + TRIGGER_KILLERS_HORA);
  flushLog_();

  try {
    SpreadsheetApp.getUi().alert('Corridas automáticas',
      'QUÉ                        CUÁNDO\n' +
      '------------------------------------------------\n' +
      'Inventario                 cada ' + TRIGGER_MINUTOS + ' min\n' +
      'Precios                    cada ' + TRIGGER_PRECIOS_HORAS + ' h\n' +
      'Hoja Walmart               cada ' + TRIGGER_WALMART_MINUTOS + ' min\n' +
      'Variantes y Oportunidades  diario ' + TRIGGER_DIARIO_HORA + ':00\n' +
      'Killers                    ' + TRIGGER_KILLERS_HORA + ':00 los días 1, 10, 15,\n' +
      '                           16, 20, 25 y fin de mes\n' +
      '------------------------------------------------\n\n' +
      (quien ? 'Quedaron a nombre de ' + quien + '.\n'
             : 'Quedaron a nombre de la cuenta con la que tienes\nabierta esta hoja.\n') +
      'Nadie más las ve ni las puede borrar. Esa misma cuenta\n' +
      'necesita acceso al libro WALMART DASHBOARD o la hoja\n' +
      'Walmart va a fallar.\n\n' +
      'Para verlas: Extensiones > Apps Script > Activadores.',
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { /* desde el editor, sin UI */ }
}

/**
 * Refresco diario de las hojas que son fotos, no formulas.
 * Si una falla, las demas siguen: no se cae toda la corrida por una.
 */
function refrescoDiarioWalmart() {
  logStart_('WALMART', 'Refresco diario');

  var pasos = [
    ['Catalogo',      'sincronizarCatalogo'],   // Odoo: sin esto se quedaba viejo (no tenia trigger)
    ['Variantes',     'armarVariantes'],
    ['Oportunidades', 'armarOportunidades']
  ];

  var ok = 0, fallos = [];
  pasos.forEach(function (p) {
    var nombre = p[0], fn = p[1];
    try {
      if (typeof this[fn] !== 'function' && typeof eval(fn) !== 'function') {
        fallos.push(nombre + ': la funcion no existe');
        return;
      }
    } catch (e) { /* eval de nombre suelto puede tronar; se intenta abajo */ }

    try {
      if (fn === 'sincronizarCatalogo') sincronizarCatalogo();
      else if (fn === 'armarVariantes') armarVariantes();
      else if (fn === 'armarOportunidades') armarOportunidades();
      ok++;
      logOk_('WALMART', nombre + ' refrescada');
    } catch (e) {
      fallos.push(nombre + ': ' + e.message);
      logWarn_('WALMART', nombre + ' fallo: ' + e.message);
    }
  });

  logFinish_('WALMART', 'Refresco diario', { ok: ok, fallos: fallos.length });
  flushLog_();
  return { ok: ok, fallos: fallos };
}

function borrarTriggers() {
  var todos = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < todos.length; i++) {
    if (FUNCIONES_PROGRAMADAS.indexOf(todos[i].getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(todos[i]);
      n++;
    }
  }
  return n;
}

/** Lista TODOS los triggers visibles, no solo los nuestros. */
function verTriggers() {
  var ui = SpreadsheetApp.getUi();
  var todos = ScriptApp.getProjectTriggers();
  var quien = tgQuien_();

  var nota =
    '\n\nSi en "Ejecuciones" ves corridas que NO corresponden a estos\n' +
    'triggers, son de otra cuenta de Google. Solo esa cuenta puede\n' +
    'borrarlos: tiene que abrir este Sheet > Extensiones > Apps Script\n' +
    '> Activadores.';

  if (!todos.length) {
    ui.alert('Triggers visibles: 0',
      'Cuenta: ' + (quien || 'la que tiene abierta esta hoja') + '\n\nEsta cuenta no tiene triggers en este proyecto.' + nota,
      ui.ButtonSet.OK);
    return;
  }

  var lineas = todos.map(function (t, i) {
    return (i + 1) + ') ' + t.getHandlerFunction() + '  -  ' + t.getEventType() +
           '  -  id: ' + t.getUniqueId();
  });

  ui.alert('Triggers visibles: ' + todos.length,
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
  if (ui) ui.alert('Revision de triggers', msg, ui.ButtonSet.OK);
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
