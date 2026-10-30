/**
 * OdooSesion.gs - Odoo con TU sesion de Chrome (desde 30-oct-2026, la API de Odoo ya no sirve).
 *
 * La extension "Site Sheet - Cookie" (v1.1+) lee la cookie session_id de electronicsmexico.odoo.com cuando ya
 * entraste a Odoo en Chrome con tu correo y contraseña, y la manda al Web App (accion 'cookie_odoo') con la misma
 * clave que la del site. Aqui se prueba (get_session_info) y se guarda en Propiedades del script (ODOO_SESION).
 * odooExecute_ (Odoo.gs) usa esta sesion por JSON-RPC: todo lo que se hace en Odoo queda a tu nombre.
 * Opcional: con ODOO_LOGIN/ODOO_CLAVE (menu 🔑) entra solo cuando falta la sesion. Prefijo ods / ODS_.
 */
var ODS = {
  PROP_SES: 'ODOO_SESION',
  PROP_INFO: 'ODOO_SESION_INFO',
  URL_DEFECTO: 'https://electronicsmexico.odoo.com',
  ETAPA: 'ODOO_SESION'
};

function odsUrl_() {
  var u = '';
  try { u = PropertiesService.getScriptProperties().getProperty('ODOO_URL') || ''; } catch (e) {}
  return (u || ODS.URL_DEFECTO).replace(/\/+$/, '');
}

function odsSesion_() {
  try { return PropertiesService.getScriptProperties().getProperty(ODS.PROP_SES) || ''; } catch (e) { return ''; }
}

/** POST JSON-RPC a Odoo con la sesion. {codigo, j}. */
function odsPost_(ruta, params, ses) {
  try { contarFetch_(); } catch (e) {}
  var r = UrlFetchApp.fetch(odsUrl_() + ruta, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: false,
    headers: { 'Cookie': 'session_id=' + ses },
    payload: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: params || {}, id: Date.now() })
  });
  var j = null;
  try { j = JSON.parse(r.getContentText() || 'null'); } catch (e) {}
  return { codigo: r.getResponseCode(), j: j };
}

/** ¿La sesion sirve? {ok, uid, login, nombre}. */
function odsProbar_(ses) {
  var r = odsPost_('/web/session/get_session_info', {}, ses);
  var res = r.j && r.j.result;
  if (r.codigo === 200 && res && res.uid) return { ok: true, uid: res.uid, login: String(res.username || ''), nombre: String(res.name || res.partner_display_name || '') };
  return { ok: false, codigo: r.codigo, error: r.j && r.j.error ? String((r.j.error.data && r.j.error.data.name) || r.j.error.message || '') : '' };
}

function odsEsVencida_(err) {
  var n = String((err && err.data && err.data.name) || '') + ' ' + String((err && err.message) || '');
  return /SessionExpired|Session expired|session_expired/i.test(n);
}

/** Llamada a un metodo de un modelo (igual que execute_kw de la API), con tu sesion. */
function odsEjecutar_(modelo, metodo, args, kwargs, reintento) {
  var ses = odsSesion_();
  if (!ses && odsHayCreds_()) { var e0 = odsEntrar_(); if (e0.ok) ses = odsSesion_(); }   // sin sesion: entra solo con tu correo y contraseña guardados
  if (!ses) throw new Error('No hay sesion de Odoo: entra a Odoo en Chrome y la extension la manda sola (o guarda tu correo y contraseña en el menu).');
  var r = odsPost_('/web/dataset/call_kw/' + modelo + '/' + metodo, { model: modelo, method: metodo, args: args || [], kwargs: kwargs || {} }, ses);
  if (r.codigo === 429) throw new Error('Odoo HTTP 429 (demasiadas peticiones)');
  if (r.codigo !== 200 || !r.j) throw new Error('Odoo HTTP ' + r.codigo + ' en ' + modelo + '.' + metodo);
  if (r.j.error) {
    if (odsEsVencida_(r.j.error)) {
      try { PropertiesService.getScriptProperties().deleteProperty(ODS.PROP_SES); } catch (e) {}
      if (!reintento && odsHayCreds_()) { var e1 = odsEntrar_(); if (e1.ok) return odsEjecutar_(modelo, metodo, args, kwargs, true); }   // renueva sola y repite UNA vez
      try { avisoDia_('ods-vencida', 'WARN', ODS.ETAPA, 'La sesion de Odoo vencio: abre Odoo en Chrome para que la extension mande una nueva'); } catch (e) {}
      throw new Error('La sesion de Odoo vencio: abre Odoo en Chrome (la extension manda la nueva sola).');
    }
    var d = r.j.error.data || {};
    throw new Error('Odoo: ' + String(d.message || r.j.error.message || 'error').substring(0, 300));
  }
  return r.j.result;
}

/** Web App, accion 'cookie_odoo': recibe la sesion de la extension, la prueba y la guarda. */
function recibirCookieOdoo_(p) {
  var cache = CacheService.getScriptCache();
  if (Number(cache.get('EXT_FALLOS') || 0) >= EXT_MAX_FALLOS) return { ok: false, error: 'bloqueado_espera_10_min' };
  var clave = props_().getProperty(EXT_PROP_CLAVE);
  if (!clave) return { ok: false, error: 'sin_clave_genera_en_el_menu' };
  if (!igualesSeguro_(String(p.clave || ''), clave)) {
    var n = Number(cache.get('EXT_FALLOS') || 0) + 1;
    cache.put('EXT_FALLOS', String(n), EXT_BLOQUEO_SEG);
    logWarn_('EXTENSION', 'Clave incorrecta en sesion de Odoo (intento ' + n + ' de ' + EXT_MAX_FALLOS + ')'); flushLog_();
    return { ok: false, error: 'no_autorizado' };
  }
  cache.remove('EXT_FALLOS');
  var ses = String(p.cookie || '').replace(/^session_id\s*=\s*/i, '').trim();
  if (!/^[A-Za-z0-9._~+\/=%-]{20,400}$/.test(ses)) return { ok: false, error: 'cookie_invalida' };
  var pr = PropertiesService.getScriptProperties();
  if (ses === pr.getProperty(ODS.PROP_SES)) return { ok: true, igual: true };
  var t;
  try { t = odsProbar_(ses); } catch (e) { logWarn_(ODS.ETAPA, 'No pude probar la sesion de Odoo: ' + e.message); flushLog_(); return { ok: false, error: 'no_pude_verificar' }; }
  if (!t.ok) { avisoLogDia_('ODS_MALA', 'WARN', ODS.ETAPA, 'Sesion de Odoo recibida y NO guardada (no es valida: ' + (t.error || ('HTTP ' + t.codigo)) + ')'); flushLog_(); return { ok: false, error: 'sesion_no_valida' }; }
  pr.setProperty(ODS.PROP_SES, ses);
  pr.setProperty(ODS.PROP_INFO, JSON.stringify({ uid: t.uid, login: t.login, nombre: t.nombre, hora: new Date().toISOString() }));
  var ult = Number(pr.getProperty('ODS_ULTIMO_LOG') || 0);
  if (Date.now() - ult > 3600000) { logOk_(ODS.ETAPA, 'Sesion de Odoo recibida de ' + (t.nombre || t.login) + ' (' + t.login + ')'); flushLog_(); pr.setProperty('ODS_ULTIMO_LOG', String(Date.now())); }
  return { ok: true, usuario: t.login };
}

/* ---------------- entrar solo con correo y contraseña (opcional) ---------------- */

function odsHayCreds_() {
  try { var p = PropertiesService.getScriptProperties(); return !!(p.getProperty('ODOO_LOGIN') && p.getProperty('ODOO_CLAVE')); } catch (e) { return false; }
}

function odsDb_() {
  var d = '';
  try { d = PropertiesService.getScriptProperties().getProperty('ODOO_DB') || ''; } catch (e) {}
  return d || odsUrl_().replace(/^https?:\/\//, '').split('.')[0];
}

/** session_id de la cabecera Set-Cookie de una respuesta. */
function odsCookieDe_(r) {
  var h = {}; try { h = r.getAllHeaders() || {}; } catch (e) {}
  var sc = h['Set-Cookie'] || h['set-cookie'] || '';
  if (Array.isArray(sc)) sc = sc.join('\n');
  var m = /session_id=([^;,\s]+)/.exec(String(sc));
  return m ? m[1] : '';
}

/**
 * Entra a Odoo con ODOO_LOGIN y ODOO_CLAVE (Propiedades del script) y guarda la sesion.
 * Si falla, no insiste antes de 10 minutos (para no bloquear la cuenta). Nunca escribe la contraseña en el Log.
 */
function odsEntrar_() {
  var p = PropertiesService.getScriptProperties();
  var login = p.getProperty('ODOO_LOGIN'), clave = p.getProperty('ODOO_CLAVE');
  if (!login || !clave) return { ok: false, error: 'sin_credenciales' };
  var ult = Number(p.getProperty('ODS_ENTRAR_FALLO') || 0);
  if (ult && Date.now() - ult < 600000) return { ok: false, error: 'espera_10_min' };
  var motivo = '', ses = '';
  try {
    try { contarFetch_(); } catch (e) {}
    var r = UrlFetchApp.fetch(odsUrl_() + '/web/session/authenticate', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: false,
      payload: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { db: odsDb_(), login: login, password: clave }, id: Date.now() })
    });
    var j = null; try { j = JSON.parse(r.getContentText() || 'null'); } catch (e) {}
    var res = j && j.result;
    ses = odsCookieDe_(r);
    if (r.getResponseCode() === 200 && res && res.uid && ses && /^[A-Za-z0-9._~+\/=%-]{20,400}$/.test(ses)) {
      p.setProperty(ODS.PROP_SES, ses);
      p.setProperty(ODS.PROP_INFO, JSON.stringify({ uid: res.uid, login: String(res.username || login), nombre: String(res.name || ''), hora: new Date().toISOString(), via: 'correo' }));
      p.deleteProperty('ODS_ENTRAR_FALLO');
      logOk_(ODS.ETAPA, 'Entre a Odoo solo con el correo guardado (' + login + ')'); flushLog_();
      return { ok: true, usuario: login };
    }
    motivo = j && j.error ? String((j.error.data && j.error.data.message) || j.error.message || 'error') : (res && !res.uid ? 'correo o contraseña incorrectos, o Odoo pide verificacion en 2 pasos' : 'HTTP ' + r.getResponseCode());
  } catch (e) { motivo = e.message; }
  p.setProperty('ODS_ENTRAR_FALLO', String(Date.now()));
  try { avisoLogDia_('ODS_ENTRAR', 'WARN', ODS.ETAPA, 'No pude entrar a Odoo solo: ' + String(motivo).substring(0, 200)); flushLog_(); } catch (e) {}
  return { ok: false, error: 'login_fallo', motivo: motivo };
}

/** Menu: 🔑 Guardar correo y contraseña de Odoo. */
function uiOdooLogin() {
  var ui = SpreadsheetApp.getUi(), p = PropertiesService.getScriptProperties();
  var ok = ui.alert('Entrar a Odoo solo',
    'Site Sheet va a entrar a Odoo solo, con tu correo y contraseña, cuando no haya sesion o se venza. Funciona aunque Chrome este cerrado.\n\n' +
    'Con transparencia: la contraseña queda en las Propiedades del script (no en el codigo ni en el Log), pero es la de TU cuenta y cualquiera con acceso de edicion a este Apps Script podria leerla. Si Odoo pide verificacion en 2 pasos, no va a funcionar.\n\n' +
    'La extension sigue sirviendo igual como respaldo. ¿Continuamos?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  var u = ui.prompt('Correo de Odoo', 'El correo con el que entras a electronicsmexico.odoo.com', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK || !u.getResponseText().trim()) return;
  var c = ui.prompt('Contraseña de Odoo', 'Se ve mientras la escribes; nadie mas la ve. Se guarda solo en este script.', ui.ButtonSet.OK_CANCEL);
  if (c.getSelectedButton() !== ui.Button.OK || !c.getResponseText()) return;
  p.setProperty('ODOO_LOGIN', u.getResponseText().trim());
  p.setProperty('ODOO_CLAVE', c.getResponseText());
  p.deleteProperty('ODS_ENTRAR_FALLO');
  var r = odsEntrar_();
  if (r.ok) dlgInfo_('Odoo', 'Listo: entre a Odoo como ' + r.usuario + '.\n\nDesde ahora Site Sheet renueva la sesion solo.', 'ok');
  else {
    p.deleteProperty('ODOO_CLAVE'); p.deleteProperty('ODOO_LOGIN');
    dlgInfo_('Odoo', 'No pude entrar: ' + (r.motivo || r.error) + '.\n\nNo guarde nada. Revisa el correo y la contraseña, o sigue con la extension.', 'aviso');
  }
}

/** Menu: 🧹 Borrar correo y contraseña de Odoo. */
function uiOdooLoginBorrar() {
  var p = PropertiesService.getScriptProperties();
  p.deleteProperty('ODOO_LOGIN'); p.deleteProperty('ODOO_CLAVE'); p.deleteProperty('ODS_ENTRAR_FALLO');
  dlgInfo_('Odoo', 'Borre el correo y la contraseña de Odoo del script. La sesion actual sigue hasta que venza; la extension sigue funcionando.', 'ok');
}

/** Menu: 🔐 Estado de la sesión de Odoo. */
function odooEstadoSesion() {
  var ses = odsSesion_(), info = {};
  try { info = JSON.parse(PropertiesService.getScriptProperties().getProperty(ODS.PROP_INFO) || '{}'); } catch (e) {}
  if (!ses) { dlgInfo_('Sesion de Odoo', 'No hay sesion de Odoo guardada.\n\n• Abre Odoo en Chrome (ya entra solo con tu cuenta).\n• En la extension Site Sheet - Cookie da "Enviar ahora".', 'aviso'); return; }
  var t;
  try { t = odsProbar_(ses); } catch (e) { t = { ok: false, error: e.message }; }
  if (t.ok) { logOk_(ODS.ETAPA, 'Sesion de Odoo viva: ' + t.login); flushLog_(); dlgInfo_('Sesion de Odoo', 'Sesion viva.\n\n• Usuario: ' + (t.nombre || '') + ' (' + t.login + ')\n• Recibida: ' + (info.hora || '?') + '\n• Todo lo que Site Sheet haga en Odoo queda a este nombre.', 'ok'); }
  else { logWarn_(ODS.ETAPA, 'Sesion de Odoo no sirve: ' + (t.error || t.codigo)); flushLog_(); dlgInfo_('Sesion de Odoo', 'La sesion guardada ya no sirve (' + (t.error || ('HTTP ' + t.codigo)) + ').\n\n• Abre Odoo en Chrome y en la extension da "Enviar ahora".', 'aviso'); }
}
