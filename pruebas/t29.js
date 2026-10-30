// ConsultaPedidos.gs con datos simulados (forma real del site 30-oct): solo el site, VENTA <-> REFERENCIA, busqueda q=, paginas canal=WL, boton de links. Nunca Odoo.
const fs=require('fs'),vm=require('vm');
const ctx={console};vm.createContext(ctx);
const cargar=f=>vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8'),ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const R=s=>vm.runInContext(s,ctx);
const logs=[];ctx.logOk_=(e,m,d)=>logs.push(['OK',e,m,d]);ctx.logInfo_=(e,m,d)=>logs.push(['INFO',e,m,d]);ctx.logWarn_=(e,m,d)=>logs.push(['WARN',e,m,d]);ctx.logErr_=(e,m,d)=>logs.push(['ERROR',e,m,d]);ctx.flushLog_=()=>{};
const props={};ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=String(v)}})};
ctx.Utilities={formatDate:()=> '2026-10-30 16:10'};ctx.SITE='https://electronicsmexico.site';
let odooLlamado=0;ctx.odooExecute_=()=>{odooLlamado++;throw new Error('no debe llamarse')};
cargar('Columnas.gs');cargar('ConsultaPedidos.gs');

// ---- piezas puras ----
t(R('cpPaqueteria_("MXFDDWM21560270")')==='BigSmart'&&R('cpPaqueteria_("519750918399")')==='FedEx'&&R('cpPaqueteria_("X1")')==='','paqueteria por formato');
t(JSON.stringify(R('cpGuias_("MXFDDWM1, 519750918399\\nMXFDDWM1")'))===JSON.stringify(['MXFDDWM1','519750918399']),'guias sin repetir');
t(R('cpLink_("FedEx","519750918399")').includes('trknbr=519750918399'),'link FedEx');
const C=(e,s,g)=>R('cpConclusion_')(e,s,g);
t(C('SI','Entregado',true)==='ENTREGADO'&&C('CANCELADA','',false)==='CANCELADA'&&C('NO','',false)==='NO ENVIADO: sin guia'&&C('SI','Devuelto',true)==='DEVUELTO','conclusiones');
const E=x=>R('cpEstatusEnvio_')(x);
t(E('En camino [recolectado]')==='En transito'&&E('Guía generada [guia]')==='Sin recolectar'&&E('Sin guía [sin_guia]')===''&&E('Entregado [entregado]')==='Entregado'&&E('x [incidencia]')==='Incidencia','codigos de envio del site');
t(R('cpInterpretar_')('BigSmart','MXFDDWM1','<p>Entregado</p>').estatus==='','pagina sin la guia: no inventa');
t(R('typeof cpLeerOdoo_')==='undefined'&&R('typeof cpFilaOdoo_')==='undefined','ya no hay codigo de Odoo');

// ---- hoja y site simulados ----
const hoja={rows:[],getName:()=>'Consulta Pedidos',getLastRow:()=>hoja.rows.length,getLastColumn:()=>Math.max(...hoja.rows.map(r=>r.length)),
  getRange:(r,c,nr=1,nc=1)=>({getValues:()=>{const a=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((hoja.rows[r-1+i]||[])[c-1+j]??'');a.push(row)}return a},getValue:()=>(hoja.rows[r-1]||[])[c-1]??'',setValues(){return this}}),setFrozenRows(){}};
ctx.SpreadsheetApp={getActive:()=>({getSheetByName:()=>hoja,insertSheet:()=>hoja}),getUi:()=>({showModalDialog:(o)=>{ctx.__dlg=o.html}})};
ctx.HtmlService={createHtmlOutput:h=>({html:h,setWidth(){return this},setHeight(){return this}})};
const infos=[];ctx.dlgInfo_=(a,b,c)=>infos.push([a,b,c]);ctx.dlgEsc_=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');ctx.DLG_CSS='';
let escrito=null;ctx.reescribirHoja_=(h,enc,filas,o)=>{escrito={enc,filas,o}};
const ix=n=>escrito.enc.indexOf(n);
const pedidas=[];ctx.UrlFetchApp={fetch:u=>{pedidas.push(u);return{getResponseCode:()=>200,getContentText:()=>''}}};
const base={canal:'WL',cliente:'Z',estado_norm:'pagada',fulfillment:'seller',items:1,piezas:1,precio:799,envio_guia_retorno:'',tracking:''};
const r1=Object.assign({},base,{folio:'609130490032514',orden_id:'609130490032514',referencia:'600000128107017',estatus:'Shipped',envio_estado:'recolectado',envio_estado_txt:'En camino',envio_guia:'MXFDDWM22065830',envio_paqueteria:'MXFDD',envio_ult_txt:'Guía creada por Walmart',envio_ts:'2026-11-04T05:50',envio_url:'https://www.walmart.com.mx/tu-cuenta/pedidos/600000128107017/track/MXFDDWM22065830',items_meta:[{sku:'JBL-VBEAM2BLKAM-NEG-5041',sku_odoo:'JBL-VBEAM2BLKAM-NEG-5041'}],producto:'JBL Vibe Beam 2',odoo_id:'457871'});
const r2=Object.assign({},base,{folio:'609130490190450',orden_id:'609130490190450',referencia:'600000145210935',estatus:'Created',envio_estado:'sin_guia',envio_estado_txt:'Sin guía',envio_guia:'',envio_url:'',items_meta:[{sku:'NIN-MANSION2-N/A-8070-MSI',sku_odoo:'NIN-MANSION2-N/A-8070'}]});
const r3=Object.assign({},r1,{folio:'609130189286827',orden_id:'609130189286827',referencia:'600000129830965',estatus:'Created',envio_guia:'MXFDDWM22067188',envio_url:'',piezas:2,items_meta:[{sku:'JBL-PBSTAGE320AM-NEG-8756-MSI',sku_odoo:'JBL-PBSTAGE320AM-NEG-8756'}]});
const r4=Object.assign({},r2,{folio:'609130111111111',orden_id:'609130111111111',referencia:'600000111111111'});   // solo aparece en la pagina 2 de Walmart
const ml=[...Array(100)].map((_,i)=>Object.assign({},base,{canal:'ML',folio:'20000192548275'+(10+i),orden_id:'x',estatus:'PAGADO'}));
const urls=[];let busquedaSirve=true;
ctx.fetchSitio_=(ruta)=>{urls.push(ruta);const q=new URLSearchParams(ruta.split('?')[1]||'');
  if(!ruta.startsWith('/ventas-general-data'))return{codigo:404,texto:''};
  const v=q.get('q');
  if(v&&busquedaSirve){const hit=[r1,r2,r3].filter(r=>r.folio===v||r.referencia===v);return{codigo:200,texto:JSON.stringify({ok:true,total:hit.length,ventas:hit})};}
  if(q.get('canal')==='WL'){const n=Number(q.get('page'));return{codigo:200,texto:JSON.stringify({ok:true,total:4,ventas:n===1?[r1,r2,r3]:n===2?[r4]:[]})};}
  return{codigo:200,texto:JSON.stringify({ok:true,total:85383,ventas:ml})};};

// ---- corrida: venta -> referencia y referencia -> venta ----
hoja.rows=[['PEDIDO','Mi nota'],['609130490032514','x'],[''],['600000145210935'],['609130189286827'],['609999999999999']];
R('cpConsultar')();
const F=escrito.filas;
t(escrito.enc.length===16&&ix('VENTA')===1&&ix('REFERENCIA')===2&&ix('FUENTE')<0,'columnas: PEDIDO, VENTA, REFERENCIA... sin FUENTE');
t(F[0][ix('PEDIDO')]==='609130490032514'&&F[0][ix('REFERENCIA')]==='600000128107017','pongo la venta: llena la referencia');
t(F[2][ix('PEDIDO')]==='600000145210935'&&F[2][ix('VENTA')]==='609130490190450','pongo la referencia: llena la venta (y respeta lo que escribi en PEDIDO)');
t(F[1].every(x=>x===''),'fila en blanco queda en blanco');
t(F[0][ix('GUIA')]==='MXFDDWM22065830'&&F[0][ix('ESTATUS PAQUETERIA')]==='En transito'&&F[0][ix('CONCLUSION')]==='EN CAMINO','guia y estatus del site');
t(F[0][ix('LINK RASTREO')]===r1.envio_url&&F[0][ix('ULTIMO EVENTO')].startsWith('Guía creada por Walmart'),'link y ultimo evento del site (sin link armado a mano)');
t(F[2][ix('SKU')]==='NIN-MANSION2-N/A-8070'&&F[2][ix('CONCLUSION')]==='NO ENVIADO: sin guia','Created sin guia = NO ENVIADO, SKU Odoo del site');
t(F[3][ix('ENVIADO')]==='SI'&&F[3][ix('PIEZAS')]===2,'canal Created pero ya en camino = enviado');
t(F[4][ix('CONCLUSION')]==='NO ENCONTRADO'&&/No esta en Ventas General/.test(F[4][ix('NOTA')]),'no existe = NO ENCONTRADO con nota del site');
t(props.CP_PARAM_BUSCAR==='q'&&urls.some(u=>/por_pag=100&page=1&canal=&q=600000145210935&solo_falta=/.test(u)),'busca como la pagina: q=');
t(escrito.o.texto.includes('VENTA')&&escrito.o.texto.includes('REFERENCIA'),'VENTA y REFERENCIA como texto');
t(pedidas.length===0&&odooLlamado===0,'no entra a Odoo ni a paginas de paqueteria');
t(logs.some(l=>l[0]==='INFO'&&/Campos que manda el site/.test(l[2]))&&logs.some(l=>l[0]==='OK'&&/encontrados en el site/.test(l[2])),'Log: campos y resultado');

// ---- si la busqueda no sirve: recorre paginas canal=WL ----
busquedaSirve=false;delete props.CP_PARAM_BUSCAR;delete props.CP_CANAL_WALMART;urls.length=0;logs.length=0;
hoja.rows=[['PEDIDO'],['609130111111111']];R('cpConsultar')();
t(escrito.filas[0][ix('REFERENCIA')]==='600000111111111'&&props.CP_CANAL_WALMART==='WL'&&urls.some(u=>/por_pag=500&page=2&canal=WL/.test(u)),'encuentra en la pagina 2 filtrando canal=WL');

// ---- site caido ----
ctx.fetchSitio_=()=>({codigo:500,texto:''});delete props.CP_RUTA_VENTAS;infos.length=0;
hoja.rows=[['PEDIDO'],['609130490032514']];R('cpConsultar')();
t(/El site no contesto/.test(escrito.filas[0][ix('NOTA')])&&infos[0][2]==='aviso'&&odooLlamado===0,'site caido: lo dice, sin Odoo');

// ---- boton de links ----
hoja.rows=[['PEDIDO','LINK RASTREO'],['a','https://a.test/1'],['b','https://a.test/2\nhttps://b.test/3'],['c','https://a.test/1'],['d','<img onerror=x>']];
R('cpAbrirTodos')();
t(/Abrir las 3 pesta/.test(ctx.__dlg)&&/window\.open/.test(ctx.__dlg),'boton abre 3 pestañas sin repetir ni basura');
console.log(`t29: ${ok} OK, ${bad} fallas`);process.exit(bad?1:0);
