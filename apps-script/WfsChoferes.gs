/**
 * ============================================================
 *  WfsChoferes — cambiar choferes y camionetas de un envio YA creado
 * ============================================================
 *  Proceso: se crea la hoja "ENVIO N" con los choferes que se tienen al inicio; despues Walmart da la
 *  fecha/cita y el equipo manda los choferes finales. Con este formulario se agregan o quitan choferes y
 *  camionetas de esa hoja. Lo que queda en la hoja es la configuracion final: al archivar los envios
 *  (🗄 Archivar envíos y limpiar) eso es lo que pasa a HISTORICO CHOFERES / CAMIONETAS junto con el envio.
 *  Los nuevos tambien se suman al CATALOGO para la proxima vez.
 *  Solo para hojas ENVIO creadas por 🚚 Nuevo envío (se ubican por encabezado, WFS_ENV_ENC).
 * ============================================================
 */

var WFSCH_FILAS_MAX = 60;   // igual que la lectura de wfsLeerHojaEnvio_ (primeras 60 filas del bloque)

function wfsChClave_(s) { return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim(); }

/** Hojas ENVIO N que se pueden editar. */
function wfsChHojas_(ss) {
  return ss.getSheets().map(function (h) { return h.getName(); })
    .filter(function (n) { return /^ENVIO\s+\d+/i.test(n); });
}

/** Columnas del bloque de choferes/camionetas segun el contrato WFS_ENV_ENC (1-based). */
function wfsChCols_() {
  return {
    chofer: wfsIdxEnc_(WFS_ENV_ENC, 'CHOFER'), curp: wfsIdxEnc_(WFS_ENV_ENC, 'CURP'), contacto: wfsIdxEnc_(WFS_ENV_ENC, 'CONTACTO'),
    placas: wfsIdxEnc_(WFS_ENV_ENC, 'PLACAS'), camioneta: wfsIdxEnc_(WFS_ENV_ENC, 'CAMIONETA')
  };
}

/** Verifica que la hoja tenga el formato que crea el script (si no, no se toca). */
function wfsChValidar_(sh) {
  var P = wfsChCols_();
  var enc = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), P.contacto)).getDisplayValues()[0];
  [['chofer', 'CHOFER'], ['curp', 'CURP'], ['contacto', 'CONTACTO'], ['placas', 'PLACAS'], ['camioneta', 'CAMIONETA']].forEach(function (p) {
    if (String(enc[P[p[0]] - 1] || '').toUpperCase().replace(/[^A-Z]/g, '') !== p[1]) {
      throw new Error('La hoja "' + sh.getName() + '" no tiene el formato de 🚚 Nuevo envío (falta la columna ' + p[1] + ' donde debe estar). Cámbiala a mano en la hoja.');
    }
  });
  return P;
}

function wfsCambiarChoferes() {
  var html = HtmlService.createHtmlOutput(wfsChHtml_()).setWidth(760).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, '✏️ Cambiar choferes y camionetas del envío');
}

/** Lo que necesita el formulario (lo llama el HTML): hojas, y para la elegida los actuales + el catalogo. */
function wfsChDatos(nombreHoja) {
  var ss = SpreadsheetApp.getActive();
  var hojas = wfsChHojas_(ss);
  if (!hojas.length) throw new Error('No hay ninguna hoja "ENVIO N". Crea una con 🚚 Nuevo envío.');
  var activa = ss.getActiveSheet().getName();
  var nom = nombreHoja && hojas.indexOf(nombreHoja) >= 0 ? nombreHoja : (hojas.indexOf(activa) >= 0 ? activa : hojas[0]);
  var sh = ss.getSheetByName(nom);
  wfsChValidar_(sh);
  var act = wfsLeerHojaEnvio_(sh);
  var cat = {
    chof: wfsLeerCatalogoEnvio_(ss, WFS_CONFIG.HOJA_CAT_CHOF),
    cam: wfsLeerCatalogoEnvio_(ss, WFS_CONFIG.HOJA_CAT_CAM)
  };
  var chofer = [], visto = {};
  act.choferes.forEach(function (x) {
    var k = wfsChClave_(x[1]); if (visto[k]) return; visto[k] = 1;
    chofer.push({ a: x[1], b: x[2], c: x[3], marcado: true });
  });
  cat.chof.forEach(function (x) { var k = wfsChClave_(x.a); if (visto[k]) return; visto[k] = 1; chofer.push({ a: x.a, b: x.b, c: x.c, marcado: false, veces: x.veces }); });
  var camioneta = []; visto = {};
  act.camionetas.forEach(function (x) {
    var k = wfsChClave_(x[1]); if (visto[k]) return; visto[k] = 1;
    camioneta.push({ a: x[1], b: x[2], c: x[3], marcado: true });
  });
  cat.cam.forEach(function (x) { var k = wfsChClave_(x.a); if (visto[k]) return; visto[k] = 1; camioneta.push({ a: x.a, b: x.b, c: x.c, marcado: false, veces: x.veces }); });
  const Pc = { id: wfsIdColEnvio_(), delivery: wfsIdxEnc_(WFS_ENV_ENC, 'DELIVERY'), fecha: wfsIdxEnc_(WFS_ENV_ENC, 'FECHA'), hora: wfsIdxEnc_(WFS_ENV_ENC, 'HORA') };
  const fx = function (c) { return sh.getRange(2, c).getValue(); };
  const fe = fx(Pc.fecha), ho = fx(Pc.hora);
  const info = {
    id: String(fx(Pc.id) || ''), delivery: String(fx(Pc.delivery) || ''),
    fecha: fe instanceof Date ? Utilities.formatDate(fe, 'America/Mexico_City', 'yyyy-MM-dd') : '',
    hora: ho instanceof Date ? Utilities.formatDate(ho, 'America/Mexico_City', 'HH:mm') : String(ho || '')
  };
  return { hojas: hojas, hoja: nom, choferes: chofer, camionetas: camioneta, info: info };
}

/** Guarda la configuracion final en la hoja del envio y suma los nuevos al catalogo. */
function wfsChGuardar(opts) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) throw new Error(WFS_OCUPADO);
  try {
    var res = wfsChGuardar_(opts);
    wfsLogResumen_('OK', res);
    return res;
  } catch (e) {
    wfsLogResumen_('ERROR', 'Cambiar choferes: ' + e.message + '\n' + (e.stack || ''));
    throw e;
  } finally {
    flushLog_();
    lock.releaseLock();
  }
}

function wfsChGuardar_(opts) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(String((opts && opts.hoja) || ''));
  if (!sh || !/^ENVIO\s+\d+/i.test(sh.getName())) throw new Error('Elige una hoja ENVIO.');
  var P = wfsChValidar_(sh);
  var ch = ((opts && opts.choferes) || []).map(function (x) {
    return { nombre: wfsLimpia_(x.nombre).toUpperCase(), curp: wfsLimpia_(x.curp).toUpperCase(), contacto: wfsLimpia_(x.contacto) };
  }).filter(function (x) { return x.nombre; });
  var cm = ((opts && opts.camionetas) || []).map(function (x) {
    return { placas: wfsLimpia_(x.placas).toUpperCase(), color: wfsLimpia_(x.color).toUpperCase(), tipo: wfsLimpia_(x.tipo).toUpperCase() };
  }).filter(function (x) { return x.placas; });
  if (!ch.length) throw new Error('Deja al menos un chofer.');
  if (!cm.length) throw new Error('Deja al menos una camioneta.');
  if (ch.length > WFSCH_FILAS_MAX - 2 || cm.length > WFSCH_FILAS_MAX - 2) throw new Error('Son demasiados (máximo ' + (WFSCH_FILAS_MAX - 2) + ').');

  var inf = (opts && opts.info) || null;
  var Pc = { id: wfsIdColEnvio_(), delivery: wfsIdxEnc_(WFS_ENV_ENC, 'DELIVERY'), fecha: wfsIdxEnc_(WFS_ENV_ENC, 'FECHA'), hora: wfsIdxEnc_(WFS_ENV_ENC, 'HORA') };
  var cambiosInfo = [];
  if (inf) {
    var fch = String(inf.fecha || '').trim(), hrs = String(inf.hora || '').trim();
    if (fch && !/^\d{4}-\d{2}-\d{2}$/.test(fch)) throw new Error('La fecha no se ve bien.');
    if (hrs && !/^\d{1,2}:\d{2}$/.test(hrs)) throw new Error('La hora no se ve bien.');
    sh.getRange(2, Pc.id).setNumberFormat('@').setValue(wfsLimpia_(inf.id));
    sh.getRange(2, Pc.delivery).setNumberFormat('@').setValue(wfsLimpia_(inf.delivery));
    if (fch) sh.getRange(2, Pc.fecha).setValue(new Date(fch + 'T12:00:00'));
    if (hrs) sh.getRange(2, Pc.hora).setValue(hrs);
    cambiosInfo.push('• ID ENVIO: ' + (wfsLimpia_(inf.id) || '(vacío)') + ' · DELIVERY: ' + (wfsLimpia_(inf.delivery) || '(vacío)') + ' · cita: ' + (fch || '—') + ' ' + (hrs || ''));
  }
  var antes = wfsLeerHojaEnvio_(sh);
  var antesCh = antes.choferes.map(function (x) { return x[1]; }), antesCm = antes.camionetas.map(function (x) { return x[1]; });

  var filas = 2 + Math.max(ch.length, cm.length);
  if (sh.getMaxRows() < filas) sh.insertRowsAfter(sh.getMaxRows(), filas - sh.getMaxRows());
  var n = Math.min(WFSCH_FILAS_MAX, sh.getMaxRows() - 2);
  [P.chofer, P.curp, P.contacto, P.placas, P.camioneta].forEach(function (c) { sh.getRange(3, c, n, 1).clearContent(); });   // la fila 2 (cabecera del envio) no se toca
  sh.getRange(3, P.chofer, ch.length, 1).setValues(ch.map(function (x) { return [x.nombre]; }));
  sh.getRange(3, P.curp, ch.length, 1).setValues(ch.map(function (x) { return [x.curp]; }));
  sh.getRange(3, P.contacto, ch.length, 1).setValues(ch.map(function (x) { return [x.contacto]; }));
  sh.getRange(3, P.placas, cm.length, 1).setValues(cm.map(function (x) { return [(x.placas + ' ' + x.color).trim()]; }));
  sh.getRange(3, P.camioneta, cm.length, 1).setValues(cm.map(function (x) { return [x.tipo]; }));

  // Los nuevos pasan al catalogo (VECES se cuenta al archivar)
  var nuevosCh = wfsChSumarCatalogo_(ss, WFS_CONFIG.HOJA_CAT_CHOF, ch.map(function (x) { return [x.nombre, x.curp, x.contacto]; }));
  var nuevosCm = wfsChSumarCatalogo_(ss, WFS_CONFIG.HOJA_CAT_CAM, cm.map(function (x) { return [x.placas, x.color, x.tipo]; }));

  try { wfsFormatoEnvio_(sh); } catch (e) { logWarn_('FORMATO', 'Formato de la hoja ENVIO: ' + e.message); }
  var lineas = ['• ' + sh.getName() + ': envío actualizado'].concat(cambiosInfo);
  lineas.push('• Choferes antes: ' + (antesCh.join(', ') || '—'));
  lineas.push('• Choferes ahora: ' + ch.map(function (x) { return x.nombre; }).join(', '));
  lineas.push('• Camionetas antes: ' + (antesCm.join(', ') || '—'));
  lineas.push('• Camionetas ahora: ' + cm.map(function (x) { return x.placas; }).join(', '));
  if (nuevosCh || nuevosCm) lineas.push('• Nuevos en el catálogo: ' + nuevosCh + ' chofer(es), ' + nuevosCm + ' camioneta(s)');
  lineas.push('• Al 🗄 Archivar envíos esto es lo que se guarda en el histórico con el envío.');
  return lineas.join('\n');
}

/** Agrega al catalogo los que no estan (clave = primera columna). Devuelve cuantos agrego. */
function wfsChSumarCatalogo_(ss, hoja, filas) {
  var h = ss.getSheetByName(hoja);
  if (!h) return 0;
  var ya = {};
  if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, 1).getValues().forEach(function (r) { ya[wfsChClave_(r[0])] = 1; });
  var nuevos = filas.filter(function (f) { var k = wfsChClave_(f[0]); if (!k || ya[k]) return false; ya[k] = 1; return true; })
    .map(function (f) { return [f[0], f[1], f[2], 0, '']; });   // col-fija: fila del catalogo que escribe este script (WFS_CAT_ENC_*)
  if (nuevos.length) h.getRange(h.getLastRow() + 1, 1, nuevos.length, 5).setValues(nuevos);
  return nuevos.length;
}

function wfsChHtml_() {
  return '' +
'<!DOCTYPE html><html><head><base target="_top"><meta charset="utf-8">' +
'<style>' +
'body{font:13px/1.45 Roboto,Arial,sans-serif;margin:0;padding:0 16px 14px;color:#1f2328}' +
'.barra{position:sticky;top:0;background:#fff;padding:8px 0;border-bottom:1px solid #d8dee4;z-index:5}' +
'.barra button{margin-right:6px}' +
'h3{margin:10px 0 2px;font-size:15px}.sub{color:#59636e;margin:0 0 10px}' +
'*{box-sizing:border-box}.row{display:flex;gap:16px;align-items:flex-start}.col{flex:1 1 0;min-width:0}' +
'.f4{display:flex;gap:10px;flex-wrap:wrap}.f4 div{display:flex;flex-direction:column}.f4 label{font-size:11px;color:#59636e;margin-bottom:2px}' +
'fieldset{border:1px solid #d8dee4;border-radius:6px;padding:8px 10px;margin:0 0 12px;min-width:0;width:100%}' +
'legend{font-weight:600;color:#1f94f9;padding:0 4px}' +
'label.it{display:block;padding:3px 0;white-space:normal;overflow-wrap:anywhere}' +
'label.it span.m{color:#59636e;font-size:11px}' +
'.add{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px dashed #d8dee4}.add input{flex:1;min-width:70px}' +
'select,input[type=text],input[type=date],input[type=time]{background:#fff;border:1px solid #b6bec6;border-radius:4px;padding:5px 6px;font:13px Roboto,Arial}' +
'button{background:#1f94f9;color:#fff;border:0;border-radius:5px;padding:6px 14px;font:600 13px Roboto,Arial;cursor:pointer}' +
'button.g{background:#fff;color:#1f2328;border:1px solid #d8dee4}' +
'button:disabled{background:#9fc9f0;cursor:default}' +
'#res{white-space:pre-wrap;margin-top:6px;padding:8px;border-radius:5px;display:none}' +
'.ok{background:#e8f5e9;color:#1b5e20}.err{background:#fdecea;color:#b3261e}' +
'</style></head><body>' +
'<div class="barra"><button id="btn" onclick="guardar()" disabled>Guardar</button><button class="g" onclick="google.script.host.close()">Cerrar</button>' +
'<div id="res"></div></div>' +
'<h3>Choferes y camionetas del envío</h3><p class="sub">Marca los que SÍ van, quita la palomita a los que no, o agrega nuevos. Lo que quede es lo que se guarda en el histórico.</p>' +
'<p><label>Envío: <select id="hoja" onchange="cargar(this.value)"></select></label></p>' +
'<fieldset><legend>Datos del envío</legend><div class="f4"><div><label>ID de envío</label><input type="text" id="i_id"></div><div><label>Delivery</label><input type="text" id="i_del"></div><div><label>Fecha de la cita</label><input type="date" id="i_fec"></div><div><label>Hora</label><input type="time" id="i_hor"></div></div></fieldset>' +
'<div class="row">' +
'<div class="col"><fieldset><legend>Choferes</legend><div id="chof"></div>' +
'<div class="add"><input type="text" id="n1" placeholder="Nombre"><input type="text" id="n2" placeholder="CURP"><input type="text" id="n3" placeholder="Contacto"><button class="g" onclick="addCh()">+ Agregar</button></div></fieldset></div>' +
'<div class="col"><fieldset><legend>Camionetas</legend><div id="cam"></div>' +
'<div class="add"><input type="text" id="m1" placeholder="Placas"><input type="text" id="m2" placeholder="Color"><input type="text" id="m3" placeholder="Tipo"><button class="g" onclick="addCm()">+ Agregar</button></div></fieldset></div>' +
'</div>' +
'<script>' +
'var CH=[],CM=[];' +
'function esc(t){return String(t==null?"":t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");}' +
'function cargar(h){document.getElementById("btn").disabled=true;google.script.run.withSuccessHandler(pinta).withFailureHandler(function(e){muestra("err",e.message);}).wfsChDatos(h||"");}' +
'cargar("");' +
'function pinta(d){CH=d.choferes;CM=d.camionetas;var I=d.info||{};document.getElementById("i_id").value=I.id||"";document.getElementById("i_del").value=I.delivery||"";document.getElementById("i_fec").value=I.fecha||"";document.getElementById("i_hor").value=I.hora||"";' +
' var s="";d.hojas.forEach(function(n){s+=\'<option\'+(n===d.hoja?" selected":"")+">"+esc(n)+"</option>";});document.getElementById("hoja").innerHTML=s;' +
' dibuja();document.getElementById("btn").disabled=false;}' +
'function dibuja(){var h="";CH.forEach(function(x,i){h+=\'<label class="it"><input type="checkbox" class="ch" data-i="\'+i+\'"\'+(x.marcado?" checked":"")+"> "+esc(x.a)+\' <span class="m">\'+esc(x.c)+"</span></label>";});' +
' document.getElementById("chof").innerHTML=h||"(sin choferes)";' +
' var g="";CM.forEach(function(x,i){g+=\'<label class="it"><input type="checkbox" class="cm" data-i="\'+i+\'"\'+(x.marcado?" checked":"")+"> "+esc(x.a)+" "+esc(x.b)+\' <span class="m">\'+esc(x.c)+"</span></label>";});' +
' document.getElementById("cam").innerHTML=g||"(sin camionetas)";}' +
'function sync(){document.querySelectorAll(".ch").forEach(function(c){CH[+c.getAttribute("data-i")].marcado=c.checked});document.querySelectorAll(".cm").forEach(function(c){CM[+c.getAttribute("data-i")].marcado=c.checked});}' +
'function addCh(){sync();var n=document.getElementById("n1").value.trim();if(!n){muestra("err","Escribe el nombre del chofer.");return;}' +
' CH.push({a:n,b:document.getElementById("n2").value.trim(),c:document.getElementById("n3").value.trim(),marcado:true});' +
' ["n1","n2","n3"].forEach(function(i){document.getElementById(i).value=""});dibuja();}' +
'function addCm(){sync();var n=document.getElementById("m1").value.trim();if(!n){muestra("err","Escribe las placas.");return;}' +
' CM.push({a:n,b:document.getElementById("m2").value.trim(),c:document.getElementById("m3").value.trim(),marcado:true});' +
' ["m1","m2","m3"].forEach(function(i){document.getElementById(i).value=""});dibuja();}' +
'function guardar(){sync();' +
' var ch=CH.filter(function(x){return x.marcado}).map(function(x){return {nombre:x.a,curp:x.b,contacto:x.c}});' +
' var cm=CM.filter(function(x){return x.marcado}).map(function(x){return {placas:x.a,color:x.b,tipo:x.c}});' +
' if(!ch.length){muestra("err","Deja al menos un chofer.");return;}if(!cm.length){muestra("err","Deja al menos una camioneta.");return;}' +
' document.getElementById("btn").disabled=true;muestra("ok","Guardando…");' +
' google.script.run.withSuccessHandler(function(r){muestra("ok",r);document.getElementById("btn").disabled=false;})' +
'  .withFailureHandler(function(e){document.getElementById("btn").disabled=false;muestra("err",e.message);})' +
'  .wfsChGuardar({hoja:document.getElementById("hoja").value,choferes:ch,camionetas:cm,info:{id:document.getElementById("i_id").value,delivery:document.getElementById("i_del").value,fecha:document.getElementById("i_fec").value,hora:document.getElementById("i_hor").value}});}' +
'function muestra(cls,t){var r=document.getElementById("res");r.className=cls;r.style.display="block";r.textContent=t;window.scrollTo(0,0);}' +
'</script></body></html>';
}
