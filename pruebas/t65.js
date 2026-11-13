// t65: buzon de Seller Center (solo contador) + casos de Seller Center que corroboran la hoja "Casos Walmart" + extension 1.4.0.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,isFinite,RegExp,parseFloat};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
ctx.TZ='America/Mexico_City';
ctx.normEnc_=x=>String(x==null?'':x).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
ctx.Utilities={formatDate:(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
ctx.logs=[];ctx.logOk_=(e,m)=>ctx.logs.push('OK '+e+' '+m);ctx.logWarn_=(e,m)=>ctx.logs.push('WARN '+e+' '+m);ctx.logErr_=(e,m)=>ctx.logs.push('ERR '+e+' '+m);ctx.flushLog_=()=>{};
ctx.avisos=[];ctx.avisoDia_=(k,n,e,m)=>ctx.avisos.push(k+'|'+m);
ctx.lat=[];ctx.vdLatido_=(e,m)=>ctx.lat.push(e+' '+m);ctx.logRow_=(n,e,m)=>ctx.lat.push(e+' '+m);
const props={CAW_SEMBRADA:'1'};ctx.vdProp_=k=>props[k]||'';ctx.vdSetProp_=(k,v)=>{props[k]=v};
ctx.props_=()=>({getProperty:k=>props[k]===undefined?null:props[k],setProperty:(k,v)=>{props[k]=String(v)}});
let auth=null;ctx.csAutorizar_=p=>auth;
ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
ctx.Session={getEffectiveUser:()=>({getEmail:()=>'victor@test'})};
const src=f=>fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8');
vm.runInContext(src('SellerBuzon.gs'),ctx);
vm.runInContext(src('CasosWalmart.gs'),ctx);
const R=c=>vm.runInContext(c,ctx);

/* ---- 1. buzon ---- */
t(R('bzNum_(5)')===5&&R('bzNum_("12")')===12&&R('bzNum_(0)')===0,'numeros validos');
t(R('bzNum_(-1)')===null&&R('bzNum_("x")')===null&&R('bzNum_(null)')===null&&R('bzNum_(1e9)')===null&&R('bzNum_("")')===null,'numeros invalidos: null');
ctx.P1={sinLeer:3,porResponder:'1',mensaje:'hola',cliente:'Juan'};
t(JSON.stringify(R('bzLimpiar_(P1)'))==='{"sinLeer":3,"porResponder":1}','solo guarda los dos numeros (nada de mensajes ni clientes)');
t(R('bzLimpiar_({})')===null&&R('bzLimpiar_({sinLeer:"x"})')===null,'sin numeros: nada');
auth={ok:false,error:'no_autorizado'};
t(R('bzRecibir_({sinLeer:1})').error==='no_autorizado'&&!props.SC_BUZON,'sin clave valida no guarda');
auth=null;
let r=R('bzRecibir_({sinLeer:4,porResponder:2})');
t(r.ok&&r.guardado&&r.cambio&&JSON.parse(props.SC_BUZON).sinLeer===4,'guarda el primero');
t(ctx.logs.some(l=>/OK BUZON Buzon Seller Center \(ultimos 7 dias\): 4 sin leer, 2 por responder/.test(l)),'lo deja en el Log: '+ctx.logs.join('|'));
r=R('bzRecibir_({sinLeer:4,porResponder:2})');
t(r.ok&&!r.cambio&&ctx.lat.some(l=>/BUZON .*sin cambios/.test(l)),'igual: solo latido');
r=R('bzRecibir_({sinLeer:null,porResponder:7})');
t(JSON.parse(props.SC_BUZON).sinLeer===4&&JSON.parse(props.SC_BUZON).porResponder===7,'un numero que no se leyo conserva el ultimo bueno');
t(R('bzRecibir_({sinLeer:"x"})').guardado===false,'basura no guarda');

/* ---- 2. estados de Seller Center ---- */
const E=x=>R('cawScEstado_('+JSON.stringify(x)+')');
t(E('Abrir')==='ABIERTO'&&E('Open')==='ABIERTO','abrir/open');
t(E('Trabajo en progreso')==='EN ESPERA WALMART','trabajo en progreso');
t(E('Resuelto')==='RESUELTO'&&E('Cerrado')==='CERRADO','resuelto / cerrado');
t(E('Algo nuevo')===''&&E('')==='','estado raro: no se cambia nada');

/* ---- 3. limpiar ---- */
ctx.F=[{folio:'17061348',fecha:'2026-11-12',asunto:'  No se generó   la guía ',estado:'Abrir',propietario:'X'},{folio:'17061348',estado:'Abrir'},{folio:'abc'},{folio:'123'},null,'x',{folio:'0123456789',fecha:'12/11/2026',estado:'Resuelto'}];
const L=R('cawScLimpiar_(F)');
t(L.length===2&&L[0].asunto==='No se generó la guía'&&!('propietario' in L[0]),'limpia: sin repetidos, sin propietario');
t(L[1].fecha===''&&L[1].folio==='0123456789','fecha invalida queda vacia');
t(R('cawScLimpiar_("no")').length===0,'si no es lista, nada');

/* ---- 4. corroborar contra la hoja ---- */
function hoja(enc,filas){const h={enc:enc.slice(),filas:filas||[]};
 h.getLastRow=()=>h.filas.length+1;h.getLastColumn=()=>h.enc.length;
 h.getRange=(r,c,nr,nc)=>{nr=nr||1;nc=nc||1;return{
  getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>{const row=h.filas[r-2+i];return row&&row[c-1+j]!==undefined?row[c-1+j]:''})),
  setValue:x=>{const k=r-2;h.filas[k]=h.filas[k]||[];h.filas[k][c-1]=x}}};return h}
let libro={};
ctx.SpreadsheetApp={newConditionalFormatRule:()=>({}),newDataValidation:()=>{throw new Error('x')}};
ctx.vdLibro_=()=>({getSheetByName:n=>libro[n]||null});
ctx.peHojaAsegurar_=(n,enc)=>{if(!libro[n])libro[n]=hoja(enc);return libro[n]};
ctx.ubicarColumnas_=(h,enc)=>{const col={};enc.forEach(e=>{let i=h.enc.map(x=>ctx.normEnc_(x)).indexOf(ctx.normEnc_(e));if(i<0){h.enc.push(e);i=h.enc.length-1}col[ctx.normEnc_(e)]=i+1});return{col}};
ctx.escrCol_=(m,e)=>m.col[ctx.normEnc_(e)]||0;
ctx.peAgregar_=(h,enc,filas)=>{const m=ctx.ubicarColumnas_(h,enc);filas.forEach(x=>{const row=[];enc.forEach(e=>{row[m.col[ctx.normEnc_(e)]-1]=x[e]===undefined?'':x[e]});h.filas.push(row)})};
const ENC=R('CAW_ENC');
const fila=o=>ENC.map(e=>o[e]===undefined?'':o[e]);
libro['Casos Walmart']=hoja(ENC,[
 fila({'FOLIO WALMART':"'17009682",ESTADO:'RESPUESTA WALMART',TIPO:'SELLER SUPPORT'}),            // Walmart ya lo resolvio
 fila({'FOLIO WALMART':"'16883166",ESTADO:'PIDE INFO',TIPO:'SELLER SUPPORT'}),                      // Walmart: en progreso -> se respeta
 fila({ESTADO:'POR ABRIR',TIPO:'SIN GUIA',PEDIDO:"'600000131318758"}),                              // sin folio: no se toca
 fila({'FOLIO WALMART':"'17027909",ESTADO:'CERRADO',TIPO:'SELLER SUPPORT',RESOLUCION:'lo cerre yo'}),   // Walmart lo muestra abierto y tu lo cerraste con resolucion: discrepancia
 fila({'FOLIO WALMART':"'17061348",ESTADO:'POR ABRIR',TIPO:'SIN GUIA'}),                            // Walmart lo muestra abierto
 fila({'FOLIO WALMART':"'17009830",ESTADO:'CERRADO',TIPO:'SELLER SUPPORT','FECHA CIERRE':new Date(2026,10,9,15,48),SEGUIMIENTO:'nota vieja'})   // cerrado por Walmart y reabierto por ti
]);
const V=[{folio:'17061348',fecha:'2026-11-12',asunto:'No se generó la guía de mi pedido',estado:'Abrir'},
 {folio:'17027909',fecha:'2026-11-10',asunto:'Notificación de Cancelaciones',estado:'Abrir'},
 {folio:'17009682',fecha:'2026-11-09',asunto:'Error Al Actualizar Precios',estado:'Resuelto'},
 {folio:'16883166',fecha:'2026-10-30',asunto:'No se generó la guía de mi pedido',estado:'Trabajo en progreso'},
 {folio:'17099999',fecha:'2026-11-12',asunto:'Caso que no estaba',estado:'Resuelto'},
 {folio:'17088888',fecha:'2026-11-12',asunto:'Otro',estado:'Estado Raro'},
 {folio:'17009830',fecha:'2026-11-09',asunto:'No se generó la guía de mi pedido',estado:'Trabajo en progreso'}];
ctx.V=V;ctx.AHORA=new Date(2026,10,13,10,0).getTime();
const x=R('cawScCorroborar_(V,AHORA)');
const H=libro['Casos Walmart'],ci=n=>H.enc.indexOf(n);
const f0=H.filas[0],f1=H.filas[1],f3=H.filas[3],f4=H.filas[4];
t(f0[ci('ESTADO')]==='RESUELTO'&&f0[ci('FECHA CIERRE')] instanceof Date&&f0[ci('ACCION')]==='Confirmar y cerrar','Walmart lo resolvio: pasa a RESUELTO con fecha cierre y accion');
t(f1[ci('ESTADO')]==='PIDE INFO','"Trabajo en progreso" no pisa tu PIDE INFO');
t(H.filas[2][ci('ESTADO')]==='POR ABRIR','fila sin folio: intacta');
t(f3[ci('ESTADO')]==='CERRADO'&&x.discrepancias.join()==='17027909','Walmart abierto y tu cerrado: no se toca y se reporta');
t(f4[ci('ESTADO')]==='ABIERTO'&&f4[ci('CORREO ENVIADO')]==='SI'&&f4[ci('FECHA ABIERTO')] instanceof Date,'POR ABRIR con folio y abierto en Walmart: ABIERTO + fecha');
t(x.nuevos===2&&H.filas.length===8,'agrega los 2 folios que no estaban: '+x.nuevos);
const n1=H.filas[6];
t(n1[ci('FOLIO WALMART')]==="'17099999"&&n1[ci('ESTADO')]==='RESUELTO'&&n1[ci('DETECTADO')]==='SELLER CENTER'&&n1[ci('TIPO')]==='SELLER SUPPORT'&&n1[ci('MOTIVO')]==='Caso que no estaba','fila nueva completa');
t(H.filas[7][ci('ESTADO')]==='ABIERTO','estado raro entra como ABIERTO (no se pierde)');
t(x.desconocidos.join()==='Estado Raro','reporta el estado que no conoce');
const fr=H.filas[5];
t(fr[ci('ESTADO')]==='EN ESPERA WALMART'&&fr[ci('FECHA CIERRE')]===''&&/^Reabierto 2026-11-13; cerrado el 2026-11-09 \| nota vieja$/.test(fr[ci('SEGUIMIENTO')])&&/Reabierto/.test(fr[ci('ACCION')])&&x.reabiertos.join()==='17009830','caso cerrado que Walmart muestra en progreso = REABIERTO: estado, nota con fechas y sin fecha de cierre: '+JSON.stringify(fr));
t(x.cambios===5,'cambios (3 estados/fechas + fecha de apertura que faltaba + reabierto): '+x.cambios);
const x2=R('cawScCorroborar_(V,AHORA)');
t(x2.nuevos===0&&x2.cambios===0&&H.filas.length===8,'segunda corrida igual: no duplica ni cambia nada');

/* ---- 5. recibir (candado, Log, avisos) ---- */
ctx.logs.length=0;ctx.avisos.length=0;ctx.lat.length=0;
auth={ok:false,error:'no_autorizado'};
t(R('cawScRecibir_({filas:V})').error==='no_autorizado','sin clave: no entra');
auth=null;
let q=R('cawScRecibir_({filas:V})');
t(q.ok&&q.recibidas===7&&q.nuevos===0,'recibe');
t(ctx.avisos.some(a=>/caw-sc-disc-17027909/.test(a))&&ctx.avisos.some(a=>/caw-sc-estado-raro/.test(a)),'avisa discrepancia y estado raro (una vez al dia)');
t(ctx.lat.some(l=>/CASOS Casos en Seller Center/.test(l)),'sin cambios: latido');
t(R('cawScRecibir_({filas:[]})').recibidas===0,'lista vacia: no toca nada');
t(R('cawScLimpiar_([{folio:"17000001",estado:"x"}])').length===1,'ok');

/* ---- 6. la extension: lectura pura ---- */
const bg=fs.readFileSync(__dirname+'/../extension-cookie/background.js','utf8');
const i0=bg.indexOf('function scNormTxt'),i1=bg.indexOf('function esperarCarga');
const ext={};vm.createContext(ext);vm.runInContext(bg.slice(i0,i1)+';this.scCasosDeTexto=scCasosDeTexto;this.scFechaCaso=scFechaCaso;',ext);
const TXT='Filtro (2)\nFecha\n\t\nID de caso\n\t\nAsunto\n\t\nEstado\n\t\nPropietario\n\n12 nov 2026\t\n17061348\n\tNo se generó la guía de mi pedido\tAbrir\tVICTO MEDINA\n10 nov 2026\t\n17027909\n\tNotificación de Cancelaciones\tResuelto\tVICTO MEDINA\n30 oct 2026\t\n16883166\n\tNo se generó la guía de mi pedido\tTrabajo en progreso\tVICTO MEDINA\n15 oct 2026\t\n16679023\n\tLa paquetería se niega\tResuelto\tVICTO MEDINA\n';
const cs=ext.scCasosDeTexto(TXT);
t(cs.length===4&&cs[0].folio==='17061348'&&cs[0].fecha==='2026-11-12'&&cs[0].asunto==='No se generó la guía de mi pedido'&&cs[0].estado==='Abrir','primera fila leida');
t(cs[2].estado==='Trabajo en progreso'&&cs[2].fecha==='2026-10-30'&&cs[3].fecha==='2026-10-15','estado con espacios y fechas de octubre');
t(!JSON.stringify(cs).includes('VICTO')&&!JSON.stringify(cs).includes('MEDINA'),'no manda el propietario');
t(ext.scCasosDeTexto('').length===0&&ext.scCasosDeTexto('no hay casos').length===0,'sin tabla: vacio');
t(ext.scFechaCaso('3','ene','2027')==='2027-01-03'&&ext.scFechaCaso('3','dic.','2026')==='2026-12-03'&&ext.scFechaCaso('3','xyz','2026')===''&&ext.scFechaCaso('40','nov','2026')==='','fechas en espanol');
t(JSON.parse(fs.readFileSync(__dirname+'/../extension-cookie/manifest.json','utf8')).version==='1.4.1','manifest 1.4.1 (la extension se actualiza sola)');
t(/accion: 'seller_buzon'/.test(bg)&&/accion: 'seller_casos'/.test(bg),'la extension manda las dos acciones nuevas');
t(/async function enSellerBuzon/.test(bg)&&!/\.click\(|\.submit\(/.test(bg.slice(bg.indexOf('async function enSellerBuzon'),bg.indexOf('// ---- piezas puras'))),'las funciones de la pagina solo leen (sin clic ni envio)');
t(/accion === 'seller_buzon'/.test(src('WebAPI.gs'))&&/accion === 'seller_casos'/.test(src('WebAPI.gs')),'WebAPI tiene las rutas');
const bz=src('SellerBuzon.gs');
t(!/getBody|getText|messages|mensaje/i.test(bz.replace(/\/\*[\s\S]*?\*\//,'').replace(/\/\/.*$/mg,'').replace(/'[^']*'/g,'')),'el buzon no toca mensajes');
console.log(bad?bad+' FALLAN':'t65: '+ok+' ok');process.exit(bad?1:0);
