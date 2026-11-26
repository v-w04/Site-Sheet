// Popup compacto (20-nov, ella: "esta larguisima, ya tiene scroll"): un cuadro chico por tarea en 2 columnas (punto, nombre, hora),
// el detalle del cuadro que toques abajo, "Qué hacer" solo cuando algo pide una accion tuya, y botones en una fila.
const $ = id => document.getElementById(id);
const SHEET_ID = '1Yjwyyv7EF5CJ3tJ2DgGzXO7QHxyrC0aCCSj1MHL5AKY';   // el libro Sheet Site (no es una clave)
let selec = null;
let ultimaAccion = null;

// 24-nov (ella: comparar DELL y FORCEV): version de la extension y nombre de esta computadora junto al titulo
chrome.storage.local.get(['instNombre', 'instId']).then(g => {
  const n = g.instNombre || (g.instId ? 'PC-' + String(g.instId).slice(0, 4).toUpperCase() : '');
  const v = $('ver'); if (v) v.textContent = 'v' + chrome.runtime.getManifest().version; const eq = $('equipo'); if (eq) eq.textContent = n || 'ESTE EQUIPO';
}).catch(() => { const v = $('ver'); if (v) v.textContent = 'v' + chrome.runtime.getManifest().version; });

function hace(ms) {
  const d = Date.now() - ms;
  if (d < 45000) return 'ahora';
  if (d < 3600000) return Math.max(1, Math.round(d / 60000)) + ' min';
  const f = new Date(ms), hoy = new Date();
  const hh = f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return f.toDateString() === hoy.toDateString() ? hh : f.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' }) + ' ' + hh;
}

// [id, nombre corto, clave en storage, texto si no hay dato, nombre largo (detalle)]
const CUADROS = [
  ['e', 'Cookie', 'estado', 'Sin envios todavia', 'Cookie del site'],
  ['od', 'Odoo', 'estadoOdoo', 'Sin envios todavia', 'Odoo'],
  ['ca', 'Cancelar site', 'estadoCancel', 'Sin revisar todavia', 'Cancelar en el site'],
  ['sc', 'Seller Center', 'estadoSC', 'Sin leer todavia', 'Seller Center'],
  ['wm', 'Cancelar WM', 'estadoWM', 'Sin revisar todavia', 'Cancelar en Walmart (precio erroneo)'],
  ['rq', 'Rastreo', 'estadoRQ', 'Sin consultar todavia', 'Rastreo de guias (Paqueteria Dedicada Walmart / FedEx)'],
  ['tu', 'Turno', 'estadoTurno', 'Sin preguntar todavia', 'Turno (varias computadoras)'],
  ['gu', 'Guías', 'estadoGA', 'Sin probar todavia', 'Guias automaticas'],
  ['sb', 'Subida', 'estadoSB', 'Sin subidas todavia', 'Subida de precios y killers a Walmart']
];
const ESTADOS = {};

// Que tiene que hacer ella cuando un cuadro esta en rojo (solo lo que pide una accion suya; lo que se reintenta solo no sale aqui).
function accionDe(id, est) {
  const t = String(est.texto || '');
  if (id === 'e') return 'Entra al site y toca "Cookie"';
  if (id === 'od') return /sesion/i.test(t) ? 'Abre Odoo en Chrome y entra con tu usuario' : 'Odoo: ' + t;
  if (id === 'sc') return /sesi|2fa|inicia/i.test(t) ? 'Entra a Seller Center (sesion vencida)' : null;
  if (id === 'wm') return 'Cancelar en Walmart: ' + t;
  if (id === 'ca') return 'Cancelar en el site: ' + t;
  if (id === 'rq') return /verificacion/i.test(t) ? 'La paqueteria pidio verificacion: abre una guia a mano' : null;   // las fallas pasajeras se reintentan solas
  if (id === 'gu') return /sesion/i.test(t) ? 'Guias: entra a Walmart en el site (sin sesion)' : null;
  if (id === 'sb') return /sesion/i.test(t) ? 'Subida: entra a Seller Center (sesion vencida) y vuelve a pulsar' : 'Subida a Walmart: ' + t;
  return null;
}

function tarjeta(id, titulo, est, vacio) {
  const el = $(id); if (!el) return;
  const c = CUADROS.find(x => x[0] === id);
  const corto = c ? c[1] : titulo;
  ESTADOS[id] = { titulo: c ? c[4] : titulo, est, vacio };
  el.textContent = '';
  const p = document.createElement('i'); p.className = 'punto';
  const t = document.createElement('span'); t.className = 'tit'; t.textContent = corto;
  const h = document.createElement('span'); h.className = 'hora'; h.textContent = est ? hace(est.hora) : '';
  el.append(p, t, h);
  el.title = (c ? c[4] : titulo) + ': ' + (est ? est.texto : vacio);
  el.className = 't' + (est ? (est.enCurso ? ' curso' : est.ok ? ' ok' : ' mal') : '') + (selec === id ? ' sel' : '');
  el.onclick = () => { selec = selec === id ? null : id; pintar(); };
  el.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.click(); } };
}

function detalle() {
  const d = $('det'); if (!d) return;
  const id = selec || Object.keys(ESTADOS).find(k => ESTADOS[k].est && !ESTADOS[k].est.ok && !ESTADOS[k].est.enCurso);
  d.textContent = '';
  if (!id) { d.textContent = 'Toca un proceso para ver su última actividad.'; return; }
  const x = ESTADOS[id], b = document.createElement('b');
  b.textContent = x.titulo + (x.est ? ' · ' + hace(x.est.hora) : '') + ': ';
  d.append(b, document.createTextNode(x.est ? x.est.texto : x.vacio));
}

async function pintar() {
  const g = await chrome.storage.local.get(['estado', 'estadoOdoo', 'estadoCancel', 'estadoSC', 'estadoWM', 'estadoRQ', 'estadoTurno', 'estadoGA', 'estadoSB', 'gaActivo', 'gaModo', 'alertasSheet']);
  const al = $('al');
  if (al) {
    const x = g.alertasSheet, vivo = x && Array.isArray(x.lista) && x.lista.length && (Date.now() - x.hora) < 45 * 60000;
    const firma = vivo ? x.lista.join('|') : '';
    if (al.dataset.firma !== firma) {   // solo se redibuja si cambio (asi no se cierra mientras lo lees)
      al.dataset.firma = firma; al.textContent = '';
      if (vivo) {
        // 20-nov (ella: "esta larguisimo"): un renglon; "Ver" abre la lista, "Copiar" la copia, "Sheet" abre el Sheet
        const fila = document.createElement('div'); fila.className = 'fila';
        const t = document.createElement('span'); t.className = 'txt';
        t.textContent = (x.lista.length > 1 ? x.lista.length + ' avisos · ' : '') + x.lista[0];
        const ver = document.createElement('button'); ver.className = 'mini'; ver.textContent = 'Ver';
        ver.onclick = () => { al.classList.toggle('abierto'); ver.textContent = al.classList.contains('abierto') ? 'Cerrar' : 'Ver'; };
        const cp = document.createElement('button'); cp.className = 'mini'; cp.textContent = 'Copiar';
        cp.onclick = () => { navigator.clipboard.writeText(x.lista.join('\n')).then(() => { cp.textContent = 'Copiado'; setTimeout(() => { cp.textContent = 'Copiar'; }, 1500); }).catch(() => { cp.textContent = 'No pude'; }); };
        const sh = document.createElement('button'); sh.className = 'mini'; sh.textContent = 'Sheet';
        sh.onclick = () => chrome.tabs.create({ url: 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit' });
        fila.append(t, ver, cp, sh);
        const ol = document.createElement('ol'); ol.className = 'lista';
        x.lista.forEach(a => { const li = document.createElement('li'); li.textContent = a; ol.append(li); });
        al.append(fila, ol);
      }
      al.style.display = vivo ? 'block' : 'none';
    }
  }
  CUADROS.forEach(c => tarjeta(c[0], c[1], g[c[2]], c[3]));
  const gu = $('gu'); if (gu) gu.querySelector('.tit').textContent = 'Guías ' + (g.gaActivo ? (g.gaModo === 'real' ? '(auto)' : '(prueba)') : '(apagadas)');
  const malos = CUADROS.filter(c => g[c[2]] && !g[c[2]].ok && !g[c[2]].enCurso);
  const registrados = CUADROS.filter(c => !!g[c[2]]).length;
  const acciones = malos.map(c => accionDe(c[0], g[c[2]])).filter(Boolean);
  const res = $('res');
  // Estado global honesto: "al dia" solo con TODO registrado (Subida es manual y puede no tener registro) y sin incidencias ni alertas del Sheet.
  const alertas = (g.alertasSheet && Array.isArray(g.alertasSheet.lista) && (Date.now() - g.alertasSheet.hora) < 45 * 60000) ? g.alertasSheet.lista.length : 0;
  const requeridos = CUADROS.filter(c => c[0] !== 'sb'), sinReg = requeridos.filter(c => !g[c[2]]).length;
  const incid = malos.length + alertas;
  const horas = CUADROS.map(c => g[c[2]] && g[c[2]].hora).filter(Boolean);
  const ultima = horas.length ? hace(Math.max.apply(null, horas)) : null;
  let nivel, titulo, desc;
  if (malos.length >= 3) { nivel = 'bad'; titulo = 'Operación interrumpida'; desc = malos.length + ' procesos con fallo · revisa los marcados en rojo'; }
  else if (incid > 0) { nivel = 'warn'; titulo = 'Requiere atención'; desc = incid + (incid === 1 ? ' incidencia pendiente' : ' incidencias pendientes') + (ultima ? ' · última actividad ' + ultima : ''); }
  else if (sinReg === requeridos.length) { nivel = 'unk'; titulo = 'Sin datos todavía'; desc = 'Aún no hay registros de actividad en esta computadora'; }
  else if (sinReg > 0) { nivel = 'unk'; titulo = 'Sin incidencias · datos incompletos'; desc = sinReg + ' de ' + requeridos.length + ' procesos aún sin registro'; }
  else { nivel = 'ok'; titulo = 'Operación al día'; desc = 'Sin incidencias' + (ultima ? ' · última actividad ' + ultima : ''); }
  if (res) { res.textContent = titulo; res.className = nivel === 'bad' ? 'mal' : nivel === 'warn' ? 'warn' : 'ok'; }
  const hero = document.querySelector('.hero'); if (hero) hero.className = 'hero' + (nivel === 'bad' ? ' bad' : nivel === 'warn' ? ' warn' : '');
  const hc = $('healthicon'), hd = $('healthDesc');
  if (hc) { hc.className = 'healthicon' + (nivel === 'bad' ? ' problem' : nivel === 'warn' ? ' warn' : nivel === 'unk' ? ' unk' : ''); hc.textContent = nivel === 'ok' ? '✓' : nivel === 'unk' ? '?' : '!'; }
  if (hd) hd.textContent = desc;
  const acc = $('acc'), ol = $('accl');
  if (acc && ol) {
    ol.textContent = '';
    acciones.forEach(a => { const li = document.createElement('li'); li.textContent = a; ol.append(li); });
    acc.style.display = acciones.length ? 'block' : 'none';
  }
  detalle();
  if (ultimaAccion) {
    const ef = $('opFeedback'), s = ESTADOS[ultimaAccion];
    if (ef && s && s.est) ef.textContent = s.titulo + ': ' + s.est.texto;
  }
}

// Los botones solo avisan al servicio y el popup se actualiza mirando lo que este va guardando (no esperan a que termine).
function pedir(tipo, id, titulo, texto, clave) {
  ultimaAccion = id;
  const feedback = $('opFeedback'); if (feedback) feedback.textContent = titulo + ': ' + texto;
  selec = id;
  tarjeta(id, titulo, { texto, hora: Date.now(), enCurso: true });
  detalle();
  const falla = txt => chrome.storage.local.set({ [clave]: { ok: false, texto: txt, hora: Date.now() } });
  try {
    chrome.runtime.sendMessage({ tipo }).then(r => {
      if (r === undefined) falla('El servicio de la extension no respondio: recargala en chrome://extensions (Recargar)');
    }).catch(e => falla('No pude hablar con el servicio de la extension: ' + (e && e.message ? e.message : e)));
  } catch (e) { falla('No pude hablar con el servicio de la extension: ' + (e && e.message ? e.message : e)); }
  setTimeout(pintar, 800);
}
$('b').onclick = () => pedir('enviar', 'e', 'Cookie del site', 'Enviando...', 'estado');
$('c').onclick = () => pedir('cancelar', 'ca', 'Cancelar en el site', 'Revisando pendientes...', 'estadoCancel');
$('s').onclick = () => pedir('seller', 'sc', 'Seller Center', 'Leyendo Seller Center (abre una pestaña en segundo plano un momento)...', 'estadoSC');
$('g').onclick = () => pedir('guias', 'gu', 'Guias', 'Probando (abre la pagina de Guias en segundo plano; no compra nada)...', 'estadoGA');
// Comprar de verdad: dos pulsaciones (la segunda dentro de 6 s). Usa EXACTAMENTE los mismos candados que la corrida de cada hora.
let grReloj = null;
$('gr').onclick = () => {
  const b = $('gr');
  if (!grReloj) {
    b.textContent = 'Confirmar compra REAL';
    grReloj = setTimeout(() => { grReloj = null; b.textContent = 'Comprar guías · REAL'; }, 6000);
    return;
  }
  clearTimeout(grReloj); grReloj = null; b.textContent = 'Comprar guías · REAL';
  pedir('guias_real', 'gu', 'Guias', 'COMPRANDO guias de los pedidos que pasan los candados (abre la pagina de Guias en segundo plano)...', 'estadoGA');
};
// 24-nov: subir precios / killers a Walmart. Cada boton pide UNA confirmacion (pulsar otra vez dentro de 6 s); "Todo" tambien una sola.
function botonSeguro(id, normal, tipo, texto) {
  const b = $(id); if (!b) return;
  let reloj = null;
  b.onclick = () => {
    if (!reloj) {
      b.textContent = '¿Seguro? Otra vez';
      reloj = setTimeout(() => { reloj = null; b.textContent = normal; }, 6000);
      return;
    }
    clearTimeout(reloj); reloj = null; b.textContent = normal;
    pedir(tipo, 'sb', 'Subida', texto, 'estadoSB');
  };
}
botonSeguro('sp', 'Precios', 'sub_precios', 'Armando el archivo de PRECIOS y subiendolo a Seller Center (abre una pestaña en segundo plano)...');
botonSeguro('sk', 'Killers', 'sub_killers', 'Armando el archivo de KILLERS y subiendolo a Seller Center (abre una pestaña en segundo plano)...');
botonSeguro('st', 'Ambos', 'sub_todo', 'Subiendo PRECIOS; unos minutos despues salen los KILLERS (deja Chrome prendido)...');
botonSeguro('sx', 'Prueba', 'sub_prueba', 'PRUEBA: subiendo 2 killers con el precio que ya tienen...');
// 24-nov: mensaje de recoleccion (WhatsApp) guardado en la extension: se copia y se retoca aqui mismo.
const rect = $('rect'), recn = $('recn');
let recReloj = null;
async function recPintar() {
  const g = await chrome.storage.local.get(['recMsg']);
  const m = g.recMsg;
  if (!m) { recn.textContent = 'Sin mensaje todavia: pulsa Actualizar'; return; }
  rect.value = m.editado || m.auto || '';
  recn.textContent = (m.editado ? 'Con tus retoques · ' : 'Del Sheet · ') + hace(m.hora) + (m.editado ? ' (Actualizar los descarta)' : '');
}
async function recActualizar(descartar) {
  recn.textContent = 'Trayendo el mensaje del Sheet...';
  if (descartar) { const g = await chrome.storage.local.get(['recMsg']); if (g.recMsg) await chrome.storage.local.set({ recMsg: Object.assign({}, g.recMsg, { editado: '' }) }); }
  let r = null;
  try { r = await chrome.runtime.sendMessage({ tipo: 'rec_mensaje' }); } catch (e) { r = null; }
  if (!r || !r.ok) { recn.textContent = 'No pude traerlo del Sheet' + (r && r.error ? ' (' + r.error + ')' : '') + '. ' + (rect.value ? 'Queda el texto guardado.' : ''); return; }
  await recPintar();
}
rect.addEventListener('input', () => {
  clearTimeout(recReloj);
  recReloj = setTimeout(async () => {
    const g = await chrome.storage.local.get(['recMsg']);
    await chrome.storage.local.set({ recMsg: Object.assign({ auto: '', hora: Date.now() }, g.recMsg || {}, { editado: rect.value }) });
    recn.textContent = 'Con tus retoques · guardado (Actualizar los descarta)';
  }, 400);
});
$('rcp').onclick = () => { navigator.clipboard.writeText(rect.value).then(() => { $('rcp').textContent = 'Copiado'; setTimeout(() => { $('rcp').textContent = 'Copiar mensaje'; }, 1500); }).catch(() => { rect.select(); document.execCommand('copy'); }); };
$('rac').onclick = () => recActualizar(true);
chrome.storage.local.get(['recMsg']).then(g => { if (g.recMsg) recPintar(); if (!g.recMsg || Date.now() - g.recMsg.hora > 10 * 60000) recActualizar(false); else recPintar(); });
$('o').onclick = () => chrome.runtime.openOptionsPage();
pintar();
setInterval(pintar, 1500);

// Navegación visual del popup. No modifica procesos ni llamadas al background.
const TABS_VALIDAS = ['resumen', 'operaciones', 'mensajes'];
function abrirTab(nombre) {
  if (!TABS_VALIDAS.includes(nombre)) return;
  document.querySelectorAll('nav [data-tab]').forEach(btn => {
    const activo = btn.dataset.tab === nombre;
    btn.classList.toggle('active', activo);
    btn.setAttribute('aria-selected', activo ? 'true' : 'false');
  });
  document.querySelectorAll('main.view').forEach(p => p.classList.toggle('active', p.id === nombre));
  try { sessionStorage.setItem('siteSheetTab', nombre); } catch(_) {}
}
document.querySelectorAll('nav [data-tab]').forEach(btn => btn.addEventListener('click', () => abrirTab(btn.dataset.tab)));
try { abrirTab(sessionStorage.getItem('siteSheetTab') || 'resumen'); } catch(_) { abrirTab('resumen'); }

// Selector contextual de operaciones: una sola categoría activa a la vez.
const OPS_VALIDAS = ['guias', 'publicaciones', 'cancelaciones', 'sincronizacion'];
function abrirOperacion(nombre) {
  if (!OPS_VALIDAS.includes(nombre)) return;
  document.querySelectorAll('.opcategory').forEach(btn => {
    const activo = btn.dataset.op === nombre;
    btn.classList.toggle('active', activo);
    btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
  });
  document.querySelectorAll('.actionpanel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === nombre));
  try { sessionStorage.setItem('siteSheetOp', nombre); } catch(_) {}
}
document.querySelectorAll('.opcategory').forEach(btn => btn.addEventListener('click', () => abrirOperacion(btn.dataset.op)));
try { abrirOperacion(sessionStorage.getItem('siteSheetOp') || 'guias'); } catch(_) { abrirOperacion('guias'); }
