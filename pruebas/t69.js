// t69: hoja Casos Decidir (cola de casos que te tocan, DECISION, texto listo, DESCARTAR) + correo de caso REABIERTO.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,isFinite,RegExp,parseFloat};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
ctx.TZ='America/Mexico_City';
ctx.normEnc_=x=>String(x==null?'':x).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
const pad=n=>String(n).padStart(2,'0');
ctx.Utilities={formatDate:(d)=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
ctx.logs=[];ctx.logOk_=(e,m)=>ctx.logs.push('OK '+e+' '+m);ctx.logWarn_=(e,m)=>ctx.logs.push('WARN '+e+' '+m);ctx.flushLog_=()=>{};
const src=f=>fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8');
ctx.peSku_=x=>String(x||'').trim().toUpperCase();
vm.runInContext(src('CasosDecidir.gs')+'\n'+src('CasosWalmart.gs'),ctx);
const R=c=>vm.runInContext(c,ctx);

/* ---- correo: caso reabierto ---- */
const L1=R('cawLeerMensaje_')({asunto:'Caso reabierto 17009830',cuerpo:'Hola VICTO, tu caso fue reabierto.',de:'soportemp@walmart.com',fecha:new Date(2026,10,13,13,10)});
t(L1&&L1.caso==='17009830'&&L1.estado==='ABIERTO'&&L1.reabierto===true,'correo "reabierto": caso y estado ABIERTO: '+JSON.stringify(L1));
const L2=R('cawLeerMensaje_')({asunto:'Cierre de caso 17009830',cuerpo:'Tu caso se ha solucionado. Si necesitas reabrir el caso, responde este correo.',de:'soportemp@walmart.com',fecha:new Date(2026,10,9)});
t(L2&&L2.estado==='CERRADO'&&!L2.reabierto,'un cierre que dice "reabrir" NO cuenta como reapertura');
const cs=R('cawCasosDeCorreos_')([L2,L1]);
t(Object.values(cs).length===1&&Object.values(cs)[0].estado==='ABIERTO'&&Object.values(cs)[0].reabierto===true,'cierre y luego reapertura: el caso queda ABIERTO y reabierto');
const L3=R('cawLeerMensaje_')({asunto:'Cierre de caso 17009830',cuerpo:'Tu caso se ha solucionado.',de:'soportemp@walmart.com',fecha:new Date(2026,10,14)});
const cs2=R('cawCasosDeCorreos_')([L3,L1]);
t(Object.values(cs2)[0].estado==='CERRADO'&&!Object.values(cs2)[0].reabierto,'reapertura y luego cierre: queda CERRADO');

/* ---- Casos Decidir ---- */
function hoja(enc,filas){const h={enc:enc.slice(),filas:filas||[],anchos:{},borradas:0};
 h.getLastRow=()=>h.filas.length+1;h.getLastColumn=()=>h.enc.length;h.getColumnWidth=c=>h.anchos[c]||60;h.setColumnWidth=(c,w)=>{h.anchos[c]=w};
 h.getRange=(r,c,nr,nc)=>{nr=nr||1;nc=nc||1;return{
  getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>{const row=h.filas[r-2+i];return row&&row[c-1+j]!==undefined?row[c-1+j]:''})),
  setValues:v=>{v.forEach((row,i)=>{const k=r-2+i;h.filas[k]=h.filas[k]||[];row.forEach((x,j)=>{h.filas[k][c-1+j]=x})})},
  setValue:x=>{h.filas[r-2]=h.filas[r-2]||[];h.filas[r-2][c-1]=x},
  setDataValidation:function(v){h.valid=v;return this},setHorizontalAlignment:function(){return this},setVerticalAlignment:function(){return this},setWrap:function(){return this},setNumberFormat:function(){return this}}};
 h.getMaxRows=()=>200;h.getFrozenRows=()=>1;h.insertRowsAfter=()=>{};h.rules=[];h.getConditionalFormatRules=()=>h.rules;h.setConditionalFormatRules=r=>{h.rules=r};
 h.deleteRows=(ini,n)=>{h.filas.splice(ini-2,n);h.borradas+=n};return h}
let libro={};
ctx.SpreadsheetApp={newDataValidation:()=>{const o={};['requireValueInList','setAllowInvalid'].forEach(k=>o[k]=(x)=>{o[k+'_v']=x;return o});o.build=()=>o;return o},
 newConditionalFormatRule:()=>{const o={};['whenTextEqualTo','setBackground','setRanges'].forEach(k=>o[k]=(x)=>{o[k+'_v']=x;return o});o.build=()=>o;return o},
 getActive:()=>({setActiveSheet:()=>{}})};
ctx.peTabla_=n=>{const h=libro[n];if(!h)return null;const pos={};h.enc.forEach((x,i)=>{const k=ctx.normEnc_(x);if(k&&pos[k]===undefined)pos[k]=i});return{enc:h.enc,pos,filas:h.filas.map(f=>h.enc.map((_,i)=>f[i]===undefined?'':f[i]))}};
ctx.peCol_=(tb,ns)=>{for(const n of ns){const j=tb.pos[ctx.normEnc_(n)];if(j!==undefined)return j}return -1};
ctx.vdLibro_=()=>({getSheetByName:n=>libro[n]||null});
ctx.peHojaAsegurar_=(n,enc)=>{if(!libro[n])libro[n]=hoja(enc);return libro[n]};
ctx.ubicarColumnas_=(h,enc)=>{const col={};enc.forEach(e=>{let i=h.enc.map(x=>ctx.normEnc_(x)).indexOf(ctx.normEnc_(e));if(i<0){h.enc.push(e);i=h.enc.length-1}col[ctx.normEnc_(e)]=i+1});return{col}};
ctx.escrCol_=(m,e)=>m.col[ctx.normEnc_(e)]||0;
ctx.peAgregar_=(h,enc,filas)=>{const m=ctx.ubicarColumnas_(h,enc);filas.forEach(x=>{const row=[];enc.forEach(e=>{row[m.col[ctx.normEnc_(e)]-1]=x[e]===undefined?'':x[e]});h.filas.push(row)})};
let dlg=null;ctx.dlgInfo_=(a,b,c)=>{dlg={a,b,c}};
const ENC=R('CAW_ENC');const fila=o=>ENC.map(e=>o[e]===undefined?'':o[e]);
libro['Casos Walmart']=hoja(ENC,[
 fila({ESTADO:'POR ABRIR',TIPO:'PRECIO DISTINTO A LA CARGA',SKU:'JBL-A',MOTIVO:'Walmart 2859 vs carga 259',PRODUCTO:'Bocina A','FECHA ABIERTO':new Date(2026,10,12)}),
 fila({ESTADO:'POR ABRIR',TIPO:'PRECIO DISTINTO A LA CARGA',SKU:'JBL-B',MOTIVO:'Walmart 879 vs carga 799','FECHA ABIERTO':new Date(2026,10,12)}),
 fila({ESTADO:'POR ABRIR',TIPO:'SIN GUIA',SKU:'SON-1',PEDIDO:'600000131318758',MOTIVO:'No se generó la guía','FECHA ABIERTO':new Date(2026,10,12)}),
 fila({'FOLIO WALMART':"'17009682",ESTADO:'RESPUESTA WALMART',TIPO:'SELLER SUPPORT',MOTIVO:'Error Al Actualizar Precios','FECHA ABIERTO':new Date(2026,10,9)}),
 fila({'FOLIO WALMART':"'16679023",ESTADO:'CERRADO',TIPO:'SELLER SUPPORT'}),
 fila({'FOLIO WALMART':"'16883166",ESTADO:'ABIERTO',TIPO:'SELLER SUPPORT'})
]);
const cola=R('cdecCola_')(ctx.peTabla_('Casos Walmart'));
t(cola.length===4&&cola.every(x=>/^(POR ABRIR|RESPUESTA WALMART)$/.test(x.estado)),'la cola trae solo lo que te toca (no CERRADO ni ABIERTO): '+cola.length);
t(cola[0].tipo<=cola[1].tipo&&cola[1].tipo<=cola[2].tipo,'ordenada por tipo');
let r=R('cdecActualizar_()');
const CD=libro['Casos Decidir'],ci=n=>CD.enc.indexOf(n);
t(r.total===4&&r.sinDecision===4&&r.nuevas===4&&CD.filas.length===4,'primera vez: 4 filas, todas sin decidir: '+JSON.stringify({t:r.total,s:r.sinDecision}));
t(CD.valid&&CD.valid.requireValueInList_v.indexOf('DESCARTAR')>=0,'DECISION trae lista desplegable');
const fil=(sku)=>CD.filas.find(f=>f[ci('SKU')]===sku);
t(fil('JBL-A')[ci('SUGERENCIA')]==='ABRIR'&&CD.filas.find(f=>f[ci('FOLIO WALMART')]==='17009682')[ci('SUGERENCIA')]==='RESPONDER','sugerencia por estado');
r=R('cdecActualizar_()');t(r.nuevas===0&&CD.filas.length===4,'segunda vez: no duplica');
// decisiones tuyas
fil('JBL-A')[ci('DECISION')]='ABRIR JUNTOS';fil('JBL-B')[ci('DECISION')]='ABRIR JUNTOS';fil('SON-1')[ci('DECISION')]='ABRIR';
const fo=CD.filas.find(f=>f[ci('FOLIO WALMART')]==='17009682');fo[ci('DECISION')]='RESPONDER';fo[ci('NOTA')]='ojo';
let g=R('cdecGenerar_()');
t(g.textos===4&&g.descartados===0,'4 textos generados: '+JSON.stringify(g));
const tx=sku=>fil(sku)[ci('TEXTO LISTO')];
t(/ASUNTO: PRECIO DISTINTO A LA CARGA - 2 producto\(s\)/.test(tx('JBL-A'))&&/- JBL-A/.test(tx('JBL-A'))&&/- JBL-B/.test(tx('JBL-A')),'ABRIR JUNTOS: un solo texto con los 2 SKU en la primera fila');
t(/Va junto con los demás/.test(tx('JBL-B'))&&/fila 2/.test(tx('JBL-B')),'las otras filas del grupo apuntan al texto');
t(/ASUNTO: SIN GUIA - SON-1/.test(tx('SON-1'))&&/Pedido: 600000131318758/.test(tx('SON-1'))&&/No se generó la guía de envío/.test(tx('SON-1')),'ABRIR: texto del caso con SKU y pedido');
t(/ASUNTO: Re: Caso 17009682/.test(fo[ci('TEXTO LISTO')])&&/\[ESCRIBE AQUÍ TU RESPUESTA\]/.test(fo[ci('TEXTO LISTO')]),'RESPONDER: lleva el espacio para tu respuesta');
t(!/cliente|direcci/i.test(tx('SON-1')),'sin datos de clientes');
// DESCARTAR
fil('JBL-B')[ci('DECISION')]='DESCARTAR';
g=R('cdecGenerar_()');
const CW=libro['Casos Walmart'],cw=n=>CW.enc.indexOf(n);
t(g.descartados===1&&CW.filas[1][cw('ESTADO')]==='CERRADO'&&/^DESCARTADO/.test(CW.filas[1][cw('RESOLUCION')])&&CW.filas[1][cw('FECHA CIERRE')]!==''&&CW.filas[0][cw('ESTADO')]==='POR ABRIR','DESCARTAR: pasa a CERRADO en Casos Walmart con resolucion y fecha; las demas no se tocan');
r=R('cdecActualizar_()');
t(CD.filas.length===3&&CD.borradas===1&&!fil('JBL-B'),'el descartado sale de la lista');
t(fil('JBL-A')[ci('DECISION')]==='ABRIR JUNTOS'&&CD.filas.find(f=>f[ci('FOLIO WALMART')]==='17009682')[ci('NOTA')]==='ojo','tu DECISION y NOTA se quedan con su caso');
// el caso avanza (Walmart responde / se cierra): sale solo
CW.filas[3][cw('ESTADO')]='CERRADO';R('cdecActualizar_()');
t(CD.filas.length===2&&!CD.filas.find(f=>f[ci('FOLIO WALMART')]==='17009682'),'cuando el caso ya no te toca, se quita solo');
// reporte de menu
R('casosDecidirMenu()');t(dlg&&/te tocan/.test(dlg.b)&&ctx.logs.some(l=>/OK CASOS Casos Decidir:/.test(l)),'menu: resumen y Log');
// el detector no vuelve a abrir un descartado
libro['Casos Walmart'].filas.push(fila({ESTADO:'CERRADO',TIPO:'X',SKU:'OLD-1',RESOLUCION:'cerrado normal'}));
CW.filas[1][cw('SKU')]='JBL-B';
const v=R('cawVigentes_()');
t(v['JBL-B']&&v['JBL-B'].estado==='DESCARTADO'&&!v['OLD-1'],'un DESCARTADO sigue "vigente" 30 dias (el detector no lo abre otra vez); uno cerrado normal no');
console.log('t69: '+ok+' ok'+(bad?', '+bad+' FALLAN':''));process.exit(bad?1:0);
