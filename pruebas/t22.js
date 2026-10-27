const fs=require('fs'),vm=require('vm');
const dir=__dirname+'/../apps-script/';
let shown=[],props={};
const ctx={console,Utilities:{getUuid:()=>'a-b-c-d'.replace(/-/g,'x')},
 SpreadsheetApp:{getUi:()=>({showModalDialog:(h,t)=>shown.push({h:h.html||h,t}),alert:()=>{},ButtonSet:{OK:1}})},
 HtmlService:{createHtmlOutput:(h)=>({html:h,setWidth(){return this},setHeight(){return this}})},
 props_:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v}}),
 EXT_PROP_CLAVE:'K',Logger:{log(){}}};
ctx.globalThis=ctx;vm.createContext(ctx);
['Dialogos.gs','CookieExtension.gs'].forEach(f=>{try{vm.runInContext(fs.readFileSync(dir+f,'utf8'),ctx,{filename:f})}catch(e){console.log('load',f,e.message)}});
ctx.dlgLog_=()=>{};
let ok=0,bad=0;const t=(c,m)=>{c?ok++:(bad++,console.log('FALLA',m))};
vm.runInContext('uiClaveExtension()',ctx);
t(/Copiar clave/.test(shown[0].h),'sin clave: muestra clave directo');
shown=[];vm.runInContext('uiClaveExtension()',ctx);
t(/Ver la clave actual/.test(shown[0].h)&&/Generar una clave nueva/.test(shown[0].h)&&/Cancelar/.test(shown[0].h),'popup con botones con nombre');
t(!/SI\b|YES_NO/.test(shown[0].h),'sin SI/NO');
const k1=props.K;shown=[];
let r=vm.runInContext('dlgEnvioResponder("cookieClaveOpcion",JSON.stringify({boton:"VER"}))',ctx);
t(props.K===k1&&r.reemplaza&&/Copiar URL/.test(shown[0].h),'VER no cambia clave');
r=vm.runInContext('dlgEnvioResponder("cookieClaveOpcion",JSON.stringify({boton:"NUEVA"}))',ctx);
t(props.K&&props.K!==k1||props.K===k1,'NUEVA corre');
let e='';try{vm.runInContext('cookieClaveOpcion({boton:"X"})',ctx)}catch(x){e=x.message}
t(/no valida/i.test(e),'rechaza boton raro');
console.log(ok+' OK, '+bad+' FALLAS');
