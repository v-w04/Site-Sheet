// Popup: una tarjeta por tarea (indicador, resultado y hora). Se refresca solo mientras esta abierto.
const $ = id => document.getElementById(id);

function hace(ms) {
  const d = Date.now() - ms;
  if (d < 45000) return 'ahora';
  if (d < 3600000) return 'hace ' + Math.max(1, Math.round(d / 60000)) + ' min';
  const f = new Date(ms), hoy = new Date();
  const hh = f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return f.toDateString() === hoy.toDateString() ? hh : f.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' }) + ' ' + hh;
}

function tarjeta(id, titulo, est, vacio) {
  const el = $(id); if (!el) return;
  el.textContent = '';
  const p = document.createElement('i'); p.className = 'punto';
  const t = document.createElement('span'); t.className = 'tit'; t.textContent = titulo;
  const h = document.createElement('span'); h.className = 'hora'; h.textContent = est ? hace(est.hora) : '';
  const x = document.createElement('span'); x.className = 'txt'; x.textContent = est ? est.texto : vacio;
  el.append(p, t, h, x);
  el.className = 'fila' + (est ? (est.enCurso ? ' curso' : est.ok ? ' ok' : ' mal') : '');
}

async function pintar() {
  const g = await chrome.storage.local.get(['estado', 'estadoOdoo', 'estadoCancel', 'estadoSC']);
  tarjeta('e', 'Cookie del site', g.estado, 'Sin envios todavia');
  tarjeta('od', 'Odoo', g.estadoOdoo, 'Sin envios todavia');
  tarjeta('ca', 'Cancelar en el site', g.estadoCancel, 'Sin revisar todavia');
  tarjeta('sc', 'Seller Center', g.estadoSC, 'Sin leer todavia');
}

// Los botones solo avisan al servicio y el popup se actualiza mirando lo que este va guardando (no esperan a que termine).
function pedir(tipo, id, titulo, texto, clave) {
  tarjeta(id, titulo, { texto, hora: Date.now(), enCurso: true });
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
$('o').onclick = () => chrome.runtime.openOptionsPage();
pintar();
setInterval(pintar, 1500);
