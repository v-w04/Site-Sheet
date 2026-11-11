import io, os
os.chdir(os.path.expanduser('~/mnt/Site Sheet/apps-script'))

def edit(path, pairs):
    s = io.open(path, encoding='utf-8', newline='').read()
    for a, b in pairs:
        assert s.count(a) == 1, (path, s.count(a), a[:90])
        s = s.replace(a, b)
    io.open(path, 'w', encoding='utf-8', newline='').write(s)

# ---------------- Cancelaciones.gs ----------------
edit('Cancelaciones.gs', [
# filas nuevas leidas del correo: casilla MARCADA (Walmart ya cancelo: se cancela sola)
("""    var datos = items.map(function (it) {
      var fila = new Array(ancho).fill('');
      CAN_FIJAS.forEach(function (f, i) { fila[mapa[normEnc_(f)] - 1] = it.fijas[i]; });
      if (mapa[normEnc_(CAN_ORIGEN)]) fila[mapa[normEnc_(CAN_ORIGEN)] - 1] = CAN_ORI_CORREO;
      it.encs.forEach(function (e) { fila[mapa[normEnc_(e)] - 1] = it.valores[e]; });
      return fila;
    });
""",
"""    var cChkNueva = canMapaHoja_(h).mapa[normEnc_(CAN_CHECK)];   // correo de Walmart = se cancela sola: casilla CANCELAR EN ODOO marcada
    var datos = items.map(function (it) {
      var fila = new Array(ancho).fill('');
      CAN_FIJAS.forEach(function (f, i) { fila[mapa[normEnc_(f)] - 1] = it.fijas[i]; });
      if (mapa[normEnc_(CAN_ORIGEN)]) fila[mapa[normEnc_(CAN_ORIGEN)] - 1] = CAN_ORI_CORREO;
      it.encs.forEach(function (e) { fila[mapa[normEnc_(e)] - 1] = it.valores[e]; });
      if (cChkNueva) fila[cChkNueva - 1] = true;
      return fila;
    });
"""),
# verificar en Odoo: si Odoo dice cancelado, la casilla queda marcada
("""  var cPor = m[normEnc_(CAN_POR)], cTod = m[normEnc_(CAN_TODAS)], cPro = m[normEnc_(CAN_PRODUCTO)], cTot = m[normEnc_(CAN_TOTAL)];
  var cSku = m[normEnc_(CAN_SKU_COMPLETO)], cQty = m[normEnc_('QTY.')], cSkuW = m[normEnc_('SKU')];
  if (!cOrd || !cEst || !cEnt || !cFec || !cNot) throw new Error('Faltan columnas de control: corre "Formato cancelaciones".');
""",
"""  var cPor = m[normEnc_(CAN_POR)], cTod = m[normEnc_(CAN_TODAS)], cPro = m[normEnc_(CAN_PRODUCTO)], cTot = m[normEnc_(CAN_TOTAL)];
  var cSku = m[normEnc_(CAN_SKU_COMPLETO)], cQty = m[normEnc_('QTY.')], cSkuW = m[normEnc_('SKU')], cChkV = m[normEnc_(CAN_CHECK)];
  if (!cOrd || !cEst || !cEnt || !cFec || !cNot) throw new Error('Faltan columnas de control: corre "Formato cancelaciones".');
"""),
("""      por = col(cPor), tod = col(cTod), pro = col(cPro), tot = col(cTot), sku = col(cSku), qty = col(cQty);
  var pide = canPedidosCorreo_""",
"""      por = col(cPor), tod = col(cTod), pro = col(cPro), tot = col(cTot), sku = col(cSku), qty = col(cQty), chkV = col(cChkV);
  var pide = canPedidosCorreo_"""),
("""    est[k][0] = e; ent[k][0] = pc.join(' | '); fec[k][0] = f;
""",
"""    est[k][0] = e; ent[k][0] = pc.join(' | '); fec[k][0] = f;
    if (chkV && /^CANCELADO/.test(e)) chkV[k][0] = true;   // cancelada: la casilla CANCELAR EN ODOO queda marcada
"""),
("""  poner(cPor, por); poner(cTod, tod); poner(cPro, pro); poner(cTot, tot); poner(cSku, sku); poner(cQty, qty);
  SpreadsheetApp.flush();
  return { revisadas: lista.length, canceladas: canceladas, cambios: cambios };""",
"""  poner(cPor, por); poner(cTod, tod); poner(cPro, pro); poner(cTot, tot); poner(cSku, sku); poner(cQty, qty); poner(cChkV, chkV);
  SpreadsheetApp.flush();
  return { revisadas: lista.length, canceladas: canceladas, cambios: cambios };"""),
])

# ---------------- CancelacionesSite.gs ----------------
edit('CancelacionesSite.gs', [
# pendientes (menu): solo las marcadas
("""  var cEst = m[normEnc_(CAN_ESTADO)];
  if (!cOrd) return [];
  var ord = h.getRange(2, cOrd, n, 1).getValues();
  var est = cEst ? h.getRange(2, cEst, n, 1).getValues() : [];
  var ori = canColVals_(h, m[normEnc_(CAN_ORIGEN)], n);
  var vistos = {}, out = [];
  for (var i = 0; i < n; i++) {
    var o = String(ord[i][0] || '').trim(), e = String((est[i] || [''])[0] || '');
    if (!o || vistos[o] || /^CANCELADO/.test(e)) continue;""",
"""  var cEst = m[normEnc_(CAN_ESTADO)], cChk = m[normEnc_(CAN_CHECK)];
  if (!cOrd) return [];
  var ord = h.getRange(2, cOrd, n, 1).getValues();
  var est = cEst ? h.getRange(2, cEst, n, 1).getValues() : [];
  var chk = cChk ? h.getRange(2, cChk, n, 1).getValues() : null;
  var ori = canColVals_(h, m[normEnc_(CAN_ORIGEN)], n);
  var vistos = {}, out = [];
  for (var i = 0; i < n; i++) {
    var o = String(ord[i][0] || '').trim(), e = String((est[i] || [''])[0] || '');
    if (!o || vistos[o] || /^CANCELADO/.test(e)) continue;
    if (!chk || chk[i][0] !== true) continue;     // sin casilla marcada no esta pendiente: espera la decision de la persona"""),
# lo que la extension puede cancelar: SOLO filas con la casilla CANCELAR EN ODOO marcada
("""  var cEst = m[normEnc_(CAN_ESTADO)], cNot = m[normEnc_(CAN_NOTA)];
  if (!cOrd || !cEst) return [];
  var ord = h.getRange(2, cOrd, n, 1).getValues(), est = h.getRange(2, cEst, n, 1).getValues();
  var not = cNot ? h.getRange(2, cNot, n, 1).getValues() : [];
  var ori = canColVals_(h, m[normEnc_(CAN_ORIGEN)], n);
  var bloq = {};""",
"""  var cEst = m[normEnc_(CAN_ESTADO)], cNot = m[normEnc_(CAN_NOTA)], cChk = m[normEnc_(CAN_CHECK)];
  if (!cOrd || !cEst) return [];
  if (!cChk) { try { avisoLogDia_('CS_SIN_CASILLA', 'ERROR', CS_ETAPA, 'Cancelaciones no tiene la columna CANCELAR EN ODOO: no se cancela nada. Corre Formato de cancelaciones.'); flushLog_(); } catch (e0) {} return []; }
  var ord = h.getRange(2, cOrd, n, 1).getValues(), est = h.getRange(2, cEst, n, 1).getValues();
  var chk = h.getRange(2, cChk, n, 1).getValues();
  var not = cNot ? h.getRange(2, cNot, n, 1).getValues() : [];
  var ori = canColVals_(h, m[normEnc_(CAN_ORIGEN)], n);
  var bloq = {};"""),
("""  for (var i = 0; i < n; i++) {
    var o = String(ord[i][0] || '').trim(), e = String(est[i][0] || '');
    if (!o || vistos[o] || bloq[o] || /^CANCELADO/.test(e)) continue;
    vistos[o] = true;
    var pa = String(inte[o] || '').split('|');""",
"""  for (var i = 0; i < n; i++) {
    var o = String(ord[i][0] || '').trim(), e = String(est[i][0] || '');
    if (!o || vistos[o] || bloq[o] || /^CANCELADO/.test(e)) continue;
    if (chk[i][0] !== true) continue;             // casilla CANCELAR EN ODOO sin marcar: espera la decision de la persona
    vistos[o] = true;
    var pa = String(inte[o] || '').split('|');"""),
# entrega: primero la migracion unica de casillas
("""  try {
    var ords = csParaExtension_();
    if (!ords.length) return { ok: true, ordenes: [] };""",
"""  try {
    try { canCasillasV2_(); } catch (e0) { logWarn_(CS_ETAPA, 'No pude marcar las casillas de Cancelaciones: ' + String(e0.message || e0).split('\\n')[0]); }
    var ords = csParaExtension_();
    if (!ords.length) return { ok: true, ordenes: [] };"""),
# resultado: cancelada => casilla marcada
("""    var cEst = m[normEnc_(CAN_ESTADO)], cNot = m[normEnc_(CAN_NOTA)], cPor = m[normEnc_(CAN_POR)], cFec = m[normEnc_(CAN_FECHA_ODOO)];
    var filas = [];""",
"""    var cEst = m[normEnc_(CAN_ESTADO)], cNot = m[normEnc_(CAN_NOTA)], cPor = m[normEnc_(CAN_POR)], cFec = m[normEnc_(CAN_FECHA_ODOO)], cChk = m[normEnc_(CAN_CHECK)];
    var filas = [];"""),
("""        if (cPor) h.getRange(f, cPor).setValue(persona);
        if (cFec) h.getRange(f, cFec).setValue(ahora_());
      });""",
"""        if (cPor) h.getRange(f, cPor).setValue(persona);
        if (cFec) h.getRange(f, cFec).setValue(ahora_());
        if (cChk) h.getRange(f, cChk).setValue(true);     // cancelada: casilla CANCELAR EN ODOO marcada
      });"""),
("""/** Accion cancel_pendientes: entrega el PIN y la lista (solo con la clave de la extension). */""",
"""/**
 * Una sola vez (Script Property CAN_CASILLAS_V2): la casilla CANCELAR EN ODOO ahora MANDA (la extension solo cancela filas marcadas).
 * Para que no se detenga nada de lo que ya estaba en camino: se marcan las ya canceladas, las que vienen de correo, sobreventa
 * y manuales, y las de precio erroneo que pierden mas de 5% (por la nota). Las de precio erroneo de 5% o menos quedan como estan.
 */
function canCasillasV2_() {
  if (props_().getProperty('CAN_CASILLAS_V2') === '1') return 0;
  var h = getHoja_(CAN_HOJA);
  if (!h || h.getLastRow() < 2) { props_().setProperty('CAN_CASILLAS_V2', '1'); return 0; }
  var m = canMapaHoja_(h).mapa, n = h.getLastRow() - 1, cOrd = null;
  Object.keys(m).forEach(function (k) { if (!cOrd && /^ORDEN DE COMPRA/.test(k)) cOrd = m[k]; });
  var cEst = m[normEnc_(CAN_ESTADO)], cNot = m[normEnc_(CAN_NOTA)], cChk = m[normEnc_(CAN_CHECK)];
  if (!cOrd || !cChk) return 0;
  var ord = h.getRange(2, cOrd, n, 1).getValues(), chk = h.getRange(2, cChk, n, 1).getValues();
  var est = cEst ? h.getRange(2, cEst, n, 1).getValues() : [], not = cNot ? h.getRange(2, cNot, n, 1).getValues() : [];
  var ori = canColVals_(h, m[normEnc_(CAN_ORIGEN)], n);
  var cambios = 0;
  for (var i = 0; i < n; i++) {
    if (!String(ord[i][0] || '').trim() || chk[i][0] === true) continue;
    var e = String((est[i] || [''])[0] || ''), o = String(ori[i] || '').toUpperCase(), nt = String((not[i] || [''])[0] || '');
    var marcar = false;
    if (/^CANCELADO/.test(e)) marcar = true;
    else if (o === CAN_ORI_PRUEBA) marcar = false;
    else if (o === CAN_ORI_PRECIO) { var mm = /\\(([\\d.]+)% abajo\\)/.exec(nt); marcar = !!mm && Number(mm[1]) > 5; }
    else marcar = true;     // correo, sobreventa, manual o sin origen: ya iban a cancelarse
    if (marcar) { chk[i][0] = true; cambios++; }
  }
  if (cambios) h.getRange(2, cChk, n, 1).setValues(chk);
  props_().setProperty('CAN_CASILLAS_V2', '1');
  logInfo_(CS_ETAPA, 'Casillas CANCELAR EN ODOO: ' + cambios + ' fila(s) marcadas (canceladas y las que se cancelan solas). Desde ahora la extension solo cancela filas marcadas.');
  flushLog_();
  return cambios;
}

/** Accion cancel_pendientes: entrega el PIN y la lista (solo con la clave de la extension). */"""),
])
print('ok2')
