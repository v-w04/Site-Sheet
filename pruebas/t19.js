// t19 — WFS en Site Sheet: calculo igual a WFS 1.0 (datos reales 23-oct), formulas, nuevo envio, archivar, traer, automatico.
// Correr desde la carpeta pruebas:  node t17.js
const fs=require('fs'),vm=require('vm');
const SITE=__dirname+'/../apps-script', WFS=SITE;
let p=0,f=0;const ok=(c,m)=>{c?p++:f++;console.log(c?'OK':'FALLA',m)};
const noop=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?undefined:noop(),apply:()=>noop()});
class Sh{constructor(n,d){this.n=n;this.d=d.map(r=>r.slice());this.fx={};this.max=Math.max(this.d.length,300);this.oculta=false}
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
['Wfs.gs','WfsHoja.gs','WfsEnvios.gs','WfsChoferes.gs','WfsTraslado.gs'].forEach(n=>vm.runInContext(fs.readFileSync(WFS+'/'+n,'utf8'),ctx,{filename:n}));

const run=c=>vm.runInContext(c,ctx);
const ENC=run('WFS_ENV_ENC');
const ix=(n,o)=>{let k=0;for(let i=0;i<ENC.length;i++)if(ENC[i]===n&&++k===(o||1))return i};
const mkEnvio=(nom,det,delivery)=>{const d=[ENC.slice()];const r2=new Array(ENC.length).fill('');r2[ix('DELIVERY')]=delivery;r2[ix('FECHA')]='2026-10-28';r2[ix('HORA')]='08:00';r2[ix('CHOFER')]='PROMOTORA RESTREPO';d.push(r2);
 det.forEach((x,i)=>{const r=i===0?r2:new Array(ENC.length).fill('');if(i===0){}else d.push(r);
  r[ix('SKU')]=x[0];r[ix('AUTORIZADO')]=x[1];r[ix('PROPUESTA')]=x[1];r[ix('SKU BASE')]=x[0].replace(/-MSI(-\d)?$/,'')});
 const h=new Sh(nom,d);ss._add(h);return h};
mkEnvio('ENVIO 20 28/10/26',[['AAA-111-MSI',10],['BBB-222-MSI',5],['AAA-111',3],['CCC-333-MSI',0],['ZZZ-999-MSI',2]],'DLV123');
ss.getActiveSheet=()=>sheets['ENVIO 20 28/10/26'];
const calls=[];let creados=0;
ctx.odooAuth_=()=>7;
ctx.odooExecute_=(m,me,a,k)=>{calls.push(m+'.'+me);
 if(me==='check_access_rights')return true;
 if(m==='stock.location')return [{id:(JSON.stringify(a).indexOf('W-ELE')>=0?200:100)}];
 if(m==='res.partner')return [{id:55}];
 if(m==='product.product'){const q=a[0][0][2];return q.filter(s=>s!=='ZZZ-999').map((s,i)=>({id:1000+i,default_code:s,uom_id:[1,'Unidades']}))}
 if(m==='stock.picking'&&me==='create'){creados++;ctx.__v=a[0];return 77}
 if(m==='stock.move'&&me==='create'){ctx.__mv=a[0];return [1,2]}
 if(m==='stock.picking'&&me==='search_read')return [{name:'W-ELE/INT/00099',state:'confirmed'}];
 return true};
ctx.Utilities.sleep=()=>{};ctx.Utilities.formatDate=(d,z,f)=>'2026-10-27 12:00:00';
const form=(modo,extra)=>{ctx.__p={modo,campos:Object.assign({hoja:'ENVIO 20 28/10/26',doc:'DLV123',fecha:'2026-10-28 08:00',contacto:'WALMART WFS',faltantes:'PARAR'},extra||{})};return run('wfsTrasladoForm(__p)')};
// lineas
const li=run("wfsTrLineas_(SpreadsheetApp.getActive().getSheetByName('ENVIO 20 28/10/26'))");
console.log(JSON.stringify(li));
ok(li.lineas.length===3&&li.lineas[0].sku==='AAA-111'&&li.lineas[0].qty===10&&li.noWfs.length===1&&li.noWfs[0].sku==='AAA-111','lineas por SKU base: solo premium (la clasica AAA-111 queda fuera), omite 0');
// revisar
let r=form('PRUEBA');console.log(r.lineas.join('\n'));
ok(!r.ok&&creados===0&&/ZZZ-999/.test(r.lineas.join()),'revisar: avisa SKU sin match y NO crea');
// real con PARAR
r=form('REAL');ok(!r.ok&&creados===0,'crear con faltantes y PARAR: no crea nada');
// sin doc
r=form('REAL',{doc:''});ok(!r.ok&&/Documento origen/.test(r.lineas[0]),'sin documento origen: no hace nada');
r=form('REAL',{fecha:'mañana'});ok(!r.ok&&/fecha/.test(r.lineas[0]),'fecha mala: no hace nada');
// real con OMITIR
r=form('REAL',{faltantes:'OMITIR'});console.log(r.lineas.join('\n'));
ok(r.ok&&creados===1&&ctx.__v.picking_type_id===19&&ctx.__v.origin==='DLV123'&&ctx.__v.partner_id===55&&ctx.__v.location_id===100&&ctx.__v.location_dest_id===200,'crea el picking con tipo 19, origen, contacto y ubicaciones');
ok(ctx.__mv.length===2&&ctx.__mv[0].product_uom_qty===10&&ctx.__mv[1].product_uom_qty===5,'moves: una linea por SKU base con cantidad AUTORIZADO');
ok(calls.indexOf('stock.picking.action_confirm')>=0,'lo deja Por realizar (action_confirm)');
const hh=sheets['Traslados Odoo'];
ok(hh&&hh.d.length===3&&hh.d[1][1]==='W-ELE/INT/00099'&&hh.d[1][13]==='ENVIO 20 28/10/26','queda en la hoja Traslados Odoo');
// no duplica
r=form('REAL',{faltantes:'OMITIR'});
ok(!r.ok&&creados===1&&/Ya se cre/.test(r.lineas[0]),'segundo intento del mismo envio: no crea otro');
// permiso
ss.getSheetByName('Traslados Odoo').d.length=1;
const old=ctx.odooExecute_;ctx.odooExecute_=(m,me,a,k)=>me==='check_access_rights'?false:old(m,me,a,k);
r=form('REAL',{faltantes:'OMITIR'});ok(!r.ok&&/no tiene permiso/.test(r.lineas[0]),'sin permiso de crear: lo dice y no crea');
ctx.wfsLeerEnvioFinal_=()=>({filas:[{sku:'AAA-111-MSI',cant:4},{sku:'BBB-222-MSI',cant:6},{sku:'ZZZ-999-MSI',cant:1}],piezas:11});
ctx.odooExecute_=old; creados=0;
r=form('PRUEBA',{hoja:'__PROPUESTA',doc:'X'});console.log(r.lineas.join('\n'));
ok(/Propuesta WFS: 3 SKU base/.test(r.lineas[0])&&creados===0,'revisar con la propuesta (sin hoja ENVIO): lee el ENVIO FINAL y no crea');
r=form('REAL',{hoja:'__PROPUESTA',doc:'X',faltantes:'OMITIR'});
ok(!r.ok&&creados===0&&/primero crea la hoja ENVIO/.test(r.lineas[0]),'crear con la propuesta: no deja');
// exceso de stock: AUTORIZADO mayor a lo libre en Odoo se avisa (sin bloquear)
ctx.wfsLibreOdoo_=()=>({'AAA-111':4,'BBB-222':50});
const ex=run("wfsExcedeStock_([{sku:'AAA-111',qty:10},{sku:'BBB-222',qty:5},{sku:'NOEXISTE',qty:9}])");
ok(ex.length===1&&/AAA-111 \(autorizado 10, libre 4\)/.test(ex[0]),'aviso: solo AAA-111 pasa de lo libre (BBB alcanza, el que no esta en inventario no avisa)');
ctx.wfsLibreOdoo_=()=>null;
ok(run("wfsExcedeStock_([{sku:'AAA-111',qty:10}])").length===0,'sin lectura de inventario: no inventa avisos');
// TOPE: se limita a lo libre, quitando de las ultimas filas; no omite el SKU
ctx.wfsLibreOdoo_=()=>({'AAA-111':4,'BBB-222':50,'CCC-333':0});
const tp=run("wfsAplicaTope_([['h','','','','','','AAA-111-MSI','AAA-111','g','c','n',3],['h','','','','','','AAA-111-MSI-2','AAA-111','g','c','n',7],['h','','','','','','BBB-222-MSI','BBB-222','g','c','n',5],['h','','','','','','CCC-333-MSI','CCC-333','g','c','n',2]])");
ok(tp.det[0][11]===3&&tp.det[1][11]===1&&tp.det[2][11]===5&&tp.det[3][11]===0,'tope: AAA 10 -> 4 (3+1), BBB igual, CCC libre 0 -> 0');
ok(tp.topes.length===2&&/AAA-111 \(autorizado 10 → 4\)/.test(tp.topes[0]),'tope: avisa AAA y CCC');
ctx.wfsLibreOdoo_=()=>null;
ok(run("wfsAplicaTope_([['h','','','','','','A-MSI','A','g','c','n',9]])").det[0][11]===9,'tope: sin lectura de inventario no toca nada');
console.log(p+' OK '+f+' FALLA');
