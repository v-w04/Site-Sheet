// Killers activos, Comparar Walmart, Casos Walmart y EXPORTAR (simulado). Datos simulados, no es una corrida real.
const fs=require('fs'),vm=require('vm');
const ctx={console,JSON,Date,Object,Array,String,Number,Math,isNaN,Infinity};vm.createContext(ctx);
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
const R=s=>vm.runInContext(s,ctx);
const logs=[];['Info','Ok','Warn','Err'].forEach(k=>ctx['log'+k+'_']=(e,m,d)=>logs.push([k,e,m,d]));ctx.flushLog_=()=>{};ctx.avisoDia_=()=>{};
const props={};ctx.props_=()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=String(v)}});
ctx.TZ='America/Mexico_City';ctx.toast_=()=>{};ctx.LOCK_ESPERA_MS=1;ctx.ahora_=()=>'2026-11-02 12:00:00';
ctx.VH_HOJA='Ventas Walmart';ctx.CD_HOJA='Cobro distinto';ctx.WD_HOJA='Walmart';ctx.WD_HOJA_BLOQ='Bloqueados';ctx.PAR_HOJA_ESTADO='Estado Killers';
ctx.dlgInfo_=()=>{};ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
ctx.Utilities={formatDate:(d,z,f)=>f==='dd/MM'?String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'):'x'};ctx.SpreadsheetApp={flush:()=>{}};
ctx.sha256_=x=>require('crypto').createHash('sha256').update(String(x)).digest('base64');ctx.normEnc_=s=>String(s===null||s===undefined?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
const libro={};
function Hoja(n){this.n=n;this.d=libro[n]||(libro[n]=[[]]);}
Hoja.prototype={getLastRow(){return this.d.length},getLastColumn(){return Math.max(...this.d.map(r=>r.length),0)},getFrozenRows(){return 1},setFrozenRows(){},
 getRange(r,c,n,w){const d=this.d;n=n||1;w=w||1;return{getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,k)=>{const v=(d[r-1+i]||[])[c-1+k];return v===undefined?'':v})),
  setValues:v=>v.forEach((row,i)=>row.forEach((x,k)=>{d[r-1+i]=d[r-1+i]||[];d[r-1+i][c-1+k]=x})),setValue:x=>{d[r-1]=d[r-1]||[];d[r-1][c-1]=x}}}};
ctx.getSpreadsheet_=()=>({getSheetByName:n=>libro[n]?new Hoja(n):null});
ctx.getHoja_=n=>new Hoja(n);
ctx.ubicarColumnas_=(h,enc)=>{const hd=h.d[0];enc.forEach(e=>{if(!hd.some(x=>String(x).toUpperCase()===e.toUpperCase()))hd.push(e)});return{enc,col:Object.fromEntries(hd.map((e,i)=>[String(e).toUpperCase(),i+1]))}};
ctx.escrCol_=(m,e)=>m.col[String(e).toUpperCase()]||0;
['PreciosErroneos','VentaDiaria','KillersActivos','CompararWalmart','CasosWalmart','ExportarPrecios','VentasKillers','VentasCva'].forEach(f=>vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/'+f+'.gs','utf8'),ctx));
ctx.kdReintentar_=f=>f();ctx.vdLibro_=()=>ctx.getSpreadsheet_();ctx.vdHoja_=n=>ctx.getHoja_(n);


const D=(y,m,d,h)=>new Date(y,m-1,d,h||0);
const AHORA=D(2026,11,2,12).getTime();
// ---------- kaQueAplica_
const A=R('kaQueAplica_');
const r1={negoc:900,ini:D(2026,10,25),fin:D(2026,11,10)},r2={negoc:850,ini:D(2026,11,1),fin:D(2026,11,5)},r3={negoc:800,ini:D(2026,11,20),fin:D(2026,11,30)},r4={negoc:700,ini:D(2026,9,1),fin:D(2026,9,30)};
t(A([r1,r2,r3],AHORA).k===r2&&A([r1,r2],AHORA).estado==='VIGENTE','dos rangos cubren hoy: gana el que empezo mas tarde');
t(A([r3,r4],AHORA).k===r3&&A([r3,r4],AHORA).estado==='POR INICIAR','ninguno cubre: el proximo por iniciar');
t(A([r4],AHORA)===null,'todos vencidos: no entra');

// ---------- kaConstruir_
libro['Precios EM Minimo']=[['SKU','Walmart Clasica','Walmart Premium'],['AAA-1',1000,1100],['BBB-2',500,550],['CCC-3',300,330],['GGG-7',2000,2100],['HHH-8',1500,1600]];
libro['Precios CVA Minimo']=[['SKU','Walmart Clasica','Walmart Premium']];
const tabla=R('peMinimos_()');
const K=(sku,negoc,ini,fin,extra)=>Object.assign({sku,general:R('peBase_')(sku),detalles:'Prod '+sku,actual:'',negoc,cupon:0,recibimos:negoc,ini,fin,comCup:'',msi:'No',comMsi:'',wfs:'',devol:'',disp:'',obs:'',origen:'SITE'},extra||{});
const site={lista:[
  K('AAA-1-MSI',1050,D(2026,11,1),D(2026,11,9),{cupon:50}), K('AAA-1-MSI',990,D(2026,11,15),D(2026,11,20)),
  K('BBB-2',450,D(2026,11,1),D(2026,11,9)),          // bajo minimo 10% -> fuera
  K('CCC-3',290,D(2026,11,1),D(2026,11,9)),          // cobro distinto -> fuera
  K('DDD-4',100,D(2026,10,1),D(2026,10,9)),          // vencido
  K('EEE-5',700,D(2026,11,10),D(2026,11,12)),        // por iniciar, sin minimo
  K('GGG-7',1900,D(2026,11,1),D(2026,11,9)),         // asignado a HHH-8 (min 1500)
  K('FFF-6',1980,D(2026,11,1),D(2026,11,9),{})       // bajo minimo 2% aceptable -> entra
]};
const bm={skus:{'BBB-2':{perdida:10,minimo:500,cat:'AUDIO'},'FFF-6':{perdida:2,minimo:2000,cat:'FOTOGRAFIA'}},tope:3};
const asig={'GGG-7':{principal:'HHH-8',grupo:['HHH-8','GGG-7']},'HHH-8':{principal:'HHH-8',grupo:['HHH-8','GGG-7']}};
const kc=R('kaConstruir_')({ahora:AHORA,site,tabla,asig,bm,cd:{'CCC-3':{}},kam:{'AAA-1-MSI':'VIDEOJUEGOS'},cargas:{}});
const fila=s=>kc.filas.find(f=>f[0]===s);
t(kc.res.bajoMinimo===1&&!fila('BBB-2'),'bajo minimo mayor al tope queda fuera');
t(kc.res.cobroDistinto===1&&!fila('CCC-3'),'cobro distinto queda fuera');
t(kc.res.vencidos===1&&!fila('DDD-4'),'vencido no entra');
t(!!fila('FFF-6')&&fila('FFF-6')[19]==='FOTOGRAFIA'&&Math.abs(fila('FFF-6')[25]-0.02)<1e-9,'bajo minimo aceptable entra con su % PERDIDA y su categoria');
const a=fila('AAA-1-MSI');
t(a&&a[2]===1100,'premium toma el minimo Premium');
t(a&&a[3]===1050&&a[5]===1100&&Math.abs(a[6]-1)<1e-9&&a[7]===1050,'negociado, PAGAN = negociado + cupon, % y Carga');
t(a&&a[10] instanceof Date&&a[10].getTime()-a[9].getTime()===6*3600000,'Fecha formato = fin + 6 h');
t(a&&/\$990 15\/11–20\/11/.test(a[24]),'OTROS RANGOS lista el siguiente rango');
t(a&&a[19]==='VIDEOJUEGOS'&&a[22]==='VIGENTE','KAM de Estado Killers y ESTADO VIGENTE');
t(fila('GGG-7')[2]===1500,'SKU asignado: vale el minimo mas bajo del grupo');
t(fila('EEE-5')[2]==='NO ESTA'&&fila('EEE-5')[22]==='POR INICIAR'&&kc.res.sinMinimo===2,'sin minimo: NO ESTA');
t(kc.filas[kc.filas.length-1][0]==='EEE-5','por iniciar van al final');
t(kc.filas[0].length===R('KA_ENC').length,'fila con todas las columnas de KA_ENC');
t(kc.objs.find(o=>o.sku==='AAA-1-MSI').cupon===50,'objetos para comparar traen cupon');

// ---------- kaDelSite_ (hoja Killers por encabezado)
libro['Killers']=[['SKU BASE','SKU','TITULO','CUPON','NEGOCIADO','INICIA','TERMINA','COMISION KILLER'],['AAA-1','AAA-1-MSI','Tele',50,1050,'01/11/2026 00:00','09/11/2026 23:59','10%'],['X','',0,0,0,'',''],['ZZ','ZZ-1',0,0,500,'','']];
const ds=R('kaDelSite_()');
t(ds.lista.length===1&&ds.lista[0].negoc===1050&&ds.lista[0].fin instanceof Date&&Math.abs(ds.lista[0].comCup-0.1)<1e-9&&ds.lista[0].msi==='Sí','lee la hoja Killers por encabezado (sin fecha de fin no entra)');
libro['Killers']=[['SKU','PRECIO'],['A',1]];
t(R('kaDelSite_()')===null,'sin NEGOCIADO/TERMINA no arma nada');

// ---------- cwCalcular_
const wm={'S-OK':{precio:1000,estado:'PUBLISHED',stock:5},'S-DEJAR':{precio:980,estado:'PUBLISHED',stock:5},'S-REV':{precio:950,estado:'PUBLISHED',stock:5},'S-CAM':{precio:800,estado:'PUBLISHED',stock:5},
  'S-CERO':{precio:0,estado:'PUBLISHED',stock:5},'S-LIB':{precio:800,estado:'PUBLISHED',stock:5},'S-DIF':{precio:1200,estado:'PUBLISHED',stock:5},'S-BLQ':{precio:0,estado:'',stock:0,bloqueado:true},
  'VJ-1-MSI-2':{precio:1000,estado:'PUBLISHED',stock:1},'S-SYS':{precio:1000,estado:'SYSTEM_PROBLEM',stock:3}};
const O=(sku,min,negoc,extra)=>Object.assign({sku,detalles:'p',min,negoc,cupon:0,kam:''},extra||{});
const objs=[O('S-OK',1000,1000),O('S-DEJAR',1000,980),O('S-REV',1000,950),O('S-CAM',1000,800),O('S-NOPUB',1000,900),O('S-CERO',1000,900),O('S-SIN',0,900,{}),O('S-LIB',1000,800),O('S-DIF',1000,1000),O('S-BLQ',1000,900),O('VJ-1',1000,1000,{kam:'VIDEOJUEGOS'}),O('S-SYS',1000,1000)];
wm['S-SIN']={precio:900,estado:'PUBLISHED',stock:1};
const cw=R('cwCalcular_')(objs,wm,{skus:{'S-OK':{minimo:900}},tope:3},{'S-LIB':true},{'S-DIF':{folio:'123',estado:'ABIERTO'}},{b1:3,b2:10});
const dec=s=>cw.out.find(f=>f[0]===s)[3];
t(dec('S-OK')==='OK'&&cw.out.find(f=>f[0]==='S-OK')[6]===900,'OK y el minimo de Killers bajo minimo gana');
t(dec('S-DEJAR')==='DEJAR'&&dec('S-REV')==='REVISAR KAM'&&dec('S-CAM')==='CAMBIO / QUITAR','bandas 3% / 10%');
t(dec('S-NOPUB')==='NO PUBLICADO EN WALMART'&&dec('S-CERO')==='NO PUBLICADO EN WALMART','no publicado / precio 0');
t(dec('S-SIN')==='SIN MÍNIMO'&&dec('S-LIB')==='OK (PRECIO LIBRE)','sin minimo y precio libre');
t(cw.out.find(f=>f[0]==='S-DIF')[16]==='Caso 123 · ABIERTO'&&/Caso 123/.test(cw.out.find(f=>f[0]==='S-DIF')[10]),'caso vigente sale en CASO WALMART y AVISO');
t(cw.errores.some(e=>e.sku==='S-DIF'&&e.tipo==='PRECIO DISTINTO A LA CARGA')&&cw.errores.some(e=>e.sku==='S-CERO')&&cw.errores.some(e=>e.sku==='S-SYS'),'errores que piden caso');
t(!cw.errores.some(e=>e.sku==='S-BLQ'),'bloqueado no es caso');
t(dec('VJ-1')==='OK'&&/Videojuegos/.test(cw.out.find(f=>f[0]==='VJ-1')[10]),'videojuegos: toma la unica premium de Walmart');
t(cw.out[0][14]!==''&&!/^(BLOQUEADO|SIN STOCK)/.test(cw.out[0][14]),'primero los que tienen problema por atender');
t(cw.cont.OK===5&&cw.cont.DEJAR===1&&cw.cont.REVISAR===1&&cw.cont.CAMBIO===1&&cw.cont.NOPUB===3&&cw.cont.SINMIN===1,'conteo');

// ---------- bandas: validacion del formulario
t(R('cwBandasForm')({b1:'abc',b2:'10'}).ok===false&&R('cwBandasForm')({b1:'5',b2:'4'}).ok===false,'bandas invalidas se rechazan');

// ---------- EXPORTAR
const inv=['AAA-1','AAA-1-2','AAA-1-MSI','AAA-1-MSI-3','BBB-2-MSI','ZZZ-9',12345,'VAR-X'];
const pr=[['AAA-1',1000,1100],['BBB-2','',550],['AAA-1',1,1]];
const ex=R('exArmar_')(inv,pr,[['VAR-X',777],['AAA-1',0]],true);
const P=s=>ex.S[ex.R.indexOf(s)];
t(P('AAA-1')===1000&&P('AAA-1-2')===1000&&P('AAA-1-MSI')===1100&&P('AAA-1-MSI-3')===1100,'clasica y premium con variantes; gana la primera aparicion (EM)');
t(P('BBB-2-MSI')===550&&ex.R.indexOf('ZZZ-9')<0&&ex.R.indexOf(12345)<0,'sin precio no entra; SKU numerico no entra');
t(P('VAR-X')===777,'variacion agrega su precio');
t(P('AAA-1')===1000,'variacion en 0 no pisa un precio bueno');
t(JSON.stringify(R('exCarga_')(1000))==='[980,989]'&&JSON.stringify(R('exCarga_')(0))==='[0,0]'&&JSON.stringify(R('exCarga_')(''))==='["",""]','PRECIO -2% y PRECIO CARGA');
const pares=R('exParesAsignados_')({'HHH-8888':{principal:'HHH-8888',grupo:['HHH-8888','GGG-7777-MSI']},'GGG-7777-MSI':{principal:'HHH-8888',grupo:['HHH-8888','GGG-7777-MSI']}});
t(pares.length===1&&pares[0][0]==='GGG-7777'&&pares[0][1]==='HHH-8888','pares de asignados por SKU general');
const ap=R('exAplicarAsignados_')([['HHH-8888',1500,1600],['GGG-7777',2000,2100]],pares);
t(ap.find(f=>f[0]==='GGG-7777')[1]===1500&&ap.find(f=>f[0]==='GGG-7777')[2]===1600,'el asignado toma los precios del principal');
t(R('exVariacionesDe_')([['#REF!','']])===null&&JSON.stringify(R('exVariacionesDe_')([['A','#N/A'],['B',5],['',3]]))==='[["A",0],["B",5]]','variaciones: #REF y #N/A');
const mm=R('exArmar_')(['AAA-1','AAA-1'],pr,[],false);
t(mm.R.length===2,'MINIMO / MAXIMO conservan repetidos (como el libro viejo)');

// ---------- lecturas de este libro
libro['Killers bajo minimo']=[['SKU WALMART','MINIMO','FALTA','CATEGORIA','CATEGORIA KAM','% PERDIDA'],['Q-1',1000,50,'Pantallas','AUDIO','5%'],['Q-2',0,0,'x','','2%']];
const vb=R('vdBajoMinimo_()');
t(Math.abs(vb.skus['Q-1'].perdida-5)<1e-9&&vb.skus['Q-1'].cat==='AUDIO'&&Math.abs(vb.skus['Q-2'].perdida-2)<1e-9&&vb.tope===3,'Killers bajo minimo: falta/minimo, % del site y CATEGORIA KAM');
libro['Walmart']=[['SKU','DEPARTAMENTO','PRECIO','ESTATUS','WFS','INV NORMAL'],['W-1','AUDIO',100,'PUBLISHED',2,3]];
libro['Bloqueados']=[['SKU','PRECIO'],['W-2',0],['W-1',5]];
const vw=R('vdWalmart_()');
t(vw.n===2&&vw.mapa['W-1'].stock===5&&vw.mapa['W-2'].bloqueado===true&&vw.mapa['W-1'].bloqueado===false,'Walmart + Bloqueados (sin duplicar)');
libro['Cobro distinto']=[['sku','pesos','pedidos','causa'],['C-1',30,2,'otra categoria']];
t(R('vdCobroDistinto_()')['C-1'].pesos===30,'Cobro distinto por encabezado (minusculas del site)');

// ---------- casos
t(R('cawTexto_')({'X':{folio:'',estado:'POR ABRIR'}},'X')==='Caso sin folio · POR ABRIR'&&R('cawTexto_')({},'X')==='','texto de caso');
libro['Casos Walmart']=[['SKU','ESTADO','FOLIO WALMART'],['A-1','CERRADO','1'],['A-2','ABIERTO','2']];
const vg=R('cawVigentes_()');
t(!vg['A-1']&&vg['A-2'].folio==='2','vigentes = todo lo que no es CERRADO');


// ---------- historico mensual (Killers historico con carga del mes)
ctx.Utilities.formatDate=(d,z,f)=>f==='yyyy-MM'?d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'):(f==='dd/MM'?String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'):'x');
ctx.peHojaAsegurar_=(n,enc)=>{const h=new Hoja(n);if(!h.d[0].length)enc.forEach(e=>h.d[0].push(e));return h};
libro['Killers']=[['SKU','SKU BASE','NEGOCIADO','CUPON','INICIA','TERMINA'],['K-1-MSI','K-1',500,0,D(2026,10,1),D(2026,10,9)],['K-2','K-2',300,10,D(2026,10,5),D(2026,10,20)]];
const n1=R('peKillersSync_()'),n2=R('peKillersSync_()');
const kh=libro['Killers historico'],ic=kh[0].indexOf('CARGA');
t(n1===2&&n2===0&&kh.length===3,'el historico guarda cada rango una sola vez');
t(ic>=0&&/^[A-Z]+ \d{4}-1$/.test(kh[1][ic]),'cada tanda lleva su carga del mes ('+(kh[1]||[])[ic]+')');
libro['Killers'].push(['K-3','K-3',200,0,D(2026,10,7),D(2026,10,8)]);
const n3=R('peKillersSync_()');t(n3===3&&kh.length===6&&/-2$/.test(kh[3][ic])&&/-2$/.test(kh[5][ic]),'cambio la lista: foto COMPLETA nueva con carga -2 ('+n3+' killers)');
t(kh[0].indexOf('FOTO')>=0&&kh[4][kh[0].indexOf('FOTO')] instanceof Date,'cada foto lleva su hora');

// ---------- ventas con killer
const LL=(s,n,c,i,f)=>R('peLlaveK_')(s,n,c,i,f);
const rA={llave:LL('Z-1-MSI',1000,100,D(2026,11,1),D(2026,11,5)),neg:1000,cup:100,rec:1100,ini:D(2026,11,1),fin:D(2026,11,5),carga:'NOVIEMBRE 2026-1'};
const rB={llave:LL('Z-1-MSI',950,80,D(2026,11,4),D(2026,11,10)),neg:950,cup:80,rec:1030,ini:D(2026,11,4),fin:D(2026,11,10),carga:'NOVIEMBRE 2026-2'};
const rC={llave:LL('Z-1-MSI',990,50,D(2026,10,1),D(2026,10,31)),neg:990,cup:50,rec:1040,ini:D(2026,10,1),fin:D(2026,10,31),carga:'OCTUBRE 2026-1'};
const kil={porSku:{'Z-1-MSI':[rA,rB,rC]},fotos:[{t:D(2026,11,1,8).getTime(),carga:'NOVIEMBRE 2026-1',llaves:{[rA.llave]:true}},{t:D(2026,11,4,10).getTime(),carga:'NOVIEMBRE 2026-2',llaves:{[rB.llave]:true}}]};
const KD=(t)=>R('vkKillerDe_')(kil,'Z-1-MSI',t.getTime());
t(KD(D(2026,10,15)).r===rC&&/RANGO/.test(KD(D(2026,10,15)).como),'octubre (antes de la primera foto): por rango');
t(KD(D(2026,11,2,12)).r===rA&&KD(D(2026,11,2,12)).como==='FOTO NOVIEMBRE 2026-1','noviembre: el killer de la foto activa');
t(KD(D(2026,11,4,9)).r===rA,'antes de la foto 2 sigue el killer de la foto 1');
t(KD(D(2026,11,4,12)).r===rB,'despues de la foto 2: el KAM quito el viejo, vale el nuevo');
t(KD(D(2026,11,11))===null&&R('vkKillerDe_')(kil,'OTRO',D(2026,11,2).getTime())===null,'sin killer: no entra');
const V=(f,precio,piezas,extra)=>Object.assign({fecha:f,folio:'F'+f.getTime(),orden:'609',ref:'6000',sku:'Z-1-MSI',producto:'p',piezas:piezas||1,precio,estatus:'Enviado',cancelada:false,items:1},extra||{});
const ventas=[V(D(2026,11,2,12),1000),V(D(2026,11,3,12),2000,2),V(D(2026,11,3,13),1000,1,{cancelada:true}),V(D(2026,11,4,12),1100),V(D(2026,10,10),990),V(D(2026,11,2,13),500,1,{sku:'NADA'})];
const fm=R('vkFilasMes_')('2026-11',ventas,kil,'auto');
const ventas2=ventas.map(v=>Object.assign({},v,{canal:v.sku==='NADA'?'WFS':'SELLER'}));
const tv=R('vkVentaMes_')('2026-11',ventas2,'total');
t(tv.ventas===4&&tv.venta===1000+2000+1100+500&&tv.wfs===500&&tv.seller===4100,'venta de TODO el mes (sin canceladas), WFS y SELLER aparte');
t(fm.res.ventas===3&&fm.res.canceladas===1,'noviembre: 3 ventas con killer, la cancelada no cuenta');
t(fm.res.piezas===4&&fm.res.cupon===100+200+80,'CUPON TOTAL = cupon x piezas');
t(fm.res.nos===1100+2200+1030,'NOS PAGAN TOTAL = (negociado + cupon) x piezas');
t(fm.filas[1][8]===1000&&fm.filas[1][9]===2000,'2 piezas a precio total 2000: unitario 1000');
t(fm.filas[2][20]==='NO'&&fm.res.aNeg===2,'vendida a otro precio que el negociado: PRECIO = NEGOCIADO NO');
t(fm.filas[2][21]===380&&fm.filas[0][0]==='NOVIEMBRE 2026','acumulado del mes y nombre del mes');
t(fm.filas[0].length===R('VK_ENC').length,'filas con todas las columnas de VK_ENC');
const fo=R('vkFilasMes_')('2026-10',ventas,kil,'auto');
t(fo.res.ventas===1&&fo.res.cupon===50,'octubre aparte (para el historico)');

// ---------- resumen venta CVA (aparte de Walmart)
let escrito=null;ctx.vdEscribir_=(h,enc,filas)=>{escrito={enc,filas};return {col:{},filaDatos:2}};ctx.vdFormato_=()=>{};ctx.vdLibro_=()=>ctx.getSpreadsheet_();ctx.vdHoja_=n=>ctx.getHoja_(n);
libro['Pedidos CVA']=[['ID Línea','Número (SO)','Fecha creación','Cliente','Vendedor','Estado SO','SKU','Producto','Cantidad','Precio unitario','Importe línea','Total orden'],
 [1,'S1',D(2026,10,5),'LIV','v','sale','A-CVA','p',2,100,172.41,200],[2,'S2',D(2026,10,20),'TIKTOK SHOP','v','done','B-CVA','p',1,300,258.62,300],
 [3,'S3',D(2026,11,1),'LIV','v','sale','A-CVA','p',1,100,86.21,100],[4,'S4',D(2026,10,9),'WALMART','v','draft','C-CVA','p',1,999,861,999]];
const nr=R('vcResumen_()');
t(nr===2&&escrito.filas[0][0]==='NOVIEMBRE 2026'&&escrito.filas[1][0]==='OCTUBRE 2026','resumen CVA por mes, el mas nuevo arriba');
t(escrito.filas[1][2]===500&&escrito.filas[1][4]===2&&escrito.filas[1][5]===3,'octubre: venta = cantidad x precio, sin el borrador');
t(escrito.filas[0][6]===600,'venta acumulada desde el primer mes');
t(escrito.enc.indexOf('VENTA LIV')>=0&&escrito.filas[1][escrito.enc.indexOf('VENTA LIV')]===200,'una columna por plataforma');
console.log('t39 OK '+ok+(bad?' · FALLAS '+bad:''));process.exit(bad?1:0);
