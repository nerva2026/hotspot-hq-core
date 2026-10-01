# Portada, cuentas del crew, tablón, cuentas, pizarra y música · HOT SPOT S.L.

Aplicación propia (Node, sin dependencias) con estas partes:

| Dirección | Qué es |
| --- | --- |
| `https://oficina.hot-spot.es/` | Portada: **CREW** (entrar con Google) o **INVITADO** (solo la calle, sin cuenta). |
| `https://oficina.hot-spot.es/cuentas/` | Entrar con Google y proveedor de identidad (OpenID Connect) de la oficina. |
| `https://oficina.hot-spot.es/tareas/` | Tablón de tareas. |
| `https://oficina.hot-spot.es/tareas/libro/` | Libro de cuentas de los socios. |
| `https://oficina.hot-spot.es/tareas/pizarra/` | Pizarra compartida (la de la sala de reuniones). |
| `https://oficina.hot-spot.es/tareas/musica/` | La cabina de música: escuchar a la vez lo que pincha alguien del crew (Spotify). |
| `https://oficina.hot-spot.es/tareas/musica/mini/` | El reproductor pequeño (360 × 128 px) para abrirlo en la oficina mientras se anda. |

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
| `servidor/musica.js` | Música: la cabina, conectar Spotify (OAuth) y mirar qué suena (en su propio `musica.json`). |
| `publico/` | Las pantallas (tablón, `libro/`, `pizarra/`, `musica/` y `musica/mini/`): HTML, CSS y módulos de JavaScript sin compilar. |
| `pruebas/` | Las pruebas que se pasan en GitHub antes de publicar (libro, pizarra, música con un Spotify de mentira y acceso de la oficina). |
| `portada/` | La portada (CREW / INVITADO) y el estilo de las pantallas de acceso. |

Las tareas borradas pasan 30 días en una papelera interna (el aviso «Deshacer» las recupera).

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
