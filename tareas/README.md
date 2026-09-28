# Portada, cuentas del crew y tablón de tareas · HOT SPOT S.L.

Aplicación propia (Node, sin dependencias) con tres partes:

| Dirección | Qué es |
| --- | --- |
| `https://oficina.hot-spot.es/` | Portada: **CREW** (entrar con Google) o **INVITADO** (solo la calle, sin cuenta). |
| `https://oficina.hot-spot.es/cuentas/` | Entrar con Google y proveedor de identidad (OpenID Connect) de la oficina. |
| `https://oficina.hot-spot.es/tareas/` | Tablón de tareas. |

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
| `publico/` | La interfaz del tablón: HTML, CSS y módulos de JavaScript sin compilar. |
| `portada/` | La portada (CREW / INVITADO) y el estilo de las pantallas de acceso. |

Las tareas borradas pasan 30 días en una papelera interna (el aviso «Deshacer» las recupera).

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
