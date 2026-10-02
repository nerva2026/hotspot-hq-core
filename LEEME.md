# Guiones del servidor de la oficina

Rama aparte (no publica nada): los guiones de la v0.3 para descargarlos en el VPS con una línea en vez de pegarlos. Sin secretos.

## Conversaciones (v0.3.1): `hotspot-v031-conversaciones.sh`

**Qué cambia.** Hoy, para hablar con alguien hay que pararse casi pegado a él (a dos casillas) y en un corro caben cuatro
personas; con esto basta con pararse a menos de cuatro casillas, el corro abarca una mesa entera y caben ocho, así que la mesa
de reuniones, los sofás y las mesas de la cocina quedan en una sola conversación.

**Cómo notar si va mal.** Si dos personas quietas, una al lado de la otra, no se oyen; si se oye sin querer a gente de otra
sala; o si con seis u ocho a la vez el vídeo va a tirones: se vuelve a como estaba con la orden de «deshacer» de abajo.

Mejor a una hora tranquila: al aplicar (y al deshacer) se corta unos segundos la llamada de quien esté dentro, que se reconecta
solo. Después, que cada persona recargue la página una vez (F5) para que el aro del corro se dibuje con el tamaño nuevo.

Las órdenes, de una en una (cada una cabe en una línea: la consola web corta los textos largos al pegarlos).

1. Descargar:

```sh
curl -fsSL -o /root/hotspot-v031-conversaciones.sh https://raw.githubusercontent.com/nerva2026/hotspot-hq-core/guiones-servidor/hotspot-v031-conversaciones.sh
```

2. Comprobar que ha llegado entero (tiene que salir `d5dc3169460401c0cae7e4af4cb3a5cd`):

```sh
md5sum /root/hotspot-v031-conversaciones.sh
```

3. En seco (no cambia nada: cuenta qué hay y qué haría):

```sh
bash /root/hotspot-v031-conversaciones.sh
```

4. Aplicar:

```sh
bash /root/hotspot-v031-conversaciones.sh --aplicar
```

5. Deshacer (volver a los valores de serie de WorkAdventure):

```sh
bash /root/hotspot-v031-conversaciones.sh --deshacer
```

Si el paso 3 acaba con algún `[FALLA]`, no sigas: lo que falla está escrito al lado. Si el paso 4 acaba con `[FALLA]`, ejecuta
el 5.

### Qué hace

Cambia tres líneas del `.env` de WorkAdventure (`/opt/workadventure/.env`; antes hace una copia `.env.antes-<fecha>` en la
misma carpeta) y vuelve a crear solo los contenedores `back` y `play`, que son los que las leen (`docker compose up -d --no-deps
back play`). Al final comprueba que los dos han arrancado, que corren con los valores nuevos y que la oficina responde. Se
puede repetir: lo que ya está hecho se salta. Del `.env` solo enseña esas tres líneas.

| Variable (píxeles del mapa; una casilla son 32) | De serie | Recomendada (la que pone) | Prudente |
| --- | --- | --- | --- |
| `MINIMUM_DISTANCE`: al pararse a esta distancia o menos de otra persona libre se forma un corro | 64 | 120 | 96 |
| `GROUP_RADIUS`: se entra en un corro al pararse a esta distancia o menos de su centro; se sale al alejarse más | 48 | 112 | 96 |
| `MAX_PER_GROUP`: personas como mucho en un corro | 4 | 8 | 6 |

La prudente (mesas de hasta seis, menos conexiones por navegador, menos alcance a través de las paredes), también en una línea:

```sh
MINIMUM_DISTANCE=96 GROUP_RADIUS=96 MAX_PER_GROUP=6 bash /root/hotspot-v031-conversaciones.sh --aplicar
```

### Lo que conviene saber

- **No hay LiveKit ni TURN**: la llamada va directa entre navegadores, y en un corro de 8 cada navegador mantiene 7 conexiones
  (28 entre todos; con 4 eran 3 y 6). Si va a tirones, cámaras fuera o la combinación prudente.
- **Los corros no se funden nunca** (WorkAdventure no lo hace): si la gente entra en tropel a sentarse pueden salir dos corros en
  la misma mesa. Entrando de uno en uno sale uno solo. Para juntarlos sin levantarse: los del corro pequeño se ponen «No
  molestar» y lo quitan de uno en uno (sale de leer el código y de simularlo: falta probarlo en la oficina de verdad).
- Para dejar de hablar con alguien hay que alejarse más que antes: una pareja se corta al separarse más de 7 casillas (antes, 3).
- El aro que se dibuja en el suelo crece (su radio es `MINIMUM_DISTANCE`: de 2 a 3,75 casillas).
- Si el `docker-compose.yaml` del servidor no le pasa alguna de las tres variables a `back`, el guion lo dice y no cambia nada.
