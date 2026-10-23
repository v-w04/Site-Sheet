// t17 — WFS en Site Sheet: calculo igual a WFS 1.0 (datos reales 23-oct), formulas, nuevo envio, archivar, traer, automatico.
// Correr desde la carpeta pruebas:  node t17.js
const fs=require('fs'),vm=require('vm');
const SITE=__dirname+'/../apps-script', WFS=SITE;
const D=JSON.parse(fs.readFileSync(__dirname+'/datos/wfs_data.json','utf8'));
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
[['WFS',D.wfs51.map(r=>{const x=r.slice();x[5]='';x[6]='';return x})],['Concentrado',D.conc],['Inventario Actual',D.inv],['Variantes',D.var],['Ventas 30 dias',D.vent],['Walmart',D.wm],['Bloqueados',D.blq]].forEach(([n,d])=>ss._add(new Sh(n,d)));
const orig=D.wfs51.map(r=>r.slice());
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
['Wfs.gs','WfsHoja.gs','WfsEnvios.gs'].forEach(n=>vm.runInContext(fs.readFileSync(WFS+'/'+n,'utf8'),ctx,{filename:n}));

// 1) calculo contra la hoja actual de WFS 1.0
const res=vm.runInContext('wfsCalcularHoja_()',ctx);
console.log(res.split('\n').slice(0,14).join('\n'));
const S=sheets.WFS.d;
const bloque=(d,c0,n)=>d.slice(1).map(r=>r.slice(c0-1,c0-1+n)).filter(r=>String(r[0]||'').trim());
const mO=bloque(orig,9,12), mN=bloque(S,9,12), cO=bloque(orig,22,11), cN=bloque(S,22,11);
const idx=a=>{const o={};a.forEach(r=>o[r[0]]=r);return o};
const num=v=>v===''||v==null?'':Number(v);
function cmp(nombre,O,N,cols){const io=idx(O),inn=idx(N);let falt=0,extra=0,dif=0,ejs=[];
  Object.keys(io).forEach(k=>{if(!inn[k]){falt++;return}
    cols.forEach(([c,t])=>{const a=io[k][c],b=inn[k][c];const ig=t==='n'?String(num(a))===String(num(b)):String(a).split(' ·')[0]===String(b).split(' ·')[0]||String(a)===String(b);
      if(!ig){dif++;if(ejs.length<6)ejs.push([k,c,a,b])}})});
  Object.keys(inn).forEach(k=>{if(!io[k])extra++});
  console.log(nombre,'orig',O.length,'nuevo',N.length,'faltan',falt,'extra',extra,'difs',dif);if(ejs.length)console.log(ejs);return {falt,extra,dif}}
const r1=cmp('MSI',mO,mN,[[1,'n'],[2,'n'],[4,'n'],[5,'n'],[7,'n'],[8,'t'],[11,'n']]);
const r2=cmp('CLASICA',cO,cN,[[1,'n'],[2,'n'],[3,'n'],[4,'n'],[6,'n'],[7,'t']]);
ok(r1.falt===0&&r1.extra===0&&r1.dif===0,'MSI: mismos SKU y valores que la hoja de WFS 1.0');
ok(r2.falt===0&&r2.extra===0&&r2.dif===0,'CLASICA: mismos SKU y valores');
ok(sheets.WFS.d[1][18]==='=IF(T2="","",R2-T2)','STOCK DESPUES de MSI con la formula de siempre (S2)');
ok(vm.runInContext('wfsHayEdiciones_(SpreadsheetApp.getActive()).length',ctx)===0,'recien calculado: no hay trabajo a medias');

// 2) formulas de la hoja (mismas columnas que la original)
const fx=vm.runInContext('wfsAsegurarFormulas_(SpreadsheetApp.getActive().getSheetByName("WFS"), true)',ctx);
const F=sheets.WFS.fx;
console.log('formulas escritas',fx.escritas);
ok(fx.escritas===10,'10 formulas escritas');
const L=n=>{let s='';while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s};
const col=l=>l.split('').reduce((a,ch)=>a*26+ch.charCodeAt(0)-64,0);
const at=(l,r)=>F[r+','+col(l)]||'';
ok(/^=\{"SKU","SUM de Cantidad";IFERROR\(QUERY\(\{D2:D400,B2:B400\}/.test(at('F',1)),'F1: ventas por SKU (antes tabla dinamica) sobre D y B');
ok(at('AS',1)==='={"SKU";IFERROR(QUERY({I2:I400,T2:T400},"select Col1 where Col2 is not null and Col2 > 0",0),"");IFERROR(QUERY({V2:V400,AF2:AF400},"select Col1 where Col2 is not null and Col2 > 0",0),"");IFERROR(QUERY({AH2:AH400},"select Col1 where Col1 is not null",0),"")}','AS1 igual que el original (I/T, V/AF, AH)');
ok(/XLOOKUP\(AS2:AS400,INDIRECT\("'Concentrado'!".*"SKU".*"GTIN"/.test(at('AP',1)),'AP1 GTIN del Concentrado por encabezado');
ok(/"CATEGORIA WM"/.test(at('AQ',1))&&/"NOMBRE"/.test(at('AR',1))&&/"DISPONIBLE ODOO"/.test(at('AU',1)),'AQ/AR/AU: CATEGORIA WM, NOMBRE, DISPONIBLE ODOO');
ok(at('AT',2)==='=ARRAYFORMULA(IF(AS2:AS400="","",IFERROR(XLOOKUP(AS2:AS400,F:F,G:G),"")))','AT2 VENDIDAS = F:G (igual que el original)');
ok(at('AV',1)==='=ARRAYFORMULA({"STOCK DESPUES";IF(AU2:AU400="","",IF(AU2:AU400<=0,0,AU2:AU400-IFERROR(VALUE(AX2:AX400),0)))})','AV1 STOCK DESPUES igual que el original');
ok(at('AW',2)==='=ARRAYFORMULA(IF(AS2:AS400="","",IFERROR(XLOOKUP(AS2:AS400,I:I,M:M),IFERROR(XLOOKUP(AS2:AS400,V:V,Y:Y),""))))','AW2 WFS igual (I:M, V:Y)');
ok(at('AX',1).indexOf('XLOOKUP(AS2:AS400,I2:I400,T2:T400)')>0&&at('AX',1).indexOf('XLOOKUP(AS2:AS400,V2:V400,AF2:AF400)')>0&&at('AX',1).indexOf('XLOOKUP(AS2:AS400,AH2:AH400,AI2:AI400)')>0,'AX1 UNIDADES igual (T, AF, AI)');
ok(!at('AY',1)&&!at('AY',2),'AUTORIZADO no se toca');
const fx2=vm.runInContext('wfsAsegurarFormulas_(SpreadsheetApp.getActive().getSheetByName("WFS"), false)',ctx);
ok(fx2.escritas===0,'segunda revision: no reescribe nada');

// 3) ENVIO FINAL -> nuevo envio -> leer la hoja (ida y vuelta) -> archivar
sheets.WFS.d=orig.map(r=>r.slice());   // valores de la hoja original (con ENVIO FINAL ya calculado)
const ef=vm.runInContext('wfsLeerEnvioFinal_(SpreadsheetApp.getActive())',ctx);
const esperado=orig.slice(1).filter(r=>String(r[col('AS')-1]||'').trim()&&Number(String(r[col('AX')-1]).replace(/,/g,''))>0);
console.log('ENVIO FINAL',ef.filas.length,'SKUs',ef.piezas,'pzas, fuente',ef.fuente);
ok(ef.filas.length===esperado.length&&ef.filas.length>0,'ENVIO FINAL leido: '+ef.filas.length+' SKUs (igual que la hoja)');
sheets['CATALOGO CHOFERES']=null;
ss._add(new Sh('CATALOGO CHOFERES',[['CHOFER','CURP','CONTACTO','VECES','ULTIMO ENVIO'],['JUAN PEREZ','PEJU800101','5512345678',3,'ENVIO 19']]));
ss._add(new Sh('CATALOGO CAMIONETAS',[['PLACAS','COLOR','TIPO','VECES','ULTIMO ENVIO'],['C80AFV','BLANCO','NISSAN',3,'ENVIO 19']]));
ss._add(new Sh('HISTORICO ENVIOS',[['ENVIO','ID ENVIO','FECHA CITA','HORA','DELIVERY','FOLIO ODOO','SKU','SKU BASE','GTIN','CATEGORIA','NOMBRE','UNIDADES'],
  ['ENVIO 18 20/09/26','1','20/09/2026','08:00','','','A-MSI','A','001','Audio','X',5],['ENVIO 19 01/10/26','2','01/10/2026','08:00','','','B-MSI','B','002','Audio','Y',7]]));
ss._add(new Sh('HISTORICO CHOFERES',[['ENVIO','CHOFER','CURP','CONTACTO'],['ENVIO 18 20/09/26','PEDRO LOPEZ','LOPE1','551'],['ENVIO 19 01/10/26','JUAN PEREZ','PEJU800101','5512345678']]));
ss._add(new Sh('HISTORICO CAMIONETAS',[['ENVIO','PLACAS','COLOR','TIPO'],['ENVIO 19 01/10/26','C80AFV','BLANCO','NISSAN']]));
const dat=vm.runInContext('wfsDatosNuevoEnvio()',ctx);
ok(dat.siguiente===20&&dat.choferes.length===1&&dat.camionetas.length===1,'datos del dialogo: siguiente envio 20, catalogos leidos');
const rr=vm.runInContext('wfsCrearEnvio({numero:20,etiqueta:"24/10/26",fecha:"2026-10-24",hora:"08:00",choferes:[{nombre:"JUAN PEREZ",curp:"PEJU800101",contacto:"5512345678"}],camionetas:[{placas:"C80AFV",color:"BLANCO",tipo:"NISSAN"}]})',ctx);
console.log(rr.split('\n')[0]);
const he=sheets['ENVIO 20 24/10/26'];ok(!!he,'hoja ENVIO 20 creada');
const lect=vm.runInContext('wfsLeerHojaEnvio_(SpreadsheetApp.getActive().getSheetByName("ENVIO 20 24/10/26"))',ctx);
ok(lect.detalle.length===ef.filas.length&&lect.choferes.length===1&&lect.camionetas.length===1,'la hoja del envio se lee completa: '+lect.detalle.length+' SKUs, 1 chofer, 1 camioneta');
ok(lect.choferes[0][1]==='JUAN PEREZ'&&lect.camionetas[0][1]==='C80AFV'&&lect.camionetas[0][2]==='BLANCO','chofer y placas+color correctos (la cabecera no cuenta como chofer)');

// 3b) archivar: conserva lo que ya estaba
const ra=vm.runInContext('wfsArchivar_(SpreadsheetApp.getActive(), [SpreadsheetApp.getActive().getSheetByName("ENVIO 20 24/10/26")])',ctx);
console.log(ra);
const H=sheets['HISTORICO ENVIOS'].d.filter(r=>r.some(v=>v!==''&&v!=null));
ok(H.length===1+2+lect.detalle.length,'HISTORICO ENVIOS: los 2 de antes + '+lect.detalle.length+' nuevos (no se borro nada)');
ok(H[1][0]==='ENVIO 18 20/09/26'&&H[3][0]==='ENVIO 20 24/10/26','orden: lo archivado antes arriba, lo nuevo abajo');
const CH=sheets['CATALOGO CHOFERES'].d.filter(r=>r[0]);
const juan=CH.find(r=>r[0]==='JUAN PEREZ'), pedro=CH.find(r=>r[0]==='PEDRO LOPEZ');
ok(juan&&juan[3]===2&&pedro&&pedro[3]===1,'catalogo de choferes con todos (Juan 2 veces, Pedro 1)');
ok(!sheets['ENVIO 20 24/10/26'],'la hoja ENVIO 20 se borro despues de archivar');
ss._add(new Sh('ENVIO 20 24/10/26',[['🎉 ID ENVIO','HORA','FECHA','DELIVERY','CHOFER','PLACAS','CAMIONETA','CURP','CONTACTO','','CATEGORIA','NOMBRE','SKU','AUTORIZADO','','SKU'],['','','','','','','','','','','Audio','X','Z-MSI',1,'003','Z']]));
let err='';try{vm.runInContext('wfsArchivar_(SpreadsheetApp.getActive(), [SpreadsheetApp.getActive().getSheetByName("ENVIO 20 24/10/26")])',ctx)}catch(e){err=e.message}
ok(/ya están en HISTORICO ENVIOS/.test(err)&&!!sheets['ENVIO 20 24/10/26'],'archivar otra vez la misma hoja: se niega y no borra nada');

// 4) estado
const est=vm.runInContext('wfsEstadoLineas_()',ctx);console.log(est.join('\n'));
ok(est.length>8&&!est.some(x=>/No pude leer/.test(x)),'estado de WFS sin errores');

// 5) traer de Inventarios WM a un libro sin hoja WFS
const src={_h:{},getSheetByName(n){return this._h[n]||null},getSheets(){return Object.values(this._h)}};
const mk=(n,d)=>{const h=new Sh(n,d);h.getPivotTables=()=>[{remove(){h.d.forEach(r=>{r[5]='';r[6]=''})}}];src._h[n]=h};
mk('WFS',D.wfs51);mk('HISTORICO ENVIOS',[['ENVIO','SKU'],['ENVIO 1','X']]);mk('CATALOGO CHOFERES',[['CHOFER','CURP'],['A','B']]);
ss.deleteSheet(sheets.WFS);ss.deleteSheet(sheets['CATALOGO CHOFERES']);
ctx.SpreadsheetApp.openById=id=>{if(id!=='1roDaZHj44wPWP7O3X2aoDU6VTEaZMmjCFfWbgcToIQI')throw new Error('id');return src};
const tr=vm.runInContext('wfsTraer_()',ctx);console.log(tr);
ok(!!sheets.WFS&&sheets.WFS.d[1][3]==='HP-14DQ6015DX-ROS-1222-MSI','hoja WFS copiada con lo que tenia');
ok(/ya existía aquí, no la toqué/.test(tr)&&sheets['HISTORICO ENVIOS'].d.length>3,'HISTORICO que ya existia aqui no se toca');
ok(!!sheets['CATALOGO CHOFERES']&&sheets['CATALOGO CHOFERES'].d[1][0]==='A','CATALOGO CHOFERES copiado');
ok(sheets.WFS.fx['1,45']&&sheets.WFS.fx['1,6'],'formulas escritas en la hoja copiada (AS1 y F1)');
// 6) sin acceso a Inventarios WM: hoja vacia con el mismo formato
ss.deleteSheet(sheets.WFS);ctx.SpreadsheetApp.openById=()=>{throw new Error('sin acceso')};
const tr2=vm.runInContext('wfsTraer_()',ctx);console.log(tr2.split('\n').slice(0,3).join('\n'));
ok(!!sheets.WFS&&sheets.WFS.d[0].length===51&&sheets.WFS.fx['1,45'],'sin acceso: hoja WFS vacia con sus 51 encabezados y formulas');
// 7) vuelta automatica: pausa si hay trabajo a mano
sheets.WFS=null;ss.deleteSheet(ss.getSheets().find(h=>h.getName()==='WFS'));ss._add(new Sh('WFS',D.wfs51.map(r=>{const x=r.slice();x[5]='';x[6]='';return x})));
vm.runInContext('wfsAuto()',ctx);
let e1=JSON.parse(props.WFS_AUTO_ESTADO);ok(e1.estado==='OK','vuelta automatica OK con la hoja limpia');
sheets.WFS.d[1][19]=999;   // Envio a mano
vm.runInContext('wfsAuto()',ctx);
let e2=JSON.parse(props.WFS_AUTO_ESTADO);ok(e2.estado==='PAUSADA'&&sheets.WFS.d[1][19]===999,'con Envio a mano: PAUSADA y no toca nada');
console.log(p+' OK '+f+' FALLA');
