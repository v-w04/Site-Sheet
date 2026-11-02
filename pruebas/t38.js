// PreciosErroneos.gs (simulado): regla de precio minimo, killers, libres, asignados, revision de Ventas Walmart. Datos simulados, no es una corrida real.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN};vm.createContext(ctx);
ctx.escrAsegurarFilas_=()=>{};
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const R=s=>vm.runInContext(s,ctx);
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m,d)=>logs.push([k,e,m,d]));ctx.flushLog_=()=>{};ctx.avisoDia_=()=>{};
const props={};ctx.props_=()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=String(v)}});
ctx.TZ='America/Mexico_City';ctx.toast_=()=>{};ctx.LOCK_ESPERA_MS=1;ctx.ahora_=()=>'2026-11-02 12:00:00';ctx.VH_HOJA='Ventas Walmart';ctx.dlgInfo_=()=>{};
ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
ctx.Utilities={formatDate:()=>'30/10'};ctx.SpreadsheetApp={flush:()=>{}};
ctx.sha256_=x=>require('crypto').createHash('sha256').update(String(x)).digest('base64');ctx.normEnc_=s=>String(s===null||s===undefined?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
// libro simulado: hojas como matrices
const libro={};
function Hoja(n){this.n=n;this.d=libro[n]||(libro[n]=[[]]);}
Hoja.prototype={getLastRow(){return this.d.length},getLastColumn(){return Math.max(...this.d.map(r=>r.length),0)},getFrozenRows(){return 1},setFrozenRows(){},
 getRange(r,c,n,w){const d=this.d;w=w||1;return{getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,k)=>{const v=(d[r-1+i]||[])[c-1+k];return v===undefined?'':v})),
  setValues:v=>v.forEach((row,i)=>row.forEach((x,k)=>{d[r-1+i]=d[r-1+i]||[];d[r-1+i][c-1+k]=x}))}}};
ctx.getSpreadsheet_=()=>({getSheetByName:n=>libro[n]?new Hoja(n):null});
ctx.getHoja_=n=>new Hoja(n);
ctx.ubicarColumnas_=(h,enc)=>{const hd=h.d[0];enc.forEach(e=>{if(!hd.some(x=>String(x).toUpperCase()===e.toUpperCase()))hd.push(e)});return{enc,col:Object.fromEntries(hd.map((e,i)=>[String(e).toUpperCase(),i+1]))}};
ctx.escrCol_=(m,e)=>m.col[String(e).toUpperCase()]||0;
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/PreciosErroneos.gs','utf8'),ctx);vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/VentaDiaria.gs','utf8'),ctx);
ctx.kdReintentar_=f=>f();ctx.vdLibro_=()=>ctx.getSpreadsheet_();ctx.vdHoja_=n=>ctx.getHoja_(n);

libro['Precios EM Minimo']=[['Producto','SKU','Walmart Clásica','Walmart Premium'],['a','AAA-1-NEG-1',1000,1100],['b','BBB-2-NEG-2',500,550],['c','CCC-3-NEG-3-OB',800,0]];
libro['Precios CVA Minimo']=[['Producto','SKU','Walmart Clásica','Walmart Premium'],['d','DDD-4-NEG-4-CVA',2000,2100]];
const T=R('peMinimos_()');
t(T.n===4,'lee minimos de EM y CVA por encabezado (con acento)');
const base={tabla:T,killers:{},asig:{},libres:{},acept:{ex:{},base:{},tope:3},modo:'auto'};
const E=(v,c)=>R('peEvaluar_')(Object.assign({sku:'AAA-1-NEG-1',piezas:1,items:1,precio:1000,fecha:new Date(2026,10,3),odoo:[]},v),Object.assign({},base,c||{}));
t(E({}).sem==='OK','precio igual al minimo es OK');
t(E({precio:900}).sem==='BAJO MINIMO'&&E({precio:900}).dif===-100,'precio bajo minimo alerta');
t(E({sku:'AAA-1-NEG-1-MSI',precio:1050}).sem==='BAJO MINIMO'&&E({sku:'AAA-1-NEG-1-MSI',precio:1050}).min===1100,'premium usa la columna Premium');
t(E({sku:'AAA-1-NEG-1-MSI-2',precio:1100}).sem==='OK','variante -MSI-2 hereda el minimo premium');
t(E({sku:'DDD-4-NEG-4-CVA',precio:1500}).sem==='BAJO MINIMO','un -CVA usa su minimo');
t(E({sku:'ZZZ-9-NEG-9-CVA',precio:100}).sem==='SIN REFERENCIA','un -CVA sin minimo no cae al de EM');
t(E({sku:'CCC-3-NEG-3-OB',precio:700}).sem==='BAJO MINIMO'&&E({sku:'EEE-5-NEG-5-OB',precio:700}).sem==='SIN REFERENCIA','open box: el suyo; sin el suyo no toma el del nuevo');
t(E({sku:'RES-AAA',precio:1}).sem==='IGNORADO','prefijo viejo ignorado');
t(E({precio:30}).sem==='INTERNA','precio menor a 50 es interna');
t(E({items:2,precio:100}).sem==='VARIOS ITEMS','varios items no se evaluan');
// varias piezas (auto)
t(E({piezas:2,precio:2100}).sem==='OK','2 piezas, total 2100: unitario ok en las dos lecturas');
t(E({piezas:2,precio:1500}).sem==='REVISAR','2 piezas total 1500: ambiguo (revisar), no alerta');
t(E({piezas:2,precio:900}).sem==='BAJO MINIMO','2 piezas total 900: bajo minimo en las dos lecturas');
t(E({piezas:2,precio:1500},{modo:'unitario'}).sem==='OK'&&E({piezas:2,precio:1500},{modo:'total'}).sem==='BAJO MINIMO','modo unitario/total fuerza una lectura');
// excepciones
const dia=(a,b)=>new Date(2026,10,a,0,0);
t(E({precio:900},{killers:{'AAA-1-NEG-1':[{precio:900,ini:dia(1),fin:dia(5)}]}}).sem==='KILLER','killer vigente a ese precio ese dia');
t(E({precio:900,fecha:dia(20)},{killers:{'AAA-1-NEG-1':[{precio:900,ini:dia(1),fin:dia(5)}]}}).sem==='BAJO MINIMO','killer vencido: alerta');
t(E({precio:900},{killers:{'AAA-1-NEG-1':[{precio:850,ini:dia(1),fin:dia(5)}]}}).sem==='BAJO MINIMO','killer a otro precio: alerta');
t(E({precio:900},{libres:{'AAA-1-NEG-1':true}}).sem==='OK','precio libre no alerta');
t(E({precio:900},{acept:{ex:{'AAA-1-NEG-1':2.5},base:{},tope:3}}).sem==='KILLER'&&E({precio:900},{acept:{ex:{'AAA-1-NEG-1':4},base:{},tope:3}}).sem==='BAJO MINIMO','bajo minimo aceptable (<=3%) si, de 4% no');
t(E({sku:'BBB-2-NEG-2',precio:450},{asig:{'BBB-2-NEG-2':{principal:'AAA-1-NEG-1',grupo:['AAA-1-NEG-1','BBB-2-NEG-2']}}}).min===500,'SKU asignado: el minimo mas bajo del grupo (500 en vez de 1000)');
// revision integral de Ventas Walmart
libro['Ventas Walmart']=[['FOLIO','FECHA','SKU','SKUS ODOO','PIEZAS','ITEMS','PRECIO','CLIENTE'],
 ['609000000000001','2026-10-31 10:00:00','AAA-1-NEG-1','',1,1,500,'x'],        // octubre: no se revisa
 ['609000000000002','2026-11-02 10:00:00','AAA-1-NEG-1','',1,1,900,'x'],        // bajo
 ['609000000000003','2026-11-02 11:00:00','AAA-1-NEG-1','',1,1,1000,'x'],       // ok
 ['609000000000004','2026-11-02 12:00:00','ZZZ-9','',1,1,300,'x']];             // sin ref
libro['Killers']=[['SKU','SKU BASE','NEGOCIADO','CUPON','INICIA','TERMINA'],['AAA-1-NEG-1','AAA-1-NEG-1',900,10,'2026-11-01 00:00:00','2026-11-09 23:59:00']];
let r=R('peCorrer_()');
const H=libro['Ventas Walmart'],ci=n=>H[0].indexOf(n);
t(r.killersNuevos===1&&libro['Killers historico'].length===2,'sincroniza el killer a Killers historico');
t(r.revisadas===3&&r.alertas===0,'revisa solo noviembre; el killer de 900 (vigente) evita la alerta: '+JSON.stringify(r));
t(H[1][ci('SEMAFORO')]===undefined||H[1][ci('SEMAFORO')]==='','octubre queda sin revisar');
t(H[2][ci('SEMAFORO')]==='KILLER'&&H[3][ci('SEMAFORO')]==='OK'&&H[4][ci('SEMAFORO')]==='SIN REFERENCIA','semaforo por venta: '+[2,3,4].map(i=>H[i][ci('SEMAFORO')]));
// sin killer -> alerta, sin duplicar
libro['Killers historico']=[libro['Killers historico'][0]];libro['Killers']=[libro['Killers'][0]];
H[2][ci('SEMAFORO')]='';
r=R('peCorrer_()');
t(r.alertas===1&&libro['Alertas de precio'].length===2,'sin killer: 1 alerta en Alertas de precio');
H[2][ci('SEMAFORO')]='';r=R('peRevisar_()');t(libro['Alertas de precio'].length===2,'la misma alerta no se repite');
t(libro['Alertas de precio'][1][1]==='609000000000002'&&libro['Alertas de precio'][1][6]===900,'la alerta trae folio y precio');
// SIN REFERENCIA se reintenta si ya hay minimo
libro['Precios EM Minimo'].push(['z','ZZZ-9',400,0]);
r=R('peRevisar_()');t(H[4][ci('SEMAFORO')]==='BAJO MINIMO','una venta SIN REFERENCIA se vuelve a revisar cuando aparece el minimo');
// sin minimos
libro['Precios EM Minimo']=[['SKU']];libro['Precios CVA Minimo']=[['SKU']];r=R('peRevisar_()');t(r.sinMinimos===true,'sin minimos no revisa nada');
// registro
['VentaDiaria.gs:preciosErroneosProgramado_','Setup.gs:preciosErroneosRevisar','Setup.gs:ventaDiariaTraerTodo','Organizar.gs:Alertas de precio','Organizar.gs:Killers historico','Organizar.gs:Precio libre','Organizar.gs:SKU asignados'].forEach(x=>{const [f,k]=x.split(':');t(fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8').includes(k),f+' tiene '+k)});
console.log(bad?'FALLAS '+bad:'t38 OK '+ok);process.exit(bad?1:0);
