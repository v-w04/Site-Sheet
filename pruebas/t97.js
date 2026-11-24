// t97: SubidaPrecios.gs (24-nov): archivos de precios (EXPORTAR) y killers (Killers activos) como los arma ella a mano. Nada real.
process.env.TZ='America/Mexico_City';
const fs=require('fs'),vm=require('vm');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,RegExp,Error};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/Columnas.gs','utf8'),ctx);
const hojas={};
const mk=(enc,filas)=>({getLastRow:()=>filas.length+1,getLastColumn:()=>enc.length,getName:()=>'x',
  getRange:(r,c,nr,nc)=>({getValues:()=>r===1?[enc]:filas.slice(r-2,r-2+nr)})});
ctx.getHoja_=n=>hojas[n];
ctx.TZ='UTC';ctx.WM_MULT_TACHADO=1.3;ctx.WM_MIN_ADELANTO=7;ctx.WM_HORAS_UTC=6;
ctx.Utilities={formatDate:(d)=>d.toISOString().slice(0,16).replace('T',' ')};
ctx.wmAUtc_=d=>new Date(d.getTime()+6*3600000);
const AHORA=new Date(Date.UTC(2026,10,24,16,31,0));
ctx.wmAhoraMasMinutos_=m=>new Date(AHORA.getTime()+m*60000);
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/SubidaPrecios.gs','utf8'),ctx);
// precios
hojas['EXPORTAR']=mk(['SKU WALMART','PRECIO FINAL','PRECIO -2%','PRECIO CARGA'],[['A-1',100,98,99],['A-2',0,0,0],['A-1',1,1,1],['A-3',20339,19932.22,19939]]);
const p=ctx.spFilasPrecios_();
t(p.filas.length===2&&p.saltadas.length===1&&/A-2/.test(p.saltadas[0]),'precios: 2 filas, A-2 sin precio saltada, A-1 repetida no se duplica');
const f=p.filas[1];
t(f[3]==='A-3'&&f[5]===25920.7&&f[8]===19939&&f[6]==='Reemplazar todo'&&f[7]==='Rebaja'&&f.length===11,'fila igual a la de su Precio.xlsx (DJI: 19939 -> 25920.7)');
t(+f[9]===AHORA.getTime()+7*60000+6*3600000,'inicio = ahora + 7 min, en UTC');
const fin=p.filas[0][10];t(fin.getDate()===1&&fin.getHours()===5&&fin.getMinutes()===59,'fin 23:59 hora Mexico = 05:59 UTC (ultimo dia del mes siguiente)');
// killers
const D=(y,m,d,h,mi)=>new Date(Date.UTC(y,m-1,d,h,mi));
hojas['Killers activos']=mk(['SKU','Precio negociado','Inicio de la oferta','Fecha formato'],[
 ['K-1',7549,D(2026,11,24,0,0),D(2026,12,2,5,59)],['K-2',0,D(2026,11,24,0,0),D(2026,12,2,5,59)],
 ['K-3',500,D(2026,11,1,0,0),D(2026,11,20,5,59)],['K-4',900,D(2026,11,30,0,0),D(2026,12,8,5,59)],['K-5',800,D(2026,11,24,0,0),'']]);
const k=ctx.spFilasKillers_();
t(k.filas.length===2&&k.saltadas.length===3,'killers: K-1 y K-4 entran; sin precio, vencido y sin fecha se saltan');
t(+k.filas[0][10]===D(2026,12,2,5,59).getTime(),'fin = Fecha formato TAL CUAL (ya es UTC, no se le suman 6 h)');
t(+k.filas[0][9]===AHORA.getTime()+7*60000+6*3600000&&k.filas[0][8]===7549&&k.filas[0][5]===9813.7,'killer: inicio ahora+7, promo = negociado, precio = x1.3');
t(+k.filas[1][9]===D(2026,11,30,0,0).getTime()+6*3600000,'killer que arranca despues respeta su inicio');
// prueba
ctx.spPrueba=ctx.spArmar_('prueba');t(ctx.spPrueba.filas.length<=2,'prueba: maximo 2 SKUs');
const src=fs.readFileSync(__dirname+'/../apps-script/WebAPI.gs','utf8');
t(/sub_preparar'\) return json_\(spPreparar_/.test(src)&&/sub_resultado'\) return json_\(spRecibirResultado_/.test(src),'rutas del Web App');
console.log(bad?('FALLAN '+bad):('t97 ok '+ok));process.exit(bad?1:0);
