# Banco de pruebas · la oficina funcionando de verdad

Los parches compilan (`hotspot-comprobar.yml`), pero compilar no es funcionar. El banco **arranca WorkAdventure entero
en un ejecutor de GitHub Actions** —la instalación de producción con Docker Compose y Traefik, la misma clase de
instalación que la oficina de verdad—, con **nuestra imagen `play`** (parches + `archivos/`), y lo maneja con Playwright:
entra en un mapa de prueba, pulsa teclas, junta a dos jugadores en una llamada, mide la barra de botones y saca capturas.

El banco **no publica nada**: la imagen se construye y se carga en el Docker del propio ejecutor (ningún registro), y no
toca la rama `hotspot` (la que actualiza la oficina de verdad). Las claves que usa son de mentira y van en claro.

## Cómo se dispara

- Con un `push` a la rama **`banco-pruebas`** (o a mano, con «Run workflow»: `workflow_dispatch`).
- Para probar una rama de trabajo: llevar sus `parches/` y `archivos/` a `banco-pruebas` y subirla
  (`git checkout banco-pruebas && git merge oficina-vX && git push origin banco-pruebas`).
- Tarda unos 10 minutos la primera vez (construir la imagen) y bastante menos con la caché.

El flujo es `.github/workflows/hotspot-banco.yml`. Hace esto:

1. Descarga WorkAdventure (`WA_VERSION`), aplica `parches/*.patch` y copia `archivos/` encima, igual que la imagen de verdad.
2. Copia el banco dentro: el mapa de prueba a `maps/tests/banco/` (lo sirve el contenedor `maps` de las pruebas de
   WorkAdventure en `maps.workadventure.localhost`), las especificaciones a `tests/tests/banco/` y `docker-compose.banco.yaml`
   a `contrib/docker/`.
3. Construye la imagen `hotspot-play:banco` (`push: false`, `load: true`).
4. Arranca `docker-compose.prod.yaml` + `tests/docker-compose.test.yaml` (los dos, de WorkAdventure) +
   `docker-compose.banco.yaml` (el nuestro: solo cambia la imagen de `play`). Las demás imágenes (`back`, `map-storage`…)
   son las oficiales de la misma versión.
5. Pasa las pruebas con Chromium (cámara y micrófono de mentira, navegador en castellano, 1280×800) contra
   `https://play.workadventure.localhost` (certificado autofirmado de Traefik).
6. Escribe el informe y lo deja, con las capturas, en la rama **`banco-resultados`**.

## Cómo se leen los resultados

Lo importante sale de dos formas:

- **Anotaciones** de la ejecución (se ven en la página de la ejecución y se leen con la API sin descargar nada): una por
  punto, con «BIEN», «MAL» o «NO SE PUDO» en el título y el dato de cada comprobación.

  ```sh
  gh api "repos/nerva2026/hotspot-hq-core/actions/runs?per_page=5"          # las últimas ejecuciones
  gh api repos/nerva2026/hotspot-hq-core/actions/runs/<id>/jobs             # el estado de cada paso
  gh api repos/nerva2026/hotspot-hq-core/check-runs/<id del job>/annotations  # las anotaciones
  ```

- La rama **`banco-resultados`** (se sustituye entera en cada ejecución; `ejecucion.txt` dice de cuál es):

  ```sh
  git fetch origin +banco-resultados:refs/remotes/origin/banco-resultados
  git worktree add --detach ../banco-resultados origin/banco-resultados     # o `git show origin/banco-resultados:informe.md`
  ```

  | Archivo | Qué es |
  | --- | --- |
  | `informe.md` | La tabla punto por punto, con el dato exacto de cada comprobación y sus capturas. |
  | `informe.json` | Lo mismo, para leerlo con un programa. |
  | `capturas/` | Las capturas (PNG). El nombre empieza por el punto: `3-accion-bailar-1.png`, `6-barra-en-llamada-1280x800.png`… |
  | `apuntes.jsonl` | Lo que apunta cada prueba, una línea por comprobación (de ahí sale el informe). |
  | `registros/` | Las últimas 400 líneas de cada contenedor (`play`, `back`, `reverse-proxy`…) y el estado de todos. |
  | `diagnostico/` | La consola del navegador de cada jugador y trozos del DOM (la barra, la página en llamada). |
  | `playwright.json` | El resultado de Playwright (qué prueba acabó y cómo). |

Los resultados de cada comprobación:

- **bien**: hace lo que tiene que hacer.
- **mal**: la oficina no hace lo que debe (hay que arreglar un parche o un archivo de `archivos/`).
- **no se pudo**: el banco no llegó a comprobarlo (el error y una captura del momento van en el informe).
- **dato**: un sondeo; no hay bien ni mal, solo lo que se ha medido.

El job termina en rojo si hay algo «mal» o si una prueba revienta; los «no se pudo» salen como aviso.

## Qué comprueba

| Punto | Archivo | Qué |
| --- | --- | --- |
| 0 | `00-sonda.spec.ts` | Que el banco es capaz de juntar a dos jugadores en una llamada (si esto falla, lo demás no vale). |
| 1 | `01-arranca.spec.ts` | Se entra en el mapa con nuestra imagen, abajo a la izquierda pone la versión y sale (y se cierra) el aviso de bienvenida. |
| 2 | `02-teclas.spec.ts` | Parche 11: X, B, H, G y V llegan al script como `hs:tecla` con `{ code }` y sin `senderId`; no llegan con Ctrl/Alt, ni al escribir en «decir» ni en el chat; la E no llega. |
| 3 | `03-acciones.spec.ts` | Parche 08: cada valor de `accion` y de `lleva` (dos capturas separadas 300 ms y la cuenta de píxeles que cambian), y que un valor que no existe no hace nada. |
| 4 | `04-los-demas.spec.ts` | Lo que hace un jugador se ve en la pantalla de otro, también si el otro entra después. |
| 5 | `05-llamada.spec.ts` | En llamada, guardar `accion` o `lleva` no corta la conversación ni mueve a nadie (5 s mirando cada segundo). De paso: escribir en el chat y la captura de un mensaje con su hora. |
| 6 | `06-barra.spec.ts` | Los cinco botones de icono del mapa, sin llamada y en llamada, a 1280×800, 1024×768 y 1440×900: cuáles se ven enteros, cuáles van al menú ☰; que «Invitar» no está; que el `callback` salta; que `addButton` con el mismo `id` sustituye en su sitio. |
| 7 | `07-volver-a-hablar.spec.ts` | Parche 12: al dejar un estado que no deja hablar, sin moverse nadie, la llamada vuelve sola. |
| 8 | `08-letras.spec.ts` | Capturas de «decir», «pensar», el nombre y los avisos de zona, con la letra que usa de verdad el navegador; que los retoques `hs-retoques-*.woff` se cargan y que el 5 ya no es igual que la S. |
| 9 | `09-sondeos.spec.ts` | El resultado exacto de la API que usan los mapas: `moveTo`, `proximityMeeting`, `ui.website`, `banner`, `sound`, capas, `setTiles`, `room.website`, zona con panel y zona silenciosa. |

## Qué hay en esta carpeta

| Ruta | Qué es |
| --- | --- |
| `especificaciones/` | Las pruebas de Playwright y `util.ts` (entrar en el mapa, ejecutar dentro del script del mapa, capturas, comparar capturas, apuntar resultados). |
| `banco.config.ts` | La configuración de Playwright. |
| `docker-compose.banco.yaml` | Cambia el servicio `play` por nuestra imagen. |
| `mapa/` | El mapa de prueba (`banco.tmj`), su tileset, los iconos de los botones, un sonido, dos páginas y el script del mapa (`banco.js`). |
| `generar.py` | Genera el mapa, el tileset, los iconos y el sonido (hace falta Pillow). Lo generado va al repositorio. |
| `informe.mjs` | Junta los apuntes en `informe.md` e `informe.json` y saca las anotaciones. |

**El mapa y su script son genéricos**, hechos solo para el banco: este repositorio es público y los mapas de la oficina
(y sus scripts) están en otro, privado. Aquí no hay nada suyo. El script (`mapa/banco.js`) solo se queda escuchando lo
que las pruebas no pueden ver desde fuera (teclas, llamada, movimiento, botones pulsados) y lo apunta en `window.banco`.

## Añadir una comprobación

1. En la especificación del punto, envolverla en `comprobar(punto, clave, título, [páginas], async () => ({ estado, dato, capturas }))`:
   si revienta, se apunta «no se pudo» con una captura y la prueba sigue.
2. Añadir la `clave` a la lista de su punto en `informe.mjs` (`PUNTOS`): así, si un día la prueba no llega hasta ella,
   el informe lo dice en vez de callarlo.
3. Comprobar los tipos antes de subir (ahorra una ejecución): `tsc --noEmit` con `@playwright/test` a mano.

## Lo que el banco no es

- No hay acceso con cuenta (sin `OPENID_CLIENT_ID`): se entra como anónimo y el parche 07 (solo crew) no se activa.
- El mapa se sirve desde `maps.workadventure.localhost` (una sala `/_/…`), no desde el `map-storage` (`/~/…`) como en la
  oficina: el script del mapa corre en el mismo origen que la oficina y no hay menú del editor de mapas.
- Sin LiveKit ni TURN: la llamada es entre dos, de navegador a navegador, en la misma máquina.
- No se oye nada: del sonido solo se comprueba que no falla y que el archivo se pide.
- El tablón (`tareas/`) no está: la línea de la música del aviso de novedades no sale.
