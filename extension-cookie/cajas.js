// Recuerda la caja (largo x ancho x alto x peso) que una PERSONA teclea en la pagina de Guias para un SKU que Odoo no conoce.
// Solo guarda en el navegador (chrome.storage). No manda nada a ningun lado, no compra y no cancela nada.
// Solo cuenta lo que se teclea de verdad (ev.isTrusted): lo que escribe la propia extension o la pagina no se guarda.
(function () {
  if (window.__ssCajas) return;
  window.__ssCajas = true;
  const relojes = {};
  document.addEventListener('input', function (ev) {
    const i = ev.target;
    if (!ev.isTrusted || !i || !i.classList || !i.classList.contains('wg-dim')) return;
    const row = i.closest('.wg-row');
    const sku = String(i.getAttribute('data-sku') || '').trim();
    if (!row || !sku) return;
    clearTimeout(relojes[sku]);
    relojes[sku] = setTimeout(function () {
      try {
        if (row.querySelector('.wg-fuente.ok')) return;                              // la medida es de Odoo: no se toca
        const pr = row.querySelector('.wg-precio');
        if (pr && /x\s*\d+\s*=/.test(pr.textContent || '')) return;                  // pedido de varias piezas: esa caja no es la de una pieza
        const c = {};
        row.querySelectorAll('.wg-dim').forEach(function (d) { const v = parseInt(d.value, 10); c[d.getAttribute('data-k')] = v > 0 ? v : null; });
        if (!(c.L && c.W && c.H && c.KG)) return;
        chrome.storage.local.get('gaCajas').then(function (g) {
          const m = g.gaCajas || {};
          m[sku] = { L: c.L, W: c.W, H: c.H, KG: c.KG, t: Date.now() };
          return chrome.storage.local.set({ gaCajas: m });
        });
      } catch (e) {}
    }, 1500);
  }, true);
})();
