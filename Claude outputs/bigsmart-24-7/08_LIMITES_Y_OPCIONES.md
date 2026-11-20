# 08 · Lo que Claude no hará, por qué, y lo que sí está hecho / disponible

Fecha: 20-nov-2026. Contexto: rastreo de la Paquetería Dedicada Walmart (BigSmart) sin depender de la PC de José Luis.

## A. Lo que Claude NO hará

| # | Petición | Por qué no |
|---|---|---|
| 1 | Sacar el `Authorization: Bearer` que arma el script de la página `bigsmart.mx/tracking` y usarlo desde un servidor para llamar `api.bigsmart.mx/api/order-logs/<GUIA>` | Es una credencial del sitio de BigSmart para su propia página, no una credencial emitida a Electronics México. Sin ella el endpoint responde 401: es un control de acceso. Usarla fuera de la página es entrar donde no se dio acceso. También contradice la regla de José Luis del 19-nov ("no usar la API interna"). |
| 2 | Hacerlo porque "ya dieron permiso por llamada" | Un permiso real llega con credencial propia y documentación. Sin eso no hay forma de distinguir permiso de no-permiso, y si BigSmart cambia la llave o alguien no sabe del acuerdo, el riesgo es para la empresa. Con la credencial oficial por escrito, Claude lo hace el mismo día (ver C1). |
| 3 | Programar algo que "se haga pasar por persona" para que la página no muestre la verificación "eres humano" (Cloudflare) | Es evadir un control anti-bot. No se hace en ninguna variante: ni con disfraz de navegador, ni con proxies, ni con cabeceras falsas, ni resolviendo CAPTCHA. |
| 4 | Insistir si un servidor recibe la verificación | Se detiene, se documenta y se avisa. No se busca otra forma de pasarla. |

Ninguna de estas negativas es por capacidad técnica: son por acceso no autorizado y evasión de controles.

## B. Lo que SÍ quedó hecho hoy (Site Sheet, extensión 1.8.4)

- Rastreo con reintento en bucle hasta tener los datos (3 intentos por guía, reintento a los 2 y 10 min, alerta solo tras ~1 h).
- El rastreo ahora incluye las guías que solo tenía Seller Center (unas 618 en 14 días) y lee 40 por vuelta.
- Empaque de Odoo por guía (quién empacó, cuándo, picking, guía escaneada).
- Turno entre computadoras sin "turno fantasma"; la extensión ya no se recarga a media vuelta.
- Texto "Paquetería Dedicada Walmart" en todo lo visible.
- **API propia de rastreo** (Google, 24/7, solo lectura, con token del dashboard): `/v1/health`, `/v1/trackings`, `/v1/trackings/<GUIA>`, `/v1/trackings/<GUIA>/events`. Sirve lo último leído.
- Pendiente del usuario: `5-SUBIR-TODO.bat` + "Nueva versión" en la implementación …i-GWWZHB.

## C. Caminos para tener lecturas nuevas con la PC apagada (Claude los hace completos)

| # | Camino | Costo | Qué necesita de José Luis | Riesgo |
|---|---|---|---|---|
| C1 | **Acceso oficial de BigSmart** (credencial y documentación por escrito) → el Sheet consulta desde Google 24/7, sin Chrome ni PC | $0 | Que BigSmart mande por correo el acceso (hay borrador listo) | Ninguno |
| C2 | **Servidor gratis** (Oracle Cloud "Always Free" o Google Cloud e2-micro) con navegador sin pantalla leyendo la página pública, mismas reglas, resultados al Sheet | $0 | Abrir la cuenta (piden tarjeta solo para verificar) | Que BigSmart le pida verificación a ese servidor; se sabe en la 1.ª prueba |
| C3 | **Raspberry Pi** u otra mini PC en la oficina con la extensión | ~$1,500–2,500 MXN una vez | Comprarla y conectarla | Muy bajo: sale con internet de oficina, como la PC |
| C4 | **Laptop vieja** siempre prendida con la extensión | $0 si ya existe | Dejarla prendida | Muy bajo |

En C2–C4 el turno ya construido reparte el trabajo con la PC principal (sin rastreo doble).

## D. Qué pasa hoy si la PC está apagada

Sigue (vive en Google): precios, correos de cancelaciones, killers, solicitud de recolección, Reporte, WFS, Salud, alertas, API de rastreo.
Se pausa y se retoma solo al prender: rastreo, Seller Center, cancelaciones en site/Walmart, compra de guías, refresco de sesiones.
