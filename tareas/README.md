# Portada, cuentas del crew, tablón, libro de cuentas, pizarra, archivo y música · HOT SPOT S.L.

Aplicación propia (Node, sin dependencias) con estas partes:

| Dirección | Qué es |
| --- | --- |
| `https://oficina.hot-spot.es/` | Portada: **CREW** (entrar con Google) o **INVITADO** (solo la calle, sin cuenta). |
| `https://oficina.hot-spot.es/cuentas/` | Entrar con Google y proveedor de identidad (OpenID Connect) de la oficina. |
| `https://oficina.hot-spot.es/tareas/` | Tablón de tareas. |
| `https://oficina.hot-spot.es/tareas/libro/` | Libro de cuentas de los socios. |
| `https://oficina.hot-spot.es/tareas/pizarra/` | Pizarra compartida (la de la sala de reuniones). |
| `https://oficina.hot-spot.es/tareas/archivo/` | Archivo de documentos del crew (la sala ARCHIVO). |
| `https://oficina.hot-spot.es/tareas/musica/` | La cabina de música: escuchar a la vez lo que pincha alguien del crew (Spotify). |
| `https://oficina.hot-spot.es/tareas/musica/mini/` | El reproductor pequeño (360 × 128 px) para abrirlo en la oficina mientras se anda. |
| `https://oficina.hot-spot.es/tareas/oficina/` | Puente invisible: lo abre el mapa de la oficina, sin enseñarlo, para leer el tablón de quien juega. |

## Crew e invitados

- Solo entran con Google los correos del **crew**: las personas del tablón con correo. Se gestionan en el
  tablón, menú de la cuenta → «Crew» (solo administradores). Si no se pone nombre, se usa el de Google.
- Quien sale del crew pierde al momento la oficina y el tablón (se le cierran sesiones y accesos); sus
  tareas se quedan.
- La oficina (WorkAdventure) inicia sesión en `/cuentas` como si fuera un proveedor OpenID Connect
  (`OPENID_CLIENT_ISSUER=http://tareas:3000/cuentas`). Nosotros hablamos con Google y comprobamos la lista.
- Con el parche 07, la oficina y la terraza exigen haber entrado; los invitados se quedan en la calle
  (la puerta, `src/calle.js` del mapa, les ofrece entrar con Google).
- De los invitados no se guarda nada en el servidor: solo su nombre y su muñeco en su propio navegador.
- La sesión es común (cookie `hs_sesion`): quien entra a la oficina ya está dentro del tablón.
- Variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (cliente OAuth «Aplicación web» con la vuelta
  `https://oficina.hot-spot.es/cuentas/google`), `OIDC_SECRETO` (el mismo que `OPENID_CLIENT_SECRET` de la
  oficina), `OIDC_EMISOR`, `CREW_ADMIN` (correo del primer administrador).
- `pruebas/oficina-oidc.mjs` comprueba en GitHub, con la misma librería que usa WorkAdventure, que la
  oficina puede entrar por `/cuentas`.

## Tablón de tareas

Se abre desde la oficina (pizarra de PENDIENTE, la Jefa de Producción y el botón TAREAS de la barra) o en
cualquier navegador.

- **Vistas:** tablero por columnas (Por hacer, En marcha, Esperando, Hecho), lista tipo Notion,
  calendario y cronograma.
- **Pantallas pequeñas:** con 600 px o menos la cabecera cabe en una línea (las vistas, en un solo botón con el nombre de
  la de ahora; los filtros, con la búsqueda, plegados detrás de «Filtros») y, si no hay una vista guardada, se abre la
  lista (por fecha) en vez del tablero. En el panel de la oficina, de 930 px o más caben las cuatro columnas (miden entre
  215 y 300 px, sin tocar la letra); en uno de 721 a 929 px «Hecho» se pliega en una etiqueta con su número, que se
  despliega al pulsarla. En un móvil la oficina abre el tablón casi a pantalla completa (`src/hq.js` del repositorio de mapas).
- **Cada tarea tiene:** título, estado, prioridad (urgente, alta, media, baja; cada una con su color),
  para quién, pedido por, fecha de inicio y fecha límite, etiquetas, subtareas y notas.
- **En directo:** lo que cambia uno lo ve el otro al momento (Server-Sent Events).
- **Excel:** descarga del tablón entero en `.xlsx`, e importación de la hoja «Pendiente» de Drive o de
  una descarga anterior. Las filas que empiezan por «EJEMPLO» y las tareas que ya existen se saltan.
- **Cuentas:** con Google (crew). Las contraseñas antiguas siguen valiendo como plan B («Entrar con
  contraseña»), y `node servidor/principal.js enlace` crea un enlace de alta de emergencia.

## Cómo está hecho

Node 22 sin dependencias:

| Carpeta | Qué hay |
| --- | --- |
| `servidor/principal.js` | Servidor HTTP: portada, tablón (API, tiempo real, Excel) y panel del crew. |
| `servidor/crew.js` | Entrar con Google, sesión común y proveedor OpenID Connect para la oficina. |
| `servidor/almacen.js` | Los datos: un JSON (`tablon.json`) en la carpeta de datos, con copia diaria en `copias/` (se guardan 30). |
| `servidor/cuentas.js` | Contraseñas (scrypt, plan B), sesiones e invitaciones de emergencia. |
| `servidor/tareas.js` | Campos de las tareas y sus reglas. |
| `servidor/excel.js` | Lectura y escritura de `.xlsx` sin librerías. |
| `servidor/libro.js` | Libro de cuentas: movimientos, reparto, quién debe a quién, CSV. |
| `servidor/pizarra.js` | Pizarras: trazos, notas y fotos (en su propio `pizarras.json`). |
| `servidor/archivo.js` | Archivo de documentos: subir y comprobar lo subido, título, carpeta y fijado, enlaces, papelera y búsqueda (en `archivo/`). |
| `servidor/docx.js` | Word (`.docx`) a HTML limpio, sin librerías (solo `zlib` de Node). |
| `servidor/perfil.js` | Cumpleaños («MM-DD»), qué día es hoy en la oficina y el personaje de cada uno. |
| `servidor/musica.js` | Música: la cabina, conectar Spotify (OAuth) y mirar qué suena (en su propio `musica.json`). |
| `publico/` | Las pantallas (tablón, `libro/`, `pizarra/`, `archivo/`, `musica/`, `musica/mini/` y `oficina/`): HTML, CSS y módulos de JavaScript sin compilar. |
| `publico/app/markdown.js` | Markdown a HTML seguro (todo escapado), para el visor del archivo. |
| `publico/app/archivo*.js` | El archivo en pantalla: la lista (`archivo.js`), el visor con índice y buscador (`archivo-visor.js`) y piezas comunes (`archivo-comun.js`). |
| `publico/app/musica*.js` | La música en pantalla: la cabina (`musica.js`), el reproductor pequeño (`musica-mini.js`) y piezas comunes (`musica-comun.js`). |
| `publico/app/cumple.js`, `confeti.js`, `oficina.js` | Los cumpleaños (cuentas y textos), el confeti y el puente invisible de la oficina (`/tareas/oficina/`). |
| `pruebas/` | Las pruebas que se pasan en GitHub antes de publicar, una por pantalla y cada una con su servidor y su puerto (tabla en «Las pruebas»). |
| `portada/` | La portada (CREW / INVITADO) y el estilo de las pantallas de acceso. |

Las tareas borradas pasan 30 días en una papelera interna (el aviso «Deshacer» las recupera).

**Cómo se llega de una pantalla a otra:** el menú de la cuenta (arriba a la derecha) de cada pantalla y las pestañas
de arriba llevan a las demás con los mismos nombres: «Tablón de tareas», «Libro de cuentas» (en las pestañas,
«Cuentas»; solo a quien tiene parte en el reparto), «Pizarra», «Archivo» y «Música». Al añadir una pantalla nueva hay
que añadirla en todas (en `principal.js`, `libro.js`, `pizarra.js`, `archivo.js` y `musica.js`, de `publico/app/`).

## Libro de cuentas

Una pantalla propia para las cuentas, sin tener que manejar una hoja de cálculo. Usa las mismas cuentas y la
misma sesión que el tablón.

- **Quién lo ve:** los administradores y quien tiene parte en el reparto. A los demás, la API les contesta 403.
- **Apuntar:** gasto, ingreso o pago entre socios, con categoría, notas y la foto del tique (o un PDF).
- **Quién debe a quién:** cada gasto e ingreso se reparte según las partes. Las partes se fijan con el primer
  movimiento, a partes iguales entre los administradores, y se cambian en «Reparto».
- **Excel y CSV:** descarga del libro entero, e importación de la hoja de cuentas de Drive.
- Los importes se guardan en céntimos. Lo borrado pasa 30 días en la papelera.

## Pizarra

`/tareas/pizarra/?p=reuniones` es la de la sala de reuniones; con otro `?p=` sale otra (hasta 20).

- **Herramientas:** lápiz (8 colores y 4 grosores; con Mayúsculas, línea recta), goma (borra trazos enteros),
  notas, fotos (elegir, pegar con Ctrl+V o arrastrar; JPG, PNG, WebP o GIF de hasta 10 MB), mover y cambiar
  el tamaño, lupa, deshacer y rehacer, y descargar como imagen.
- **En directo:** cada uno ve el lápiz de los demás y lo que pintan mientras lo pintan, y quién tiene la
  pizarra abierta.
- **Vaciar:** quita todo para todos; se puede recuperar durante 30 días.
- Se guarda en `pizarras.json` y las fotos en `pizarra/`, dentro de la carpeta de datos.

## Archivo

`/tareas/archivo/` es la sala ARCHIVO de la oficina: los documentos del crew, a mano y compartidos. Solo para
el crew (sin sesión, la API contesta 401 y la página enseña la misma pantalla de entrada que el libro).
Se llega desde las estanterías de la sala, desde las pestañas de la barra y desde el menú de la cuenta del tablón.

- **Qué se sube:** Markdown (`.md`), PDF, fotos (PNG, JPG, WebP o GIF), textos (`.txt`) y Word (`.docx`), con el
  botón o arrastrando, varios a la vez y con el progreso. Hasta 25 MB cada uno (5 MB los textos y Markdown) y,
  entre todos, lo que diga `ARCHIVO_MAXIMO_MB` (1024 por defecto). También **enlaces** https con título: los de
  Google Docs, Hojas, Presentaciones y Drive se ven dentro con su vista previa (`/preview`); los demás se abren
  en una pestaña nueva.
- **Cada documento:** título (el nombre del archivo o el primer título del Markdown), descripción, carpeta
  (texto libre con sugerencias), quién lo subió y cuándo, tamaño, tipo y, si se quiere, fijado. Cualquiera del
  crew puede cambiarlo. Borrar lo manda a la papelera 30 días; se restaura, o lo borra del todo quien lo subió
  o un admin.
- **Inicio:** carpetas con su cuenta, «Todo», «Recientes» (los 12 últimos tocados), orden por fecha o título
  (lo fijado va primero) y búsqueda en títulos, descripciones, carpetas y en el texto de los `.md`, `.txt` y
  Word, sin fijarse en tildes ni mayúsculas y con un fragmento alrededor de lo encontrado.
- **Visor** (`?doc=<id>` abre un documento directamente): Markdown y Word con índice de títulos (a un lado; plegado
  en el móvil; marca en qué sección estás) y buscador dentro del documento (resalta, cuenta, salta); PDF con el
  visor del navegador; fotos ajustadas a la pantalla y a tamaño real al pulsarlas; textos tal cual. Siempre
  «Descargar» y «Abrir en pestaña nueva ↗».
- **Teclado:** `/` busca (dentro del visor, busca en el documento), `Esc` cierra el visor, Intro y Mayús+Intro
  saltan entre coincidencias.
- **Seguridad:** el tipo sale de la extensión y se comprueba con lo que hay dentro (firmas de PDF y fotos, que
  el Word sea un zip con su documento, que un texto sea texto); el nombre en disco lo pone el servidor, nunca
  quien sube; los archivos salen con `nosniff`, en línea solo el PDF y las fotos, y con
  `Content-Security-Policy: sandbox` todo lo que no es PDF. El Markdown se escapa entero (`markdown.js`; enlaces
  solo a http, https o mailto, en pestaña nueva) y el HTML del Word se limpia en el servidor y otra vez en la
  página. La CSP de `/archivo/` solo añade `frame-src` para `docs.google.com` y `drive.google.com`.
- Se guarda en `archivo/indice.json` (copia diaria en `archivo/copias/`, se guardan 30) y los archivos en
  `archivo/archivos/`, dentro de la carpeta de datos.

## Cumpleaños y personaje

- **Cumpleaños:** cada persona pone el suyo en «Mi cuenta…»: solo día y mes (el año ni se pide ni se guarda; quien
  nació un 29 de febrero lo celebra el 28 los años que no son bisiestos). El día de cada cumple el tablón saca un
  aviso con confeti (se cierra y no vuelve hasta el día siguiente), y hay una tarta en el calendario y en el crew.
- **«Hoy»** es el día en la oficina (`TAREAS_ZONA`, por defecto `Europe/Madrid`), no el del servidor, que va en UTC.
- **Personaje:** WorkAdventure guarda el muñeco y el compañero en el navegador; aquí se guardan también, para que
  cada uno salga igual desde cualquier aparato.

| Llamada (todas con sesión; sin ella, 401) | Qué hace |
| --- | --- |
| `PATCH /tareas/api/yo` con `{ "cumple": "05-17" }` | Pone el cumpleaños (`null` o `""` lo quita; con año se rechaza). Va junto a `color`, `nombre` y `clave`. |
| `GET /tareas/api/oficina` | `{ hoy, cumples: [{ id, nombre }], proximos: [{ id, nombre, dia, fecha, enDias }] }`: de quién es el cumple hoy y los de los próximos 30 días. Quien ha salido del crew no cuenta. |
| `GET /tareas/api/yo/personaje` | `{ texturas, companero, actualizado }` (con `null` en lo que no hay). |
| `PUT /tareas/api/yo/personaje` | Guarda `{ texturas: [de 1 a 10 piezas], companero: pieza o null }` (piezas de hasta 64 letras, números, `_`, `.` o `-`). |

### El puente de la oficina (`/tareas/oficina/`)

El script del mapa va en un marco aislado, con un origen propio: no tiene la sesión del crew ni almacenamiento, así
que no puede leer el tablón. Por eso abre esta página sin enseñarla:

```js
WA.ui.website.open({ url: "/tareas/oficina/", visible: false, allowApi: true,
                     position: { vertical: "top", horizontal: "left" }, size: { width: "1px", height: "1px" } });
```

La página es de la misma web que el tablón (lleva la cookie de la sesión). Carga `/iframe_api.js` (lo sirve la
oficina en la misma dirección), espera a `WA.onInit()` y deja lo que necesita el mapa en variables **privadas** del
jugador, con `WA.player.state.saveVariable(nombre, valor, { public: false, persist: false, scope: "room" })`: no las
ve nadie más ni se guardan (`scope: "world"` sin `persist: true` lo rechaza WorkAdventure). El mapa las lee con
`WA.player.state.loadVariable(nombre)` y `onVariableChange(nombre)`:

| Variable | Valor |
| --- | --- |
| `hsSesion` | `true` si quien juega ha entrado en el tablón; `false` si no (o si se le ha caducado la sesión). |
| `hsTareas` | `{ abiertas, hoy, atrasadas }`: sus tareas sin terminar, las que vencen hoy y las atrasadas (como las cuenta la Jefa de Producción). `null` sin sesión. Es lo que necesita el número del botón «Tareas». |
| `hsCumples` | `{ hoy: "AAAA-MM-DD", cumples: [{ id, nombre }] }`: de quién es el cumple hoy en la oficina. `null` sin sesión. |
| `hsMusica` | `{ configurado }`: si el servidor tiene conectado Spotify (lo lee de `/api/musica`). `null` sin sesión. El mapa solo pone el botón «Música» si `configurado` es `true` (mientras no llegue la respuesta, no hay botón). |

- **Al día:** se actualiza con los avisos en directo del tablón; cada minuto recuenta las tareas (a medianoche
  cambian «hoy» y «atrasadas») y cada 10 minutos vuelve a preguntar qué día es, quién cumple y si la música está conectada (y lo vuelve a leer todo al
  reconectar, por ejemplo tras reiniciar el servidor con Spotify). Sin sesión vuelve a
  probar cada vez más espaciado (1, 2, 4… hasta 15 minutos) y al momento si se vuelve a la pestaña o se entra en el
  tablón en ese navegador.
- **Aviso de cumpleaños:** lo saca él mismo (`WA.ui.banner.openBanner`, amarillo, se cierra a mano): «¡Hoy es el
  cumple de Diego!», «…de Diego y Víctor!» y, a quien cumple, «¡Feliz cumpleaños, Diego!». Una vez al día en cada
  navegador: el día visto lo recuerda en su `localStorage`, porque el mapa no puede recordar nada.
- **Fuera de la oficina** (sin `WA`: abierta en una pestaña, o en local) no hace nada ni pide `/iframe_api.js`.
- **Ligero y con la misma CSP** que las demás pantallas (`script-src 'self'`): sin interfaz, solo 4 módulos pequeños
  (`publico/app/oficina.js` y los que ya usa el tablón). `/iframe_api.js` pasa porque es de la misma web.

## Música (Spotify)

La cabina del estudio: una persona del crew pincha (pone música en su Spotify de siempre) y quien quiera la
oye a la vez. **Por aquí no pasa audio**: Spotify no permite retransmitir el de una cuenta. El servidor solo
mira qué le suena al DJ y lo cuenta a todos por el canal en directo; cada navegador pone la misma canción con
el reproductor oficial de Spotify (Embed, `https://open.spotify.com/embed/iframe-api/v1`) y salta al mismo
punto. Si esa persona ha entrado en Spotify en su navegador suena entera; si no, Spotify solo deja 30 segundos
de muestra (la pantalla lo avisa). Los anuncios, los archivos locales del DJ y lo que no está en Spotify no se
pueden poner.

- **`/tareas/musica/`** (la cabina): lo que suena (portada, título, artistas, por dónde va), «Escuchar» /
  «Silenciar», «Pinchar yo» / «Dejar la cabina», conectar y desconectar tu Spotify, las últimas 20 canciones
  con quién las puso y, si falta configurar, los pasos de abajo. Solo hay un DJ a la vez; un administrador
  puede dejar libre la cabina de otro.
- **`/tareas/musica/mini/`**: la misma música en una barra de 360 × 128 px sin desplazamiento (portada,
  título y artistas, quién pincha, escuchar y enlace a la cabina; «cabina vacía», «sin sesión», «sin
  configurar» y «sin conexión»). La oficina la abre como un panel flotante; si la cabina y el pequeño están
  abiertos a la vez, solo suena uno. Los paneles de la oficina tienen que dejar pasar el sonido
  (`allow="autoplay; encrypted-media"` en el marco). El botón «Música» de la barra y la cabina del DJ del
  mapa se ponen en el repositorio de mapas, no aquí.
- Spotify no deja iniciar sesión dentro de un marco: «Conectar mi Spotify» se abre en una pestaña nueva y la
  página de la oficina se actualiza sola (por el canal en directo) cuando termina.
- **API** (con sesión del crew; lo que cambia algo lleva además la cabecera `x-tablon: 1`): `GET /api/musica` (estado),
  `POST` y `DELETE /api/musica/cabina` (entrar y dejar la cabina), `POST /api/musica/desconectar`,
  `POST /api/musica/escucho` (esta pestaña escucha o no, con `x-cliente`), `GET /api/musica/conectar` (lleva a
  Spotify) y `GET /api/musica/vuelta` (la dirección de vuelta de Spotify). En `GET /api/eventos?musica=1&cliente=…`
  llegan `musica`, `musica-oyentes` y `musica-yo`.
- **Lo que se guarda:** `musica.json` en la carpeta de datos (permisos 600): quién está en la cabina, las
  últimas 20 canciones y el token de refresco de cada persona que ha conectado Spotify. Los tokens no salen
  del servidor (ni por la API, ni al registro) y el de acceso solo vive en memoria. Se pide únicamente permiso
  de lectura (`user-read-currently-playing user-read-playback-state`). Quien sale del crew, quita el permiso
  en Spotify o pulsa «Desconectar» pierde su token y deja la cabina.
- **Cuánto se pregunta a Spotify:** solo mientras haya alguien con la música abierta, cada 5 segundos
  (`MUSICA_INTERVALO_MS`); si Spotify pide calma (429) se espera lo que diga.
- **Variables** (en el `.env` del servidor, nunca en el repositorio): `SPOTIFY_CLIENT_ID` y
  `SPOTIFY_CLIENT_SECRET` (la aplicación de Spotify); opcionales `SPOTIFY_REDIRECT_URI` (por defecto
  `<TAREAS_URL>api/musica/vuelta`, o sea `https://oficina.hot-spot.es/tareas/api/musica/vuelta`) y
  `MUSICA_INTERVALO_MS`. `SPOTIFY_AUTH_URL`, `SPOTIFY_TOKEN_URL` y `SPOTIFY_API_URL` son solo para las pruebas
  (el Spotify de mentira). Sin las dos primeras, la música sale como «sin configurar».

### Ponerlo en marcha (una sola vez, lo hace una persona del equipo)

1. Entrar en <https://developer.spotify.com/dashboard> con una cuenta de Spotify y crear una aplicación
   («Create app»): nombre y descripción, y marcar «Web API».
2. En «Redirect URIs» poner exactamente `https://oficina.hot-spot.es/tareas/api/musica/vuelta` (la cabina
   la muestra, lista para copiar, a los administradores mientras falte configurar).
3. En «User Management» añadir el nombre y el correo de Spotify de cada persona del crew que vaya a pinchar:
   mientras la aplicación esté en modo de desarrollo, Spotify solo deja conectar esas cuentas (y limita cuántas).
   Para escuchar no hace falta estar dada de alta.
4. Copiar el «Client ID» y el «Client secret» a `/opt/hotspot-tareas/.env` (permisos 600):
   `SPOTIFY_CLIENT_ID=…` y `SPOTIFY_CLIENT_SECRET=…`. Si el `docker-compose.yaml` lista las variables una a una
   en lugar de leer el `.env` entero (`env_file`), añadirlas también ahí.
5. Reiniciar el servicio: `cd /opt/hotspot-tareas && docker compose up -d`. En `/tareas/musica/` los pasos
   dejan paso a la cabina; cada persona que vaya a pinchar pulsa «Conectar mi Spotify» una vez.

### Probar la música en local

Con el Spotify de mentira (`pruebas/spotify-falso.mjs`, que imita la autorización, los tokens y «lo que suena»
y se maneja con peticiones `/control/…`):

```sh
cd tareas
node pruebas/spotify-falso.mjs 8614 &
TAREAS_DATOS=/tmp/m TAREAS_PUERTO=3995 TAREAS_URL=http://127.0.0.1:3995/tareas/ \
SPOTIFY_CLIENT_ID=cliente-spotify SPOTIFY_CLIENT_SECRET=secreto-spotify \
SPOTIFY_AUTH_URL=http://127.0.0.1:8614/authorize SPOTIFY_TOKEN_URL=http://127.0.0.1:8614/api/token \
SPOTIFY_API_URL=http://127.0.0.1:8614/v1 MUSICA_INTERVALO_MS=300 node servidor/principal.js &
TAREAS_DATOS=/tmp/m node pruebas/musica.mjs http://127.0.0.1:3995/tareas <código de #alta=…> http://127.0.0.1:8614 3996
```

El script de Spotify (Embed) no carga sin salida a internet; para ver las pantallas sin él, una prueba en
navegador puede definir `window.onSpotifyIframeApiReady` con un reproductor de mentira.

## En el servidor

Se instala en `/opt/hotspot-tareas` con su propio `docker-compose.yaml`, en la misma red que Traefik de
WorkAdventure. Traefik le manda `/` (la portada), `/cuentas` y `/tareas`. Los datos quedan en
`/opt/hotspot-tareas/datos` (incluida la clave que firma los accesos, `clave-oidc.pem`).

- Primer arranque: el registro muestra el enlace para crear la primera cuenta
  (`docker compose logs tareas`).
- Enlace nuevo de alta (si se pierde el primero o hace falta otro):
  `docker compose exec tareas node servidor/principal.js enlace`
- Actualizaciones: cada cambio en `tareas/` publica `ghcr.io/nerva2026/hotspot-hq-tareas:latest`
  (`.github/workflows/hotspot-tareas.yml`); el servidor la descarga solo cada 5 minutos.

## Probar en local

```sh
cd tareas
TAREAS_DATOS=/tmp/tablon TAREAS_PUERTO=8411 node servidor/principal.js
# abrir el enlace #alta=… que sale en la consola
```

### Las pruebas

Se pasan en GitHub antes de publicar la imagen (`.github/workflows/hotspot-tareas.yml`). Cada paso arranca **su propio
servidor**, con su carpeta de datos (`/tmp/datos-…`), su registro y su puerto (ninguno se repite), y lo para al acabar;
las pruebas de las pantallas usan el enlace de alta que sale en el registro de su servidor. Los comandos exactos, con
sus variables, están en el workflow.

| Paso | Prueba | Puerto | Qué comprueba |
| --- | --- | --- | --- |
| Probar el servidor | (con `curl`) | 3999 | Que arranca, sirve el tablón, imprime el enlace de alta y pide sesión (401) a quien no la tiene. |
| Probar el libro de cuentas | `pruebas/libro.mjs` | 3991 | Gastos, ingresos y pagos, balance, CSV, Excel, importación de la hoja de Drive y tiques. |
| Probar la pizarra | `pruebas/pizarra.mjs` | 3997 | Trazos, notas y fotos con dos personas a la vez, vaciar y recuperar, el lápiz en directo y quién la tiene abierta. |
| Probar el tablón | `pruebas/tablon.mjs` | 3993 | Que las notas no se pisan (409 con lo que hay ahora, y también si falta «antes» y la tarea ya tiene notas), que el cliente siempre manda «antes» y la franja «Sin conexión…» (`publico/app/conexion.js`). |
| Probar cumpleaños y personaje | `pruebas/cumple.mjs` | 3994 | Cumpleaños, «hoy» en la oficina (con `TAREAS_HOY` fijo), personaje y puente `/tareas/oficina/`. |
| Probar el archivo | `pruebas/archivo.mjs` | 3992 | Subir un documento de cada tipo, enlaces, papelera, búsqueda, lo que no debe entrar, Markdown y Word escapados y el límite total (`ARCHIVO_MAXIMO_MB=40`). |
| Probar la música | `pruebas/musica.mjs` y `pruebas/spotify-falso.mjs` | 3995 (y 3996 para el servidor sin Spotify que arranca la prueba) y 8614 (el Spotify de mentira) | La cabina, conectar Spotify y lo que suena en directo; y la música «sin configurar». |
| Probar el acceso de la oficina | `pruebas/oficina-oidc.mjs` y `pruebas/google-falso.mjs` | 3998 y 8412 (el Google de mentira) | Entrar por `/cuentas` con `openid-client` 5 (la librería de WorkAdventure): PKCE, `userinfo` y revocar. Es el único paso que instala un paquete (`npm install`). |

El paso «Comprobar el código» pasa antes `node --check` a todo el JavaScript (`servidor/`, `publico/app/`, `portada/`
y `pruebas/`).
