// t121: hoja "Precios a mano" (27-nov, ella): los SKU sin precio del site se anotan solos, ella pone el PRECIO A CARGAR y sale tal cual en EXPORTAR y en el archivo de Walmart. Nada real.
process.env.TZ='America/Mexico_City';
const fs=require('fs'),vm=require('vm');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp,Error};vm.createContext(ctx);
const cargar=f=>vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/'+f,'utf8'),ctx);
cargar('Columnas.gs');
ctx.peNum_=v=>{if(typeof v==='number')return v;const n=Number(String(v==null?'':v).replace(/[$,%\s]/g,''));return isNaN(n)?0:n};
ctx.VD_ETAPA='VENTA_DIARIA';ctx.vdProp_=()=>'';
cargar('ExportarPrecios.gs');
// --- piezas puras
const tabla={R:['A-1','A-2','A-3','A-3-MSI'],S:[100,'',0,'']};
t(JSON.stringify(ctx.exFaltantes_(tabla))===JSON.stringify(['A-2','A-3','A-3-MSI']),'faltantes = vacio, 0 o error (no los que ya traen precio)');
const mano=ctx.exManoDe_([['a-2',1299],['A-3','$1,500'],['A-4',0],['A-5',''],['#REF!',100],['A-6','texto'],['',50]]);
t(mano['a-2']===1299&&mano['a-3']===1500&&!('a-4' in mano)&&!('a-5' in mano)&&!('a-6' in mano)&&Object.keys(mano).length===2,'solo cuentan precios mayores a 0 (vacio, 0, texto y errores no)');
const f=ctx.exFilas_('EXPORTAR',tabla,mano);
t(JSON.stringify(f[0])==='["A-1",100,98,99]','con precio del site: igual que siempre (-2% y termina en 9)');
t(JSON.stringify(f[1])==='["A-2",1299,1299,1299]'&&JSON.stringify(f[2])==='["A-3",1500,1500,1500]','sin precio del site y con el tuyo: sale TAL CUAL (sin -2% ni redondeo a 9)');
t(JSON.stringify(f[3])==='["A-3-MSI","","",""]','sin precio y sin el tuyo: sigue vacio (se salta en el archivo)');
t(JSON.stringify(ctx.exFilas_('MINIMO',tabla,mano)[1])==='["A-2",""]','MINIMO no se inventa: esos SKU siguen sin minimo');
t(JSON.stringify(ctx.exFilas_('EXPORTAR',{R:['A-1'],S:[100]},{'a-1':5})[0])==='["A-1",100,98,99]','el precio del site GANA al tuyo');
t(JSON.stringify(ctx.exFilas_('EXPORTAR',{R:['X'],S:[100]}))==='[["X",100,98,99]]','sin hoja de precios a mano funciona igual');
// filas de la hoja: lo que ya estaba conserva su lugar, lo nuevo va al final
const fl=ctx.exManoFilas_(['A-3','Z-9'],['A-2','A-3']);
t(JSON.stringify(fl.map(x=>x[0]))==='["A-3","Z-9","A-2"]','las filas que ya estaban NO se mueven (tus precios quedan junto a su SKU); lo nuevo va al final');
t(fl[0][1]===ctx.EXP.MOTIVO_SIN&&fl[1][1]===ctx.EXP.MOTIVO_YA&&fl[2][1]===ctx.EXP.MOTIVO_SIN,'motivo: sin precio / ya tiene precio del site');
// --- lectura de la hoja por encabezado (aunque muevas columnas)
let hoja=null;
ctx.peTabla_=n=>{if(n!=='Precios a mano'||!hoja)return null;const pos={};hoja[0].forEach((x,i)=>{pos[String(x).toUpperCase()]=i});return{enc:hoja[0],pos,filas:hoja.slice(1)}};
ctx.peCol_=(tb,ns)=>{for(const n of ns){const j=tb.pos[String(n).toUpperCase()];if(j!==undefined)return j}return -1};
t(ctx.exManoLeer_().skus.length===0,'sin hoja: vacio');
hoja=[['NOTA','PRECIO A CARGAR','SKU WALMART','MOTIVO'],['x',1299,'A-2','m'],['',null,'A-3','m'],['y','',' A-7 ','m']];
let r=ctx.exManoLeer_();
t(JSON.stringify(r.skus)==='["A-2","A-3","A-7"]'&&r.mano['a-2']===1299&&Object.keys(r.mano).length===1,'lee por encabezado aunque las columnas esten movidas');
// --- el archivo de Walmart usa tu precio aunque EXPORTAR no se haya recalculado
ctx.TZ='UTC';ctx.WM_MULT_TACHADO=1.3;ctx.WM_MIN_ADELANTO=7;ctx.WM_HORAS_UTC=6;
ctx.wmAUtc_=d=>new Date(d.getTime()+6*3600000);
const AHORA=new Date(Date.UTC(2026,10,27,20,30,0));ctx.wmAhoraMasMinutos_=m=>new Date(AHORA.getTime()+m*60000);
const hojas={};
const mk=(enc,filas)=>({getLastRow:()=>filas.length+1,getLastColumn:()=>enc.length,getName:()=>'x',getRange:(rr,c,nr)=>({getValues:()=>rr===1?[enc]:filas.slice(rr-2,rr-2+nr)})});
ctx.getHoja_=n=>hojas[n];
cargar('SubidaPrecios.gs');
hojas['EXPORTAR']=mk(['SKU WALMART','PRECIO FINAL','PRECIO -2%','PRECIO CARGA'],[['A-1',100,98,99],['A-2','','',''],['A-3','','',''],['A-9',0,0,0]]);
const p=ctx.spFilasPrecios_();
t(p.filas.length===2&&p.filas[0][3]==='A-1'&&p.filas[1][3]==='A-2'&&p.filas[1][8]===1299,'A-2 entra al archivo con TU precio (promo 1299)');
t(p.filas[1][5]===1688.7,'y su precio tachado es tu precio x 1.3');
t(p.saltadas.length===2&&/A-3.*Precios a mano/.test(p.saltadas.join('|'))&&/A-9/.test(p.saltadas.join('|')),'A-3 (sin precio tuyo) y A-9 se saltan y dicen donde ponerlo');
// --- registro (orden y unidad) y que el script nunca pise TU columna
const org=fs.readFileSync(__dirname+'/../apps-script/Organizar.gs','utf8');
t(/\['Precios a mano',\s+'PRECIOS'/.test(org),'registrada en Organizar (familia PRECIOS)');
const ex=fs.readFileSync(__dirname+'/../apps-script/ExportarPrecios.gs','utf8');
t(/vdEscribir_\(h, \['SKU WALMART', 'MOTIVO'\]/.test(ex),'el script solo escribe SKU WALMART y MOTIVO; PRECIO A CARGAR queda tuyo');
console.log(bad?('FALLAN '+bad):('t121 ok '+ok));process.exit(bad?1:0);
