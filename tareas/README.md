# Portada, cuentas del crew, tablón, cuentas y pizarra · HOT SPOT S.L.

Aplicación propia (Node, sin dependencias) con estas partes:

| Dirección | Qué es |
| --- | --- |
| `https://oficina.hot-spot.es/` | Portada: **CREW** (entrar con Google) o **INVITADO** (solo la calle, sin cuenta). |
| `https://oficina.hot-spot.es/cuentas/` | Entrar con Google y proveedor de identidad (OpenID Connect) de la oficina. |
| `https://oficina.hot-spot.es/tareas/` | Tablón de tareas. |
| `https://oficina.hot-spot.es/tareas/libro/` | Libro de cuentas de los socios. |
| `https://oficina.hot-spot.es/tareas/pizarra/` | Pizarra compartida (la de la sala de reuniones). |
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
| `servidor/perfil.js` | Cumpleaños («MM-DD»), qué día es hoy en la oficina y el personaje de cada uno. |
| `publico/` | Las pantallas (tablón, `libro/`, `pizarra/` y `oficina/`): HTML, CSS y módulos de JavaScript sin compilar. |
| `pruebas/` | Las pruebas que se pasan en GitHub antes de publicar (tablón, libro, pizarra, cumpleaños y personaje, y acceso de la oficina). |
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

- **Al día:** se actualiza con los avisos en directo del tablón; cada minuto recuenta las tareas (a medianoche
  cambian «hoy» y «atrasadas») y cada 10 minutos vuelve a preguntar qué día es y quién cumple. Sin sesión vuelve a
  probar cada vez más espaciado (1, 2, 4… hasta 15 minutos) y al momento si se vuelve a la pestaña o se entra en el
  tablón en ese navegador.
- **Aviso de cumpleaños:** lo saca él mismo (`WA.ui.banner.openBanner`, amarillo, se cierra a mano): «¡Hoy es el
  cumple de Diego!», «…de Diego y Víctor!» y, a quien cumple, «¡Feliz cumpleaños, Diego!». Una vez al día en cada
  navegador: el día visto lo recuerda en su `localStorage`, porque el mapa no puede recordar nada.
- **Fuera de la oficina** (sin `WA`: abierta en una pestaña, o en local) no hace nada ni pide `/iframe_api.js`.
- **Ligero y con la misma CSP** que las demás pantallas (`script-src 'self'`): sin interfaz, solo 4 módulos pequeños
  (`publico/app/oficina.js` y los que ya usa el tablón). `/iframe_api.js` pasa porque es de la misma web.

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
