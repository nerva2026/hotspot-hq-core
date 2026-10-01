# Portada, cuentas del crew, tablón, cuentas, pizarra y archivo · HOT SPOT S.L.

Aplicación propia (Node, sin dependencias) con estas partes:

| Dirección | Qué es |
| --- | --- |
| `https://oficina.hot-spot.es/` | Portada: **CREW** (entrar con Google) o **INVITADO** (solo la calle, sin cuenta). |
| `https://oficina.hot-spot.es/cuentas/` | Entrar con Google y proveedor de identidad (OpenID Connect) de la oficina. |
| `https://oficina.hot-spot.es/tareas/` | Tablón de tareas. |
| `https://oficina.hot-spot.es/tareas/libro/` | Libro de cuentas de los socios. |
| `https://oficina.hot-spot.es/tareas/pizarra/` | Pizarra compartida (la de la sala de reuniones). |
| `https://oficina.hot-spot.es/tareas/archivo/` | Archivo de documentos del crew (la sala ARCHIVO). |

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
| `servidor/archivo.js` | Archivo de documentos: subir y comprobar lo subido, título, carpeta y fijado, enlaces, papelera y búsqueda (en `archivo/`). |
| `servidor/docx.js` | Word (`.docx`) a HTML limpio, sin librerías (solo `zlib` de Node). |
| `publico/` | Las pantallas (tablón, `libro/`, `pizarra/`, `archivo/`): HTML, CSS y módulos de JavaScript sin compilar. |
| `publico/app/markdown.js` | Markdown a HTML seguro (todo escapado), para el visor del archivo. |
| `publico/app/archivo*.js` | El archivo en pantalla: la lista (`archivo.js`), el visor con índice y buscador (`archivo-visor.js`) y piezas comunes (`archivo-comun.js`). |
| `pruebas/` | Las pruebas que se pasan en GitHub antes de publicar (libro, pizarra, archivo y acceso de la oficina). |
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
