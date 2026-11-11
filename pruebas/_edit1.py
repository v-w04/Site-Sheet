import io, os
os.chdir(os.path.expanduser('~/mnt/Site Sheet/apps-script'))

def edit(path, pairs):
    s = io.open(path, encoding='utf-8', newline='').read()
    for a, b in pairs:
        assert s.count(a) == 1, (path, s.count(a), a[:80])
        s = s.replace(a, b)
    io.open(path, 'w', encoding='utf-8', newline='').write(s)

# ---------------- CancelacionesPrecio.gs ----------------
edit('CancelacionesPrecio.gs', [
(""" *  Regla: una venta de Walmart que quedo MAS DE 5% POR DEBAJO del minimo (Precios erroneos, semaforo BAJO MINIMO; el 5% es solo para cancelar, la alerta de precio sigue igual)
 *  y que todavia se puede detener (sin cancelar y sin guia) se agrega sola a la hoja Cancelaciones con
 *  ORIGEN = PRECIO ERRONEO. Entran con las casillas APAGADAS: TU decides, venta por venta:
 *    - CANCELAR EN ODOO     -> la cancela la extension en el site (y de ahi Odoo), como el resto de Cancelaciones.
 *    - CANCELAR EN WALMART  -> menu Pedidos y casos > Cancelaciones > CANCELAR EN WALMART las marcadas (API de Walmart).
 *  Las que pierden 5% o menos no entran a Cancelaciones (la alerta de precio si las marca): se pueden seguir vendiendo. Una venta ya agregada no se vuelve a agregar.
 */
""",
""" *  Regla: TODA venta de Walmart bajo el minimo (Precios erroneos, semaforo BAJO MINIMO; los killers cuentan con su % de
 *  perdida de "Killers bajo minimo") que todavia se puede detener (sin cancelar y sin guia) se agrega sola a la hoja
 *  Cancelaciones con ORIGEN = PRECIO ERRONEO. La casilla CANCELAR EN ODOO decide si se cancela:
 *    - pierde MAS de 5%    -> entra con la casilla MARCADA: la extension la cancela en el site (y de ahi Odoo) sola.
 *    - pierde 5% o menos   -> entra con la casilla APAGADA: no se cancela; TU decides y si la marcas se cancela en la siguiente vuelta.
 *  (5% exacto lo decides tu: solo lo que pasa de 5.000000% se cancela solo.)
 *  Cancelar en Walmart (Seller Center) lo haces tu; este script no cancela nada en Walmart.
 *  Una venta ya agregada no se vuelve a agregar.
 */

var CANP_TOPE_AUTO = -0.05;   // pierde MAS que esto (fraccion negativa) -> casilla marcada y se cancela sola

/** true si la perdida (fraccion negativa, ej. -0.07) pasa del tope: se compara a 6 decimales para que 5% exacto NO se cancele solo. */
function canpAuto_(pct) {
  var p = Number(pct);
  if (isNaN(p)) return false;
  return Math.round(p * 1e6) / 1e6 < CANP_TOPE_AUTO;
}
"""),
("""  return 'Precio erroneo: vendida a $' + Math.round(Number(v.precio) || 0) + ' con minimo $' + Math.round(Number(v.minimo) || 0) + ' (' + pct + '% abajo)';""",
"""  return 'Precio erroneo: vendida a $' + Math.round(Number(v.precio) || 0) + ' con minimo $' + Math.round(Number(v.minimo) || 0) + ' (' + pct + '% abajo)' +
    (canpAuto_(v.pct) ? '' : ' · pierde 5% o menos: marca CANCELAR EN ODOO si la quieres cancelar');"""),
("""    poner(fila, CAN_CHECK, false);
    out.filas.push(fila); out.ordenes.push(o);""",
"""    var auto = canpAuto_(v.pct);
    poner(fila, CAN_CHECK, auto);
    out.filas.push(fila); out.ordenes.push(o);
    if (auto) out.auto.push(o); else out.espera.push(o);"""),
("""  var out = { filas: [], ordenes: [], yaEstaban: 0 };
  var visto = {};""",
"""  var out = { filas: [], ordenes: [], yaEstaban: 0, auto: [], espera: [] };
  var visto = {};"""),
("""  res.agregadas = r.ordenes;
  logWarn_(CAN_ETAPA, 'Precio erroneo (mas de 5% abajo del minimo): ' + r.ordenes.length + ' venta(s) agregadas a Cancelaciones con las casillas apagadas: ' + r.ordenes.join(', ') + '. Marca CANCELAR EN ODOO y/o CANCELAR EN WALMART las que quieras cancelar.', { ordenes: r.ordenes });""",
"""  res.agregadas = r.ordenes; res.auto = r.auto; res.espera = r.espera;
  logWarn_(CAN_ETAPA, 'Precio erroneo: ' + r.ordenes.length + ' venta(s) agregadas a Cancelaciones. ' +
    (r.auto.length ? 'Se cancelan solas (pierden mas de 5%): ' + r.auto.join(', ') + '. ' : '') +
    (r.espera.length ? 'Esperan tu casilla CANCELAR EN ODOO (pierden 5% o menos): ' + r.espera.join(', ') + '. ' : '') +
    'En Walmart las cancelas tu.', { ordenes: r.ordenes, auto: r.auto, espera: r.espera });"""),
])

# ---------------- PreciosErroneos.gs ----------------
edit('PreciosErroneos.gs', [
(""" *    - killer de ese SKU, a ese precio, vigente el dia de la venta (hoja "Killers historico")
 *    - killer que esta en "Killers bajo minimo" con perdida del tope (3%) o menos""",
""" *    - killer de ese SKU, a ese precio, vigente el dia de la venta (hoja "Killers historico"), SALVO que el SKU este en
 *      "Killers bajo minimo" con perdida mayor al tope (3%): ahi la venta es BAJO MINIMO con esa perdida (cupon ya descontado).
 *      Solo cuenta para ventas desde que se activo la regla (Script Property PE_KILLER_DESDE): las anteriores no se tocan.
 *    - killer que esta en "Killers bajo minimo" con perdida del tope (3%) o menos"""),
("""var PE_TOPE_CANCELAR = -0.05;                 // SOLO para cancelar: mas de 5% abajo del minimo pasa a la hoja Cancelaciones (ORIGEN = PRECIO ERRONEO). La deteccion/alerta sigue desde el minimo""",
"""// Toda venta BAJO MINIMO pasa a la hoja Cancelaciones (ORIGEN = PRECIO ERRONEO). Pierde mas de 5% (CANP_TOPE_AUTO, CancelacionesPrecio.gs): casilla marcada y se cancela sola; 5% o menos: casilla apagada, decides tu."""),
("""  var k = peKillerAplica_(ctx.killers, s, p, v.fecha, grupo);
  if (k) return {""",
"""  var k = peKillerAplica_(ctx.killers, s, p, v.fecha, grupo);
  if (k) {   // killer vigente: se salta, salvo killer de "Killers bajo minimo" que pierde mas del tope (solo ventas desde que se activo la regla)
    var perK = ctx.acept.ex[s] !== undefined ? ctx.acept.ex[s] : ctx.acept.base[baseSku];
    var desdeK = Number(ctx.killerDesde) || 0, fK = v.fecha instanceof Date ? v.fecha.getTime() : 0;
    if (perK !== undefined && !isNaN(perK) && perK > ctx.acept.tope + 0.0001 && fK >= desdeK) {
      return { min: min, dif: -(perK / 100) * min, pct: -(perK / 100), sem: 'BAJO MINIMO', nota: 'Killer $' + k.precio + ' bajo minimo: pierde ' + (Math.round(perK * 10) / 10) + '% con el cupon (Killers bajo minimo)' };
    }
  }
  if (k) return {"""),
("""acept: peAceptables_(), modo: peModo_() };
  var desde = peDesde_()""",
"""acept: peAceptables_(), modo: peModo_(), killerDesde: peKillerDesde_() };
  var desde = peDesde_()"""),
("""        var pc = Number(A['DIFERENCIA %'][j][0]);
        if (!(pc <= PE_TOPE_CANCELAR)) continue;
""",
"""        var pc = Number(A['DIFERENCIA %'][j][0]);
        if (isNaN(pc)) continue;
"""),
("""/** Revisa lo pendiente. Devuelve { revisadas, alertas, revisar, sinRef, sinMinimos }. */""",
"""/** Desde cuando cuenta la regla "killer bajo minimo que pierde mas del tope = precio erroneo" (ms). La primera vez que corre queda fijada a ese momento. */
function peKillerDesde_() {
  var ms = 0;
  try {
    ms = Number(props_().getProperty('PE_KILLER_DESDE')) || 0;
    if (!ms) { ms = Date.now(); props_().setProperty('PE_KILLER_DESDE', String(ms)); }
  } catch (e) {}
  return ms;
}

/** Revisa lo pendiente. Devuelve { revisadas, alertas, revisar, sinRef, sinMinimos }. */"""),
])
print('ok')
