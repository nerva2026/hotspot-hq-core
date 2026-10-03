# HOT-SPOT HQ · versión propia de la oficina

Para los usuarios, la oficina se llama **HOT SPOT S.L.**; «HOT-SPOT HQ» es solo el nombre interno del proyecto.

Esta rama (`hotspot`) contiene **solo la personalización** de la oficina virtual de HOT SPOT
(https://oficina.hot-spot.es), que funciona sobre [WorkAdventure](https://github.com/workadventure/workadventure).

No guarda el código entero de WorkAdventure. Cada vez que se sube un cambio a esta rama, GitHub:

1. descarga la versión oficial de WorkAdventure indicada en `WA_VERSION`
   (`.github/workflows/hotspot-imagen.yml`);
2. aplica, por orden, los parches de `parches/`;
3. copia encima los archivos de `archivos/` (misma estructura de carpetas que WorkAdventure);
4. construye la imagen `play` y la publica como `ghcr.io/nerva2026/hotspot-hq-play`
   (etiquetas `latest` y `<versión>-hq.<número de compilación>`).

El servidor usa esa imagen en lugar de la oficial para el servicio `play`. El resto de servicios
(`back`, `map-storage`, `uploader`…) siguen siendo los oficiales de la misma versión.

## Parches

| Parche | Qué cambia |
| --- | --- |
| `01-marca-basica.patch` | Título, descripción y nombre de la aplicación: «HOT SPOT S.L.»; quita el «Powered by WorkAdventure». |
| `02-textos-es.patch` | Textos de la interfaz en español: «WorkAdventure» pasa a «la oficina» o «HOT SPOT S.L.». |
| `03-estilo-retro.patch` | Carga `hotspot-retro.css` (estilo retro: colores, letras pixeladas, esquinas rectas) y pone la marca y la fachada en las pantallas de carga y acceso. |
| `04-munecos.patch` | Los muñecos propios (texturas `hs-…`) se ven al doble y apoyados en los pies, con el nombre más alto, para que sean iguales que los personajes del mapa. |
| `05-direcciones-cortas.patch` | Direcciones cortas: `oficina.hot-spot.es/calle`, `/oficina` y `/terraza` (lista en `play/src/pusher/services/HotspotSalas.ts` y `play/src/front/Url/HotspotSalas.ts`). Son alias: por dentro la sala sigue siendo `/~/hotspot/…` (la que entiende el servidor «back», que es el oficial); el navegador enseña la corta y quita el `#from-…` al entrar. |
| `06-version.patch` | Número de versión abajo a la izquierda (`v0.4.0`), discreto y **pulsable**, y aviso «¡Bienvenido a la v0.4.0!» con las novedades: sale una sola vez por versión (se apunta en `localStorage`), ya dentro del mapa (no encima de las pantallas de nombre, muñeco o cámara, ni del tutorial de WorkAdventure), se cierra con el botón, con Esc o pulsando fuera, y vuelve a abrirse al pulsar la versión. El parche solo engancha `<Novedades />` en `GameOverlay.svelte`; el componente está en `archivos/play/src/front/Components/Hotspot/Novedades.svelte` y **la versión y la lista de novedades se editan en `novedades.ts`, en la misma carpeta** (al cambiar `VERSION`, el aviso vuelve a salir una vez a cada persona). |
| `07-solo-crew.patch` | La oficina y la terraza son solo para el crew: exigen haber entrado con cuenta (y el servidor rechaza a quien se lo salte, mandándolo a la portada). Al cerrar sesión se pasa por `/cuentas/salir`. Solo se activa si `OPENID_CLIENT_ID` está configurado. |
| `08-acciones.patch` | Lo que hace el muñeco y lo que lleva en la mano, según dos variables públicas del jugador que pone el script del mapa: `accion` (una postura y, si se quiere, un efecto unidos con «+»: `bailar`, `sentado:<dirección>`, `saludar`, `aplaudir`, `beber`, `quieto`; efectos `notas`, `gotas`, `nube`, `burbujas`, `zetas`, `corazones`, `chispas` y los gestos `mano` y `palmas`, que valen con cualquier postura: `sentado:abajo+mano` saluda sin levantarse) y `lleva` (`lata`, `cafe`, `agua`, `cana`, `snack`, `disco`). Sentado, a los dibujos del muñeco se les recortan las piernas, bajan lo recortado y llevan delante unas piernas de sentado del color de su pantalón (de frente, de lado o de espaldas); quien deja de estar sentado sin andar (se levanta con la X) queda de pie mirando hacia donde miraba el asiento, hasta que ande o gire; `saludar` lleva la mano de serie y `aplaudir`, unas palmas con un destello al chocar. Las posturas solo se ven con el muñeco quieto; un valor que no se entiende es «nada» (una imagen anterior a este cambio toma `+mano` y `+palmas` por «nada»: hay que publicar la imagen antes que el mapa que los usa). El dibujo está en `archivos/play/src/front/Phaser/Entity/Acciones.ts`; el parche solo lo engancha en `Character`, `GameScene`, `RemotePlayersRepository` y `PlayerVariablesManager`. |
| `09-coleccion-entidades.patch` | Arregla la barra que faltaba en `GameScene.getCustomEntityCollectionUrl`: con `PUBLIC_MAP_STORAGE_URL=https://…/map-storage`, WorkAdventure pedía `/map-storageassets/entities/entities.json` (el «error de la colección de entidades» del editor de mapas). Ahora la dirección sale bien; da 404 mientras no se suba ninguna entidad propia, que es lo normal. |
| `10-personaje.patch` | El muñeco y el compañero. **(a)** Con cuenta y sin muñeco guardado (ni en el navegador ni en la cuenta) sale la pantalla de elegir muñeco; antes se entraba con el gris por defecto porque `LocalWokaService.fetchWokaDetails([])` daba la lista vacía por buena. **(b)** Se guardan con la cuenta del tablón: al entrar con cuenta se lee `GET /tareas/api/yo/personaje` (2 s como máximo) y, si trae muñeco, manda sobre el del navegador (así es el mismo en todos los aparatos); al elegir o cambiar muñeco o compañero se guarda con `PUT` (el tablón exige la cabecera `X-Tablon: 1`). Si la API no responde (sin sesión, 401, 404, sin red o tiempo), todo sigue como antes, sin avisos ni errores visibles, y en esa visita no se guarda nada en la cuenta. Sin cuenta (invitados, modo anónimo) no se llama a la API. La lógica está en `archivos/play/src/front/Connection/PersonajeCuenta.ts`; el parche solo la engancha en `ConnectionManager` y `GameManager`. |
| `11-teclas.patch` | Las teclas X, B, H, G y V (que WorkAdventure no usa) llegan al script del mapa como el evento `hs:tecla`, con `{ code }`: `WA.event.on("hs:tecla")`. Solo con el teclado del juego activo (no al escribir en el chat ni en un campo), sin Ctrl, Alt ni ⌘ y fuera del editor de mapas. Qué hace cada una lo decide el mapa (hoy: X sentarse, B bailar, H saludar, G soltar lo que se lleva). |
| `12-volver-a-hablar.patch` | Al dejar un estado en el que el servidor no deja hablar (salir de una zona silenciosa, pulsar «Activar sonido» cuando el navegador lo había bloqueado, volver de «No molestar»…), la oficina vuelve a decirle al servidor dónde está el jugador para que lo junte con quien tenga al lado. Antes había que dar un paso para volver a hablar. |
| `13-burbujas.patch` | Las burbujas de «decir» y «pensar» se apoyan por abajo justo encima del nombre del muñeco. Antes iban centradas en un punto fijo: con dos líneas o más crecían hacia abajo y tapaban el nombre (y el pico de la burbuja). Además, la letra de las burbujas se pone a un tamaño que cae en puntos enteros de la pantalla (las burbujas se amplían con el juego y, con una ampliación que no es entera, la letra de píxeles salía emborronada). Cómo se ven (letra, borde, pico) está en `hotspot-retro.css`. |
| `14-tecla-espacio.patch` | En los avisos («Pulsa ESPACIO para…», «Pulse ESPACIO o toque aquí…») la palabra `ESPACIO` (tal cual, en mayúsculas y entera) sale dibujada como una tecla, igual que las de la pastilla de ayuda del mapa: amarilla, con la letra en tinta y el canto de abajo más oscuro. En los avisos de abajo (`PopUpTriggerActionMessage`, el de `WA.ui.displayActionMessage`; `PopupCowebsite`, el de una zona que abre un panel; y `PopUpTab`, `PopUpJitsi` y `FilePopup`) y en el aviso junto al muñeco (`SpeechDomElement`, `.characterTriggerAction`). El texto del aviso no se convierte en HTML: se parte en trozos y la tecla va en un `<span class="hs-tecla">` (el texto entero, `textContent`, es el mismo). El parche solo engancha: los trozos están en `archivos/play/src/front/Components/Hotspot/teclas.ts`, el componente en `TextoConTeclas.svelte` (misma carpeta) y el estilo (`.hs-tecla`) en `hotspot-retro.css`. |

## Archivos propios (`archivos/`)

- `play/src/front/style/hotspot-retro.css`: el estilo retro de la interfaz, con las burbujas de «decir» y «pensar», los
  avisos junto al muñeco, la tecla ESPACIO de los avisos (`.hs-tecla`) y el texto del chat en las letras de la casa.
- `play/public/static/fonts/hotspot/`: letras Silkscreen y Pixelify Sans (licencia OFL, incluida).
  Los archivos `hs-retoques-*.woff` son **los retoques de las letras**: unas cifras claras para las dos letras (el 5 de
  Pixelify Sans era igual que la S y el 4 de Silkscreen parecía otra letra) y, en Pixelify Sans, la B, la C, la G, la
  «a», la «c» (se cerraba como una «o»), la «e» (con la barra a medias y cerrada por la derecha, parecía una «a» o un 8; con ella, la «é» y la «è»), la «j», la Z (era el dibujo de un 2), la E (redonda, casi un €), la «f» y la «t» (dejaban un hueco detrás), la «í» (su tilde parecía el punto de la «i»), los paréntesis y el €, que se confundían. Los dibuja `herramientas/retoques.py` (Python 3 con fontTools) y los deja aquí y en
  `tareas/publico/fuentes/`; el CSS los declara con el mismo nombre de familia que la letra a la que acompañan y
  `unicode-range` (ver el principio de `hotspot-retro.css`).
- `play/public/static/images/hotspot/`: marca provisional (mientras llega el logo) y fachada de la calle.
- `play/public/resources/characters/hotspot/` y `play/src/pusher/data/woka.json`: los muñecos de HOT SPOT (24 ya hechos y piezas para personalizar: piel, pelo, ropa, cabeza y complementos). Se generan con `herramientas/wokas_hs.py` del repositorio del mapa.

## Portada, cuentas del crew, tablón y pantallas de la oficina (`tareas/`)

Aplicación aparte, con su propia imagen (`ghcr.io/nerva2026/hotspot-hq-tareas`):

- `oficina.hot-spot.es/` — portada: CREW (entrar con Google) o INVITADO (solo la calle).
- `oficina.hot-spot.es/cuentas/` — entrar con Google y proveedor de identidad (OpenID Connect) de la oficina.
- `oficina.hot-spot.es/tareas/` — tablón de tareas, con el panel «Crew» para decidir quién puede entrar, los
  cumpleaños de cada uno y el personaje (muñeco y compañero) guardado con la cuenta.
- `oficina.hot-spot.es/tareas/libro/` — libro de cuentas de los socios.
- `oficina.hot-spot.es/tareas/pizarra/` — pizarra compartida (la de la sala de reuniones).
- `oficina.hot-spot.es/tareas/archivo/` — archivo de documentos del crew (la sala ARCHIVO).
- `oficina.hot-spot.es/tareas/musica/` — cabina de música con Spotify; `/tareas/musica/mini/` es su reproductor
  pequeño para abrirlo en la oficina.
- `oficina.hot-spot.es/tareas/oficina/` — puente invisible: lo abre el mapa para leer el tablón de quien juega.

Detalles en [`tareas/README.md`](tareas/README.md).

## Comprobar una rama antes de fusionarla

`.github/workflows/hotspot-comprobar.yml` se pasa solo en las ramas `oficina-v*` y en las PR hacia `hotspot`: aplica los
parches y los archivos propios, comprueba los tipos (`tsc` y `svelte-check`, que la construcción de verdad no pasa) y
construye la imagen **sin publicarla** (no entra en ningún registro y solo tiene permiso de lectura).

## Actualizar WorkAdventure

1. Cambiar `WA_VERSION` en el flujo de trabajo por la nueva versión (debe ser la misma que usa el servidor
   para `back` y `map-storage`).
2. Comprobar que los parches siguen aplicando; si alguno falla, rehacerlo sobre la nueva versión.

## Licencia

WorkAdventure se distribuye con licencia AGPL v3 + Commons Clause. Esta personalización se publica en
este repositorio para cumplir con ella.
