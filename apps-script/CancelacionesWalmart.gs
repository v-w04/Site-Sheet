/**
 * ============================================================
 *  WALMART: quien cancela que (actualizado el 19-nov-2026)
 * ============================================================
 *
 *  REGLA DEL DUEÑO: cancelar en Walmart penaliza al vendedor, por eso casi todo sigue siendo manual:
 *    - Hasta el 15-nov el codigo NUNCA cancelaba en Walmart. El 19-nov la dueña decidio que SOLO las ventas de PRECIO ERRONEO
 *      (mas de 7%, o de 3% a 7% con su casilla CANCELAR EN ODOO marcada) se cancelan en Walmart y en Odoo por la extension:
 *      todo eso vive en CancelacionesWalmartAuto.gs (Walmart primero, verificado; si falla, a mano y alerta roja).
 *    - SOBREVENTA, FRAUDE, CORREO y demas: Walmart SIEMPRE manual, en Seller Center. El codigo solo cancela en el site/Odoo.
 *    - NO existe ninguna llamada a la API publica de Walmart (marketplace.walmartapis.com): pruebas/t73.js falla si aparece,
 *      o si aparece cualquier otro menu, funcion o cuerpo de cancelacion hacia Walmart fuera de lo aprobado.
 *
 *  Lo que queda aqui son las casillas de la hoja Cancelaciones:
 *    CANCELADA EN WALMART = la marca la extension cuando VERIFICO en Seller Center que quedo cancelada (CancelacionesWalmartAuto.gs),
 *    o la dueña a mano cuando ella la cancelo. Es la confirmacion que Odoo/site espera en precio erroneo. Este archivo solo le pone la casilla bonita.
 *    CANCELAR EN WALMART (columna vieja, si todavia existe en la hoja) ya no hace nada: se puede borrar.
 */

var WMC_ETAPA = 'CANCEL_WM';
var WMC_CHECK = 'CANCELAR EN WALMART';   // columna vieja: SIN funcion (solo se le dejan las casillas bonitas)
var WMC_YA = 'CANCELADA EN WALMART';     // la marca el dueño; el codigo solo la LEE
var WMC_ESTADO = 'ESTADO WALMART';       // historico: nadie lo escribe ya

/* ---------------- hoja ---------------- */

/** Casillas de verdad (formato '0', no texto) en CANCELAR EN WALMART y CANCELADA EN WALMART, filas ini..ini+n-1.
 *  En una celda con formato de texto ('@') la casilla marcada se guarda como el TEXTO "TRUE" en vez de true: aqui se corrige y se conserva lo que ya estaba marcado. */
function wmcCasillas_(h, ini, n) {
  if (!(n >= 1)) return 0;
  var m = canMapaHoja_(h).mapa, hechas = 0;
  [WMC_CHECK, WMC_YA].forEach(function (enc) {
    var c = m[normEnc_(enc)];
    if (!c) return;
    var rg = h.getRange(ini, c, n, 1);
    var vals = rg.getValues().map(function (f) { var v = f[0]; return [v === true || String(v).trim().toUpperCase() === 'TRUE']; });
    rg.setNumberFormat('0');
    rg.insertCheckboxes();
    rg.setValues(vals);
    rg.setHorizontalAlignment('center');
    hechas++;
  });
  return hechas;
}

function wmcFormato_(h) {
  var m = canMapaHoja_(h).mapa, n = h.getLastRow() - 1;
  // casilla de referencia CANCELADA EN WALMART: se crea al final si falta (la mueves donde quieras) y solo se le ponen casillas
  try {
    if (m[normEnc_(WMC_YA)] === undefined) { canAsegurarColumnas_(h, [WMC_YA]); m = canMapaHoja_(h).mapa; }
    var cy = m[normEnc_(WMC_YA)];
    if (cy && n >= 1) wmcCasillas_(h, 2, n);
  } catch (ey) { logWarn_(WMC_ETAPA, 'No se pudo poner la casilla ' + WMC_YA + ': ' + String(ey.message).split('\n')[0]); }
}
