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
t(vm.runInContext('cecDias_',ctx)(new Date(2026,9,27,10),new Date(2026,10,3,10).getTime())===7,'dias con fecha tipo Date');
t(vm.runInContext('cecDias_',ctx)('2026-10-27 10:00:00',new Date(2026,10,3,10).getTime())>=6,'dias con fecha texto');
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
const hoja={getLastRow:()=>propias?propias.length:0,getLastColumn:()=>propias?propias[0].length:0,deleteColumns:()=>{},getRange:()=>({getValues:()=>[propias?propias[0]:[]],setValue:()=>{}})};
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
// salida hecha: Walmart pidio cancelar, Odoo no deja, pero la entrega WH/OUT ya esta done -> entra aunque Odoo no diga cancel
t(C({envio:'sin_guia',dias:3,salida:true}).estado==='SALIDA HECHA','salida hecha clasifica aparte');
t(C({envio:'sin_guia',dias:11,salida:true}).accion==='Dar seguimiento con la paqueteria','salida hecha mucho tiempo');
t(C({envio:'entregado',dias:3,salida:true}).estado==='ENTREGADA','entregado manda sobre salida');
ventas.splice(1,ventas.length);ventas.push(['609130490159014','600000131615447','2026-10-30 10:06:15','HP-2','Laptop',1,4549,'','sin_guia','','' ]);
ventas.push(['609130111111111','600000111111111','2026-11-02 10:00:00','ZZZ','Z',1,100,'','sin_guia','','' ]);
propias=null;escrito=null;
const canc=[['ORDEN DE COMPRA#','ESTADO ODOO','TODAS LAS ENTREGAS'],
 ['609130490159014','ERROR: no se cancelo','WH/PICK/80124 (done), WH/PACK/84237 (done), WH/OUT/137341 (done)'],
 ['609130111111111','CANCELADO EN SITE','WH/PICK/80977 (assigned)']];
const peOrig=ctx.peTabla_;ctx.peTabla_=n=>n==='Cancelaciones'?{enc:canc[0],pos:{'ORDEN DE COMPRA#':0,'ESTADO ODOO':1,'TODAS LAS ENTREGAS':2},filas:canc.slice(1)}:peOrig(n);
r=vm.runInContext('cecActualizar_()',ctx);
t(r.nuevas.join()==='609130490159014','entra la HP con salida hecha; la que solo esta en PICK assigned no');
t(escrito.f[0][escrito.e.indexOf('ESTADO')]==='SALIDA HECHA','estado SALIDA HECHA');
console.log('t44: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
