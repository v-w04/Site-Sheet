async function pintar() {
  const { estado } = await chrome.storage.local.get('estado');
  const e = document.getElementById('e');
  if (!estado) { e.textContent = 'Sin envios todavia'; e.className = ''; return; }
  const h = new Date(estado.hora).toLocaleString('es-MX');
  e.textContent = estado.texto + ' (' + h + ')';
  e.className = estado.ok ? 'ok' : 'mal';
}
document.getElementById('b').onclick = async () => {
  document.getElementById('e').textContent = 'Enviando...';
  await chrome.runtime.sendMessage({ tipo: 'enviar' });
  pintar();
};
document.getElementById('o').onclick = () => chrome.runtime.openOptionsPage();
pintar();
