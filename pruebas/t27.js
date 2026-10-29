// Recoleccion.gs con datos simulados: fecha, payload, rechazo, deteccion de cambios, corrida completa, log y historial.
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

// ---- fecha ----
const f=(iso)=>vm.runInContext('recFechaRecoleccion_(new Date("'+iso+'"))',ctx);
t(f('2026-10-29T18:00:00Z')==='30/10/2026','jueves -> viernes');
t(f('2026-10-30T18:00:00Z')==='02/11/2026','viernes -> lunes');
t(f('2026-10-31T18:00:00Z')==='02/11/2026','sabado -> lunes');
t(f('2026-11-01T18:00:00Z')==='02/11/2026','domingo -> lunes');
t(f('2026-10-30T05:30:00Z')==='30/10/2026','jueves 23:30 CDMX sigue siendo jueves -> viernes');
vm.runInContext("REC_CFG.DIAS_SIN_RECOLECCION=['02/11/2026']",ctx);
t(f('2026-10-30T18:00:00Z')==='03/11/2026','festivo se brinca');
vm.runInContext("REC_CFG.DIAS_SIN_RECOLECCION=[]",ctx);

// ---- payload ----
const p=vm.runInContext('recArmarPayload_("30/10/2026","17814400099999","2026-10-01T00:00:00")',ctx);
t(p.survey_id==='hbmi5HWJL2BLmd6'&&p.status==='completed'&&p.modified_on==='2026-10-01T00:00:00','payload basico');
t(p.answers['17815440035540']===30&&p.answers['17815440035541']===3,'cantidades');
t(p.answers['17815439875750'].date==='30/10/2026','fecha en payload');
t(p.answers['17814400099999']==='Laboramos de 12pm - 3pm, saludos','comentario');
t(p.answers['17815439718370'].length===4&&p.answers['17815439718371'].length===3,'subcampos vendedor/almacen');
t(p.spent_time>=90&&p.spent_time<210,'tiempo humano');
t(R('recCamposEnviados_').length===1,'fn');
const ce=vm.runInContext('recCamposEnviados_',ctx)(p);
t(ce.length===14&&ctx.REC_HIST_ENC.length===4+14+1,'campos enviados = columnas del historial');
t(ce[10]==='03330'&&ce[6]==='10001341690','CP y seller como texto');
t(/☑.*☑/.test(ce[13]),'casillas marcadas');

// ---- rechazo ----
const mr=(c,b)=>vm.runInContext('recMotivoRechazo_('+c+','+JSON.stringify(b)+')',ctx);
t(mr(200,'{"success":true}')==='','200 ok');t(mr(200,'ok no json')==='','200 no-json ok');
t(mr(500,'x')==='HTTP 500','500');t(mr(200,'{"success":false}')==='success=false','success false');
t(/error/.test(mr(200,'{"error":{"code":"SVSUB_E011"}}')),'error obj');t(mr(0,'sin conexion')==='sin conexion','sin codigo');
t(mr(200,'{"errors":[]}')==='','errors vacio ok');t(/errors/.test(mr(200,'{"errors":["x"]}')),'errors lleno');

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
const rev=()=>vm.runInContext('recRevisarFormulario_()',ctx);
let r=rev();
t(r.ok&&r.faltan.length===0&&r.modifiedOn==='2026-10-20T10:00:00','formulario igual: sin faltantes');
t(r.idComentarios==='17814400099999','encuentra Comentarios por titulo');
t(Object.keys(r.preguntas).length===10,'10 preguntas');
// cambios que BLOQUEAN
const bloquea=(mut,re,m)=>{def=base();mut(def.message.survey.questions);const x=rev();t(x.ok&&x.faltan.some(z=>re.test(z)),m+' -> '+JSON.stringify(x.faltan))};
bloquea(q=>q.splice(0,1),/Ya no existe la pregunta Flota Dedicada PARCEL/,'pregunta borrada');
bloquea(q=>{q[0]['#title']='Otra cosa'},/ahora dice/,'titulo cambiado');
bloquea(q=>q.push({'#question_id':'17819999999999','#title':'Pregunta nueva','#required':true}),/Pregunta nueva.*obligatoria/,'pregunta nueva obligatoria');
bloquea(q=>q[6]['#contactForms'].pop(),/ya no existe el campo/,'subcampo borrado');
bloquea(q=>q[6]['#contactForms'][1]['#inputType']='dropdown',/cambio de tipo/,'Seller ID vuelve a lista');
bloquea(q=>q[6]['#contactForms'].push({'#fieldId':'aaa-bbb-ccc-ddd-eee','#label':'Extra'}),/campo nuevo/,'subcampo nuevo');
bloquea(q=>q[5]['#options'].pop(),/Ya no existe la casilla/,'casilla borrada');
bloquea(q=>q[5]['#options'].push({'#key':'Nueva casilla'}),/Casilla nueva/,'casilla nueva');
bloquea(q=>q.pop(),/Comentarios/,'sin Comentarios');
// huella: un cambio chico solo avisa
def=base();Object.keys(props).forEach(k=>delete props[k]);
post.length=0;logs.length=0;mails.length=0;
// ---- corrida completa ----
const correr=(a,fz,seco)=>vm.runInContext('recCorrer_("'+a+'",'+fz+','+seco+')',ctx);
let res=correr('AUTO',false,false);
t(res==='OK'&&post.length===1,'corrida OK envia una vez');
t(props.REC_ULTIMA_FECHA&&/^\d\d\/\d\d\/\d{4}$/.test(props.REC_ULTIMA_FECHA),'guarda ULTIMA_FECHA');
t(logs.some(l=>l[0]==='OK'&&l[1]==='RECOLECCION'&&/^\[AUTO\] OK:/.test(l[2])),'log OK en etapa RECOLECCION (Salud lo ve)');
t(logs.every(l=>l[1]==='RECOLECCION'),'todo el log va en la etapa RECOLECCION');
t(flushes>=1,'flushLog_ se llama');
t(hojas['Recoleccion Historial']&&hojas['Recoleccion Historial'].rows.length===2,'historial: encabezado + 1 fila');
const H=hojas['Recoleccion Historial'];const col=n=>H.rows[0].indexOf(n);
t(H.rows[1][col('Resultado')]==='✅ Enviado'&&H.rows[1][col('Acción')]==='Envío automático','historial resultado y accion');
t(H.rows[1][col('Código Postal')]==="'03330",'CP conserva el cero');
t(H.frozen===1&&H.tab,'historial con formato (fila congelada y color de pestaña)');
t(!mails.length,'OK no manda correo');
t(hojas['Recoleccion Formulario']&&hojas['Recoleccion Formulario'].rows.length===2,'primera vez guarda la definicion');
// duplicado
post.length=0;logs.length=0;
res=correr('AUTO',false,false);
t(res==='OMITIDO'&&post.length===0,'misma fecha: omitido, no envia');
t(logs.some(l=>l[0]==='INFO'&&/OMITIDO/.test(l[2])),'omitido = INFO');
res=correr('MANUAL',true,false);
t(res==='OK'&&post.length===1,'forzado envia aunque ya estaba');
t(H.rows.length===4||H.rows.length===3,'historial crece');
// la fila nueva queda arriba
t(H.rows[1][col('Acción')]==='Envío manual (menú)','la mas reciente arriba');
// prueba en seco
post.length=0;
res=correr('PRUEBA',false,true);
t(typeof res==='object'&&post.length===0&&res.answers,'seco: arma payload y NO envia');
// CAMBIO: bloquea
def=base();def.message.survey.questions.splice(0,1);
Object.keys(props).filter(k=>k==='REC_ULTIMA_FECHA').forEach(k=>delete props[k]);
post.length=0;logs.length=0;mails.length=0;
res=correr('AUTO',false,false);
t(res==='CAMBIO'&&post.length===0,'formulario cambiado: NO envia');
t(mails.length===1&&/NO se envio, cambio el formulario/.test(mails[0].subject)&&mails[0].to==='victor.walmart.04@gmail.com','manda alerta al correo configurado');
t(logs.some(l=>l[0]==='ERROR'&&/CAMBIO/.test(l[2])),'CAMBIO = ERROR en el Log');
t(!props.REC_ULTIMA_FECHA,'no marca la fecha como pedida');
// Walmart rechaza
def=base();post.length=0;logs.length=0;mails.length=0;postResp={code:500,body:'boom'};
res=correr('AUTO',false,false);
t(res==='ERROR'&&post.length===1&&mails.length===1&&logs.some(l=>l[0]==='ERROR'),'rechazo de Walmart: ERROR, correo y no marca fecha');
t(!props.REC_ULTIMA_FECHA,'rechazo no marca fecha');
// sin red al bajar formulario: avisa pero envia con la ultima version conocida
postResp={code:200,body:'{"success":true}'};getFalla=true;post.length=0;logs.length=0;mails.length=0;
res=correr('AUTO',false,false);
t(res==='AVISO'&&post.length===1,'sin poder leer el formulario: envia con la version conocida y AVISA');
t(logs.some(l=>l[0]==='WARN'),'AVISO = WARN');
t(mails.length===1,'primer aviso manda correo');
post.length=0;mails.length=0;res=correr('MANUAL',true,false);
t(mails.length===0,'el mismo aviso repetido no vuelve a mandar correo');
getFalla=false;
// sin version conocida y sin red: no envia
Object.keys(props).forEach(k=>delete props[k]);getFalla=true;post.length=0;mails.length=0;
res=correr('AUTO',false,false);
t(res==='ERROR'&&post.length===0,'sin modified_on: NO envia');
getFalla=false;

// ---- instalar / quitar ----
const trig=[];
ctx.ScriptApp={WeekDay:{MONDAY:1,TUESDAY:2,WEDNESDAY:3,THURSDAY:4,FRIDAY:5},
  getProjectTriggers:()=>trig.slice(),deleteTrigger:x=>{trig.splice(trig.indexOf(x),1)},
  newTrigger:fn=>{const o={fn};const ch={timeBased:()=>ch,onWeekDay:d=>{o.dia=d;return ch},atHour:h=>{o.h=h;return ch},nearMinute:()=>ch,inTimezone:()=>ch,create:()=>{o.getHandlerFunction=()=>fn;trig.push(o);return o}};return ch}};
vm.runInContext('recInstalar_()',ctx);
t(trig.length===5&&trig.every(x=>x.getHandlerFunction()==='recEnviarSolicitud'&&x.h===7),'instala 5 triggers L-V 7am');
vm.runInContext('recInstalar_()',ctx);
t(trig.length===5,'instalar otra vez no duplica');
t(props.REC_TRIGGERS_DE==='soporte@x.com','guarda quien instalo');
t(vm.runInContext('recQuitar_()',ctx)===5&&trig.length===0&&!props.REC_TRIGGERS_DE,'quitar apaga todo');
t(typeof ctx.recEnviarSolicitud==='function','funcion del trigger existe en global');
// el resto de Site Sheet no debe quitar este trigger: no esta en FUNCIONES_PROGRAMADAS
t(!/recEnviarSolicitud/.test(fs.readFileSync(__dirname+'/../apps-script/Triggers.gs','utf8')),'Triggers.gs no lo conoce (activar/quitar TODAS no lo toca)');

// ---- sin choques de nombres con el resto de Site Sheet ----
const dir=__dirname+'/../apps-script/';
const decl=f=>[...fs.readFileSync(dir+f,'utf8').matchAll(/^(?:function\s+([A-Za-z0-9_$]+)|(?:var|const|let)\s+([A-Za-z0-9_$]+))/gm)].map(m=>m[1]||m[2]);
const mias=new Set(decl('Recoleccion.gs'));let choque=[];
fs.readdirSync(dir).filter(x=>x.endsWith('.gs')&&x!=='Recoleccion.gs').forEach(f=>decl(f).forEach(n=>{if(mias.has(n))choque.push(f+':'+n)}));
t(choque.length===0,'nombres repetidos con otros archivos: '+choque.join(','));
t([...mias].every(n=>/^(rec|REC_)/.test(n)),'todo lleva prefijo rec/REC_: '+[...mias].filter(n=>!/^(rec|REC_)/.test(n)).join(','));
// el menu apunta a funciones que existen
const setup=fs.readFileSync(dir+'Setup.gs','utf8');
[...setup.matchAll(/'(rec[A-Za-z]+)'/g)].forEach(m=>t(typeof ctx[m[1]]==='function',m[1]+' existe'));
// hojas registradas y con color
['Recoleccion Historial','Recoleccion Formulario'].forEach(n=>t(R('ORG_HOJAS').some(x=>x[0]===n&&x[1]==='RECOLECCION'),n+' registrada en Organizar'));
console.log(ok+' OK, '+bad+' fallas');process.exit(bad?1:0);
