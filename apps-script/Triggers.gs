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
 */

var FUNCIONES_PROGRAMADAS = ['descargarPrecios', 'descargarTodoStock', 'bajarTodo'];

/**
 * Dos cadencias distintas, y no es capricho:
 *
 * El inventario cambia todo el dia y su endpoint es ligero.
 * Los precios pesan ~3 MB por combinacion — seis son casi 20 MB por corrida —
 * y cambian de vez en cuando, no cada rato. Pedirlos cada 15 minutos serian
 * casi 2 GB al dia contra tu propio servidor para redescubrir que no cambio
 * nada. Cada hora es de sobra.
 *
 * La cuota de UrlFetch aguanta cualquiera de las dos sin despeinarse; lo que
 * se cuida aqui es el ancho de banda de tu site.
 */
function instalarTriggers() {
  borrarTriggers();

  ScriptApp.newTrigger('descargarTodoStock')
    .timeBased().everyMinutes(TRIGGER_MINUTOS).create();

  ScriptApp.newTrigger('descargarPrecios')
    .timeBased().everyHours(TRIGGER_PRECIOS_HORAS).create();

  logInfo_('TRIGGER', 'Inventario cada ' + TRIGGER_MINUTOS + ' min, precios cada ' +
                      TRIGGER_PRECIOS_HORAS + ' h');
  flushLog_();

  try {
    SpreadsheetApp.getUi().alert('Corridas automáticas',
      'Inventario: cada ' + TRIGGER_MINUTOS + ' minutos\n' +
      'Precios: cada ' + TRIGGER_PRECIOS_HORAS + ' hora(s)\n\n' +
      'Los precios pesan ~3 MB por hoja, así que van más espaciados.\n' +
      'Y si el site devuelve lo mismo que la vez pasada, ni se reescribe.',
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { /* desde el editor, sin UI */ }
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
  var quien = '';
  try { quien = Session.getEffectiveUser().getEmail() || ''; } catch (e) {}

  var nota =
    '\n\nSi en "Ejecuciones" ves corridas que NO corresponden a estos\n' +
    'triggers, son de otra cuenta de Google. Solo esa cuenta puede\n' +
    'borrarlos: tiene que abrir este Sheet > Extensiones > Apps Script\n' +
    '> Activadores.';

  if (!todos.length) {
    ui.alert('Triggers visibles: 0',
      'Cuenta: ' + quien + '\n\nEsta cuenta no tiene triggers en este proyecto.' + nota,
      ui.ButtonSet.OK);
    return;
  }

  var lineas = todos.map(function (t, i) {
    return (i + 1) + ') ' + t.getHandlerFunction() + '  -  ' + t.getEventType() +
           '  -  id: ' + t.getUniqueId();
  });

  ui.alert('Triggers visibles: ' + todos.length,
    'Cuenta: ' + quien + '\n\n' + lineas.join('\n') + nota, ui.ButtonSet.OK);
}
