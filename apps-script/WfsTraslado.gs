/**
 * ============================================================
 *  WfsTraslado — crear en Odoo el traslado de un envio WFS (hoja "ENVIO N")
 * ============================================================
 *  Es la logica del proyecto "Traslados Odoo" (cuenta WFS) tal cual: stock.picking + stock.move por XML-RPC,
 *  tipo de operacion 19 (Walmart WFS Electronics Mexico: Traslados internos), de Almacén/Existencias a
 *  W-ELE/Existencias, contacto WALMART WFS, responsable id 9, action_confirm (queda "Por realizar"),
 *  mensaje en el chatter y registro en historico.
 *  Cambia solo: (1) las lineas salen de la hoja ENVIO (columna AUTORIZADO, por SKU base), (2) la conexion usa
 *  la de este libro (Menu Configuracion > Conectar Odoo; nada de llaves en el codigo), (3) ya no hay Mercado Libre
 *  ni WhatsApp: solo WFS.
 *  Antes de crear, el boton "Revisar" comprueba todo SIN crear nada.
 * ============================================================
 */

var WFS_TR = {
  pickingTypeId: 19,
  pickingTypeName: 'Walmart WFS Electronics Mexico: Traslados internos',
  locOrigen: 'Almacén/Existencias',
  locDestino: 'W-ELE/Existencias',
  contacto: 'WALMART WFS',
  userId: 9,
  userName: 'Victor Medina',
  urlBase: 'https://electronicsmexico.odoo.com/odoo/inventory/19/action-535',
  hojaHist: 'Traslados Odoo',
  reintentos429: 4,
  esperaBase429: 4000
};
var WFS_TR_ENC = ['Fecha creación', 'Referencia', 'ID Odoo', 'Origen', 'Destino', 'Contacto', 'Documento origen',
  'Fecha programada', 'SKU', 'Nombre producto', 'Cantidad', 'Estado', 'URL Odoo', 'ENVIO'];

/** Llamada a Odoo con reintentos si Odoo contesta 429 (demasiadas peticiones a la vez). */
function wfsTrOdoo_(modelo, metodo, args, kwargs) {
  for (var i = 0; ; i++) {
    try {
      return odooExecute_(modelo, metodo, args, kwargs);
    } catch (e) {
      if (/HTTP 429/.test(String(e.message)) && i < WFS_TR.reintentos429) {
        Utilities.sleep(WFS_TR.esperaBase429 * Math.pow(2, i));
        continue;
      }
      throw e;
    }
  }
}

function wfsTrBuscar_(modelo, dominio, campos) {
  var todo = [], offset = 0, limite = 1000;
  for (;;) {
    var lote = wfsTrOdoo_(modelo, 'search_read', [dominio], { fields: campos, limit: limite, offset: offset }) || [];
    todo = todo.concat(lote);
    if (lote.length < limite) break;
    offset += lote.length;
  }
  return todo;
}

function wfsTrFmtFecha_(d) {
  var p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

/** "2026-10-28", "28/10/2026", "2026-10-28 08:00" -> Date (o null). */
function wfsTrFecha_(txt) {
  var s = String(txt || '').trim();
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
  if (m) return new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), 0);
  return null;
}

/** Lineas del envio: SKU base y cantidad AUTORIZADO (suma si un SKU base sale repetido). */
var WFS_TR_PROPUESTA = '__PROPUESTA';
var WFS_TR_PROPUESTA_TXT = 'Propuesta actual (hoja WFS) — solo para REVISAR';

function wfsTrLineas_(sh) {
  if (!sh) {   // sin hoja ENVIO: la propuesta que hoy calcula la hoja WFS (solo sirve para revisar)
    var pr = wfsLeerEnvioFinal_(SpreadsheetApp.getActive()), acc = {}, ord = [];
    pr.filas.forEach(function (f) {
      var b = String(f.sku || '').replace(WFS_RE_MSI, '').trim(), q = Number(f.cant) || 0;
      if (!b || q <= 0) return;
      if (!acc[b]) { acc[b] = 0; ord.push(b); }
      acc[b] += q;
    });
    return { lineas: ord.map(function (b) { return { sku: b, qty: acc[b] }; }), delivery: '', fecha: '', hora: '' };
  }
  var lec = wfsLeerHojaEnvio_(sh);
  var por = {}, orden = [];
  lec.detalle.forEach(function (f) {   // col-fija: fila de detalle que arma wfsLeerHojaEnvio_: [hoja, id, fecha, hora, delivery, folio, sku, skuBase, gtin, categoria, nombre, unidades]
    var base = String(f[7] || '').trim(), qty = Number(f[11]) || 0;   // col-fija: fila de detalle de wfsLeerHojaEnvio_
    if (!base || qty <= 0) return;
    if (!por[base]) { por[base] = 0; orden.push(base); }
    por[base] += qty;
  });
  var cab = lec.detalle.length ? lec.detalle[0] : null;   // col-fija: ver arriba
  return {
    lineas: orden.map(function (b) { return { sku: b, qty: por[b] }; }),
    delivery: cab ? String(cab[4] || '').trim() : '',
    fecha: cab ? String(cab[2] || '').trim() : '',
    hora: cab ? String(cab[3] || '').trim() : ''
  };
}

function wfsTrHojas_() { return wfsChHojas_(SpreadsheetApp.getActive()); }

function wfsTrHistorial_(crear) {
  var ss = SpreadsheetApp.getActive(), h = ss.getSheetByName(WFS_TR.hojaHist);
  if (!h && crear) {
    h = ss.insertSheet(WFS_TR.hojaHist);
    h.getRange(1, 1, 1, WFS_TR_ENC.length).setValues([WFS_TR_ENC]).setBackground('#1F4E79').setFontColor('#FFFFFF')
      .setFontWeight('bold').setHorizontalAlignment('center');
    h.setFrozenRows(1);
    [150, 130, 80, 170, 170, 130, 150, 150, 200, 280, 80, 100, 340, 150].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  }
  return h;
}

/** Menu: abre el formulario. */
function wfsTrasladoOdoo() {
  var hojas = wfsTrHojas_();
  var activa = SpreadsheetApp.getActiveSheet().getName();
  var nom = hojas.indexOf(activa) >= 0 ? activa : (hojas[0] || WFS_TR_PROPUESTA);
  var info;
  try { info = wfsTrLineas_(nom === WFS_TR_PROPUESTA ? null : SpreadsheetApp.getActive().getSheetByName(nom)); } catch (e) { dlgInfo_('📦 Traslado a Odoo', e.message, 'error'); return; }
  var f = wfsTrFecha_(info.fecha + (info.hora ? ' ' + info.hora : '')) || wfsTrFecha_(info.fecha) || new Date();
  var yo = ''; try { yo = skCorreoYo_(); } catch (e) {}
  var piezas = info.lineas.reduce(function (a, l) { return a + l.qty; }, 0);
  dlgEnvio_({
    titulo: '📦 Traslado a Odoo (WFS)',
    ayuda: 'Crea en Odoo el traslado interno de WFS con las cantidades de la columna AUTORIZADO de la hoja ENVIO (por SKU base). Primero pulsa Revisar: comprueba todo y no crea nada.',
    manejador: 'wfsTrasladoForm', yo: yo, segundos: 20,
    etiquetas: { prueba: 'Revisar', real: 'Crear en Odoo', pruebaTitulo: 'Comprueba SKU, ubicaciones y permisos. No crea nada.' },
    campos: [
      { id: 'hoja', etiqueta: 'Hoja del envío', valor: nom, nota: 'Para CREAR hace falta una hoja ENVIO (🚚 Nuevo envío). Sin ella solo puedes REVISAR con la propuesta actual.', opciones: hojas.map(function (h) { return [h, h]; }).concat([[WFS_TR_PROPUESTA, WFS_TR_PROPUESTA_TXT]]) },
      { id: 'doc', etiqueta: 'Documento origen (obligatorio)', valor: info.delivery, nota: 'Normalmente el delivery / orden de Walmart. Si la hoja ya trae DELIVERY, aparece aquí.' },
      { id: 'fecha', etiqueta: 'Fecha programada', valor: wfsTrFmtFecha_(f).slice(0, 16), nota: 'Formato 2026-10-28 08:00 (o 28/10/2026 08:00).' },
      { id: 'contacto', etiqueta: 'Contacto', valor: WFS_TR.contacto, nota: 'Si no existe en Odoo, el traslado se crea sin contacto.' },
      { id: 'faltantes', etiqueta: 'Si algún SKU no existe en Odoo', valor: 'PARAR', opciones: [['PARAR', 'Parar: no crear nada'], ['OMITIR', 'Crear sin esos SKU']] }
    ],
    resumen: [['Tipo de operación', WFS_TR.pickingTypeName], ['Origen → Destino', WFS_TR.locOrigen + ' → ' + WFS_TR.locDestino],
      ['Líneas', info.lineas.length + ' SKU base · ' + piezas + ' piezas (hoja ' + nom + ')']],
    avisos: ['Las cantidades son las de la columna AUTORIZADO. Confirma que ya pusiste lo que autorizó la otra persona.'],
    reenvio: false
  });
}

/** Lo que hace el formulario. modo PRUEBA = revisar sin crear; REAL = crear el traslado. */
function wfsTrasladoForm(p) {
  var c = p.campos || {}, real = p.modo === 'REAL';
  var ss = SpreadsheetApp.getActive();
  var propuesta = String(c.hoja || '') === WFS_TR_PROPUESTA;
  var sh = propuesta ? null : ss.getSheetByName(String(c.hoja || ''));
  if (propuesta && real) return { ok: false, lineas: ['Para CREAR el traslado primero crea la hoja ENVIO con 🚚 Nuevo envío y pon en AUTORIZADO lo que autorizaron. Con la propuesta solo se puede REVISAR. No se hizo nada.'] };
  if (!propuesta && (!sh || wfsTrHojas_().indexOf(sh.getName()) < 0)) return { ok: false, lineas: ['Elige una hoja ENVIO. No se hizo nada.'] };
  var nomHoja = propuesta ? 'Propuesta WFS' : sh.getName();
  var doc = String(c.doc || '').trim();
  if (!doc) return { ok: false, lineas: ['Escribe el Documento origen (obligatorio en Odoo). No se hizo nada.'] };
  var f = wfsTrFecha_(c.fecha);
  if (!f) return { ok: false, lineas: ['La fecha no se entiende. Usa 2026-10-28 08:00. No se hizo nada.'] };
  var contacto = String(c.contacto || '').trim();
  var omitir = c.faltantes === 'OMITIR';

  var info = wfsTrLineas_(sh);
  if (!info.lineas.length) return { ok: false, lineas: ['La hoja ' + nomHoja + ' no tiene cantidades' + (propuesta ? '' : ' en AUTORIZADO') + '. No se hizo nada.'] };
  var piezas = info.lineas.reduce(function (a, l) { return a + l.qty; }, 0);

  if (real) {
    var h0 = wfsTrHistorial_(false);
    if (h0 && h0.getLastRow() > 1) {
      var m0 = colsHoja_(h0, ['ENVIO', 'Referencia']);
      var dup = h0.getRange(2, 1, h0.getLastRow() - 1, h0.getLastColumn()).getValues().filter(function (r) { return String(r[m0.ENVIO]) === sh.getName(); })[0];
      if (dup) return { ok: false, lineas: ['❌ Ya se creó un traslado para ' + sh.getName() + ': ' + dup[m0.Referencia] + '. No se creó otro. Si hay que repetirlo, cancela ese en Odoo y borra sus filas de la hoja "' + WFS_TR.hojaHist + '".'] };
    }
  }

  var L = [];
  try {
    odooAuth_();
    try {
      var tiene = wfsTrOdoo_('stock.picking', 'check_access_rights', ['create'], { raise_exception: false });
      if (tiene === false) return { ok: false, lineas: ['❌ El usuario de Odoo con el que está conectado este libro no tiene permiso para crear traslados. Cambia la conexión en Configuración > Conectar Odoo (usuario con permiso de Inventario). No se hizo nada.'] };
    } catch (e) { /* version de Odoo sin ese metodo: se intenta crear y Odoo dirá si no deja */ }

    var locO = wfsTrUbicacion_(WFS_TR.locOrigen), locD = wfsTrUbicacion_(WFS_TR.locDestino);
    var partnerId = false;
    if (contacto) {
      var pr = wfsTrBuscar_('res.partner', [['name', '=', contacto]], ['id']);
      if (pr.length) partnerId = pr[0].id; else L.push('⚠ Contacto "' + contacto + '" no existe en Odoo: se crea sin contacto.');
    }
    var skus = info.lineas.map(function (l) { return l.sku; });
    var prods = wfsTrBuscar_('product.product', [['default_code', 'in', skus]], ['id', 'default_code', 'uom_id']);
    var mapa = {};
    prods.forEach(function (x) { mapa[x.default_code] = { id: x.id, uom: x.uom_id[0] }; });
    var ok = info.lineas.filter(function (l) { return mapa[l.sku]; }), mal = info.lineas.filter(function (l) { return !mapa[l.sku]; });

    L.unshift('• ' + nomHoja + ': ' + info.lineas.length + ' SKU base · ' + piezas + ' piezas · documento origen ' + doc + ' · fecha ' + wfsTrFmtFecha_(f).slice(0, 16));
    L.push('• Ubicaciones en Odoo: OK (' + WFS_TR.locOrigen + ' → ' + WFS_TR.locDestino + ')');
    L.push('• SKU encontrados en Odoo: ' + ok.length + ' de ' + info.lineas.length);
    if (mal.length) L.push('⚠ No existen en Odoo: ' + mal.map(function (l) { return l.sku; }).join(', '));

    if (!real) {
      L.push(mal.length ? '⚠ Revisión terminada: hay SKU sin match. Corrígelos o elige "Crear sin esos SKU". No se creó nada.' : '✅ Todo listo para crear. No se creó nada.');
      return { ok: !mal.length, lineas: L };
    }
    if (mal.length && !omitir) { L.push('❌ No se creó nada: hay SKU sin match en Odoo (elige "Crear sin esos SKU" si quieres seguir).'); return { ok: false, lineas: L }; }
    if (!ok.length) { L.push('❌ No hay productos válidos para el traslado.'); return { ok: false, lineas: L }; }

    var vals = { picking_type_id: WFS_TR.pickingTypeId, location_id: locO, location_dest_id: locD, scheduled_date: wfsTrFmtFecha_(f), user_id: WFS_TR.userId, origin: doc };
    if (partnerId) vals.partner_id = partnerId;
    var pickingId = wfsTrOdoo_('stock.picking', 'create', [vals]);
    logOk_('TRASLADO', 'Traslado creado en Odoo (id ' + pickingId + ') para ' + sh.getName());
    Utilities.sleep(500);
    wfsTrOdoo_('stock.move', 'create', [ok.map(function (l) {
      return { picking_id: pickingId, product_id: mapa[l.sku].id, product_uom: mapa[l.sku].uom, product_uom_qty: l.qty, name: l.sku, location_id: locO, location_dest_id: locD };
    })]);
    var ref = 'ID:' + pickingId;
    try { var d0 = wfsTrBuscar_('stock.picking', [['id', '=', pickingId]], ['name', 'state']); if (d0.length) ref = d0[0].name; } catch (e) {}
    Utilities.sleep(800);
    try { wfsTrOdoo_('stock.picking', 'action_confirm', [[pickingId]]); } catch (e) { L.push('⚠ No se pudo marcar "Por realizar": ' + e.message); }
    try {
      wfsTrOdoo_('mail.message', 'create', [{
        model: 'stock.picking', res_id: pickingId, message_type: 'comment', subtype_id: 1,
        body: '<p>📋 <b>Transferir creado desde Google Sheets</b> por <b>' + WFS_TR.userName + '</b></p><p>Productos:<br/>' +
          ok.map(function (l) { return '• ' + l.sku + ' × ' + l.qty; }).join('<br/>') + '</p>'
      }]);
    } catch (e) { logWarn_('TRASLADO', 'No se pudo publicar en el chatter: ' + e.message); }
    var estado = 'confirmed';
    try { var d1 = wfsTrBuscar_('stock.picking', [['id', '=', pickingId]], ['name', 'state']); if (d1.length) { ref = d1[0].name; estado = d1[0].state; } } catch (e) {}
    var url = WFS_TR.urlBase + '/' + pickingId;

    var h = wfsTrHistorial_(true), ts = Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd HH:mm:ss');
    var filas = ok.map(function (l) {
      return [ts, ref, pickingId, WFS_TR.locOrigen, WFS_TR.locDestino, contacto, doc, wfsTrFmtFecha_(f), l.sku, l.sku, l.qty, estado, url, sh.getName()];
    });
    h.getRange(h.getLastRow() + 1, 1, filas.length, WFS_TR_ENC.length).setValues(filas);

    var etiqueta = { confirmed: 'Por realizar', waiting: 'En espera', assigned: 'Listo para validar', done: 'Hecho', draft: 'Borrador' }[estado] || estado;
    L.push('✅ Traslado creado: ' + ref + ' (ID Odoo ' + pickingId + ') · estado: ' + etiqueta);
    L.push('• ' + ok.length + ' líneas · ' + ok.reduce(function (a, l) { return a + l.qty; }, 0) + ' piezas' + (mal.length ? ' · SIN ' + mal.length + ' SKU omitidos' : ''));
    L.push('• Quedó registrado en la hoja "' + WFS_TR.hojaHist + '".');
    L.push('• ' + url);
    return { ok: true, lineas: L };
  } catch (e) {
    logErr_('TRASLADO', e.message, { stack: e.stack });
    L.push('❌ ' + e.message);
    return { ok: false, lineas: L };
  }
}

function wfsTrUbicacion_(nombre) {
  var r = wfsTrBuscar_('stock.location', [['complete_name', 'ilike', nombre], ['usage', '=', 'internal']], ['id']);
  if (!r.length) r = wfsTrBuscar_('stock.location', [['name', 'ilike', nombre], ['usage', '=', 'internal']], ['id']);
  if (!r.length) throw new Error('Ubicación no encontrada en Odoo: "' + nombre + '"');
  return r[0].id;
}
