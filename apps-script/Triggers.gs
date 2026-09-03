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

function instalarTriggers() {
  borrarTriggers();

  // Una sola corrida que hace las dos cosas: menos triggers que vigilar,
  // y el lock evita que se encimen.
  ScriptApp.newTrigger('bajarTodo')
    .timeBased()
    .everyMinutes(TRIGGER_MINUTOS)
    .create();

  logInfo_('TRIGGER', 'Trigger cada ' + TRIGGER_MINUTOS + ' minutos activado');
  flushLog_();

  try {
    SpreadsheetApp.getUi().alert('Corridas automaticas',
      'Cada ' + TRIGGER_MINUTOS + ' minutos: precios (6 hojas) e inventario.\n\n' +
      'Gracias a la huella, si el sitio devuelve lo mismo no se reescribe\n' +
      'la hoja. Solo se gasta la llamada, que es baratisima.',
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { /* corriendo desde el editor, sin UI */ }
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
