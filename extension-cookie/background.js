// Site Sheet - Cookie (v1.3: manda la sesion de Odoo, cancela en el site lo pendiente y lee el estado de tus pedidos en Seller Center)
// Detecta la cookie "session" de electronicsmexico.site y la manda al Web App
// del Site Sheet (Apps Script). Apps Script la prueba antes de guardarla.

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
    let arr = Array.isArray(j) ? j : [];
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
        const j2 = await r2.json(); let a2 = Array.isArray(j2) ? j2 : [];
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
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) });
  const txt = await r.text();
  try { return JSON.parse(txt); } catch (e) { return { ok: false, error: 'no_json' }; }
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
    if (n !== null) { if (n === prev) iguales++; else { prev = n; iguales = 1; } if (iguales >= 2 && Date.now() - t0 > 2500) return { sesion: true, total: n }; }
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

// Los dos numeros del buzon (sin leer / por responder). null = no se pudo leer ese numero.
async function scBuzon(tabId) {
  const leer = async (q, marca) => {
    const r = await scLeerOtra(tabId, SC_URL + 'seller-communication/Customer?' + q + '&start=1', enSellerBuzon, [20000, marca]);
    return (r && r.sesion && typeof r.total === 'number') ? r.total : null;
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

function crearAlarma() {
  chrome.alarms.create('actualizar', { periodInMinutes: 1 });
  chrome.alarms.create('revisar', { periodInMinutes: REVISAR_CADA_MIN });
  chrome.alarms.create('cancelar', { periodInMinutes: CANCELAR_CADA_MIN });
  chrome.alarms.create('seller', { periodInMinutes: SC_CADA_MIN });
}

chrome.runtime.onInstalled.addListener(() => { crearAlarma(); enviar(true); enviarOdoo(true); cancelarCiclo(false); scCiclo(false); });
chrome.runtime.onStartup.addListener(() => { crearAlarma(); enviar(false); enviarOdoo(false); cancelarCiclo(false); setTimeout(() => scCiclo(false), 20000); });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'actualizar') revisarActualizacion(); if (a.name === 'revisar') { enviar(false); enviarOdoo(false); } if (a.name === 'cancelar') cancelarCiclo(false); if (a.name === 'seller') scCiclo(false); });

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
  if (m && m.tipo === 'enviar') { Promise.all([enviar(true), enviarOdoo(true)]).then(r => responder(r[0])); return true; }
});
