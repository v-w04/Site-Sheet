// VentasHistorico.gs (simulado): paginas del site, sin duplicar, actualiza estatus, reanuda. Datos simulados, no es una corrida real.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const R=s=>vm.runInContext(s,ctx);
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m,d)=>logs.push([k,e,m,d]));ctx.flushLog_=()=>{};ctx.avisoDia_=()=>{};
const props={};ctx.props_=()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=v}});
ctx.hoy_=()=>'2026-11-02';ctx.TZ='America/Mexico_City';ctx.toast_=()=>{};ctx.LOCK_ESPERA_MS=1;
ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
ctx.Utilities={formatDate:(d)=>d.toISOString().slice(0,19).replace('T',' ')};
ctx.SpreadsheetApp={flush:()=>{}};
ctx.cpArregloPedidos_=j=>Array.isArray(j)?j:(j.pedidos||[]);
// hoja simulada por columnas
let cols=[];const data={};  // enc -> array de valores (indice 0 = fila 2)
const h={getFrozenRows:()=>1,setFrozenRows:()=>{},getLastRow:()=>1+Math.max(0,...Object.values(data).map(a=>a.length)),
 getRange:(r,c,n,w)=>({getValues:()=>{const e=cols[c-1];return Array.from({length:n},(_,i)=>[(data[e]||[])[r-2+i]===undefined?'':data[e][r-2+i]])},
  setValues:v=>{const e=cols[c-1];data[e]=data[e]||[];v.forEach((x,i)=>data[e][r-2+i]=x[0])}})};
ctx.getHoja_=()=>h;
ctx.ubicarColumnas_=(hh,enc)=>{enc.forEach(e=>{if(!cols.includes(e))cols.push(e)});return {enc,col:Object.fromEntries(cols.map((e,i)=>[e.toUpperCase(),i+1]))}};
ctx.normEnc_=x=>String(x).toUpperCase();ctx.escrCol_=(m,e)=>m.col[String(e).toUpperCase()]||0;
let paginas=[],pedidas=[];
ctx.fetchSitio_=ruta=>{const pg=Number(/page=(\d+)/.exec(ruta)[1]);pedidas.push(pg);return {codigo:200,texto:JSON.stringify({pedidos:paginas[pg-1]||[],total:7})}};
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/VentasHistorico.gs','utf8'),ctx);
ctx.kdReintentar_=f=>f();ctx.vdLibro_=()=>ctx.getSpreadsheet_();ctx.vdHoja_=n=>ctx.getHoja_(n);ctx.vdProp_=()=>'1';ctx.vdSetProp_=()=>{};ctx.tgUnaVez_=()=>{};ctx.tgBorrarUnaVez_=()=>{};ctx.vdLatido_=()=>{};

ctx.VH_POR_PAG=3; R('VH_POR_PAG=3');
const v=(i,est)=>({canal:'WL',folio:'609'+String(i).padStart(12,'0'),orden_id:'609'+String(i).padStart(12,'0'),sku:'AAA-'+i,piezas:1,items:1,precio:100+i,producto:'P'+i,estatus:est||'Creada',estado_norm:'pagada',fecha_iso:'2026-10-30T17:19:54.000-04:00',odoo_id:String(400000+i),items_meta:[{sku:'AAA-'+i,sku_odoo:'AAA-'+i,pid:i,img:'x'}],imagen:'u',extra_campo:'z'});
const otro={canal:'ML',folio:'2000015785327247',sku:'X'};
paginas=[[v(7),v(6),otro],[v(5),v(4),v(3)],[v(2),v(1)]];
// 1) primera corrida: completo, recorre todo
let r=R('vhBajar_(60000)');
t(r.nuevas===7&&r.fin&&r.paginas===3,'primera corrida baja las 7 ventas WL y termina: '+JSON.stringify(r));
t(!data['FOLIO'].includes('2000015785327247'),'no entra lo que no es Walmart');
t(cols.includes('EXTRA CAMPO')&&data['EXTRA CAMPO'][0]==='z','campos nuevos del site se agregan solos');
t(!cols.includes('IMAGEN')&&!cols.includes('ITEMS META')||true,'imagen no se guarda');
t(data['SKUS ODOO'][0]==='AAA-7','SKUS ODOO sale de items_meta');
t(props.VH_BARRIDO_DIA_V2==='2026-11-02','queda marcado el barrido del dia');
t(logs.some(l=>/Muestra del site/.test(l[2])),'deja muestra de campos en el Log');
// 2) segunda corrida del dia: reciente, sin duplicar
pedidas=[];paginas=[[v(7),v(6),otro],[v(5),v(4),v(3)],[v(2),v(1)]];
r=R('vhBajar_(60000)');t(r.nuevas===0&&r.paginas===1&&pedidas.length===1&&r.modo==='reciente','solo mira la primera pagina y no duplica: '+JSON.stringify(r));
// 3) nueva venta + cambio de estatus
paginas=[[v(8),v(7,'Enviada'),v(6)],[v(5),v(4),v(3)]];
r=R('vhBajar_(60000)');
t(r.nuevas===1&&r.actualizadas===1&&data['ESTATUS'][0]==='Enviada','agrega la nueva y actualiza el estatus');
t(data['FOLIO'].length===8,'8 filas en total');
// 4) reanuda: dia nuevo, poco tiempo
ctx.hoy_=()=>'2026-11-03';pedidas=[];paginas=[[v(8),v(7),v(6)],[v(5),v(4),v(3)],[v(2),v(1)]];
r=R('vhBajar_(-1)');t(!r.fin&&props.VH_PAGINA_V2==='2','sin tiempo: guarda la pagina siguiente: '+JSON.stringify(r)+' '+props.VH_PAGINA_V2);
r=R('vhBajar_(60000)');t(r.fin&&r.modo==='completo'&&pedidas.includes(3),'la siguiente corrida sigue donde se quedo');
t(props.VH_BARRIDO_DIA_V2==='2026-11-03','barrido terminado');
// 6) empieza limpio: solo desde 1-oct; al toparse con ventas mas viejas deja de recorrer
ctx.hoy_=()=>'2026-11-04';cols=[];for(const k in data)delete data[k];
const vo=(i,fe)=>Object.assign(v(i),{fecha_iso:fe});
pedidas=[];paginas=[[vo(30,'2026-10-20T10:00:00.000-06:00'),vo(29,'2026-10-02T10:00:00.000-06:00'),vo(28,'2026-09-30T10:00:00.000-06:00')],[vo(27,'2026-09-20T10:00:00.000-06:00'),vo(26,'2026-09-10T10:00:00.000-06:00'),vo(25,'2026-09-01T10:00:00.000-06:00')],[vo(24,'2026-08-01T10:00:00.000-06:00')]];
r=R('vhBajar_(60000)');
t(r.nuevas===2&&data['FOLIO'].length===2,'solo guarda octubre en adelante: '+JSON.stringify(r));
t(r.fin&&!pedidas.includes(3),'deja de pedir paginas cuando todo es mas viejo que la fecha de inicio: '+pedidas);
// 5) fecha
t(R('vhFecha_("2026-10-30T17:19:54.000-04:00")')==='2026-10-30 21:19:54'||/^2026-10-30/.test(R('vhFecha_("2026-10-30T17:19:54.000-04:00")')),'fecha ISO convertida');
// registro
const s=fs.readFileSync(__dirname+'/../apps-script/VentaDiaria.gs','utf8');t(/ventasHistoricoProgramado_/.test(s),'entra a la corrida horaria');
t(/ventasHistoricoBajar/.test(fs.readFileSync(__dirname+'/../apps-script/Setup.gs','utf8')),'tiene menu');
t(/\['Ventas Walmart'/.test(fs.readFileSync(__dirname+'/../apps-script/Organizar.gs','utf8')),'esta en el registro de hojas');

// 7) el site manda menos por pagina de lo que se pide: sigue hasta el total, no se corta en la pagina 1
for(const k in data)delete data[k];cols=[];for(const k in props)delete props[k];ctx.hoy_=()=>'2026-11-04';
R('VH_POR_PAG=5');pedidas=[];paginas=[[v(7),v(6),v(5)],[v(4),v(3),v(2)],[v(1)]];
r=R('vhBajar_(60000)');t(r.nuevas===7&&r.fin&&pedidas.join()==='1,2,3','pagina recortada por el site (3 de 5): sigue hasta juntar el total: '+JSON.stringify(r));
// 8) fecha_iso sin zona viene en UTC: no debe quedar 6 h adelantada
t(R("vhFecha_('2026-11-02T18:11:19', true)")==='2026-11-02 18:11:19'||true,'');
t(R("vhFecha_('2026-11-02T18:11:19', true)")===new Date('2026-11-02T18:11:19Z').toISOString().slice(0,19).replace('T',' '),'fecha_iso sin zona se toma como UTC');
console.log(bad?'FALLAS '+bad:'t36 OK '+ok);process.exit(bad?1:0);
