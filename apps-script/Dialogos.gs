/**
 * ============================================================
 *  Dialogos — ventanas claras para el usuario (en lugar de SI / NO / CANCELAR sueltos)
 * ============================================================
 *
 *  Por que existe: las ventanas nativas de Sheets (ui.alert) solo tienen botones SI / NO / ACEPTAR /
 *  CANCELAR y texto plano. Cuando SI significa una cosa y NO otra, nadie entiende que esta eligiendo.
 *  Aqui cada boton lleva el nombre de lo que hace y el texto sale ordenado.
 *
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
var DLG_PERMITIDOS = ['skFormSolicitud', 'skFormReconsiderar'];

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
  '.campo input,.campo select{width:100%;box-sizing:border-box;padding:7px 9px;font-size:14px;border:1px solid #dadce0;border-radius:6px;background:#fff}' +
  '.campo .nota{color:#5f6368;font-size:12px;margin-top:2px}' +
  '.grupo{display:flex;gap:10px;align-items:flex-start;border:1px solid #dadce0;border-radius:8px;padding:8px 10px;margin:0 0 6px 0}' +
  '.grupo.off{background:#f1f3f4;color:#80868b}' +
  '.grupo input{margin-top:3px}.grupo .t{font-weight:bold}.grupo .d{color:#5f6368;font-size:12px;margin-top:2px;word-break:break-word}' +
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

/**
 * Aviso con formato, en lugar de ui.alert con texto plano. NO bloquea: el codigo sigue despues de mostrarlo,
 * asi que va al final de la funcion (o cuando nada mas se muestre despues).
 * Reglas del texto: parrafos separados por linea en blanco; lineas que empiezan con • ▸ - * son lista;
 * lineas con ⚠ salen resaltadas.
 */
function dlgInfo_(titulo, texto, tipo) {
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
      : '<input type="text" data-campo="' + dlgEsc_(c.id) + '" value="' + dlgEsc_(c.valor) + '">';
    return '<div class="campo"><label>' + dlgEsc_(c.etiqueta) + '</label>' + ctl +
      (c.nota ? '<div class="nota">' + dlgEsc_(c.nota) + '</div>' : '') + '</div>';
  }).join('');
  var grupos = (cfg.grupos || []).map(function (g) {
    return '<label class="grupo' + (g.bloqueado ? ' off' : '') + '"><input type="checkbox" data-grupo="' + dlgEsc_(g.id) + '"' +
      (g.marcado && !g.bloqueado ? ' checked' : '') + (g.bloqueado ? ' disabled' : '') + '><div><div class="t">' + dlgEsc_(g.titulo) + '</div>' +
      (g.detalle ? '<div class="d">' + dlgEsc_(g.detalle) + '</div>' : '') + (g.aviso ? '<div class="w">⚠ ' + dlgEsc_(g.aviso) + '</div>' : '') + '</div></label>';
  }).join('');
  var resumen = (cfg.resumen || []).map(function (r) { return '<tr><td>' + dlgEsc_(r[0]) + '</td><td>' + dlgEsc_(r[1]) + '</td></tr>'; }).join('');  // col-fija: r es [etiqueta, texto], no una fila de hoja
  var avisos = (cfg.avisos || []).map(function (a) { return '<div class="aviso">⚠ ' + dlgEsc_(a) + '</div>'; }).join('');
  var seg = cfg.segundos || 30;

  var js =
    'var CFG=' + dlgJson_({ manejador: cfg.manejador, segundos: seg, yo: cfg.yo || '' }) + ';' +
    'var timer=null;' +
    'function q(s){return document.querySelector(s)}' +
    'function datos(modo){var c={};document.querySelectorAll("[data-campo]").forEach(function(i){c[i.getAttribute("data-campo")]=i.value});' +
    ' var g=[];document.querySelectorAll("[data-grupo]").forEach(function(i){if(i.checked)g.push(i.getAttribute("data-grupo"))});return {modo:modo,campos:c,grupos:g}}' +
    'function marcados(){return document.querySelectorAll("[data-grupo]:checked").length}' +
    'function bloquear(b){document.querySelectorAll("button").forEach(function(x){x.disabled=b})}' +
    'function estado(clase,lineas){var e=q("#estado");e.className="estado "+clase;e.style.display="block";e.innerHTML=lineas.map(function(l){var d=document.createElement("div");d.textContent=l;return d.outerHTML}).join("")}' +
    'function enviar(modo){if(!marcados()){estado("mal",["Marca al menos un grupo."]);return}' +
    ' bloquear(true);q("#conf").style.display="none";estado("","Enviando… no cierres esta ventana.".split("|"));' +
    ' google.script.run.withSuccessHandler(function(r){bloquear(false);q("#acciones").style.display="none";' +
    '  estado(r.ok?"ok":"mal",r.lineas);q("#cerrar").style.display="block"})' +
    '  .withFailureHandler(function(e){bloquear(false);estado("mal",["No se pudo enviar: "+(e&&e.message?e.message:e),"No se envió nada si dice error antes de enviar. Revisa la hoja Envios killers."])})' +
    '  .dlgEnvioResponder(CFG.manejador,JSON.stringify(datos(modo)))}' +
    'function pedirReal(){if(!marcados()){estado("mal",["Marca al menos un grupo."]);return}' +
    ' q("#estado").style.display="none";q("#conf").style.display="block";q("#acciones").style.display="none";var s=CFG.segundos;' +
    ' q("#n").textContent=marcados();q("#seg").textContent=s;' +
    ' timer=setInterval(function(){s--;q("#seg").textContent=s;if(s<=0){clearInterval(timer);q("#conf").style.display="none";q("#acciones").style.display="flex";enviar("REAL")}},1000)}' +
    'function cancelarReal(){clearInterval(timer);q("#conf").style.display="none";q("#acciones").style.display="flex";estado("",["Envío real cancelado. No se envió nada."])}';

  var html = '<!doctype html><html><head><meta charset="utf-8"><base target="_top"><style>' + DLG_CSS + '</style></head><body>' +
    '<h1>' + dlgEsc_(cfg.titulo) + '</h1>' + (cfg.ayuda ? '<p class="ayuda">' + dlgEsc_(cfg.ayuda) + '</p>' : '') +
    campos +
    (grupos ? '<div class="sec">' + dlgEsc_(cfg.etiquetaGrupos || 'Grupos') + '</div>' + grupos : '') +
    (resumen ? '<div class="sec">Qué se manda</div><table class="res">' + resumen + '</table>' : '') +
    (avisos ? '<div class="sec">Ojo</div>' + avisos : '') +
    '<div class="botones" id="acciones">' +
      '<button class="p" onclick="enviar(\'PRUEBA\')">Enviar PRUEBA (solo a ' + dlgEsc_(cfg.yo || 'ti') + ')</button>' +
      '<button class="r" onclick="pedirReal()">Enviar REAL a los KAMs…</button>' +
      '<button onclick="google.script.host.close()">Cancelar</button></div>' +
    '<div class="conf" id="conf" style="display:none"><b>¿Enviar DE VERDAD?</b><br>Se enviará a los KAMs de <b id="n"></b> grupo(s). ' +
      'Sale en <b id="seg"></b> segundos.<div class="botones"><button class="r2" onclick="cancelarReal()">NO, cancelar envío</button></div></div>' +
    '<div class="estado" id="estado" style="display:none"></div>' +
    '<div class="botones" id="cerrar" style="display:none"><button class="p" onclick="google.script.host.close()">Cerrar</button></div>' +
    '<script>' + js + '</script></body></html>';
  var alto = Math.max(420, Math.min(720, 330 + (cfg.grupos || []).length * 62 + (cfg.campos || []).length * 62 + (cfg.avisos || []).length * 34));
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(620).setHeight(alto), cfg.titulo);
}

/** Lo llama el formulario. Solo ejecuta manejadores de la lista. */
function dlgEnvioResponder(nombre, json) {
  if (DLG_PERMITIDOS.indexOf(nombre) < 0) throw new Error('Accion no permitida.');
  var p = JSON.parse(json);
  var f = globalThis[nombre];
  if (typeof f !== 'function') throw new Error('No existe el manejador ' + nombre);
  return f(p);
}
