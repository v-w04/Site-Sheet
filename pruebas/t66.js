// t66: hoja Reporte (una fila por pregunta del reporte; AUTO la llena el script, CLAUDE la llena Claude).
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,isFinite,RegExp,parseFloat};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
ctx.TZ='America/Mexico_City';
ctx.normEnc_=x=>String(x==null?'':x).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
const pad=n=>String(n).padStart(2,'0');
ctx.Utilities={formatDate:(d,tz,f)=>f==='u'?String(d.getDay()||7):f==='H'?String(d.getHours()):f==='HH:mm'?pad(d.getHours())+':'+pad(d.getMinutes()):d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
ctx.SpreadsheetApp={newConditionalFormatRule:()=>{const o={};['whenTextEqualTo','setBackground','setRanges'].forEach(k=>o[k]=(x)=>{o[k+'_v']=x;return o});o.build=()=>o;return o}};
const props={};ctx.vdProp_=k=>props[k]||'';ctx.vdSetProp_=(k,v)=>{props[k]=v};
ctx.logs=[];ctx.logOk_=(e,m)=>ctx.logs.push('OK '+e+' '+m);ctx.logWarn_=(e,m)=>ctx.logs.push('WARN '+e+' '+m);ctx.flushLog_=()=>{};
ctx.CAW_HOJA='Casos Walmart';ctx.PRI_HOJA='Pedidos en riesgo';ctx.bzLeer_=()=>BUZON;
let BUZON={sinLeer:3,porResponder:1,hora:Date.now()-600000};
const src=f=>fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8');
vm.runInContext(src('CancelacionesWalmartAuto.gs').match(/var CWA_MAX_DIAS = \d+;/)[0],ctx);   // 19-nov: constante que usa el reporte
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
  {ORIGEN:'PRECIO ERRONEO','ESTADO ODOO':'','CANCELAR EN ODOO':true,'NOTA ODOO':'ERROR WALMART: no se pudo','FECHA CORREO':new Date(2026,10,12)},   // 19-nov: Walmart fallo -> a mano
  {ORIGEN:'CORREO','ESTADO ODOO':'CANCELADO EN ODOO','FECHA ODOO':new Date(2026,10,5),'CANCELAR EN ODOO':true},
  {ORIGEN:'CORREO','ESTADO ODOO':'ERROR: no se cancelo','CANCELAR EN ODOO':true,'PEDIDO#':'600000131615447-1-1','ORDEN DE COMPRA#':'609130490159014'},
  {ORIGEN:'CORREO','ESTADO ODOO':'OJO PENDIENTE: orden activa en Odoo','CANCELAR EN ODOO':true,'ORDEN DE COMPRA#':'609130991603098'}],
 killers:[{SKU:'A'},{SKU:'B'},{SKU:''}],
 killersBajo:[{'SKU WALMART':'A','% PERDIDA':0.075},{'SKU WALMART':'B','% PERDIDA':0.07}],   // 7% exacto no se cancela solo
 recol:[{'FECHA Y HORA':new Date(2026,10,12,7,5),RESULTADO:'✅ Enviado','RECOLECCION DEL':'2026-11-13'},{'FECHA Y HORA':new Date(2026,10,13,7,5),RESULTADO:'✅ Enviado','RECOLECCION DEL':new Date(2026,10,16)}],
 resMes:[{MES:'NOVIEMBRE 2026',ESTADO:'EN CURSO',TOTAL:4528809,WFS:1435531,SELLER:2734957,KILLERS:358321},{MES:'OCTUBRE 2026',ESTADO:'CERRADO',TOTAL:1}],
 resCva:[{MES:'NOVIEMBRE 2026',ESTADO:'EN CURSO','VENTA TOTAL':52691,'VENTA ACUMULADA':301875.95}],
 riesgo:[{PEDIDO:'600000131318758-1-1',SITUACION:'ENVIADA SIN GUIA',ACCION:'Abrir caso: no se generó la guía'},{PEDIDO:'600000127458333-1-1',SITUACION:'ENVIADA SIN GUIA',ACCION:'Abrir caso: no se generó la guía'}]
};
ctx.D=D;ctx.CX=cx;
let f=R('rpCalcular_(D,CX)');
const por=p=>f.find(x=>x.pregunta.indexOf(p)>=0);
t(f.length===20&&f[0].area==='ACCION','19 preguntas + la fila fija de acciones arriba: '+f.length);
t(f.every(x=>x.area&&x.pregunta&&x.resp&&['✅','⚠️','❌'].includes(x.estado)),'toda fila trae area, pregunta, respuesta y estado');
t(new Set(f.map(x=>x.pregunta)).size===f.length,'preguntas sin repetir');
t(por('Cookie').estado==='✅'&&/Precios ✅ hace 32 min/.test(por('Cookie').resp)&&por('Cookie').accion==='','conexion ok');
t(por('Seller Center leyendo').estado==='✅','seller ok');
t(por('proceso con falla').estado==='❌'&&/ERROR: COMISIONES/.test(por('proceso con falla').resp)&&/avisos: CASOS/.test(por('proceso con falla').resp),'procesos: error y avisos');
t(por('sin leer').resp==='3 sin leer · 1 por responder (total del buzón)'&&por('sin leer').estado==='⚠️'&&/buzón/.test(por('sin leer').accion),'el BUZON va en el reporte');
D.buzon={sinLeer:0,porResponder:0,hora:AHORA-60000};t(R('rpCalcular_(D,CX)').find(x=>x.area==='BUZON').estado==='✅','buzon en cero: ok');
D.buzon={sinLeer:0,porResponder:0,hora:AHORA-9*3600000};t(R('rpCalcular_(D,CX)').find(x=>x.area==='BUZON').estado==='⚠️','buzon viejo (9 h): sin lectura reciente');
D.buzon=null;t(/Sin lectura/.test(R('rpCalcular_(D,CX)').find(x=>x.area==='BUZON').resp),'sin buzon: lo dice');
D.buzon={sinLeer:3,porResponder:1,hora:AHORA-600000};
t(/2 abiertas|3 abiertas/.test(por('WFS').resp)&&/Buscar en Seller Center 2/.test(por('WFS').resp)&&por('WFS').estado==='⚠️','sobreventa WFS: cuenta solo filas con referencia');
t(por('Pick').resp==='Ninguna'&&por('Pick').estado==='✅','sobreventa pick vacia');
const cs=por('Casos');
t(/Por abrir 1/.test(cs.resp)&&/Respuesta Walmart 1/.test(cs.resp)&&/Cerrados 1/.test(cs.resp)&&!/Piden info 1/.test(cs.resp),'casos: solo ultimas 2 semanas (el de octubre y el sin fecha no cuentan): '+cs.resp);
D.casos.push({'FECHA ABIERTO':new Date(2026,10,9),ESTADO:'EN ESPERA WALMART',SEGUIMIENTO:'Reabierto 2026-11-13; cerrado el 2026-11-09'});
const csR=R('rpCalcular_(D,CX)').find(x=>x.area==='CASOS');D.casos.pop();
t(/Reabiertos esperando a Walmart 1/.test(csR.resp)&&!/Reabiertos/.test(cs.resp),'casos: cuenta los reabiertos que esperan a Walmart: '+csR.resp);
t(/lee 1 respuesta\(s\) de Walmart/.test(cs.accion)&&/abre 1 caso\(s\)/.test(cs.accion)&&/ESTADO = RESPUESTA WALMART/.test(cs.accion)&&cs.accion.split('\n').length===2,'casos: accion con hoja, filtro y un paso por linea: '+cs.accion);
const ca=por('se cancelaron');
t(/Hoy 3: Pick 0 · Correo 2 · Precio erróneo 1 · Fraude 0/.test(ca.resp)&&/Mes 4: Pick 0 · Correo 3 · Precio erróneo 1 · Fraude 0/.test(ca.resp)&&/en espera de tu análisis: 1/.test(ca.resp)&&ca.estado==='⚠️','cancelaciones: hoy y mes por motivo + espera de analisis: '+ca.resp);
t(/En cola para cancelarse solas en Walmart y luego en Odoo: 2/.test(ca.resp)&&/Por cancelar en Walmart a mano \(últimos 14 días\): 1/.test(ca.resp)&&/Cancelar en Walmart a mano 1 \(fraude, o precio erróneo que el sistema no pudo cancelar\)/.test(ca.accion)&&/precios erróneos en espera/.test(ca.accion),'cancelaciones: en cola (la extension las cancela) y a mano solo lo que fallo: '+ca.resp+' | '+ca.accion);
const pc=por('error o pendientes').accion;
t(/ERROR \(1\).*: 600000131615447/.test(pc)&&/OJO PENDIENTE \(1\).*: 609130991603098/.test(pc)&&pc.split('\n').length===2,'cancelaciones: pasos concretos con pedidos: '+pc);
const pr2=por('riesgo por falta').accion;
t(/Abrir caso: no se generó la guía · pedido 600000131318758/.test(pr2)&&pr2.split('\n').length===2,'pedidos en riesgo: un paso por pedido: '+pr2);
const ac0=R('rpCalcular_(D,CX)')[0];
t(ac0.area==='ACCION'&&/^1\. /m.test(ac0.resp)&&/^2\. /m.test(ac0.resp)&&/^3\. /m.test(ac0.resp)&&/ERROR/.test(ac0.resp.split('\n').slice(0,2).join(' ')),'lista ACCION numerada, lo rojo primero: '+ac0.resp);
t(por('error o pendientes').estado==='❌'&&/1 con error · 1 con aviso/.test(por('error o pendientes').resp),'cancelaciones con error');
t(/1 por decidir · 4 entraron este mes · 1 canceladas/.test(por('por decidir').resp)&&por('por decidir').estado==='⚠️','precios erroneos: por decidir (sin casilla ni estado)');
t(/2 killers · 2 bajo mínimo \(1 con pérdida mayor a 7%\)/.test(por('Killers').resp),'killers: total, bajo minimo y >7% (tope del 19-nov): '+por('Killers').resp);
t(por('recolección').estado==='✅'&&/para 2026-11-16/.test(por('recolección').resp),'recoleccion: ultima de hoy');
cx.hora=10;D.recol=[D.recol[0]];t(R('rpCalcular_(D,CX)').find(x=>x.area==='RECOLECCION').estado==='⚠️','recoleccion: dia habil sin envio hoy: aviso');
cx.dow=6;t(R('rpCalcular_(D,CX)').find(x=>x.area==='RECOLECCION').estado==='✅','sabado: no avisa');
D.recol=[{'FECHA Y HORA':new Date(2026,10,13,7,5),RESULTADO:'❌ NO se envió (ver Log)'}];t(R('rpCalcular_(D,CX)').find(x=>x.area==='RECOLECCION').estado==='❌','recoleccion fallida: error');
t(/NOVIEMBRE 2026: \$4,528,809 \(WFS \$1,435,531 · Seller \$2,734,957 · Killers \$358,321\)/.test(por('Venta Walmart').resp),'venta Walmart del mes: '+por('Venta Walmart').resp);
t(/Mes \$52,691 · Acumulada \(todo el histórico\) \$301,876/.test(por('CVA').resp),'venta CVA acumulada');
t(/2: ENVIADA SIN GUIA 2/.test(por('riesgo').resp)&&por('riesgo').estado==='⚠️','pedidos en riesgo');
const vacio=R('rpCalcular_({},CX)');
t(vacio.length===20&&vacio.every(x=>x.resp),'sin datos: igual da las 19 preguntas (nunca falta un area)');

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
t(r.filas.length===20&&H.filas.length===20&&r.nuevas===20,'primera vez: crea las 19 filas');
t(H.filas.every(x=>x[ci('LLENA')]==='AUTO'&&x[ci('ACTUALIZADO')] instanceof Date),'LLENA=AUTO y fecha de actualizacion');
t(H.filas.find(x=>/Venta Walmart/.test(x[ci('PREGUNTA')]))[ci('RESPUESTA')]==='NOVIEMBRE 2026: $350 (WFS $100 · Seller $200 · Killers $50)','lee las hojas reales por encabezado');
// la usuaria agrega una pregunta y escribe sobre otra
H.filas.push(['MIS COSAS','¿Cómo va la cosa que yo quiero?','','','','CLAUDE','']);
const idx=H.filas.findIndex(x=>/Pick/.test(x[ci('PREGUNTA')]));H.filas[idx][ci('AREA')]='MI AREA';
// mueve columnas: inserta una columna al inicio
H.enc.unshift('NOTA TUYA');H.filas.forEach(x=>x.unshift('mi nota'));
r=R('reporteActualizar_()');
t(r.nuevas===0&&H.filas.length===21,'segunda vez: no duplica, respeta la fila nueva');
const mia=H.filas[20];
t(mia[ci('RESPUESTA')]===''&&mia[ci('ESTADO')]===''&&mia[ci('LLENA')]==='CLAUDE','la fila CLAUDE no se toca');
t(H.filas[idx][ci('AREA')]==='MI AREA'&&H.filas[0][0]==='mi nota','no pisa tu AREA ni tu columna nueva; sigue bien con columnas movidas');
t(H.filas.every((x,i)=>i===20||x[ci('ACTUALIZADO')] instanceof Date),'refresca ACTUALIZADO');
t(ctx.logs.some(l=>/OK REPORTE Reporte: 20 preguntas/.test(l)),'queda en el Log (etapa REPORTE)');
t(wraps>=4&&H.rules.length===3,'formato: texto ajustado y 3 colores de estado: '+wraps+'/'+H.rules.length);
R('reporteActualizar_()');t(H.rules.length===3,'los colores no se duplican en la siguiente corrida');
// orden: primero ✅, luego ⚠️, luego ❌; dentro de cada grupo por area
const AR=['ACCION','CONEXIONES','SOBREVENTA','CASOS','BUZON','CANCELACIONES','PEDIDOS EN RIESGO','KILLERS','PRECIOS ERRONEOS','RECOLECCION','VENTAS'];
const RG={'✅':0,'⚠️':1,'❌':2};
const lista0=R('rpCalcular_(D,CX)'),lista=lista0.slice(1);
t(lista0[0].area==='ACCION'&&/^1\. /.test(lista0[0].resp)&&lista0[0].estado!=='✅','fila fija ACCION arriba: '+lista0[0].resp);
t(lista.every((x,i)=>i===0||RG[x.estado]>=RG[lista[i-1].estado]),'primero lo bien, luego amarillo, luego rojo: '+lista.map(x=>x.estado).join(''));
t(lista.every((x,i)=>i===0||RG[x.estado]>RG[lista[i-1].estado]||AR.indexOf(x.area)>=AR.indexOf(lista[i-1].area)),'dentro de cada grupo, por area');
t(lista[0].estado==='✅'&&lista[lista.length-1].estado==='❌','empieza en verde y termina en rojo');
// la hoja se acomoda igual en cada corrida y la pregunta tuya queda al final
const viejo=lista0.map(x=>[x.area,x.pregunta,x.resp,x.estado,x.accion,'AUTO',new Date()]).reverse();
viejo.splice(3,0,['MIS COSAS','¿Pregunta mía?','','','','CLAUDE','']);
libro['Reporte']=hoja(['AREA','PREGUNTA','RESPUESTA','ESTADO','ACCION','LLENA','ACTUALIZADO'],viejo);
R('reporteActualizar_()');
let est2=libro['Reporte'].filas.map(x=>x[3]);
t(est2[est2.length-1]===''&&libro['Reporte'].filas[libro['Reporte'].filas.length-1][0]==='MIS COSAS','la pregunta tuya queda al final');
const e3=est2.slice(1,-1).map(x=>RG[x]);t(est2[0]!==''&&e3.every((v,i)=>i===0||v>=e3[i-1])&&e3[0]===0,'hoja: verdes arriba, amarillos en medio, rojos abajo: '+est2.join(''));
// si un estado cambia, la fila se mueve sola
libro['Salud']=hoja(SALUD_ENC,[['PRECIOS','','','9 h','','❌',''],['EXTENSION','','','9 h','','❌',''],['SELLER','','','1 min','','✅','']]);
R('reporteActualizar_()');
const f4=libro['Reporte'].filas,iCook=f4.findIndex(x=>/Cookie/.test(x[1]));
t(f4[iCook][3]==='❌'&&f4.slice(iCook+1,-1).every(x=>x[3]==='❌'),'una fila que pasa a rojo se va con los rojos: '+f4.map(x=>x[3]).join(''));
// cableado
const S=n=>src(n);
t(/reporteProgramado_\(\)/.test(S('Salud.gs')),'Salud dispara el reporte cada hora');
t(/'reporteMenu'/.test(S('Setup.gs'))&&/📋 Reporte del día \(hoja\)/.test(S('Organizar.gs')),'menu y guia del menu');
t(/\['Reporte',\s+'SISTEMA'/.test(S('Organizar.gs')),'hoja en el registro');
// 19-nov: hora real de recoleccion (hoja PAQUETERIA)
{ const D2=Object.assign({},D,{paq:[{'FECHA RECOLECCION':new Date(2026,10,13,12,16)},{'FECHA RECOLECCION':new Date(2026,10,13,13,5)},{'FECHA RECOLECCION':new Date(2026,10,12,12,40)},{'FECHA RECOLECCION':''}]});
  ctx.D2=D2;cx.hora=16;const dowAntes=cx.dow;cx.dow=4;const rr=R('rpCalcular_(D2,CX)').filter(x=>x.area==='RECOLECCION');
  const hr=rr.find(x=>/A qué hora/.test(x.pregunta));
  t(hr&&/Hoy a las 12:16 \(2 guías\)/.test(hr.resp)&&/ayer a las 12:40 \(1\)/.test(hr.resp)&&hr.estado==='✅','recoleccion real: hoy 12:16 (primera), ayer 12:40: '+(hr&&hr.resp));
  D2.paq=[{'FECHA RECOLECCION':new Date(2026,10,12,12,40)}];const hr2=R('rpCalcular_(D2,CX)').find(x=>/A qué hora/.test(x.pregunta));
  t(hr2&&/todavía no/.test(hr2.resp)&&hr2.estado==='⚠️'&&/bodega/.test(hr2.accion),'dia habil despues de las 15 sin recoleccion: aviso: '+(hr2&&JSON.stringify(hr2)));
  cx.hora=10;cx.dow=dowAntes; }
// 20-nov: ERROR de pedidos antiguos (mas de 7 dias) no es error rojo
{ const D3=Object.assign({},D,{canc:[{ORIGEN:'PRECIO ERRONEO','ESTADO ODOO':'ERROR: no se cancelo en el site','FECHA CORREO':new Date(AHORA-10*86400000),'PEDIDO#':'600000134906620'}]});
  ctx.D3=D3;const ce=R('rpCalcular_(D3,CX)').find(x=>/con error o pendientes/.test(x.pregunta));
  t(ce&&ce.estado!=='❌'&&/1 antiguos que ya no se cancelan/.test(ce.resp)&&!/cancélalos tú/.test(ce.accion),'error antiguo: solo se cuenta, sin rojo: '+(ce&&ce.resp+' | '+ce.estado)); }
// 26-nov: ¿Que computadora esta trabajando?
{ const AH=Date.UTC(2026,10,26,13,40), V=min=>AH-min*60000;
  const pc=(n,min,tr)=>({nombre:n,visto:V(min),activa:min<=6,turno:!!tr});   // la 'activa' del Sheet se ignora: manda cuando se vio por ultima vez (20 min)
  const c1=R('rpComputadoras_(T1,AH)',Object.assign(ctx,{T1:{pcs:[pc('DELL',12,1),pc('FORCEV',2),pc('FCORSAIR',800)],quien:'DELL'},AH}));
  t(c1.estado==='✅'&&/^DELL trabaja/.test(c1.resp)&&/FORCEV en espera/.test(c1.resp)&&/FCORSAIR sin responder hace 13\.3 h/.test(c1.resp)&&c1.accion==='','dos prendidas (la Dell pregunto hace 12 min, es normal): ✅ y dice cual trabaja: '+c1.resp);
  const c2=R('rpComputadoras_(T2,AH)',Object.assign(ctx,{T2:{pcs:[pc('DELL',1,1),pc('FORCEV',660),pc('FCORSAIR',800)]}}));
  t(c2.estado==='⚠️'&&/trabaja sola, sin respaldo/.test(c2.resp)&&/FORCEV sin responder hace 11 h/.test(c2.resp)&&/Prender FORCEV o FCORSAIR/.test(c2.accion),'una sola prendida: ⚠️ sin respaldo: '+c2.resp+' | '+c2.accion);
  const c3=R('rpComputadoras_(T3,AH)',Object.assign(ctx,{T3:{pcs:[pc('DELL',25,1),pc('FORCEV',2)]}}));
  t(c3.estado==='⚠️'&&/DELL tiene el turno pero no responde hace 25 min/.test(c3.resp),'la que trabaja no responde: ⚠️: '+c3.resp);
  const c4=R('rpComputadoras_(T4,AH)',Object.assign(ctx,{T4:{pcs:[pc('DELL',90),pc('FORCEV',70)]}}));
  t(c4.estado==='❌'&&/Ninguna tiene el turno/.test(c4.resp)&&/DELL sin responder hace 1\.5 h/.test(c4.resp),'nadie con turno: ❌: '+c4.resp);
  const c6=R('rpComputadoras_(T6,AH)',Object.assign(ctx,{T6:{pcs:[pc('DELL',9,1),pc('DELL',8640),pc('DELL SERVIDOR',1530),pc('FORCEV',3),pc('PC-B73C',8640)]}}));
  t(c6.estado==='✅'&&/^DELL trabaja/.test(c6.resp)&&!/6 días|25\.5 h/.test(c6.resp)&&/\(\+3 sin verse hace más de 1 día/.test(c6.resp),'las computadoras viejas (mas de 1 dia) no cuentan ni ensucian: '+c6.resp);
  const c5=R('rpComputadoras_(null,AH)',Object.assign(ctx,{AH}));
  t(c5.estado==='⚠️'&&/Sin dato/.test(c5.resp),'sin dato del turno: aviso, no truena');
  const fila=R('rpCalcular_(D4,CX)',Object.assign(ctx,{D4:Object.assign({},D,{turno:{pcs:[pc('DELL',1,1),pc('FORCEV',2)]}})})).find(x=>/Qué computadora/.test(x.pregunta));
  t(fila&&fila.area==='CONEXIONES'&&fila.estado==='✅'&&/DELL trabaja/.test(fila.resp),'entra al reporte como pregunta de CONEXIONES'); }
// 26-nov: ¿La subida automatica de FORCEV esta viva?
{ const AH=Date.UTC(2026,10,26,15,50), M=min=>AH-min*60000;
  const e=(o)=>R('rpSubidaAuto_(SA,AH)',Object.assign(ctx,{AH,SA:o}));
  const a1=e({pc:'FORCEV',vuelta:M(4),evento:'vuelta',detalle:'sin cambios',desde:M(300),subido:M(95)});
  t(a1.estado==='✅'&&/FORCEV viva: última vuelta hace 4 min · última subida hace 1\.6 h/.test(a1.resp)&&a1.accion==='','viva: ✅ con ultima vuelta y ultima subida: '+a1.resp);
  const a2=e({pc:'FORCEV',vuelta:M(50),evento:'vuelta',subido:0});
  t(a2.estado==='⚠️'&&/sin dar vuelta hace 50 min/.test(a2.resp)&&/sin subidas registradas/.test(a2.resp),'sin vueltas 50 min: ⚠️');
  const a3=e({pc:'FORCEV',vuelta:M(200),evento:'vuelta'});
  t(a3.estado==='❌'&&/sin dar vuelta hace 3\.3 h/.test(a3.resp),'sin vueltas 3 h: ❌');
  const a4=e({pc:'FORCEV',vuelta:M(2),evento:'no_sube',detalle:'t99.js fallo',desde:M(40),subido:M(500)});
  t(a4.estado==='❌'&&/NO sube: t99\.js fallo · desde hace 40 min/.test(a4.resp)&&/ultimo-5\.txt/.test(a4.accion),'pruebas no pasan: ❌ con el motivo');
  const a5=e(null);t(a5.estado==='⚠️'&&/Sin dato/.test(a5.resp),'sin dato: aviso, no truena');
  const fila=R('rpCalcular_(D5,CX)',Object.assign(ctx,{D5:Object.assign({},D,{autoLatido:{pc:'FORCEV',vuelta:Date.now()-120000,evento:'vuelta'}})}));
  t(fila.some(x=>/subida automática de FORCEV/.test(x.pregunta)&&x.area==='CONEXIONES'),'entra al reporte como pregunta de CONEXIONES'); }
// 26-nov: ¿Hay cancelaciones por precio erroneo? (lo vital: si el sistema no pudo cancelar en Walmart, ella entra a mano)
{ const cp=()=>R('rpCalcular_(DP,CX)').find(x=>/cancelaciones por precio erróneo/.test(x.pregunta));
  const base=D.canc.filter(x=>!/PRECIO/.test(x.ORIGEN));
  const hoyD=new Date(cx.ahora||AHORA);
  const mk=(o)=>Object.assign(ctx,{DP:Object.assign({},D,{canc:base.concat(o)})});
  mk([]);let p0=cp();
  t(p0&&p0.area==='CANCELACIONES'&&p0.estado==='✅'&&/Hoy: entraron 0 · canceladas 0/.test(p0.resp)&&p0.accion==='','sin precio erroneo: ✅: '+(p0&&p0.resp));
  mk([{ORIGEN:'PRECIO ERRONEO','ESTADO ODOO':'','CANCELAR EN ODOO':true,'NOTA ODOO':'ERROR WALMART: no se pudo','FECHA CORREO':new Date(AHORA-86400000),'PEDIDO#':'600000999999999-1-1','ORDEN DE COMPRA#':'609130000000001'}]);let p1=cp();
  t(p1.estado==='❌'&&/A mano en Walmart: 1 · pedidos 609130000000001/.test(p1.resp)&&/Entrar a Walmart y cancelar a mano 1 por precio erróneo/.test(p1.accion)&&/CANCELADA EN WALMART/.test(p1.accion),'Walmart fallo: ❌ con el pedido y el paso: '+p1.resp);
  mk([{ORIGEN:'PRECIO ERRONEO','ESTADO ODOO':'','CANCELAR EN ODOO':true,'CANCELADA EN WALMART':false,'FECHA CORREO':new Date(AHORA-3600000),'ORDEN DE COMPRA#':'609130000000002'}]);let p2=cp();
  t(p2.estado==='⚠️'&&/entraron 1/.test(p2.resp)&&/En cola para cancelarse solas: 1/.test(p2.resp)&&/Revisar en 1 hora/.test(p2.accion),'en cola (>7%): ⚠️ avisa que entro y que se vigile: '+p2.resp);
  mk([{ORIGEN:'PRECIO ERRONEO','ESTADO ODOO':'','CANCELAR EN ODOO':false,'FECHA CORREO':new Date(AHORA-7200000),'ORDEN DE COMPRA#':'609130000000003'}]);let p3=cp();
  t(p3.estado==='⚠️'&&/Por decidir \(3% a 7%\): 1/.test(p3.resp)&&/Decidir 1 precio/.test(p3.accion),'3% a 7%: ⚠️ por decidir');
  mk([{ORIGEN:'PRECIO ERRONEO','ESTADO ODOO':'CANCELADO EN ODOO','FECHA ODOO':new Date(AHORA-1800000),'CANCELAR EN ODOO':true,'CANCELADA EN WALMART':true,'FECHA CORREO':new Date(AHORA-3*86400000)}]);let p4=cp();
  t(p4.estado==='⚠️'&&/canceladas 1/.test(p4.resp)&&/ya quedaron canceladas en Walmart y Odoo/.test(p4.accion),'cancelada hoy sola: ⚠️ aviso, sin pedir cancelar a mano: '+p4.resp);
  mk([{ORIGEN:'PRECIO ERRONEO','ESTADO ODOO':'CANCELADO EN ODOO','FECHA ODOO':new Date(AHORA-5*86400000),'CANCELAR EN ODOO':true,'CANCELADA EN WALMART':true,'FECHA CORREO':new Date(AHORA-5*86400000)}]);
  t(cp().estado==='✅','una cancelada hace dias y completa: ✅'); }
// 26-nov: ¿La Dell se esta actualizando sola? (5-DELL.bat avisa al Sheet)
{ const AH=Date.UTC(2026,10,26,16,30), M=min=>AH-min*60000;
  const e=(o)=>R('rpActualizadores_(AC,AH)',Object.assign(ctx,{AH,AC:o}));
  const b1=e({DELL:{pc:'DELL',vuelta:M(6),evento:'vuelta',detalle:'al dia, version 1.10.7',desde:M(900),subido:M(1200)}});
  t(b1.estado==='✅'&&/DELL se actualiza sola \(al dia, version 1\.10\.7\) · última vuelta hace 6 min · último cambio hace 20 h/.test(b1.resp)&&b1.accion==='','Dell al dia: ✅: '+b1.resp);
  const b2=e({DELL:{pc:'DELL',vuelta:M(60),evento:'vuelta'}});
  t(b2.estado==='⚠️'&&/sin dar vuelta hace 1 h \(debe ser cada 15 min\)/.test(b2.resp)&&/sin cambios registrados/.test(b2.resp),'sin vuelta 1 h: ⚠️');
  const b3=e({DELL:{pc:'DELL',vuelta:M(240),evento:'vuelta'}});t(b3.estado==='❌'&&/4 h/.test(b3.resp)&&/SiteSheet-Dell-Actualizar/.test(b3.accion),'sin vuelta 4 h: ❌');
  const b4=e({DELL:{pc:'DELL',vuelta:M(3),evento:'fallo',detalle:'no pude bajar de GitHub',desde:M(45),subido:M(2000)}});
  t(b4.estado==='❌'&&/DELL NO se actualiza: no pude bajar de GitHub · desde hace 45 min/.test(b4.resp)&&/5-DELL\.bat a mano/.test(b4.accion),'fallo al actualizar: ❌ con motivo');
  const b5=e({DELL:{pc:'DELL',vuelta:M(5),evento:'actualizado',detalle:'1.10.6 a 1.10.7',subido:M(5)},VIEJA:{pc:'VIEJA',vuelta:M(3000),evento:'vuelta'}});
  t(b5.estado==='✅'&&/DELL se actualiza sola \(1\.10\.6 a 1\.10\.7\)/.test(b5.resp)&&!/VIEJA/.test(b5.resp),'actualizada ahora: ✅; una PC que no avisa hace 2 dias se ignora');
  const b6=e(null);t(b6.estado==='⚠️'&&/Sin dato/.test(b6.resp),'sin dato: aviso, no truena');
  const b7=e({DELL:{pc:'DELL',vuelta:M(4),evento:'vuelta'},DELL2:{pc:'CORSAIR',vuelta:M(100),evento:'vuelta'}});
  t(b7.estado==='⚠️'&&b7.resp.split('\n').length===2,'dos PCs: una linea cada una y gana la peor'); }
console.log(bad?bad+' FALLAN':'t66: '+ok+' ok');process.exit(bad?1:0);
