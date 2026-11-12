async function pintar() {
  const { estado } = await chrome.storage.local.get('estado');
  const e = document.getElementById('e');
  if (!estado) { e.textContent = 'Sin envios todavia'; e.className = ''; return; }
  const h = new Date(estado.hora).toLocaleString('es-MX');
  e.textContent = estado.texto + ' (' + h + ')';
  e.className = estado.ok ? 'ok' : 'mal';
  const { estadoOdoo } = await chrome.storage.local.get('estadoOdoo');
  const o = document.getElementById('od');
  if (o) { if (!estadoOdoo) { o.textContent = 'Odoo: sin envios todavia'; o.className = ''; } else { o.textContent = 'Odoo: ' + estadoOdoo.texto + ' (' + new Date(estadoOdoo.hora).toLocaleString('es-MX') + ')'; o.className = estadoOdoo.ok ? 'ok' : 'mal'; } }
  const { estadoCancel } = await chrome.storage.local.get('estadoCancel');
  const ca = document.getElementById('ca');
  if (ca) { if (!estadoCancel) { ca.textContent = 'Cancelar en el site: sin revisar todavia'; ca.className = ''; } else { ca.textContent = 'Cancelar en el site: ' + estadoCancel.texto + ' (' + new Date(estadoCancel.hora).toLocaleString('es-MX') + ')'; ca.className = estadoCancel.ok ? 'ok' : 'mal'; } }
  const { estadoSC } = await chrome.storage.local.get('estadoSC');
  const sc = document.getElementById('sc');
  if (sc) { if (!estadoSC) { sc.textContent = 'Seller Center: sin leer todavia'; sc.className = ''; } else { sc.textContent = 'Seller Center: ' + estadoSC.texto + ' (' + new Date(estadoSC.hora).toLocaleString('es-MX') + ')'; sc.className = estadoSC.ok ? 'ok' : 'mal'; } }
}
document.getElementById('c').onclick = async () => {
  document.getElementById('ca').textContent = 'Revisando pendientes...';
  await chrome.runtime.sendMessage({ tipo: 'cancelar' });
  pintar();
};
document.getElementById('b').onclick = async () => {
  document.getElementById('e').textContent = 'Enviando...';
  await chrome.runtime.sendMessage({ tipo: 'enviar' });
  pintar();
};
document.getElementById('s').onclick = async () => {
  document.getElementById('sc').textContent = 'Leyendo Seller Center (abre una pestaña un momento)...';
  await chrome.runtime.sendMessage({ tipo: 'seller' });
  pintar();
};
document.getElementById('o').onclick = () => chrome.runtime.openOptionsPage();
pintar();
