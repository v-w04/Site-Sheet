// t51: CancelacionesSite.gs: la casilla CANCELAR EN ODOO manda; migracion unica; resultado marca la casilla.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const R=s=>vm.runInContext(s,ctx);
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m,d)=>logs.push([k,e,m,d]));ctx.flushLog_=()=>{};
const props={};ctx.props_=()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=String(v)}});
ctx.CAN_HOJA='Cancelaciones';ctx.CAN_ETAPA='CANCEL';ctx.CAN_ESTADO='ESTADO ODOO';ctx.CAN_ORIGEN='ORIGEN';ctx.CAN_ORI_PRUEBA='PRUEBA';ctx.CAN_ORI_PRECIO='PRECIO ERRONEO';
ctx.CAN_CHECK='CANCELAR EN ODOO';ctx.CAN_NOTA='NOTA ODOO';ctx.CAN_POR='CANCELADO POR';ctx.CAN_FECHA_ODOO='FECHA ODOO';ctx.CAN_PROP_PERSONA='P';ctx.CAN_PERSONA_DEFECTO='victor';
ctx.ahora_=()=>'2026-11-11 10:00:00';ctx.hoy_=()=>'2026-11-11';ctx.avisoLogDia_=(a,b,c,d)=>logs.push(['AV',c,d]);
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
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CancelacionesSobreventa.gs','utf8').replace(/\r\n/g,'\n').match(/function canColOrden_[\s\S]*?\n}\n/)[0],ctx);   // helper comun de Cancelaciones
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CancelacionesSite.gs','utf8'),ctx);
ctx.csAutorizar_=()=>null;   // la clave de la extension se prueba aparte

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
