/* ============================================================
   Site Sheet — dashboard
   ------------------------------------------------------------
   Lee del Web App de Apps Script, que a su vez lee del Sheet.
   El dashboard NUNCA habla con el site: la credencial vive del
   lado de Apps Script y nunca baja al navegador.
   ============================================================ */

(function () {
  'use strict';

  var URL_API = window.APPS_SCRIPT_URL;

  var estado = {
    token: null,
    hoja: null,
    hojas: [],
    cache: {}      // nombre de hoja -> { columnas, filas }
  };

  function $(id) { return document.getElementById(id); }

  /* ---------- Guardado del token ----------
     sessionStorage puede tronar (ventana privada, cookies bloqueadas).
     Si falla, la sesion simplemente no sobrevive a un F5. */

  function guardarToken(t) {
    estado.token = t;
    try { sessionStorage.setItem('ss_token', t); } catch (e) {}
  }
  function leerToken() {
    try { return sessionStorage.getItem('ss_token'); } catch (e) { return null; }
  }
  function borrarToken() {
    estado.token = null;
    try { sessionStorage.removeItem('ss_token'); } catch (e) {}
  }

  /* ---------- Huella del navegador ----------
     No identifica a nadie. Solo sirve para que el contador de intentos
     fallidos del backend distinga un navegador de otro. */
  function huella() {
    var h = null;
    try { h = localStorage.getItem('ss_huella'); } catch (e) {}
    if (!h) {
      h = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { localStorage.setItem('ss_huella', h); } catch (e) {}
    }
    return h;
  }

  /* ---------- Llamadas ---------- */

  function llamar(params) {
    var q = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');

    return fetch(URL_API + '?' + q)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.error === 'sesion_invalida') {
          borrarToken();
          mostrarLogin('Tu sesión expiró. Entra de nuevo.');
          throw new Error('sesion_invalida');
        }
        return j;
      });
  }

  /* ---------- Pantallas ---------- */

  function mostrarLogin(mensaje) {
    $('app').hidden = true;
    $('login').hidden = false;
    if (mensaje) {
      $('login-error').textContent = mensaje;
      $('login-error').hidden = false;
    }
  }

  function mostrarApp() {
    $('login').hidden = true;
    $('app').hidden = false;
    cargarEstado();
  }

  /* ---------- Login ---------- */

  $('login-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var boton = $('login-btn');
    var pw = $('pw').value;
    if (!pw) return;

    $('login-error').hidden = true;
    boton.disabled = true;
    boton.textContent = 'Entrando...';

    llamar({ accion: 'login', password: pw, huella: huella() })
      .then(function (r) {
        if (r.ok) {
          guardarToken(r.token);
          $('pw').value = '';
          mostrarApp();
        } else {
          $('login-error').textContent = r.error || 'No se pudo entrar.';
          $('login-error').hidden = false;
        }
      })
      .catch(function (e) {
        $('login-error').textContent = 'No se pudo conectar. ' + e.message;
        $('login-error').hidden = false;
      })
      .then(function () {
        boton.disabled = false;
        boton.textContent = 'Entrar';
      });
  });

  $('salir').addEventListener('click', function () {
    llamar({ accion: 'logout', token: estado.token }).catch(function () {});
    borrarToken();
    location.reload();
  });

  /* ---------- Estado y catalogo de hojas ---------- */

  function cargarEstado() {
    llamar({ accion: 'estado', token: estado.token }).then(function (r) {
      if (!r.ok) return;

      estado.hojas = r.hojas || [];
      pintarBotonesHoja();

      var pill = $('modo-pill');
      if (r.modo === 'cookie') {
        pill.textContent = 'Autenticación por cookie';
        pill.className = 'pill pill--warn';
        pill.hidden = false;
        $('aviso').textContent =
          'El backend está entrando al site con cookie de sesión. Eso vence solo ' +
          'cada tantos días. La solución de fondo es el token en X-API-Key.';
        $('aviso').hidden = false;
      } else if (r.modo === 'token') {
        pill.textContent = 'Token';
        pill.className = 'pill pill--ok';
        pill.hidden = false;
      }

      if (r.cuotaAgotada) {
        $('aviso').textContent =
          'La cuota de UrlFetch de esa cuenta de Google se agotó hoy. Los datos ' +
          'siguen siendo los de la última descarga buena.';
        $('aviso').hidden = false;
      }

      // Primera hoja con datos, o la primera de la lista
      var conDatos = estado.hojas.filter(function (h) { return h.filas > 0; });
      var inicial = (conDatos[0] || estado.hojas[0] || {}).nombre;
      if (inicial) cargarHoja(inicial);
    }).catch(function () {});
  }

  function pintarBotonesHoja() {
    var precios = estado.hojas.filter(function (h) { return h.nombre.indexOf('Precios') === 0; });
    var stock   = estado.hojas.filter(function (h) { return h.nombre.indexOf('Precios') !== 0; });

    function pintar(cont, lista) {
      cont.innerHTML = '';
      lista.forEach(function (h) {
        var b = document.createElement('button');
        b.className = 'btn btn--sm tab' + (h.nombre === estado.hoja ? ' is-activa' : '');
        b.textContent = h.nombre + (h.filas ? ' · ' + h.filas : '');
        b.dataset.hoja = h.nombre;
        if (!h.filas) b.classList.add('muted');
        b.addEventListener('click', function () {
          $('buscar').value = '';
          cargarHoja(h.nombre);
        });
        cont.appendChild(b);
      });
    }

    pintar($('grupo-precios'), precios);
    pintar($('grupo-stock'), stock);
  }

  /* ---------- Tabla ---------- */

  function cargarHoja(nombre) {
    estado.hoja = nombre;
    pintarBotonesHoja();

    if (estado.cache[nombre]) { pintar(); return; }

    $('tbody').innerHTML = '<tr><td colspan="99" class="muted">Cargando...</td></tr>';

    llamar({ accion: 'tabla', hoja: nombre, token: estado.token }).then(function (r) {
      if (!r.ok) return;
      estado.cache[nombre] = r.datos;
      pintar();
    }).catch(function () {});
  }

  function filasFiltradas() {
    var d = estado.cache[estado.hoja];
    if (!d) return [];
    var q = $('buscar').value.trim().toLowerCase();
    if (!q) return d.filas;

    return d.filas.filter(function (f) {
      return f.some(function (c) { return String(c).toLowerCase().indexOf(q) !== -1; });
    });
  }

  function esNumero(v) {
    return v !== '' && !isNaN(String(v).replace(/[$,\s%]/g, ''));
  }

  function pintar() {
    var d = estado.cache[estado.hoja];
    if (!d) return;

    var filas = filasFiltradas();

    $('thead-row').innerHTML = d.columnas.map(function (c) {
      return '<th>' + escapar(c) + '</th>';
    }).join('');

    // Tope de pintado: 2,000 filas. Mas que eso y el navegador se arrastra.
    // Para el volcado completo esta el boton de CSV.
    var tope = filas.slice(0, 2000);

    $('tbody').innerHTML = tope.map(function (f) {
      return '<tr>' + f.map(function (c) {
        return '<td class="' + (esNumero(c) ? 'num' : '') + '">' + escapar(c) + '</td>';
      }).join('') + '</tr>';
    }).join('');

    $('vacio').hidden = filas.length > 0;

    $('pie').textContent = estado.hoja + ' — ' +
      filas.length.toLocaleString('es-MX') + ' registros' +
      (filas.length > tope.length ? ' (mostrando 2,000; el CSV los trae todos)' : '');
  }

  function escapar(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var tiempoBusqueda;
  $('buscar').addEventListener('input', function () {
    clearTimeout(tiempoBusqueda);
    tiempoBusqueda = setTimeout(pintar, 150);
  });

  /* ---------- Descarga CSV ---------- */

  $('descargar').addEventListener('click', function () {
    var d = estado.cache[estado.hoja];
    if (!d) return;

    var filas = [d.columnas].concat(filasFiltradas());
    var csv = filas.map(function (f) {
      return f.map(function (c) {
        var v = String(c === null || c === undefined ? '' : c);
        return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\r\n');

    // BOM para que Excel en español no destroce los acentos
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = estado.hoja.replace(/\s+/g, '-').toLowerCase() +
                 '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  });

  /* ---------- Refrescar ---------- */

  $('refrescar').addEventListener('click', function () {
    var b = $('refrescar');
    var que = (estado.hoja || '').indexOf('Precios') === 0 ? 'precios' : 'inventario';

    b.disabled = true;
    b.textContent = 'Bajando del site...';

    llamar({ accion: 'refrescar', que: que, token: estado.token })
      .then(function (r) {
        if (!r.ok) {
          $('aviso').textContent = r.error || 'No se pudo refrescar.';
          $('aviso').hidden = false;
          return;
        }
        estado.cache = {};
        estado.hojas = r.hojas || estado.hojas;
        pintarBotonesHoja();
        cargarHoja(estado.hoja);
      })
      .catch(function () {})
      .then(function () {
        b.disabled = false;
        b.textContent = 'Refrescar del site';
      });
  });

  /* ---------- Arranque ---------- */

  if (!URL_API || URL_API.indexOf('PON_AQUI') === 0) {
    mostrarLogin('Falta poner la URL del Web App en docs/config.js.');
    $('login-form').hidden = true;
  } else {
    var t = leerToken();
    if (t) {
      estado.token = t;
      llamar({ accion: 'estado', token: t })
        .then(function (r) { if (r.ok) mostrarApp(); else mostrarLogin(); })
        .catch(function () { mostrarLogin(); });
    } else {
      mostrarLogin();
    }
  }
})();
