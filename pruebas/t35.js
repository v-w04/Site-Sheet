// CancelacionesSite.gs (simulado): la extension pide pendientes y avisa resultados. Datos simulados, no es una corrida real.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const R=s=>vm.runInContext(s,ctx);
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m,d)=>logs.push([k,e,m,d]));ctx.flushLog_=()=>{};ctx.avisoLogDia_=(a,b,c,d)=>logs.push(['Aviso',c,d]);
const props={EXT_CLAVE_X:'secreta',ODOO_CANCELA_PIN:'1234',ODOO_CANCELA_PERSONA:'victor'};
ctx.props_=()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=v}});
ctx.EXT_PROP_CLAVE='EXT_CLAVE_X';ctx.EXT_MAX_FALLOS=3;ctx.EXT_BLOQUEO_SEG=600;
const cache={};ctx.CacheService={getScriptCache:()=>({get:k=>cache[k]||null,put:(k,v)=>{cache[k]=v},remove:k=>{delete cache[k]}})};
ctx.igualesSeguro_=(a,b)=>a===b;ctx.hoy_=()=>'2026-11-02';ctx.ahora_=()=>'2026-11-02 09:00:00';
ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
ctx.CAN_HOJA='Cancelaciones';ctx.CAN_ETAPA='CANCEL';ctx.CAN_ESTADO='ESTADO ODOO';ctx.CAN_NOTA='NOTA ODOO';ctx.CAN_POR='CANCELADO POR';ctx.CAN_FECHA_ODOO='FECHA ODOO';ctx.CAN_ORIGEN='ORIGEN';ctx.CAN_ORI_PRUEBA='PRUEBA';ctx.CAN_CHECK='CANCELAR EN ODOO';ctx.CAN_ORI_PRECIO='PRECIO ERRONEO';ctx.CAN_PROP_PIN='ODOO_CANCELA_PIN';ctx.CAN_PROP_PERSONA='ODOO_CANCELA_PERSONA';ctx.CAN_PERSONA_DEFECTO='x';
const cols={'ORDEN DE COMPRA#':1,'ORIGEN':2,'ESTADO ODOO':3,'NOTA ODOO':4,'CANCELADO POR':5,'FECHA ODOO':6,'CANCELAR EN ODOO':7};
const filas=[['609001','CORREO','CANCELADO EN ODOO','','',''],['609002','CORREO','','','',''],['609003','SOBREVENTA','OJO: algo','','',''],['609002','CORREO','','','',''],['609004','PRUEBA','','','',''],['609005','CORREO','','','',''],['609006','CORREO','','NO CANCELAR esta','','']];
filas.forEach(f=>{while(f.length<7)f.push(false)});   // casilla CANCELAR EN ODOO: todas apagadas; la migracion unica marca las que se cancelan solas
ctx.getHoja_=()=>({getLastRow:()=>filas.length+1,getRange:(r,c,n)=>({getValues:()=>filas.slice(r-2,r-2+n).map(f=>[f[c-1]]),setValues:v=>v.forEach((row,i)=>{filas[r-2+i][c-1]=row[0]}),setValue:v=>{filas[r-2][c-1]=v}})});
ctx.canMapaHoja_=()=>({mapa:cols});ctx.normEnc_=x=>String(x);ctx.canColVals_=(h,c,n)=>filas.map(f=>f[c-1]);
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CancelacionesSite.gs','utf8'),ctx);

// clave
let r=R('csEntregarPendientes_({clave:"mala"})');t(r.error==='no_autorizado'&&!r.pin,'clave mala: no entrega ni PIN');
// pausa activa -> entrega
r=R('csEntregarPendientes_({clave:"secreta"})');
t(r.ok&&r.pin==='1234'&&r.ordenes.join()==='609002,609005','entrega PIN y solo pendientes validos (sin cancelado/OJO/PRUEBA/NO CANCELAR): '+JSON.stringify(r));
t(!logs.some(l=>JSON.stringify(l).includes('1234')),'el PIN no se escribe en el Log');
r=R('csEntregarPendientes_({clave:"secreta"})');t(r.ordenes.length===2,'segunda entrega del dia aun permitida');
r=R('csEntregarPendientes_({clave:"secreta"})');t(r.ok&&r.ordenes.length===0,'a la tercera del dia ya no se entrega (tope 2)');
// directo activo -> no entrega
props.CANCELAR_ODOO_DIRECTO='1';r=R('csEntregarPendientes_({clave:"secreta"})');t(r.nota==='cancelacion_directa_activa'&&!r.pin,'con cancelacion directa activa no entrega');delete props.CANCELAR_ODOO_DIRECTO;
// resultado ok
r=R('csRecibirResultado_({clave:"secreta",orden:"609002",ok:true})');
t(r.ok&&filas[1][2]==='CANCELADO EN SITE'&&filas[3][2]==='CANCELADO EN SITE'&&filas[1][4]==='victor'&&filas[1][5],'resultado ok marca todas las filas del pedido');
R('csRecibirResultado_({clave:"secreta",orden:"609002",ok:true,aviso:"REGRESAR la mercancia",avisoCanal:"Cancelala en Walmart"})');
t(/REGRESAR/.test(filas[1][3])&&/Walmart/.test(filas[1][3])&&logs.some(l=>l[0]==='Warn'&&/AVISO/.test(l[2])),'los avisos del site van a la nota y al Log');
// resultado error
R('csRecibirResultado_({clave:"secreta",orden:"609005",ok:false,error:"Venta ya cancelada en Odoo",http:400})');
t(filas[5][2]==='CANCELADO EN SITE','"ya cancelada" cuenta como cancelada');
filas[5][2]='';
R('csRecibirResultado_({clave:"secreta",orden:"609005",ok:false,error:"Boom",http:500})');
t(/^ERROR/.test(filas[5][2])&&filas[5][3]==='Boom','otro error: ERROR + nota');
// no encontrada no bloquea
filas[5][2]='';R('csRecibirResultado_({clave:"secreta",orden:"609005",noEncontrada:true})');
t(filas[5][2]===''&&/No esta en el site/.test(filas[5][3]),'no encontrada: no cambia el estado, deja nota');
// pin malo bloquea ese PIN
R('csRecibirResultado_({clave:"secreta",orden:"609005",ok:false,razon:"pin_malo"})');
r=R('csEntregarPendientes_({clave:"secreta"})');t(r.error==='pin_rechazado_guarda_otro','pin_malo detiene las entregas');
props.ODOO_CANCELA_PIN='9999';props.CS_INTENTOS='{}';r=R('csEntregarPendientes_({clave:"secreta"})');t(r.ok&&r.pin==='9999','al guardar otro PIN se reanuda');
// bloqueo por claves malas
['a','b','c'].forEach(()=>R('csEntregarPendientes_({clave:"x"})'));r=R('csEntregarPendientes_({clave:"secreta"})');t(r.error==='bloqueado_espera_10_min','tras varios intentos malos se bloquea');
// orden sin numero raro
cache.EXT_FALLOS='0';r=R('csRecibirResultado_({clave:"secreta",orden:""})');t(r.error==='sin_orden','sin orden se rechaza');
// WebAPI
const w=fs.readFileSync(__dirname+'/../apps-script/WebAPI.gs','utf8');
t(/'cancel_pendientes'\) return json_\(csEntregarPendientes_/.test(w)&&/'cancel_resultado'\) return json_\(csRecibirResultado_/.test(w),'doPost enruta las dos acciones');
console.log(bad?'FALLAS '+bad:'t35 OK '+ok);process.exit(bad?1:0);
