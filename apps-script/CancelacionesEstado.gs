/**
 * ============================================================
 *  Cancelaciones — columna QUE HACER (4 estados simples)
 * ============================================================
 *
 *  Resume en UNA columna lo que dicen ESTADO ODOO, NOTA ODOO, la casilla CANCELAR EN ODOO, CANCELADA EN WALMART y ORIGEN.
 *  Solo hay 4 estados, cada uno con su emoji y su color, y todos dicen que hacer:
 *
 *    ✅ Cancelada            ya esta (si hacia falta Walmart, tambien).         Nada que hacer.
 *    ⏳ Por cancelar         la extension la cancela sola.                       Esperar.
 *    🟡 Tú decides           hace falta tu decision (casilla CANCELAR EN ODOO).  Marcar o dejar.
 *    🔴 Cancelar a mano      el sistema no puede: cancelala tu (Odoo/site/Walmart).
 *
 *  QUIEN HACE QUE (desde el 19-nov, decision de la dueña): PRECIO ERRONEO se cancela en Walmart Y en Odoo/site por la extension
 *  (Walmart primero, luego Odoo; ver CancelacionesWalmartAuto.gs). Si Walmart falla queda 🔴 para que la cancele solo tú, a mano.
 *  SOBREVENTA y FRAUDE: el codigo solo cancela en el site/Odoo (⏳); Walmart (Seller Center) lo cancelas TU a mano (🔴: solo tú, en Seller Center; el sistema nunca lo hace).
 *  Ver CancelacionesWalmart.gs y pruebas/t73.js.
 *
 *  NO cambia nada de como se cancela: ESTADO ODOO / NOTA ODOO siguen igual (con sus textos de siempre) y los demas
 *  modulos las leen igual. QUE HACER solo se CALCULA a partir de ellas; si la borras, se vuelve a crear.
 *  Se actualiza al leer correos (cada hora), al verificar en Odoo y cada vez que la extension reporta un resultado.
 */

/** Pura (sin hoja). f = {origen, estado, nota, casilla, yaWalmart, estWalmart, dias}. Devuelve el texto de QUE HACER. */
function canEstadoSimple_(f) {
  var ori = String(f.origen == null ? '' : f.origen).toUpperCase().trim();
  var est = String(f.estado == null ? '' : f.estado).trim();
  var nota = String(f.nota == null ? '' : f.nota).trim();
  var cancelado = /^CANCELADO/i.test(est);
  var necesitaWm = /^(SOBREVENTA|PRECIO|FRAUDE)/.test(ori) && ori !== CAN_ORI_PRUEBA;
  var precio = ori === CAN_ORI_PRECIO;   // 19-nov: solo PRECIO ERRONEO se cancela en Walmart por codigo (CancelacionesWalmartAuto.gs); sobreventa y fraude siguen a mano
  var errWm = /^ERROR WALMART/i.test(nota);
  var wmHecho = f.yaWalmart === true || /^CANCELADO/i.test(String(f.estWalmart || ''));
  var reciente = !(Number(f.dias) > 14);   // las viejas no piden Walmart (se supone ya hecho): evita ruido con historico

  // La cancelacion llego cuando el pedido YA tenia guia (GUIA EN SITE = SÍ …): la paqueteria puede recogerlo, hay que avisarle.
  var guiaTxt = String(f.guia == null ? '' : f.guia).trim(), guiaTardia = /^S[IÍ](?=\s|$)/i.test(guiaTxt);
  if (guiaTardia && reciente && ori !== CAN_ORI_PRUEBA && !(f.enviar === true && /^PRECIO/.test(ori))) {
    if (f.avisada !== true) return '🔴 YA TENÍA GUÍA cuando llegó la cancelación (' + guiaTxt.replace(/^S[IÍ]\s*·?\s*/i, '') + '): avisa a la paquetería para que detenga el paquete; luego marca PAQUETERIA AVISADA';
    if (cancelado) return '✅ Cancelada · ya tenía guía y avisaste a la paquetería';
  }
  if (cancelado) {
    if (precio && !wmHecho && reciente) {
      if (errWm || Number(f.dias) > CWA_MAX_DIAS) return '🔴 Cancelar a mano en Walmart (Seller Center): ' + (errWm ? 'el sistema lo intentó y falló (ver NOTA ODOO)' : 'pasaron más de ' + CWA_MAX_DIAS + ' días y ya no se cancela sola') + '; luego marca CANCELADA EN WALMART';
      return '⏳ Por cancelar en Walmart: la extensión la cancela sola en su siguiente vuelta (ya está cancelada en Odoo/site)';
    }
    if (necesitaWm && !wmHecho && reciente) return '🔴 Cancelar a mano en Walmart (solo tú, en Seller Center; el sistema nunca lo hace); luego marca CANCELADA EN WALMART';
    return '✅ Cancelada' + (precio ? ' (Walmart y Odoo/site)' : (necesitaWm ? ' (Odoo y Walmart, esta última la hiciste tú)' : ''));
  }
  if (/^NO ENCONTRADA/i.test(est)) return '🔴 Cancelar a mano: el pedido no está en Odoo, búscalo';
  if (precio && errWm && !wmHecho) return '🔴 Cancelar a mano en Walmart (Seller Center): el sistema lo intentó y falló (ver NOTA ODOO); luego marca CANCELADA EN WALMART y Odoo/site se cancela solo';
  if (/^ERROR/i.test(est) || /^ERROR/i.test(nota)) return '🔴 Cancelar a mano en Odoo/site: el sistema no pudo';
  if (/^OJO/i.test(est) || /^OJO/i.test(nota)) {
    if (est === CAN_OJO_PARCIAL || /^OJO pedido con mas productos/i.test(est)) return '🟡 Tú decides: el pedido en Odoo trae más productos que el correo';
    if (/cliente no es WALMART/i.test(est)) return '🔴 Cancelar a mano: el cliente en Odoo no es WALMART';
    return '🔴 Cancelar a mano: la entrega ya salió (hace falta devolución)';
  }
  if (f.enviar === true && f.casilla === true) return '🟡 Tú decides: marcaste ENVIAR y CANCELAR a la vez; deja solo una';
  if (f.enviar === true && /^PRECIO/.test(ori)) return '✅ Se envía (tú decidiste enviar); no se cancela';
  if (ori === CAN_ORI_PRUEBA) return '🟡 Tú decides: solo es prueba, no se cancela';
  if (/^NO CANCELAR/i.test(nota)) return '🟡 Tú decides: tienes NO CANCELAR en la nota';
  if (f.casilla === true && precio) return wmHecho ? '⏳ Por cancelar: Walmart ya está; la extensión la cancela sola en Odoo/site' : (Number(f.dias) > CWA_MAX_DIAS ? '🔴 Cancelar a mano en Walmart (Seller Center): pasaron más de ' + CWA_MAX_DIAS + ' días y ya no se cancela sola; luego marca CANCELADA EN WALMART y Odoo/site se cancela solo' : '⏳ Por cancelar: primero Walmart y luego Odoo/site, la extensión lo hace sola');
  if (f.casilla === true) return '⏳ Por cancelar: la extensión la cancela sola en el site/Odoo' + (necesitaWm ? ' (Walmart lo cancelas tú a mano)' : '');
  if (ori === CAN_ORI_CORREO || ori === '') return '⏳ Por cancelar: se marca y se cancela sola en el site/Odoo';
  if (precio) return '🟡 Tú decides: marca CANCELAR EN ODOO si la quieres cancelar (se cancela en Walmart y en Odoo/site)';
  return '🟡 Tú decides: marca CANCELAR EN ODOO si la quieres cancelar';
}

/** Dias desde una fecha de la hoja (Date o texto); si no se entiende devuelve 0 (se trata como reciente). */
function canDiasDesde_(v) {
  var d = null;
  if (v instanceof Date) d = v;
  else if (v) { var t = new Date(String(v)); if (!isNaN(t.getTime())) d = t; }
  if (!d || isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/**
 * Calcula y escribe la columna QUE HACER (solo SU columna, solo si cambia algo). Si falta, la crea y la acomoda.
 * Nunca lanza: si algo falla lo deja en el Log como aviso y la hoja sigue como estaba.
 * Devuelve cuantas celdas cambio.
 */
function canQueHacerSync_(h) {
  try {
    h = h || getHoja_(CAN_HOJA);
    if (!h || h.getLastRow() < 2) return 0;
    try { if (typeof cgSync_ === 'function') cgSync_(h); } catch (eCg) {}   // GUIA EN SITE al dia antes de calcular
    var m = canMapaHoja_(h).mapa, creada = false;
    if (m[normEnc_(CAN_QH)] === undefined) {
      canAsegurarColumnas_(h, [CAN_QH]); creada = true;
      try { canOrdenar_(h); } catch (eO) {}
      m = canMapaHoja_(h).mapa;
    }
    var cQ = m[normEnc_(CAN_QH)], n = h.getLastRow() - 1;
    if (!cQ || n < 1) return 0;
    var V = function (k) { var c = m[normEnc_(k)]; return c ? canColVals_(h, c, n) : []; };
    var ori = V(CAN_ORIGEN), est = V(CAN_ESTADO), nota = V(CAN_NOTA), chk = V(CAN_CHECK), ya = V(WMC_YA), ew = V(WMC_ESTADO), env = V('ENVIAR'), gs = V('GUIA EN SITE'), av = V('PAQUETERIA AVISADA');
    var fc = V('FECHA CORREO'), fl = V('FECHA LECTURA');
    var cO = canColOrden_(m), ordV = cO ? canColVals_(h, cO, n) : [], pedV = V('PEDIDO#');   // 19-nov: renglon vacio (sin orden ni pedido) = QUE HACER vacio
    var actual = canColVals_(h, cQ, n), cambios = 0, nuevo = [];
    for (var i = 0; i < n; i++) {
      var vacio = !String(ordV[i] == null ? '' : ordV[i]).trim() && !String(pedV[i] == null ? '' : pedV[i]).trim() && !String(ori[i] == null ? '' : ori[i]).trim();
      var t = vacio ? '' : canEstadoSimple_({ origen: ori[i], estado: est[i], nota: nota[i], casilla: chk[i], enviar: env[i], guia: gs[i], avisada: av[i], yaWalmart: ya[i], estWalmart: ew[i],
        dias: canDiasDesde_(fc[i] || fl[i]) });
      if (String(actual[i] == null ? '' : actual[i]) !== t) cambios++;
      nuevo.push([t]);
    }
    if (cambios || creada) {
      var rg = h.getRange(2, cQ, n, 1);
      rg.setNumberFormat('@');
      rg.setValues(nuevo);
    }
    return cambios;
  } catch (e) {
    try { logWarn_(CAN_ETAPA, 'No se pudo actualizar QUE HACER: ' + String(e.message || e).split('\n')[0]); } catch (e2) {}
    return 0;
  }
}

/** Reglas de color de QUE HACER (las llama canFormato_). Devuelve las reglas nuevas para agregar. */
function canQueHacerReglas_(h, m) {
  var c = m[normEnc_(CAN_QH)];
  if (!c) return [];
  var L = colLetra_(c), rg = h.getRange(2, c, Math.max(h.getMaxRows() - 1, 1), 1);
  return [['✅', '#a8dbb5', '#0b5324'], ['⏳', '#d9e8fb', '#1c4587'], ['🟡', '#fff2a8', '#7f6000'], ['🔴', '#f4b6b0', '#7a1c14']].map(function (x) {
    return SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=REGEXMATCH($' + L + '2,"^' + x[0] + '")')
      .setBackground(x[1]).setFontColor(x[2]).setBold(true).setRanges([rg]).build();
  });
}
