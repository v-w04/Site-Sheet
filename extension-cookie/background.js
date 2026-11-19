// Site Sheet - Cookie (v1.3: manda la sesion de Odoo, cancela en el site lo pendiente y lee el estado de tus pedidos en Seller Center)
// Detecta la cookie "session" de electronicsmexico.site y la manda al Web App
// del Site Sheet (Apps Script). Apps Script la prueba antes de guardarla.

try { importScripts('autoguias.js'); } catch (e) { /* sin el modulo de guias, el resto de la extension sigue igual */ }

const SITE_URL = 'https://electronicsmexico.site/';
const COOKIE_NAME = 'session';
const MIN_ENTRE_ENVIOS_MIN = 15;   // el site puede rotar la cookie en cada visita
const REVISAR_CADA_MIN = 30;
const URL_OK = /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec$/;

const URL_DEFECTO = 'https://script.google.com/macros/s/AKfycbygod1WXxes7JWJS6_u02OPf3e-nJCxgSDN8VgSdam4cPcAI7CgP51-vk-UhP_zwkAR/exec';

let espera = null;
let esperaOdoo = null;

// ---- Odoo: la sesion de Chrome (ya entraste con tu correo y contraseña) ----
const ODOO_URL = 'https://electronicsmexico.odoo.com/';
const ODOO_COOKIE = 'session_id';

async function estadoOdoo(ok, texto) {
  await chrome.storage.local.set({ estadoOdoo: { ok, texto, hora: Date.now() } });
}

async function enviarOdoo(forzar) {
  const g = await chrome.storage.local.get(['url', 'clave', 'odooUltima', 'odooFallo', 'odooIntento', 'odooHora']);
  const url = g.url || URL_DEFECTO;
  if (!url || !g.clave || !URL_OK.test(url)) { await estadoOdoo(false, 'Falta configurar URL y clave (Opciones)'); return { ok: false, error: 'sin_config' }; }
  const c = await chrome.cookies.get({ url: ODOO_URL, name: ODOO_COOKIE });
  if (!c || !c.value) { await estadoOdoo(false, 'No hay sesion de Odoo: abre electronicsmexico.odoo.com'); return { ok: false, error: 'sin_sesion' }; }
  const huella = await sha256(c.value);
  if (!forzar) {
    // reenvia cada 3 h aunque sea la misma cookie: si el Sheet la perdio, se autocura
    if (g.odooUltima === huella && !g.odooFallo && g.odooHora && Date.now() - g.odooHora < 3 * 3600000) return { ok: true, igual: true };
    if (g.odooFallo && g.odooIntento && Date.now() - g.odooIntento < 120000) return { ok: false, error: 'espera_reintento' };
  }
  await chrome.storage.local.set({ odooIntento: Date.now() });
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: 'cookie_odoo', clave: g.clave, cookie: c.value }) });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch (e2) { await chrome.storage.local.set({ odooFallo: true }); await estadoOdoo(false, 'El Sheet no devolvio JSON (HTTP ' + r.status + '): publica Nueva version del Web App'); return { ok: false, error: 'no_json' }; }
    if (j.ok) { await chrome.storage.local.set({ odooUltima: huella, odooFallo: false, odooHora: Date.now() }); await estadoOdoo(true, j.igual ? 'Odoo al dia' : 'Sesion de Odoo enviada' + (j.usuario ? ' (' + j.usuario + ')' : '')); return j; }
    await chrome.storage.local.set({ odooFallo: true });
    await estadoOdoo(false, { no_autorizado: 'Clave incorrecta', sesion_no_valida: 'La sesion de Odoo no sirve: vuelve a entrar a Odoo' }[j.error] || ('El Sheet respondio: ' + j.error));
    return j;
  } catch (e) {
    await chrome.storage.local.set({ odooFallo: true });
    await estadoOdoo(false, 'No pude llegar al Sheet: ' + (e && e.message ? e.message : e));
    return { ok: false, error: 'red' };
  }
}

function badge(texto, color, titulo) {
  chrome.action.setBadgeText({ text: texto });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setTitle({ title: 'Site Sheet - Cookie: ' + titulo });
}

async function sha256(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function estado(ok, texto) {
  await chrome.storage.local.set({ estado: { ok, texto, hora: Date.now() } });
  if (ok) badge('OK', '#3fb950', texto);
  else badge('!', '#f85149', texto);
}

// forzar = ignora "ya la mande" y el tiempo minimo entre envios.
async function enviar(forzar) {
  const g = await chrome.storage.local.get(
    ['url', 'clave', 'ultima', 'ultimaHora', 'ultimoFallo', 'ultimoIntento']);
  const { clave, ultima, ultimaHora, ultimoFallo, ultimoIntento } = g;
  const url = g.url || URL_DEFECTO;

  if (!url || !clave || !URL_OK.test(url)) {
    await estado(false, 'Falta configurar URL y clave (Opciones)');
    return { ok: false, error: 'sin_config' };
  }

  const c = await chrome.cookies.get({ url: SITE_URL, name: COOKIE_NAME });
  if (!c || !c.value) {
    await estado(false, 'No hay sesion en el site: entra a electronicsmexico.site');
    return { ok: false, error: 'sin_sesion' };
  }

  const huella = await sha256(c.value);
  if (!forzar) {
    if (ultima === huella && !ultimoFallo) return { ok: true, igual: true };
    if (!ultimoFallo && ultimaHora && Date.now() - ultimaHora < MIN_ENTRE_ENVIOS_MIN * 60000) {
      return { ok: true, espera: true };
    }
    // Tras un fallo: reintentar como maximo cada 2 min (el site rota la cookie
    // casi en cada pagina y esto antes disparaba un envio cada 4 s).
    if (ultimoFallo && ultimoIntento && Date.now() - ultimoIntento < 120000) {
      return { ok: false, error: 'espera_reintento' };
    }
  }
  await chrome.storage.local.set({ ultimoIntento: Date.now() });

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: 'cookie', clave, cookie: c.value })
    });
    const txt = await r.text();
    let j;
    try { j = JSON.parse(txt); } catch (e2) {
      await chrome.storage.local.set({ ultimoFallo: true });
      const t = txt.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      await estado(false, 'El Sheet no devolvio JSON (HTTP ' + r.status + '). Publica Nueva version en Apps Script. Dijo: ' + t);
      return { ok: false, error: 'no_json' };
    }
    if (j.ok) {
      await chrome.storage.local.set({ ultima: huella, ultimaHora: Date.now(), ultimoFallo: false });
      await estado(true, j.igual ? 'Al dia (el Sheet ya tenia esta sesion)' : 'Cookie enviada al Sheet');
      return j;
    }
    await chrome.storage.local.set({ ultimoFallo: true });
    const msg = {
      no_autorizado: 'Clave incorrecta: copiala otra vez del menu del Sheet',
      sesion_no_valida: 'La sesion del site no sirve: vuelve a entrar al site',
      bloqueado_espera_10_min: 'Demasiados intentos: espera 10 minutos',
      sin_clave_genera_en_el_menu: 'El Sheet no tiene clave: generala en el menu'
    }[j.error] || ('El Sheet respondio: ' + j.error);
    await estado(false, msg);
    return j;
  } catch (e) {
    await chrome.storage.local.set({ ultimoFallo: true });
    await estado(false, 'No pude llegar al Sheet: ' + (e && e.message ? e.message : e) + ' (revisa que la URL termine en /exec)');
    return { ok: false, error: 'red' };
  }
}

function programar() {
  clearTimeout(espera);
  espera = setTimeout(() => enviar(false), 2500);
}

chrome.cookies.onChanged.addListener(({ cookie, removed }) => {
  if (!removed && cookie.name === ODOO_COOKIE && cookie.domain.replace(/^\./, '') === 'electronicsmexico.odoo.com') {
    clearTimeout(esperaOdoo); esperaOdoo = setTimeout(() => enviarOdoo(false), 2500); return;
  }
  if (removed || cookie.name !== COOKIE_NAME) return;
  if (cookie.domain.replace(/^\./, '') !== 'electronicsmexico.site') return;
  programar();
});


// ---- Cancelar en el site: con Chrome y una pestaña del site abiertos ----
const CANCELAR_CADA_MIN = 5;
let cancelando = false;
let ultimoCiclo = 0;

async function estadoCancel(ok, texto) {
  await chrome.storage.local.set({ estadoCancel: { ok, texto, hora: Date.now() } });
}

// Se ejecuta DENTRO de la pestaña del site (usa su sesion). Sin variables de fuera.
async function enSitioRevisar() {
  try {
    const r = await fetch('/ventas-general-data?por_pag=1&page=1&canal=WL', { credentials: 'include' });
    if (!r.ok || r.redirected) return { ok: false, http: r.status };
    await r.json();
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

async function enSitioCancelar(orden, pin) {
  try {
    const qs = 'por_pag=20&page=1&canal=WL&q=' + encodeURIComponent(orden) +
      '&solo_falta=&paqueteria=&envio=&tipo=&desde=&hasta=&envio_est=&cancel=&estado=&cant=';
    const r = await fetch('/ventas-general-data?' + qs, { credentials: 'include' });
    if (!r.ok || r.redirected) return { orden, sesion: true, http: r.status };
    let j; try { j = await r.json(); } catch (e) { return { orden, sesion: true }; }
    let arr = Array.isArray(j) ? j : (j && Array.isArray(j.ventas) ? j.ventas : []);   // el site trae las ventas en j.ventas (antes se tomaba el arreglo mas largo: a veces era 'envios' y no la encontraba)
    if (!arr.length && j && typeof j === 'object') {
      const ver = v => { if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && v.length > arr.length) arr = v; };
      Object.keys(j).forEach(k => { ver(j[k]); if (j[k] && typeof j[k] === 'object' && !Array.isArray(j[k])) Object.keys(j[k]).forEach(k2 => ver(j[k][k2])); });
    }
    const buscar = a => a.find(o => [o.folio, o.orden_id, o.referencia].map(String).includes(orden)) ||
                        a.find(o => JSON.stringify(o).includes(orden));
    let fila = buscar(arr);
    // Respaldo: si la busqueda q= no la trae (el site puede buscar solo por otros campos), se revisan las ventas recientes sin q
    for (let pg = 1; !fila && pg <= 4; pg++) {
      try {
        const r2 = await fetch('/ventas-general-data?por_pag=100&page=' + pg + '&canal=WL', { credentials: 'include' });
        if (!r2.ok || r2.redirected) break;
        const j2 = await r2.json(); let a2 = Array.isArray(j2) ? j2 : (j2 && Array.isArray(j2.ventas) ? j2.ventas : []);
        if (!a2.length && j2 && typeof j2 === 'object') Object.keys(j2).forEach(k => { if (Array.isArray(j2[k]) && j2[k].length > a2.length) a2 = j2[k]; });
        if (!a2.length) break;
        fila = buscar(a2);
      } catch (e) { break; }
    }
    if (!fila) return { orden, noEncontrada: true };
    const odooId = Number(fila.odoo_id);
    if (!odooId) return { orden, ok: false, error: 'El site no trae el numero de Odoo de esta venta' };
    const c = await fetch('/ventas-general/cancelar', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ odoo_id: odooId, canal: 'WL', orden_id: String(fila.orden_id || orden), motivo: 'cliente', nota: '', pin: pin, confirmo: true })
    });
    const t = await c.text(); let d = {}; try { d = JSON.parse(t); } catch (e) {}
    if (c.status === 401 || (c.redirected && !d.razon)) return { orden, sesion: true, http: c.status };
    return { orden, ok: c.ok && d.ok !== false, aviso: d.aviso || '', avisoCanal: d.aviso_canal || '', razon: d.razon || '', error: d.error || (c.ok ? '' : t.replace(/<[^>]*>/g, ' ').slice(0, 150)), http: c.status };
  } catch (e) { return { orden, ok: false, error: String(e && e.message || e) }; }
}

async function enPestana(tabId, func, args) {
  const r = await chrome.scripting.executeScript({ target: { tabId }, func, args: args || [] });
  return r && r[0] ? r[0].result : null;
}

async function llamarSheet(url, cuerpo) {
  // Tope de 90 s: un Web App ocupado no debe dejar la extension colgada para siempre (nada se compra si no hay lista)
  const ac = (typeof AbortController === 'function') ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), 90000) : null;
  try {
    const r = await fetch(url, Object.assign({ method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) }, ac ? { signal: ac.signal } : {}));
    const txt = await r.text();
    try { return JSON.parse(txt); } catch (e) { return { ok: false, error: 'no_json' }; }
  } catch (e) {
    return { ok: false, error: (e && e.name === 'AbortError') ? 'sin_respuesta_90s' : 'red: ' + String((e && e.message) || e).slice(0, 60) };
  } finally { if (tm) clearTimeout(tm); }
}

async function cancelarCiclo(forzar) {
  if (cancelando) return { ok: false, error: 'ocupado' };
  if (!forzar && Date.now() - ultimoCiclo < 60000) return { ok: true, espera: true };
  cancelando = true; ultimoCiclo = Date.now();
  try {
    const g = await chrome.storage.local.get(['url', 'clave']);
    const url = g.url || URL_DEFECTO;
    if (!url || !g.clave || !URL_OK.test(url)) { await estadoCancel(false, 'Falta configurar URL y clave (Opciones)'); return { ok: false, error: 'sin_config' }; }
    let tabs = await chrome.tabs.query({ url: SITE_URL + '*' });
    if (!tabs.length) {
      // Sin pestana del site (p. ej. al despertar la PC): abre una en segundo plano y espera a que cargue
      try {
        const t = await chrome.tabs.create({ url: SITE_URL, active: false });
        for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 1000)); const x = await chrome.tabs.get(t.id); if (x.status === 'complete') break; }
        tabs = [await chrome.tabs.get(t.id)];
      } catch (e) { await estadoCancel(true, 'No pude abrir el site: abre electronicsmexico.site'); return { ok: true, sinSite: true }; }
    }
    const tabId = tabs[0].id;
    const sesion = await enPestana(tabId, enSitioRevisar);
    if (!sesion || !sesion.ok) { await estadoCancel(false, 'El site no tiene sesion: entra al site (pestaña abierta)'); return { ok: false, error: 'sin_sesion' }; }
    const p = await llamarSheet(url, { accion: 'cancel_pendientes', clave: g.clave });
    if (!p.ok) {
      await estadoCancel(false, { no_autorizado: 'Clave incorrecta', sin_pin: 'Falta guardar el PIN en el Sheet (menu Cancelaciones)', pin_rechazado_guarda_otro: 'El site rechazo el PIN: guarda el correcto en el Sheet', no_json: 'Publica Nueva version del Web App' }[p.error] || ('El Sheet respondio: ' + p.error));
      return p;
    }
    const ordenes = p.ordenes || [];
    if (!ordenes.length) { await estadoCancel(true, 'Sin cancelaciones pendientes'); return { ok: true, n: 0 }; }
    let hechas = 0, fallas = 0, seguidas = 0, motivo = '';
    for (const o of ordenes) {
      const res = await enPestana(tabId, enSitioCancelar, [o, p.pin]);
      if (!res || res.sesion) { motivo = 'El site perdio la sesion: entra de nuevo'; break; }
      await llamarSheet(url, { accion: 'cancel_resultado', clave: g.clave, orden: o, ok: !!res.ok, aviso: res.aviso || '', avisoCanal: res.avisoCanal || '', razon: res.razon || '', error: res.error || '', http: res.http || 0, noEncontrada: !!res.noEncontrada });
      if (res.ok) { hechas++; seguidas = 0; }
      else if (/ya\s+(est[aá]\s+)?cancelad/i.test(String(res.error || ''))) { hechas++; seguidas = 0; }   // el site avisa que ya estaba cancelada en Odoo: es exito, no error
      else { fallas++; if (res.razon === 'pin_malo') { motivo = 'El site rechazo el PIN: guardalo bien en el Sheet'; break; } if (!res.noEncontrada && ++seguidas >= 2) { motivo = 'Dos errores seguidos: me detengo'; break; } }
      await new Promise(r => setTimeout(r, 1500));
    }
    p.pin = '';
    await estadoCancel(!motivo && !fallas, hechas + ' cancelada(s) en el site' + (fallas ? ', ' + fallas + ' con problema (ver Log del Sheet)' : '') + (motivo ? '. ' + motivo : ''));
    return { ok: !motivo, hechas, fallas };
  } catch (e) {
    await estadoCancel(false, 'No pude cancelar: ' + (e && e.message ? e.message : e));
    return { ok: false, error: 'red' };
  } finally { cancelando = false; }
}

chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (info.status === 'complete' && tab && tab.url && tab.url.startsWith(SITE_URL)) cancelarCiclo(false);
});

// ---- Seller Center (v1.3): lee con TU sesion (la que ya iniciaste, con tu codigo 2FA) la lista de pedidos y la manda al Sheet ----
// Solo LEE. No toca nada de Walmart. No manda nombres de clientes (esa columna se descarta).
const SC_URL = 'https://seller.walmart.com/';
const SC_LISTAS = [['Unshipped', 'orderGroups=Unshipped'], ['Canceled', 'orderGroups=Canceled'], ['All', 'orderGroups=All']];
const SC_CADA_MIN = 30;
const SC_MAX_BUSCAR = 15;
let scOcupado = false;
let scUltimoCiclo = 0;

async function estadoSC(ok, texto, enCurso) {
  await chrome.storage.local.set({ estadoSC: { ok, texto, hora: Date.now(), enCurso: !!enCurso } });
}

// Se ejecuta DENTRO de la pestaña de Seller Center (usa su sesion). Sin variables de fuera.
async function enSellerLeer(esperaMs, marca) {
  const t0 = Date.now();
  const esp = ms => new Promise(r => setTimeout(r, ms));
  let ultimo = null;
  while (Date.now() - t0 < esperaMs) {
    if (!location.hostname) return { pendiente: true };   // la pestaña aun no abre la pagina
    if (location.hostname !== 'seller.walmart.com' || !/^\/orders/.test(location.pathname)) return { sesion: false, destino: location.hostname + location.pathname };
    if (marca && location.href.indexOf(marca) < 0) return { pendiente: true };   // sigue en la pagina anterior
    const enc = [...document.querySelectorAll('table th')].map(x => (x.innerText || '').trim());
    const trs = [...document.querySelectorAll('table tbody tr')];
    const filas = trs.map(tr => [...tr.querySelectorAll('td')].map(td => (td.innerText || '').replace(/\s+/g, ' ').trim())).filter(c => c.some(x => /\d{9,}/.test(x)));
    const vacio = /No se encontraron pedidos/i.test(document.body.innerText || '');
    if (enc.length && filas.length) { ultimo = { sesion: true, enc, filas }; if (filas.length === trs.length) return ultimo; }
    if (enc.length && vacio && Date.now() - t0 > 3000) return { sesion: true, enc, filas: [] };
    await esp(500);
  }
  return ultimo || { sesion: true, timeout: true };
}

// Buzon: lee SOLO el total del paginador ("1-25 de N"). No abre ni lee mensajes. Corre DENTRO de la pagina.
async function enSellerBuzon(esperaMs, marca) {
  const t0 = Date.now();
  const esp = ms => new Promise(r => setTimeout(r, ms));
  let prev = null, iguales = 0;
  while (Date.now() - t0 < esperaMs) {
    if (!location.hostname) return { pendiente: true };
    if (location.hostname !== 'seller.walmart.com') return { sesion: false, destino: location.hostname + location.pathname };
    if (!/^\/seller-communication/.test(location.pathname) || (marca && location.href.indexOf(marca) < 0)) { await esp(500); continue; }   // sigue en la pagina anterior
    const txt = (document.body && document.body.innerText) || '';
    let n = null;
    const m = /(\d[\d,]*)\s*-\s*(\d[\d,]*)\s+(?:of|de)\s+(\d[\d,]*)/i.exec(txt);
    if (m) n = Number(m[3].replace(/,/g, ''));
    else if (/\b0\s+(?:of|de)\s+0\b/i.test(txt) || /no (messages|results)|sin mensajes|no hay mensajes/i.test(txt)) n = 0;
    // Solo la ultima semana: la fecha de cada mensaje sale en su propia linea ("Hoy", "Ayer" o MM/DD/AAAA). No se lee nada mas del mensaje.
    let rec = 0, fechas = 0, ultimaDentro = true;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    txt.split('\n').forEach(l => {
      l = l.trim();
      let dias = null;
      if (/^(hoy|today)$/i.test(l)) dias = 0;
      else if (/^(ayer|yesterday)$/i.test(l)) dias = 1;
      else { const f = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(l); if (f) dias = Math.round((hoy - new Date(Number(f[3]), Number(f[1]) - 1, Number(f[2]))) / 86400000); }
      if (dias === null) return;
      fechas++;
      if (dias <= 7) rec++; else ultimaDentro = false;
    });
    const clave = n === null ? null : n + '/' + rec + '/' + fechas;
    if (n !== null) { if (clave === prev) iguales++; else { prev = clave; iguales = 1; } if (iguales >= 2 && Date.now() - t0 > 2500) return { sesion: true, total: n, recientes: rec, fechas: fechas, todasRecientes: ultimaDentro }; }
    else { prev = null; iguales = 0; }
    await esp(700);
  }
  return { sesion: true, timeout: true };
}

// Casos: devuelve el texto de la lista "Sus casos" (la tabla). Corre DENTRO de la pagina.
async function enSellerCasos(esperaMs, marca) {
  const t0 = Date.now();
  const esp = ms => new Promise(r => setTimeout(r, ms));
  let largo = -1, iguales = 0;
  while (Date.now() - t0 < esperaMs) {
    if (!location.hostname) return { pendiente: true };
    if (location.hostname !== 'seller.walmart.com') return { sesion: false, destino: location.hostname + location.pathname };
    if (!/^\/supporthub/.test(location.pathname) || (marca && location.href.indexOf(marca) < 0)) { await esp(500); continue; }
    const txt = (document.body && document.body.innerText) || '';
    const tabla = /Propietario|Owner/i.test(txt);
    const hay = tabla && /\n\s*\d{6,10}[\t ]*\n/.test(txt);
    const vacio = tabla && /no se encontraron|no hay casos|no cases|no results/i.test(txt);
    if (hay || vacio) { if (txt.length === largo) iguales++; else { largo = txt.length; iguales = 1; } if (iguales >= 2 && Date.now() - t0 > 2500) return { sesion: true, texto: txt.slice(0, 30000) }; }
    else { largo = -1; iguales = 0; }
    await esp(700);
  }
  return { sesion: true, timeout: true };
}

// ---- piezas puras (se prueban sin Chrome) ----
function scNormTxt(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}
// 'MM/DD/AAAA' (asi lo muestra Seller Center) -> 'AAAA-MM-DD'; '' si no es fecha
function scFechaIso(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim());
  if (!m) return '';
  const mes = Number(m[1]), dia = Number(m[2]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return '';
  return m[3] + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
}
function scTotal(s) {
  const n = parseFloat(String(s || '').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? '' : n;
}
// Encabezados + celdas -> filas {pedido, orden, fecha, envio, total, estado}. null si la pagina cambio de forma (faltan columnas clave).
function scFilas(enc, celdas) {
  const n = (enc || []).map(scNormTxt);
  const buscar = re => n.findIndex(x => re.test(x));
  const c = { orden: buscar(/numerodeordendecompra/), pedido: buscar(/^numerodepedido/), fecha: buscar(/^fechadelpedido/), envio: buscar(/^fechaestimadadeenvio/), total: buscar(/^totaldelpedido/), estado: buscar(/^estado$/) };
  if (c.orden < 0 || c.pedido < 0 || c.estado < 0) return null;
  const dato = (fila, i) => (i >= 0 && i < fila.length ? fila[i] : '');
  return (celdas || []).map(f => ({
    pedido: dato(f, c.pedido).replace(/\s+/g, ''), orden: dato(f, c.orden).replace(/\s+/g, ''), fecha: scFechaIso(dato(f, c.fecha)), envio: scFechaIso(dato(f, c.envio)),
    total: scTotal(dato(f, c.total)), estado: dato(f, c.estado).replace(/^(.+?)\s+\1$/, '$1')   // Seller Center repite la palabra: 'Enviado Enviado' -> 'Enviado'
  })).filter(x => /^\d{9,20}$/.test(x.pedido));
}

// "12 nov 2026" -> '2026-11-12'; '' si no es fecha
const SC_MESES = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
function scFechaCaso(dia, mes, anio) {
  const m = SC_MESES[scNormTxt(mes).slice(0, 3)], d = Number(dia);
  if (!m || !(d >= 1 && d <= 31) || !/^\d{4}$/.test(String(anio))) return '';
  return anio + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
// Texto de "Sus casos" -> [{folio, fecha, asunto, estado}]. Cada fila: "12 nov 2026\t\n17061348\n\tAsunto\tEstado\tPropietario". El propietario se descarta.
function scCasosDeTexto(texto) {
  const re = /(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]{3,5})\.?\s+(\d{4})[\t ]*\n\s*(\d{6,10})[\t ]*\n[\t ]*([^\t\n]+)\t([^\t\n]+)/g;
  const out = [], vistos = {};
  let m;
  while ((m = re.exec(String(texto || ''))) !== null) {
    if (vistos[m[4]]) continue;
    vistos[m[4]] = true;
    out.push({ folio: m[4], fecha: scFechaCaso(m[1], m[2], m[3]), asunto: m[5].replace(/\s+/g, ' ').trim().slice(0, 80), estado: m[6].replace(/\s+/g, ' ').trim().slice(0, 40) });
    if (out.length >= 200) break;
  }
  return out;
}

function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }
function conTope(promesa, ms) { return Promise.race([promesa, new Promise((_, rej) => setTimeout(() => rej(new Error('tiempo agotado')), ms))]); }

function esperarCarga(tabId, ms) {
  return new Promise(res => {
    const fin = () => { clearTimeout(t); chrome.tabs.onUpdated.removeListener(l); res(); };
    const l = (id, info) => { if (id === tabId && info.status === 'complete') fin(); };
    const t = setTimeout(fin, ms);
    chrome.tabs.onUpdated.addListener(l);
  });
}

// Abre la URL en la pestaña de trabajo y devuelve lo que se ve en la tabla. Reintenta si la pestaña aun no carga; nunca se queda colgada.
async function scLeerUrl(tabId, url, marca) {
  await chrome.tabs.update(tabId, { url });
  await esperarCarga(tabId, 20000);
  let r = null, err = null;
  for (let i = 0; i < 8; i++) {
    try { r = await conTope(enPestana(tabId, enSellerLeer, [20000, marca]), 40000); err = null; } catch (e) { r = null; err = e; }
    if (r && !r.pendiente) break;
    await esperar(1500);
  }
  if (!r || r.pendiente) throw new Error(err ? (err.message || String(err)) : 'la pagina de pedidos no cargo');
  if (r.filas) { const f = scFilas(r.enc, r.filas); if (f === null) return { sesion: true, cambio: true }; return { sesion: true, filas: f }; }
  return r;
}

// Abre una URL de Seller Center en la pestaña de trabajo y corre func dentro. Reintenta si la pestaña aun no carga; nunca se queda colgada.
async function scLeerOtra(tabId, url, func, args) {
  await chrome.tabs.update(tabId, { url });
  await esperarCarga(tabId, 20000);
  let r = null, err = null;
  for (let i = 0; i < 8; i++) {
    try { r = await conTope(enPestana(tabId, func, args), 45000); err = null; } catch (e) { r = null; err = e; }
    if (r && !r.pendiente) break;
    await esperar(1500);
  }
  if (!r || r.pendiente) throw new Error(err ? (err.message || String(err)) : 'la pagina no cargo');
  return r;
}

// Los dos numeros del buzon (sin leer / por responder), SOLO de los ultimos 7 dias. null = no se pudo leer ese numero.
// La lista viene de la mas nueva a la mas vieja: se pasa de pagina (25 por pagina) solo mientras toda la pagina sea de la ultima semana.
async function scBuzon(tabId) {
  const leer = async (q, marca) => {
    let suma = 0;
    for (let ini = 1, pag = 0; pag < 8; pag++, ini += 25) {
      const r = await scLeerOtra(tabId, SC_URL + 'seller-communication/Customer?' + q + '&start=' + ini, enSellerBuzon, [20000, marca]);
      if (!(r && r.sesion && typeof r.total === 'number')) return null;
      if (r.total > 0 && r.fechas === 0) return null;   // no se encontraron fechas: mejor no dar un numero falso
      suma += r.recientes || 0;
      if (!(r.todasRecientes && r.total > ini + 24)) break;
      await esperar(800);
    }
    return suma;
  };
  const sinLeer = await leer('status=UNREAD', 'status=UNREAD');
  await esperar(1000);
  const porResponder = await leer('tags=Response+Needed', 'tags=Response');
  return { sinLeer, porResponder };
}

// Casos de los ultimos 30 dias que muestra Seller Center ([] si no se pudo leer).
async function scCasos(tabId) {
  const r = await scLeerOtra(tabId, SC_URL + 'supporthub/your-cases?dateRange=last30days', enSellerCasos, [25000, 'your-cases']);
  return (r && r.sesion && r.texto) ? scCasosDeTexto(r.texto) : [];
}

async function scMandar(url, clave, grupo, filas) {
  if (!filas.length) return { ok: true, recibidas: 0 };
  return llamarSheet(url, { accion: 'seller_pedidos', clave, grupo, filas });
}

let scDesde = 0;
async function scCiclo(forzar) {
  if (scOcupado && Date.now() - scDesde > 4 * 60000) scOcupado = false;   // una lectura que se colgo no bloquea para siempre
  if (scOcupado) {
    if (forzar) await estadoSC(true, 'Ya esta leyendo desde las ' + new Date(scDesde).toLocaleTimeString('es-MX') + ': espera a que termine', true);
    return { ok: false, error: 'ocupado' };
  }
  if (!forzar && Date.now() - scUltimoCiclo < 5 * 60000) return { ok: true, espera: true };
  scOcupado = true; scUltimoCiclo = Date.now(); scDesde = Date.now();
  const vivo = setInterval(() => { try { chrome.runtime.getPlatformInfo().catch(() => {}); } catch (e) {} }, 20000);   // mantiene despierto el servicio mientras lee
  let tabId = null;
  try {
    const g = await chrome.storage.local.get(['url', 'clave']);
    const url = g.url || URL_DEFECTO;
    if (!url || !g.clave || !URL_OK.test(url)) { await estadoSC(false, 'Falta configurar URL y clave (Opciones)'); return { ok: false, error: 'sin_config' }; }
    await estadoSC(true, 'Leyendo Seller Center...', true);
    const t = await chrome.tabs.create({ url: 'about:blank', active: false });
    tabId = t.id;
    let leidos = 0, nuevas = 0, cambios = 0, falla = '';
    const mandar = async (grupo, filas) => {
      const j = await scMandar(url, g.clave, grupo, filas);
      if (!j || !j.ok) { falla = { no_autorizado: 'Clave incorrecta', no_json: 'Publica Nueva version del Web App', bloqueado_espera_10_min: 'Demasiados intentos: espera 10 minutos' }[j && j.error] || ('El Sheet respondio: ' + (j && j.error)); return false; }
      leidos += filas.length; nuevas += j.nuevas || 0; cambios += j.cambios || 0; return true;
    };
    for (const [grupo, qs] of SC_LISTAS) {
      await estadoSC(true, 'Leyendo pedidos (' + grupo + ')...', true);
      const r = await scLeerUrl(tabId, SC_URL + 'orders/manage-orders?' + qs + '&fulfilmentType=Seller&limit=200', 'orderGroups=' + grupo);
      if (r.sesion === false) { await estadoSC(false, 'Seller Center sin sesion (' + (r.destino || 'otra pagina') + '): entra a seller.walmart.com con tu codigo 2FA'); return { ok: false, error: 'sin_sesion' }; }
      if (r.cambio) { await estadoSC(false, 'Seller Center cambio su pagina de pedidos: avisa para ajustar la extension'); return { ok: false, error: 'pagina_distinta' }; }
      if (r.timeout) { await estadoSC(false, 'Seller Center no mostro la tabla (¿pide el codigo 2FA?): entra y vuelve a intentar'); return { ok: false, error: 'sin_tabla' }; }
      await estadoSC(true, 'Enviando ' + r.filas.length + ' pedidos (' + grupo + ') al Sheet...', true);
      if (!(await mandar(grupo, r.filas))) { await estadoSC(false, falla); return { ok: false, error: 'sheet' }; }
      await esperar(1500);
    }
    // pedidos que el Sheet quiere ver uno por uno (los de "Pedidos en riesgo" sin resolver)
    const p = await llamarSheet(url, { accion: 'seller_pendientes', clave: g.clave });
    let buscados = 0;
    if (p && p.ok && Array.isArray(p.pedidos)) {
      const lote = [], lista = p.pedidos.filter(x => /^\d{9,20}$/.test(String(x))).slice(0, SC_MAX_BUSCAR);
      for (const ped of lista) {
        await estadoSC(true, 'Buscando pedido ' + (buscados + 1) + ' de ' + lista.length + '...', true);
        const r = await scLeerUrl(tabId, SC_URL + 'orders/manage-orders?orderNumber=' + encodeURIComponent(ped) + '&orderGroups=All&fulfilmentType=Seller', 'orderNumber=' + ped);
        if (r.filas) { lote.push(...r.filas.filter(x => x.pedido === String(ped))); buscados++; }
        await esperar(1500);
      }
      if (lote.length && !(await mandar('Busqueda', lote))) { await estadoSC(false, falla); return { ok: false, error: 'sheet' }; }
    }
    // Buzon (solo dos numeros) y casos: extras. Si fallan NO tumban la lectura de pedidos.
    let extra = '';
    try {
      await estadoSC(true, 'Leyendo el buzon...', true);
      const b = await scBuzon(tabId);
      if (b.sinLeer !== null || b.porResponder !== null) {
        const j = await llamarSheet(url, { accion: 'seller_buzon', clave: g.clave, sinLeer: b.sinLeer, porResponder: b.porResponder });
        if (j && j.ok) extra += ', buzon: ' + (b.sinLeer === null ? '?' : b.sinLeer) + ' sin leer'; else if (j && j.error === 'sesion_invalida') extra += ' (buzon no enviado: Publica Nueva version del Web App)';
      }
    } catch (e3) { extra += ' (buzon no leido)'; }
    try {
      await estadoSC(true, 'Leyendo tus casos...', true);
      const cs = await scCasos(tabId);
      if (cs.length) {
        const j = await llamarSheet(url, { accion: 'seller_casos', clave: g.clave, filas: cs });
        if (j && j.ok) extra += ', ' + cs.length + ' casos'; else if (j && j.error === 'sesion_invalida') extra += ' (casos no enviados: Publica Nueva version del Web App)';
      }
    } catch (e4) { extra += ' (casos no leidos)'; }
    await estadoSC(true, leidos + ' pedidos leidos' + (buscados ? ' (+' + buscados + ' buscados)' : '') + (cambios ? ', ' + cambios + ' cambio(s) de estado' : '') + extra);
    return { ok: true, leidos, nuevas, cambios };
  } catch (e) {
    await estadoSC(false, 'No pude leer Seller Center: ' + (e && e.message ? e.message : e));
    return { ok: false, error: 'red' };
  } finally {
    clearInterval(vivo);
    if (tabId !== null) { try { await chrome.tabs.remove(tabId); } catch (e2) {} }
    scOcupado = false;
  }
}

// Al entrar a Seller Center (ya con tu sesion y tu 2FA) lee de inmediato, sin esperar la alarma
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (info.status === 'complete' && tab && tab.url && tab.url.startsWith(SC_URL) && !scOcupado) scCiclo(false);
});


// Auto-actualizacion: al subir una version nueva a la carpeta de la extension (manifest.json con otro "version"),
// la extension se recarga SOLA en cuanto no este ocupada. Sin entrar a chrome://extensions ni dar Recargar.
async function revisarActualizacion() {
  try {
    if (scOcupado || cancelando) return false;
    const r = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
    const disco = (await r.json()).version;
    const actual = chrome.runtime.getManifest().version;
    if (!disco || disco === actual) return false;
    const { recargadoPara } = await chrome.storage.local.get('recargadoPara');
    if (recargadoPara === disco) return false;            // ya lo intente para esa version: no hacer ciclo
    await chrome.storage.local.set({ recargadoPara: disco });
    chrome.runtime.reload();
    return true;
  } catch (e) { return false; }
}


// ---- Guias automaticas (v1.5): compra guias y marca enviado en la pagina /walmart/guias, con SUS candados ----
// APAGADO por defecto. Primero "Probar guias ahora" (no compra nada). Solo en modo REAL despues de una prueba sin error.
// NUNCA cancela nada en Walmart. Ver autoguias.js y apps-script/GuiasAuto.gs.
const GA_URL = SITE_URL + 'walmart/guias';
const GA_CADA_MIN = 15;   // horarios FIJOS: :00, :15, :30 y :45. Un pedido sale en la primera vuelta despues de cumplir sus 30 min; una compra rechazada se reintenta en la siguiente vuelta.
function gaSiguienteHora() { const d = new Date(); d.setSeconds(0, 0); d.setMinutes((Math.floor(d.getMinutes() / 15) + 1) * 15); return d.getTime(); }
const GA_HORA_INI = 7, GA_HORA_FIN = 22;   // solo de dia (hora de tu PC)
// Cajas que el usuario dicto (L x W x H x KG) para SKU sin medidas en Odoo. Solo se usan si Odoo no tiene la medida, el pedido es de 1 pieza y la caja no se tecleo ya en la pagina (lo tecleado manda).
// Caja por MARCA (prefijo del SKU): los productos de esa marca nunca traen medidas en Odoo. Vale para cualquier pedido de esa marca.
const GA_CAJAS_PREFIJO = { 'OWA-': { L: 20, W: 20, H: 20, KG: 1 } };
const GA_CAJAS_BASE = {
  'OWA-FREESIPDESERT32OZ-CAF-4735': { L: 20, W: 20, H: 20, KG: 1 },
  'OWA-FREESIPSWAYRAVENCLAW30OZ-AZU-6036': { L: 20, W: 20, H: 20, KG: 1 },
  'OWA-FREESIPSWAYRAVENCLAW30OZ-AZU-6036-MSI': { L: 20, W: 20, H: 20, KG: 1 },
  'OWA-FREESIPHAZARD30OZ-BLA-6174': { L: 20, W: 20, H: 20, KG: 1 },
  'SHO-SHOKZS821-NEG-9639-MSI': { L: 20, W: 20, H: 20, KG: 1 },
  'HP-16BY0299NR-PLA-9645-MSI': { L: 40, W: 20, H: 10, KG: 1 },
  'JBL-SB580BLKAM-NEG-9203-MSI': { L: 40, W: 30, H: 20, KG: 2 },
  'JBL-SB580BLKAM-NEG-9203': { L: 40, W: 30, H: 20, KG: 2 }
};
let gaOcupado = false, gaDesde = 0;

async function estadoGA(ok, texto, enCurso) {
  await chrome.storage.local.set({ estadoGA: { ok, texto, hora: Date.now(), enCurso: !!enCurso } });
}

// Si una corrida automatica no puede ni abrir Guias, el Log del Sheet debe enterarse (maximo 1 aviso cada 30 min por motivo).
async function gaAvisarSalida(url, clave, motivo, texto) {
  try {
    const k = 'gaAviso_' + motivo, x = await chrome.storage.local.get([k]);
    if (x[k] && Date.now() - x[k] < 30 * 60000) return;
    await chrome.storage.local.set({ [k]: Date.now() });
    await llamarSheet(url, { accion: 'guias_reporte', clave, corrida: { modo: 'real', comprados: [], saltados: {}, sinMedidas: [], canceladasSinFila: [], fallos: [], resultados: { ok: 0, pend: 0, mal: 0 }, error: String(texto || motivo).slice(0, 180) } });
  } catch (e) {}
}

async function gaCiclo(forzar, soloPrueba, manualReal) {
  if (gaOcupado && Date.now() - gaDesde > 20 * 60000) gaOcupado = false;   // una corrida colgada no bloquea para siempre
  if (gaOcupado) return { ok: false, error: 'ocupado' };
  const g = await chrome.storage.local.get(['url', 'clave', 'gaActivo', 'gaModo', 'gaPruebaOk', 'gaIntentadas', 'gaFallos', 'gaVistas', 'gaCajas']);
  if (!forzar) {
    if (!g.gaActivo) return { ok: true, apagado: true };
    const h = new Date().getHours();
    if (h < GA_HORA_INI || h >= GA_HORA_FIN) return { ok: true, fueraDeHora: true };
  }
  // "Comprar ahora": solo si ya activaste las guias automaticas en modo REAL y hubo una PRUEBA sin error (mismas condiciones que la corrida de cada hora).
  if (manualReal && !(g.gaActivo && g.gaModo === 'real' && g.gaPruebaOk)) {
    await estadoGA(false, 'Para comprar ahora: en Opciones activa las guias automaticas en modo REAL y haz antes una prueba sin error.');
    return { ok: false, error: 'no_activado_en_real' };
  }
  gaOcupado = true; gaDesde = Date.now();
  const vivo = setInterval(() => { try { chrome.runtime.getPlatformInfo().catch(() => {}); } catch (e) {} }, 20000);
  let tabId = null;
  try {
    const url = g.url || URL_DEFECTO;
    if (!url || !g.clave || !URL_OK.test(url)) { await estadoGA(false, 'Falta configurar URL y clave (Opciones)'); return { ok: false, error: 'sin_config' }; }
    let modo = (!soloPrueba && g.gaModo === 'real') ? 'real' : 'prueba', aviso = '';
    if (modo === 'real' && !g.gaPruebaOk) { modo = 'prueba'; aviso = ' (falta una PRUEBA sin error antes de comprar de verdad)'; }
    await estadoGA(true, 'Pidiendo al Sheet la lista de pedidos que NO se envian...', true);
    const lista = await llamarSheet(url, { accion: 'guias_lista', clave: g.clave });
    if (lista && lista.ok) await aplicarAlertas(lista.alertas);
    if (!lista || !lista.ok) {
      await aplicarAlertas(['El Sheet no responde o no dio la lista de guias (' + ((lista && lista.error) || 'sin respuesta') + '): no se envia nada']);
      const txtL = 'El Sheet no dio la lista de retenidos (' + ((lista && lista.error) || 'sin respuesta') + '): no se envia nada. Publica Nueva version del Web App si es la primera vez.';
      await estadoGA(false, txtL);
      try { await gaAvisarSalida(url, g.clave, 'sin_lista', txtL); } catch (eAv) {}   // que quede en el Log del Sheet
      return { ok: false, error: 'sin_lista' };
    }
    await estadoGA(true, 'Abriendo la pagina de Guias en segundo plano...', true);
    const t = await chrome.tabs.create({ url: GA_URL, active: false });
    tabId = t.id;
    for (let i = 0; i < 40; i++) { await esperar(1000); const x = await chrome.tabs.get(tabId); if (x.status === 'complete') break; }
    const tab = await chrome.tabs.get(tabId);
    let ruta = ''; try { ruta = new URL(tab.url).pathname; } catch (e) {}
    if (!/^\/walmart\/guias/.test(ruta)) {
      const txtS = 'El site no abrio Guias (¿sin sesion? entra a electronicsmexico.site): ' + (ruta || 'sin pagina');
      await estadoGA(false, txtS);
      await gaAvisarSalida(url, g.clave, 'sin_sesion_site', txtS);   // que quede en el Log del Sheet, no solo en el popup
      return { ok: false, error: 'sin_sesion_site' };
    }
    const hoy = new Date().toDateString();
    const intentadas = (g.gaIntentadas && g.gaIntentadas.dia === hoy) ? g.gaIntentadas.pos : [];
    const tVisto = Date.now();   // hora en que la extension VIO la lista (no cuando termino de comprar)
    await estadoGA(true, (modo === 'real' ? 'Comprando guias' : 'Probando (no compra nada)') + '...', true);
    const r = await conTope(chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: gaEnPagina,
      args: [lista, { modo, vistas: g.gaVistas || {}, cajas: Object.assign({}, GA_CAJAS_BASE, g.gaCajas || {}), cajasPrefijo: GA_CAJAS_PREFIJO, yaIntentadas: intentadas, esperaMs: 150000, compraMs: 600000 }] }), 15 * 60000);
    const res = (r && r[0] && r[0].result) || { ok: false, error: 'la_pagina_no_respondio', modo, comprados: [], saltados: {}, sinMedidas: [], resultados: {} };
    // El reporte al Sheet se verifica (ok) y se reintenta: el de las 15:15 se perdio en silencio.
    const cuerpoRep = { accion: 'guias_reporte', clave: g.clave, corrida: { modo: res.modo, comprados: res.comprados, saltados: res.saltados, sinMedidas: res.sinMedidas, canceladasSinFila: res.canceladasSinFila || [], fallos: res.fallos || [], killerOk: res.killerOk || [], diag: res.diag || [], resultados: res.resultados, error: res.error || '' } };
    let repOk = false, repErr = '';
    for (let i = 0; i < 3 && !repOk; i++) {
      try { const rr = await llamarSheet(url, cuerpoRep); repOk = !!(rr && rr.ok !== false && !rr.error); if (!repOk) repErr = String((rr && rr.error) || 'sin_ok').slice(0, 60); }
      catch (e) { repErr = String((e && e.message) || e).slice(0, 60); }
      if (!repOk && i < 2) await new Promise(r => setTimeout(r, 20000));
    }
    if (!repOk) { try { await chrome.storage.local.set({ gaRepFallo: { ts: Date.now(), err: repErr } }); } catch (e) {} }
    // Las que Walmart rechazo SIN pagar guia (fallo transitorio) se reintentan en la siguiente corrida, hasta 3 veces al dia;
    // las que salieron bien o quedaron con guia pagada (solo falta marcar) no se vuelven a comprar nunca.
    const cuentaF = (g.gaFallos && g.gaFallos.dia === hoy) ? Object.assign({}, g.gaFallos.n) : {};
    const malas = new Set((res.fallos || []).filter(f => !f.pagada).map(f => String(f.po)));
    malas.forEach(po => { cuentaF[po] = (cuentaF[po] || 0) + 1; });
    const fijas = (res.intentados || []).filter(po => !malas.has(String(po)) || cuentaF[String(po)] >= 3);
    const nuevas = Array.from(new Set(intentadas.concat(fijas)));
    const guardar = { gaIntentadas: { dia: hoy, pos: nuevas }, gaFallos: { dia: hoy, n: cuentaF } };
    if (res.modo === 'prueba' && res.ok && !res.error) guardar.gaPruebaOk = true;
    // hora en que se vio por primera vez cada pedido (para la espera de 30 min); los que ya no estan en la lista de Walmart se olvidan
    if (Array.isArray(res.vistos) && res.vistos.length) {
      const nv = {}, ahoraV = tVisto, previas = g.gaVistas || {};
      res.vistos.forEach(po => { nv[po] = previas[po] || ahoraV; });
      guardar.gaVistas = nv;
    }
    await chrome.storage.local.set(guardar);
    const nSal = Object.keys(res.saltados || {}).reduce((a, k) => a + (res.saltados[k] || []).length, 0);
    const txt = res.error ? 'No se compro: ' + res.error
      : (res.modo === 'real' ? (res.resultados.ok || 0) + ' con guia y enviados' + (res.resultados.pend ? ', ' + res.resultados.pend + ' con guia pagada sin marcar (abre Guias: Reintentar marcar)' : '') + (res.resultados.mal ? ', ' + res.resultados.mal + ' sin guia' : '')
                          : 'PRUEBA: se enviarian ' + (res.comprados || []).length + ' (no se compro nada)' + aviso)
        + ', ' + nSal + ' no se envian' + ((res.sinMedidas || []).length ? ', ' + res.sinMedidas.length + ' SIN MEDIDAS' : '')
        + ((res.rellenadas || []).length ? ', ' + res.rellenadas.length + ' con la caja recordada' : '');
    await estadoGA(!res.error && !(res.resultados && (res.resultados.mal || res.resultados.pend)), txt);
    return { ok: !res.error, res };
  } catch (e) {
    await estadoGA(false, 'No pude correr las guias: ' + (e && e.message ? e.message : e));
    return { ok: false, error: 'falla' };
  } finally {
    clearInterval(vivo);
    if (tabId !== null) { try { await chrome.tabs.remove(tabId); } catch (e2) {} }
    gaOcupado = false;
  }
}

// Estado completo de la extension al Log del Sheet (etapa EXTENSION): sin cookies, claves ni datos de clientes.
let repExtDesde = 0;
async function reportarExtension(motivo) {
  try {
    if (Date.now() - repExtDesde < 60000) return;   // no mas de uno por minuto
    repExtDesde = Date.now();
    const g = await chrome.storage.local.get(['url', 'clave', 'estado', 'estadoOdoo', 'estadoCancel', 'estadoSC', 'estadoGA', 'gaActivo', 'gaModo', 'gaPruebaOk', 'gaVistas', 'gaCajas', 'gaIntentadas', 'gaFallos', 'gaRepFallo']);
    const url = g.url || URL_DEFECTO;
    if (!url || !g.clave || !URL_OK.test(url)) return;
    const hoy = new Date().toDateString();
    const al = await chrome.alarms.getAll(); const ag = al.find(x => x.name === 'guias');
    const m = (e) => e ? { ok: e.ok !== false, texto: String(e.texto || '').slice(0, 200), hora: e.hora || 0 } : null;
    const estado = { version: chrome.runtime.getManifest().version, motivo: motivo || '', hora: Date.now(), gaActivo: !!g.gaActivo, gaModo: g.gaModo || 'prueba', gaPruebaOk: !!g.gaPruebaOk,
      proxGuias: ag ? ag.scheduledTime : 0, nVistas: Object.keys(g.gaVistas || {}).length, nCajas: Object.keys(g.gaCajas || {}).length,
      nIntentadas: (g.gaIntentadas && g.gaIntentadas.dia === hoy) ? (g.gaIntentadas.pos || []).length : 0,
      fallosHoy: (g.gaFallos && g.gaFallos.dia === hoy) ? g.gaFallos.n : {},
      repFallo: g.gaRepFallo ? { hace_min: Math.round((Date.now() - g.gaRepFallo.ts) / 60000), err: g.gaRepFallo.err } : null,
      modulos: { cookie: m(g.estado), odoo: m(g.estadoOdoo), cancelar: m(g.estadoCancel), seller: m(g.estadoSC), guias: m(g.estadoGA) } };
    const rEst = await llamarSheet(url, { accion: 'ext_estado', clave: g.clave, estado });
    if (rEst && rEst.ok) await aplicarAlertas(rEst.alertas);
  } catch (e) {}
}

// Avisos del Sheet (19-nov): cualquier ERROR del Log que siga activo sale en rojo en el icono ("!") y en la ventana de la extension, sin abrir el Log.
async function aplicarAlertas(al) {
  try {
    if (!Array.isArray(al)) return;
    const lista = al.slice(0, 5).map(x => String(x).slice(0, 180));
    await chrome.storage.local.set({ alertasSheet: { lista, hora: Date.now() } });
    await chrome.action.setBadgeText({ text: lista.length ? '!' : '' });
    if (lista.length) await chrome.action.setBadgeBackgroundColor({ color: '#cf222e' });
    await chrome.action.setTitle({ title: lista.length ? 'Site Sheet - AVISO: ' + lista.join(' | ') : 'Site Sheet - Cookie' });
  } catch (e) {}
}

function crearAlarma() {
  chrome.alarms.create('actualizar', { periodInMinutes: 1 });
  chrome.alarms.create('revisar', { periodInMinutes: REVISAR_CADA_MIN });
  chrome.alarms.create('cancelar', { periodInMinutes: CANCELAR_CADA_MIN });
  chrome.alarms.create('seller', { periodInMinutes: SC_CADA_MIN });
  chrome.alarms.create('guias', { when: gaSiguienteHora(), periodInMinutes: GA_CADA_MIN });
}

chrome.runtime.onInstalled.addListener(() => { crearAlarma(); setTimeout(() => reportarExtension('instalada'), 45000); enviar(true); enviarOdoo(true); cancelarCiclo(false); scCiclo(false); });
chrome.runtime.onStartup.addListener(() => { crearAlarma(); setTimeout(() => reportarExtension('chrome_abierto'), 60000); enviar(false); enviarOdoo(false); cancelarCiclo(false); setTimeout(() => scCiclo(false), 20000); });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'actualizar') revisarActualizacion(); if (a.name === 'revisar') { enviar(false); enviarOdoo(false); } if (a.name === 'cancelar') cancelarCiclo(false); if (a.name === 'seller') scCiclo(false); if (a.name === 'guias') gaCiclo(false, false).finally(() => reportarExtension('vuelta_guias')); });

// Al despertar / desbloquear la PC: manda la cookie y cancela de inmediato (no espera la siguiente alarma)
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(est => {
  if (est !== 'active') return;
  crearAlarma();
  setTimeout(() => { enviar(false); enviarOdoo(false); cancelarCiclo(true); }, 5000);
  setTimeout(() => scCiclo(false), 30000);   // 5 s: da tiempo a que vuelva la red
});

chrome.runtime.onMessage.addListener((m, _s, responder) => {
  if (m && m.tipo === 'cancelar') { cancelarCiclo(true).then(responder); return true; }
  if (m && m.tipo === 'seller') { scCiclo(true).then(responder); return true; }
  if (m && m.tipo === 'guias_real') { gaCiclo(true, false, true).then(r => { reportarExtension('boton_comprar_ahora'); return r; }).then(responder); return true; }   // compra de verdad, con los mismos candados
  if (m && m.tipo === 'guias') { gaCiclo(true, true).then(responder); return true; }   // el boton del popup SIEMPRE es prueba: no compra
  if (m && m.tipo === 'enviar') { Promise.all([enviar(true), enviarOdoo(true)]).then(r => responder(r[0])); return true; }
});
