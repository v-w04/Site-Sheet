/**
 * Killers.gs — Site Sheet
 *
 * Baja los Killers / Ofertas especiales de electronicsmexico.site/walmart/killers
 * a una hoja llamada "Killers", con su fecha de inicio y de termino.
 * De ahi los toma wmNuevoCambio() opcion 2 para generar el archivo de Walmart.
 *
 * Es autonomo: lee el token y la cookie directo de las Script Properties, no
 * depende de Api.gs. Si Api.gs esta cargado, reusa su renovacion de cookie.
 *
 * Orden la primera vez:
 *   1) killersDescubrir()      busca la ruta de datos y la guarda.
 *   2) killersVerEstructura()  muestra como viene el JSON (mandamelo si algo falla).
 *   3) killersBajar()          escribe la hoja "Killers".
 *
 * Despues solo se corre killersBajar().
 */

var K_SITE    = 'https://electronicsmexico.site';
var K_PAGINA  = '/walmart/killers';
var K_HOJA    = 'Killers';

var K_PROP = {
  TOKEN:  'SITE_API_TOKEN',
  COOKIE: 'SITE_SESSION_COOKIE',
  RUTA:   'KILLERS_RUTA',
  METODO: 'KILLERS_METODO'
};

var K_CANDIDATAS = [
  '/walmart/killers/api/lista',
  '/walmart/killers/api/activos',
  '/walmart/killers/api/data',
  '/walmart/killers/data',
  '/walmart/killers/json',
  '/walmart/killers-data',
  '/walmart/api/killers',
  '/walmart/killers/api'
];

/* Encabezados de la hoja y fragmentos con los que se busca cada campo. */
var K_COLUMNAS = [
  ['SKU',       ['sku']],
  ['TITULO',    ['titulo', 'title', 'nombre', 'name']],
  ['PUBLICADO', ['publicado', 'precio_publicado', 'price', 'precio']],
  ['CUPON',     ['cupon', 'coupon', 'descuento']],
  ['NOS PAGAN', ['pagan', 'neto', 'payout', 'nos_pagan']],
  ['INICIA',    ['inicia', 'inicio', 'start', 'desde', 'vigente_desde']],
  ['TERMINA',   ['termina', 'fin', 'end', 'hasta', 'vigente_hasta', 'expira']],
  ['DIAS',      ['dias', 'days', 'restantes']]
];

/* ================================================================== */
/*  Descubrimiento                                                     */
/* ================================================================== */

function killersDescubrir() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(K_PROP.TOKEN) && !props.getProperty(K_PROP.COOKIE)) {
    throw new Error('No hay credencial del site. Configura el token o la cookie primero.');
  }

  var log = [];
  var candidatas = K_CANDIDATAS.slice();

  // 1. Leer la pagina y sacar las rutas que ella misma pide.
  var pag = kFetch_(K_PAGINA, 'get', null);
  log.push('Pagina ' + K_PAGINA + ': HTTP ' + pag.code + ', ' + pag.texto.length + ' bytes');

  if (pag.code === 200) {
    var vistas = {};
    var re = /["'`](\/[A-Za-z0-9_\-\/\.]*(?:killer|oferta|especial)[A-Za-z0-9_\-\/\.]*)["'`]/gi;
    var m;
    while ((m = re.exec(pag.texto)) !== null) {
      var ruta = m[1];
      if (ruta.length > 4 && !/\.(css|js|png|jpg|svg|ico|woff2?)$/i.test(ruta)) vistas[ruta] = 1;
    }
    Object.keys(vistas).forEach(function (r) {
      if (candidatas.indexOf(r) < 0) candidatas.push(r);
    });
    log.push('Rutas que menciona la pagina: ' + (Object.keys(vistas).join(', ') || '(ninguna)'));
  }

  // 2. Probar cada una con GET y con POST.
  var mejor = null;
  candidatas.forEach(function (ruta) {
    ['get', 'post'].forEach(function (metodo) {
      if (ruta === K_PAGINA && metodo === 'get') return;
      var r = kFetch_(ruta, metodo, metodo === 'post' ? '{}' : null);
      var p = kPuntaje_(r);
      log.push(kPad_(metodo.toUpperCase(), 5) + ' ' + kPad_(ruta, 38) +
               ' HTTP ' + r.code + '  ' + kPad_(String(r.texto.length) + 'b', 10) + ' puntos ' + p.puntos +
               (p.nota ? '  ' + p.nota : ''));
      if (p.puntos > 0 && (!mejor || p.puntos > mejor.puntos)) {
        mejor = { ruta: ruta, metodo: metodo, puntos: p.puntos, filas: p.filas };
      }
    });
  });

  var msg = log.join('\n');
  if (mejor) {
    props.setProperty(K_PROP.RUTA, mejor.ruta);
    props.setProperty(K_PROP.METODO, mejor.metodo);
    msg = 'GUARDADO: ' + mejor.metodo.toUpperCase() + ' ' + mejor.ruta +
          '  (' + mejor.filas + ' registros)\n\n' + msg +
          '\n\nAhora corre killersBajar().';
  } else {
    msg = 'No encontre ninguna ruta que devuelva la lista.\n\n' + msg +
          '\n\nCopia esto y mandamelo, o usa killersRutaAMano() si ya sabes la ruta.';
  }
  kAviso_('Descubrir killers', msg);
  return msg;
}

function killersRutaAMano() {
  var ui = SpreadsheetApp.getUi();
  var r1 = ui.prompt('Ruta de killers', 'Ejemplo: /walmart/killers/api/lista', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var r2 = ui.prompt('Metodo', 'Escribe GET o POST', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;

  PropertiesService.getScriptProperties().setProperties({
    KILLERS_RUTA: String(r1.getResponseText()).trim(),
    KILLERS_METODO: String(r2.getResponseText()).trim().toLowerCase() === 'post' ? 'post' : 'get'
  });
  kAviso_('Listo', 'Ruta guardada. Corre killersVerEstructura() o killersBajar().');
}

/** Muestra como viene el JSON, para poder mapear los campos. */
function killersVerEstructura() {
  var r = kTraer_();
  var lista = kEncontrarLista_(r.json);
  if (!lista || !lista.length) {
    kAviso_('Estructura', 'No encontre una lista de registros.\n\nLlaves de primer nivel:\n' +
      Object.keys(r.json || {}).join(', '));
    return;
  }
  var reg = lista[0];
  var lineas = Object.keys(reg).map(function (k) {
    var v = reg[k];
    var t = v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v);
    return kPad_(k, 26) + kPad_(t, 9) + String(JSON.stringify(v)).slice(0, 60);
  });
  var msg = 'Registros: ' + lista.length + '\nCampos: ' + Object.keys(reg).length +
            '\n\n' + lineas.join('\n');
  kAviso_('Estructura de un killer', msg);
  Logger.log(msg);
  return msg;
}

/* ================================================================== */
/*  Bajada                                                             */
/* ================================================================== */

function killersBajar() {
  var ss = SpreadsheetApp.getActive();
  var r = kTraer_();
  var lista = kEncontrarLista_(r.json);
  if (!lista || !lista.length) {
    throw new Error('La respuesta no trae la lista de killers. Corre killersVerEstructura().');
  }

  var llaves = Object.keys(lista[0]);
  var mapa = K_COLUMNAS.map(function (c) { return kBuscarCampo_(llaves, c[1]); });

  var filas = lista.map(function (reg) {
    return K_COLUMNAS.map(function (c, i) {
      var k = mapa[i];
      if (!k) return '';
      var v = reg[k];
      if (c[0] === 'INICIA' || c[0] === 'TERMINA') return kFecha_(v);
      return (v === null || v === undefined) ? '' : v;
    });
  });

  var h = ss.getSheetByName(K_HOJA);
  if (!h) h = ss.insertSheet(K_HOJA);
  try { var f = h.getFilter(); if (f) f.remove(); } catch (e) {}
  h.clear();

  var nCols = K_COLUMNAS.length;
  var sc = h.getMaxColumns() - nCols;
  if (sc > 0) h.deleteColumns(nCols + 1, sc);
  if (sc < 0) h.insertColumnsAfter(h.getMaxColumns(), -sc);
  var quiero = Math.max(filas.length + 1, 50);
  var sf = h.getMaxRows() - quiero;
  if (sf > 0) h.deleteRows(quiero + 1, sf);
  if (sf < 0) h.insertRowsAfter(h.getMaxRows(), -sf);

  h.getRange(1, 1, 1, nCols).setValues([K_COLUMNAS.map(function (c) { return c[0]; })])
   .setFontWeight('bold').setBackground('#eef2f7');
  h.getRange(2, 1, filas.length, nCols).setValues(filas);

  h.getRange(2, 3, filas.length, 3).setNumberFormat('#,##0.00');
  h.getRange(2, 6, filas.length, 2).setNumberFormat('yyyy-mm-dd hh:mm');
  h.setFrozenRows(1);

  // Sello de cuando se bajo, para saber si la tanda ya esta vieja.
  var tz = ss.getSpreadsheetTimeZone();
  var iCol = 0;
  for (var c = 0; c < K_COLUMNAS.length; c++) if (K_COLUMNAS[c][0] === 'TERMINA') iCol = c;
  var ahora = new Date(), vig = 0;
  filas.forEach(function (f) { if (f[iCol] instanceof Date && f[iCol] > ahora) vig++; });
  h.getRange(1, 1).setNote(
    'Bajado del site el ' + Utilities.formatDate(ahora, tz, 'yyyy-MM-dd HH:mm') +
    '\n' + filas.length + ' killers, ' + vig + ' vigentes');
  h.getRange(1, 1, 1, nCols).createFilter();
  SpreadsheetApp.flush();
  h.autoResizeColumns(1, nCols);
  if (h.getColumnWidth(2) > 420) h.setColumnWidth(2, 420);

  var sinMapear = K_COLUMNAS.filter(function (c, i) { return !mapa[i]; })
                            .map(function (c) { return c[0]; });
  var msg = filas.length + ' killers en la hoja "' + K_HOJA + '", ' + vig + ' vigentes.\n' +
            'Bajado ahorita del site, con sus fechas de inicio y termino tal cual.' +
            (sinMapear.length ? '\n\nColumnas que no encontre en el JSON: ' + sinMapear.join(', ') +
                                '\nCorre killersVerEstructura() y mandame la salida.' : '');
  kAviso_('Killers', msg);
  return msg;
}

/* ================================================================== */
/*  Cliente del site                                                   */
/* ================================================================== */

function kTraer_() {
  var props = PropertiesService.getScriptProperties();
  var ruta = props.getProperty(K_PROP.RUTA);
  var metodo = props.getProperty(K_PROP.METODO) || 'get';
  if (!ruta) throw new Error('No hay ruta guardada. Corre killersDescubrir() primero.');

  // Cache buster: la pagina de killers sirve de cache, y las tandas cambian
  // varias veces al mes en temporada alta.
  var conSello = ruta + (ruta.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
  var r = kFetch_(conSello, metodo, metodo === 'post' ? '{}' : null);
  if (r.code !== 200) r = kFetch_(ruta, metodo, metodo === 'post' ? '{}' : null);
  if (r.code !== 200) throw new Error('El site contesto HTTP ' + r.code + ' en ' + ruta);
  var json = kJson_(r.texto);
  if (!json) throw new Error('La respuesta de ' + ruta + ' no es JSON.');
  return { json: json, texto: r.texto };
}

function kFetch_(ruta, metodo, cuerpo) {
  var opciones = {
    method: metodo,
    headers: kHeaders_(),
    followRedirects: false,
    muteHttpExceptions: true
  };
  if (cuerpo) {
    opciones.contentType = 'application/json';
    opciones.payload = cuerpo;
  }

  var resp = UrlFetchApp.fetch(K_SITE + ruta, opciones);
  var code = resp.getResponseCode();

  // Credencial vencida: intentar renovar con lo que ya existe en Api.gs.
  if ((code === 401 || code === 403 || code === 302) && typeof renovarCookie_ === 'function') {
    try {
      renovarCookie_();
      opciones.headers = kHeaders_();
      resp = UrlFetchApp.fetch(K_SITE + ruta, opciones);
      code = resp.getResponseCode();
    } catch (e) {}
  }
  return { code: code, texto: resp.getContentText() };
}

function kHeaders_() {
  var props = PropertiesService.getScriptProperties();
  var h = {
    'Accept': 'application/json, text/html;q=0.8',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (compatible; SiteSheet/1.0)'
  };
  var token = props.getProperty(K_PROP.TOKEN);
  if (token) h['X-API-Key'] = token;
  var cookie = props.getProperty(K_PROP.COOKIE);
  if (cookie) h['Cookie'] = cookie;
  return h;
}

/* ================================================================== */
/*  Utilerias                                                          */
/* ================================================================== */

function kJson_(t) {
  if (!t) return null;
  var s = t.replace(/^﻿/, '').trim();
  if (s.charAt(0) !== '{' && s.charAt(0) !== '[') return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

/** Busca dentro del JSON el arreglo de objetos mas grande. */
function kEncontrarLista_(json) {
  if (Array.isArray(json)) return kEsLista_(json) ? json : null;
  if (!json || typeof json !== 'object') return null;

  var mejor = null;
  Object.keys(json).forEach(function (k) {
    var v = json[k];
    if (Array.isArray(v) && kEsLista_(v)) {
      if (!mejor || v.length > mejor.length) mejor = v;
    } else if (v && typeof v === 'object') {
      var dentro = kEncontrarLista_(v);
      if (dentro && (!mejor || dentro.length > mejor.length)) mejor = dentro;
    }
  });
  return mejor;
}

function kEsLista_(a) {
  return a.length > 0 && a[0] && typeof a[0] === 'object' && !Array.isArray(a[0]);
}

function kPuntaje_(r) {
  if (r.code !== 200) return { puntos: 0, filas: 0, nota: '' };
  var json = kJson_(r.texto);
  if (!json) return { puntos: 0, filas: 0, nota: 'no es JSON' };
  var lista = kEncontrarLista_(json);
  if (!lista || !lista.length) return { puntos: 1, filas: 0, nota: 'JSON sin lista' };
  var llaves = Object.keys(lista[0]).join(' ').toLowerCase();
  var puntos = 10 + Math.min(lista.length, 500);
  if (llaves.indexOf('sku') >= 0) puntos += 500;
  if (/termina|fin|end|hasta/.test(llaves)) puntos += 200;
  return { puntos: puntos, filas: lista.length, nota: 'lista de ' + lista.length };
}

function kBuscarCampo_(llaves, fragmentos) {
  for (var f = 0; f < fragmentos.length; f++) {
    for (var i = 0; i < llaves.length; i++) {
      if (String(llaves[i]).toLowerCase() === fragmentos[f]) return llaves[i];
    }
  }
  for (var f2 = 0; f2 < fragmentos.length; f2++) {
    for (var j = 0; j < llaves.length; j++) {
      if (String(llaves[j]).toLowerCase().indexOf(fragmentos[f2]) >= 0) return llaves[j];
    }
  }
  return null;
}

/** Acepta dd-mm-yyyy HH:mm, yyyy-mm-dd HH:mm:ss, ISO y epoch. */
function kFecha_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return v;

  if (typeof v === 'number') {
    var ms = v > 1e12 ? v : v * 1000;
    var d0 = new Date(ms);
    return isNaN(d0.getTime()) ? '' : d0;
  }

  var s = String(v).trim();
  var m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);

  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);

  var d = new Date(s);
  return isNaN(d.getTime()) ? s : d;
}

function kPad_(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}

function kAviso_(titulo, msg) {
  Logger.log(titulo + '\n' + msg);
  try {
    SpreadsheetApp.getUi().alert(titulo, String(msg).slice(0, 4000), SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}
}
