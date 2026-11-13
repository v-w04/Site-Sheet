// t68: buzon de Seller Center, SOLO ultima semana (la fecha de cada fila sale sola en su linea: Hoy / Ayer / MM/DD/AAAA).
const fs=require('fs'),vm=require('vm'),path=require('path');
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const bg=fs.readFileSync(path.join(__dirname,'..','extension-cookie','background.js'),'utf8').replace(/\r\n/g,'\n');
const src=bg.slice(bg.indexOf('async function enSellerBuzon'),bg.indexOf('// Casos: devuelve el texto'));
const hoyD=new Date();hoyD.setHours(0,0,0,0);
const fmt=n=>{const d=new Date(hoyD);d.setDate(d.getDate()-n);return String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0')+'/'+d.getFullYear();};
const corre=(texto)=>{
  let k=0;const RD=Date;
  const D=class extends RD{static now(){k+=3000;return 1e12+k;}};
  const sb={Date:D,Number,Math,String,Promise,RegExp,setTimeout:(f)=>f(),location:{hostname:'seller.walmart.com',pathname:'/seller-communication/Customer',href:'https://seller.walmart.com/seller-communication/Customer?status=UNREAD&start=1'},document:{body:{innerText:texto}}};
  vm.createContext(sb);return vm.runInContext('('+src+')(20000,"status=UNREAD")',sb);
};
const lista=(ds)=>'Bandeja\n1-25 of 2957\n'+ds.map(d=>'Asunto x\n'+d+'\nTexto').join('\n');
(async()=>{
  const a=await corre(lista(['Hoy','Ayer',fmt(3),fmt(7),fmt(8),'10/29/2024']));
  t(a.total===2957&&a.recientes===4&&a.fechas===6&&a.todasRecientes===false,'cuenta hoy, ayer y hasta 7 dias; lo viejo no: '+JSON.stringify(a));
  const b=await corre('1-4 of 4\nx\n11/05/2020\nx\n12/29/2024\n');
  t(b.total===4&&b.recientes===0,'4 mensajes viejos = 0 en la ultima semana: '+JSON.stringify(b));
  const c=await corre(lista(['Hoy','Ayer']));
  t(c.recientes===2&&c.todasRecientes===true,'toda la pagina reciente: pide la siguiente');
  const d=await corre('0 of 0\nNo messages');
  t(d.total===0&&d.recientes===0&&d.fechas===0,'buzon vacio: 0');
  t(/r\.fechas === 0\) return null/.test(bg)&&/pag < 8/.test(bg),'sin fechas no inventa numero; maximo 8 paginas');
  t(!/\.click\(|\.submit\(/.test(src),'solo lee, sin clic');
  console.log('t68: '+ok+' ok'+(bad?', '+bad+' FALLAN':''));process.exit(bad?1:0);
})();
