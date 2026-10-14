/**
 * ============================================================
 *  Precios — prueba de la ruta nueva (solo lectura)
 * ============================================================
 *
 *  El site tiene una ruta GET que acepta la llave de solo lectura:
 *
 *    GET /precios-em/api/precios?sku=SKU1,SKU2&formato=csv
 *    Header: Authorization: Bearer <llave>
 *    Sin sku trae todo el catalogo por paginas (&pagina=1&por_pagina=500).
 *    La llave necesita la pestana "Precios Electronics Mexico".
 *
 *  Esta funcion NO cambia como bajan los precios: solo pide 3 productos y
 *  deja en el Log como viene la respuesta (columnas y una fila), para poder
 *  armar el mapeo a las 23 columnas sin adivinar.
 *
 *  Es lectura pura: no escribe en ninguna hoja de precios.
 */

var PN_RUTA = '/precios-em/api/precios';

function preciosProbarRutaNueva() {
  var ui = SpreadsheetApp.getUi();
  var pruebas = [
    ['CSV, 3 productos',            '?formato=csv&pagina=1&por_pagina=3'],
    ['CSV, cat=cva banda=minimo',   '?formato=csv&pagina=1&por_pagina=3&cat=cva&banda=minimo'],
    ['JSON, 2 productos',           '?pagina=1&por_pagina=2']
  ];
  var lineas = [];

  pruebas.forEach(function (p) {
    var ruta = PN_RUTA + p[1];
    try {
      var r = fetchSitio_(ruta, { crudo: true });
      var texto = String(r.texto || '');
      var cabeza = texto.substring(0, 1500);
      logInfo_('PRECIOS-NUEVA', p[0] + ': HTTP ' + r.codigo + ', ' + texto.length + ' caracteres',
               { ruta: ruta, inicio: cabeza });
      var corto = texto.split('\n').slice(0, 2).join('\n').substring(0, 400);
      lineas.push('✅ ' + p[0] + ' (' + texto.length + ' caracteres)\n' + corto);
    } catch (e) {
      logErr_('PRECIOS-NUEVA', p[0] + ' fallo: ' + String(e.message).split('\n')[0], { ruta: ruta });
      lineas.push('❌ ' + p[0] + ': ' + String(e.message).split('\n')[0]);
    }
    Utilities.sleep(500);
  });

  flushLog_();
  ui.alert('Ruta nueva de precios',
    lineas.join('\n\n') + '\n\nEl detalle completo quedo en la hoja Log, etapa PRECIOS-NUEVA. ' +
    'No se escribio nada en las hojas de precios.',
    ui.ButtonSet.OK);
}
