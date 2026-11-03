// Canceladas en camino (CanceladasEnCamino.gs). Datos simulados, no es una corrida real.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m)=>logs.push([k,e,m]));
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/CanceladasEnCamino.gs','utf8'),ctx);
const C=vm.runInContext('cecClasificar_',ctx);
t(C({envio:'recolectado',dias:2}).accion==='Esperar que regrese','en camino reciente');
t(C({envio:'recolectado',dias:12}).accion==='Dar seguimiento con la paqueteria','en camino mucho tiempo');
t(C({envio:'entregado',dias:3}).estado==='ENTREGADA','entregada y cancelada');
t(C({envio:'cancelado',dias:3}).estado==='GUIA CANCELADA','guia cancelada despues');
t(C({envio:'entregado',dias:3,recibido:'2026-11-05'}).estado==='CERRADO','recibido cierra');
// cecActualizar_: detecta solo las que ya salieron, conserva las previas y no duplica
const encV=['FOLIO','REFERENCIA','FECHA','SKU','PRODUCTO','PIEZAS','PRECIO','ODOO ESTADO','ENVIO ESTADO','ENVIO PAQUETERIA','ENVIO GUIA'];
const ventas=[encV,
 ['609130690801881','600000141030052','2026-11-01 13:41:47','HP-1','Laptop',1,4549,'cancel','recolectado','MXFDD','G1'],
 ['609130000000002','600000000000002','2026-10-30 10:00:00','AAA','X',1,100,'cancel','cancelado','','' ],
 ['609130000000003','600000000000003','2026-10-29 10:00:00','BBB','Y',1,100,'','recolectado','','' ]];
let propias=null,escrito=null;
ctx.peTabla_=n=>{const d=n==='Ventas Walmart'?ventas:propias;if(!d)return null;const pos={};d[0].forEach((x,i)=>pos[String(x).trim().toUpperCase()]=i);return{enc:d[0],pos,filas:d.slice(1)}};
ctx.normEnc_=x=>String(x).trim().toUpperCase();
ctx.TZ='America/Mexico_City';
ctx.Utilities={formatDate:(d,z,f)=>d.toISOString().slice(0,10)};
const hoja={getLastRow:()=>propias?propias.length:0,getLastColumn:()=>propias?propias[0].length:0,getRange:()=>({getValues:()=>[propias?propias[0]:[]],setValue:()=>{}})};
ctx.SpreadsheetApp={getActive:()=>({getSheetByName:n=>n==='Cancelada en camino'&&propias?hoja:null,insertSheet:()=>hoja})};
ctx.vdEscribir_=(h,e,f)=>{escrito={e,f};propias=[e.concat(['RECIBIDO','NOTAS'])].concat(f.map(r=>r.concat(['','' ])))};
let r=vm.runInContext('cecActualizar_()',ctx);
t(r.nuevas.length===1&&r.nuevas[0]==='609130690801881','solo entra la cancelada que ya salio (no la guia cancelada sin salida, ni la no cancelada)');
t(escrito.f.length===1&&escrito.f[0][escrito.e.indexOf('ESTADO')]==='EN CAMINO','fila nueva en camino');
// segunda corrida: ya existe, no se duplica; pasa a entregado
ventas[1][8]='entregado';
r=vm.runInContext('cecActualizar_()',ctx);
t(r.nuevas.length===0&&escrito.f.length===1&&escrito.f[0][0]==='ENTREGADA','no duplica y actualiza el estado');
// la venta sale de Ventas Walmart: la fila previa se conserva
ventas.splice(1,1);
r=vm.runInContext('cecActualizar_()',ctx);
t(escrito.f.length===1,'no se borran las filas previas');
console.log('t44: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
