# HOT-SPOT HQ · versión propia de la oficina

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
| `01-marca-basica.patch` | Título, descripción y nombre de la aplicación «HOT-SPOT HQ»; quita el «Powered by WorkAdventure». |

## Actualizar WorkAdventure

1. Cambiar `WA_VERSION` en el flujo de trabajo por la nueva versión (debe ser la misma que usa el servidor
   para `back` y `map-storage`).
2. Comprobar que los parches siguen aplicando; si alguno falla, rehacerlo sobre la nueva versión.

## Licencia

WorkAdventure se distribuye con licencia AGPL v3 + Commons Clause. Esta personalización se publica en
este repositorio para cumplir con ella.
