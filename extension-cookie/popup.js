// Popup: una caja por tarea (titulo, resultado y hora). Se refresca solo mientras esta abierto.
const $ = id => document.getElementById(id);

function caja(id, titulo, est, vacio) {
  const el = $(id); if (!el) return;
  el.textContent = '';
  const t = document.createElement('b'); t.textContent = titulo; el.appendChild(t);
  const x = document.createElement('span');
  if (!est) { x.textContent = vacio; el.className = 'caja'; el.appendChild(x); return; }
  x.textContent = est.texto; el.appendChild(x);
  const h = document.createElement('small'); h.textContent = new Date(est.hora).toLocaleString('es-MX'); el.appendChild(h);
  el.className = 'caja ' + (est.enCurso ? 'curso' : est.ok ? 'ok' : 'mal');
}

async function pintar() {
  const g = await chrome.storage.local.get(['estado', 'estadoOdoo', 'estadoCancel', 'estadoSC']);
  caja('e', 'Cookie del site', g.estado, 'Sin envios todavia');
  caja('od', 'Odoo', g.estadoOdoo, 'Sin envios todavia');
  caja('ca', 'Cancelar en el site', g.estadoCancel, 'Sin revisar todavia');
  caja('sc', 'Seller Center', g.estadoSC, 'Sin leer todavia');
}

// Los botones solo avisan al servicio y el popup se actualiza mirando lo que este va guardando (no esperan a que termine).
function pedir(tipo, id, titulo, texto, clave) {
  caja(id, titulo, { texto, hora: Date.now(), enCurso: true });
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
