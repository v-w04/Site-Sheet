// t66: hoja Reporte (una fila por pregunta del reporte; AUTO la llena el script, CLAUDE la llena Claude).
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,isFinite,RegExp,parseFloat};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
ctx.TZ='America/Mexico_City';
ctx.normEnc_=x=>String(x==null?'':x).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
const pad=n=>String(n).padStart(2,'0');
ctx.Utilities={formatDate:(d,tz,f)=>f==='u'?String(d.getDay()||7):f==='H'?String(d.getHours()):d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
ctx.SpreadsheetApp={newConditionalFormatRule:()=>{const o={};['whenTextEqualTo','setBackground','setRanges'].forEach(k=>o[k]=(x)=>{o[k+'_v']=x;return o});o.build=()=>o;return o}};
ctx.logs=[];ctx.logOk_=(e,m)=>ctx.logs.push('OK '+e+' '+m);ctx.logWarn_=(e,m)=>ctx.logs.push('WARN '+e+' '+m);ctx.flushLog_=()=>{};
ctx.CAW_HOJA='Casos Walmart';ctx.PRI_HOJA='Pedidos en riesgo';ctx.bzLeer_=()=>BUZON;
let BUZON={sinLeer:3,porResponder:1,hora:Date.now()-600000};
const src=f=>fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8');
vm.runInContext(src('Reporte.gs'),ctx);
const R=c=>vm.runInContext(c,ctx);

const AHORA=new Date(2026,10,13,10,30).getTime();
const cx={ahora:AHORA,hoy:'2026-11-13',mes:'2026-11',dow:5,hora:10,iso:ms=>{const d=new Date(ms);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}};
const D={
 salud:[{PROCESO:'PRECIOS',ESTADO:'✅',HACE:'32 min'},{PROCESO:'EXTENSION',ESTADO:'✅',HACE:'8 min'},{PROCESO:'SELLER',ESTADO:'✅',HACE:'10 min'},{PROCESO:'CASOS',ESTADO:'⚠️',HACE:'19 h'},{PROCESO:'COMISIONES',ESTADO:'❌',HACE:''}],
 buzon:{sinLeer:3,porResponder:1,hora:AHORA-600000},
 sobWfs:[{REFERENCIA:'W1',ACCION:'Buscar en Seller Center'},{REFERENCIA:'W2',ACCION:'Buscar en Seller Center'},{REFERENCIA:'W3',ACCION:'Traslado'},{REFERENCIA:''}],
 sobPick:[],
 casos:[{'FECHA ABIERTO':new Date(2026,10,12),ESTADO:'POR ABRIR'},{'FECHA ABIERTO':new Date(2026,10,10),ESTADO:'RESPUESTA WALMART'},{'FECHA ABIERTO':new Date(2026,10,9),ESTADO:'RESUELTO'},{'FECHA ABIERTO':new Date(2026,9,1),ESTADO:'PIDE INFO'},{'FECHA ABIERTO':'',ESTADO:'POR ABRIR'}],
 canc:[{ORIGEN:'CORREO','ESTADO ODOO':'CANCELADO EN ODOO','FECHA ODOO':new Date(2026,10,13,8,1),'CANCELAR EN ODOO':true},
  {ORIGEN:'CORREO','ESTADO ODOO':'CANCELADO EN SITE','FECHA ODOO':new Date(2026,10,13,8,2),'CANCELAR EN ODOO':true},
  {ORIGEN:'PRECIO ERRONEO','ESTADO ODOO':'CANCELADO EN ODOO','FECHA ODOO':new Date(2026,10,13,8,3),'CANCELAR EN ODOO':true,'FECHA CORREO':new Date(2026,10,12)},
  {ORIGEN:'PRECIO ERRONEO','ESTADO ODOO':'','CANCELAR EN ODOO':false,'FECHA CORREO':new Date(2026,10,12)},
  {ORIGEN:'PRECIO ERRONEO','ESTADO ODOO':'','CANCELAR EN ODOO':true,'FECHA CORREO':new Date(2026,10,12)},
  {ORIGEN:'CORREO','ESTADO ODOO':'CANCELADO EN ODOO','FECHA ODOO':new Date(2026,10,5),'CANCELAR EN ODOO':true},
  {ORIGEN:'CORREO','ESTADO ODOO':'ERROR: no se cancelo','CANCELAR EN ODOO':true},
  {ORIGEN:'CORREO','ESTADO ODOO':'OJO PENDIENTE: orden activa en Odoo','CANCELAR EN ODOO':true}],
 killers:[{SKU:'A'},{SKU:'B'},{SKU:''}],
 killersBajo:[{'SKU WALMART':'A','% PERDIDA':0.07},{'SKU WALMART':'B','% PERDIDA':0.04}],
 recol:[{'FECHA Y HORA':new Date(2026,10,12,7,5),RESULTADO:'✅ Enviado','RECOLECCION DEL':'2026-11-13'},{'FECHA Y HORA':new Date(2026,10,13,7,5),RESULTADO:'✅ Enviado','RECOLECCION DEL':new Date(2026,10,16)}],
 resMes:[{MES:'NOVIEMBRE 2026',ESTADO:'EN CURSO',TOTAL:4528809,WFS:1435531,SELLER:2734957,KILLERS:358321},{MES:'OCTUBRE 2026',ESTADO:'CERRADO',TOTAL:1}],
 resCva:[{MES:'NOVIEMBRE 2026',ESTADO:'EN CURSO','VENTA TOTAL':52691,'VENTA ACUMULADA':301875.95}],
 riesgo:[{PEDIDO:'6000001',SITUACION:'ENVIADA SIN GUIA'},{PEDIDO:'6000002',SITUACION:'ENVIADA SIN GUIA'}]
};
ctx.D=D;ctx.CX=cx;
let f=R('rpCalcular_(D,CX)');
const por=p=>f.find(x=>x.pregunta.indexOf(p)>=0);
t(f.length===15,'15 preguntas: '+f.length);
t(f.every(x=>x.area&&x.pregunta&&x.resp&&['✅','⚠️','❌'].includes(x.estado)),'toda fila trae area, pregunta, respuesta y estado');
t(new Set(f.map(x=>x.pregunta)).size===f.length,'preguntas sin repetir');
t(por('Cookie').estado==='✅'&&/Precios ✅ hace 32 min/.test(por('Cookie').resp)&&por('Cookie').accion==='','conexion ok');
t(por('Seller Center leyendo').estado==='✅','seller ok');
t(por('proceso con falla').estado==='❌'&&/ERROR: COMISIONES/.test(por('proceso con falla').resp)&&/avisos: CASOS/.test(por('proceso con falla').resp),'procesos: error y avisos');
t(por('sin leer').resp==='3 sin leer · 1 por responder'&&por('sin leer').estado==='⚠️'&&/buzón/.test(por('sin leer').accion),'el BUZON va en el reporte');
D.buzon={sinLeer:0,porResponder:0,hora:AHORA-60000};t(R('rpCalcular_(D,CX)').find(x=>x.area==='BUZON').estado==='✅','buzon en cero: ok');
D.buzon={sinLeer:0,porResponder:0,hora:AHORA-9*3600000};t(R('rpCalcular_(D,CX)').find(x=>x.area==='BUZON').estado==='⚠️','buzon viejo (9 h): sin lectura reciente');
D.buzon=null;t(/Sin lectura/.test(R('rpCalcular_(D,CX)').find(x=>x.area==='BUZON').resp),'sin buzon: lo dice');
D.buzon={sinLeer:3,porResponder:1,hora:AHORA-600000};
t(/2 abiertas|3 abiertas/.test(por('WFS').resp)&&/Buscar en Seller Center 2/.test(por('WFS').resp)&&por('WFS').estado==='⚠️','sobreventa WFS: cuenta solo filas con referencia');
t(por('Pick').resp==='Ninguna'&&por('Pick').estado==='✅','sobreventa pick vacia');
const cs=por('Casos');
t(/Por abrir 1/.test(cs.resp)&&/Respuesta Walmart 1/.test(cs.resp)&&/Cerrados 1/.test(cs.resp)&&!/Piden info 1/.test(cs.resp),'casos: solo ultimas 2 semanas (el de octubre y el sin fecha no cuentan): '+cs.resp);
t(/Leer 1 respuesta/.test(cs.accion)&&/Abrir 1 por abrir/.test(cs.accion),'casos: accion');
const ca=por('se cancelaron');
t(/Hoy 3 \(correo 2 · precio erróneo 1\)/.test(ca.resp)&&/Mes 4/.test(ca.resp),'cancelaciones: hoy y mes por origen: '+ca.resp);
t(por('error o pendientes').estado==='❌'&&/1 con error · 1 con aviso/.test(por('error o pendientes').resp),'cancelaciones con error');
t(/1 por decidir · 3 entraron este mes · 1 canceladas/.test(por('por decidir').resp)&&por('por decidir').estado==='⚠️','precios erroneos: por decidir (sin casilla ni estado)');
t(/2 killers · 2 bajo mínimo \(1 con pérdida mayor a 5%\)/.test(por('Killers').resp),'killers: total, bajo minimo y >5%');
t(por('recolección').estado==='✅'&&/para 2026-11-16/.test(por('recolección').resp),'recoleccion: ultima de hoy');
cx.hora=10;D.recol=[D.recol[0]];t(R('rpCalcular_(D,CX)').find(x=>x.area==='RECOLECCION').estado==='⚠️','recoleccion: dia habil sin envio hoy: aviso');
cx.dow=6;t(R('rpCalcular_(D,CX)').find(x=>x.area==='RECOLECCION').estado==='✅','sabado: no avisa');
D.recol=[{'FECHA Y HORA':new Date(2026,10,13,7,5),RESULTADO:'❌ NO se envió (ver Log)'}];t(R('rpCalcular_(D,CX)').find(x=>x.area==='RECOLECCION').estado==='❌','recoleccion fallida: error');
t(/NOVIEMBRE 2026: \$4,528,809 \(WFS \$1,435,531 · Seller \$2,734,957 · Killers \$358,321\)/.test(por('Venta Walmart').resp),'venta Walmart del mes: '+por('Venta Walmart').resp);
t(/Mes \$52,691 · Acumulada \(todo el histórico\) \$301,876/.test(por('CVA').resp),'venta CVA acumulada');
t(/2: ENVIADA SIN GUIA 2/.test(por('riesgo').resp)&&por('riesgo').estado==='⚠️','pedidos en riesgo');
const vacio=R('rpCalcular_({},CX)');
t(vacio.length===15&&vacio.every(x=>x.resp),'sin datos: igual da las 15 preguntas (nunca falta un area)');

/* ---- escritura en la hoja ---- */
function hoja(enc,filas){const h={enc:enc.slice(),filas:filas||[],anchos:{}};
 h.getLastRow=()=>h.filas.length+1;h.getLastColumn=()=>h.enc.length;h.getColumnWidth=c=>h.anchos[c]||60;h.setColumnWidth=(c,w)=>{h.anchos[c]=w};
 h.getRange=(r,c,nr,nc)=>{nr=nr||1;nc=nc||1;return{
  getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>{const row=h.filas[r-2+i];return row&&row[c-1+j]!==undefined?row[c-1+j]:''})),
  setValues:v=>{v.forEach((row,i)=>{const k=r-2+i;h.filas[k]=h.filas[k]||[];row.forEach((x,j)=>{h.filas[k][c-1+j]=x})})},
  setHorizontalAlignment:function(){this.n=(this.n||0)+1;return this},setVerticalAlignment:function(){return this},setWrap:function(){wraps++;return this},setNumberFormat:function(){return this}}};
 h.getMaxRows=()=>100;h.rules=[];h.getConditionalFormatRules=()=>h.rules;h.setConditionalFormatRules=r=>{h.rules=r};return h}
let wraps=0;
let libro={};
const tabla=n=>{const h=libro[n];if(!h)return null;const pos={};h.enc.forEach((x,i)=>{const k=ctx.normEnc_(x);if(k&&pos[k]===undefined)pos[k]=i});return{enc:h.enc,pos,filas:h.filas.map(f=>h.enc.map((_,i)=>f[i]===undefined?'':f[i]))}};
ctx.peTabla_=tabla;
ctx.peHojaAsegurar_=(n,enc)=>{if(!libro[n])libro[n]=hoja(enc);return libro[n]};
ctx.ubicarColumnas_=(h,enc)=>{const col={};enc.forEach(e=>{let i=h.enc.map(x=>ctx.normEnc_(x)).indexOf(ctx.normEnc_(e));if(i<0){h.enc.push(e);i=h.enc.length-1}col[ctx.normEnc_(e)]=i+1});return{col}};
ctx.escrCol_=(m,e)=>m.col[ctx.normEnc_(e)]||0;
ctx.peAgregar_=(h,enc,filas)=>{const m=ctx.ubicarColumnas_(h,enc);filas.forEach(x=>{const row=[];enc.forEach(e=>{row[m.col[ctx.normEnc_(e)]-1]=x[e]===undefined?'':x[e]});h.filas.push(row)})};
// libro simulado con las hojas que lee el reporte
const SALUD_ENC=['PROCESO','CADA (aprox)','ULTIMA BUENA','HACE','ULTIMO ERROR','ESTADO','DETALLE'];
libro['Salud']=hoja(SALUD_ENC,[['PRECIOS','','','32 min','','✅',''],['EXTENSION','','','8 min','','✅',''],['SELLER','','','10 min','','✅','']]);
libro['Resumen venta y killers']=hoja(['MES','WFS','SELLER','KILLERS','TOTAL','DIARIO','ESTADO'],[['NOVIEMBRE 2026',100,200,50,350,1,'EN CURSO']]);
let r=R('reporteActualizar_()');
const H=libro['Reporte'],ci=n=>H.enc.indexOf(n);
t(r.filas.length===15&&H.filas.length===15&&r.nuevas===15,'primera vez: crea las 15 filas');
t(H.filas.every(x=>x[ci('LLENA')]==='AUTO'&&x[ci('ACTUALIZADO')] instanceof Date),'LLENA=AUTO y fecha de actualizacion');
t(H.filas.find(x=>/Venta Walmart/.test(x[ci('PREGUNTA')]))[ci('RESPUESTA')]==='NOVIEMBRE 2026: $350 (WFS $100 · Seller $200 · Killers $50)','lee las hojas reales por encabezado');
// la usuaria agrega una pregunta y escribe sobre otra
H.filas.push(['MIS COSAS','¿Cómo va la cosa que yo quiero?','','','','CLAUDE','']);
const idx=H.filas.findIndex(x=>/Pick/.test(x[ci('PREGUNTA')]));H.filas[idx][ci('AREA')]='MI AREA';
// mueve columnas: inserta una columna al inicio
H.enc.unshift('NOTA TUYA');H.filas.forEach(x=>x.unshift('mi nota'));
r=R('reporteActualizar_()');
t(r.nuevas===0&&H.filas.length===16,'segunda vez: no duplica, respeta la fila nueva');
const mia=H.filas[15];
t(mia[ci('RESPUESTA')]===''&&mia[ci('ESTADO')]===''&&mia[ci('LLENA')]==='CLAUDE','la fila CLAUDE no se toca');
t(H.filas[idx][ci('AREA')]==='MI AREA'&&H.filas[0][0]==='mi nota','no pisa tu AREA ni tu columna nueva; sigue bien con columnas movidas');
t(H.filas.every((x,i)=>i===15||x[ci('ACTUALIZADO')] instanceof Date),'refresca ACTUALIZADO');
t(ctx.logs.some(l=>/OK REPORTE Reporte: 15 preguntas/.test(l)),'queda en el Log (etapa REPORTE)');
t(wraps>=4&&H.rules.length===3,'formato: texto ajustado y 3 colores de estado: '+wraps+'/'+H.rules.length);
R('reporteActualizar_()');t(H.rules.length===3,'los colores no se duplican en la siguiente corrida');
// cableado
const S=n=>src(n);
t(/reporteProgramado_\(\)/.test(S('Salud.gs')),'Salud dispara el reporte cada hora');
t(/'reporteMenu'/.test(S('Setup.gs'))&&/📋 Reporte del día \(hoja\)/.test(S('Organizar.gs')),'menu y guia del menu');
t(/\['Reporte',\s+'SISTEMA'/.test(S('Organizar.gs')),'hoja en el registro');
console.log(bad?bad+' FALLAN':'t66: '+ok+' ok');process.exit(bad?1:0);
