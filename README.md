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
| `06-version.patch` | Número de versión discreto abajo a la izquierda (`v0.2.0-alpha`; se cambia en `play/index.html` dentro del parche). |
| `07-solo-crew.patch` | La oficina y la terraza son solo para el crew: exigen haber entrado con cuenta (y el servidor rechaza a quien se lo salte, mandándolo a la portada). Al cerrar sesión se pasa por `/cuentas/salir`. Solo se activa si `OPENID_CLIENT_ID` está configurado. |
| `08-acciones.patch` | Los muñecos se ven sentados y bailando, según la variable pública `accion` del jugador (la pone el script del mapa: `"bailar"`, `"sentado:<dirección>"` o nada). Sentado: quieto, mirando hacia el asiento y unos píxeles más abajo. Bailar: bota con ritmo (todos a la vez, por el reloj), cambia de lado cada dos tiempos y le suben notas musicales naranjas y amarillas. Solo mientras está quieto; al andar vuelve a lo normal. Lo dibuja `play/src/front/Phaser/Entity/Acciones.ts`, con unas pocas líneas de enganche en `Character`, `GameScene`, `RemotePlayersRepository` y `PlayerVariablesManager`. |

## Archivos propios (`archivos/`)

- `play/src/front/style/hotspot-retro.css`: el estilo retro de la interfaz.
- `play/public/static/fonts/hotspot/`: letras Silkscreen y Pixelify Sans (licencia OFL, incluida).
- `play/public/static/images/hotspot/`: marca provisional (mientras llega el logo) y fachada de la calle.
- `play/public/resources/characters/hotspot/` y `play/src/pusher/data/woka.json`: los muñecos de HOT SPOT (24 ya hechos y piezas para personalizar: piel, pelo, ropa, cabeza y complementos). Se generan con `herramientas/wokas_hs.py` del repositorio del mapa.

## Portada, cuentas del crew y tablón de tareas (`tareas/`)

Aplicación aparte, con su propia imagen (`ghcr.io/nerva2026/hotspot-hq-tareas`):

- `oficina.hot-spot.es/` — portada: CREW (entrar con Google) o INVITADO (solo la calle).
- `oficina.hot-spot.es/cuentas/` — entrar con Google y proveedor de identidad (OpenID Connect) de la oficina.
- `oficina.hot-spot.es/tareas/` — tablón de tareas, con el panel «Crew» para decidir quién puede entrar.

Detalles en [`tareas/README.md`](tareas/README.md).

## Actualizar WorkAdventure

1. Cambiar `WA_VERSION` en el flujo de trabajo por la nueva versión (debe ser la misma que usa el servidor
   para `back` y `map-storage`).
2. Comprobar que los parches siguen aplicando; si alguno falla, rehacerlo sobre la nueva versión.

## Licencia

WorkAdventure se distribuye con licencia AGPL v3 + Commons Clause. Esta personalización se publica en
este repositorio para cumplir con ella.
