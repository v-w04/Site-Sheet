// ConsultaPedidos.gs con datos simulados: paqueteria por formato de guia, estado de envio, lectura de la pagina, corrida completa y boton de links.
const fs=require('fs'),vm=require('vm');
const ctx={console};vm.createContext(ctx);
const cargar=f=>vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8'),ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const R=s=>vm.runInContext(s,ctx);
const logs=[];ctx.logOk_=(e,m,d)=>logs.push(['OK',e,m,d]);ctx.logInfo_=(e,m,d)=>logs.push(['INFO',e,m,d]);ctx.logWarn_=(e,m,d)=>logs.push(['WARN',e,m,d]);ctx.logErr_=(e,m,d)=>logs.push(['ERROR',e,m,d]);ctx.flushLog_=()=>{};
const props={};ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=String(v)}})};
const cache={};ctx.CacheService={getScriptCache:()=>({get:k=>cache[k]||null,put:(k,v)=>{cache[k]=v}})};
ctx.Utilities={formatDate:()=> '2026-10-30 13:00'};
ctx.encodeURIComponent=encodeURIComponent;
ctx.SITE='https://electronicsmexico.site';
cargar('Columnas.gs');cargar('ConsultaPedidos.gs');

// ---- piezas puras ----
t(R('cpPaqueteria_("MXFDDWM21560270")')==='BigSmart','BigSmart por formato');
t(R('cpPaqueteria_("mxfddwm21560270")')==='BigSmart','BigSmart minusculas');
t(R('cpPaqueteria_("519750918399")')==='FedEx','FedEx 12 digitos');
t(R('cpPaqueteria_("ABC123")')==='' && R('cpPaqueteria_("")')==='' ,'guia rara = desconocida');
t(JSON.stringify(R('cpGuias_("MXFDDWM1, 519750918399\\nMXFDDWM1")'))===JSON.stringify(['MXFDDWM1','519750918399']),'guias multiples sin repetir');
t(R('cpGuias_(false)').length===0,'false = sin guia');
t(R('cpLink_("FedEx","519750918399")')==='https://www.fedex.com/fedextrack/?trknbr=519750918399&locale=es_MX','link FedEx');
t(/MXFDDWM9/.test(R('cpLink_("BigSmart","MXFDDWM9")')),'link BigSmart lleva la guia');
props.CP_URL_BIGSMART='https://x.test/t/{GUIA}';t(R('cpLink_("BigSmart","G1")')==='https://x.test/t/G1','URL de BigSmart configurable');delete props.CP_URL_BIGSMART;
t(R('cpLink_("","x")')==='','sin paqueteria no hay link');
t(R('cpValor_([5,"Hola"])')==='Hola'&&R('cpValor_(false)')===''&&R('cpValor_("a")')==='a','cpValor_');

// ---- enviado / conclusion ----
const P=(name,state,type)=>({name,state,picking_type_code:type||'outgoing'});
t(R('cpEnviado_')('cancel',[])==='CANCELADA','venta cancelada');
t(R('cpEnviado_')('sale',[])==='SIN ENTREGA','sin entregas');
t(R('cpEnviado_')('sale',[P('WH/PICK/1','done','internal'),P('WH/OUT/1','assigned')])==='NO','pick hecho, OUT listo = NO');
t(R('cpEnviado_')('sale',[P('WH/OUT/1','done')])==='SI','OUT hecho');
t(R('cpEnviado_')('sale',[P('WH/OUT/1','done'),P('WH/OUT/2','confirmed')])==='PARCIAL','una de dos');
t(R('cpEnviado_')('sale',[P('WH/OUT/1','cancel')])==='SIN ENTREGA','OUT cancelada no cuenta');
const C=(e,s,g)=>R('cpConclusion_')(e,s,g);
t(C('SI','Entregado',true)==='ENTREGADO','entregado');
t(/no salio/.test(C('SI','Cancelado',true)),'guia cancelada');
t(/sin recolectar/.test(C('SI','Sin recolectar',true)),'sin recolectar');
t(/NO ENVIADO/.test(C('NO','',false)),'no enviado sin guia');
t(/ODOO SIN SALIDA/.test(C('NO','',true)),'guia sin salida');
t(/SIN GUIA/.test(C('SI','',false)),'salida sin guia');
t(/ABRIR LINK|abrir link/i.test(C('SI','',true)),'sin estatus = abrir link (no se inventa)');
t(C('CANCELADA','Entregado',true)==='CANCELADA EN ODOO','cancelada gana');

// ---- lectura de la pagina: nunca un verde falso ----
const I=(p,g,h)=>R('cpInterpretar_')(p,g,h);
t(I('BigSmart','MXFDDWM1','<html><body>Rastrea tu paquete. Entregado en tu zona</body></html>').estatus==='','pagina generica sin la guia: NO inventa Entregado');
t(I('BigSmart','MXFDDWM1','<html><script>var x="MXFDDWM1 Entregado"</script></html>').estatus==='','texto en <script> no cuenta');
t(I('BigSmart','MXFDDWM1','<div>Guia MXFDDWM1</div><div>Listo para ser recolectado (108)</div>').estatus==='Sin recolectar','sin recolectar');
t(I('BigSmart','MXFDDWM1','<div>MXFDDWM1</div><li>Listo para ser recolectado</li><li>Cancelado de ultima milla (220)</li>').estatus==='Cancelado','cancelado de ultima milla');
t(I('BigSmart','MXFDDWM1','<div>MXFDDWM1</div><li>En ruta</li><li>Entregado</li>').estatus==='Entregado','entregado gana a en ruta');
t(I('BigSmart','MXFDDWM1','<div>MXFDDWM1</div><li>En ruta</li>').estatus==='En transito','en transito');
t(I('FedEx','519750360856','<p>519750360856</p><p>Informaci&oacute;n enviada</p>').estatus==='Sin recolectar','FedEx informacion enviada');
t(I('FedEx','519750918399','<p>519750918399 Delivered</p>').estatus==='Entregado','FedEx delivered');
t(I('BigSmart','MXFDDWM1','<div>MXFDDWM1</div><li>Intento de entrega fallido</li>').estatus==='Incidencia','intento fallido = incidencia, no entregado');
t(I('BigSmart','MXFDDWM1','<div>MXFDDWM1 sin eventos</div>').estatus==='','guia sin estatus conocido');
t(I('BigSmart','MXFDDWM1','').estatus==='','pagina vacia');
t(JSON.stringify(R('cpUrls_("https://a.com/x\\nhttps://b.com/y  basura")'))===JSON.stringify(['https://a.com/x','https://b.com/y']),'urls de una celda');

// ---- corrida completa con Odoo, hoja y paqueteria simulados ----
const encHoja=['PEDIDO','Mi nota','SKU','LINK RASTREO'];   // una columna del usuario en medio y otra faltante: se ubica por encabezado
const filasHoja=[['609A'],[''],['609B'],['609C'],['609D'],['6000X']].map(r=>[r[0],'nota mia','','']);
const hoja={rows:[encHoja,...filasHoja],
  getName:()=>'Consulta Pedidos',getLastRow:()=>hoja.rows.length,getLastColumn:()=>4,
  getRange:(r,c,nr=1,nc=1)=>({getValues:()=>{const a=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((hoja.rows[r-1+i]||[])[c-1+j]??'');a.push(row)}return a},getValue:()=>(hoja.rows[r-1]||[])[c-1]??'',setValues(){return this}}),
  setFrozenRows(){}};
ctx.SpreadsheetApp={getActive:()=>({getSheetByName:n=>n==='Consulta Pedidos'?hoja:null,insertSheet:()=>hoja}),getUi:()=>({showModalDialog:(o,tt)=>{ctx.__dialogo={html:o.html,tt}}})};
ctx.HtmlService={createHtmlOutput:h=>({html:h,setWidth(){return this},setHeight(){return this}})};
const infos=[];ctx.dlgInfo_=(a,b,c)=>infos.push([a,b,c]);ctx.dlgEsc_=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');ctx.DLG_CSS='';
let escrito=null;ctx.reescribirHoja_=(h,enc,filas,o)=>{escrito={enc,filas,o}};
const ventas=[
 {id:1,name:'609A',state:'sale',client_order_ref:'6000A',x_studio_guia_de_rastreo:'MXFDDWM21560270',x_studio_estatus_de_pedido:'En ruta',x_studio_estado_venta:false},
 {id:2,name:'609B',state:'sale',client_order_ref:false,x_studio_guia_de_rastreo:'519750918399'},
 {id:3,name:'609C',state:'sale',client_order_ref:false,x_studio_guia_de_rastreo:false},
 {id:4,name:'609D',state:'cancel',client_order_ref:false,x_studio_guia_de_rastreo:false},
 {id:5,name:'609E',state:'sale',client_order_ref:'6000X',x_studio_guia_de_rastreo:false}];
const campos={x_studio_guia_de_rastreo:{string:'Guia de rastreo:'},x_studio_estatus_de_pedido:{string:'Estatus De Pedido'},x_studio_estado_venta:{string:'Estado Venta:'},x_studio_guia_retorno:{string:'Guia Retorno:'},name:{string:'Numero'}};
const llamadas=[];
ctx.odooExecute_=(m,met,args,kw)=>{llamadas.push([m,met]);
 if(met==='fields_get')return campos;
 if(m==='sale.order'){const d=args[0][0];const [campo,,val]=d;return ventas.filter(v=>campo==='name'?val.includes(v.name):val.includes(v.client_order_ref));}
 if(m==='sale.order.line')return [{order_id:[1,'609A'],product_id:[10,'[HP-1] HP'],product_uom_qty:1},{order_id:[2,'609B'],product_id:[11,'[JBL-1] JBL'],product_uom_qty:2},{order_id:[2,'609B'],product_id:[12,'[SON-1] SON'],product_uom_qty:1},{order_id:[3,'609C'],product_id:[10,'[HP-1] HP'],product_uom_qty:1},{order_id:[5,'609E'],product_id:[12,'[SON-1] SON'],product_uom_qty:3}];
 if(m==='product.product')return [{id:10,default_code:'HP-14-DQ6105DX-ROS-7817'},{id:11,default_code:'JBL-PBSTAGE320AM-NEG-8756'},{id:12,default_code:'SON-CFI2015JAPON-GRI-4392'}];
 if(m==='stock.picking')return [{name:'WH/OUT/1',origin:'609A',state:'done',picking_type_code:'outgoing'},{name:'WH/OUT/2',origin:'609B',state:'done',picking_type_code:'outgoing'},{name:'WH/PICK/3',origin:'609C',state:'done',picking_type_code:'internal'},{name:'WH/OUT/3',origin:'609C',state:'confirmed',picking_type_code:'outgoing'}];
 return [];};
const paginas={'MXFDDWM21560270':'<div>MXFDDWM21560270</div><li>Entregado</li>','519750918399':'<html><body>cargando...</body></html>'};
const pedidas=[];ctx.UrlFetchApp={fetch:(u)=>{pedidas.push(u);const g=Object.keys(paginas).find(k=>u.includes(k));return{getResponseCode:()=>200,getContentText:()=>paginas[g]||''}}};
R('cpConsultar')();
t(escrito&&escrito.enc.length===15&&escrito.enc[0]==='PEDIDO','escribe las 15 columnas por encabezado');
t(escrito.filas.length===6,'una fila por fila de la hoja (alineadas con lo pegado)');
const F=escrito.filas, ix=n=>escrito.enc.indexOf(n);
t(F[1].every(x=>x===''),'fila en blanco queda en blanco');
t(F[0][ix('SKU')]==='HP-14-DQ6105DX-ROS-7817'&&F[0][ix('PAQUETERIA')]==='BigSmart'&&F[0][ix('ENVIADO')]==='SI','609A: SKU, BigSmart, enviado');
t(F[0][ix('ESTATUS PAQUETERIA')]==='Entregado'&&F[0][ix('CONCLUSION')]==='ENTREGADO','609A entregado leido de la pagina');
t(/Estatus De Pedido: En ruta/.test(F[0][ix('NOTA')]),'campo Estatus De Pedido de la venta en la nota');
t(F[2][ix('SKU')]==='JBL-PBSTAGE320AM-NEG-8756 x2 | SON-CFI2015JAPON-GRI-4392 x1'&&F[2][ix('PIEZAS')]===3,'609B: varias lineas');
t(F[2][ix('PAQUETERIA')]==='FedEx'&&F[2][ix('ESTATUS PAQUETERIA')]==='ABRIR LINK','609B: pagina sin estatus = ABRIR LINK, no inventa');
t(/ABRIR LINK|abrir link/i.test(F[2][ix('CONCLUSION')])&&/fedextrack/.test(F[2][ix('LINK RASTREO')]),'609B: conclusion pide abrir link y trae el link');
t(F[3][ix('ENVIADO')]==='NO'&&/ODOO|NO ENVIADO/.test(F[3][ix('CONCLUSION')])&&F[3][ix('GUIA')]==='','609C: pick hecho pero OUT esperando, sin guia = no enviado');
t(/WH\/OUT\/3: Esperando disponibilidad/.test(F[3][ix('ENTREGA / ENVIO')]),'estado de la entrega en español');
t(F[4][ix('ENVIADO')]==='CANCELADA'&&F[4][ix('CONCLUSION')]==='CANCELADA EN ODOO','609D cancelada');
t(F[5][ix('PEDIDO')]==='609E'&&/referencia del cliente/.test(F[5][ix('NOTA')]),'6000X se encuentra por referencia del cliente y muestra la venta real');
t(escrito.o.texto.indexOf('GUIA')>=0,'PEDIDO y GUIA como texto');
t(pedidas.length===2,'solo pide la pagina de las 2 guias (no de las que no tienen)');
t(logs.some(l=>l[0]==='INFO'&&/Diagnostico/.test(l[2])),'deja el diagnostico de cada paqueteria en el Log');
t(logs.some(l=>l[0]==='OK'&&l[1]==='CONSULTA_PEDIDOS'),'resultado al Log');
t(infos.length===1&&infos[0][2]==='aviso','aviso: quedaron guias para abrir');
t(llamadas.filter(x=>x[1]==='fields_get').length===1,'campos de Studio: 1 consulta (cache)');
// no escribio nada en Odoo
t(llamadas.every(x=>['search_read','fields_get'].includes(x[1])),'SOLO LEE: ningun write/create/unlink');

t(F[0][ix('FUENTE')]==='ODOO','sin site: FUENTE = ODOO');
t(logs.some(l=>l[0]==='WARN'&&/ruta de datos/.test(l[2])),'sin site: avisa en el Log que uso Odoo');

// ---- con el site: /ventas-general primero, Odoo solo para lo que falta ----
const sitioPedidos={total:3,data:[
 {folio:'609130490032514',ref_externa:'600000128107017',fecha:'29/10/2026 20:42',erp:'457871',estado:'Shipped',paqueteria:'MXFDD',guia:'MXFDDWM22065830',estatus_envio:'En camino · hace un momento',lineas:[{sku_canal:'JBL-VBEAM2BLKAM-NEG-5041',sku_odoo:'JBL-VBEAM2BLKAM-NEG-5041',cantidad:1}]},
 {folio:'609130490190450',ref_externa:'600000145210935',fecha:'30/10/2026 12:17',erp:'458378',estado:'Created',guia:null,estatus_envio:'Sin guía',lineas:[{sku_canal:'NIN-MANSION2-N/A-8070-MSI',sku_odoo:'NIN-MANSION2-N/A-8070',cantidad:1}]},
 {folio:'609130490208200',ref_externa:'600000132850307',estado:'Created',lineas:[{sku_canal:'NIN-MANSION2-N/A-8070-MSI',sku_odoo:'NIN-MANSION2-N/A-8070',cantidad:1}]}]};
const rutasPedidas=[];
ctx.fetchSitio_=(ruta,o)=>{rutasPedidas.push(ruta);
 if(ruta.startsWith('/ventas-general-data?canal=Walmart'))return{codigo:404,texto:''};
 if(ruta.startsWith('/ventas-general-data'))return{codigo:404,texto:''};
 if(ruta==='/ventas-general')return{codigo:200,texto:'<html><script src="/static/vg.js"></script></html>'};
 if(ruta==='/static/vg.js')return{codigo:200,texto:'fetch("/ventas-general/api/ordenes?canal=x").then(r=>r.json())'};
 if(ruta.startsWith('/ventas-general/api/ordenes'))return{codigo:200,texto:JSON.stringify(sitioPedidos)};
 return{codigo:404,texto:''};};
ctx.agregarRutas_=(rep,txt)=>{const re=/fetch\(\s*["'`]([^"'`]+)["'`]/g;let m;while((m=re.exec(txt)))rep.rutas.push({ruta:m[1]});};
hoja.rows=[['PEDIDO'],['609130490032514'],['600000145210935'],['609A']];
llamadas.length=0;logs.length=0;pedidas.length=0;infos.length=0;
R('cpConsultar')();
const G=escrito.filas;
t(props.CP_RUTA_VENTAS==='/ventas-general/api/ordenes?canal=x','descubre la ruta de datos leyendo el JS de la pagina y la guarda');
t(G[0][ix('FUENTE')]==='SITE'&&G[0][ix('GUIA')]==='MXFDDWM22065830'&&G[0][ix('PAQUETERIA')]==='BigSmart','609…514 del site: guia y BigSmart');
t(G[0][ix('ESTATUS PAQUETERIA')]==='En transito'&&G[0][ix('CONCLUSION')]==='EN CAMINO','estatus del site "En camino" = EN CAMINO, sin raspar la pagina');
t(G[0][ix('ENVIADO')]==='SI'&&G[0][ix('SKU')]==='JBL-VBEAM2BLKAM-NEG-5041','Shipped = enviado y SKU de Odoo');
t(G[1][ix('PEDIDO')]==='609130490190450'&&G[1][ix('GUIA')]===''&&/NO ENVIADO/.test(G[1][ix('CONCLUSION')]),'6000… se encuentra por ref externa: Created sin guia = NO ENVIADO');
t(/SKU canal NIN-MANSION2-N\/A-8070-MSI/.test(G[1][ix('NOTA')])&&G[1][ix('SKU')]==='NIN-MANSION2-N/A-8070','SKU Odoo en SKU y el del canal en la nota');
t(G[2][ix('FUENTE')]==='ODOO','609A no esta en el site: lo busca en Odoo');
t(llamadas.filter(x=>x[0]==='sale.order'&&x[1]==='search_read').length>=1&&!JSON.stringify(llamadas).includes('609130490032514'),'a Odoo solo va lo que falto');
t(!pedidas.some(u=>u.includes('MXFDDWM22065830')),'no raspa la pagina de la paqueteria si el site ya dio el estatus');
t(logs.some(l=>l[0]==='INFO'&&/Campos que manda el site/.test(l[2])),'deja en el Log los campos que manda el site');
// segunda corrida: usa la ruta guardada directo
rutasPedidas.length=0;R('cpConsultar')();
t(rutasPedidas[0].startsWith('/ventas-general/api/ordenes'),'segunda corrida va directo a la ruta guardada');
// site caido y Odoo caido: no truena, lo dice
ctx.fetchSitio_=()=>({codigo:500,texto:''});ctx.odooExecute_=()=>{throw new Error('Odoo rechazo las credenciales')};delete props.CP_RUTA_VENTAS;infos.length=0;
R('cpConsultar')();
t(/Odoo no contesto/.test(escrito.filas[0][ix('NOTA')])&&infos[0][2]==='aviso','site y Odoo caidos: avisa sin tronar');

// ---- boton de links ----
hoja.rows=[['PEDIDO','LINK RASTREO'],['609A','https://a.test/1'],['609B','https://a.test/2\nhttps://b.test/3'],['609C','https://a.test/1']];
R('cpAbrirTodos')();
const d=ctx.__dialogo;
t(d&&/Abrir las 3 pesta/.test(d.html),'boton con 3 pestañas (sin repetir)');
t(/window\.open/.test(d.html)&&d.html.includes('https://b.test/3'),'abre cada link');
hoja.rows=[['PEDIDO','LINK RASTREO'],['609A','<img onerror=x>']];infos.length=0;R('cpAbrirTodos')();
t(infos.length===1&&infos[0][2]==='aviso','links no http se ignoran');
hoja.rows=[['PEDIDO','LINK RASTREO'],['609A','https://a.test/?x=</script><b>']];R('cpAbrirTodos')();
t(!/<\/script><b>/.test(ctx.__dialogo.html.split('<script>var U=')[1]),'URL con </script> escapada en el JSON');

// ---- prefijos propios y sin posicion fija ----
const src=fs.readFileSync(__dirname+'/../apps-script/ConsultaPedidos.gs','utf8');
t(!/\bfila\[\d+\]|\bdatos\[\w+\]\[\d+\]/.test(src),'sin lecturas por posicion');
console.log(`t29: ${ok} OK, ${bad} fallas`);process.exit(bad?1:0);
