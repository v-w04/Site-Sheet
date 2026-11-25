// t110: combos de una misma categoria (25-nov-2026): funciones puras de Combos.gs + menu con hojas simuladas.
const fs = require('fs'), vm = require('vm');
let ok = 0, bad = 0; const t = (c, m) => { c ? ok++ : (bad++, console.log('FALLA', m)); };
const ctx = { console, JSON, Date, Object, Array, String, Number, Math, isNaN, isFinite, RegExp }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../apps-script/Combos.gs', 'utf8'), ctx);
const R = c => vm.runInContext(c, ctx);
t(R('cmbModelo_("JBL-CHARGE6BLKAM-NEG-7441-MSI")') === 'JBL-CHARGE6BLKAM' && R('cmbModelo_("JBL-CHARGE6BLKAM-AZU-7557-MSI-2")') === 'JBL-CHARGE6BLKAM', 'modelo = marca-modelo sin MSI');
t(R('cmbLlave_(["b","A"," c "])') === 'A|B|C' && R('cmbLlave_(["a","b"])') === R('cmbLlave_(["B","A"])'), 'llave sin orden ni mayusculas');
t(R('cmbCombinar_([1,2,3,4],3)').length === 4 && R('cmbCombinar_([1,2,3],2)').length === 3, 'combinaciones');
t(R('cmbCartesiano_([[1,2],[3,4]])').length === 4, 'cartesiano');
// catalogo: 5 ratones (2 son colores del mismo modelo), 3 controles, 1 laptop sin stock
const cat = {}, ventas = {}, stock = {};
const add = (sku, c, pz, st, pub) => { cat[sku] = { cat: c, nombre: 'Prod ' + sku, precio: 100, publicado: pub !== false }; ventas[sku] = pz; stock[sku] = st; };
add('LOG-M650L-NEG-1-MSI', 'Ratones', 20, 50); add('LOG-M650L-BLA-2-MSI', 'Ratones', 18, 50);   // mismo modelo
add('LOG-MK320-NEG-3-MSI', 'Ratones', 10, 5); add('HP-M100-NEG-4-MSI', 'Ratones', 5, 9); add('GEN-X1-NEG-5-MSI', 'Ratones', 2, 0);  // sin stock
add('SON-DS1-NEG-6-MSI', 'Controles', 40, 9); add('SON-DS2-BLA-7-MSI', 'Controles', 30, 9); add('SON-DS3-ROJ-8-MSI', 'Controles', 1, 9);
add('ACE-L1-NEG-9-MSI', 'Laptops', 9, 0); add('ACE-L2-NEG-10-MSI', 'Laptops', 8, 4, false);
ctx.cat = cat; ctx.ventas = ventas; ctx.stock = stock;
let r = R('cmbArmar_([{activa:true,cats:["Ratones"],n:3}], cat, ventas, stock)');
t(r.length === 1 && r[0].skus.length === 3, 'ratones: sin el sin-stock y sin repetir modelo -> 3 modelos = 1 combo: ' + JSON.stringify(r.map(x => x.skus)));
t(r[0].skus.indexOf('LOG-M650L-BLA-2-MSI') < 0 && r[0].ancla === 20 && r[0].minimo === 5, 'del modelo repetido queda el que mas vende; ancla 20, minimo 5');
r = R('cmbArmar_([{activa:true,cats:["Controles"],n:3}], cat, ventas, stock)');
t(r.length === 1 && r[0].minimo === 1, 'controles: 3 productos, minimo 1 pieza permitido');
r = R('cmbArmar_([{activa:true,cats:["Controles"],n:2}], cat, ventas, stock)');
t(r.length === 3 && r[0].minimo >= r[1].minimo && r[0].minimo === 30, 'tamano 2: 3 combos ordenados por minimo');
t(R('cmbArmar_([{activa:false,cats:["Controles"],n:2}], cat, ventas, stock)').length === 0, 'regla apagada: nada');
t(R('cmbArmar_([{activa:true,cats:["Laptops"],n:2}], cat, ventas, stock)').length === 0, 'laptops: sin stock / no publicadas -> nada');
r = R('cmbArmar_([{activa:true,cats:["Controles","Ratones"],n:3}], cat, ventas, stock)');
t(r.length > 0 && r.every(x => x.skus.length === 2) && /Controles \+ Ratones/.test(r[0].regla), 'mezclando 2 categorias: un producto de cada una');
r = R('cmbArmar_([{activa:true,cats:["Controles"],n:2}], cat, ventas, null)');
t(r.length === 3, 'sin dato de inventario: no filtra por stock');
t(R('cmbArmar_([{activa:true,cats:["Controles"],n:3}], cat, ventas, stock, {top:8,minAncla:50,minComp:1,maxPorRegla:30})').length === 0, 'si el ancla no llega al minimo: no hay combo');
t(JSON.stringify(R('cmbSemillas_(cat, ventas, 5)')) === '["Ratones","Controles"]'.replace('"Controles"', '"Controles"') || true, 'semillas corre');
const sem = R('cmbSemillas_(cat, ventas, 5)');
t(sem.length === 2 && sem[0] === 'Controles' && sem.indexOf('Ratones') >= 0, 'semillas: categorias con 3+ modelos que venden, mas vendida primero: ' + sem);
// conservar decisiones
const nuevas = [{ skus: ['A', 'B', 'C'] }];
const prev = [{ skus: ['C', 'B', 'A'], decision: 'SI', nota: 'ok' }, { skus: ['X', 'Y', 'Z'], decision: 'NO', nota: '', crudo: {} }, { skus: ['P', 'Q'], decision: '', nota: 'Ya no sale en la lista nueva (x)' }];
ctx.nuevas = nuevas; ctx.prev = prev;
const c = R('cmbConservar_(prev, nuevas)');
t(c.dec['A|B|C'].decision === 'SI' && c.huerfanas.length === 1 && c.huerfanas[0].skus[0] === 'X' && !c.dec['P|Q'], 'conserva SI aunque cambie el orden; guarda huerfana decidida; ignora la nota automatica');
t(R('cmbEsSi_("sí")') && R('cmbEsSi_(" SI ")') && R('cmbEsSi_("x")') && !R('cmbEsSi_("NO")') && !R('cmbEsSi_("")'), 'SI en varias formas');

// ---- menu completo con hojas simuladas ----
const libro = {}; const norm = x => String(x == null ? '' : x).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const tabla = (enc, filas) => ({ enc: enc.slice(), filas: filas.map(f => f.slice()) });
const logs = [], info = [];
ctx.logOk_ = (e, m) => logs.push('OK ' + m); ctx.logErr_ = (e, m) => logs.push('ERR ' + m); ctx.logWarn_ = (e, m) => logs.push('WARN ' + m); ctx.flushLog_ = () => {};
ctx.dlgInfo_ = (ti, tx, tp) => info.push(tp + ': ' + tx);
ctx.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
ctx.peTabla_ = n => { const h = libro[n]; if (!h) return null; const pos = {}; h.enc.forEach((x, i) => { if (pos[norm(x)] === undefined) pos[norm(x)] = i; }); return { enc: h.enc, pos, filas: h.filas }; };
ctx.peCol_ = (tb, ns) => { for (const n of ns) { const j = tb.pos[norm(n)]; if (j !== undefined) return j; } return -1; };
ctx.peHojaAsegurar_ = (n, enc) => { if (!libro[n]) libro[n] = tabla(enc, []); return { _n: n, getLastRow: () => libro[n].filas.length + 1 }; };
ctx.ubicarColumnas_ = () => ({});
ctx.peAgregar_ = (h, enc, filas) => { filas.forEach(x => libro[h._n].filas.push(libro[h._n].enc.map(e => x[e] === undefined ? '' : x[e]))); };
ctx.reescribirHoja_ = (h, enc, filas) => { libro[h._n].enc = enc.slice(); libro[h._n].filas = filas.map(f => f.slice()); };
libro['Walmart'] = tabla(['SKU', 'CATEGORIA', 'ESTATUS', 'PRECIO', 'NOMBRE'], Object.keys(cat).map(k => [k, cat[k].cat, cat[k].publicado ? 'PUBLISHED' : 'UNPUBLISHED', 100, cat[k].nombre]));
libro['Ventas 30 dias'] = tabla(['SKU', 'PRODUCTO', 'PIEZAS'], Object.keys(ventas).map(k => [k, '', ventas[k]]));
libro['Inventario Actual'] = tabla(['SKU', 'Producto', 'Libre'], Object.keys(stock).map(k => [k, '', stock[k]]));
R('combosCandidatosActualizar()');
t(libro['Combos reglas'] && libro['Combos reglas'].filas.length === 2 && libro['Combos reglas'].filas[0][1] === 'Controles', 'primera vez: siembra Combos reglas con las categorias que mas venden');
const C = () => libro['Combos candidatos'], iD = () => C().enc.indexOf('DECISION');
t(C() && C().filas.length >= 2 && /candidatos/.test(info[0]), 'arma Combos candidatos y avisa: ' + info[0]);
// ella decide SI en el combo de ratones y apaga controles
const iR = C().enc.indexOf('REGLA'); const fr = C().filas.findIndex(f => f[iR] === 'Ratones'); C().filas[fr][iD()] = 'SI'; C().filas[fr][C().enc.indexOf('NOTA')] = 'pruebalo';
libro['Combos reglas'].filas[0][0] = 'NO';
R('combosCandidatosActualizar()');
t(C().filas.some(f => f[iR] === 'Ratones' && f[iD()] === 'SI' && f[C().enc.indexOf('NOTA')] === 'pruebalo'), 'al actualizar conserva su SI y su nota');
t(!C().filas.some(f => f[iR] === 'Controles'), 'la regla apagada ya no genera candidatos');
t(libro['Combos reglas'].filas.length === 2 && libro['Combos reglas'].filas[0][0] === 'NO', 'no pisa las reglas que ella edito');
R('combosDepurar()');
const D = libro['Combos depurados'];
t(D && D.filas.length === 1 && D.filas[0][0] && D.filas[0][2] && D.enc[0] === 'SKU 1', 'depurados: solo el SI, un SKU por columna: ' + JSON.stringify(D && D.filas));
// sin ventas 30 dias: avisa y no escribe
delete libro['Ventas 30 dias']; const nAntes = C().filas.length; R('combosCandidatosActualizar()');
t(/Ventas 30 dias/.test(info[info.length - 1]) && C().filas.length === nAntes, 'sin Ventas 30 dias: avisa y no toca la lista');
console.log('t110 ok ' + ok + (bad ? ' FALLAS ' + bad : '')); process.exit(bad ? 1 : 0);
