// t57: Seller Center (hoja + extension) y el seguimiento de pedidos sin guia en Casos Walmart.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,isFinite,RegExp,parseFloat};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
ctx.TZ='America/Mexico_City';ctx.VH_HOJA='Ventas Walmart';ctx.CAN_HOJA='Cancelaciones';
ctx.normEnc_=x=>String(x==null?'':x).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
ctx.Utilities={formatDate:(d,tz,f)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
ctx.logs=[];ctx.logOk_=(e,m)=>ctx.logs.push('OK '+m);ctx.logWarn_=(e,m)=>ctx.logs.push('WARN '+m);ctx.logErr_=(e,m)=>ctx.logs.push('ERR '+m);ctx.logInfo_=()=>{};ctx.avisoDia_=()=>{};ctx.flushLog_=()=>{};
const props={CAW_SEMBRADA:'1'};ctx.vdProp_=k=>props[k]||'';ctx.vdSetProp_=(k,v)=>{props[k]=v};
ctx.Session={getEffectiveUser:()=>({getEmail:()=>'victor@test'})};
const src=(f)=>fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8');
vm.runInContext(src('PedidosRiesgo.gs'),ctx);
vm.runInContext(src('SellerCenter.gs'),ctx);
vm.runInContext(src('CasosWalmart.gs'),ctx);
const R=(code)=>vm.runInContext(code,ctx);

/* ---- hojas simuladas (iguales a t56) ---- */
function hoja(enc,filas){const h={enc:enc.slice(),filas:filas||[],maxRows:100};
 h.getLastRow=()=>h.filas.length+1;h.getLastColumn=()=>h.enc.length;h.getMaxRows=()=>h.maxRows;h.getFrozenRows=()=>1;h.setFrozenRows=()=>{};h.activate=()=>{};
 h.getConditionalFormatRules=()=>[];h.setConditionalFormatRules=()=>{};
 h.getRange=(r,c,nr,nc)=>{nr=nr||1;nc=nc||1;return{
  getValues:()=>r===1?[h.enc.slice(c-1,c-1+nc)]:Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>{const row=h.filas[r-2+i];return row&&row[c-1+j]!==undefined?row[c-1+j]:''})),
  setValues:(v)=>{v.forEach((row,i)=>{const k=r-2+i;h.filas[k]=h.filas[k]||[];row.forEach((x,j)=>{h.filas[k][c-1+j]=x})})},
  setValue:(x)=>{const k=r-2;h.filas[k]=h.filas[k]||[];h.filas[k][c-1]=x}}};
 return h}
let libro={};
ctx.SpreadsheetApp={newConditionalFormatRule:()=>({}),newDataValidation:()=>{throw new Error('sin validacion en la prueba')}};
ctx.vdLibro_=()=>({getSheetByName:n=>libro[n]||null});
ctx.peHojaAsegurar_=(n,enc)=>{if(!libro[n])libro[n]=hoja(enc);else enc.forEach(e=>{if(!libro[n].enc.some(x=>ctx.normEnc_(x)===ctx.normEnc_(e)))libro[n].enc.push(e)});return libro[n]};
ctx.ubicarColumnas_=(h,enc)=>{const col={};enc.forEach(e=>{let i=h.enc.map(x=>ctx.normEnc_(x)).indexOf(ctx.normEnc_(e));if(i<0){h.enc.push(e);i=h.enc.length-1}col[ctx.normEnc_(e)]=i+1});return{col}};
ctx.escrCol_=(m,e)=>m.col[ctx.normEnc_(e)]||0;
ctx.escrAsegurarFilas_=()=>{};
ctx.peTabla_=(n)=>{const h=libro[n];if(!h)return null;const pos={};h.enc.forEach((x,i)=>{const k=ctx.normEnc_(x);if(k&&pos[k]===undefined)pos[k]=i});
 return{enc:h.enc,pos,filas:h.filas.map(f=>h.enc.map((_,i)=>f[i]===undefined?'':f[i]))}};
ctx.peCol_=(tb,ns)=>{for(const n of ns){const j=tb.pos[ctx.normEnc_(n)];if(j!==undefined)return j}return -1};
ctx.peAgregar_=(h,enc,filas)=>{const m=ctx.ubicarColumnas_(h,enc);filas.forEach(x=>{const row=[];enc.forEach(e=>{row[m.col[ctx.normEnc_(e)]-1]=x[e]===undefined?'':x[e]});h.filas.push(row)})};

/* ---- 1. clasificar el estado ---- */
const N=(x)=>R('scNorm_('+JSON.stringify(x)+')');
t(N('Enviado')==='ENVIADO'&&N('Enviado Enviado')==='ENVIADO','enviado');
t(N('Canceladas')==='CANCELADO'&&N('Cancelado')==='CANCELADO','cancelado');
t(N('Nuevo')==='NUEVO'&&N('Sin enviar')==='NUEVO','nuevo (Sin enviar no es enviado)');
t(N('Aceptado')==='ACEPTADO','aceptado');
t(N('Entregado')==='ENTREGADO'&&N('Entregado Entregado')==='ENTREGADO','entregado');
t(N('')===''&&N('Algo raro')==='OTRO','vacio y desconocido');

/* ---- 2. limpiar lo que manda la extension ---- */
ctx.F=[{pedido:'600000131318758',orden:'6091301892 55859',fecha:'2026-10-27',envio:'2026-10-28',total:15999,estado:'  Enviado '},
 {pedido:'600000131318758',orden:'1',estado:'Nuevo'},{pedido:'abc',estado:'x'},{pedido:'12345',estado:'x'},null,'texto',
 {pedido:'600000127458333',orden:'xx',fecha:'27/10/2026',total:'',estado:'Canceladas'}];
const L=R('scLimpiar_(F)');
t(L.length===2,'solo entran pedidos validos y sin repetir: '+L.length);
t(L[0].orden==='609130189255859'&&L[0].fecha==='2026-10-27'&&L[0].total===15999&&L[0].estado==='Enviado','campos limpios');
t(L[1].orden===''&&L[1].fecha===''&&L[1].total==='','orden, fecha y total invalidos quedan vacios');
t(R('scLimpiar_("no es lista")').length===0,'si no es lista, nada');
ctx.GRANDE=Array.from({length:700},(_,i)=>({pedido:String(600000000000000+i),estado:'Nuevo'}));
t(R('scLimpiar_(GRANDE)').length===600,'maximo 600 filas por envio');

/* ---- 3. que estatus usar ---- */
const ahora=Date.now(),h=3600000;
const E=(sc,ve)=>{ctx.SC=sc;ctx.VE=ve;return R('scElegir_(SC,VE,'+ahora+')')};
t(E(null,'Shipped').estatus==='Shipped'&&E(null,'Shipped').etiqueta==='','sin Seller Center: manda Ventas');
t(E({norm:'ENVIADO',act:ahora-h},'Created').estatus==='Shipped','Seller Center reciente gana a Ventas');
t(E({norm:'ENVIADO',act:ahora-10*h},'Created').estatus==='Created'&&/hace 10 h/.test(E({norm:'ENVIADO',act:ahora-10*h},'Created').etiqueta),'Seller Center viejo: manda Ventas y se avisa la edad');
t(E({norm:'CANCELADO',act:ahora-100*h},'Created').estatus==='Cancelled'&&/hace 4 d/.test(E({norm:'CANCELADO',act:ahora-100*h},'Created').etiqueta),'cancelado no se regresa aunque sea viejo');
t(E({norm:'NUEVO',act:ahora-h},'Cancelled').estatus==='Cancelled','si Ventas dice cancelado, queda cancelado');
t(E({norm:'ENTREGADO',act:ahora},'').estatus==='Delivered','entregado');

/* ---- 4. guardar lo que manda la extension ---- */
libro={};
let r=R("scGuardar_(scLimpiar_([{pedido:'600000131318758',orden:'609130189255859',fecha:'2026-10-27',envio:'2026-10-28',total:15999,estado:'Enviado'},{pedido:'600000132667029',orden:'609131794547720',fecha:'2026-11-12',total:21999,estado:'Nuevo'}]),new Date(2026,10,12,9,0),'All')");
const sc=libro['Seller Center'],c=(e)=>sc.enc.indexOf(e);
t(r.nuevas===2&&sc.filas.length===2,'dos pedidos nuevos: '+JSON.stringify(r));
t(sc.filas[0][c('ESTADO SELLER CENTER')]==='Enviado'&&sc.filas[1][c('TOTAL')]===21999,'estado y total guardados');
r=R("scGuardar_(scLimpiar_([{pedido:'600000131318758',orden:'609130189255859',fecha:'2026-10-27',envio:'2026-10-28',total:15999,estado:'Enviado'},{pedido:'600000132667029',orden:'609131794547720',fecha:'2026-11-12',total:21999,estado:'Nuevo'}]),new Date(2026,10,12,9,30),'All')");
t(r.nuevas===0&&r.cambios===0&&sc.filas.length===2,'misma lectura: sin filas nuevas ni cambios de estado');
t(sc.filas[0][c('ACTUALIZADO')].getMinutes()===30,'ACTUALIZADO se renueva');
r=R("scGuardar_(scLimpiar_([{pedido:'600000132667029',orden:'',fecha:'2026-11-12',total:21999,estado:'Aceptado'}]),new Date(2026,10,12,10,0),'Busqueda')");
t(r.cambios===1&&r.estados.ACEPTADO===1&&sc.filas.length===2&&String(sc.filas[1][c('ORDEN DE COMPRA')]).replace(/\D/g,'')==='609131794547720','cambio Nuevo -> Aceptado; no borra la orden ya conocida');
/* el usuario mueve columnas y agrega una suya: el script sigue escribiendo bien */
libro={};
libro['Seller Center']=hoja(['NOTAS MIAS','ESTADO SELLER CENTER','PEDIDO','ACTUALIZADO','ORDEN DE COMPRA','TOTAL'],[['llamar','Nuevo','600000132667029',new Date(2026,10,11),'609131794547720',21999]]);
R("scGuardar_(scLimpiar_([{pedido:'600000132667029',orden:'609131794547720',total:21999,estado:'Enviado'},{pedido:'600000127458333',orden:'609130189289078',total:4959,estado:'Canceladas'}]),new Date(2026,10,12,11,0),'All')");
const s2=libro['Seller Center'],c2=(e)=>s2.enc.indexOf(e);
t(s2.filas[0][c2('NOTAS MIAS')]==='llamar'&&s2.filas[0][c2('ESTADO SELLER CENTER')]==='Enviado','columnas movidas: respeta la columna del usuario y escribe donde esta cada encabezado');
t(s2.filas.length===2&&String(s2.filas[1][c2('PEDIDO')]).replace(/\D/g,'')==='600000127458333'&&s2.filas[1][c2('ESTADO SELLER CENTER')]==='Canceladas','pedido nuevo con las columnas movidas');
t(s2.enc.includes('GRUPO')&&s2.enc.includes('FECHA PEDIDO'),'columnas que faltaban se agregan AL FINAL');
/* indice */
const ix=R('scIndice_()');
t(ix['600000132667029'].norm==='ENVIADO'&&ix['609131794547720'].norm==='ENVIADO'&&ix['600000127458333'].norm==='CANCELADO','indice por pedido y por orden de compra');

/* ---- 5. recibir por el Web App ---- */
libro={};ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
ctx.AUTH=null;ctx.csAutorizar_=(p)=>p.clave==='buena'?null:{ok:false,error:'no_autorizado'};
const n0=ctx.logs.length;
let x=R("scRecibir_({clave:'mala',grupo:'All',filas:[{pedido:'600000131318758',estado:'Enviado'}]})");
t(x.ok===false&&x.error==='no_autorizado'&&!libro['Seller Center'],'clave mala: no escribe nada');
x=R("scRecibir_({clave:'buena',grupo:'All<script>',filas:[{pedido:'600000131318758',orden:'609130189255859',estado:'Enviado'},{pedido:'600000127458333',estado:'Canceladas'}]})");
t(x.ok&&x.recibidas===2&&x.nuevas===2&&libro['Seller Center'].filas[0][libro['Seller Center'].enc.indexOf('GRUPO')]==='Allscript','recibe y limpia el grupo: '+JSON.stringify(x));
t(ctx.logs.slice(n0).some(l=>/Seller Center \(Allscript\): 2 pedidos leidos, 2 nuevos/.test(l)),'queda en el Log');
const n1=ctx.logs.length;
x=R("scRecibir_({clave:'buena',grupo:'All',filas:[{pedido:'600000131318758',estado:'Enviado'},{pedido:'600000127458333',estado:'Canceladas'}]})");
t(x.ok&&x.nuevas===0&&x.cambios===0&&ctx.logs.length===n1,'si nada cambio, no hace ruido en el Log');
x=R("scRecibir_({clave:'buena',filas:[]})");t(x.ok&&x.recibidas===0,'lista vacia: ok sin escribir');

/* ---- 6. que pedidos pide el Sheet buscar uno por uno ---- */
libro['Pedidos en riesgo']=hoja(['ORDEN DE COMPRA','PEDIDO','SITUACION','ULTIMO AVISO'],[
 ['609130189255859','600000131318758-1-1','ENVIADA SIN GUIA',new Date(2026,10,11)],
 ['609130189289078','600000127458333-1-1','ENVIADA CON GUIA',new Date(2026,10,10)],
 ['609130189200001','600000127458400-1-1','CANCELADA EN WALMART',new Date(2026,10,11)],
 ['609130189200002','600000127458500-1-1','POR ENVIAR',new Date(2026,10,12)]]);
t(JSON.stringify(R('scPedidosPorBuscar_()'))===JSON.stringify(['600000127458500','600000131318758']),'pide los sin resolver, sin el sufijo -1-1 y el mas reciente primero: '+JSON.stringify(R('scPedidosPorBuscar_()')));
x=R("scPendientes_({clave:'buena'})");t(x.ok&&x.pedidos.length===2,'POST seller_pendientes');
x=R("scPendientes_({clave:'mala'})");t(x.ok===false,'seller_pendientes con clave mala');
libro['Pedidos en riesgo']=hoja(['ORDEN DE COMPRA','PEDIDO','SITUACION','ULTIMO AVISO'],Array.from({length:40},(_,i)=>['6091301892'+String(i).padStart(5,'0'),'6000001274'+String(i).padStart(5,'0')+'-1-1','POR ENVIAR',new Date(2026,10,1+i%10)]));
t(R('scPedidosPorBuscar_()').length===15,'maximo 15 busquedas por ciclo');

/* ---- 7. Casos Walmart: pedido de 15 digitos (6000001...) ---- */
const msg=(asunto,cuerpo,de,fecha)=>({getSubject:()=>asunto,getPlainBody:()=>cuerpo,getFrom:()=>de,getDate:()=>fecha});
ctx.M={asunto:'MX Apertura de caso',cuerpo:'Hemos recibido tu solicitud\nNúmero de caso: 09436486\nNúmero de pedido: 600000131318758\nAn English version',de:'Walmart Marketplace MX <soportemp@walmart.com>',fecha:new Date(2026,10,12,10,0)};
const lm=R('cawLeerMensaje_(M)');
t(lm&&lm.pedido==='600000131318758'&&lm.caso==='09436486'&&lm.estado==='ABIERTO','el pedido 6000001... ya se reconoce: '+JSON.stringify(lm&&lm.pedido));
ctx.M2={asunto:'Detención de embarque pedido 600000131318758-1-1',cuerpo:'Garantía',de:'Agente <ana@walmart.com>',fecha:new Date(2026,10,12,10,0)};
t(R('cawLeerMensaje_(M2)').pedido==='600000131318758','el sufijo -1-1 no entra al pedido');
ctx.M3={asunto:'MX Apertura de caso',cuerpo:'Número de caso: 09436486\nPedido 600000031773365',de:'Walmart <soportemp@walmart.com>',fecha:new Date(2026,10,12)};
t(R('cawLeerMensaje_(M3)').pedido==='600000031773365','los pedidos 6000000... siguen reconociendose');

/* ---- 8. Casos Walmart: abrir el caso desde el Sheet y seguirlo con los correos ---- */
libro={};
let n=R("cawAbrirSinGuia_([{pedido:'600000131318758',sku:'SON-CFI2015JAPON-GRI-4392-MSI'},{pedido:'600000131318758',sku:'x'},{pedido:'',sku:'y'}])");
const cw=libro['Casos Walmart'],cc=(e)=>cw.enc.indexOf(e);
t(n===1&&cw.filas.length===1,'abre un solo caso por pedido: '+n);
t(cw.filas[0][cc('TIPO')]==='SIN GUIA'&&cw.filas[0][cc('ESTADO')]==='POR ABRIR'&&String(cw.filas[0][cc('PEDIDO')]).replace(/\D/g,'')==='600000131318758'&&/^AUTO/.test(cw.filas[0][cc('DETECTADO')]),'fila: SIN GUIA, POR ABRIR, pedido, AUTO');
t(cw.filas[0][cc('ACCION')]==='Abrir caso en Seller Center'&&cw.filas[0][cc('CORREO ENVIADO')]==='NO','accion y correo enviado NO');
t(R("cawAbrirSinGuia_([{pedido:'600000131318758'}])")===0&&cw.filas.length===1,'segunda vez no duplica');
let ep=R('cawEstadoPorPedido_()');
t(ep['600000131318758']&&ep['600000131318758'].estado==='POR ABRIR'&&!ep['600000131318758'].cerrado,'estado por pedido');
/* llega el correo de apertura de Walmart: se liga a ESA fila (no crea otra) */
ctx.GmailApp={search:()=>[{getMessages:()=>[msg('MX Apertura de caso','Hemos recibido tu solicitud\nNúmero de caso: 09436486\nNúmero de pedido: 600000131318758\nAn English version','Walmart Marketplace MX <soportemp@walmart.com>',new Date(2026,10,12,10,0))]}]};
let rl=R('cawLeerCorreo_()');
t(cw.filas.length===1&&rl.nuevos===0,'el correo de confirmacion se liga a la fila del Sheet, sin duplicar: filas='+cw.filas.length+' '+JSON.stringify(rl));
t(String(cw.filas[0][cc('FOLIO WALMART')]).replace(/\D/g,'')==='09436486'&&cw.filas[0][cc('ESTADO')]==='ABIERTO'&&cw.filas[0][cc('CORREO ENVIADO')]==='SI','folio, estado ABIERTO y correo enviado SI');
t(cw.filas[0][cc('ACCION')]==='Esperar respuesta','accion: esperar respuesta: '+cw.filas[0][cc('ACCION')]);
ep=R('cawEstadoPorPedido_()');t(ep['600000131318758'].estado==='ABIERTO'&&ep['600000131318758'].folio==='09436486','Pedidos en riesgo veria ABIERTO con su folio');
/* Walmart pide informacion */
ctx.GmailApp={search:()=>[{getMessages:()=>[
 msg('MX Apertura de caso','Número de caso: 09436486\nNúmero de pedido: 600000131318758','Walmart Marketplace MX <soportemp@walmart.com>',new Date(2026,10,12,10,0)),
 msg('RE: MX Apertura de caso','Número de caso: 09436486\nPodrías compartir la guía de rastreo del pedido 600000131318758','Walmart Marketplace MX <soportemp@walmart.com>',new Date(2026,10,12,15,0))]}]};
rl=R('cawLeerCorreo_()');
t(cw.filas.length===1&&cw.filas[0][cc('ESTADO')]==='PIDE INFO','Walmart pide informacion: '+cw.filas[0][cc('ESTADO')]);
/* resuelto */
ctx.GmailApp={search:()=>[{getMessages:()=>[
 msg('MX Apertura de caso','Número de caso: 09436486\nNúmero de pedido: 600000131318758','Walmart Marketplace MX <soportemp@walmart.com>',new Date(2026,10,12,10,0)),
 msg('Tu ticket 09436486 ha sido resuelto','Resolvimos tu ticket\nPedido 600000131318758','Walmart Marketplace MX <soportemp@walmart.com>',new Date(2026,10,13,9,0))]}]};
rl=R('cawLeerCorreo_()');
t(cw.filas.length===1&&cw.filas[0][cc('ESTADO')]==='RESUELTO'&&cw.filas[0][cc('FECHA CIERRE')] instanceof Date,'resuelto: estado y fecha de cierre');
/* un caso cerrado no tapa uno vigente, y un correo con otro pedido no se mezcla */
libro['Casos Walmart'].filas.push([]);libro['Casos Walmart'].filas[1][cc('TIPO')]='SELLER SUPPORT';libro['Casos Walmart'].filas[1][cc('PEDIDO')]="'600000131318758";libro['Casos Walmart'].filas[1][cc('ESTADO')]='ABIERTO';libro['Casos Walmart'].filas[1][cc('FOLIO WALMART')]="'11111111";
ep=R('cawEstadoPorPedido_()');t(ep['600000131318758'].estado==='ABIERTO'&&ep['600000131318758'].folio==='11111111','el vigente gana al cerrado');
ctx.GmailApp={search:()=>[{getMessages:()=>[msg('MX Apertura de caso','Número de caso: 22222222\nNúmero de pedido: 600000199999999','Walmart Marketplace MX <soportemp@walmart.com>',new Date(2026,10,13,10,0))]}]};
const antes=libro['Casos Walmart'].filas.length;rl=R('cawLeerCorreo_()');
t(libro['Casos Walmart'].filas.length===antes+1&&rl.nuevos===1,'otro pedido: caso nuevo, no se mezcla');

/* ---- 9. la extension: lectura de la tabla de Seller Center ---- */
const bg=fs.readFileSync(__dirname+'/../extension-cookie/background.js','utf8');
const i0=bg.indexOf('function scNormTxt'),i1=bg.indexOf('function esperarCarga');
const ext={};vm.createContext(ext);vm.runInContext(bg.slice(i0,i1)+';this.scFechaIso=scFechaIso;this.scTotal=scTotal;this.scFilas=scFilas;',ext);
t(ext.scFechaIso('11/13/2026')==='2026-11-13'&&ext.scFechaIso('1/5/2026')==='2026-01-05','fecha MM/DD/AAAA a ISO');
t(ext.scFechaIso('')===''&&ext.scFechaIso('13/13/2026')===''&&ext.scFechaIso('hola')==='','fechas raras: vacio');
t(ext.scTotal('$15,999.00')===15999&&ext.scTotal('$0.00')===0&&ext.scTotal('')==='','total en pesos');
const enc=['','Número de orden de compra','Número de pedido','Fecha del pedido','Fecha estimada de envío','Total del pedido','Cliente','Enviado por','Método de envío','Artículo','Cantidad','Estado'];
const fi=ext.scFilas(enc,[['','609131794547720','600000132667029','11/12/2026','11/17/2026','$21,999.00','Nombre Cliente','Seller','Standard','','1','Nuevo'],
 ['','609130189255859','600000131318758','10/27/2026','10/28/2026','$15,999.00','Otro Cliente','Seller','Standard','','1','Enviado Enviado'],['','','','','','','','','','','','sin numeros']]);
t(fi.length===2&&fi[0].pedido==='600000132667029'&&fi[0].orden==='609131794547720'&&fi[0].fecha==='2026-11-12'&&fi[0].envio==='2026-11-17'&&fi[0].total===21999&&fi[0].estado==='Nuevo','fila leida');
t(fi[1].estado==='Enviado','"Enviado Enviado" queda "Enviado"');
t(!JSON.stringify(fi).includes('Cliente'),'no se manda el nombre del cliente');
t(ext.scFilas(['','Pedido','Total'],[['','1','2']])===null,'si la pagina cambia de forma, avisa (null) en vez de mandar basura');
const enc2=['Estado','Número de pedido','Número de orden de compra','Total del pedido'];
t(ext.scFilas(enc2,[['Cancelada','600000127458333','609130189289078','$4,959.00']])[0].orden==='609130189289078','columnas en otro orden: lee por encabezado');
t(JSON.parse(fs.readFileSync(__dirname+'/../extension-cookie/manifest.json','utf8')).host_permissions.includes('https://seller.walmart.com/*'),'manifest con permiso de Seller Center');

/* ---- 10. la extension completa con un Chrome y un Seller Center simulados ---- */
(async()=>{
 const mem={url:'https://script.google.com/macros/s/AKfyc_test/exec',clave:'x'.repeat(40)};
 const posts=[];let tabsQuitadas=0,lastUrl='',llamadasUrl={},modo='ok';
 const enc2=['','Número de orden de compra','Número de pedido','Fecha del pedido','Fecha estimada de envío','Total del pedido','Cliente','Enviado por','Método de envío','Artículo','Cantidad','Estado'];
 const filaDe=(ped,est)=>['','6091'+ped.slice(-11),ped,'11/12/2026','11/17/2026','$100.00','Cliente','Seller','Standard','','1',est];
 const noop=()=>{};const ev={addListener:noop,removeListener:noop};
 const chromeSim={cookies:{onChanged:ev,get:async()=>null},alarms:{create:noop,onAlarm:ev},idle:{setDetectionInterval:noop,onStateChanged:ev},runtime:{onInstalled:ev,onStartup:ev,onMessage:ev,getPlatformInfo:async()=>({})},
  action:{setBadgeText:noop,setBadgeBackgroundColor:noop,setTitle:noop},
  storage:{local:{get:async(k)=>{const o={};(Array.isArray(k)?k:[k]).forEach(x=>{if(mem[x]!==undefined)o[x]=mem[x]});return o},set:async(o)=>{Object.assign(mem,o)}}},
  tabs:{onUpdated:ev,query:async()=>[],create:async()=>({id:7}),get:async()=>({id:7,status:'complete'}),update:async(id,o)=>{lastUrl=o.url},remove:async()=>{tabsQuitadas++}},
  scripting:{executeScript:async()=>{
   llamadasUrl[lastUrl]=(llamadasUrl[lastUrl]||0)+1;
   if(modo==='falla')throw new Error('Cannot access contents of the page');
   if(llamadasUrl[lastUrl]<2)return[{result:{pendiente:true}}];   // la pestaña aun no carga
   if(modo==='sin_sesion')return[{result:{sesion:false,destino:'login.account.walmart.com/'}}];
   const m=/orderNumber=(\d+)/.exec(lastUrl);
   return[{result:{sesion:true,enc:enc2,filas:m?[filaDe(m[1],'Enviado Enviado')]:[filaDe('600000132667029','Nuevo'),filaDe('600000131318758','Enviado')]}}]}}};
 const sandbox={console,JSON,Date,Object,Array,String,Number,Math,isNaN,Promise,RegExp,parseFloat,Error,URL,TextEncoder,encodeURIComponent,
  chrome:chromeSim,setInterval:(f)=>0,clearInterval:noop,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,5)),clearTimeout,
  fetch:async(u,o)=>{const b=JSON.parse(o.body);posts.push(b);
   const r=b.accion==='seller_pendientes'?{ok:true,pedidos:['600000131318758','600000127458333']}:{ok:true,nuevas:1,cambios:1};
   return{status:200,text:async()=>JSON.stringify(r)}}};
 vm.createContext(sandbox);vm.runInContext(bg+';this.scCiclo=scCiclo;this.estado=()=>scOcupado;',sandbox);
 const est=()=>mem.estadoSC;
 let r=await sandbox.scCiclo(true);
 t(r.ok===true,'ciclo completo ok: '+JSON.stringify(r));
 const acc=posts.map(p=>p.accion+(p.grupo?':'+p.grupo:'')).join(',');
 t(acc==='seller_pedidos:Unshipped,seller_pedidos:Canceled,seller_pedidos:All,seller_pendientes,seller_pedidos:Busqueda','orden de envios al Sheet: '+acc);
 t(posts[0].filas.length===2&&posts[0].filas[0].estado==='Nuevo'&&!JSON.stringify(posts).includes('Cliente'),'manda las filas y nunca el cliente');
 const bus=posts[posts.length-1];t(bus.filas.length===2&&bus.filas.every(f=>f.estado==='Enviado'),'busqueda: un pedido por URL, estado limpio: '+JSON.stringify(bus.filas.map(f=>f.pedido+f.estado)));
 t(est().ok&&!est().enCurso&&/pedidos leidos \(\+2 buscados\)/.test(est().texto),'estado final: '+est().texto);
 t(tabsQuitadas===1&&sandbox.estado()===false,'cierra su pestaña y queda libre');
 /* sin sesion */
 posts.length=0;llamadasUrl={};modo='sin_sesion';r=await sandbox.scCiclo(true);
 t(r.error==='sin_sesion'&&est().ok===false&&/sin sesion.*2FA/.test(est().texto)&&posts.length===0&&tabsQuitadas===2&&sandbox.estado()===false,'sin sesion: avisa del 2FA, no manda nada y se libera: '+est().texto);
 /* la pagina falla siempre */
 llamadasUrl={};modo='falla';r=await sandbox.scCiclo(true);
 t(r.ok===false&&est().ok===false&&/No pude leer Seller Center: Cannot access/.test(est().texto)&&sandbox.estado()===false,'si no puede leer, dice por que y se libera: '+est().texto);
 /* se manda sin forzar dentro de 5 min: espera */
 modo='ok';llamadasUrl={};r=await sandbox.scCiclo(false);t(r.espera===true,'sin forzar y recien leido: espera');
 /* clave mala del Sheet */
 llamadasUrl={};sandbox.fetch=async()=>({status:200,text:async()=>JSON.stringify({ok:false,error:'no_autorizado'})});
 r=await sandbox.scCiclo(true);t(r.ok===false&&/Clave incorrecta/.test(est().texto),'clave incorrecta se explica: '+est().texto);
 /* en curso: el boton avisa en vez de callar */
 console.log('t57: '+ok+' ok, '+bad+' fallas');process.exit(bad?1:0);
})();
