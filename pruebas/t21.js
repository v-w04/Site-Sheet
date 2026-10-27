// t21 formato hoja ENVIO, popups (JS valido, ID/DELIVERY), editor con datos del envio
// t19 — WFS en Site Sheet: calculo igual a WFS 1.0 (datos reales 23-oct), formulas, nuevo envio, archivar, traer, automatico.
// Correr desde la carpeta pruebas:  node t20.js
const fs=require('fs'),vm=require('vm');
const SITE=__dirname+'/../apps-script', WFS=SITE;
let p=0,f=0;const ok=(c,m)=>{c?p++:f++;console.log(c?'OK':'FALLA',m)};
const noop=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?undefined:noop(),apply:()=>noop()});
class Sh{setRowHeight(){} setTabColor(){} constructor(n,d){this.n=n;this.d=d.map(r=>r.slice());this.fx={};this.max=Math.max(this.d.length,300);this.oculta=false}
 getName(){return this.n} setName(n){this.n=n;return this}
 getLastRow(){let l=0;this.d.forEach((r,i)=>{if(r.some(c=>c!==''&&c!=null))l=i+1});return l}
 getLastColumn(){let l=0;this.d.forEach(r=>r.forEach((c,j)=>{if(c!==''&&c!=null&&j+1>l)l=j+1}));return Math.max(l,1)}
 getMaxRows(){return this.max} getMaxColumns(){return 60} insertRowsAfter(a,n){this.max+=n} insertColumnsAfter(){}
 setFrozenRows(){} setColumnWidth(){} clear(){this.d=[[]];this.fx={}} setConditionalFormatRules(r){this.reglas=r} getPivotTables(){return []} hideSheet(){this.oculta=true} getIndex(){return 1}
 copyTo(ss){const c=new Sh('Copia de '+this.n,this.d);ss._add(c);return c}
 getRange(r,c,nr,nc){const s=this;nr=nr||1;nc=nc||1;
  const get=()=>{const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((s.d[r-1+i]||[])[c-1+j]??'');o.push(row)}return o};
  const set=v=>{v.forEach((row,i)=>{while(s.d.length<r+i)s.d.push([]);row.forEach((x,j)=>{s.d[r-1+i][c-1+j]=x})})};
  const api={getValues:get,getDisplayValues:()=>get().map(x=>x.map(v=>v===null||v===undefined?'':String(v))),
   getDisplayValue:()=>String(get()[0][0]),getValue:()=>get()[0][0],
   getFormula:()=>s.fx[r+','+c]||'',
   setFormula:t=>{s.fx[r+','+c]=t;return P},
   setValues:v=>{set(v);return P},setValue:x=>{set([[x]]);return P},
   clearContent:()=>{for(let i=0;i<nr;i++)for(let j=0;j<nc;j++){if(s.d[r-1+i])s.d[r-1+i][c-1+j]='';delete s.fx[(r+i)+','+(c+j)]}return P}};
  const P=new Proxy(api,{get:(t,k)=>k in t?t[k]:()=>P});return P}}
const sheets={};const orden=[];
const ss={getSheetByName:n=>sheets[n]||null,getSheets:()=>orden.slice(),deleteSheet:h=>{delete sheets[h.getName()];orden.splice(orden.indexOf(h),1)},
 insertSheet:(n)=>{const h=new Sh(n,[[]]);ss._add(h);return h},
 _add:h=>{orden.push(h);const old=h.setName.bind(h);h.setName=n=>{for(const k in sheets)if(sheets[k]===h)delete sheets[k];old(n);sheets[n]=h;return h};sheets[h.getName()]=h}};
const logs=[];const props={};
const ctx={console,Date,JSON,Math,Object,Array,String,Number,isNaN,parseInt,
 logStart_(){},logInfo_(e,m){logs.push('INFO '+m)},logOk_(e,m){logs.push('OK '+m)},logWarn_(e,m){logs.push('WARN '+m)},logErr_(e,m){logs.push('ERR '+m)},logFinish_(){},logLatido_(){},flushLog_(){},
 Utilities:{formatDate:(d,z,fm)=>{const x=new Date(d);const p2=n=>String(n).padStart(2,'0');return fm.replace('yyyy',x.getFullYear()).replace('MM',p2(x.getMonth()+1)).replace('dd',p2(x.getDate())).replace('HH',p2(x.getHours())).replace('mm',p2(x.getMinutes())).replace('ss',p2(x.getSeconds()))},parseDate:()=>new Date()},
 SpreadsheetApp:{getActive:()=>ss,newConditionalFormatRule:()=>noop()},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
 ScriptApp:{getProjectTriggers:()=>[]},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v}})}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SITE+'/Columnas.gs','utf8'),ctx);
vm.runInContext(fs.readFileSync(SITE+'/Escritura.gs','utf8'),ctx,{filename:'Escritura.gs'});
['Wfs.gs','WfsHoja.gs','WfsEnvios.gs','WfsChoferes.gs','WfsPlantilla.gs','WfsAutoriza.gs'].forEach(n=>vm.runInContext(fs.readFileSync(WFS+'/'+n,'utf8'),ctx,{filename:n}));

const run=c=>vm.runInContext(c,ctx);
const ENC=run('WFS_ENV_ENC');
const ix=(n,o)=>{let k=0;for(let i=0;i<ENC.length;i++)if(ENC[i]===n&&++k===(o||1))return i};
const mkEnvio=(nom,det,delivery)=>{const d=[ENC.slice()];const r2=new Array(ENC.length).fill('');r2[ix('DELIVERY')]=delivery;r2[ix('FECHA')]='2026-10-28';r2[ix('HORA')]='08:00';r2[ix('CHOFER')]='PROMOTORA RESTREPO';d.push(r2);
 det.forEach((x,i)=>{const r=i===0?r2:new Array(ENC.length).fill('');if(i===0){}else d.push(r);
  r[ix('SKU')]=x[0];r[ix('AUTORIZADO')]=x[1];r[ix('PROPUESTA')]=x[1];r[ix('SKU BASE')]=x[0].replace(/-MSI(-\d)?$/,'')});
 const h=new Sh(nom,d);ss._add(h);return h};
const E=mkEnvio('ENVIO 20 28/10/26',[['AAA-111-MSI',10],['BBB-222-MSI',5],['CCC-333-MSI',0],['ZZZ-999-MSI',2]],'DLV123');
const gi=ix('AUTORIZADO')+1;[['7501234567890'],['12345678901'],[''],['']].forEach((g,i)=>{E.d[1+i][gi]=g[0]});
E.d[1][ix('CATEGORIA')]='C1';E.d[1][ix('NOMBRE')]='Prod A';
ss.getActiveSheet=()=>sheets['ENVIO 20 28/10/26'];


ctx.SpreadsheetApp.BorderStyle={SOLID:'SOLID'};
const fm=run("wfsFormatoEnvio_(SpreadsheetApp.getActive().getSheetByName('ENVIO 20 28/10/26'))");
ok(fm.detalle===4&&fm.choferes===0,'formato: cuenta detalle y corre sin error ('+JSON.stringify(fm)+')');
// popups: el JS del HTML compila y trae los inputs nuevos
const h1=run('wfsHtmlNuevoEnvio_()'),h2=run('wfsChHtml_()');
[h1,h2].forEach((h,i)=>{const js=h.split('<script>')[1].split('</script>')[0];let o=true;try{new Function(js)}catch(e){o=false;console.log(e.message)}ok(o,'JS valido popup '+(i+1))});
ok(/id="idenv"/.test(h1)&&/id="deliv"/.test(h1)&&/idEnvio:/.test(h1),'nuevo envio trae ID y DELIVERY');
ok(/min-width:0/.test(h1)&&/min-width:0/.test(h2),'fieldset sin desborde (min-width:0)');
ok(/id="i_id"/.test(h2)&&/id="i_del"/.test(h2)&&/info:\{id:/.test(h2),'editor trae ID, DELIVERY, fecha y hora');
// editor: guarda ID/DELIVERY/fecha/hora
ctx.__o={hoja:'ENVIO 20 28/10/26',choferes:[{nombre:'JUAN',curp:'X',contacto:'1'}],camionetas:[{placas:'AAA1',color:'BLANCO',tipo:'VAN'}],info:{id:'12345',delivery:'DLV999',fecha:'2026-11-02',hora:'09:30'}};
const out=run('wfsChGuardar_(__o)');console.log(out);
const E2=sheets['ENVIO 20 28/10/26'];
ok(E2.d[1][0]==='12345'&&E2.d[1][ix('DELIVERY')]==='DLV999'&&E2.d[1][ix('HORA')]==='09:30','editor escribe ID, DELIVERY y hora en la fila 2');
ok(E2.d[2][ix('CHOFER')]==='JUAN','editor sigue guardando choferes');
ctx.__o.info.fecha='mañana';let e='';try{run('wfsChGuardar_(__o)')}catch(x){e=x.message}ok(/fecha/.test(e),'fecha mala: error y no escribe');
const dd=run("wfsChDatos('ENVIO 20 28/10/26')");ok(dd.info&&dd.info.id==='12345','datos del editor traen info actual');

// crear hoja nueva: layout PROPUESTA/AUTORIZADO/GTIN/SKU BASE, posicion en la familia WFS, ID y delivery
sheets['WFS']||ss._add(new Sh('WFS',[[]]));
let posUsada=-1;const insOld=ss.insertSheet;ss.insertSheet=(n,pos)=>{posUsada=pos;return insOld(n)};
orden.forEach((h,i)=>{h.getIndex=()=>orden.indexOf(h)+1});
ctx.wfsLeerEnvioFinal_=()=>({filas:[
 {sku:'AAA-111-MSI',cant:10,gtin:'00637913936784',cat:'Cat',nom:'Nom A',vend:30,stock:100,wfs:2},
 {sku:'BBB-222-MSI',cant:3,gtin:'00063791393678',cat:'Cat',nom:'Nom B',vend:9,stock:3,wfs:0},
 {sku:'CCC-333-MSI',cant:3,gtin:'00063791393111',cat:'Cat',nom:'Nom C',vend:9,stock:4,wfs:0},
 {sku:'DDD-444-MSI',cant:9,gtin:'00063791393222',cat:'Cat',nom:'Nom D',vend:9,stock:100,wfs:1},
 {sku:'EEE-555-MSI',cant:6,gtin:'00063791393333',cat:'Cat',nom:'Nom E',vend:9,stock:8,wfs:0},
 {sku:'EEE-555',cant:2,gtin:'00063791393444',cat:'Cat',nom:'Nom E2',vend:9,stock:8,wfs:0},
 {sku:'FAM-1222-MSI',cant:28,gtin:'00063791390001',cat:'Cat',nom:'F1',vend:111,stock:0,wfs:0},
 {sku:'FAM-7817-MSI',cant:28,gtin:'00063791390002',cat:'Cat',nom:'F2',vend:15,stock:5546,wfs:48},
 {sku:'ZZZ-999-MSI',cant:1,gtin:'',cat:'Cat',nom:'Sin',vend:1,stock:5,wfs:0}],piezas:34,sinGtin:1,fuente:'UNIDADES',redondear:true});
const vent=new Sh('Ventas 30 dias',[['SKU','PRODUCTO','PIEZAS'],['AAA-111-MSI','x',20],['AAA-111','x',5],['BBB-222-MSI','x',1]]);ss._add(vent);
ss._add(new Sh('Variantes',[['SKU WALMART','ASIGNACION MANUAL'],['FAM-1222','FAM-7817']]));
ss._add(new Sh('Inventario Actual',[['SKU','Producto','Libre'],['FAM-7817','x',5546],['FAM-1222','x',0]]));
const bloq=new Sh('Bloqueados',[['SKU','GTIN'],['ZZZ-999-MSI','00637902748701']]);ss._add(bloq);
ctx.__c={numero:21,etiqueta:'02/11/26',fecha:'2026-11-02',hora:'08:00',idEnvio:'555',delivery:'DLV1',choferes:[{nombre:'JUAN',curp:'C1',contacto:'1'}],camionetas:[{placas:'AAA1',color:'BLANCO',tipo:'VAN'}]};
const txt=run('wfsCrearHojaEnvio_(__c)');console.log(txt);
const N=sheets['ENVIO 21 02/11/26'];
const val=(sku,col)=>{const r=N.d.slice(1).find(x=>x[ix('SKU')]===sku);return r&&r[ix(col)]};
ok(val('AAA-111-MSI','PROPUESTA')===10&&val('AAA-111-MSI','AUTORIZADO')===0,'10 se queda en 10; AUTORIZADO nace en 0');
ok(val('DDD-444-MSI','PROPUESTA')===10&&val('DDD-444-MSI','ODOO')===100,'9 sube a 10 (hay stock)');
ok(val('BBB-222-MSI','PROPUESTA')===3,'3 con solo 3 en Odoo se queda en 3 (no 5)');
ok(val('CCC-333-MSI','PROPUESTA')===4,'3 con 4 en Odoo sube solo a 4 (tope = stock)');
ok(val('EEE-555-MSI','PROPUESTA')+val('EEE-555','PROPUESTA')<=8&&val('EEE-555-MSI','PROPUESTA')>=6&&val('EEE-555','PROPUESTA')>=2,'SKU base compartido: la suma no pasa del stock (8) ni baja de lo calculado');
ok(!val('ZZZ-999-MSI','PROPUESTA'),'SKU sin GTIN NO esta en la hoja');
ok(/SIN GTIN/.test(N.d.map(r=>r[0]).join('|'))&&/BLOQUEADO/.test(N.d.map(r=>r[0]).join('|')),'nota visible en la hoja con motivo (bloqueado)');
ok(val('AAA-111-MSI','EN WFS')===2&&val('AAA-111-MSI','ODOO')===100&&val('AAA-111-MSI','VENDIDAS')===25,'VENDIDAS = premium + clasica (20+5), EN WFS y ODOO');
ok(val('AAA-111-MSI','GTIN')==='00637913936784'&&val('AAA-111-MSI','SKU BASE')==='AAA-111','GTIN del MSI y SKU BASE sin -MSI');
ok(N.d[1][0]==='555'&&N.d[1][ix('DELIVERY')]==='DLV1','ID y DELIVERY escritos');
ok(N.d[0][ix('PROPUESTA')]==='PROPUESTA'&&N.d[0].indexOf('CALCULADO')<0&&N.d[0][ix('ODOO')]==='ODOO','encabezados nuevos');
ok(/SIN GTIN/.test(txt)&&/1 SKU SIN GTIN/.test(txt),'resultado avisa los SKU sin GTIN');
ok(posUsada>=0,'nueva hoja se inserta en la familia WFS (pos '+posUsada+')');
ok(val('FAM-1222-MSI','PROPUESTA')===30&&val('FAM-7817-MSI','PROPUESTA')===30,'enlazadas: 28 sube a 30 en las dos (stock del dueno 5546, no el 0 de la enlazada)');
ok(val('FAM-1222-MSI','SKU BASE')==='FAM-7817'&&val('FAM-7817-MSI','SKU BASE')==='FAM-7817','enlazada: SKU BASE = el dueno del inventario (Odoo)');
ok(val('FAM-1222-MSI','ODOO')===5546,'enlazada: ODOO muestra el stock del dueno');
ok(/enlazada/.test(txt)&&/FAM-1222-MSI → FAM-7817/.test(txt),'resultado avisa las enlazadas');
ok(run('wfsSiguienteEnvio_({getSheets:()=>[],getSheetByName:()=>null})')===20,'sin hojas ni historico, el siguiente envio es 20 (no 1)');
ok(run("wfsSiguienteEnvio_({getSheets:()=>[{getName:()=>'ENVIO 22 x'}],getSheetByName:()=>null})")===23,'si hay una hoja ENVIO 22, sigue el 23');
const dd2=run('wfsDatosNuevoEnvio()');ok(dd2.sinGtin===1&&dd2.calculado===89&&dd2.piezas>31&&/BLOQUEADO/.test(dd2.sinGtinSkus[0]),'popup: avisa sin GTIN con motivo, calculado vs propuesto');
const rd=run("wfsLeerHojaEnvio_(SpreadsheetApp.getActive().getSheetByName('ENVIO 21 02/11/26'))");
ok(rd.detalle.length===8&&(x=>x[11]===0&&x[12]===10&&x[7]==='AAA-111'&&x[8]==='00637913936784')(rd.detalle.find(d=>d[6]==='AAA-111-MSI'))&&rd.detalle.filter(d=>d[7]==='FAM-7817').reduce((a,d)=>a+d[12],0)===60,'lector: autorizado 0, propuesta 10, base y GTIN');
// copia para autorizacion usa PROPUESTA aunque AUTORIZADO este en 0
ctx.__p={modo:'PRUEBA',campos:{hoja:'ENVIO 21 02/11/26',correo:''}};
const rr=run('wfsAutorizaCopiaForm(__p)');ok(rr.ok&&/8 SKU/.test(rr.lineas.join()),'copia usa PROPUESTA (6 SKU) con AUTORIZADO en 0');
// plantilla y traslado: con AUTORIZADO 0 no mandan nada
ctx.__p={modo:'PRUEBA',campos:{hoja:'ENVIO 21 02/11/26',nombre:'NO',sinGtin:'PARAR'}};
const pl=run('wfsPlantillaForm(__p)');ok(!pl.ok&&/no tiene cantidades en AUTORIZADO/.test(pl.lineas.join()),'plantilla: AUTORIZADO en 0 => no genera');
console.log(p+' OK, '+f+' FALLAS');process.exit(f?1:0);
