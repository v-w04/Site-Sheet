/* ============================================================================
   Site Sheet — dashboard
   ----------------------------------------------------------------------------
   Lee del Web App de Apps Script, que a su vez lee del Sheet.
   Esta página NUNCA habla con electronicsmexico.site: la credencial vive del
   lado de Apps Script y jamás baja al navegador.
   ============================================================================ */

(function () {
  'use strict';

  var API = window.APPS_SCRIPT_URL;

  var S = {
    token: null,
    hoja: null,
    hojas: [],
    cache: {},            // hoja -> { columnas, filas }
    ocultas: {},          // hoja -> { indiceColumna: true }
    orden: { col: -1, desc: false },
    estado: null
  };

  var TOPE_PINTADO = 2000;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ══════════════ ALMACENAMIENTO ══════════════
     Puede tronar en ventana privada o con cookies bloqueadas. Si falla,
     la sesión simplemente no sobrevive a un F5 — no se rompe nada. */

  function guardar(k, v, persistente) {
    try { (persistente ? localStorage : sessionStorage).setItem(k, v); } catch (e) {}
  }
  function leer(k) {
    try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch (e) { return null; }
  }
  function borrar(k) {
    try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {}
  }

  /* No identifica a nadie: solo sirve para que el contador de intentos
     fallidos del backend distinga un navegador de otro. */
  function huella() {
    var h = leer('ss_huella');
    if (!h) {
      h = Math.random().toString(36).slice(2) + Date.now().toString(36);
      guardar('ss_huella', h, true);
    }
    return h;
  }

  /* ══════════════ LLAMADAS ══════════════ */

  function llamar(params) {
    var q = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');

    return fetch(API + '?' + q)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.error === 'sesion_invalida') {
          borrar('ss_token');
          S.token = null;
          mostrarLogin('Tu sesión expiró. Entra de nuevo.');
          throw new Error('sesion_invalida');
        }
        return j;
      });
  }

  /* ══════════════ PANTALLAS ══════════════ */

  function mostrarLogin(msg) {
    $('dashboard').hidden = true;
    $('loginScreen').hidden = false;
    if (msg) {
      $('loginMsg').textContent = msg;
      $('loginMsg').className = 'alert alert--danger';
      $('loginMsg').hidden = false;
    }
  }

  function mostrarDashboard() {
    $('loginScreen').hidden = true;
    $('dashboard').hidden = false;
    cargarEstado();
  }

  /* ══════════════ LOGIN ══════════════ */

  $('loginForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var btn = $('loginBtn');
    var pw = $('loginPassword').value;
    if (!pw) return;

    $('loginMsg').hidden = true;
    btn.disabled = true;
    btn.textContent = 'Entrando…';

    llamar({ accion: 'login', password: pw, huella: huella() })
      .then(function (r) {
        if (r.ok) {
          S.token = r.token;
          guardar('ss_token', r.token, $('rememberMe').checked);
          $('loginPassword').value = '';
          mostrarDashboard();
        } else {
          $('loginMsg').textContent = r.error || 'No se pudo entrar.';
          $('loginMsg').className = 'alert alert--danger';
          $('loginMsg').hidden = false;
        }
      })
      .catch(function (e) {
        if (e.message === 'sesion_invalida') return;
        $('loginMsg').textContent = 'No se pudo conectar con el servidor.';
        $('loginMsg').className = 'alert alert--danger';
        $('loginMsg').hidden = false;
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = 'Entrar';
      });
  });

  $('btnLogout').addEventListener('click', function () {
    llamar({ accion: 'logout', token: S.token }).catch(function () {});
    borrar('ss_token');
    location.reload();
  });

  /* ══════════════ ESTADO Y KPIs ══════════════ */

  function cargarEstado() {
    llamar({ accion: 'estado', token: S.token }).then(function (r) {
      if (!r.ok) return;
      S.estado = r;
      S.hojas = r.hojas || [];

      pintarKpis();
      pintarPicker();
      pintarBadges();

      var conDatos = S.hojas.filter(function (h) { return h.filas > 0; });
      var inicial = S.hoja || (conDatos[0] || S.hojas[0] || {}).nombre;
      if (inicial) abrirHoja(inicial);
    }).catch(function () {});
  }

  function pintarBadges() {
    var r = S.estado, b = $('authBadge'), f = $('fetchBadge');

    if (r.modo === 'cookie') {
      b.textContent = r.renovacionAuto ? 'Cookie · renueva sola' : 'Cookie · manual';
      b.className = 'pill ' + (r.renovacionAuto ? 'pill--info' : 'pill--warn');
    } else if (r.modo === 'token') {
      b.textContent = 'Token';
      b.className = 'pill pill--ok';
    } else {
      b.textContent = 'Sin credencial';
      b.className = 'pill pill--danger';
    }
    b.hidden = false;

    f.textContent = (r.fetchHoy || 0).toLocaleString('es-MX') + ' llamadas hoy';
    f.className = 'pill';
    f.hidden = false;

    var aviso = '';
    if (r.cuotaAgotada) {
      aviso = 'La cuota de UrlFetch de esa cuenta de Google se agotó hoy. Las hojas ' +
              'conservan los últimos datos buenos: nada se borró, solo dejó de actualizarse.';
    } else if (r.modo === 'cookie' && !r.renovacionAuto && r.cookieDias >= 7) {
      aviso = 'La cookie se capturó hace ' + r.cookieDias + ' días y no hay login ' +
              'automático configurado. Si las descargas empiezan a fallar, empieza por ahí.';
    }
    $('avisoGlobal').textContent = aviso;
    $('avisoGlobal').hidden = !aviso;
  }

  function pintarKpis() {
    var r = S.estado;
    var precios = S.hojas.filter(esPrecios);
    var stock   = S.hojas.filter(function (h) { return !esPrecios(h.nombre); });

    var totalPrecios = precios.reduce(function (a, h) { return a + h.filas; }, 0);
    var totalStock   = stock.reduce(function (a, h) { return a + h.filas; }, 0);
    var vacias       = S.hojas.filter(function (h) { return !h.filas; }).length;

    var tiles = [
      { label: 'Hojas con datos', valor: (S.hojas.length - vacias) + ' / ' + S.hojas.length,
        hint: vacias ? vacias + ' sin bajar todavía' : 'todas al día',
        tono: vacias ? 'warn' : 'ok' },
      { label: 'Registros de precios', valor: totalPrecios.toLocaleString('es-MX'),
        hint: 'sumando las 6 combinaciones' },
      { label: 'Registros de inventario', valor: totalStock.toLocaleString('es-MX'),
        hint: 'actual y negativo' },
      { label: 'UrlFetch hoy', valor: (r.fetchHoy || 0).toLocaleString('es-MX'),
        hint: 'de 20,000 diarias', tono: r.cuotaAgotada ? 'danger' : '' }
    ];

    $('kpis').innerHTML = tiles.map(function (t) {
      return '<div class="stat">' +
        '<div class="stat__label">' + esc(t.label) + '</div>' +
        '<div class="stat__value' + (t.tono ? ' stat__value--' + t.tono : '') + '">' +
          esc(t.valor) + '</div>' +
        '<div class="stat__hint">' + esc(t.hint) + '</div>' +
      '</div>';
    }).join('');
  }

  function esPrecios(x) {
    var n = typeof x === 'string' ? x : x.nombre;
    return String(n).indexOf('Precios') === 0;
  }

  /* ══════════════ SELECTOR DE HOJA ══════════════ */

  function pintarPicker() {
    pintarGrupo($('grupoPrecios'), S.hojas.filter(esPrecios), 'Precios ');
    pintarGrupo($('grupoStock'),   S.hojas.filter(function (h) { return !esPrecios(h.nombre); }), '');
  }

  function pintarGrupo(cont, lista, quitar) {
    cont.innerHTML = '';
    lista.forEach(function (h) {
      var b = document.createElement('button');
      b.className = 'btn btn--sm tab' +
        (h.nombre === S.hoja ? ' is-activa' : '') +
        (h.filas ? '' : ' vacia');
      b.innerHTML = esc(quitar ? h.nombre.replace(quitar, '') : h.nombre) +
        (h.filas ? '<span class="tab__n">' + h.filas.toLocaleString('es-MX') + '</span>' : '');
      b.title = h.nombre + (h.filas ? '' : ' — todavía sin datos');
      b.addEventListener('click', function () {
        $('globalSearch').value = '';
        S.orden = { col: -1, desc: false };
        abrirHoja(h.nombre);
      });
      cont.appendChild(b);
    });
  }

  /* ══════════════ TABLA ══════════════ */

  function abrirHoja(nombre) {
    S.hoja = nombre;
    pintarPicker();
    $('tituloHoja').textContent = nombre;
    document.querySelector('.topbar__icon').textContent = esPrecios(nombre) ? '💲' : '📦';

    if (S.cache[nombre]) { pintar(); return; }

    $('tbl').hidden = true;
    $('emptyState').hidden = false;
    $('emptyState').innerHTML = '<span class="spinner"></span> Cargando ' + esc(nombre) + '…';

    llamar({ accion: 'tabla', hoja: nombre, token: S.token }).then(function (r) {
      if (!r.ok) { $('emptyState').textContent = r.error || 'No se pudo leer la hoja.'; return; }
      S.cache[nombre] = r.datos;
      pintar();
    }).catch(function () {});
  }

  function columnasVisibles() {
    var d = S.cache[S.hoja];
    if (!d) return [];
    var ocultas = S.ocultas[S.hoja] || {};
    var out = [];
    d.columnas.forEach(function (c, i) { if (!ocultas[i]) out.push(i); });
    return out;
  }

  function filasFiltradas() {
    var d = S.cache[S.hoja];
    if (!d) return [];

    var q = $('globalSearch').value.trim().toLowerCase();
    var filas = !q ? d.filas.slice() : d.filas.filter(function (f) {
      for (var i = 0; i < f.length; i++) {
        if (String(f[i]).toLowerCase().indexOf(q) !== -1) return true;
      }
      return false;
    });

    if (S.orden.col >= 0) {
      var c = S.orden.col, signo = S.orden.desc ? -1 : 1;
      filas.sort(function (a, b) {
        var x = a[c], y = b[c];
        var nx = Number(String(x).replace(/[$,%\s]/g, ''));
        var ny = Number(String(y).replace(/[$,%\s]/g, ''));
        var ambosNum = !isNaN(nx) && !isNaN(ny) && x !== '' && y !== '';
        if (ambosNum) return (nx - ny) * signo;
        return String(x).localeCompare(String(y), 'es') * signo;
      });
    }

    return filas;
  }

  function esNumero(v) {
    return v !== '' && v !== null && !isNaN(String(v).replace(/[$,%\s]/g, ''));
  }

  function pintar() {
    var d = S.cache[S.hoja];
    if (!d) return;

    var cols = columnasVisibles();
    var filas = filasFiltradas();

    if (!d.filas.length) {
      $('tbl').hidden = true;
      $('emptyState').hidden = false;
      $('emptyState').innerHTML =
        'Esta hoja todavía no tiene datos.<br>' +
        'Bájala con ↻ Refrescar, o desde el Sheet en el menú SITE SHEET.';
      $('rowCount').textContent = '0 registros';
      $('pie').textContent = '';
      return;
    }

    $('emptyState').hidden = true;
    $('tbl').hidden = false;

    $('theadCols').innerHTML = cols.map(function (i) {
      var ind = (S.orden.col === i) ? '<span class="sort-ind">' + (S.orden.desc ? '▼' : '▲') + '</span>' : '';
      return '<th class="sortable" data-col="' + i + '" title="' + esc(d.columnas[i]) + '">' +
             esc(d.columnas[i]) + ind + '</th>';
    }).join('');

    var tope = filas.slice(0, TOPE_PINTADO);

    var html = tope.map(function (f) {
      return '<tr>' + cols.map(function (i) {
        var v = f[i];
        return '<td class="' + (esNumero(v) ? 'num' : '') + '" title="' + esc(v) + '">' +
               esc(v) + '</td>';
      }).join('') + '</tr>';
    }).join('');

    if (filas.length > tope.length) {
      html += '<tr><td class="more-note" colspan="' + cols.length + '">' +
              (filas.length - tope.length).toLocaleString('es-MX') +
              ' registros más. Descarga el XLSX o el CSV para verlos todos.</td></tr>';
    }

    $('tbody').innerHTML = html;
    $('rowCount').textContent = filas.length.toLocaleString('es-MX') + ' registros';
    $('pie').textContent = S.hoja + ' · ' + d.columnas.length + ' columnas · ' +
      (cols.length < d.columnas.length ? (d.columnas.length - cols.length) + ' ocultas · ' : '') +
      'los números salen del Sheet, tal como los mandó el site';

    Array.prototype.forEach.call(document.querySelectorAll('#theadCols th'), function (th) {
      th.addEventListener('click', function () {
        var i = Number(th.dataset.col);
        S.orden = (S.orden.col === i) ? { col: i, desc: !S.orden.desc } : { col: i, desc: false };
        pintar();
      });
    });

    pintarColsPanel();
  }

  /* ══════════════ COLUMNAS ══════════════ */

  function pintarColsPanel() {
    var d = S.cache[S.hoja];
    if (!d) return;
    var ocultas = S.ocultas[S.hoja] || {};

    $('colsGrid').innerHTML = d.columnas.map(function (c, i) {
      return '<label><input type="checkbox" data-col="' + i + '"' +
             (ocultas[i] ? '' : ' checked') + '> ' + esc(c) + '</label>';
    }).join('');

    Array.prototype.forEach.call($('colsGrid').querySelectorAll('input'), function (inp) {
      inp.addEventListener('change', function () {
        S.ocultas[S.hoja] = S.ocultas[S.hoja] || {};
        S.ocultas[S.hoja][Number(inp.dataset.col)] = !inp.checked;
        pintar();
      });
    });
  }

  function todasLasCols(mostrar) {
    var d = S.cache[S.hoja];
    if (!d) return;
    var o = {};
    d.columnas.forEach(function (_, i) { o[i] = !mostrar; });
    S.ocultas[S.hoja] = o;
    pintar();
  }

  $('btnCols').addEventListener('click', function () {
    $('colsPanel').hidden = !$('colsPanel').hidden;
  });
  $('colsClose').addEventListener('click', function () { $('colsPanel').hidden = true; });
  $('colsAll').addEventListener('click',   function () { todasLasCols(true); });
  $('colsNone').addEventListener('click',  function () { todasLasCols(false); });
  $('colsReset').addEventListener('click', function () { S.ocultas[S.hoja] = {}; pintar(); });

  /* ══════════════ BÚSQUEDA ══════════════ */

  var tBusqueda;
  $('globalSearch').addEventListener('input', function () {
    clearTimeout(tBusqueda);
    tBusqueda = setTimeout(pintar, 150);
  });

  $('btnClearFilters').addEventListener('click', function () {
    $('globalSearch').value = '';
    S.orden = { col: -1, desc: false };
    S.ocultas[S.hoja] = {};
    pintar();
  });

  /* ══════════════ EXPORTAR ══════════════
     Exportan lo FILTRADO y ordenado, no lo que cabe en pantalla:
     la tabla pinta 2,000 renglones por velocidad, el archivo trae todo. */

  function datosParaExportar() {
    var d = S.cache[S.hoja];
    var cols = columnasVisibles();
    var enc = cols.map(function (i) { return d.columnas[i]; });
    var filas = filasFiltradas().map(function (f) {
      return cols.map(function (i) { return f[i]; });
    });
    return [enc].concat(filas);
  }

  function nombreArchivo(ext) {
    return S.hoja.replace(/\s+/g, '-').toLowerCase() + '-' +
           new Date().toISOString().slice(0, 10) + '.' + ext;
  }

  $('btnExportCsv').addEventListener('click', function () {
    var filas = datosParaExportar();
    var csv = filas.map(function (f) {
      return f.map(function (c) {
        var v = String(c === null || c === undefined ? '' : c);
        return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\r\n');

    // BOM para que Excel en español no destroce los acentos
    descargar(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), nombreArchivo('csv'));
  });

  $('btnExportXlsx').addEventListener('click', function () {
    if (typeof XLSX === 'undefined') { alert('La librería de Excel no cargó.'); return; }
    var ws = XLSX.utils.aoa_to_sheet(datosParaExportar());
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, S.hoja.substring(0, 31));
    XLSX.writeFile(wb, nombreArchivo('xlsx'));
  });

  function descargar(blob, nombre) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  /* ══════════════ REFRESCAR ══════════════ */

  $('btnRefresh').addEventListener('click', function () {
    var b = $('btnRefresh');
    if (!S.hoja) return;

    b.disabled = true;
    b.textContent = '↻ Bajando del site…';

    // Solo la hoja abierta: las seis de precios son más de un minuto
    llamar({ accion: 'refrescar', hoja: S.hoja, token: S.token })
      .then(function (r) {
        if (!r.ok) {
          $('avisoGlobal').textContent = r.error || 'No se pudo refrescar.';
          $('avisoGlobal').hidden = false;
          return;
        }
        delete S.cache[S.hoja];
        S.hojas = r.hojas || S.hojas;
        pintarKpis();
        pintarPicker();
        abrirHoja(S.hoja);
      })
      .catch(function () {})
      .then(function () {
        b.disabled = false;
        b.textContent = '↻ Refrescar';
      });
  });

  /* ══════════════ ARRANQUE ══════════════ */

  if (!API || API.indexOf('PON_AQUI') === 0) {
    mostrarLogin('Falta poner la URL del Web App en docs/config.js.');
    $('loginForm').hidden = true;
  } else {
    var t = leer('ss_token');
    if (t) {
      S.token = t;
      llamar({ accion: 'estado', token: t })
        .then(function (r) { if (r.ok) mostrarDashboard(); else mostrarLogin(); })
        .catch(function () { mostrarLogin(); });
    } else {
      mostrarLogin();
    }
  }
})();
