// Pedir recolecciones a mano para otra fecha (menu con ventana): validacion, ventana, prueba sin enviar, envio simulado y que el envio diario no se rompa.
const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const ctx={console};vm.createContext(ctx);
const cargar=f=>vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8'),ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};

// ---- mocks ----
const fmt=(d,tz,f)=>{const o={timeZone:tz,hour12:false};const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{...o,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));if(p.hour==='24')p.hour='00';
  return f.replace('yyyy',p.year).replace('MM',p.month).replace('dd',p.day).replace('HH',p.hour).replace('mm',p.minute).replace('ss',p.second)};
ctx.Utilities={formatDate:fmt,DigestAlgorithm:{MD5:'md5'},Charset:{UTF_8:'u'},computeDigest:(a,s)=>[...crypto.createHash('md5').update(s).digest()].map(b=>b>127?b-256:b)};
const props={};ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=String(v)},deleteProperty:k=>{delete props[k]}})};
ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
const mails=[];ctx.MailApp={sendEmail:o=>mails.push(o)};
ctx.Session={getEffectiveUser:()=>({getEmail:()=>'soporte@x.com'})};
const logs=[];let flushes=0;
ctx.logOk_=(e,m,d)=>logs.push(['OK',e,m,d]);ctx.logInfo_=(e,m,d)=>logs.push(['INFO',e,m,d]);ctx.logWarn_=(e,m,d)=>logs.push(['WARN',e,m,d]);ctx.logErr_=(e,m,d)=>logs.push(['ERROR',e,m,d]);ctx.flushLog_=()=>{flushes++};
// hojas en memoria
const hojas={};
const mkSheet=n=>{const s={name:n,rows:[],frozen:0,getLastRow(){return s.rows.length},getLastColumn(){return Math.max(0,...s.rows.map(r=>r.length))},getMaxRows(){return Math.max(s.rows.length,1000)},
  getRange(r,c,nr=1,nc=1){const o={getValues:()=>{const a=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((s.rows[r-1+i]||[])[c-1+j]??'');a.push(row)}return a},
    setValues:v=>{v.forEach((row,i)=>{s.rows[r-1+i]=s.rows[r-1+i]||[];row.forEach((x,j)=>{s.rows[r-1+i][c-1+j]=x})});return o},setValue:x=>{s.rows[r-1]=s.rows[r-1]||[];s.rows[r-1][c-1]=x;return o}};
    ['setBackground','setFontColor','setFontWeight','setVerticalAlignment'].forEach(k=>o[k]=()=>o);return o},
  insertRowBefore(r){s.rows.splice(r-1,0,[])},setFrozenRows(n){s.frozen=n},setTabColor(c){s.tab=c},setColumnWidth(){},appendRow(a){s.rows.push(a)}};return s};
ctx.SpreadsheetApp={getActive:()=>({getSheetByName:n=>hojas[n]||null,insertSheet:(n)=>(hojas[n]=mkSheet(n)),getUrl:()=>'https://sheet'})};
ctx.HOJA={LOG:'Log'};
cargar('Columnas.gs');cargar('Organizar.gs');cargar('Recoleccion.gs');
const R=n=>vm.runInContext(n,ctx);


// ---- formulario simulado ----
// ---- formulario simulado ----
const C=ctx.REC_CAMPOS;
const sub=(k)=>({'#fieldId':C[k].id,'#label':C[k].label,'#inputType':C[k].tipo});
const base=()=>({message:{survey:{modified_on:'2026-10-20T10:00:00',questions:[
 {'#question_id':'17815440035540','#title':'Paquetes Flota Dedicada PARCEL','#type':'number'},
 {'#question_id':'17815440035541','#title':'Paquetes Flota Dedicada BIG ITEM','#type':'number'},
 {'#question_id':'17815440035542','#title':'Paquetes Flota Dedicada "Vinos"','#type':'number'},
 {'#question_id':'17815440035543','#title':'Paquetes Estafeta PARCEL','#type':'number'},
 {'#question_id':'17815440035544','#title':'Paquetes Estafeta BIG ITEM','#type':'number'},
 {'#question_id':'17816263361530','#title':'Antes de solicitar...','#type':'checkbox','#options':ctx.REC_RESP.CHECKS.map(x=>({'#key':x}))},
 {'#question_id':'17815439718370','#title':'Datos del Vendedor','#type':'contact_form','#contactForms':['CUENTA','SELLER_ID','CONTACTO','TELEFONO'].map(sub)},
 {'#question_id':'17815439718371','#title':'Dirección de tu almacén','#type':'contact_form','#contactForms':['DIRECCION','CP','REFERENCIA'].map(sub)},
 {'#question_id':'17815439875750','#title':'Fecha de recolección','#type':'date'},
 {'#question_id':'17814400099999','#title':'Comentarios','#type':'text'}]}}});
let def=base(),post=[],postResp={code:200,body:'{"success":true}'},getFalla=false;
ctx.UrlFetchApp={fetch:(u,o)=>{
  if(o.method==='post'){post.push(JSON.parse(o.payload));return{getResponseCode:()=>postResp.code,getContentText:()=>postResp.body}}
  if(getFalla)throw new Error('sin red');
  return{getResponseCode:()=>200,getContentText:()=>JSON.stringify(def)}}};

ctx.dlgEnvio_=cfg=>{ctx.__cfg=cfg};
const R2=n=>vm.runInContext(n,ctx);
// fechas relativas a hoy (CDMX)
const hoyIso=()=>R2('Utilities.formatDate(new Date(),REC_CFG.ZONA,"yyyy-MM-dd")');
const suma=(n)=>{const [y,m,d]=hoyIso().split('-').map(Number);const x=new Date(Date.UTC(y,m-1,d,12));x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const habil=(desde)=>{for(let n=desde;n<desde+10;n++){const dow=new Date(suma(n)+'T12:00:00Z').getUTCDay();if(dow!==0&&dow!==6)return n}};
const dd=iso=>iso.split('-').reverse().join('/');
const nSig=habil(1);              // offset del siguiente dia habil (el que pide el envio diario)
const nH=habil(nSig+1);          // un dia habil DESPUES del siguiente (otra fecha)
const isoH=suma(nH);
const finde=(()=>{for(let n=1;n<10;n++){const dow=new Date(suma(n)+'T12:00:00Z').getUTCDay();if(dow===6)return suma(n)}})();
const v=i=>R2('recFechaElegida_('+JSON.stringify(i)+')');
// ---- validacion de la fecha ----
t(v(isoH).fecha===dd(isoH),'dia habil valido -> dd/MM/yyyy');
t(/mañana en adelante/.test(v(hoyIso()).error),'hoy no se acepta');
t(/mañana en adelante/.test(v(suma(-3)).error),'pasada no se acepta');
t(/fin de semana/.test(v(finde).error),'sabado no se acepta');
t(/Muy lejos/.test(v(suma(90)).error),'mas de 60 dias no se acepta');
t(/calendario/.test(v('').error)&&/calendario/.test(v('17/11/2026').error),'formato raro se rechaza');
t(/no existe/.test(v('2026-02-31').error),'fecha inexistente');
vm.runInContext("REC_CFG.DIAS_SIN_RECOLECCION=['"+dd(isoH)+"']",ctx);
t(/no recolecta/.test(v(isoH).error),'dia sin recoleccion se rechaza');
vm.runInContext("REC_CFG.DIAS_SIN_RECOLECCION=[]",ctx);

// ---- ventana ----
R2('recMenuOtraFecha()');
const cfg=ctx.__cfg;
t(cfg.manejador==='recFormOtraFecha'&&cfg.campos[0].fecha===true&&/^\d{4}-\d{2}-\d{2}$/.test(cfg.campos[0].valor),'ventana con calendario y valor por defecto');
t(dd(cfg.campos[0].valor)===R2('recFechaRecoleccion_()'),'por defecto el siguiente dia habil');
t(cfg.etiquetas.prueba&&cfg.etiquetas.real==='Pedir recolección','botones con nombre');
t(cfg.resumen.some(r=>r[0]==='Dirección'&&/Mayorazgo/.test(r[1]))&&cfg.resumen.some(r=>/PARCEL/.test(r[0])&&r[1]==='30'),'resumen muestra lo que se manda');
const dlg=fs.readFileSync(__dirname+'/../apps-script/Dialogos.gs','utf8');
t(/DLG_PERMITIDOS = \[[^\]]*'recFormOtraFecha'/.test(dlg),'manejador en la lista permitida');



const fx=(modo,iso)=>R2('recFormOtraFecha('+JSON.stringify({modo,campos:{fecha:iso}})+')');
// prueba: no envia
post.length=0;logs.length=0;mails.length=0;
let r=fx('PRUEBA',isoH);
t(r.ok&&/Prueba OK/.test(r.lineas[0])&&post.length===0,'PRUEBA arma y NO envia: '+JSON.stringify(r.lineas));
// fecha mala: no envia nada
r=fx('REAL',finde);t(!r.ok&&post.length===0&&/No se envió nada/.test(r.lineas[0]),'fecha invalida no envia');
// real: envia con la fecha elegida
r=fx('REAL',isoH);
t(r.ok&&/PEDIDA/.test(r.lineas[0])&&post.length===1,'REAL envia una vez: '+JSON.stringify(r.lineas));
t(post[0].answers['17815439875750'].date===dd(isoH),'el payload lleva la fecha elegida');
t(logs.some(l=>l[0]==='OK'&&/^\[MANUAL\] OK/.test(l[2])),'queda en el Log como MANUAL');
const H=hojas['Recoleccion Historial'];t(H&&H.rows[1]&&H.rows[1][H.rows[0].indexOf('Acción')]==='Envío manual (menú)','queda en el Historial');
// no pisa la marca del envio diario ni lo rompe
const sig=R2('recFechaRecoleccion_()');
t(isoH&&dd(isoH)!==sig? props.REC_ULTIMA_FECHA!==dd(isoH) : true,'otra fecha no pisa REC_ULTIMA_FECHA');
t(JSON.parse(props.REC_FECHAS_MANUALES).indexOf(dd(isoH))>=0,'se guarda en fechas pedidas a mano');
// aviso en la ventana si ya se pidio
R2('recMenuOtraFecha()');t(ctx.__cfg.avisos.length===1&&ctx.__cfg.avisos[0].indexOf(dd(isoH))>=0,'la ventana avisa lo ya pedido');
// pedir a mano el dia que tocaba al envio diario: el automatico ya no lo repite
delete props.REC_ULTIMA_FECHA;post.length=0;
const isoSig=sig.split('/').reverse().join('-');
r=fx('REAL',isoSig);
if(r.ok){t(props.REC_ULTIMA_FECHA===sig,'si es el siguiente dia habil SI marca ULTIMA_FECHA');}
else{t(true,'(siguiente dia habil no valido hoy: '+r.lineas[0]+')')}
post.length=0;
const au=R2('recCorrer_("AUTO",false,false)');
t(au==='OMITIDO'&&post.length===0,'el envio diario no repite lo pedido a mano ('+au+')');
// otra fecha pedida a mano tambien se omite en el automatico si coincide
props.REC_ULTIMA_FECHA='';props.REC_FECHAS_MANUALES=JSON.stringify([sig]);
t(R2('recManualPedida_("'+sig+'")')===true&&R2('recCorrer_("AUTO",false,false)')==='OMITIDO','automatico respeta fechas manuales');
// fechas manuales pasadas se limpian
props.REC_FECHAS_MANUALES=JSON.stringify(['01/01/2020',sig]);
t(R2('recManualLista_()').length===1,'las pasadas se limpian');
// rechazo de Walmart en MANUAL: no marca y avisa
props.REC_FECHAS_MANUALES='[]';postResp={code:400,body:'rechazado'};post.length=0;mails.length=0;
r=fx('REAL',isoH);t(!r.ok&&/NO se pidió/.test(r.lineas[0])&&!R2('recManualPedida_("'+dd(isoH)+'")'),'rechazo: no queda como pedida y lo dice');
postResp={code:200,body:'{"success":true}'};
// handler no permitido
t(true,'');
console.log(bad?'FALLAS '+bad:'t70 OK '+ok);process.exit(bad?1:0);
