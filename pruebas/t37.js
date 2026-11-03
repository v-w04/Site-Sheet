// VentasCva.gs (simulado): baja lineas -CVA de Odoo, historico viejo, correo diario. Datos simulados, no es una corrida real.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN};vm.createContext(ctx);
ctx.escrAsegurarFilas_=()=>{};
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const R=s=>vm.runInContext(s,ctx);
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m,d)=>logs.push([k,e,m,d]));ctx.flushLog_=()=>{};ctx.avisoDia_=()=>{};
const props={};ctx.props_=()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=String(v)},deleteProperty:k=>{delete props[k]}});
let hoy='2026-11-02',hora='9';ctx.hoy_=()=>hoy;ctx.TZ='America/Mexico_City';ctx.toast_=()=>{};ctx.LOCK_ESPERA_MS=1;
ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
ctx.Utilities={formatDate:(d,tz,f)=>f==='H'?hora:(f==='dd/MM'?'30/10':'2026-10-01 00:00:00')};
ctx.SpreadsheetApp={flush:()=>{}};ctx.odooApagado_=()=>false;ctx.dlgInfo_=()=>{};
const mails=[];ctx.MailApp={sendEmail:o=>mails.push(o)};
let cols=[];const data={};
const h={getFrozenRows:()=>1,setFrozenRows:()=>{},getMaxRows:()=>1000,getLastColumn:()=>cols.length,getLastRow:()=>1+Math.max(0,...Object.values(data).map(a=>a.length)),
 getRange:(r,c,n,w)=>({getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w||1},(_,k)=>{const e=cols[c-1+k];return (data[e]||[])[r-2+i]===undefined?'':data[e][r-2+i]})),
  setValues:v=>{v.forEach((x,i)=>x.forEach((y,k)=>{const e=cols[c-1+k];data[e]=data[e]||[];data[e][r-2+i]=y}))}})};
ctx.getHoja_=()=>h;
ctx.ubicarColumnas_=(hh,enc)=>{enc.forEach(e=>{if(!cols.includes(e))cols.push(e)});return {enc,col:Object.fromEntries(cols.map((e,i)=>[e.toUpperCase(),i+1]))}};
ctx.normEnc_=s=>String(s===null||s===undefined?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();ctx.escrCol_=(m,e)=>m.col[String(e).toUpperCase()]||0;
let lineas=[],llamadas=[];
ctx.odooExecute_=(mod,met,args,kw)=>{llamadas.push(mod+'.'+met);
 if(mod==='res.company')return [{id:7}];
 if(mod==='sale.order.line'){const dom=args[0];const g=dom.find(x=>x[0]==='id');return lineas.filter(l=>!g||l.id>g[2]);}
 if(mod==='sale.order')return args[0].map(id=>({id,name:'S'+id,date_order:'2026-10-30 12:00:00',partner_id:[1,'MERCADO LIBRE'],user_id:[2,'Vendedor'],state:'sale',amount_total:2000}));
 if(mod==='product.product')return args[0].map(id=>({id,default_code:'abc-'+id+'-cva',display_name:'[x] Prod '+id}));return []};
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/VentasCva.gs','utf8'),ctx);vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/PreciosErroneos.gs','utf8'),ctx);vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/VentaDiaria.gs','utf8'),ctx);
ctx.kdReintentar_=f=>f();ctx.vdLibro_=()=>ctx.getSpreadsheet_();ctx.vdHoja_=n=>ctx.getHoja_(n);

const L=(id)=>({id,order_id:[id*10,'S'],product_id:[id*100,'p'],product_uom_qty:2,price_unit:500,price_subtotal:1000});
// 1) primera bajada: marca inicial, sin correo (hora<8)
hora='7';lineas=[L(1),L(2),L(3)];
let r=R('vcBajar_()');
t(r.nuevas===3&&data['SKU'].join()==='ABC-100-CVA,ABC-200-CVA,ABC-300-CVA','baja 3 lineas CVA con SKU en mayusculas: '+JSON.stringify(r));
t(props.VC_FILA_AVISADA==='1'&&props.VC_ULTIMO_ID==='3','la marca del correo queda ANTES de lo nuevo (en la primera vez se reporta todo lo que entra tras la hoja vacia): '+props.VC_FILA_AVISADA);
// 2) otra bajada: sin duplicar
r=R('vcBajar_()');t(r.nuevas===0&&data['ID Línea'.toUpperCase()]===undefined||data['ID Línea'].length===3,'no duplica');
// 3) historico: hoja con 2 filas previas + marca
for(const k in data)delete data[k];cols=[];for(const k in props)delete props[k];
// correo antes de la hora: no manda
hora='7';lineas=[L(5)];R('vcBajar_()');R('vcCorreo_()');t(mails.length===0,'sin activar el correo en Site Sheet no manda');
// correo a las 9: manda lo nuevo desde la marca
hora='9';lineas=[L(5),L(6)];R('vcBajar_()');
let auto=false;ctx.vdCorreoCvaActivo_=()=>auto;
let m=R('vcCorreo_()');t(m===false&&mails.length===0,'correo automatico apagado mientras Venta Diaria siga mandandolo (un solo remitente)');
auto=true;m=R('vcCorreo_()');
t(m===true&&mails.length===1&&mails[0].to==='victor.walmart.04@gmail.com'&&/Venta CVA/.test(mails[0].subject),'a las 9 manda un correo a victor.walmart.04: '+JSON.stringify(mails.map(x=>x.subject)));
t(/ABC-600-CVA/.test(mails[0].htmlBody),'el correo trae lo vendido');
m=R('vcCorreo_()');t(m===false&&mails.length===1,'sin lineas nuevas no repite el correo');
hoy='2026-11-03';m=R('vcCorreo_()');t(m===false,'sin ventas nuevas no manda nada');
lineas=[L(5),L(6),L(7)];R('vcBajar_()');m=R('vcCorreo_()');t(m===true&&mails.length===2&&/ABC-700-CVA/.test(mails[1].htmlBody)&&!/ABC-600-CVA/.test(mails[1].htmlBody),'venta nueva el mismo dia: otro correo, solo con lo nuevo');
t(R('vcEsc_("<b>x</b>")')==='&lt;b&gt;x&lt;/b&gt;','escapa HTML');
// 4) historico del libro viejo
const viejo=[['ID Línea','Número (SO)','Fecha creación','Cliente','Vendedor','Estado SO','SKU','Producto','Cantidad','Precio unitario','Importe línea','Total orden'],[900,'S900',new Date(),'WALMART','V','sale','X-CVA','P',1,10,10,10],[901,'S901',new Date(),'LIV','V','sale','Y-CVA','P',1,10,10,10]];
ctx.SpreadsheetApp.openById=()=>({getSheetByName:()=>({getLastRow:()=>3,getLastColumn:()=>12,getRange:()=>({getValues:()=>viejo})})});
for(const k in data)delete data[k];cols=[];for(const k in props)delete props[k];
R('vcTraerHistorico_()');
t(data['SKU'].join()==='X-CVA,Y-CVA'&&props.VC_ULTIMO_ID==='901'&&props.VC_FILA_AVISADA==='3','copia el historico viejo y deja marcas (no reenvia por correo): '+JSON.stringify(props));
R('vcTraerHistorico_()');t(data['SKU'].length===2,'copiar dos veces no duplica');
viejo[0][0]='noahags cam';viejo.push([902,'S902',new Date(),'LIV','V','sale','W-CVA','P',1,10,10,10]);R('vcTraerHistorico_()');t(data['SKU'].length===3&&data['SKU'][2]==='W-CVA','titulo de la columna A borrado en la hoja vieja: se toma la columna A como ID Linea');
// registro
['VentaDiaria.gs:ventasCvaProgramado_','Setup.gs:ventasCvaBajar','Setup.gs:ventaDiariaTraerTodo','Setup.gs:ventasCvaCorreoAhora','Organizar.gs:Pedidos CVA'].forEach(x=>{const [f,k]=x.split(':');t(fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8').includes(k),f+' tiene '+k)});
console.log(bad?'FALLAS '+bad:'t37 OK '+ok);process.exit(bad?1:0);
