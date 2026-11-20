// t94: RastreoOdoo.gs (20-nov): lee de Odoo quien empaco, cuando y que guia se escaneo. Solo lectura. Nada real.
const fs=require('fs'),vm=require('vm');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp};vm.createContext(ctx);
const src=fs.readFileSync(__dirname+'/../apps-script/RastreoOdoo.gs','utf8');
vm.runInContext(src,ctx);
// 1) parse del mensaje real del webhook
const body='<p>Empacó: Daniel Robles - 15/11/2026 22:18 | Serie/Venta: NIN-MANSION2-N/A-8070-P00604-023 | Venta: 609132096120920 | Picking: WH/OUT/140684 | Cant: 1 | Guía escaneada: MXFDDWM22865573 | 📷 9 fotos guardadas en el sitio (Ventas General)</p>';
const x=ctx.rqoParse_(body);
t(x&&x.empaco==='Daniel Robles'&&x.fechaTxt==='15/11/2026 22:18'&&x.picking==='WH/OUT/140684'&&x.guia==='MXFDDWM22865573','parse del mensaje de empaque');
t(ctx.rqoParse_('<p>SE AUTORIZA ORDEN CON PRECIO POR DEBAJO DEL MÍNIMO</p>')===null&&ctx.rqoParse_('')===null,'otros mensajes no cuentan');
const d=ctx.rqoFechaOdoo_('2026-11-15 22:18:05');t(d instanceof Date&&d.toISOString()==='2026-11-15T22:18:05.000Z','fecha de Odoo en UTC');
// 2) llenado de la hoja con Odoo simulado
const enc=['Guia','Paqueteria','Orden de compra (609)','Estado final','Empaco','Fecha empaque','Picking salida','Guia escaneada en bodega'];
const filas=[["'MXFDDWM22865573",'BIGSMART',"'609132096120920",'','','','',''],["'MXFDDWM1",'BIGSMART',"'609000000000001",'ENTREGADO','','','',''],["'MXFDDWM2",'BIGSMART',"'609000000000002",'','','','',''],["'MXFDDWM3",'BIGSMART',"'609000000000003",'','','','','']];
const escrito={},llamadas=[],cache={};
Object.assign(ctx,{RQ_HOJA:'PAQUETERIA',RQ_ETAPA:'RASTREO',RQ_ENC:['Guia'],
  CacheService:{getScriptCache:()=>({get:k=>cache[k]||null,put:(k,v)=>{cache[k]=v;}})},
  odooApagado_:()=>false,peHojaAsegurar_:()=>({getRange:(r,c)=>({setValue:v=>{escrito[r+','+c]=v;}})}),
  peTabla_:()=>({filas,pos:Object.fromEntries(enc.map((e,i)=>[e.toUpperCase(),i]))}),
  peCol_:(tb,n)=>{const j=enc.indexOf(n[0]);return j;},prDigitos_:s=>String(s||'').replace(/\D/g,''),
  ubicarColumnas_:()=>({}),escrCol_:(m,e)=>enc.indexOf(e)+1,logInfo_:()=>{},
  odooExecute_:(mod,met,args,kw)=>{llamadas.push(mod+'.'+met);
    if(mod==='sale.order')return [{id:473885,name:'609132096120920'},{id:2,name:'609000000000002'}];
    if(mod==='mail.message')return [{res_id:473885,date:'2026-11-15 22:18:05',body},{res_id:2,date:'2026-11-16 10:00:00',body:body.replace('MXFDDWM22865573','MXFDDWM9').replace('Daniel Robles','Ana Paz')},{res_id:473885,date:'2026-11-14 10:00:00',body:body.replace('Daniel Robles','Viejo')}];
    return [];}});
const n=ctx.rqoEmpaque_(false);
t(n===2,'llena 2 guias (la entregada y la que no tiene mensaje no)');
t(escrito['2,5']==='Daniel Robles'&&escrito['2,7']==='WH/OUT/140684'&&escrito['2,8']==="'MXFDDWM22865573"&&escrito['2,6'] instanceof Date,'guia que coincide: datos del mensaje mas reciente');
t(escrito['4,5']==='Ana Paz'&&escrito['4,8']==="'MXFDDWM9 (NO COINCIDE)",'guia escaneada distinta: NO COINCIDE');
t(!('3,5' in escrito)&&!('5,5' in escrito),'entregada y sin mensaje no se tocan');
t(llamadas.every(c=>/\.search_read$/.test(c)),'en Odoo solo search_read');
t(ctx.rqoEmpaque_(false)===0&&llamadas.length===2,'como maximo cada 20 min');
// 3) solo lectura y conectado a rastreo_lista
const sin=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
t(!/'(create|write|unlink|action_cancel|message_post)'|UrlFetchApp/.test(sin),'nunca escribe en Odoo');
const rq=fs.readFileSync(__dirname+'/../apps-script/Rastreo.gs','utf8');
t(/function rqLista_[\s\S]{0,2500}lock\.releaseLock\(\);[\s\S]{0,300}rqoEmpaque_\(false\)/.test(rq),'rastreo_lista lee el empaque, fuera del candado');
t(/en Odoo la empaco/.test(rq),'el aviso REVISAR A MANO dice si salio de bodega');
// 4) loop hasta tener los datos (Rastreo.gs)
const c2={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp};vm.createContext(c2);
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/Rastreo.gs','utf8'),c2);
const H=Date.now();
t(c2.rqToca_({paq:'BIGSMART',consulta:H-11*60000,nota:'REVISAR A MANO (2 seguidas): sin respuesta'},H)===true&&c2.rqToca_({paq:'BIGSMART',consulta:H-11*60000,nota:''},H)===false,'la que fallo se vuelve a pedir a los 10 min; la que se leyo bien, a las 3 h');
t(c2.rqToca_({paq:'BIGSMART',consulta:H-5*60000,nota:'REVISAR A MANO: x'},H)===false,'no antes de 10 min');
t(c2.rqFallasDe_('REVISAR A MANO (5 seguidas): x')===5&&c2.rqFallasDe_('REVISAR A MANO: sin respuesta')===1&&c2.rqFallasDe_('')===0,'cuenta lecturas seguidas sin datos');
t(/seguidas < RQ_FALLAS_ALERTA\) \{ reintentos\.push/.test(rq)&&/var RQ_FALLAS_ALERTA = 6;/.test(rq),'alerta roja solo despues de 6 lecturas seguidas (~1 h); antes solo Log y se sigue intentando');
// 5) guias de TRACKING (Seller Center) cuando el site aun no da ENVIO GUIA
t(JSON.stringify(c2.rqGuiasVenta_('', 'MXFDD MXFDDWM23097897', 'seller'))==='["MXFDDWM23097897"]','TRACKING "MXFDD MXFDDWM..." -> solo la guia');
t(JSON.stringify(c2.rqGuiasVenta_('', '45678912 MXFDDWM23097897', 'seller'))==='["MXFDDWM23097897"]'&&JSON.stringify(c2.rqGuiasVenta_('', 'MX-FEDX 545284634491', 'seller'))==='["545284634491"]','numero de 8 digitos y "MX-FEDX" no son guias');
t(c2.rqGuiasVenta_('', 'MXFDD MXFDDWM23097897', 'fulfillment').length===0,'WFS no se rastrea');
t(JSON.stringify(c2.rqGuiasVenta_('MXFDDWM1111111', 'MXFDD MXFDDWM2222222', 'seller'))==='["MXFDDWM1111111"]','si el site ya tiene ENVIO GUIA, manda esa');
t(/var RQ_LOTE = 40;/.test(rq)&&/const RQ_LOTE = 40;/.test(fs.readFileSync(__dirname+'/../extension-cookie/background.js','utf8')),'40 guias por vuelta en Sheet y extension');
// 5b) BigSmart se muestra como Paqueteria Dedicada Walmart (20-nov)
t(c2.rqNombrePaq_('BIGSMART')==='PAQUETERIA DEDICADA WALMART'&&c2.rqNombrePaq_('FEDEX')==='FEDEX'&&c2.rqNombrePaq_('')==='PAQUETERIA DESCONOCIDA','nombre visible de la paqueteria');
const c4={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp};vm.createContext(c4);vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/Recoleccion.gs','utf8'),c4);
t(c4.recContarPendientes_([{paq:'PAQUETERIA DEDICADA WALMART',codigo:'108',consulta:Date.now()},{paq:'BIGSMART',codigo:'108',consulta:Date.now()},{paq:'FEDEX',codigo:'',consulta:Date.now()}],Date.now()).n===2,'recoleccion cuenta las de Paqueteria Dedicada Walmart (y las viejas BIGSMART)');
for(const f of ['apps-script/Organizar.gs','apps-script/Reporte.gs','extension-cookie/popup.js']) t(!/BigSmart/.test(fs.readFileSync(__dirname+'/../'+f,'utf8')),'sin "BigSmart" visible en '+f);
// 6) un solo id por computadora aunque varias vueltas lo pidan a la vez (turno fantasma PC-B73C, 20-nov)
(async()=>{
  const bgs=fs.readFileSync(__dirname+'/../extension-cookie/background.js','utf8');
  const ini=bgs.indexOf('let instanciaProm'), fin=bgs.indexOf('async function tengoTurno');
  const mem={};const c3={console,Promise,String,crypto:require('crypto').webcrypto,Date,Math,
    chrome:{storage:{local:{get:async(k)=>{await new Promise(r=>setTimeout(r,5));const o={};[].concat(k).forEach(x=>{if(x in mem)o[x]=mem[x]});return o},set:async(o)=>{await new Promise(r=>setTimeout(r,5));Object.assign(mem,o)}}}}};
  vm.createContext(c3);vm.runInContext(bgs.slice(ini,fin)+';this.instancia=instancia;',c3);
  const r=await Promise.all([c3.instancia(),c3.instancia(),c3.instancia(),c3.instancia()]);
  t(new Set(r.map(x=>x.id)).size===1&&r[0].id===mem.instId&&/^PC-/.test(r[0].nombre),'varias vueltas a la vez: un solo id (sin turno fantasma)');
  console.log('t94',ok,'ok',bad,'fallas');if(bad)process.exit(1);
})();
