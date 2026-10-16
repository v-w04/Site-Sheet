const URL_OK = /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const $ = id => document.getElementById(id);

chrome.storage.local.get(['url', 'clave']).then(({ url, clave }) => {
  $('url').value = url || '';
  $('clave').value = clave || '';
});

$('g').onclick = async () => {
  const url = $('url').value.trim();
  const clave = $('clave').value.trim();
  if (!URL_OK.test(url)) { $('m').textContent = 'La URL debe ser la del Web App y terminar en /exec'; return; }
  if (clave.length < 32) { $('m').textContent = 'La clave esta incompleta'; return; }
  await chrome.storage.local.set({ url, clave, ultima: '', ultimoFallo: false });
  $('m').textContent = 'Enviando...';
  await chrome.runtime.sendMessage({ tipo: 'enviar' });
  const { estado } = await chrome.storage.local.get('estado');
  $('m').textContent = estado ? estado.texto : 'Guardado';
};
