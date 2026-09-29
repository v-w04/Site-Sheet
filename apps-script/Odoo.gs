/**
 * ============================================================
 *  Odoo — catálogo maestro por XML-RPC
 * ============================================================
 *
 *  POR QUÉ ESTO EXISTE
 *
 *  La hoja Inventarios busca REFERENCIA, CATEGORIA, MARCA, NOMBRE,
 *  MODELO y COLOR en la hoja Productos. Productos tiene 357 filas y
 *  CERO de CVA, así que todo lo de CVA sale "NO ESTA".
 *
 *  El site no ayuda: ni /stock-odoo-data ni /precios-em/api/lista
 *  mandan el código de barras. Odoo sí lo tiene, en `barcode`.
 *
 *  Este archivo baja el catálogo completo de Odoo —propio y CVA— a
 *  una hoja `Catalogo`, y ahí apuntan las fórmulas.
 *
 *  Es una llamada al día: el catálogo cambia despacio, no cada
 *  15 minutos como el stock.
 *
 *  CREDENCIALES: en PropertiesService, nunca aquí.
 *  Menú SITE SHEET > Configuración > Conectar Odoo.
 */

var PROP_ODOO = {
  URL:  'ODOO_URL',
  DB:   'ODOO_DB',
  USER: 'ODOO_USER',
  KEY:  'ODOO_API_KEY'
};

var HOJA_CATALOGO = 'Catalogo';
var HOJA_CAMPOS   = '_CamposOdoo';

/** Odoo entrega máximo cómodo por página. Más grande y truena por timeout. */
var ODOO_PAGINA = 500;


/* ================ CONFIGURACIÓN ================ */

/**
 * Ventanita para capturar un dato. Lo que se escribe aquí va directo a
 * PropertiesService: no pasa por ningún archivo, ni por el Log, ni por
 * el repo. Es el único camino por el que entra una credencial a este
 * proyecto.
 */
function pedir_(ui, titulo, ayuda) {
  var r = ui.prompt(titulo, ayuda, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return null;
  var v = r.getResponseText();
  return v && v.trim() ? v.trim() : null;
}


function uiConectarOdoo() {
  var ui = SpreadsheetApp.getUi();
  var p = props_();

  var url = pedir_(ui, 'URL de Odoo',
    'Actual: ' + (p.getProperty(PROP_ODOO.URL) || '(ninguna)') + '\n\n' +
    'Ejemplo: https://tuempresa.odoo.com');
  if (url === null) return;

  var db = pedir_(ui, 'Base de datos',
    'Actual: ' + (p.getProperty(PROP_ODOO.DB) || '(ninguna)'));
  if (db === null) return;

  var usuario = pedir_(ui, 'Usuario de Odoo', 'El correo con el que entras');
  if (usuario === null) return;

  var key = pedir_(ui, 'API key de Odoo',
    'Odoo > Preferencias > Seguridad de la cuenta > Claves de API.\n\n' +
    'Usa una API key, NO la contraseña de la cuenta: la key se puede\n' +
    'revocar sola sin tocar el acceso de la persona.');
  if (key === null) return;

  p.setProperties({
    ODOO_URL:     url.replace(/\/+$/, ''),
    ODOO_DB:      db,
    ODOO_USER:    usuario,
    ODOO_API_KEY: key
  }, false);

  ui.alert('Guardado', 'Ahora lo pruebo.', ui.ButtonSet.OK);

  try {
    var uid = odooAuth_();
    ui.alert('✅ Odoo conectado', 'Autenticado. UID: ' + uid, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ No se pudo conectar', String(e), ui.ButtonSet.OK);
  } finally {
    flushLog_();
  }
}


/* ================ XML-RPC ================ */

/**
 * En los structs de XML-RPC la etiqueta es <name>, no <n>.
 * Odoo contesta un error opaco si va mal, y se pierde media tarde
 * buscándolo en el lugar equivocado.
 */
function _xValor_(v) {
  if (v === null || v === undefined) return '<value><nil/></value>';
  if (typeof v === 'boolean') return '<value><boolean>' + (v ? 1 : 0) + '</boolean></value>';
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? '<value><int>' + v + '</int></value>'
      : '<value><double>' + v + '</double></value>';
  }
  if (Array.isArray(v)) {
    return '<value><array><data>' + v.map(_xValor_).join('') + '</data></array></value>';
  }
  if (typeof v === 'object') {
    var m = '';
    for (var k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
      m += '<member><name>' + _xEsc_(k) + '</name>' + _xValor_(v[k]) + '</member>';
    }
    return '<value><struct>' + m + '</struct></value>';
  }
  return '<value><string>' + _xEsc_(String(v)) + '</string></value>';
}

function _xEsc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _xLeer_(el) {
  var hijos = el.getChildren();
  if (!hijos.length) return el.getText();

  var h = hijos[0], t = h.getName();
  if (t === 'int' || t === 'i4') return parseInt(h.getText(), 10);
  if (t === 'double')  return parseFloat(h.getText());
  if (t === 'boolean') return h.getText() === '1';
  if (t === 'string')  return h.getText();
  if (t === 'nil')     return null;

  if (t === 'array') {
    var data = h.getChild('data');
    return data ? data.getChildren('value').map(_xLeer_) : [];
  }
  if (t === 'struct') {
    var o = {};
    h.getChildren('member').forEach(function (m) {
      o[m.getChild('name').getText()] = _xLeer_(m.getChild('value'));
    });
    return o;
  }
  return h.getText();
}

function _odooPost_(ruta, metodo, params) {
  contarFetch_();

  var cuerpo = '<?xml version="1.0"?><methodCall>' +
    '<methodName>' + metodo + '</methodName><params>' +
    params.map(function (p) { return '<param>' + _xValor_(p) + '</param>'; }).join('') +
    '</params></methodCall>';

  var resp = UrlFetchApp.fetch(prop_(PROP_ODOO.URL) + ruta, {
    method: 'post',
    contentType: 'text/xml',
    payload: cuerpo,
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error('Odoo respondió HTTP ' + resp.getResponseCode() + ' en ' + ruta);
  }

  var doc = XmlService.parse(resp.getContentText());
  var raiz = doc.getRootElement();

  var falla = raiz.getChild('fault');
  if (falla) {
    var info = _xLeer_(falla.getChild('value'));
    throw new Error('Odoo: ' + (info.faultString || JSON.stringify(info)).substring(0, 300));
  }

  return _xLeer_(raiz.getChild('params').getChild('param').getChild('value'));
}

/** Autentica y cachea el uid 30 min: revalidar en cada llamada gasta el doble. */
function odooAuth_() {
  var c = CacheService.getScriptCache();
  var cacheado = c.get('odoo_uid_cat');
  if (cacheado) return Number(cacheado);

  var uid = _odooPost_('/xmlrpc/2/common', 'authenticate', [
    prop_(PROP_ODOO.DB), prop_(PROP_ODOO.USER), prop_(PROP_ODOO.KEY), {}
  ]);

  if (!uid || uid === true) {
    throw new Error('Odoo rechazó las credenciales. Revisa base, usuario y API key.');
  }

  c.put('odoo_uid_cat', String(uid), 1800);
  return uid;
}

function odooExecute_(modelo, metodo, args, kwargs) {
  return _odooPost_('/xmlrpc/2/object', 'execute_kw', [
    prop_(PROP_ODOO.DB), odooAuth_(), prop_(PROP_ODOO.KEY),
    modelo, metodo, args || [], kwargs || {}
  ]);
}


/* ================ QUÉ CAMPOS TIENE TU ODOO ================ */

/**
 * Escribe en `_CamposOdoo` todos los campos de product.template con su
 * tipo y su etiqueta.
 *
 * Sin esto habría que adivinar cómo se llaman MARCA, MODELO y COLOR en
 * TU Odoo: no son campos estándar, cada instalación los pone donde
 * quiere (a veces x_studio_marca, a veces un atributo). Adivinar deja
 * columnas vacías y nadie sabe si es que el dato no existe o que se
 * pidió mal.
 */
function explorarCamposOdoo() {
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}

  try {
    var campos = odooExecute_('product.template', 'fields_get', [], {
      attributes: ['string', 'type', 'relation']
    });

    var filas = [['Campo', 'Tipo', 'Etiqueta', 'Relación']];
    Object.keys(campos).sort().forEach(function (k) {
      var f = campos[k] || {};
      filas.push([k, f.type || '', f.string || '', f.relation || '']);
    });

    escribirTabla_(HOJA_CAMPOS, filas);
    logOk_('ODOO', 'Campos de product.template: ' + (filas.length - 1));

    // Sugerencias: lo que suene a marca, modelo o color
    var pistas = Object.keys(campos).filter(function (k) {
      return /marca|brand|modelo|model|color|barcode|codigo|ean|upc/i.test(k) ||
             /marca|modelo|color|barra/i.test(campos[k].string || '');
    });

    if (ui) {
      ui.alert('Campos de Odoo',
        'Se escribió la hoja "' + HOJA_CAMPOS + '" con ' + (filas.length - 1) + ' campos.\n\n' +
        'Candidatos para marca / modelo / color / código de barras:\n' +
        (pistas.length ? '  ' + pistas.join('\n  ') : '  (ninguno obvio)'),
        ui.ButtonSet.OK);
    }
    return { ok: true, campos: filas.length - 1, pistas: pistas };

  } catch (e) {
    if (ui) ui.alert('Falló', String(e), ui.ButtonSet.OK);
    return { ok: false, error: String(e) };
  } finally {
    flushLog_();
  }
}


/* ================ CATÁLOGO ================ */

/**
 * Columnas del catálogo: [campo de Odoo, encabezado].
 *
 * Se empieza con lo que existe en cualquier Odoo. Cuando
 * explorarCamposOdoo() diga cómo se llaman marca, modelo y color en
 * el tuyo, se agregan aquí y nada más.
 */
var COLUMNAS_CATALOGO = [
  ['default_code', 'SKU'],
  ['barcode',      'REFERENCIA'],
  ['name',         'NOMBRE'],
  ['categ_id',     'CATEGORIA']
];

/**
 * POR QUÉ EL CATÁLOGO SE BAJA EN VUELTAS
 *
 * Apps Script mata cualquier ejecución a los 6 minutos. Un día bueno Odoo
 * entrega los ~4,500 productos en 4:40; un día lento se tarda más de dos
 * minutos por página y la corrida muere sin dejar ni una línea en el Log
 * (así se perdieron el 26 y el 28-sep, y el 29 se cortó en 1,000).
 *
 * Ahora cada ejecución trabaja máximo 4 minutos. Lo que va bajando se
 * guarda en la hoja oculta `_CatalogoTmp` y el avance en Script
 * Properties. Si no terminó, agenda otra vuelta en 1 minuto y sigue
 * donde se quedó. La hoja `Catalogo` solo se reescribe cuando ya están
 * TODOS los productos: nunca queda a medias.
 *
 * Usa su propio candado (UserLock), no el ScriptLock de inventario y
 * precios: mientras baja el catálogo, el inventario sigue corriendo.
 */
var HOJA_CATALOGO_TMP  = '_CatalogoTmp';
var PROP_CAT_ESTADO    = 'CATALOGO_ESTADO';
var PROP_CAT_RESULTADO = 'CATALOGO_RESULTADO';

/** Productos por página. Con 500 una sola página llegó a tardar 2+ min. */
var CAT_PAGINA = 250;

/** Tiempo de trabajo por vuelta. Deja 90 s de aire contra el tope de 6 min
 *  para escribir la hoja y agendar la siguiente vuelta. */
var CAT_PRESUPUESTO_MS = 4.5 * 60 * 1000;

/** Vueltas máximas antes de rendirse. 30 vueltas aguantan un Odoo que tarde
 *  2+ minutos por página (~2.5 h); un día normal son 1 o 2. */
var CAT_MAX_VUELTAS = 30;

/** Si la última vuelta fue hace más de esto, la bajada se da por muerta. */
var CAT_LATIDO_MUERTO_MS = 15 * 60 * 1000;

/**
 * Baja el catálogo completo de Odoo a la hoja `Catalogo`.
 *
 * Trae TODOS los productos, propios y CVA. Los de CVA se reconocen
 * porque el SKU termina en -CVA, pero no se filtran: la gracia es
 * tener una sola lista donde buscar.
 *
 * Devuelve { ok, total, cva } si terminó en esta misma vuelta, o
 * { ok: true, pendiente: true, total } si sigue en otra vuelta.
 */
function sincronizarCatalogo() {
  return catalogoPaso_({ nuevo: true, origen: 'manual' });
}

/** Handler de la vuelta siguiente (trigger de una sola vez). */
function catalogoContinuar() {
  tgBorrarUnaVez_('catalogoContinuar');
  return catalogoPaso_({ nuevo: false });
}

function catalogoPaso_(opc) {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(15000)) {
    logWarn_('CATALOGO', 'Otra vuelta del catálogo sigue corriendo');
    flushLog_();
    return { ok: false, error: 'ocupado' };
  }

  var tIni = Date.now();
  var est = catEstado_();

  try {
    var vivo = est && (Date.now() - est.latido) < CAT_LATIDO_MUERTO_MS;

    if (opc.nuevo) {
      if (vivo) {
        // Ya hay una bajada andando: no se reinicia, solo se anota quién más la espera.
        if (opc.origen === 'diario') est.diario = true;
        catGuardarEstado_(est);
        logInfo_('CATALOGO', 'Ya hay una bajada en curso (' + est.offset + ' productos); sigue sola');
        return { ok: true, pendiente: true, total: est.offset };
      }
      est = { offset: 0, inicio: Date.now(), latido: Date.now(), vueltas: 0,
              diario: opc.origen === 'diario' };
      catTmpLimpiar_();
      tgBorrarUnaVez_('catalogoContinuar');
      logStart_('CATALOGO', 'Bajando catálogo de Odoo');
      flushLog_();
    } else if (!est) {
      return { ok: false, error: 'sin bajada en curso' };
    } else if (!vivo) {
      logWarn_('CATALOGO', 'La bajada anterior quedó abandonada; se cierra sin tocar el catálogo');
      return catTerminar_(est, { ok: false, error: 'abandonada' });
    }

    est.vueltas++;

    if (cuotaAgotadaHoy_()) {
      logWarn_('CUOTA', 'Cuota agotada — catálogo omitido');
      return catTerminar_(est, { ok: false, error: 'cuota' });
    }

    var campos = ['id'].concat(COLUMNAS_CATALOGO.map(function (c) { return c[0]; }));
    var masLenta = 0;
    var termino = false;

    while (true) {
      // Antes de pedir otra página: ¿cabe una más, calculando con la más lenta?
      var margen = Math.max(masLenta * 1.3, 30000);
      if (Date.now() - tIni + margen > CAT_PRESUPUESTO_MS) break;

      var t0 = Date.now();
      var lote = odooExecute_('product.product', 'search_read',
        [[['default_code', '!=', false]]],
        { fields: campos, limit: CAT_PAGINA, offset: est.offset, order: 'id asc' });
      masLenta = Math.max(masLenta, Date.now() - t0);

      if (!lote || !lote.length) { termino = true; break; }

      catTmpAgregar_(lote, campos);
      est.offset += lote.length;
      est.latido = Date.now();
      catGuardarEstado_(est);

      toast_('Catálogo: ' + est.offset + ' productos...', 'ODOO', 20);
      if (lote.length < CAT_PAGINA) { termino = true; break; }
      Utilities.sleep(PAUSA_ENTRE_MS);
    }

    if (!termino) return catOtraVuelta_(est, tIni, masLenta, null);

    // ---- Ya están todos: se arma y se escribe la hoja de un jalón ----
    var todos = catTmpLeer_(campos);

    if (!todos.length) {
      logErr_('CATALOGO', 'Odoo no devolvió productos — no se tocó la hoja');
      return catTerminar_(est, { ok: false, error: 'sin datos' });
    }

    // Guarda: si Odoo devuelve muchísimo menos que lo que ya hay, algo
    // salió mal. Un catálogo no se encoge a la mitad solo.
    var actuales = filasDatos_(HOJA_CATALOGO);
    if (actuales > 100 && todos.length < actuales * 0.5) {
      logErr_('GUARD', 'Odoo devolvió ' + todos.length + ' contra ' + actuales +
                       ' que ya había. Se aborta para no perder el catálogo.');
      return catTerminar_(est, { ok: false, error: 'guarda' });
    }

    escribirTabla_(HOJA_CATALOGO, filasCatalogo_(todos));

    var cva = todos.filter(function (p) {
      return /-CVA$/i.test(String(p.default_code || ''));
    }).length;

    logFinish_('CATALOGO', 'Catálogo actualizado', {
      total: todos.length, cva: cva, propios: todos.length - cva,
      vueltas: est.vueltas, seg: Math.round((Date.now() - est.inicio) / 1000)
    });

    return catTerminar_(est, { ok: true, total: todos.length, cva: cva });

  } catch (e) {
    // Un tropiezo de Odoo (timeout, 502) no tira la bajada: se reintenta
    // en la siguiente vuelta desde donde se quedó.
    if (est && est.vueltas < CAT_MAX_VUELTAS) {
      return catOtraVuelta_(est, tIni, 0, e.message);
    }
    logErr_('CATALOGO', 'Falló: ' + e.message);
    return catTerminar_(est, { ok: false, error: e.message });
  } finally {
    flushLog_();
    lock.releaseLock();
  }
}

/** Guarda el avance y agenda la siguiente vuelta en 1 minuto. */
function catOtraVuelta_(est, tIni, masLenta, error) {
  if (est.vueltas >= CAT_MAX_VUELTAS) {
    logErr_('CATALOGO', 'No terminó en ' + CAT_MAX_VUELTAS + ' vueltas (' + est.offset +
                        ' productos). Odoo está muy lento; se queda el catálogo anterior.');
    return catTerminar_(est, { ok: false, error: 'odoo lento' });
  }

  est.latido = Date.now();
  catGuardarEstado_(est);
  tgUnaVez_('catalogoContinuar', 60 * 1000);

  if (error) {
    // INFO y no WARN: se recupera solo. Si de plano no termina, ahí sí sale ERROR.
    logInfo_('CATALOGO', 'Vuelta ' + est.vueltas + ' tropezó (' + String(error).substring(0, 150) +
                         '); reintenta en 1 min desde ' + est.offset);
  } else {
    logInfo_('CATALOGO', 'Vuelta ' + est.vueltas + ': ' + est.offset + ' productos. Sigue en 1 min', {
      seg: Math.round((Date.now() - tIni) / 1000),
      paginaMasLentaSeg: Math.round(masLenta / 1000)
    });
  }
  return { ok: true, pendiente: true, total: est.offset };
}

/**
 * Cierra la bajada (bien o mal): limpia el estado y la hoja temporal.
 * Si la pidió el refresco diario, le pasa la estafeta a Variantes y
 * Oportunidades, que corren con el catálogo que haya.
 */
function catTerminar_(est, r) {
  PropertiesService.getScriptProperties().deleteProperty(PROP_CAT_ESTADO);
  tgBorrarUnaVez_('catalogoContinuar');
  catTmpLimpiar_();

  if (est && est.diario) {
    PropertiesService.getScriptProperties().setProperty(PROP_CAT_RESULTADO, JSON.stringify(r));
    tgUnaVez_('refrescoDiarioResto', 60 * 1000);
  }
  return r;
}

function catEstado_() {
  var s = PropertiesService.getScriptProperties().getProperty(PROP_CAT_ESTADO);
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

function catGuardarEstado_(est) {
  PropertiesService.getScriptProperties().setProperty(PROP_CAT_ESTADO, JSON.stringify(est));
}

/* ---- hoja temporal ---- */

function catTmpHoja_() {
  var ss = getSpreadsheet_();
  var h = ss.getSheetByName(HOJA_CATALOGO_TMP);
  if (!h) {
    h = ss.insertSheet(HOJA_CATALOGO_TMP);
    h.hideSheet();
  }
  return h;
}

function catTmpLimpiar_() {
  var h = getSpreadsheet_().getSheetByName(HOJA_CATALOGO_TMP);
  if (h && h.getLastRow() > 0) h.clearContents();
}

/** Todo se guarda como texto: un código de barras no pierde sus ceros. */
function catTmpAgregar_(lote, campos) {
  var h = catTmpHoja_();
  var filas = lote.map(function (p) {
    return campos.map(function (c) {
      var v = p[c];
      // Odoo devuelve las relaciones como [id, "nombre"]. Nos interesa el nombre.
      if (Array.isArray(v)) return v.length > 1 ? String(v[1]) : '';
      if (v === false || v === null || v === undefined) return '';
      return String(v);
    });
  });

  var ini = h.getLastRow() + 1;
  var necesita = ini + filas.length - 1;
  if (h.getMaxRows() < necesita) h.insertRowsAfter(h.getMaxRows(), necesita - h.getMaxRows());
  if (h.getMaxColumns() < campos.length) {
    h.insertColumnsAfter(h.getMaxColumns(), campos.length - h.getMaxColumns());
  }

  var rango = h.getRange(ini, 1, filas.length, campos.length);
  rango.setNumberFormat('@');
  rango.setValues(filas);
  SpreadsheetApp.flush();
}

/** Lee lo acumulado y quita repetidos por id (por si Odoo movió algo entre vueltas). */
function catTmpLeer_(campos) {
  var h = getSpreadsheet_().getSheetByName(HOJA_CATALOGO_TMP);
  if (!h || h.getLastRow() < 1) return [];

  var valores = h.getRange(1, 1, h.getLastRow(), campos.length).getValues();
  var vistos = {};
  var out = [];
  valores.forEach(function (fila) {
    var id = String(fila[0]);
    if (!id || vistos[id]) return;
    vistos[id] = true;
    var p = {};
    campos.forEach(function (c, i) { p[c] = fila[i] === '' ? false : String(fila[i]); });
    out.push(p);
  });
  return out;
}

function filasCatalogo_(productos) {
  var encabezados = COLUMNAS_CATALOGO.map(function (c) { return c[1]; }).concat(['Actualizado']);
  var sello = ahora_();
  var filas = [encabezados];

  productos.forEach(function (p) {
    var fila = COLUMNAS_CATALOGO.map(function (c) {
      var v = p[c[0]];
      if (Array.isArray(v)) return v.length > 1 ? v[1] : '';
      if (v === false || v === null || v === undefined) return '';
      return v;
    });
    fila.push(sello);
    filas.push(fila);
  });

  return filas;
}


/* ================ MENÚ ================ */

function uiSincronizarCatalogo() {
  var ui = SpreadsheetApp.getUi();
  toast_('Bajando el catálogo de Odoo. Tarda; ve el avance en el Log.', 'ODOO', 20);

  var r = sincronizarCatalogo();

  if (r.ok && r.pendiente) {
    ui.alert('⏳ El catálogo sigue bajando',
      'Va en ' + r.total + ' productos. Odoo está lento, así que termina solo\n' +
      'en vueltas de 1 minuto. La hoja "' + HOJA_CATALOGO + '" se reescribe\n' +
      'hasta que estén todos. Ve el avance en el Log.',
      ui.ButtonSet.OK);
  } else if (r.ok) {
    ui.alert('✅ Catálogo actualizado',
      r.total + ' productos en la hoja "' + HOJA_CATALOGO + '".\n' +
      '  ' + r.cva + ' de CVA\n' +
      '  ' + (r.total - r.cva) + ' propios\n\n' +
      'Ahora las fórmulas de Inventarios pueden buscar aquí.',
      ui.ButtonSet.OK);
  } else {
    ui.alert('No se pudo', String(r.error), ui.ButtonSet.OK);
  }
}
