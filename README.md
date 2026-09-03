# Site Sheet

Baja del site de la empresa lo que hoy se consulta a mano —**inventario** y
**precios**— lo deja en un Google Sheet, y lo sirve en un dashboard con botones
de descarga.

---

## Las tres piezas

```
GitHub Pages (publico)        Apps Script (privado)       electronicsmexico.site
docs/ del repo           ->   /exec  (JSON)          ->   X-API-Key
sin secretos                  guarda la credencial        stock + precios
                              valida el password
```

Todo vive en la nube. **No necesita que ninguna computadora esté prendida.**
La credencial del site nunca baja al navegador: el dashboard habla con Apps
Script, y Apps Script es quien habla con el site.

---

## Coordenadas

| Qué | Dónde |
|---|---|
| Carpeta local | `C:\Users\CIBER\Documents\GitHub\Site Sheet` |
| Sheet | `1Yjwyyv7EF5CJ3tJ2DgGzXO7QHxyrC0aCCSj1MHL5AKY` |
| Apps Script | `1AjqRbxWquv2ZTgY2BjSLhM3H86nnCDTVicKyiJbI5_et7vPTAJ3zrHKm` |
| Web App `/exec` | `AKfycby85T2KwoDZ...` — pública, pero sin password no devuelve nada |
| Repo | pendiente de publicar |

---

## Las 8 hojas

| Hoja | Origen |
|---|---|
| `Precios EM Minimo` / `Normal` / `Maximo` | master `elemex` × las 3 bandas |
| `Precios CVA Minimo` / `Normal` / `Maximo` | master `cva` × las 3 bandas |
| `Inventario Actual` | `/stock-odoo-data` |
| `Inventario Negativo` | `/stock-odoo-negativos-data` |

Los masters y las bandas son los mismos botones de la página `/precios-em`
(`data-m` y `data-b`).

---

## Autenticación — por qué token y no cookie

**Apps Script no puede llevarse tu cookie solo.** Corre en servidores de Google,
no en tu navegador: no puede ver tu sesión, ni enterarse de cuándo haces login,
ni con permisos ni con trucos. Cualquier esquema basado en cookie termina en lo
mismo — pegarla a mano cada que vence.

La solución es el token fijo en el header `X-API-Key`, que es justo lo que ya
dejaste preparado en el script de inventario. No expira, se configura una vez, y
sirve para todas las cuentas del proyecto.

En el servidor:

```python
import secrets, os
# generar una vez:  python -c "import secrets; print(secrets.token_urlsafe(32))"
STOCK_API_KEY = os.environ["STOCK_API_KEY"]

def requiere_api_key(f):
    @wraps(f)
    def wrapper(*a, **kw):
        enviado = request.headers.get("X-API-Key", "")
        if not secrets.compare_digest(enviado, STOCK_API_KEY):
            return jsonify(ok=False, error="no autorizado"), 401
        return f(*a, **kw)
    return wrapper
```

`compare_digest` y no `==`: comparar cadenas se rinde en el primer carácter
distinto, y ese tiempo, medido, filtra el token.

La cookie sigue disponible como respaldo (menú → *Actualizar cookie*), pero el
dashboard te va a marcar en amarillo que estás en modo cookie hasta que migres.

---

## El endpoint de precios

`/stock-odoo` tiene su hermana de datos `/stock-odoo-data`. Para `/precios-em`
no sabemos si existe algo equivalente, así que el script lo averigua solo:

> menú **SITE SHEET → Configuración → Descubrir endpoint de precios**

Prueba ~7 rutas candidatas con tu credencial puesta y reporta cuál devuelve
JSON. Si encuentra una, la guarda. Si no encuentra ninguna, hay que agregarla en
el servidor — la misma consulta que ya alimenta la tabla, devuelta como JSON:

```python
@app.route("/precios-em-data")
@requiere_api_key
def precios_em_data():
    master = request.args.get("m", "elemex")   # elemex | cva
    banda  = request.args.get("b", "normal")   # minimo | normal | maximo
    items  = consulta_que_ya_usa_la_tabla(master, banda)
    return jsonify(ok=True, master=master, banda=banda, items=items)
```

Con eso puesto, *Poner ruta de precios a mano* y listo. Si tu servidor usa otros
nombres de parámetro, la plantilla `?m={master}&b={banda}` se cambia desde ahí
mismo, sin tocar código.

---

## Frecuencia y cuota — el número que importa

**La cuota de UrlFetch cuenta llamadas, no datos.** Ocho hojas cada 15 minutos
son unas 768 llamadas al día, de 20,000 disponibles. No hay riesgo por ahí, y
bajar la frecuencia no compra nada.

Lo que sí evitamos es el trabajo inútil: de cada respuesta se guarda una huella
SHA-256, y si viene idéntica a la anterior **no se reescribe la hoja**. Eso
ahorra escrituras, mantiene el Sheet ágil y deja el historial limpio.

Si la cuota igual truena, no es este script: es **por cuenta de Google** y la
comparten todos tus proyectos de Apps Script. El culpable se busca en
`script.google.com/home/executions`, filtrando por hoy y ordenando por
ejecuciones. Casi siempre es un script con `UrlFetchApp.fetch` dentro de un loop
de SKUs.

---

## Seguridad — la regla del proyecto

**Ninguna credencial vive en un archivo.** Ni "solo para probar".

| Qué | Dónde | ¿Público? |
|---|---|---|
| Token del site | `PropertiesService` | nunca |
| Cookie de respaldo | `PropertiesService` | nunca |
| ID del Sheet | `PropertiesService` | nunca |
| Password del dashboard | hash SHA-256 con sal, 5,000 iteraciones | nunca |
| Token de sesión | `CacheService`, 12 h | nunca |
| URL del `/exec` | `docs/config.js` | sí, pero sin password no da datos |

No hay ningún paso de "edita la constante, corre la función y acuérdate de
borrarla". Todo se captura desde el menú del Sheet y va directo a
PropertiesService: no hay nada que se pueda olvidar de borrar.

Antes de cada commit, `_seguro.ps1` revisa el código buscando cookies de sesión,
tokens, passwords y llaves de API, y **detiene el commit** si encuentra algo. Es
una red, no un sustituto de fijarse.

El dashboard, además: sal por instalación, 5,000 iteraciones de SHA-256,
comparación en tiempo constante y bloqueo a los 5 intentos fallidos. Y una lista
blanca de hojas — con sesión válida solo se pueden leer esas 8, no cualquier
pestaña del Sheet por nombre.

---

## Los .bat — actualizar en dos clicks

| Archivo | Para qué | Cuándo |
|---|---|---|
| `0-ACTUALIZAR.bat` | baja de GitHub | antes de trabajar, si usaste otra compu |
| `1-INSTALAR-CLASP.bat` | instala clasp y autoriza Google | una sola vez |
| `2-SUBIR-A-APPSCRIPT.bat` | sube solo el backend | cambios en `.gs` |
| `3-VERIFICAR.bat` | diagnóstico del entorno | cuando algo no jala |
| `4-SUBIR-A-GITHUB.bat` | sube solo el frontend | cambios en `docs/` |
| `5-SUBIR-TODO.bat` | los dos | **el de diario** |
| `_config.bat` | usuario y repo de GitHub | editar una vez |
| `_seguro.bat` + `.ps1` | revisión anti-credenciales | lo llaman 3, 4 y 5 |

ASCII puro y CRLF a propósito: CMD no lee bien los `.bat` en UTF-8, y un acento
rompe el parseo.

---

## Puesta en marcha

**1 · Backend** — `1-INSTALAR-CLASP.bat` → activar la Apps Script API en
https://script.google.com/home/usersettings → `2-SUBIR-A-APPSCRIPT.bat`

**2 · Configuración** — menú **SITE SHEET → Configuración**

1. *Configurar token API*
2. *Capturar ID del Sheet*
3. *Descubrir endpoint de precios*
4. *Password del dashboard* (mínimo 12 caracteres)
5. *Probar conexión*
6. **Triggers → Activar corridas cada 15 min**

**3 · Repo** — GitHub Desktop → *Add local repository* → esta carpeta →
*Publish*. Luego *Settings → Pages → main / carpeta `docs`*, y pon tu usuario y
el repo en `_config.bat`.

---

## Trampas conocidas

**Publicar versión.** Subir con clasp **no** actualiza la URL `/exec`.
*Implementar → Administrar implementaciones → ✏️ → Nueva versión*. Si no, la URL
sigue sirviendo código viejo y depuras un fantasma.

**Nueva implementación ≠ nueva versión.** La primera genera otra URL y deja la
anterior huérfana. Siempre editar la existente.

**Los triggers son de quien los instala.** `getProjectTriggers()` solo devuelve
los de tu cuenta. Los de otra persona no se pueden ver ni borrar desde el
código — por eso este proyecto arranca en Sheet y script nuevos.

**El error de cuota llega en español.** Buscar solo `invoked too many times`
hacía que no se reconociera y se reintentara tres veces en vano. Se detecta en
seis idiomas y se aborta al primer golpe: reintentar una cuota agotada es
imposible por definición.

**`followRedirects: false`.** Si la credencial no sirve, el site contesta la
página de login con código 200. Siguiendo el redirect creeríamos que todo salió
bien y escribiríamos HTML en la hoja.

**`getActiveSpreadsheet()` devuelve `null`** en triggers y web apps. Todo pasa
por `getSpreadsheet_()`, que usa `openById`.

**`const` no crea propiedad en `window`.** `config.js` usa `var` a propósito.

**Ceros a la izquierda.** Las columnas de SKU o código van en formato texto `@`
**antes** de escribir, o Sheets se los come.

**Escribir y luego limpiar el sobrante**, nunca `clearContents()` primero: si el
`setValues` truena a media, la hoja queda vacía y el downstream lee cero.

**Guarda contra vaciado.** Si el endpoint devuelve 0 items pero la hoja tiene
datos, se aborta la escritura. Un inventario no se vacía solo; eso es un
problema del endpoint.

---

## Estructura

```
Site Sheet/
├── docs/                    <- GitHub Pages sirve esta carpeta
│   ├── index.html
│   ├── app.js               <- login, 8 hojas, filtro, descarga CSV
│   ├── theme.css            <- Estilo 1 · Base (tokens de diseño)
│   ├── style.css            <- solo lo propio de esta pantalla
│   └── config.js            <- URL del Web App
├── apps-script/
│   ├── Config.gs            <- constantes, sin secretos
│   ├── Setup.gs             <- menú del Sheet y captura de credenciales
│   ├── Api.gs               <- cliente del site, cuota, descubridor
│   ├── Precios.gs           <- 6 combinaciones + huella anti-reescritura
│   ├── Stock.gs             <- inventario y negativos
│   ├── Auth.gs              <- password, sesiones, freno de fuerza bruta
│   ├── WebAPI.gs            <- endpoint JSON + lista blanca de hojas
│   ├── Triggers.gs          <- corridas automáticas
│   ├── Log.gs               <- log con buffer
│   └── appsscript.json
└── *.bat
```

### Pendiente

Las columnas del inventario. Hoy `Stock.gs` escribe **todos** los campos que
traiga el endpoint más una columna `BODEGAS`, para no perder nada mientras
decides. Cuando me digas qué columnas quieres, se recorta en un solo lugar
(`filasInventario_`).
