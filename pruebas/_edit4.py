import io, os
os.chdir(os.path.expanduser('~/mnt/Site Sheet'))

def edit(path, pairs):
    s = io.open(path, encoding='utf-8', newline='').read()
    for a, b in pairs:
        assert s.count(a) == 1, (path, s.count(a), a[:90])
        s = s.replace(a, b)
    io.open(path, 'w', encoding='utf-8', newline='').write(s)

edit('apps-script/CancelacionesPrecio.gs', [
# texto de la perdida + columna PERDIDA
("""/** Texto corto de la fila: precio vendido contra minimo. */""",
"""var CANP_COL_PERDIDA = 'PERDIDA';

/** 1234.5 -> '1,235' */
function canpMiles_(n) { return String(Math.round(Number(n) || 0)).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ','); }

/** Texto de la columna PERDIDA: lo que se pierde en total y su porcentaje. Ej. "$1,910 · 7.0%" (varias piezas: "$1,920 · 9.8% (8 pzas)"). */
function canpPerdida_(v) {
  var min = Number(v.minimo) || 0, pz = Math.max(Number(v.piezas) || 1, 1);
  var unit = -(Number(v.pct) || 0) * min;
  if (!(unit > 0)) unit = min - (Number(v.precio) || 0);
  if (!(unit > 0)) return '';
  var pct = Math.round(Math.abs(Number(v.pct) || 0) * 1000) / 10;
  return '$' + canpMiles_(unit * pz) + ' · ' + pct.toFixed(1) + '%' + (pz > 1 ? ' (' + pz + ' pzas)' : '');
}

/** La columna PERDIDA existe y va junto a QTY. (la acomoda canOrdenar_). */
function canAsegurarPerdida_(h) {
  if (canMapaHoja_(h).mapa[normEnc_(CANP_COL_PERDIDA)]) return;
  canAsegurarColumnas_(h, [CANP_COL_PERDIDA]);
  try { canOrdenar_(h); } catch (e) {}
}

/** Llena PERDIDA en las filas de PRECIO ERRONEO que no la traen (las de antes), leyendo precio, minimo y % de su nota. */
function canpCompletarPerdida_() {
  var h = getHoja_(CAN_HOJA);
  if (!h || h.getLastRow() < 2) return 0;
  canAsegurarPerdida_(h);
  var m = canMapaHoja_(h).mapa, n = h.getLastRow() - 1;
  var cP = m[normEnc_(CANP_COL_PERDIDA)], cO = m[normEnc_(CAN_ORIGEN)], cN = m[normEnc_(CAN_NOTA)], cQ = m[normEnc_('QTY.')];
  if (!cP || !cO || !cN) return 0;
  var per = h.getRange(2, cP, n, 1).getValues(), ori = h.getRange(2, cO, n, 1).getValues(), nota = h.getRange(2, cN, n, 1).getValues();
  var qty = cQ ? h.getRange(2, cQ, n, 1).getValues() : null, cambios = 0;
  for (var i = 0; i < n; i++) {
    if (String(ori[i][0] || '').toUpperCase() !== CAN_ORI_PRECIO || String(per[i][0] || '').trim()) continue;
    var mm = /vendida a \\$([\\d.,]+) con minimo \\$([\\d.,]+) \\(([\\d.]+)% abajo\\)/.exec(String(nota[i][0] || ''));
    if (!mm) continue;
    var p = Number(mm[1].replace(/,/g, '')), mn = Number(mm[2].replace(/,/g, '')), pc = Number(mm[3]);
    var pz = Math.max(Number(qty ? qty[i][0] : 1) || 1, 1);
    per[i][0] = '$' + canpMiles_((mn - p) * pz) + ' · ' + pc.toFixed(1) + '%' + (pz > 1 ? ' (' + pz + ' pzas)' : '');
    cambios++;
  }
  if (cambios) h.getRange(2, cP, n, 1).setNumberFormat('@').setValues(per);
  return cambios;
}

/** Texto corto de la fila: precio vendido contra minimo. */"""),
("""    poner(fila, CAN_NOTA, canpNota_(v));""",
"""    poner(fila, CAN_NOTA, canpNota_(v));
    poner(fila, CANP_COL_PERDIDA, canpPerdida_(v));"""),
("""  canAsegurarColumnas_(h, CAN_FIJAS); canAsegurarControl_(h); canAsegurarOrigen_(h);
  var m = canMapaHoja_(h).mapa, cOrd = canColOrden_(m);
  if (!cOrd) cOrd = canAsegurarColumnas_(h, ['Orden de compra#'])[normEnc_('Orden de compra#')];""",
"""  canAsegurarColumnas_(h, CAN_FIJAS); canAsegurarControl_(h); canAsegurarOrigen_(h); canAsegurarPerdida_(h);
  var m = canMapaHoja_(h).mapa, cOrd = canColOrden_(m);
  if (!cOrd) cOrd = canAsegurarColumnas_(h, ['Orden de compra#'])[normEnc_('Orden de compra#')];"""),
])

edit('apps-script/Cancelaciones.gs', [
("""var CAN_ORDEN_PRINCIPAL = [CAN_ORIGEN, 'FECHA CORREO', 'ORDEN DE COMPRA#', 'PEDIDO#', 'SKU COMPLETO', 'QTY.'];""",
 """var CAN_ORDEN_PRINCIPAL = [CAN_ORIGEN, 'FECHA CORREO', 'ORDEN DE COMPRA#', 'PEDIDO#', 'SKU COMPLETO', 'QTY.', 'PERDIDA'];"""),
])

edit('apps-script/PreciosErroneos.gs', [
("""      var ref = vals(colV('REFERENCIA')), cand = [];""",
"""      try { canpCompletarPerdida_(); } catch (e1) {}   // PERDIDA de las filas de precio erroneo que aun no la traen
      var ref = vals(colV('REFERENCIA')), cand = [];"""),
])

# pruebas
edit('pruebas/t46.js', [
("const enc=['ORIGEN','FECHA LECTURA','FECHA CORREO','ID CORREO','ORDEN DE COMPRA#','PEDIDO#','SKU COMPLETO','QTY.','CANCELAR EN ODOO','NOTA ODOO'];",
 "const enc=['ORIGEN','FECHA LECTURA','FECHA CORREO','ID CORREO','ORDEN DE COMPRA#','PEDIDO#','SKU COMPLETO','QTY.','CANCELAR EN ODOO','NOTA ODOO','PERDIDA'];"),
("t(C(-0.03).auto.length===0",
 "const PD=(v)=>vm.runInContext('canpPerdida_',ctx)(v);\n"
 "t(PD({precio:21999,minimo:27299,piezas:1,pct:-0.07})==='$1,911 · 7.0%'||PD({precio:21999,minimo:27299,piezas:1,pct:-0.07})==='$1,910 · 7.0%','PERDIDA: $ y % en una celda: '+PD({precio:21999,minimo:27299,piezas:1,pct:-0.07}));\n"
 "t(PD({precio:2199,minimo:2439,piezas:8,pct:-0.0984})==='$1,920 · 9.8% (8 pzas)','PERDIDA con varias piezas: '+PD({precio:2199,minimo:2439,piezas:8,pct:-0.0984}));\n"
 "t(/^\\$\\d/.test(r.filas[0][10])&&/25\\.4%/.test(r.filas[0][10]),'la fila nueva trae PERDIDA: '+r.filas[0][10]);\n"
 "t(C(-0.03).auto.length===0"),
])
print('ok4')
