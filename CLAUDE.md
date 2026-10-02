# Notas para Claude · oficina de HOT SPOT S.L. (rama `hotspot`)

Esta rama es la personalización de la oficina virtual de HOT SPOT S.L. (https://oficina.hot-spot.es),
hecha sobre WorkAdventure v1.33.10 autoalojado. La llevan Diego y Víctor, socios de HOT SPOT. Los mapas
están en otro repositorio: `nerva2026/hotspot-hq-mapa` (con su propio `CLAUDE.md`).

## Cómo trabajar

- Idioma: castellano, en la interfaz y en el código (nombres, comentarios, commits).
- Para quien la usa, la oficina se llama **HOT SPOT S.L.**; «HOT-SPOT HQ» o «hq» es solo el nombre interno.
- Los textos visibles se deciden con el equipo: no inventar cifras, nombres ni contenido.
- Estilo: pixel art retro (tipo Habbo). Paleta: tinta `#1c1715`, crema `#f3e6d8`, naranja `#e0562a`,
  acento `#c4461f`, amarillo `#ffd84a`. Letras Silkscreen (títulos) y Pixelify Sans (texto), sin ligaduras
  (Pixelify dibuja «fi» como una A).
- **El servidor no es accesible desde Claude.** Lo que haya que hacer allí se prepara como un bloque para
  pegar en la consola (escrito a un archivo y ejecutado con `bash`, con copias `*.antes-…` de lo que toca),
  se prueba antes en seco con un `docker` falso y lo ejecuta una persona del equipo.
- Nunca poner contraseñas, secretos ni el `.env` en el repositorio.

## Qué hay en esta rama

| Ruta | Qué es |
| --- | --- |
| `parches/01…10-*.patch` | Cambios sobre WorkAdventure, en orden (tabla en `README.md`). |
| `archivos/` | Archivos propios que se copian encima (estilo retro, letras, marca, muñecos `hs-…`). |
| `.github/workflows/hotspot-imagen.yml` | Construye la imagen `ghcr.io/nerva2026/hotspot-hq-play` (~7 min). |
| `tareas/` | Servicio propio (Node sin dependencias): portada `/`, cuentas del crew `/cuentas`, tablón `/tareas` (con el cumpleaños y el personaje de cada uno: `/tareas/api/oficina`, `/tareas/api/yo/personaje`), libro de cuentas `/tareas/libro/`, pizarra `/tareas/pizarra/`, archivo de documentos `/tareas/archivo/`, música `/tareas/musica/` (cabina del DJ con Spotify, «escuchar a la vez» con el reproductor oficial; `musica/mini/` es la barra pequeña de 360×128 para la oficina; hace falta crear la aplicación de Spotify, ver «Música (Spotify)»), el puente invisible de la oficina `/tareas/oficina/` (la abre el mapa y deja las tareas y los cumpleaños de quien juega en las variables privadas `hsSesion`, `hsTareas`, `hsCumples` y `hsMusica`; esta última dice si Spotify está conectado y de ella depende el botón «Música» y la línea de la música en las novedades) y el cartel de cumpleaños `/tareas/cumples/` (lo abre el mapa desde el calendario del hall, en un panel: todos los cumpleaños del crew y el propio). Detalles en `tareas/README.md`. |
| `.github/workflows/hotspot-tareas.yml` | Prueba y construye `ghcr.io/nerva2026/hotspot-hq-tareas` (~1 min): una prueba por pantalla (cada paso con su servidor y su puerto, ver «Las pruebas de `tareas/`») e incluye una con `openid-client` 5 (la librería de WorkAdventure). |

### Hacer o cambiar un parche

1. Clonar la versión oficial: `git clone --depth 1 --branch v1.33.10 https://github.com/workadventure/workadventure.git`.
2. Aplicar en orden los parches anteriores y hacer un commit temporal.
3. Editar, y sacar el parche con `git diff` (o `git add -A && git diff --cached` si hay archivos nuevos).
4. Comprobar que toda la cadena aplica sobre una copia limpia (`git apply` de 01 a N).
5. La comprobación de tipos de verdad la hace la construcción en GitHub.

### Probar `tareas/` en local

```sh
cd tareas
node pruebas/google-falso.mjs &            # Google de mentira en :8412
TAREAS_DATOS=/tmp/t TAREAS_PUERTO=8413 TAREAS_URL=http://localhost:8413/tareas/ \
GOOGLE_CLIENT_ID=cliente-google GOOGLE_CLIENT_SECRET=secreto-google \
GOOGLE_AUTH_URL=http://localhost:8412/auth GOOGLE_TOKEN_URL=http://localhost:8412/token \
OIDC_SECRETO=x OIDC_REDIRECCIONES=http://localhost:9999/openid-callback CREW_ADMIN=admin@example.com \
node servidor/principal.js
# http://localhost:8412/usar?correo=… cambia con qué correo «entra» el Google de mentira
```

### Las pruebas de `tareas/`

Una por pantalla, en `tareas/pruebas/`. En el workflow cada paso arranca su propio servidor (con su carpeta de
datos y su puerto, ninguno repetido) y lo para al acabar; los comandos exactos están en
`.github/workflows/hotspot-tareas.yml` y la tabla, en `tareas/README.md` («Las pruebas»).

| Paso | Archivo | Puerto |
| --- | --- | --- |
| Probar el servidor | `curl` | 3999 |
| Probar el libro de cuentas | `libro.mjs` | 3991 |
| Probar el archivo | `archivo.mjs` | 3992 |
| Probar el tablón | `tablon.mjs` | 3993 |
| Probar cumpleaños y personaje | `cumple.mjs` (con `TAREAS_HOY` fijo) | 3994 |
| Probar la música | `musica.mjs` + `spotify-falso.mjs` | 3995 (3996 lo arranca la prueba) y 8614 |
| Probar la pizarra | `pizarra.mjs` | 3997 |
| Probar el modo solo | `solo.mjs` (`?solo=1`, sin navegador) | 3990 |
| Probar el acceso de la oficina | `oficina-oidc.mjs` + `google-falso.mjs` (instala `openid-client`) | 3998 y 8412 |

Una prueba nueva lleva su puerto, su carpeta de datos y su registro propios. Y una pantalla nueva se enlaza en las
demás (pestañas de arriba y menú de la cuenta, con los nombres de siempre: «Tablón de tareas», «Libro de cuentas»,
«Pizarra», «Archivo» y «Música»), marcando cada enlace con la clase `otra-pantalla`: con `?solo=1` (como las abre el
mapa desde un personaje o un objeto) esos enlaces no salen. Detalles en `tareas/README.md` («Solo lo suyo»).
El cartel de cumpleaños (`/tareas/cumples/`) y el puente (`/tareas/oficina/`) no se enlazan: solo los abre el mapa.

## El servidor (VPS en Hostinger)

- `/opt/workadventure`: WorkAdventure oficial con Docker Compose y Traefik v3 (`docker-compose.yaml`, `.env`).
  - El servicio `play` usa nuestra imagen `ghcr.io/nerva2026/hotspot-hq-play:latest`; `back`,
    `map-storage`, etc. son los oficiales de la misma versión.
  - `.env` tiene el acceso con cuenta: `OPENID_CLIENT_ID=oficina`, `OPENID_CLIENT_SECRET` (igual que
    `OIDC_SECRETO` del tablón), `OPENID_CLIENT_ISSUER=http://tareas:3000/cuentas`,
    `OPENID_WOKA_NAME_POLICY=force_opid`.
  - Traefik: el router `hq-entrada` (prioridad 1000) manda `/_/…` a la calle; la portada `/` la sirve
    `tareas` con prioridad 1100.
- `/opt/hotspot-tareas`: `docker-compose.yaml` del servicio `tareas` (en la red de Traefik, rutas `/`,
  `/cuentas`, `/tareas`), `.env` con las claves (Google, Spotify, OIDC, primer admin; permisos 600) y `datos/`
  (`tablon.json`, copias diarias en `copias/`, `clave-oidc.pem`, y de las pantallas: `pizarras.json` y `pizarra/`,
  `musica.json` y `archivo/`).
- Actualización sola cada 5 minutos: `/etc/cron.d/hotspot-oficina` (imagen `play`) y
  `/etc/cron.d/hotspot-tareas` (imagen `tareas`). Un push a esta rama llega solo a la oficina.
- Los paquetes de `ghcr.io` son públicos (si no, el servidor no puede descargarlos).

## Cosas de WorkAdventure que conviene saber

- El servidor `back` solo acepta salas `/~/…` y `/_/…`: las direcciones cortas (`/oficina`) son alias
  (parche 05).
- Muñecos: texturas de 96×128 (3×4 fotogramas de 32×32; filas abajo, izquierda, derecha, arriba).
- `WA.room.website.create` se coloca en píxeles del mapa; `WA.state` necesita objetos de tipo «variable»
  en el mapa; los iframes transparentes necesitan `color-scheme: dark` para no salir con fondo blanco.
- Google no deja entrar desde un marco (iframe): por eso el tablón abre Google en una pestaña si está
  dentro de la oficina.

## Pendiente (ideas, sin decidir)

- Audio y vídeo en grupo (LiveKit / TURN).
- Logo de verdad (`archivos/play/public/static/images/hotspot/marca.png` es provisional).
- Fase 2 de la interfaz retro (paneles claros, burbujas de chat).
- Error de la colección de entidades del editor de mapas (URL mal formada por la configuración).
