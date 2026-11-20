// Columna QUE HACER: 4 estados simples (✅ ⏳ 🟡 🔴) calculados desde ESTADO ODOO / NOTA / casilla / ORIGEN / CANCELADA EN WALMART.
const fs=require('fs'),vm=require('vm');
const ctx={console};vm.createContext(ctx);
const cargar=f=>vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8'),ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const warns=[];ctx.logOk_=()=>{};ctx.logInfo_=()=>{};ctx.logWarn_=(e,m)=>warns.push(m);ctx.logErr_=()=>{};ctx.flushLog_=()=>{};
cargar('Columnas.gs');cargar('Cancelaciones.gs');cargar('CancelacionesSobreventa.gs');cargar('CancelacionesWalmart.gs');cargar('CancelacionesPrecio.gs');cargar('CancelacionesWalmartAuto.gs');cargar('CancelacionesEstado.gs');
const E=f=>ctx.canEstadoSimple_(f);
const ini=s=>String(s).slice(0,2); // emoji (✅ y ⏳ ocupan 1 unidad; 🟡 🔴 ocupan 2)
const em=s=>/^✅/.test(s)?'ok':/^⏳/.test(s)?'espera':/^🟡/.test(s)?'decide':/^🔴/.test(s)?'mano':'?';
const caso=(f,esp,m)=>{const r=E(f);t(em(r)===esp,m+' -> '+r)};
// canceladas
caso({origen:'CORREO',estado:'CANCELADO EN ODOO',casilla:true},'ok','correo cancelada');
caso({origen:'CORREO',estado:'CANCELADO EN SITE',casilla:true},'ok','correo cancelada en site');
caso({origen:'PRECIO ERRONEO',estado:'CANCELADO EN ODOO',casilla:true,yaWalmart:true,dias:1},'ok','precio erroneo con Walmart hecho');
caso({origen:'PRECIO ERRONEO',estado:'CANCELADO EN ODOO',casilla:true,yaWalmart:false,dias:1},'espera','precio erroneo falta Walmart: la extension lo cancela sola (19-nov)');
caso({origen:'PRECIO ERRONEO',estado:'CANCELADO EN ODOO',casilla:true,yaWalmart:false,dias:3,nota:'ERROR WALMART: no se pudo'},'mano','precio erroneo: Walmart fallo -> a mano');
caso({origen:'PRECIO ERRONEO',estado:'CANCELADO EN ODOO',casilla:true,yaWalmart:false,dias:9},'mano','precio erroneo de mas de 5 dias: ya no se cancela sola en Walmart');
caso({origen:'SOBREVENTA',estado:'CANCELADO EN ODOO',casilla:true,yaWalmart:false,dias:1},'mano','sobreventa: Walmart sigue a mano');
caso({origen:'PRECIO ERRONEO',estado:'PENDIENTE: orden activa en Odoo',casilla:true,yaWalmart:false,dias:1,nota:'ERROR WALMART: Walmart respondio'},'mano','precio erroneo pendiente con falla de Walmart -> a mano, Odoo espera');
caso({origen:'PRECIO ERRONEO',estado:'PENDIENTE: orden activa en Odoo',casilla:true,yaWalmart:true,dias:1},'espera','Walmart ya esta: falta Odoo/site');
caso({origen:'PRECIO ERRONEO',estado:'',casilla:false},'decide','precio sin casilla: decides tu');
t(/^📦 Pedido antiguo/.test(E({origen:'PRECIO ERRONEO',estado:'ERROR: no se cancelo en el site',casilla:true,dias:9,nota:'Esta venta ya salió de bodega'})),'20-nov: ERROR de un pedido antiguo (mas de 7 dias): ya no es rojo');
t(/^📦 Pedido antiguo/.test(E({origen:'CORREO',estado:'ERROR: no se cancelo',casilla:true,dias:21})),'correo antiguo con error: tampoco');
t(/^🔴 Cancelar a mano en Odoo\/site/.test(E({origen:'CORREO',estado:'ERROR: no se cancelo',casilla:true,dias:2})),'ERROR reciente: sigue en rojo');
t(/Walmart y en Odoo/.test(E({origen:'PRECIO ERRONEO',estado:'',casilla:false})),'3-7% dice que cancela en Walmart y en Odoo');
caso({origen:'SOBREVENTA',estado:'CANCELADO EN ODOO',casilla:true,dias:2},'mano','sobreventa falta Walmart');
caso({origen:'SOBREVENTA CVA',estado:'CANCELADO EN ODOO',casilla:true,dias:2,yaWalmart:true},'ok','sobreventa cva con Walmart');
caso({origen:'FRAUDE',estado:'CANCELADO EN ODOO',casilla:true,dias:2},'mano','fraude falta Walmart');
caso({origen:'PRECIO ERRONEO',estado:'CANCELADO EN ODOO',casilla:true,dias:40},'ok','vieja no pide Walmart');
caso({origen:'MANUAL',estado:'CANCELADO EN ODOO',casilla:true,dias:1},'ok','manual solo Odoo');
t(/Walmart/.test(E({origen:'PRECIO ERRONEO',estado:'CANCELADO EN ODOO',casilla:true,dias:1})),'dice que falta Walmart');
// por cancelar
caso({origen:'CORREO',estado:'PENDIENTE: orden activa en Odoo',casilla:true},'espera','correo con casilla');
caso({origen:'CORREO',estado:'',casilla:false},'espera','correo nuevo sin casilla se marca sola');
caso({origen:'SOBREVENTA',estado:'',casilla:true},'espera','sobreventa marcada');
caso({origen:'PRECIO ERRONEO',estado:'PENDIENTE: orden activa en Odoo',casilla:true},'espera','precio >5% marcada');
// tu decides
caso({origen:'PRECIO ERRONEO',estado:'',casilla:false},'decide','precio 3-5% sin casilla');
caso({origen:'PRECIO ERRONEO',estado:'PENDIENTE: orden activa en Odoo',casilla:false},'decide','precio 3-5% pendiente');
caso({origen:'SOBREVENTA PRUEBA',estado:'',casilla:false},'decide','sobreventa prueba');
caso({origen:'MANUAL',estado:'',casilla:false},'decide','manual sin casilla');
caso({origen:'CORREO',estado:'PENDIENTE: orden activa en Odoo',casilla:true,nota:'NO CANCELAR'},'decide','NO CANCELAR');
caso({origen:'CORREO',estado:'OJO pedido con mas productos que el correo, revisar',casilla:true},'decide','parcial');
// a mano
caso({origen:'CORREO',estado:'ERROR: no se cancelo en el site',casilla:true},'mano','error site');
caso({origen:'CORREO',estado:'ERROR: no se cancelo',casilla:true},'mano','error odoo');
caso({origen:'CORREO',estado:'OJO: salida hecha',casilla:true},'mano','salida hecha');
caso({origen:'CORREO',estado:'OJO cliente no es WALMART',casilla:true},'mano','no es walmart');
caso({origen:'CORREO',estado:'OJO PENDIENTE: orden activa en Odoo',casilla:true,nota:'SALIDA AL CLIENTE YA HECHA (x)'},'mano','ojo pendiente');
caso({origen:'CORREO',estado:'NO ENCONTRADA EN ODOO',casilla:true},'mano','no encontrada');
caso({origen:'CORREO',estado:'PENDIENTE: x',casilla:true,nota:'ERROR: algo'},'mano','error en nota');
// CANCELADO gana a ERROR en nota
caso({origen:'CORREO',estado:'CANCELADO EN ODOO',casilla:true,nota:'ERROR: viejo'},'ok','cancelado gana');
// ningun texto vacio y todos dicen que hacer
['','CORREO','PRECIO ERRONEO','SOBREVENTA','FRAUDE','MANUAL'].forEach(o=>['','CANCELADO EN ODOO','ERROR: x','OJO x','NO ENCONTRADA EN ODOO','PENDIENTE: x'].forEach(e=>[true,false].forEach(c=>t(E({origen:o,estado:e,casilla:c,dias:1}).length>5,'texto '+o+'|'+e+'|'+c))));
// ---- sync con hoja simulada (la columna se crea al final y se acomoda; solo se escribe SU columna) ----
function mk(rows){const s={rows,name:'Cancelaciones',reglas:[],
 getName:()=>'Cancelaciones',getLastRow:()=>s.rows.length,getLastColumn:()=>Math.max(...s.rows.map(r=>r.length)),getMaxColumns:()=>Math.max(...s.rows.map(r=>r.length))+5,getMaxRows:()=>s.rows.length+10,
 getFrozenRows:()=>1,setFrozenRows(){},setColumnWidth(){},getColumnWidth:()=>200,setFrozenColumns(){},insertColumnsAfter(){},moveColumns(){},
 getRange(r,c,nr=1,nc=1){const o={getValues:()=>{const a=[];for(let i=0;i<nr;i++){const x=[];for(let j=0;j<nc;j++)x.push((s.rows[r-1+i]||[])[c-1+j]??'');a.push(x)}return a},
  getValue:()=>(s.rows[r-1]||[])[c-1]??'',setValue:v=>{s.rows[r-1][c-1]=v;return o},setValues:vv=>{vv.forEach((row,i)=>row.forEach((v,j)=>{(s.rows[r-1+i]=s.rows[r-1+i]||[])[c-1+j]=v}));return o},
  setNumberFormat:()=>o,setFontWeight:()=>o,setBackground:()=>o,setFontColor:()=>o,insertCheckboxes:()=>o,setHorizontalAlignment:()=>o};return o}};return s}
const hoy=new Date();
const H=['ORIGEN','FECHA CORREO','ORDEN DE COMPRA#','CANCELAR EN ODOO','CANCELADA EN WALMART','ESTADO ODOO','NOTA ODOO','OTRA COLUMNA DE ELLA'];
const hoja=mk([H.slice(),
 ['CORREO',hoy,'6091',true,false,'CANCELADO EN ODOO','','x1'],
 ['PRECIO ERRONEO',hoy,'6092',true,false,'CANCELADO EN SITE','','x2'],
 ['PRECIO ERRONEO',hoy,'6093',false,false,'','','x3'],
 ['CORREO',hoy,'6094',true,false,'ERROR: no se cancelo','','x4'],
 ['','','',false,false,'','','']]);   // renglon vacio: QUE HACER vacio (19-nov)
ctx.getHoja_=()=>hoja;
const antes=JSON.stringify(hoja.rows.map(r=>r.slice(0,8)));
const n=ctx.canQueHacerSync_(hoja);
t(n===4,'sync cambia 4 celdas: '+n);
const cq=hoja.rows[0].indexOf('QUE HACER');t(cq>-1,'columna creada con encabezado');
t(em(hoja.rows[1][cq])==='ok'&&em(hoja.rows[2][cq])==='espera'&&em(hoja.rows[3][cq])==='decide'&&em(hoja.rows[4][cq])==='mano','estados por fila (precio erroneo cancelada en Odoo sin Walmart: espera, la extension la cancela): '+hoja.rows.slice(1).map(r=>em(r[cq])));
t(JSON.stringify(hoja.rows.map(r=>r.slice(0,8)))===antes,'no toca ninguna otra columna');
t(hoja.rows[5][cq]==='','renglon vacio (sin orden, pedido ni origen): QUE HACER vacio, no "Por cancelar"');
t(ctx.canQueHacerSync_(hoja)===0,'segunda corrida no cambia nada');
// la dueña marca CANCELADA EN WALMART -> pasa a ✅
hoja.rows[2][hoja.rows[0].indexOf('CANCELADA EN WALMART')]=true;
t(ctx.canQueHacerSync_(hoja)===1&&em(hoja.rows[2][cq])==='ok','marcar CANCELADA EN WALMART la pasa a ✅');
// sin filas / sin hoja: no rompe
const vacia=mk([H.slice()]);t(ctx.canQueHacerSync_(vacia)===0,'hoja sin filas');
ctx.getHoja_=()=>{throw new Error('sin hoja')};t(ctx.canQueHacerSync_()===0,'sin hoja no truena');
t(warns.some(w=>/QUE HACER/.test(w)),'queda aviso en Log');
// las reglas de color existen y no chocan con las viejas
const c=fs.readFileSync(__dirname+'/../apps-script/Cancelaciones.gs','utf8');t(/canQueHacerReglas_/.test(c)&&/REGEXMATCH/.test(c),'canFormato_ pone las reglas y las reconoce como propias');
console.log(ok+' ok'+(bad?', '+bad+' FALLA':''));process.exit(bad?1:0);
