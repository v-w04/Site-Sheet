/**
 * ============================================================
 *  Recoleccion.gs — Solicitud diaria de recoleccion en FeedbackAlly (Walmart MX)
 *  (antes vivia en su propio proyecto "Recoleccion Walmart"; ahora es un modulo de Site Sheet)
 * ============================================================
 *
 *  Lunes a viernes, entre las 7:00 y 7:59 (CDMX), pide a Walmart la recoleccion del
 *  siguiente dia habil con las respuestas fijas de REC_RESP. Antes de enviar baja la
 *  definicion del formulario y, si Walmart cambio algo que nosotros llenamos, NO envia:
 *  deja el aviso en el Log, en la hoja "Recoleccion Formulario" y por correo.
 *
 *  Todo lo que hace queda en el Log del libro (etapa RECOLECCION, asi la hoja Salud lo
 *  vigila sola) y una fila legible por envio en "Recoleccion Historial".
 *
 *  Hojas:   Recoleccion Historial  (una fila por envio/instalacion, la mas nueva arriba)
 *           Recoleccion Formulario (una fila cada vez que cambia el formulario, con el JSON)
 *  Menu:    SITE SHEET > 🚛 Recolección Walmart
 *  Trigger: recEnviarSolicitud (propio; "Activar TODAS las corridas" NO lo toca)
 *
 *  Si Walmart cambia algo del formulario, casi siempre el arreglo es REC_Q / REC_CAMPOS / REC_RESP aqui abajo.
 *  Nada de credenciales aqui: el formulario es publico.
 * ============================================================
 */

var REC_ETAPA = 'RECOLECCION';
var REC_HANDLER = 'recEnviarSolicitud';
var REC_HOJA_HIST = 'Recoleccion Historial';
var REC_HOJA_FORM = 'Recoleccion Formulario';

var REC_CFG = {
  SURVEY_ID: 'hbmi5HWJL2BLmd6',
  URL_ENVIO: 'https://api.feedbackally.walmart.com/api/survey/submit?_format=json&lang=en',
  URL_DEFINICION: 'https://api.feedbackally.walmart.com/api/surveytaker/hbmi5HWJL2BLmd6?lang=',
  ORIGEN: 'https://feedbackally.walmart.com',
  ZONA: 'America/Mexico_City',
  HORA_ENVIO: 7,          // trigger L-V entre 7:00 y 7:59 (asi los da Google)
  // Fechas (dd/MM/yyyy) en que Walmart NO recolecta. Si el siguiente dia habil cae aqui, se brinca al que sigue.
  // Ej.: ['16/11/2026', '25/12/2026']  (solo las que Walmart confirme)
  DIAS_SIN_RECOLECCION: [],
  // Correo que recibe las alertas
  EMAIL_ALERTAS: 'victor.walmart.04@gmail.com'
};

// ---------- Lo que se contesta ----------
var REC_RESP = {
  PARCEL_FLOTA:    30,  // Paquetes Flota Dedicada PARCEL
  BIGITEM_FLOTA:   3,   // Paquetes Flota Dedicada BIG ITEM
  VINOS_FLOTA:     0,   // Paquetes Flota Dedicada "Vinos"
  PARCEL_ESTAFETA: 0,   // Paquetes Estafeta PARCEL
  BIGITEM_ESTAFETA: 0,  // Paquetes Estafeta BIG ITEM
  CHECKS: [
    'Confirmo que cumplo con los requisitos para realizar esta solicitud.',
    'Acepto términos y condiciones.'
  ],
  CUENTA:     'Electronics.Mexico',
  SELLER_ID:  '10001341690',
  CONTACTO:   'Electronics.Mexico',
  TELEFONO:   '5590139578',
  DIRECCION:  'Mayorazgo de Solis 46',
  CP:         '03330',
  REFERENCIA: 'UStorage',
  COMENTARIOS: 'Laboramos de 12pm - 3pm, saludos'
};

// ---------- IDs internos de las preguntas (payload real capturado el 22/09/2026) ----------
// COMENTARIOS: si se deja vacio, el script lo busca solo en la definicion (la pregunta que dice "Comentarios").
var REC_Q = {
  PARCEL_FLOTA:     '17815440035540',
  BIGITEM_FLOTA:    '17815440035541',
  VINOS_FLOTA:      '17815440035542',
  PARCEL_ESTAFETA:  '17815440035543',
  BIGITEM_ESTAFETA: '17815440035544',
  CHECKS:           '17816263361530',
  VENDEDOR:         '17815439718370',
  ALMACEN:          '17815439718371',
  FECHA:            '17815439875750',
  COMENTARIOS:      ''
};

// Como se debe llamar cada pregunta. Si el ID sigue pero el titulo ya no dice esto, Walmart movio las preguntas: NO se envia.
var REC_TITULOS = {
  PARCEL_FLOTA:     /flota dedicada parcel/,
  BIGITEM_FLOTA:    /flota dedicada big item/,
  VINOS_FLOTA:      /vinos/,
  PARCEL_ESTAFETA:  /estafeta parcel/,
  BIGITEM_ESTAFETA: /estafeta big item/,
  CHECKS:           /antes de solicitar/,
  VENDEDOR:         /datos del vendedor/,
  ALMACEN:          /direccion/,
  FECHA:            /fecha/,
  COMENTARIOS:      /comentario/
};

// Subcampos (#contactForms) de "Datos del Vendedor" y "Direccion de tu almacen". tipo = #inputType en el formulario.
var REC_CAMPOS = {
  CUENTA:     { label: 'Nombre de la cuenta:',   id: 'ecf6464-06f3-4510-2b4f-85413666aac3', tipo: 'textInput' },
  SELLER_ID:  { label: 'Seller ID:',             id: 'bd4fd-db75-1ab3-24b1-1b36a5450c',     tipo: 'textInput' },
  CONTACTO:   { label: 'Nombre del contacto:',   id: '8d263ea-e0e2-fe24-0d7-1db03fef2af',   tipo: 'textInput' },
  TELEFONO:   { label: 'Teléfono del contacto:', id: '386a383-384e-a172-d0e4-a84246ff5242', tipo: 'textInput' },
  DIRECCION:  { label: 'Dirección:',             id: '047dc8f-2fa6-366-d2a4-d2c21e4e0c60', tipo: 'textInput' },
  CP:         { label: 'Código Postal:',         id: 'aac4b01-bcaf-288a-782f-a4d64d5bc4d8', tipo: 'textInput' },
  REFERENCIA: { label: 'Referencias:',           id: '027faf7-77f-7e2c-e484-467701cf5d',   tipo: 'textInput' }
};

// Propiedades del script (todas con prefijo REC_ para no mezclarse con las de Site Sheet)
var REC_PROP = {
  ULTIMA_FECHA: 'REC_ULTIMA_FECHA', HUELLA: 'REC_HUELLA_V2', MODIFIED_ON: 'REC_MODIFIED_ON', ID_COMENTARIOS: 'REC_ID_COMENTARIOS',
  TRIGGERS_DE: 'REC_TRIGGERS_DE', TRIGGERS_DESDE: 'REC_TRIGGERS_DESDE', DEF_REF: 'REC_DEF_REFERENCIA_2', ULTIMO_AVISO: 'REC_ULTIMO_AVISO',
  HEADERS_EXTRA: 'REC_HEADERS_EXTRA'
};

var REC_ULTIMO = null;   // resultado de la ultima corrida en esta ejecucion {estado, detalle, http, respuesta} (para los dialogos del menu)


/* ================================================================== */
/*  Corrida (la llama el trigger, el menu o una prueba)                */
/* ================================================================== */

function recEnviarSolicitud() { return recCorrer_('AUTO', false, false); }
function recEnviarYa()        { return recCorrer_('MANUAL', true, false); }   // menu: ignora el antiduplicado (a Walmart no le importa si se repite)
function recProbar()          { return recCorrer_('PRUEBA', false, true); }   // arma todo y revisa el formulario, NO envia

function recCorrer_(paso, forzar, seco, fechaFija) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    recRegistrar_(paso, 'ERROR', 'Habia otra ejecucion corriendo; esta no hizo nada');
    flushLog_();
    return 'OCUPADO';
  }
  var fecha = '';
  try {
    var props = PropertiesService.getScriptProperties();
    fecha = fechaFija || recFechaRecoleccion_();

    // ---- Antiduplicado ----
    if (!seco && !forzar && props.getProperty(REC_PROP.ULTIMA_FECHA) === fecha) {
      recRegistrar_(paso, 'OMITIDO', 'La recoleccion del ' + fecha + ' ya se habia pedido', fecha);
      return 'OMITIDO';
    }

    // ---- Revisar el formulario ----
    var avisos = [];
    var cambios = [];
    var rev = recRevisarFormulario_();
    if (!rev.ok) {
      avisos.push('No pude revisar si cambio el formulario (' + rev.error + ')');
      if (rev.http === 200 && rev.json) recGuardarDefinicion_('NO RECONOCIDO', rev.json);   // bajo el JSON pero no lo entendi: se guarda para diagnosticarlo
    } else {
      var primeraVez = !props.getProperty(REC_PROP.HUELLA);
      if (primeraVez || rev.cambios.length) recGuardarDefinicion_(Object.keys(rev.preguntas).length + ' preguntas', rev.json);
      cambios = rev.cambios;
      if (!seco) recGuardarHuella_(rev.preguntas);
      if (rev.idComentarios && !REC_Q.COMENTARIOS) props.setProperty(REC_PROP.ID_COMENTARIOS, rev.idComentarios);
    }

    // Version del formulario: la de hoy, o la ultima conocida si hoy no se pudo leer
    var modifiedOn = rev.modifiedOn || props.getProperty(REC_PROP.MODIFIED_ON) || '';
    if (rev.modifiedOn) {
      var ant = props.getProperty(REC_PROP.MODIFIED_ON);
      if (ant && ant !== rev.modifiedOn) avisos.push('Walmart edito el formulario (version ' + rev.modifiedOn + ')');
      if (!seco) props.setProperty(REC_PROP.MODIFIED_ON, rev.modifiedOn);
    }

    var idCom = (rev.ok && rev.idComentarios) || REC_Q.COMENTARIOS || props.getProperty(REC_PROP.ID_COMENTARIOS) || '';
    if (!idCom) avisos.push('No se el ID de Comentarios: va sin comentario');
    if (cambios.length) avisos.push('Walmart movio el formulario: ' + cambios.join(' ; '));

    // ---- Cambio en algo que mandamos: no se envia ----
    if (rev.ok && rev.faltan.length) {
      var det = 'Cambio el formulario: ' + rev.faltan.join(' ; ') + (cambios.length ? ' | ' + cambios.join(' ; ') : '');
      if (seco) {
        recRegistrar_(paso, 'PRUEBA', 'NO se podria enviar. ' + det, fecha, rev.http);
        return 'CAMBIO';
      }
      recGuardarDefinicion_('CAMBIO: ' + rev.faltan.join(' ; ').slice(0, 300), rev.json);
      recRegistrar_(paso, 'CAMBIO', 'NO se envio. ' + det, fecha, rev.http, '', null, rev.faltan.join(' ; '));
      recAlertar_('NO se envio, cambio el formulario',
        'Hoy NO se pidio la recoleccion del ' + fecha + '.\n\n' + det +
        '\n\nLlenala a mano y mandale a Claude este correo: la definicion nueva quedo en la hoja "' + REC_HOJA_FORM + '".');
      return 'CAMBIO';
    }

    if (!modifiedOn) {
      var sinVer = 'No pude leer la version del formulario (modified_on) y Walmart la exige. ' + (rev.error || '');
      if (seco) { recRegistrar_(paso, 'PRUEBA', 'NO se podria enviar. ' + sinVer, fecha, rev.http); return 'ERROR'; }
      recRegistrar_(paso, 'ERROR', 'NO se envio. ' + sinVer, fecha, rev.http, '', null, sinVer);
      recAlertar_('NO se envio (no pude leer el formulario)',
        'Hoy NO se pidio la recoleccion del ' + fecha + '.\n\n' + sinVer + '\n\nLlenala a mano y mandale a Claude este correo.');
      return 'ERROR';
    }

    var payload = recArmarPayload_(fecha, idCom, modifiedOn);

    // ---- Prueba en seco ----
    if (seco) {
      recRegistrar_(paso, 'PRUEBA', 'No se envio nada' + (avisos.length ? '. ' + avisos.join(' | ') : '. Todo listo para enviar'),
        fecha, rev.http, JSON.stringify(payload));
      return payload;
    }

    // ---- Envio ----
    var h = recHeaders_();
    h['Content-Type'] = 'application/json';
    var resp, code = 0, cuerpo = '';
    try {
      resp = UrlFetchApp.fetch(REC_CFG.URL_ENVIO, { method: 'post', headers: h, payload: JSON.stringify(payload), muteHttpExceptions: true });
      code = resp.getResponseCode();
      cuerpo = resp.getContentText();
    } catch (e) {
      cuerpo = 'Fallo la conexion: ' + e.message;
    }

    var rechazo = recMotivoRechazo_(code, cuerpo);
    if (rechazo) {
      recRegistrar_(paso, 'ERROR', 'Walmart NO acepto la solicitud: ' + rechazo + (avisos.length ? ' | ' + avisos.join(' | ') : ''),
        fecha, code, cuerpo, payload, 'Walmart respondio ' + rechazo);
      recAlertar_('NO se envio (' + (code || 'sin conexion') + ')',
        'Hoy NO se pidio la recoleccion del ' + fecha + '.\n\n' + rechazo + '\n\nRespuesta:\n' + cuerpo.slice(0, 800) +
        (avisos.length ? '\n\nAdemas:\n- ' + avisos.join('\n- ') : '') + '\n\nLlenala a mano y mandale a Claude este correo.');
      return 'ERROR';
    }

    props.setProperty(REC_PROP.ULTIMA_FECHA, fecha);
    if (!avisos.length) {
      recRegistrar_(paso, 'OK', 'Recoleccion solicitada', fecha, code, cuerpo, payload);
      props.deleteProperty(REC_PROP.ULTIMO_AVISO);
      return 'OK';
    }

    recRegistrar_(paso, 'AVISO', 'Se envio, pero: ' + avisos.join(' | '), fecha, code, cuerpo, payload, avisos.join(' ; '));
    // Correo solo si el aviso es nuevo o si Walmart cambio algo: el mismo aviso repetido todos los dias solo va al Log.
    var texto = avisos.join(' | ');
    if (cambios.length || props.getProperty(REC_PROP.ULTIMO_AVISO) !== texto) {
      recAlertar_('se envio, pero revisa', 'La recoleccion del ' + fecha + ' SI se pidio.\n\nPero:\n- ' + avisos.join('\n- '));
    }
    props.setProperty(REC_PROP.ULTIMO_AVISO, texto.slice(0, 8000));
    return 'AVISO';

  } catch (e) {
    recRegistrar_(paso, 'ERROR', 'Error del script: ' + e.message, fecha, '', e.stack || '');
    if (!seco) recAlertar_('NO se envio (error del script)',
      'Hoy NO se pidio la recoleccion' + (fecha ? ' del ' + fecha : '') + '.\n\n' + e.message + '\n\n' + (e.stack || ''));
    throw e;
  } finally {
    lock.releaseLock();
    flushLog_();
  }
}

// '' = aceptado. Si no, el motivo.
function recMotivoRechazo_(code, cuerpo) {
  if (!code) return cuerpo || 'sin respuesta';
  if (code < 200 || code >= 300) return 'HTTP ' + code;
  try {
    var o = JSON.parse(cuerpo);
    if (o && typeof o === 'object') {
      if (o.success === false) return 'success=false';
      if (o.error) return 'error: ' + JSON.stringify(o.error).slice(0, 200);
      if (o.errors && (!Array.isArray(o.errors) || o.errors.length)) return 'errors: ' + JSON.stringify(o.errors).slice(0, 200);
      if (String(o.status).toLowerCase() === 'error') return 'status=error';
    }
  } catch (e) { /* respuesta no-JSON con 2xx: se toma como aceptada */ }
  return '';
}


/* ================================================================== */
/*  Fecha, payload y headers                                           */
/* ================================================================== */

// Siguiente dia habil: L-J -> manana. Viernes (o sabado/domingo) -> lunes. Se brinca REC_CFG.DIAS_SIN_RECOLECCION.
function recFechaRecoleccion_(desde) {
  var hoy = Utilities.formatDate(desde || new Date(), REC_CFG.ZONA, 'yyyy-MM-dd').split('-');
  var d = new Date(Date.UTC(+hoy[0], +hoy[1] - 1, +hoy[2], 12));   // mediodia UTC: la fecha nunca se mueve por la zona horaria
  var inhabiles = REC_CFG.DIAS_SIN_RECOLECCION || [];
  for (var i = 0; i < 30; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    var dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    var txt = Utilities.formatDate(d, 'UTC', 'dd/MM/yyyy');
    if (inhabiles.indexOf(txt) !== -1) continue;
    return txt;
  }
  throw new Error('No encontre dia habil en 30 dias. Revisa REC_CFG.DIAS_SIN_RECOLECCION.');
}

// modifiedOn = version del formulario (message.survey.modified_on). Walmart la compara: si no coincide responde
// SVSUB_E011 "Survey modified while its been taken". NO es la hora actual.
function recArmarPayload_(fecha, idComentarios, modifiedOn) {
  var R = REC_RESP, Q = REC_Q, C = REC_CAMPOS;
  var a = {};
  a[Q.PARCEL_FLOTA]     = R.PARCEL_FLOTA;
  a[Q.BIGITEM_FLOTA]    = R.BIGITEM_FLOTA;
  a[Q.VINOS_FLOTA]      = R.VINOS_FLOTA;
  a[Q.PARCEL_ESTAFETA]  = R.PARCEL_ESTAFETA;
  a[Q.BIGITEM_ESTAFETA] = R.BIGITEM_ESTAFETA;
  a[Q.CHECKS]           = R.CHECKS.slice();
  a[Q.VENDEDOR] = [
    recCampo_(C.CUENTA, R.CUENTA), recCampo_(C.SELLER_ID, R.SELLER_ID),
    recCampo_(C.CONTACTO, R.CONTACTO), recCampo_(C.TELEFONO, R.TELEFONO)
  ];
  a[Q.ALMACEN] = [
    recCampo_(C.DIRECCION, R.DIRECCION), recCampo_(C.CP, R.CP), recCampo_(C.REFERENCIA, R.REFERENCIA)
  ];
  a[Q.FECHA] = { date: fecha };
  if (idComentarios && R.COMENTARIOS) a[idComentarios] = R.COMENTARIOS;
  return {
    survey_id:   REC_CFG.SURVEY_ID,
    spent_time:  90 + Math.floor(Math.random() * 120),   // lo que tarda una persona
    answers:     a,
    modified_on: modifiedOn,
    status:      'completed'
  };
}

function recCampo_(c, valor) {
  return { '#label': c.label, '#fieldType': 'custom', '#fieldId': c.id, '#value': valor };
}

function recHeaders_() {
  // Mismos headers que manda la pagina (capturados 22/09/2026). Sin token ni cookies: el formulario es publico.
  var h = {
    'Accept': 'application/json',
    'Accept-Language': 'es-419,es;q=0.9',
    'Origin': REC_CFG.ORIGEN,
    'Referer': REC_CFG.ORIGEN + '/',
    'Correlation-Id': recCorrelationId_()
  };
  var extra = PropertiesService.getScriptProperties().getProperty(REC_PROP.HEADERS_EXTRA);
  if (extra) {
    var obj = JSON.parse(extra);   // si esta mal escrito, que truene con su mensaje
    for (var k in obj) h[k] = obj[k];
  }
  return h;
}

// Mismo formato que genera la pagina: hex 7-4-4-4-10
function recCorrelationId_() {
  var hex = function (n) { var s = ''; while (s.length < n) s += Math.floor(Math.random() * 16).toString(16); return s; };
  return [hex(7), hex(4), hex(4), hex(4), hex(10)].join('-');
}


/* ================================================================== */
/*  Deteccion de cambios en el formulario                              */
/*  Devuelve { ok, http, error, preguntas, idComentarios, modifiedOn,  */
/*    faltan: [lo que usamos y ya no esta -> BLOQUEA el envio],        */
/*    cambios: [diferencias contra la ultima vez -> solo avisa], json } */
/* ================================================================== */

function recRevisarFormulario_() {
  var r = { ok: false, http: 0, error: '', preguntas: {}, idComentarios: '', faltan: [], cambios: [], json: '', modifiedOn: '' };
  var Q = REC_Q;

  var resp;
  try {
    resp = UrlFetchApp.fetch(REC_CFG.URL_DEFINICION, { method: 'get', headers: recHeaders_(), muteHttpExceptions: true });
  } catch (e) {
    r.error = 'Fallo la conexion al bajar el formulario: ' + e.message;
    return r;
  }
  r.http = resp.getResponseCode();
  r.json = resp.getContentText();
  if (r.http < 200 || r.http >= 300) {
    r.error = 'El formulario respondio HTTP ' + r.http + ': ' + r.json.slice(0, 300);
    return r;
  }

  var def;
  try { def = JSON.parse(r.json); }
  catch (e) { r.error = 'La definicion no es JSON: ' + r.json.slice(0, 200); return r; }

  var sv = (def && def.message && def.message.survey) || (def && def.survey) || def || {};   // version del formulario: va tal cual en el envio
  r.modifiedOn = String(recValor_(sv, ['modified_on', 'modifiedOn']) || '');

  r.preguntas = recExtraerPreguntas_(def);
  var ids = Object.keys(r.preguntas);
  if (!ids.length) { r.error = 'No reconoci ninguna pregunta en la definicion'; return r; }
  r.ok = true;

  // Comentarios: el configurado, o el que diga "comentario"
  r.idComentarios = Q.COMENTARIOS || '';
  if (!r.idComentarios) {
    ids.forEach(function (id) {
      if (!r.idComentarios && REC_TITULOS.COMENTARIOS.test(recNorm_(r.preguntas[id].titulo))) r.idComentarios = id;
    });
  }

  // ===== Revisiones que BLOQUEAN el envio (r.faltan) =====
  var nuestros = {};
  Object.keys(Q).forEach(function (k) { if (Q[k]) nuestros[Q[k]] = k; });
  if (r.idComentarios) nuestros[r.idComentarios] = 'COMENTARIOS';

  // 1) Cada pregunta que llenamos sigue ahi y se sigue llamando igual
  Object.keys(Q).forEach(function (k) {
    var id = Q[k];
    if (!id) return;
    var p = r.preguntas[id];
    if (!p) { r.faltan.push('Ya no existe la pregunta ' + recNombre_(k)); return; }
    if (REC_TITULOS[k] && !REC_TITULOS[k].test(recNorm_(p.titulo)))
      r.faltan.push('La pregunta ' + recNombre_(k) + ' ahora dice "' + p.titulo.slice(0, 60) + '"');
  });
  if (!r.idComentarios) r.faltan.push('Ya no encuentro la pregunta Comentarios');

  // 2) Preguntas nuevas que no llenamos
  ids.forEach(function (id) {
    var p = r.preguntas[id];
    if (!nuestros[id] && !p.desactivada)
      r.faltan.push('Pregunta nueva: "' + p.titulo.slice(0, 60) + '"' + (p.obligatoria ? ' (obligatoria)' : ''));
  });

  // 3) Subcampos de Vendedor y Almacen: mismos, ni mas ni menos, mismo nombre y tipo
  [[Q.VENDEDOR, 'Datos del Vendedor', ['CUENTA', 'SELLER_ID', 'CONTACTO', 'TELEFONO']],
   [Q.ALMACEN, 'Direccion de tu almacen', ['DIRECCION', 'CP', 'REFERENCIA']]].forEach(function (g) {
    var p = r.preguntas[g[0]];
    if (!p) return;   // ya se reporto arriba que no existe
    if (!p.subcampos.length) { r.faltan.push(g[1] + ': no encontre sus campos en el formulario'); return; }
    var esperados = g[2].map(function (k) { return REC_CAMPOS[k].id; });
    g[2].forEach(function (k) {
      var c = REC_CAMPOS[k], info = p.subInfo[c.id];
      if (!info) { r.faltan.push(g[1] + ': ya no existe el campo "' + c.label + '"'); return; }
      if (info.label && recNorm_(info.label) !== recNorm_(c.label))
        r.faltan.push(g[1] + ': el campo "' + c.label + '" ahora se llama "' + info.label + '"');
      if (c.tipo && info.tipo && info.tipo !== c.tipo)
        r.faltan.push(g[1] + ': el campo "' + c.label + '" cambio de tipo (' + c.tipo + ' -> ' + info.tipo + ')');
    });
    p.subcampos.filter(function (x) { return esperados.indexOf(x) === -1; }).forEach(function (x) {
      r.faltan.push(g[1] + ': campo nuevo "' + ((p.subInfo[x] && p.subInfo[x].label) || x) + '" que no llenamos');
    });
  });

  // 4) Casillas: las mismas que marcamos, ni mas ni menos
  var pc = r.preguntas[Q.CHECKS];
  if (pc) {
    var nuestras = REC_RESP.CHECKS.map(recNorm_);
    var hay = pc.opciones.map(recNorm_);
    REC_RESP.CHECKS.forEach(function (t) {
      if (hay.indexOf(recNorm_(t)) === -1) r.faltan.push('Ya no existe la casilla "' + t + '"');
    });
    pc.opciones.forEach(function (t) {
      if (nuestras.indexOf(recNorm_(t)) === -1) r.faltan.push('Casilla nueva: "' + t.slice(0, 80) + '"');
    });
  }

  // ===== Diferencias contra la huella anterior: solo avisan =====
  var antes = PropertiesService.getScriptProperties().getProperty(REC_PROP.HUELLA);
  if (antes) {
    var A = JSON.parse(antes);
    ids.forEach(function (id) {
      var p = r.preguntas[id];
      if (A[id] && A[id].h !== p.h) r.cambios.push('CAMBIO: ' + p.titulo.slice(0, 50) + recDescribir_(A[id], p));
    });
  }
  return r;
}

function recNombre_(k) {
  return ({ PARCEL_FLOTA: 'Flota Dedicada PARCEL', BIGITEM_FLOTA: 'Flota Dedicada BIG ITEM', VINOS_FLOTA: 'Flota Dedicada Vinos',
    PARCEL_ESTAFETA: 'Estafeta PARCEL', BIGITEM_ESTAFETA: 'Estafeta BIG ITEM', CHECKS: 'Requisitos y terminos',
    VENDEDOR: 'Datos del Vendedor', ALMACEN: 'Direccion de tu almacen', FECHA: 'Fecha de recoleccion', COMENTARIOS: 'Comentarios' })[k] || k;
}

// minusculas, sin acentos ni simbolos raros
function recNorm_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Guarda la huella actual (despues de registrar los cambios, para que cada cambio avise UNA vez y no todos los dias).
function recGuardarHuella_(preguntas) {
  var mini = {};
  Object.keys(preguntas).forEach(function (id) {
    var p = preguntas[id];
    mini[id] = { h: p.h, t: p.titulo.slice(0, 50), y: p.tipo, o: p.obligatoria ? 1 : 0 };
  });
  PropertiesService.getScriptProperties().setProperty(REC_PROP.HUELLA, JSON.stringify(mini));
}

function recDescribir_(a, p) {
  var d = [];
  if (a.t !== p.titulo.slice(0, 50)) d.push('titulo "' + a.t + '" -> "' + p.titulo.slice(0, 50) + '"');
  if (a.y !== p.tipo) d.push('tipo ' + a.y + ' -> ' + p.tipo);
  if (a.o !== (p.obligatoria ? 1 : 0)) d.push(p.obligatoria ? 'ahora OBLIGATORIA' : 'ya no obligatoria');
  return d.length ? ' : ' + d.join(', ') : ' : opciones o configuracion interna';
}

// ---------- Lector generico de la definicion ----------
// No depende de la forma exacta del JSON de Walmart: busca cualquier objeto con un id numerico largo (asi son los IDs
// de las preguntas). Walmart pone "#" al frente de las llaves (#question_id, #title, #type, #required): se buscan con y sin "#".
var REC_ID_PREGUNTA = /^\d{12,}$/;
var REC_VOLATILES = /^(modified|updated|created|last)|(_on|_at|On|At)$|timestamp|views|count$|dropdownContent/i;

function recValor_(n, llaves) {
  for (var i = 0; i < llaves.length; i++) {
    if (n['#' + llaves[i]] != null) return n['#' + llaves[i]];
    if (n[llaves[i]] != null) return n[llaves[i]];
  }
  return null;
}

function recExtraerPreguntas_(raiz) {
  var out = {};
  var visto = 0;
  (function walk(n, llave) {
    if (++visto > 20000) return;
    if (Array.isArray(n)) { n.forEach(function (x) { walk(x, null); }); return; }
    if (!n || typeof n !== 'object') return;
    var id = recValor_(n, ['question_id', 'questionId']);
    if (id == null && (recValor_(n, ['title']) != null || recValor_(n, ['type']) != null)) id = recValor_(n, ['id', 'key']);   // "id" a secas solo cuenta si tiene pinta de pregunta
    if (id == null && llave && REC_ID_PREGUNTA.test(llave)) id = llave;
    if (id != null && REC_ID_PREGUNTA.test(String(id)) && !out[String(id)]) out[String(id)] = recResumen_(n);
    Object.keys(n).forEach(function (k) { walk(n[k], k); });
  })(raiz, null);
  return out;
}

function recResumen_(n) {
  var titulo = recPrimero_(n, ['title', 'label', 'questionLabel', 'question', 'text', 'name', 'heading']);
  var tipo = recValor_(n, ['type', 'question_type', 'questionType', 'component', 'widget', 'kind']);
  var ob = recValor_(n, ['required', 'is_required', 'mandatory']);
  if (ob == null && n.validation) ob = n.validation.required;
  var des = recValor_(n, ['deactivated', 'hidden']);
  var sub = [], subInfo = {};   // subcampos del contact_form: viven en #contactForms (confirmado 22/09)
  var forms = recValor_(n, ['contactForms']);
  if (Array.isArray(forms)) forms.forEach(function (f) {
    var fid = recValor_(f, ['fieldId']);
    if (fid == null) return;
    fid = String(fid);
    if (sub.indexOf(fid) === -1) sub.push(fid);
    subInfo[fid] = { label: recLimpiar_(recValor_(f, ['label']) || ''), tipo: String(recValor_(f, ['inputType']) || '') };
  });
  var opciones = [];   // opciones de las casillas: #options[].key (confirmado 22/09)
  var ops = recValor_(n, ['options', 'choices']);
  if (Array.isArray(ops)) ops.forEach(function (o) {
    var t = typeof o === 'string' ? o : recPrimero_(o || {}, ['key', 'label', 'text', 'title', 'name']);
    if (recLimpiar_(t)) opciones.push(recLimpiar_(t));
  });
  return {
    titulo: recLimpiar_(titulo) || '(sin titulo)',
    tipo: String(tipo || ''),
    obligatoria: ob === true || ob === 1 || ob === 'true',
    desactivada: des === true || des === 1 || des === 'true',
    subcampos: sub,
    subInfo: subInfo,
    opciones: opciones,
    texto: recNorm_(recLimpiar_(JSON.stringify(n))),
    h: recHash_(recEstable_(n))
  };
}

function recPrimero_(n, llaves) {
  for (var i = 0; i < llaves.length; i++) {
    var v = recValor_(n, [llaves[i]]);
    if (v == null) continue;
    if (typeof v === 'string' && recLimpiar_(v)) return v;
    if (typeof v === 'object') {   // titulos multi-idioma: {es: '...', en: '...'}
      var s = v.es || v['es-MX'] || v['es-419'] || v.en || v.default || v.text;
      if (typeof s === 'string' && recLimpiar_(s)) return s;
    }
  }
  return '';
}

function recLimpiar_(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

// JSON con llaves ordenadas y sin campos que cambian solos
function recEstable_(n) {
  if (Array.isArray(n)) return '[' + n.map(recEstable_).join(',') + ']';
  if (n && typeof n === 'object') {
    return '{' + Object.keys(n).sort().filter(function (k) { return !REC_VOLATILES.test(k.replace(/^#/, '')); })
      .map(function (k) { return JSON.stringify(k) + ':' + recEstable_(n[k]); }).join(',') + '}';
  }
  return JSON.stringify(n);
}

function recHash_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8);
  return b.slice(0, 5).map(function (x) { return ('0' + (x & 0xff).toString(16)).slice(-2); }).join('');
}


/* ================================================================== */
/*  Log (el del libro) + Historial legible + hoja Formulario           */
/* ================================================================== */

var REC_NIVEL = { OK: 'OK', OMITIDO: 'INFO', PRUEBA: 'INFO', AVISO: 'WARN', CAMBIO: 'ERROR', ERROR: 'ERROR' };
var REC_ACCIONES = { AUTO: 'Envío automático', MANUAL: 'Envío manual (menú)', INSTALAR: 'Instalar envío diario', QUITAR: 'Quitar envío diario' };
var REC_RESULTADOS = {
  OK:      '✅ Enviado',
  AVISO:   '✅ Enviado (con aviso, ver Log)',
  OMITIDO: '➖ Ya estaba pedida',
  CAMBIO:  '❌ NO se envió (cambió el formulario)',
  ERROR:   '❌ NO se envió (ver Log)'
};
var REC_HIST_ENC = ['Fecha y hora', 'Acción', 'Recolección del', 'Resultado',
  'Flota Dedicada PARCEL', 'Flota Dedicada BIG ITEM', 'Flota Dedicada Vinos',
  'Estafeta PARCEL', 'Estafeta BIG ITEM',
  'Nombre de la cuenta', 'Seller ID', 'Nombre del contacto', 'Teléfono del contacto',
  'Dirección', 'Código Postal', 'Referencias', 'Comentarios', 'Requisitos y términos', 'Nota'];
var REC_HIST_ANCHOS = [140, 170, 110, 230, 80, 80, 80, 80, 80, 150, 110, 150, 120, 170, 90, 110, 220, 420, 300];
var REC_FORM_ENC = ['Timestamp', 'Preguntas', 'JSON'];

/**
 * Una sola puerta para todo lo que la recoleccion deja registrado: Log del libro (etapa RECOLECCION),
 * Historial legible (solo envios/instalar/quitar). Nunca truena: si el historial falla lo dice en consola.
 * El que la llama debe hacer flushLog_() (recCorrer_ y los dialogos del menu ya lo hacen).
 */
function recRegistrar_(paso, estado, detalle, fecha, http, respuesta, payload, nota) {
  var ts = Utilities.formatDate(new Date(), REC_CFG.ZONA, 'yyyy-MM-dd HH:mm:ss');
  var nivel = REC_NIVEL[estado] || 'INFO';
  var det = { paso: paso, estado: estado, recoleccion: fecha || '', http: http || '', respuesta: String(respuesta || '').slice(0, 1000) };
  if (payload) det.payload = payload;
  var msg = '[' + paso + '] ' + estado + ': ' + (detalle || '');
  if (nivel === 'OK') logOk_(REC_ETAPA, msg, det);
  else if (nivel === 'WARN') logWarn_(REC_ETAPA, msg, det);
  else if (nivel === 'ERROR') logErr_(REC_ETAPA, msg, det);
  else logInfo_(REC_ETAPA, msg, det);
  REC_ULTIMO = { paso: paso, estado: estado, detalle: detalle || '', http: http || '', respuesta: String(respuesta || '') };
  recHistorial_(ts, paso, estado, fecha, payload, nota);
}

/** Crea la hoja con su formato (encabezado de color, fila congelada, anchos) la primera vez. */
function recHojaConFormato_(nombre, encabezados, anchos, posicion) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(nombre);
  if (sh) return sh;
  sh = (posicion != null) ? ss.insertSheet(nombre, posicion) : ss.insertSheet(nombre);
  sh.getRange(1, 1, 1, encabezados.length).setValues([encabezados])
    .setBackground(ORG_GRUPOS.RECOLECCION.color).setFontColor('#ffffff').setFontWeight('bold').setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setTabColor(ORG_GRUPOS.RECOLECCION.color);
  (anchos || []).forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  return sh;
}

/** Ubica cada encabezado del script donde este; el que falta se agrega AL FINAL. Devuelve {encabezado: columna 1-based}. */
function recAsegurarColumnas_(hoja, encabezados) {
  var nC = Math.max(1, hoja.getLastColumn());
  var enc = hoja.getRange(1, 1, 1, nC).getValues()[0];
  var idx = {}, fin = 0;
  enc.forEach(function (e, i) {
    var k = normEnc_(e);
    if (k && !(k in idx)) idx[k] = i + 1;
    if (String(e) !== '') fin = i + 1;
  });
  var m = {};
  encabezados.forEach(function (n) {
    var k = normEnc_(n);
    if (!(k in idx)) { fin++; hoja.getRange(1, fin).setValue(n); idx[k] = fin; }   // col-fija: columna nueva al final, solo cuando falta el encabezado
    m[n] = idx[k];
  });
  return m;
}

/** Escribe UNA fila en `fila`: valores[i] va bajo encabezados[i], donde este esa columna. Las pegadas van en una sola llamada. */
function recEscribirFila_(hoja, fila, mapa, encabezados, valores) {
  var items = encabezados.map(function (n, i) { return { col: mapa[n], v: valores[i] }; }).sort(function (a, b) { return a.col - b.col; });
  var i = 0;
  while (i < items.length) {
    var j = i;
    while (j + 1 < items.length && items[j + 1].col === items[j].col + 1) j++;
    var tramo = items.slice(i, j + 1).map(function (x) { return x.v; });
    hoja.getRange(fila, items[i].col, 1, tramo.length).setValues([tramo]);
    i = j + 1;
  }
}

function recHistorial_(ts, paso, estado, fecha, payload, nota) {
  var accion = REC_ACCIONES[paso];
  if (!accion) return;   // pruebas no van al historial
  var res = (paso === 'INSTALAR' || paso === 'QUITAR') ? (estado === 'OK' ? '✅ Hecho' : '❌ Falló') : (REC_RESULTADOS[estado] || estado);
  try {
    var sh = recHojaConFormato_(REC_HOJA_HIST, REC_HIST_ENC, REC_HIST_ANCHOS, 0);
    var m = recAsegurarColumnas_(sh, REC_HIST_ENC);
    // Textos que son puros digitos (CP 03330, Seller ID, telefono) van con ' para que Sheets no se coma el cero de la izquierda.
    var campos = recCamposEnviados_(payload).map(function (x) { return (typeof x === 'string' && /^\d+$/.test(x)) ? "'" + x : x; });
    var fila = [ts, accion, fecha || '', res].concat(campos);
    while (fila.length < REC_HIST_ENC.length - 1) fila.push('');
    fila.push(String(nota || '').slice(0, 500));
    if (sh.getLastRow() < 2 || sh.getMaxRows() < 2) { recEscribirFila_(sh, 2, m, REC_HIST_ENC, fila); return; }
    sh.insertRowBefore(2);   // la mas reciente arriba
    recEscribirFila_(sh, 2, m, REC_HIST_ENC, fila);
  } catch (e) {
    console.log('Recoleccion: no se pudo escribir el historial: ' + e.message);
  }
}

// Lo que de verdad se mando, campo por campo (sale del payload, no de la configuracion). Mismo orden que REC_HIST_ENC desde "Flota Dedicada PARCEL".
function recCamposEnviados_(p) {
  if (!p || !p.answers) return [];
  var a = p.answers, Q = REC_Q;
  var v = function (id) { return a[id] != null ? a[id] : ''; };
  var sub = function (qid, campo) {
    var arr = a[qid] || [];
    for (var i = 0; i < arr.length; i++) if (arr[i]['#fieldId'] === campo.id) return arr[i]['#value'];
    return '';
  };
  var usados = Object.keys(Q).map(function (k) { return Q[k]; });
  var com = '';
  Object.keys(a).forEach(function (k) { if (usados.indexOf(k) === -1 && typeof a[k] === 'string') com = a[k]; });
  if (Q.COMENTARIOS && a[Q.COMENTARIOS]) com = a[Q.COMENTARIOS];
  var checks = a[Q.CHECKS] || [];
  var C = REC_CAMPOS;
  return [
    v(Q.PARCEL_FLOTA), v(Q.BIGITEM_FLOTA), v(Q.VINOS_FLOTA), v(Q.PARCEL_ESTAFETA), v(Q.BIGITEM_ESTAFETA),
    sub(Q.VENDEDOR, C.CUENTA), sub(Q.VENDEDOR, C.SELLER_ID), sub(Q.VENDEDOR, C.CONTACTO), sub(Q.VENDEDOR, C.TELEFONO),
    sub(Q.ALMACEN, C.DIRECCION), sub(Q.ALMACEN, C.CP), sub(Q.ALMACEN, C.REFERENCIA),
    com || '(no se mandó)',
    REC_RESP.CHECKS.map(function (t) { return (checks.indexOf(t) !== -1 ? '☑ ' : '☐ ') + t; }).join('   ')   // cada casilla con su texto
  ];
}

function recGuardarDefinicion_(huella, json) {
  try {
    var sh = recHojaConFormato_(REC_HOJA_FORM, REC_FORM_ENC, [140, 200, 700]);
    var ts = Utilities.formatDate(new Date(), REC_CFG.ZONA, 'yyyy-MM-dd HH:mm:ss');
    sh.appendRow([ts, huella, recCompactar_(json).slice(0, 49000)]);
  } catch (e) {
    console.log('Recoleccion: no se pudo guardar la definicion: ' + e.message);
  }
}

// Quita las listas enormes (#dropdownContent: cientos de Seller IDs) para que la definicion quepa en una celda (tope 50,000).
function recCompactar_(json) {
  try {
    var o = JSON.parse(json);
    (function w(x) {
      if (Array.isArray(x)) { x.forEach(w); return; }
      if (!x || typeof x !== 'object') return;
      Object.keys(x).forEach(function (k) {
        if (/dropdownContent$/.test(k) && Array.isArray(x[k])) x[k] = ['(' + x[k].length + ' opciones)'];
        else w(x[k]);
      });
    })(o);
    return JSON.stringify(o);
  } catch (e) {
    return String(json);
  }
}

function recAlertar_(asunto, cuerpo) {
  var para = REC_CFG.EMAIL_ALERTAS || Session.getEffectiveUser().getEmail();
  if (!para) { console.log('Recoleccion: sin correo para alertar: ' + asunto); return; }
  var url = '';
  try { url = SpreadsheetApp.getActive().getUrl(); } catch (e) {}
  try {
    MailApp.sendEmail({
      to: para,
      subject: 'Recoleccion Walmart: ' + asunto,
      body: cuerpo + '\n\n' + (url ? 'Libro: ' + url + '\n' : '') + 'Formulario: ' + REC_CFG.ORIGEN + '/survey/' + REC_CFG.SURVEY_ID + '/'
    });
  } catch (e) {
    console.log('Recoleccion: no se pudo mandar el correo (' + asunto + '): ' + e.message);
  }
}


/* ================================================================== */
/*  Instalar / quitar el envio diario                                  */
/*  Google solo deja ver y borrar los triggers de la cuenta actual:    */
/*  por eso se guarda en REC_TRIGGERS_DE quien los instalo.            */
/* ================================================================== */

function recInstalar_() {
  var props = PropertiesService.getScriptProperties();
  var yo = Session.getEffectiveUser().getEmail() || '(cuenta sin correo visible)';
  recQuitarTriggers_();
  [ScriptApp.WeekDay.MONDAY, ScriptApp.WeekDay.TUESDAY, ScriptApp.WeekDay.WEDNESDAY,
   ScriptApp.WeekDay.THURSDAY, ScriptApp.WeekDay.FRIDAY].forEach(function (dia) {
    ScriptApp.newTrigger(REC_HANDLER).timeBased().onWeekDay(dia).atHour(REC_CFG.HORA_ENVIO).nearMinute(0).inTimezone(REC_CFG.ZONA).create();
  });
  props.setProperty(REC_PROP.TRIGGERS_DE, yo);
  props.setProperty(REC_PROP.TRIGGERS_DESDE, Utilities.formatDate(new Date(), REC_CFG.ZONA, 'yyyy-MM-dd HH:mm'));
  recRegistrar_('INSTALAR', 'OK', '5 triggers L-V ' + REC_CFG.HORA_ENVIO + ':00-' + REC_CFG.HORA_ENVIO + ':59 (CDMX) con ' + yo);
  flushLog_();
  return yo;
}

function recQuitar_() {
  var props = PropertiesService.getScriptProperties();
  var yo = Session.getEffectiveUser().getEmail() || '';
  var n = recQuitarTriggers_();
  if (n && props.getProperty(REC_PROP.TRIGGERS_DE) === yo) {
    props.deleteProperty(REC_PROP.TRIGGERS_DE);
    props.deleteProperty(REC_PROP.TRIGGERS_DESDE);
  }
  if (n) { recRegistrar_('QUITAR', 'OK', n + ' triggers apagados (' + yo + '). Ya no se envia solo.'); flushLog_(); }
  return n;
}

function recQuitarTriggers_() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === REC_HANDLER) { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

function recTriggersMios_() {
  return ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === REC_HANDLER; }).length;
}

// Dia y hora de la siguiente corrida del trigger (L-V REC_CFG.HORA_ENVIO CDMX)
function recProximaCorrida_() {
  var ahora = new Date();
  var hoy = Utilities.formatDate(ahora, REC_CFG.ZONA, 'yyyy-MM-dd').split('-');
  var hora = +Utilities.formatDate(ahora, REC_CFG.ZONA, 'HH');
  var d = new Date(Date.UTC(+hoy[0], +hoy[1] - 1, +hoy[2], 12));
  var dow = d.getUTCDay();
  if (hora >= REC_CFG.HORA_ENVIO + 1 || dow === 0 || dow === 6) {
    do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  }
  var dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  return { texto: dias[d.getUTCDay()] + ' ' + Utilities.formatDate(d, 'UTC', 'dd/MM'), recoleccion: recFechaRecoleccion_(d) };
}

/** Ultima corrida AUTO/MANUAL de la recoleccion, leida del Log del libro (por encabezado). null si no hay. */
function recUltimaCorrida_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(HOJA.LOG);
  if (!sh || sh.getLastRow() < 2) return null;
  var c = colsHoja_(sh, ['Hora', 'Etapa', 'Mensaje']);
  var n = sh.getLastRow();
  var desde = Math.max(2, n - 599);
  var datos = sh.getRange(desde, 1, n - desde + 1, Math.max(1, sh.getLastColumn())).getValues();
  for (var r = datos.length - 1; r >= 0; r--) {
    var f = datos[r];
    if (f[c.Etapa] !== REC_ETAPA) continue;
    var m = /^\[(AUTO|MANUAL)\] (\w+): ([\s\S]*)$/.exec(String(f[c.Mensaje]));
    if (m) return { hora: f[c.Hora] instanceof Date ? Utilities.formatDate(f[c.Hora], REC_CFG.ZONA, 'dd/MM/yyyy HH:mm') : String(f[c.Hora]), estado: m[2], detalle: m[3] };
  }
  return null;
}

// Texto del estado (lo usa el menu)
function recTextoEstado_() {
  var props = PropertiesService.getScriptProperties();
  var yo = Session.getEffectiveUser().getEmail() || '';
  var de = props.getProperty(REC_PROP.TRIGGERS_DE) || '';
  var mios = recTriggersMios_();
  var L = [];

  if (mios === 5) {
    L.push('ENVIO DIARIO: ACTIVO');
    L.push('   5 triggers con esta cuenta (' + yo + ')');
  } else if (mios > 0) {
    L.push('ENVIO DIARIO: INCOMPLETO');
    L.push('   ' + mios + ' de 5 triggers con esta cuenta. Dale Instalar otra vez.');
  } else if (de && de !== yo) {
    L.push('ENVIO DIARIO: instalado con ' + de);
    L.push('   Desde esta cuenta no se pueden ver ni quitar sus triggers.');
  } else {
    L.push('ENVIO DIARIO: NO INSTALADO');
    L.push('   No se va a enviar solo. Dale Instalar.');
  }
  if (de) L.push('   Instalado desde ' + (props.getProperty(REC_PROP.TRIGGERS_DESDE) || '?') + ' por ' + de);

  if (mios || de) {
    var p = recProximaCorrida_();
    L.push('');
    L.push('SIGUIENTE ENVIO: ' + p.texto + ' entre ' + REC_CFG.HORA_ENVIO + ':00 y ' + REC_CFG.HORA_ENVIO + ':59');
    L.push('   pide la recoleccion del ' + p.recoleccion);
  }

  L.push('');
  L.push('ULTIMA RECOLECCION PEDIDA: ' + (props.getProperty(REC_PROP.ULTIMA_FECHA) || 'ninguna todavia'));
  try {
    var u = recUltimaCorrida_();
    if (u) {
      L.push('   Ultima corrida: ' + u.hora + '  ' + u.estado);
      if (u.estado !== 'OK') L.push('   ' + u.detalle.slice(0, 220));
    }
  } catch (e) {
    L.push('   No pude leer el log: ' + e.message);
  }

  // Formulario (solo lectura: no guarda huella)
  L.push('');
  var rev = recRevisarFormulario_();
  if (rev.http === 200 && rev.json && !props.getProperty(REC_PROP.DEF_REF)) {   // la primera vez se guarda la definicion completa como referencia
    recGuardarDefinicion_('REFERENCIA', rev.json);
    props.setProperty(REC_PROP.DEF_REF, Utilities.formatDate(new Date(), REC_CFG.ZONA, 'yyyy-MM-dd HH:mm'));
  }
  if (!rev.ok) {
    L.push('FORMULARIO: NO SE PUDO REVISAR');
    L.push('   ' + rev.error.slice(0, 200));
    if (rev.http === 200 && rev.json) recGuardarDefinicion_('NO RECONOCIDO', rev.json);
  } else if (rev.faltan.length) {
    L.push('FORMULARIO: CAMBIO. Asi NO se enviaria.');
    rev.faltan.slice(0, 8).forEach(function (x) { L.push('   - ' + x.slice(0, 120)); });
    recGuardarDefinicion_('CAMBIO (Estado): ' + rev.faltan.join(' ; ').slice(0, 300), rev.json);
  } else {
    L.push('FORMULARIO: OK (' + Object.keys(rev.preguntas).length + ' preguntas; cada campo esta donde debe, ni mas ni menos)');
    if (rev.cambios.length) L.push('   Cambios desde el ultimo envio: ' + rev.cambios.join(' ; ').slice(0, 300));
    L.push('   Comentarios: ' + (rev.idComentarios ? 'encontrado' : 'NO encontrado, iria sin comentario'));
  }
  return L.join('\n');
}


/* ================================================================== */
/*  Menu: SITE SHEET > 🚛 Recolección Walmart                          */
/* ================================================================== */

function recMenuEstado() {
  var t = recTextoEstado_();
  flushLog_();
  dlgInfo_('🚛 Recolección Walmart', t, /NO INSTALADO|INCOMPLETO|NO SE PUDO|CAMBIO/.test(t) ? 'aviso' : 'ok');
}

function recMenuProbar() {
  var res;
  try { res = recProbar(); } catch (e) { res = 'ERROR'; }
  var u = REC_ULTIMO;
  var ok = res && typeof res === 'object';
  dlgInfo_(ok ? '🧪 Todo listo (no se envió nada)' : '🧪 Así NO se enviaría',
    (ok ? 'La solicitud se armó bien y el formulario de Walmart sigue igual.' : 'Resultado: ' + res) +
    (u ? '\n\n' + String(u.detalle).slice(0, 500) : '') + '\n\nQuedó en el Log (etapa RECOLECCION).', ok ? 'ok' : 'aviso');
}

function recMenuEnviarAhora() {
  var ui = SpreadsheetApp.getUi();
  var fecha = recFechaRecoleccion_();
  var yaPedida = PropertiesService.getScriptProperties().getProperty(REC_PROP.ULTIMA_FECHA) === fecha;
  var r = ui.alert('Enviar ahora',
    'Se va a pedir a Walmart la recoleccion del ' + fecha + '.' + (yaPedida ? '\n\n(Ya se habia pedido; se manda otra vez.)' : '') + '\n\nEnviar?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  var res;
  try { res = recEnviarYa(); } catch (e) { res = 'ERROR'; }
  var u = REC_ULTIMO;
  dlgInfo_(res === 'OK' ? 'Enviado' : (res === 'AVISO' ? 'Enviado, con aviso' : 'NO se envió'),
    'Recolección del ' + fecha + ': ' + (u ? u.estado : res) + '\n\n' +
    (u ? String(u.detalle).slice(0, 400) + '\n\nRespuesta de Walmart (HTTP ' + u.http + '):\n' + String(u.respuesta).slice(0, 300) : '') +
    '\n\nQuedó en el Log y en la hoja ' + REC_HOJA_HIST + '.', res === 'OK' || res === 'AVISO' ? 'ok' : 'error');
}

function recMenuInstalar() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var yo = Session.getEffectiveUser().getEmail() || '';
  var de = props.getProperty(REC_PROP.TRIGGERS_DE) || '';
  if (de && de !== yo) {
    var r = ui.alert('Ya esta instalado con otra cuenta',
      'El envio diario ya esta instalado con ' + de + '.\n\nSi instalas tambien con ' + yo + ' habra dos juegos de triggers. ' +
      'No se pediria doble (el antiduplicado lo evita), pero lo limpio es entrar con ' + de + ' y darle Quitar.\n\nInstalar de todas formas con ' + yo + '?', ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }
  recInstalar_();
  var p = recProximaCorrida_();
  dlgInfo_('Envío diario instalado',
    'Cuenta: ' + yo + '\nLunes a viernes entre ' + REC_CFG.HORA_ENVIO + ':00 y ' + REC_CFG.HORA_ENVIO + ':59 (CDMX).\n\n' +
    'Siguiente: ' + p.texto + ', pide la recolección del ' + p.recoleccion + '.\n\nLas alertas llegan a ' + (REC_CFG.EMAIL_ALERTAS || yo) + '.', 'ok');
}

function recMenuQuitar() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var yo = Session.getEffectiveUser().getEmail() || '';
  var de = props.getProperty(REC_PROP.TRIGGERS_DE) || '';
  if (!recTriggersMios_()) {
    dlgInfo_('Nada que quitar', 'Esta cuenta (' + yo + ') no tiene el envío instalado.' +
      (de && de !== yo ? '\n\nEstá instalado con ' + de + ': entra con esa cuenta y dale Quitar.' : ''), 'aviso');
    return;
  }
  var r = ui.alert('Quitar envio diario', 'Se deja de pedir la recoleccion sola. Seguro?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  var n = recQuitar_();
  dlgInfo_('Envío diario quitado', n + ' triggers apagados. Ya no se pide sola la recolección.', 'ok');
}
