/**
 * ============================================================
 *  WebAPI — endpoint JSON que consume el dashboard
 * ============================================================
 *
 * Se despliega con acceso "Cualquiera" a proposito: si Google fuera
 * el portero, bloquearia el fetch desde GitHub Pages y el dashboard
 * no cargaria nada. El portero es el password (Auth.gs).
 *
 * Quien abra la URL pelona solo ve {"ok":true,"servicio":"site-sheet"}.
 * Todo lo que devuelve datos exige token de sesion.
 *
 * TRAMPA CONOCIDA: subir con clasp NO actualiza la URL /exec. Hay que
 * ir a Implementar > Administrar implementaciones > lapiz > Version:
 * Nueva version. Si no, la URL sigue sirviendo codigo viejo y acabas
 * depurando un fantasma. "Nueva implementacion" NO es lo mismo: genera
 * otra URL y deja la anterior huerfana.
 */

function doGet(e)  { return manejar_(e); }

function doPost(e) {
  var cuerpo = {};
  try {
    if (e && e.postData && e.postData.contents) cuerpo = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'JSON invalido' });
  }
  return manejar_({ parameter: cuerpo });
}

function manejar_(e) {
  var p = (e && e.parameter) || {};
  var accion = p.accion || p.action || 'ping';

  try {
    if (accion === 'ping')   return json_({ ok: true, servicio: 'site-sheet' });
    if (accion === 'login')  return json_(login_(p.password || '', p.huella || ''));
    if (accion === 'logout') { destroySession_(p.token); return json_({ ok: true }); }

    // De aqui para abajo, todo exige sesion valida.
    if (!validateSession_(p.token)) return json_({ ok: false, error: 'sesion_invalida' });

    if (accion === 'catalogo') return json_({ ok: true, hojas: catalogoHojas_() });

    if (accion === 'tabla') {
      var hoja = p.hoja;
      if (!hoja || !hojaPermitida_(hoja)) {
        return json_({ ok: false, error: 'hoja no permitida' });
      }
      return json_({ ok: true, hoja: hoja, datos: leerTabla_(hoja) });
    }

    if (accion === 'estado') {
      return json_({
        ok: true,
        fetchHoy: fetchHoy_(),
        cuotaAgotada: cuotaAgotadaHoy_(),
        modo: props_().getProperty(PROP.TOKEN) ? 'token'
            : props_().getProperty(PROP.COOKIE) ? 'cookie' : 'ninguno',
        hojas: catalogoHojas_()
      });
    }

    if (accion === 'refrescar') {
      var que = p.que || 'todo';
      if (que === 'precios')        descargarPrecios();
      else if (que === 'inventario') descargarTodoStock();
      else                           bajarTodo();
      return json_({ ok: true, hojas: catalogoHojas_() });
    }

    return json_({ ok: false, error: 'accion desconocida: ' + accion });

  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * Lista blanca de hojas que el dashboard puede leer. Sin esto, alguien
 * con sesion podria pedir cualquier hoja del Sheet por nombre.
 */
function hojasPublicas_() {
  var lista = [HOJA.STOCK, HOJA.NEGATIVOS];
  MASTERS.forEach(function (m) {
    BANDAS.forEach(function (b) { lista.push(hojaPrecios_(m.id, b.id)); });
  });
  return lista;
}

function hojaPermitida_(nombre) {
  return hojasPublicas_().indexOf(nombre) !== -1;
}

/** Que hojas existen y cuantas filas tienen, para pintar el menu. */
function catalogoHojas_() {
  return hojasPublicas_().map(function (n) {
    return { nombre: n, filas: filasDatos_(n) };
  });
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
