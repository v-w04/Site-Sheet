/**
 * ============================================================
 *  Dialogos — ventanas claras para el usuario (en lugar de SI / NO / CANCELAR sueltos)
 * ============================================================
 *
 *  Por que existe: las ventanas nativas de Sheets (ui.alert) solo tienen botones SI / NO / ACEPTAR /
 *  CANCELAR y texto plano. Cuando SI significa una cosa y NO otra, nadie entiende que esta eligiendo.
 *  Aqui cada boton lleva el nombre de lo que hace y el texto sale ordenado.
 *
 *  REGLA: todo texto que salga en un popup tambien se escribe en la hoja Log (dlgLog_). El usuario no copia popups.
 *  - dlgInfo_(titulo, texto, tipo)   aviso con formato (tipo: 'ok' | 'aviso' | 'error'). No bloquea.
 *  - dlgEnvio_(cfg)                  formulario de envio: grupos con casilla, campos, resumen y botones
 *                                    "Enviar PRUEBA (solo a ti)" / "Enviar REAL" / "Cancelar".
 *                                    El REAL pide confirmar y tiene cuenta regresiva con boton Cancelar.
 *  - dlgEnvioResponder(nombre, json) lo llama el formulario (google.script.run); solo acepta los
 *                                    manejadores de DLG_PERMITIDOS.
 *
 *  Un manejador recibe {modo:'PRUEBA'|'REAL', campos:{id:valor}, grupos:[id,...]} y devuelve
 *  {ok:boolean, lineas:[texto,...]}. Siempre vuelve a armar el plan desde las hojas: no confia en lo
 *  que mande la ventana.
 *
 *  Los .gs cargan en orden alfabetico: nada aqui depende de otros archivos a nivel global.
 * ============================================================
 */

/** Manejadores que el formulario puede invocar (nombre de funcion global). */
/** Forma de un correo, para sacarlos de un texto pegado (acepta "Nombre <a@x.com>", comas, "y", saltos de linea). */
var DLG_RE_CORREO_SRC = "[A-Za-z0-9._%+'\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}";

var DLG_PERMITIDOS = ['skFormSolicitud', 'skFormNuevos', 'skFormSoloNuevos', 'kcFormEnviar'];

/** Cuerpo de correo en HTML (parrafos, sin cortes de linea de Gmail para texto plano). */
function dlgHtmlCorreo_(texto) {
  return '<div style="font-family:Arial,sans-serif;font-size:14px">' + String(texto == null ? '' : texto).split(/\n\s*\n/).map(function (p) {
    return '<p>' + dlgEsc_(p).replace(/\n/g, '<br>') + '</p>';
  }).join('') + '</div>';
}

function dlgEsc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** JSON seguro para incrustar dentro de <script>. */
function dlgJson_(o) {
  return JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

var DLG_CSS =
  'body{font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#202124;margin:0;padding:18px 20px;background:#fff}' +
  'h1{font-size:18px;margin:0 0 4px 0}' +
  '.ayuda{color:#5f6368;margin:0 0 14px 0;line-height:1.4}' +
  '.sec{font-size:12px;font-weight:bold;color:#5f6368;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 6px 0}' +
  '.campo{margin:0 0 8px 0}.campo label{display:block;font-weight:bold;margin-bottom:3px}' +
  '.campo input,.campo select,.campo textarea{width:100%;font-family:inherit;box-sizing:border-box;padding:7px 9px;font-size:14px;border:1px solid #dadce0;border-radius:6px;background:#fff}' +
  '.campo .nota{color:#5f6368;font-size:12px;margin-top:2px}' +
  '.grupo{display:flex;gap:10px;align-items:flex-start;border:1px solid #dadce0;border-radius:8px;padding:8px 10px;margin:0 0 6px 0}' +
  '.grupo.off{background:#f1f3f4;color:#80868b}' +
  '.grupo input[type=checkbox]{margin-top:3px}.grupo>div{flex:1}.re{margin-top:6px}.re input{width:100%;box-sizing:border-box;padding:6px 8px;font-size:13px;border:1px dashed #dadce0;border-radius:6px}'+'.grupo input{margin-top:3px}.grupo .t{font-weight:bold}.grupo .d{color:#5f6368;font-size:12px;margin-top:2px;word-break:break-word}' +
  '.grupo .w{color:#b06000;font-size:12px;margin-top:2px}' +
  '.res{border-collapse:collapse;width:100%}.res td{padding:4px 6px;vertical-align:top;border-bottom:1px solid #f1f3f4}' +
  '.res td:first-child{width:90px;color:#5f6368;font-weight:bold;font-size:12px}' +
  '.aviso{background:#fef7e0;border-left:4px solid #f9ab00;padding:7px 10px;margin:0 0 6px 0;border-radius:4px;font-size:13px}' +
  '.botones{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}' +
  'button{font-size:14px;padding:9px 14px;border-radius:6px;border:1px solid #dadce0;background:#fff;cursor:pointer}' +
  'button.p{background:#1a73e8;border-color:#1a73e8;color:#fff;font-weight:bold}' +
  'button.r{background:#fff;border-color:#d93025;color:#d93025;font-weight:bold}' +
  'button.r2{background:#d93025;border-color:#d93025;color:#fff;font-weight:bold}' +
  'button:disabled{opacity:.5;cursor:default}' +
  '.conf{border:2px solid #d93025;border-radius:8px;padding:12px;margin-top:14px;background:#fce8e6}' +
  '.conf b{color:#d93025}.estado{margin-top:14px;padding:12px;border-radius:8px;background:#e8f0fe}' +
  '.estado.ok{background:#e6f4ea}.estado.mal{background:#fce8e6}.estado div{margin:2px 0}' +
  '.ic{font-size:26px;margin-right:10px}.info{display:flex;align-items:flex-start}.info .c{flex:1}' +
  '.info p{margin:0 0 8px 0;line-height:1.45}.info ul{margin:0 0 8px 0;padding-left:20px}.info li{margin:2px 0;line-height:1.4}' +
  '.w2{color:#b06000}.e2{color:#d93025}';


/** Todo lo que sale en un popup tambien queda en la hoja Log (etapa POPUP), para no tener que copiarlo a mano. */
function dlgLog_(tipo, titulo, texto) {
  try {
    var m = String(titulo) + ': ' + String(texto == null ? '' : texto).replace(/\s*\n+\s*/g, ' | ');
    if (m.length > 4000) m = m.slice(0, 4000) + '…';
    (tipo === 'error' ? logErr_ : (tipo === 'aviso' ? logWarn_ : logOk_))('POPUP', m);
    flushLog_();
  } catch (e) {}
}

/**
 * Aviso con formato, en lugar de ui.alert con texto plano. NO bloquea: el codigo sigue despues de mostrarlo,
 * asi que va al final de la funcion (o cuando nada mas se muestre despues).
 * Reglas del texto: parrafos separados por linea en blanco; lineas que empiezan con • ▸ - * son lista;
 * lineas con ⚠ salen resaltadas.
 */
function dlgInfo_(titulo, texto, tipo) {
  dlgLog_(tipo, titulo, texto);
  var ic = tipo === 'error' ? '❌' : (tipo === 'aviso' ? '⚠️' : '✅');
  var cuerpo = '';
  String(texto == null ? '' : texto).split(/\n\s*\n/).forEach(function (bloque) {
    var lineas = bloque.split('\n').filter(function (l) { return l.trim() !== ''; });
    if (!lineas.length) return;
    var esLista = lineas.every(function (l) { return /^\s*([•▸\-\*])\s*/.test(l); });
    if (esLista) {
      cuerpo += '<ul>' + lineas.map(function (l) { return '<li>' + dlgEsc_(l.replace(/^\s*([•▸\-\*])\s*/, '')) + '</li>'; }).join('') + '</ul>';
    } else {
      cuerpo += '<p>' + lineas.map(function (l) {
        var cls = /^\s*⚠/.test(l) ? ' class="w2"' : (/^\s*(❌|ERROR)/.test(l) ? ' class="e2"' : '');
        return '<span' + cls + '>' + dlgEsc_(l) + '</span>';
      }).join('<br>') + '</p>';
    }
  });
  var html = '<!doctype html><html><head><meta charset="utf-8"><base target="_top"><style>' + DLG_CSS + '</style></head><body>' +
    '<div class="info"><div class="ic">' + ic + '</div><div class="c"><h1>' + dlgEsc_(titulo) + '</h1><div style="height:8px"></div>' + cuerpo + '</div></div>' +
    '<div class="botones"><button class="p" onclick="google.script.host.close()">Entendido</button></div>' +
    '</body></html>';
  var largo = String(texto || '').length;
  var alto = Math.max(190, Math.min(560, 150 + Math.ceil(largo / 70) * 20 + (String(texto || '').split('\n').length * 4)));
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(alto), titulo);
}

/**
 * Formulario de envio. cfg:
 *   titulo, ayuda, manejador (de DLG_PERMITIDOS), yo (correo de pruebas), segundos (cuenta regresiva del REAL),
 *   etiquetaGrupos, campos:[{id,etiqueta,valor,nota,opciones:[[valor,texto],...] (lista desplegable)}], grupos:[{id,titulo,detalle,aviso,marcado,bloqueado}],
 *   resumen:[[etiqueta,texto],...], avisos:[texto,...]
 */
function dlgEnvio_(cfg) {
  if (DLG_PERMITIDOS.indexOf(cfg.manejador) < 0) throw new Error('Manejador no permitido: ' + cfg.manejador);
  var campos = (cfg.campos || []).map(function (c) {
    var ctl = c.opciones
      ? '<select data-campo="' + dlgEsc_(c.id) + '">' + c.opciones.map(function (o) {
          return '<option value="' + dlgEsc_(o[0]) + '"' + (String(o[0]) === String(c.valor) ? ' selected' : '') + '>' + dlgEsc_(o[1]) + '</option>';
        }).join('') + '</select>'
      : (c.area
        ? '<textarea data-campo="' + dlgEsc_(c.id) + '" rows="3" oninput="vista()">' + dlgEsc_(c.valor) + '</textarea>'
        : '<input type="text" data-campo="' + dlgEsc_(c.id) + '" value="' + dlgEsc_(c.valor) + '">');
    return '<div class="campo"><label>' + dlgEsc_(c.etiqueta) + '</label>' + ctl +
      (c.nota ? '<div class="nota">' + dlgEsc_(c.nota) + '</div>' : '') + (c.area ? '<div class="nota" id="vista"></div>' : '') + '</div>';
  }).join('');
  var grupos = (cfg.grupos || []).map(function (g) {
    return '<label class="grupo' + (g.bloqueado ? ' off' : '') + '"><input type="checkbox" data-grupo="' + dlgEsc_(g.id) + '"' +
      (g.marcado && !g.bloqueado ? ' checked' : '') + (g.bloqueado ? ' disabled' : '') + '><div><div class="t">' + dlgEsc_(g.titulo) + '</div>' +
      (g.detalle ? '<div class="d">' + dlgEsc_(g.detalle) + '</div>' : '') + (g.aviso ? '<div class="w">⚠ ' + dlgEsc_(g.aviso) + '</div>' : '') +
      (cfg.reenvio ? '<div class="re"><input type="text" data-otros="' + dlgEsc_(g.id) + '" placeholder="Fuera de oficina: reenviar solo a… (correos separados por coma)" oninput="auto(this)"><div class="nota" data-vista="' + dlgEsc_(g.id) + '"></div></div>' : '') + '</div></label>';
  }).join('');
  var resumen = (cfg.resumen || []).map(function (r) { return '<tr><td>' + dlgEsc_(r[0]) + '</td><td>' + dlgEsc_(r[1]) + '</td></tr>'; }).join('');  // col-fija: r es [etiqueta, texto], no una fila de hoja
  var avisos = (cfg.avisos || []).map(function (a) { return '<div class="aviso">⚠ ' + dlgEsc_(a) + '</div>'; }).join('');
  var seg = cfg.segundos || 30;

  var js =
    'var CFG=' + dlgJson_({ manejador: cfg.manejador, segundos: seg, yo: cfg.yo || '', re: DLG_RE_CORREO_SRC }) + ';' +
    'var timer=null,modoPend="";' +
    'function q(s){return document.querySelector(s)}' +
    'function datos(modo){var c={};document.querySelectorAll("[data-campo]").forEach(function(i){c[i.getAttribute("data-campo")]=i.value});' +
    ' var g=[];document.querySelectorAll("[data-grupo]").forEach(function(i){if(i.checked)g.push(i.getAttribute("data-grupo"))});var ot={};document.querySelectorAll("[data-otros]").forEach(function(i){ot[i.getAttribute("data-otros")]=i.value});return {modo:modo,campos:c,grupos:g,otros:ot}}' +
    'function todos(v){document.querySelectorAll("[data-grupo]").forEach(function(i){if(!i.disabled)i.checked=v})}' +
    'function marcados(){return document.querySelectorAll("[data-grupo]:checked").length}' +
    'function lista(t){var m=(t||"").match(new RegExp(CFG.re,"g"))||[];var v={},o=[];m.forEach(function(x){var k=x.toLowerCase();if(!v[k]){v[k]=1;o.push(x)}});return o}' +
    'function otros(){var r={};document.querySelectorAll("[data-otros]").forEach(function(i){var l=lista(i.value);if(l.length)r[i.getAttribute("data-otros")]=l});return r}' +
    'function vista(){var n=0;document.querySelectorAll("[data-otros]").forEach(function(i){var g=i.getAttribute("data-otros"),l=lista(i.value),e=null;document.querySelectorAll("[data-vista]").forEach(function(z){if(z.getAttribute("data-vista")===g)e=z});if(l.length)n++;if(e)e.textContent=i.value.trim()?(l.length?("Se detectaron "+l.length+": "+l.join(", ")):"Aún no hay correos válidos."):""});var b=q("#bRe");if(b)b.disabled=!n}' +
    'function auto(el){var g=el.getAttribute("data-otros");document.querySelectorAll("[data-grupo]").forEach(function(c){if(c.getAttribute("data-grupo")===g)c.checked=lista(el.value).length>0});vista()}' +
    'function bloquear(b){document.querySelectorAll("button").forEach(function(x){x.disabled=b});if(!b)vista()}' +
    'function estado(clase,lineas){var e=q("#estado");e.className="estado "+clase;e.style.display="block";e.innerHTML="";lineas.forEach(function(l){var d=document.createElement("div");d.textContent=l;e.appendChild(d)});e.scrollIntoView({block:"nearest"})}' +
    'function enviar(modo){bloquear(true);q("#conf").style.display="none";estado("",["Enviando… no cierres esta ventana."]);' +
    ' google.script.run.withSuccessHandler(function(r){bloquear(false);q("#acciones").style.display="none";' +
    '  estado(r.ok?"ok":"mal",r.lineas);q("#cerrar").style.display="block"})' +
    '  .withFailureHandler(function(e){bloquear(false);q("#acciones").style.display="flex";estado("mal",["No se pudo enviar: "+(e&&e.message?e.message:e),"Revisa la hoja Log y la hoja Envios killers antes de repetir."])})' +
    '  .dlgEnvioResponder(CFG.manejador,JSON.stringify(datos(modo)))}' +
    'function pedir(modo){var o=otros(),ks=Object.keys(o);if(modo==="REENVIO"){if(!ks.length){estado("mal",["Escribe al menos un correo válido en algún grupo."]);return}}else if(!marcados()){estado("mal",["Marca al menos un grupo."]);return}' +
    ' modoPend=modo;q("#estado").style.display="none";q("#conf").style.display="block";q("#conf").scrollIntoView({block:"nearest"});q("#acciones").style.display="none";var s=CFG.segundos;' +
    ' q("#confTxt").textContent=modo==="REENVIO"?("Se enviará SOLO así: "+ks.map(function(g){return g+" → "+o[g].join(", ")}).join("  |  ")+"."):("Se enviará a los KAMs de "+marcados()+" grupo(s).");' +
    ' q("#seg").textContent=s;' +
    ' timer=setInterval(function(){s--;q("#seg").textContent=s;if(s<=0){clearInterval(timer);q("#conf").style.display="none";q("#acciones").style.display="flex";enviar(modoPend)}},1000)}' +
    'function cancelarReal(){clearInterval(timer);q("#conf").style.display="none";q("#acciones").style.display="flex";estado("",["Envío cancelado. No se envió nada."])}' +
    'vista();';

  var barra =
    '<div class="barra">' +
    '<div class="botones" id="acciones">' +
      '<button class="p" title="Solo a ' + dlgEsc_(cfg.yo || 'ti') + '" onclick="enviar(\'PRUEBA\')">Prueba</button>' +
      '<button class="r" onclick="pedir(\'REAL\')">Real</button>' +
      (cfg.reenvio ? '<button class="r" id="bRe" title="Solo a los correos escritos en cada grupo" onclick="pedir(\'REENVIO\')">OOO</button>' : '') +
      '<button onclick="google.script.host.close()">Cancelar</button></div>' +
    '<div class="conf" id="conf" style="display:none"><b>¿Enviar DE VERDAD?</b> <span id="confTxt"></span> ' +
      'Sale en <b id="seg"></b> s.<div class="botones"><button class="r2" onclick="cancelarReal()">Parar</button></div></div>' +
    '<div class="estado" id="estado" style="display:none"></div>' +
    '<div class="botones" id="cerrar" style="display:none"><button class="p" onclick="google.script.host.close()">Cerrar</button></div>' +
    '</div>';
  var html = '<!doctype html><html><head><meta charset="utf-8"><base target="_top"><style>' + DLG_CSS +
    '.barra{position:sticky;top:0;z-index:9;background:#fff;padding:6px 0 8px;border-bottom:1px solid #dadce0;margin-bottom:8px}.barra .botones{margin:0}.barra .estado,.barra .conf{margin:6px 0 0}' +
    '</style></head><body>' + barra +
    '<h1>' + dlgEsc_(cfg.titulo) + '</h1>' + (cfg.ayuda ? '<p class="ayuda">' + dlgEsc_(cfg.ayuda) + '</p>' : '') +
    avisos +
    campos +
    (grupos ? '<div class="sec">' + dlgEsc_(cfg.etiquetaGrupos || 'Grupos') + '</div><div class="botones" style="margin:0 0 8px"><button onclick="todos(true)">☑ Todos</button><button onclick="todos(false)">☐ Ninguno</button></div>' + grupos : '') +
    (resumen ? '<div class="sec">Qué se manda</div><table class="res">' + resumen + '</table>' : '') +
    '<script>' + js + '</script></body></html>';
  var alto = Math.max(420, Math.min(820, 340 + (cfg.grupos || []).length * (cfg.reenvio ? 100 : 62) + (cfg.campos || []).length * 62 + (cfg.avisos || []).length * 34 + (cfg.reenvio ? 40 : 0)));
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(640).setHeight(alto), cfg.titulo);
}

/** Correos de reenvio por grupo: { GRUPO: [correos] } a partir de p.otros (texto de cada cuadro); los vacios o sin correo validos no entran. */
function dlgOtros_(p) {
  var raw = (p && p.otros) || {}, out = {};
  Object.keys(raw).forEach(function (g) { var c = dlgCorreos_(raw[g]); if (c.length) out[String(g)] = c; });
  return out;
}

/** Correos sueltos de un texto pegado ("Nombre <a@x.com> y b@x.com, ..."): sin repetir, en el orden en que salen. */
function dlgCorreos_(texto) {
  var m = String(texto == null ? '' : texto).match(new RegExp(DLG_RE_CORREO_SRC, 'g')) || [], vistos = {}, out = [];
  m.forEach(function (x) { var k = x.toLowerCase(); if (!vistos[k]) { vistos[k] = 1; out.push(x); } });
  return out;
}

/** Lo llama el formulario. Solo ejecuta manejadores de la lista. */
function dlgEnvioResponder(nombre, json) {
  if (DLG_PERMITIDOS.indexOf(nombre) < 0) throw new Error('Accion no permitida.');
  var p = JSON.parse(json);
  var f = globalThis[nombre];
  if (typeof f !== 'function') throw new Error('No existe el manejador ' + nombre);
  var r = f(p);
  try { if (r && r.lineas) dlgLog_(r.ok ? 'ok' : 'error', 'Resultado ' + nombre, r.lineas.join('\n')); } catch (e) {}
  return r;
}
