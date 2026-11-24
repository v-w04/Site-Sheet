// GuiasAuto.gs (lado del Sheet): que pedidos se RETIENEN y cuales se ENVIAN; Web App con clave; reporte; casilla ENVIAR.
const fs=require('fs'),vm=require('vm');
const ctx={console};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const logs=[];ctx.logOk_=(e,m)=>logs.push(['OK',e,m]);ctx.logWarn_=(e,m)=>logs.push(['WARN',e,m]);ctx.logErr_=(e,m)=>logs.push(['ERR',e,m]);ctx.logInfo_=()=>{};ctx.flushLog_=()=>{};
const props={};ctx.props_=()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=String(v)}});
let auth=null;ctx.csAutorizar_=p=>auth;
// 20-nov: primer bloqueo = correos de cancelacion revisados al momento (Gmail simulado)
let correos=[],gmailFalla=false;const cache={};
ctx.CacheService={getScriptCache:()=>({get:k=>k in cache?cache[k]:null,put:(k,v)=>{cache[k]=v}})};
ctx.GmailApp={search:()=>{if(gmailFalla)throw new Error('gmail caido');return correos.length?[{getMessages:()=>correos}]:[]}};
const cargar=f=>vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8'),ctx);
cargar('Columnas.gs');cargar('Cancelaciones.gs');cargar('CancelacionesSobreventa.gs');cargar('CancelacionesPrecio.gs');cargar('GuiasGrandes.gs');cargar('GuiasAuto.gs');
const G=f=>ctx.gaListas_(f);
// ---- reglas del dueño ----
let l=G([{orden:'6091',origen:'CORREO',estado:'CANCELADO EN ODOO',casilla:true,enviar:false}]);
t(l.enviar.join()==='6091'&&!l.retener.length,'correo ya cancelado en Odoo: se envia');
l=G([{orden:'6091',origen:'CORREO',estado:'',casilla:true}]);t(l.retener.join()==='6091','correo todavia sin cancelar: se espera');
['PENDIENTE','ERROR no pude','OJO entrega ya salio','NO ENCONTRADA EN ODOO','NOTA ODOO (NO CANCELAR)',''].forEach((e,i)=>{l=G([{orden:'63'+i,origen:'FRAUDE',estado:e,casilla:true}]);t(l.retener.length===1&&!l.enviar.length,'fraude con estado "'+e+'": se espera (no hay estatus de cancelado)')});
l=G([{orden:'6098',origen:'CORREO',estado:'CANCELADO EN SITE',casilla:true}]);t(l.enviar.join()==='6098','CANCELADO EN SITE tambien vale');
l=G([{orden:'6092',origen:'PRECIO ERRONEO',estado:'PENDIENTE',casilla:true}]);t(l.retener.join()==='6092','precio erroneo >5% aun sin cancelar en Odoo: se espera');
l=G([{orden:'6092',origen:'PRECIO ERRONEO',estado:'CANCELADO EN ODOO',casilla:true}]);t(l.retener.join()==='6092'&&!l.enviar.length,'precio erroneo >5% YA cancelado en Odoo: su guia NUNCA sale sola (la cancelas tu en Walmart y se queda en Guias de Walmart)');
l=G([{orden:'6092',origen:'PRECIO ERRONEO',estado:'CANCELADO EN ODOO',casilla:false,enviar:true}]);t(l.retener.join()==='6092'&&!l.forzados.length,'precio erroneo cancelado + ENVIAR: no se envia');
l=G([{orden:'6093',origen:'PRECIO ERRONEO',estado:'',casilla:false,enviar:false}]);t(l.retener.join()==='6093','precio 3-5% sin decidir: se retiene');
l=G([{orden:'6094',origen:'PRECIO ERRONEO',casilla:false,enviar:true}]);t(l.enviar.join()==='6094'&&l.forzados.join()==='6094'&&!l.retener.length,'precio 3-5% con ENVIAR: se envia y salta el candado de precio');
l=G([{orden:'6095',origen:'PRECIO ERRONEO',estado:'PENDIENTE',casilla:true,enviar:true}]);t(l.retener.join()==='6095'&&l.conflictos.join()==='6095','ENVIAR y CANCELAR a la vez (aun sin cancelar): se retiene y se avisa');
['SOBREVENTA','SOBREVENTA CVA','SOBREVENTA MANUAL','SOBREVENTA PRUEBA'].forEach((o,i)=>{
  ['CANCELADO EN ODOO','CANCELADO EN SITE','PENDIENTE',''].forEach((e,j)=>{
    l=G([{orden:'61'+i+j,origen:o,estado:e,casilla:true,enviar:true}]);t(l.retener.length===1&&!l.enviar.length&&!l.forzados.length,o+' ('+e+'): su guia NUNCA se envia (aunque este cancelada en Odoo y marquen ENVIAR)');
    l=G([{orden:'62'+i+j,origen:o,estado:e,casilla:false,enviar:true}]);t(l.retener.length===1&&!l.enviar.length&&!l.forzados.length,o+' ('+e+'): ENVIAR no la libera');
  });
});
['FRAUDE','MANUAL'].forEach((o,i)=>{
  l=G([{orden:'64'+i,origen:o,estado:'CANCELADO EN ODOO',casilla:true}]);t(l.enviar.join()==='64'+i,o+' ya cancelado en Odoo: se envia');
  l=G([{orden:'65'+i,origen:o,estado:'PENDIENTE',casilla:true,enviar:true}]);t(l.retener.length===1&&!l.forzados.length,o+' sin cancelar: ENVIAR solo vale para precio erroneo, se espera');
});
l=G([{orden:'6096',origen:'CORREO',estado:'CANCELADO EN ODOO'},{orden:'6096',origen:'PRECIO ERRONEO',estado:'PENDIENTE',casilla:true}]);t(l.retener.join()==='6096'&&!l.enviar.length,'un pedido con una fila cancelada y otra pendiente: se espera');
l=G([{orden:'6096',origen:'CORREO',estado:'CANCELADO EN ODOO'},{orden:'6096',origen:'FRAUDE',estado:'CANCELADO EN SITE',casilla:true}]);t(l.enviar.join()==='6096','todas las filas canceladas: se envia');
l=G([{orden:'6096',origen:'CORREO',estado:'CANCELADO EN ODOO'},{orden:'6096',origen:'SOBREVENTA',estado:'CANCELADO EN ODOO',casilla:true}]);t(l.retener.join()==='6096','si una fila es sobreventa, el pedido no se envia');
l=G([{orden:'6097.0',origen:'CORREO',estado:'CANCELADO EN ODOO'},{orden:'',origen:'PRECIO ERRONEO'},{orden:null,origen:'x'}]);t(l.enviar.join()==='6097'&&!l.retener.length,'numeros con .0 y filas sin orden no rompen');
l=G([]);t(!l.retener.length&&!l.enviar.length,'lista vacia');
// ---- hoja simulada ----
function mk(rows){const s={rows,getLastRow:()=>s.rows.length,getLastColumn:()=>Math.max(...s.rows.map(r=>r.length)),getMaxColumns:()=>Math.max(...s.rows.map(r=>r.length))+3,getMaxRows:()=>s.rows.length+5,getFrozenRows:()=>1,setFrozenRows(){},insertColumnsAfter(){},
 getRange(r,c,nr=1,nc=1){const o={getValues:()=>{const a=[];for(let i=0;i<nr;i++){const x=[];for(let j=0;j<nc;j++)x.push((s.rows[r-1+i]||[])[c-1+j]??'');a.push(x)}return a},setValue:v=>{s.rows[r-1][c-1]=v;return o},
  setValues:vv=>{vv.forEach((row,i)=>row.forEach((v,j)=>{(s.rows[r-1+i]=s.rows[r-1+i]||[])[c-1+j]=v}));return o},setNumberFormat:()=>o,setFontWeight:()=>o,insertCheckboxes:()=>o,setHorizontalAlignment:()=>o};return o}};return s}
const H=['ORIGEN','ORDEN DE COMPRA#','CANCELAR EN ODOO','ESTADO ODOO','OTRA'];
let hoja=mk([H.slice(),['CORREO','6091',true,'CANCELADO EN ODOO',''],['PRECIO ERRONEO','6092',true,'PENDIENTE',''],['PRECIO ERRONEO','6093',false,'',''],['SOBREVENTA','6094',true,'CANCELADO EN ODOO','']]);
ctx.getHoja_=()=>hoja;
// sin la columna ENVIAR todavia: lee igual (nadie marco ENVIAR)
let r=ctx.gaEntregarLista_({});
t(r.ok&&r.retener.join()==='6092,6093,6094'&&r.enviar.join()==='6091','sin columna ENVIAR: espera lo pendiente y sobreventa, envia el correo ya cancelado: '+JSON.stringify(r));
t(r.umbralPct===3,'manda el umbral de precio del Sheet (3%)');
t(r.esperaMin===30,'manda la espera minima de 30 min antes de comprar una guia');
t(r.maxPiezas===5&&Array.isArray(r.grandesListos),'manda el limite de piezas (5) y la lista de pedidos con guias listas (24-nov)');
t(r.lecturaMin===9999,'sin lectura de correos registrada: lecturaMin enorme (la extension no compra)');
props.CAN_LECT_OK_TS=String(Date.now()-7*60000);r=ctx.gaEntregarLista_({});t(r.lecturaMin>=6&&r.lecturaMin<=8,'lecturaMin = minutos desde la ultima lectura de correos de cancelacion: '+r.lecturaMin);
// el precio erroneo 6092 ya se cancelo en Odoo -> ahora si se envia
hoja.rows[2][3]='CANCELADO EN ODOO';
r=ctx.gaEntregarLista_({});t(r.enviar.join()==='6091'&&r.retener.join()==='6092,6093,6094','6092 (precio erroneo) cancelado en Odoo: sigue retenido, nunca se envia solo');
hoja.rows[2][3]='PENDIENTE';
// crea la casilla ENVIAR y la lee
ctx.canAsegurarColumnas_=(h,encs)=>{encs.forEach(e=>{h.rows[0].push(e);for(let i=1;i<h.rows.length;i++)h.rows[i].push('')});};
ctx.gaCasillas_(hoja);const cE=hoja.rows[0].indexOf('ENVIAR');t(cE>-1,'crea la columna ENVIAR');
hoja.rows[3][cE]=true;   // 6093 (3-5%): ENVIAR
r=ctx.gaEntregarLista_({});t(r.enviar.join()==='6091,6093'&&r.forzados.join()==='6093'&&r.retener.join()==='6092,6094','ENVIAR en 6093: ahora se envia (forzado)');
// ENVIAR en sobreventa NO la libera
hoja.rows[4][cE]=true;r=ctx.gaEntregarLista_({});t(r.retener.includes('6094'),'ENVIAR en sobreventa no la libera (aunque ya este cancelada)');
// falla cerrado
correos=[{getDate:()=>new Date(),getSubject:()=>'Solicitud del Cliente',getPlainBody:()=>'Orden de compra# 609132598232251 Pedido# 600000138393038-1-1'}];for(const k in cache)delete cache[k];
r=ctx.gaEntregarLista_({});t(r.ok&&r.retener.includes('609132598232251')&&r.retenerCorreo.includes('609132598232251')&&r.retenerCorreo.includes('600000138393038'),'correo de cancelacion recien llegado (aun no en la hoja): se retiene al momento');
correos=[{getDate:()=>new Date(Date.now()-30*3600000),getSubject:()=>'Solicitud del Cliente',getPlainBody:()=>'609100000000001'}];for(const k in cache)delete cache[k];
r=ctx.gaEntregarLista_({});t(!r.retenerCorreo.includes('609100000000001'),'correos de mas de 24 h no cuentan');
gmailFalla=true;for(const k in cache)delete cache[k];t(ctx.gaEntregarLista_({}).error==='no_pude_revisar_correos_de_cancelacion','si Gmail no responde: falla cerrado (no se compra)');gmailFalla=false;correos=[];for(const k in cache)delete cache[k];
auth={ok:false,error:'no_autorizado'};t(ctx.gaEntregarLista_({}).error==='no_autorizado','sin clave valida: no entrega nada');
auth=null;ctx.getHoja_=()=>null;t(ctx.gaEntregarLista_({}).ok===false,'sin hoja Cancelaciones: falla cerrado (la extension no envia)');
ctx.getHoja_=()=>mk([['COLUMNA RARA'],['x']]);t(ctx.gaEntregarLista_({}).ok===false,'hoja sin ORDEN/ORIGEN: falla cerrado');
ctx.getHoja_=()=>{throw new Error('boom')};t(ctx.gaEntregarLista_({}).ok===false,'error leyendo la hoja: falla cerrado');
// ---- cancelados en el site sin fila: se anotan como MANUAL ----
ctx.hoy_=()=>'2026-11-15';ctx.TZ='America/Mexico_City';ctx.Utilities={parseDate:()=>new Date(2026,10,15),formatDate:(d)=>d.toISOString().slice(0,10)};ctx.SpreadsheetApp={flush(){}};
ctx.canAsegurarControl_=()=>{};ctx.canAsegurarOrden_=()=>{};ctx.canNuevasPrimero_=()=>{};ctx.canFijarCasillas_=()=>{};ctx.canFormato_=()=>{};ctx.canQueHacerSync_=()=>{};
ctx.escrInsertarArriba_=(h,n)=>{for(let i=0;i<n;i++)h.rows.splice(1,0,new Array(h.rows[0].length).fill(''));return 2;};
ctx.canAsegurarColumnas_=(h,encs)=>{encs.forEach(e=>{if(!h.rows[0].includes(e)){h.rows[0].push(e);for(let i=1;i<h.rows.length;i++)h.rows[i].push('')}});return {}};
ctx.getHoja_=()=>hoja;
const nFilas=hoja.rows.length;
let ag=ctx.gaAgregarManuales_(['609100000777','609100000777','abc','6091']);
t(ag.agregadas.join()==='609100000777'&&ag.yaEstaban===1&&hoja.rows.length===nFilas+1,'agrega UNA fila MANUAL por pedido nuevo (sin repetir ni basura) y no duplica los que ya estaban');
const fila=hoja.rows[1],cO=hoja.rows[0].indexOf('ORIGEN'),cP=hoja.rows[0].indexOf('ORDEN DE COMPRA#'),cEs=hoja.rows[0].indexOf('ESTADO ODOO'),cCh=hoja.rows[0].indexOf('CANCELAR EN ODOO');
t(fila[cO]==='MANUAL'&&fila[cP]==='609100000777'&&fila[cEs]==='CANCELADO EN ODOO'&&fila[cCh]===false,'fila: MANUAL, CANCELADO EN ODOO, sin casilla de cancelar (ya esta cancelada)');
r=ctx.gaEntregarLista_({});t(r.enviar.includes('609100000777')&&!r.retener.includes('609100000777'),'la siguiente corrida la envia (MANUAL + CANCELADO)');
const nF2=hoja.rows.length;ctx.gaAgregarManuales_(Array.from({length:41},(_,i)=>'6092000000'+String(i+10)));t(hoja.rows.length===nF2,'mas de 40 de golpe: no anota ninguno (algo raro) y avisa');
// ---- reporte ----
ctx.getHoja_=()=>hoja;
auth={ok:false,error:'no_autorizado'};t(ctx.gaRecibirReporte_({corrida:{}}).error==='no_autorizado'&&!props.GA_ULTIMA,'reporte sin clave no guarda');
auth=null;
r=ctx.gaRecibirReporte_({corrida:{modo:'real',comprados:['609100000001','x<script>'],saltados:{'sin medidas':['609100000002'],'retenido':['609100000003']},sinMedidas:[{po:'609100000002',sku:'SKU-2',producto:'Prod',cliente:'Juan Perez',direccion:'Calle 1'}],resultados:{ok:1,pend:0,mal:0},error:''}});
t(r.ok&&props.GA_ULTIMA,'guarda la ultima corrida');
const u=JSON.parse(props.GA_ULTIMA);
t(u.comprados.length===1&&!/Juan|Calle|script/.test(props.GA_ULTIMA),'solo guarda numeros de pedido validos y nada de clientes ni direcciones');
t(logs.some(x=>x[0]==='WARN'&&/SIN MEDIDAS/.test(x[2])&&/SKU-2/.test(x[2])),'avisa en el Log los SKU sin medidas');
const n0=logs.filter(x=>/SIN MEDIDAS en Odoo|Pedidos SIN MEDIDAS/.test(x[2])).length;
ctx.gaRecibirReporte_({corrida:{modo:'real',comprados:[],saltados:{},sinMedidas:[{po:'609100000002',sku:'SKU-2',producto:'P'}],resultados:{ok:0,pend:0,mal:0}}});
t(logs.filter(x=>/Pedidos SIN MEDIDAS en Odoo/.test(x[2])).length===1,'el aviso de sin medidas NO se repite cada hora con los mismos SKU');
ctx.gaRecibirReporte_({corrida:{modo:'real',comprados:[],saltados:{},sinMedidas:[{po:'609100000009',sku:'SKU-9',producto:'P'}],resultados:{}}});
t(logs.filter(x=>/Pedidos SIN MEDIDAS en Odoo/.test(x[2])).length===2,'si cambian los SKU, vuelve a avisar');
ctx.gaRecibirReporte_({corrida:{modo:'real',comprados:[],saltados:{},sinMedidas:[],resultados:{ok:0,pend:1,mal:0}}});
t(logs[logs.length-1][0]==='WARN','guia pagada sin marcar: queda como aviso');
t(/PRUEBA/.test(ctx.gaTextoCorrida_({modo:'prueba',comprados:['1','2']}))&&/2 se enviarian/.test(ctx.gaTextoCorrida_({modo:'prueba',comprados:['1','2']})),'texto de la prueba');
t(ctx.gaUltima_()&&typeof ctx.gaUltima_().ts==='number','gaUltima_ para el Reporte');
// ---- Web App ----
const api=fs.readFileSync(__dirname+'/../apps-script/WebAPI.gs','utf8');
t(/accion === 'guias_lista'\) return json_\(gaEntregarLista_\(cuerpo\)\)/.test(api)&&/accion === 'guias_reporte'\) return json_\(gaRecibirReporte_\(cuerpo\)\)/.test(api),'WebAPI enruta guias_lista y guias_reporte');
// ---- QUE HACER con ENVIAR ----
cargar('CancelacionesWalmart.gs');cargar('CancelacionesEstado.gs');
const E=f=>ctx.canEstadoSimple_(f);
t(/^✅ Se envía/.test(E({origen:'PRECIO ERRONEO',estado:'',casilla:false,enviar:true})),'QUE HACER: ENVIAR en precio erroneo = se envia');
t(/^🟡/.test(E({origen:'PRECIO ERRONEO',estado:'',casilla:true,enviar:true})),'QUE HACER: ENVIAR + CANCELAR = tu decides');
t(/^🟡/.test(E({origen:'PRECIO ERRONEO',estado:'',casilla:false,enviar:false})),'QUE HACER: precio sin decidir = tu decides');
// ---- resumen del Reporte: enviadas hoy / por salir / retenidas ----
{const hoyMs=Date.now();delete props['GA_HOY'];
 t(ctx.gaSumarHoy_(['6091','6092'],hoyMs)===2&&ctx.gaSumarHoy_(['6092','6093'],hoyMs)===3,'enviadas hoy: se suman sin repetir');
 t(ctx.gaHoy_()===3,'gaHoy_ cuenta lo de hoy');
 const rs=ctx.gaResumenReporte_({modo:'real',saltados:{'en espera de 30 min (por si el cliente se arrepiente)':['1','2'],'recien llegado: espera 30 min':['3'],'retenido por el Sheet (precio erroneo)':['4'],'sin venta en Odoo':['5'],'sin medidas':['6']},sinMedidas:[{po:'6',sku:'X'}]});
 t(/REAL/.test(rs)&&/enviadas hoy 3/.test(rs)&&/por salir 3/.test(rs)&&/retenidas 2/.test(rs)&&/sin medidas 1/.test(rs),'resumen: REAL, enviadas hoy 3, por salir 3, retenidas 2 (sin contar sin medidas), sin medidas 1: '+rs);
 t(/PRUEBA/.test(ctx.gaResumenReporte_({modo:'prueba'}))&&/ERROR: x/.test(ctx.gaResumenReporte_({modo:'real',error:'x'})),'resumen: modo prueba y error');
 props['GA_HOY']=JSON.stringify({dia:'2000-01-01',pos:['1','2']});
 t(ctx.gaHoy_()===0,'otro dia: el contador de hoy vuelve a 0');
 ctx.gaRecibirReporte_({corrida:{modo:'real',comprados:['609132297000001','609132297000002'],resultados:{ok:2}}});
 t(ctx.gaHoy_()===2,'al recibir el reporte REAL de la extension se suman a "enviadas hoy"');
 ctx.gaRecibirReporte_({corrida:{modo:'prueba',comprados:['609132297000003'],resultados:{}}});
 t(ctx.gaHoy_()===2,'una PRUEBA no suma a "enviadas hoy"');}
console.log('t76: '+ok+' ok'+(bad?', '+bad+' FALLA':''));process.exit(bad?1:0);
