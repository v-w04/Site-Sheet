/**
 * BuzonPlantillas.gs — Site Sheet
 *
 * Las plantillas de respuesta del Buzon de Seller Center, NUMERADAS, en la hoja "Plantillas Buzon".
 * Para que ella pueda decir "manda la plantilla 7" (etapa 1 del Buzon: ella elige el numero; despues el Sheet
 * sugiere por patrones; al final responde solo, siempre con plantillas).
 *
 * - La extension (Chrome) las lee de Seller Center (solo lectura) y las manda aqui (accion 'seller_plantillas').
 * - Cada plantilla conserva SU numero para siempre (se ata al ID de Walmart): una nueva toma el siguiente numero;
 *   si Walmart cambia el nombre o el texto, se actualiza en la misma fila; si desaparece de Walmart, la fila se queda.
 * - Aqui no se envia nada a Walmart.
 */
var BZP_HOJA = 'Plantillas Buzon', BZP_ETAPA = 'BUZON', BZP_ENC = ['NUM', 'NOMBRE', 'TEXTO', 'ID WALMART'];

/** Pura. Lista que manda la extension -> [{id, nombre, texto}] limpia y acotada. */
function bzpLimpiar_(lista) {
  var out = [], vistos = {};
  (Array.isArray(lista) ? lista : []).slice(0, 80).forEach(function (x) {
    if (!x) return;
    var id = String(x.id || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 64);
    var nombre = String(x.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    var texto = String(x.texto || '').replace(/\r/g, '').trim().slice(0, 4000);
    if (!id || !nombre || vistos[id]) return;
    vistos[id] = true;
    out.push({ id: id, nombre: nombre, texto: texto });
  });
  return out;
}

/** POST 'seller_plantillas' {clave, plantillas:[{id, nombre, texto}]} -> {ok, recibidas, nuevas, cambiadas}. */
function bzpRecibir_(p) {
  var err = csAutorizar_(p); if (err) return err;
  var lista = bzpLimpiar_(p.plantillas);
  if (!lista.length) return { ok: true, recibidas: 0, nuevas: 0, cambiadas: 0 };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'ocupado' };
  try {
    var h = peHojaAsegurar_(BZP_HOJA, BZP_ENC), m = ubicarColumnas_(h, BZP_ENC, 1);
    var col = function (e) { return escrCol_(m, e); };
    var n = Math.max(h.getLastRow() - 1, 0), vals = n ? h.getRange(2, 1, n, h.getLastColumn()).getValues() : [];
    var v = function (f, e) { var c = col(e); return c ? f[c - 1] : ''; };
    var porId = {}, maxNum = 0;
    vals.forEach(function (f, i) {
      var id = String(v(f, 'ID WALMART') || '').trim(); if (id) porId[id] = i;
      var num = Number(v(f, 'NUM')); if (isFinite(num) && num > maxNum) maxNum = num;
    });
    var nuevas = [], cambiadas = 0;
    lista.forEach(function (x) {
      var i = porId[x.id];
      if (i === undefined) { nuevas.push({ 'NUM': ++maxNum, 'NOMBRE': x.nombre, 'TEXTO': x.texto, 'ID WALMART': x.id }); return; }
      var f = vals[i], fila = i + 2, cambio = false;
      [['NOMBRE', x.nombre], ['TEXTO', x.texto]].forEach(function (par) {
        var c = col(par[0]); if (!c || String(f[c - 1]) === String(par[1])) return;
        h.getRange(fila, c).setValue(par[1]); cambio = true;
      });
      if (cambio) cambiadas++;
    });
    if (nuevas.length) peAgregar_(h, BZP_ENC, nuevas);
    if (nuevas.length || cambiadas) {
      try { bzpFormato_(h, m); } catch (e) {}
      logOk_(BZP_ETAPA, 'Plantillas del Buzon: ' + lista.length + ' leidas, ' + nuevas.length + ' nuevas, ' + cambiadas + ' cambiadas');
    }
    flushLog_();
    return { ok: true, recibidas: lista.length, nuevas: nuevas.length, cambiadas: cambiadas };
  } catch (e) {
    logErr_(BZP_ETAPA, 'No se pudieron guardar las plantillas del Buzon: ' + String(e.message || e).split('\n')[0]); flushLog_();
    return { ok: false, error: 'no_se_pudo_guardar' };
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}

/** Anchos y ajuste de texto solo en las columnas propias, y solo si estan angostas (respeta lo que ella ya cambio). */
function bzpFormato_(h, m) {
  var ancho = { 'NUM': 55, 'NOMBRE': 230, 'TEXTO': 560, 'ID WALMART': 120 };
  BZP_ENC.forEach(function (e) { var c = escrCol_(m, e); if (c && h.getColumnWidth(c) < 60 && ancho[e] > 60) h.setColumnWidth(c, ancho[e]); });
  var cT = escrCol_(m, 'TEXTO'), n = Math.max(h.getLastRow() - 1, 0);
  if (cT && n) h.getRange(2, cT, n, 1).setWrap(true);
}
