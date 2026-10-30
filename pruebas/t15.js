// La cuenta regresiva de envio REAL vive en la ventana (dlgEnvio_, segundos: KC_CUENTA_SEG).
// La version vieja en celdas (kcCuentaRegresiva_) y las preguntas SI/NO (kcPreguntarModo_) se quitaron en la auditoria del 30-oct-2026.
const fs=require('fs');const d=__dirname+'/../apps-script/';
const kc=fs.readFileSync(d+'KillersCorreo.gs','utf8'),sk=fs.readFileSync(d+'SolicitudKillers.gs','utf8'),dl=fs.readFileSync(d+'Dialogos.gs','utf8');
let p=0,f=0;const ok=(c,m)=>{c?p++:f++;console.log(c?'OK':'FALLA',m)};
ok(/var KC_CUENTA_SEG = \d+/.test(kc),'KC_CUENTA_SEG sigue definido');
ok(/segundos: KC_CUENTA_SEG/.test(kc)&&/segundos: KC_CUENTA_SEG/.test(sk),'bajo minimo y solicitud usan la cuenta regresiva de la ventana');
ok(/segundos/.test(dl),'la ventana dlgEnvio_ maneja los segundos');
ok(!/function kcCuentaRegresiva_|function kcPreguntarModo_/.test(kc),'las funciones viejas ya no estan');
console.log(p+' OK '+f+' FALLA');process.exit(f?1:0);
