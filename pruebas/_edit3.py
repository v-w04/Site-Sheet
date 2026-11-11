import io, os, re
os.chdir(os.path.expanduser('~/mnt/Site Sheet/pruebas'))

def edit(path, pairs):
    s = io.open(path, encoding='utf-8', newline='').read()
    for a, b in pairs:
        assert s.count(a) == 1, (path, s.count(a), a[:90])
        s = s.replace(a, b)
    io.open(path, 'w', encoding='utf-8', newline='').write(s)

# ---- t33: ahora la casilla manda ----
edit('t33.js', [
("ctx.CAN_HOJA='Cancelaciones';ctx.CAN_ETAPA='CANCEL';ctx.CAN_ESTADO='ESTADO ODOO';ctx.CAN_ORIGEN='ORIGEN';ctx.CAN_ORI_PRUEBA='PRUEBA';",
 "ctx.CAN_HOJA='Cancelaciones';ctx.CAN_ETAPA='CANCEL';ctx.CAN_ESTADO='ESTADO ODOO';ctx.CAN_ORIGEN='ORIGEN';ctx.CAN_ORI_PRUEBA='PRUEBA';ctx.CAN_CHECK='CANCELAR EN ODOO';"),
("const filas=[['609001','CORREO','CANCELADO EN ODOO'],['609002','CORREO',''],['609003','SOBREVENTA','OJO: algo'],['609002','CORREO',''],['609004','PRUEBA',''],['609005','',' ']];\nconst cols={'ORDEN DE COMPRA#':1,'ORIGEN':2,'ESTADO ODOO':3};",
 "const filas=[['609001','CORREO','CANCELADO EN ODOO',true],['609002','CORREO','',true],['609003','SOBREVENTA','OJO: algo',true],['609002','CORREO','',true],['609004','PRUEBA','',true],['609005','',' ',true],['609006','PRECIO ERRONEO','',false]];\nconst cols={'ORDEN DE COMPRA#':1,'ORIGEN':2,'ESTADO ODOO':3,'CANCELAR EN ODOO':4};"),
("t(p.map(x=>x.orden).join()==='609002,609003,609005','pendientes: sin cancelados, sin PRUEBA, sin repetidos');",
 "t(p.map(x=>x.orden).join()==='609002,609003,609005','pendientes: sin cancelados, sin PRUEBA, sin repetidos y SIN las de casilla apagada (609006)');"),
])

# ---- t46: casilla segun el % de perdida ----
edit('t46.js', [
("t(r.filas[0][0]==='PRECIO ERRONEO'&&r.filas[0][8]===false,'ORIGEN PRECIO ERRONEO y casilla de Odoo APAGADA');",
 "t(r.filas[0][0]==='PRECIO ERRONEO'&&r.filas[0][8]===true,'ORIGEN PRECIO ERRONEO y pierde 25.4%: casilla MARCADA (se cancela sola)');\n"
 "const C=(pct)=>F([{orden:'6091',pedido:'x',sku:'S',piezas:1,precio:1,minimo:2,pct}],mapa,enc.length,{},new Date(),new Date());\n"
 "t(C(-0.04).filas[0][8]===false&&/pierde 5% o menos/.test(C(-0.04).filas[0][9]),'pierde 4%: casilla APAGADA y la nota lo dice');\n"
 "t(C(-0.05).filas[0][8]===false,'pierde 5% exacto: casilla apagada, decide ella');\n"
 "t(C(-0.0500001).filas[0][8]===false,'5.00001%: dentro de la tolerancia de 6 decimales, apagada');\n"
 "t(C(-0.051).filas[0][8]===true,'5.1%: casilla marcada');\n"
 "t(C(-0.03).auto.length===0&&C(-0.03).espera.length===1&&C(-0.07).auto.length===1,'cuenta auto y espera por separado');"),
])
print('ok3')

# ---- t50: killers bajo minimo que pierden mas del tope = BAJO MINIMO (solo ventas desde que se activo) ----
src = io.open('t38.js', encoding='utf-8').read().split('\n')
cut = [i for i, l in enumerate(src) if l.startswith("const T=R('peMinimos_()')")][0]
head = '\n'.join(src[:cut]).replace('// PreciosErroneos.gs (simulado)', '// t50: killers bajo minimo. Base t38')
body = r"""
const T=R('peMinimos_()');
const dia=n=>new Date(2026,10,n);
const KS={'AAA-1-NEG-1':[{precio:900,ini:dia(1),fin:dia(30)}]};
const AC=(per,tope)=>({ex:{'AAA-1-NEG-1':per},base:{'AAA-1-NEG-1':per},tope:tope||3});
const base={tabla:T,killers:KS,asig:{},libres:{},acept:AC(7),modo:'auto',killerDesde:dia(5).getTime()};
const E=(v,c)=>R('peEvaluar_')(Object.assign({sku:'AAA-1-NEG-1',piezas:1,items:1,precio:900,fecha:dia(10),odoo:[]},v),Object.assign({},base,c||{}));
let r=E({});
t(r.sem==='BAJO MINIMO','killer vigente que esta en Killers bajo minimo con 7%: BAJO MINIMO');
t(Math.abs(r.pct+0.07)<1e-9,'su % es la perdida de Killers bajo minimo (-7%), no la diferencia contra el precio del killer: '+r.pct);
t(Math.abs(r.dif+70)<1e-6,'la diferencia $ sale de esa perdida (7% de $1000 = $70): '+r.dif);
t(/pierde 7% con el cupon/.test(r.nota),'la nota explica la perdida: '+r.nota);
t(E({fecha:dia(3)}).sem==='KILLER','venta ANTERIOR a la activacion de la regla: se sigue tratando como KILLER');
t(E({},{acept:AC(2.5)}).sem==='KILLER','killer que esta en la hoja pero pierde 3% o menos: KILLER');
t(E({},{acept:{ex:{},base:{},tope:3}}).sem==='KILLER','killer que NO esta en Killers bajo minimo: KILLER');
t(E({},{killerDesde:undefined}).sem==='BAJO MINIMO','sin fecha de activacion la regla aplica');
const CA=R('canpAuto_');
t(CA(R('peEvaluar_')({sku:'AAA-1-NEG-1',piezas:1,items:1,precio:900,fecha:dia(10),odoo:[]},base).pct)===true,'7% -> se cancela sola');
t(CA(R('peEvaluar_')({sku:'AAA-1-NEG-1',piezas:1,items:1,precio:900,fecha:dia(10),odoo:[]},Object.assign({},base,{acept:AC(4.2)})).pct)===false,'4.2% -> espera la casilla');
t(CA(R('peEvaluar_')({sku:'AAA-1-NEG-1',piezas:1,items:1,precio:900,fecha:dia(10),odoo:[]},Object.assign({},base,{acept:AC(5)})).pct)===false,'5% exacto -> espera la casilla');
t(E({precio:900},{killers:{}}).sem==='BAJO MINIMO'&&E({precio:900},{killers:{}}).pct===-0.1,'sin killer: -10% -> BAJO MINIMO con su diferencia normal');
// la fecha de activacion se fija sola la primera vez
const k1=R('peKillerDesde_()');t(k1>0&&props.PE_KILLER_DESDE===String(k1),'peKillerDesde_ guarda la fecha la primera vez');
t(R('peKillerDesde_()')===k1,'y no la cambia despues');
console.log('t50: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
"""
io.open('t50.js', 'w', encoding='utf-8', newline='').write(head + '\n' + body)

# ---- t51: la extension solo cancela filas con casilla marcada + migracion unica ----
t51 = r"""// t51: CancelacionesSite.gs: la casilla CANCELAR EN ODOO manda; migracion unica; resultado marca la casilla.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const R=s=>vm.runInContext(s,ctx);
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m,d)=>logs.push([k,e,m,d]));ctx.flushLog_=()=>{};
const props={};ctx.props_=()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=String(v)}});
ctx.CAN_HOJA='Cancelaciones';ctx.CAN_ETAPA='CANCEL';ctx.CAN_ESTADO='ESTADO ODOO';ctx.CAN_ORIGEN='ORIGEN';ctx.CAN_ORI_PRUEBA='PRUEBA';ctx.CAN_ORI_PRECIO='PRECIO ERRONEO';
ctx.CAN_CHECK='CANCELAR EN ODOO';ctx.CAN_NOTA='NOTA ODOO';ctx.CAN_POR='CANCELADO POR';ctx.CAN_FECHA_ODOO='FECHA ODOO';ctx.CAN_PROP_PERSONA='P';ctx.CAN_PERSONA_DEFECTO='victor';
ctx.ahora_=()=>'2026-11-11 10:00:00';ctx.avisoLogDia_=(a,b,c,d)=>logs.push(['AV',c,d]);
ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
ctx.normEnc_=x=>String(x);ctx.csAutorizar_=()=>null;
const E=['ORDEN DE COMPRA#','ORIGEN','ESTADO ODOO','CANCELAR EN ODOO','NOTA ODOO','CANCELADO POR','FECHA ODOO'];
const cols={};E.forEach((e,i)=>cols[e]=i+1);
let filas;
const reset=()=>{filas=[
 ['609001','CORREO','CANCELADO EN SITE',false,'',' ',''],           // 0 cancelada: la casilla se marca
 ['609002','CORREO','PENDIENTE: orden activa en Odoo',false,'','',''],  // 1 correo pendiente: se marca y se cancela
 ['609003','SOBREVENTA','',false,'','',''],                          // 2
 ['609004','PRUEBA','',false,'','',''],                              // 3 prueba: no
 ['609005','PRECIO ERRONEO','',false,'Precio erroneo: vendida a $1 con minimo $2 (7.2% abajo)','',''],      // 4 >5%: se marca
 ['609006','PRECIO ERRONEO','',false,'Precio erroneo: vendida a $1 con minimo $2 (4.1% abajo) · pierde 5% o menos: marca CANCELAR EN ODOO si la quieres cancelar','',''], // 5 no
 ['609007','PRECIO ERRONEO','',false,'Precio erroneo: vendida a $1 con minimo $2 (5.0% abajo) · pierde 5% o menos: marca CANCELAR EN ODOO si la quieres cancelar','',''], // 6 5.0 no
 ['609008','MANUAL','',true,'','',''],                               // 7 ya marcada
 ['609009','CORREO','OJO algo',false,'','','']];};                   // 8 OJO: se marca pero la extension no la toma
reset();
ctx.getHoja_=()=>({getLastRow:()=>filas.length+1,getRange:(r,c,n,w)=>{w=w||1;return{
  getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,k)=>(filas[r-2+i]||[])[c-1+k])),
  setValues:v=>v.forEach((row,i)=>row.forEach((x,k)=>{filas[r-2+i][c-1+k]=x})),
  setValue:x=>{filas[r-2][c-1]=x}}}});
ctx.canMapaHoja_=()=>({mapa:cols});ctx.canColVals_=(h,c,n)=>filas.map(f=>f[c-1]);
ctx.csDirectoPausado_=()=>true;
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CancelacionesPrecio.gs','utf8'),ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CancelacionesSite.gs','utf8'),ctx);

// 1) sin migrar: solo la ya marcada (609008) sale hacia la extension
let o=R('csParaExtension_()');
t(o.join()==='609008','sin migrar solo sale la que tiene casilla marcada: '+o.join());
// 2) migracion
const n=R('canCasillasV2_()');
t(filas[0][3]===true,'cancelada: casilla marcada');
t(filas[1][3]===true&&filas[2][3]===true,'correo y sobreventa pendientes: marcadas (siguen cancelandose)');
t(filas[3][3]===false,'PRUEBA: no se marca');
t(filas[4][3]===true,'precio erroneo de 7.2%: marcada');
t(filas[5][3]===false&&filas[6][3]===false,'precio erroneo de 4.1% y de 5.0%: siguen apagadas (decide ella)');
t(filas[7][3]===true&&filas[8][3]===true,'manual marcada se queda; OJO se marca (pero abajo se ve que no sale)');
t(props.CAN_CASILLAS_V2==='1'&&n===5,'migracion unica anotada: '+n);
t(R('canCasillasV2_()')===0,'no se repite');
filas[1][3]=false;R('canCasillasV2_()');t(filas[1][3]===false,'si ella apaga una despues, la migracion NO la vuelve a marcar');
filas[1][3]=true;
// 3) extension: marcadas, sin cancelada, sin OJO, sin PRUEBA, sin las apagadas
o=R('csParaExtension_()');
t(o.join()==='609002,609003,609005,609008','sale solo lo marcado y pendiente: '+o.join());
// 4) ella marca una de 5% -> sale en la siguiente vuelta
filas[5][3]=true;o=R('csParaExtension_()');t(o.indexOf('609006')>=0,'si ella marca 609006 entra en la siguiente vuelta');
filas[5][3]=false;
// 5) resultado de la extension: cancelada => casilla marcada y estado
filas[6][3]=false;
R('csRecibirResultado_')({ok:true,orden:'609007'});
t(filas[6][2]==='CANCELADO EN SITE'&&filas[6][3]===true,'resultado OK: estado CANCELADO EN SITE y casilla marcada');
// 6) sin columna de casilla no se cancela nada y avisa
delete cols['CANCELAR EN ODOO'];logs.length=0;
t(R('csParaExtension_()').length===0&&logs.some(l=>l[0]==='AV'),'sin la columna de casilla no se cancela nada y avisa al Log');
console.log('t51: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
"""
io.open('t51.js', 'w', encoding='utf-8', newline='').write(t51)
print('ok t50 t51')
