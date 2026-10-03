# Portada, cuentas del crew, tablón, libro de cuentas, pizarra, archivo y música · HOT SPOT S.L.

Aplicación propia (Node, sin dependencias) con estas partes:

| Dirección | Qué es |
| --- | --- |
| `https://oficina.hot-spot.es/` | Portada: **CREW** (entrar con Google) o **INVITADO** (solo la calle, sin cuenta). |
| `https://oficina.hot-spot.es/cuentas/` | Entrar con Google y proveedor de identidad (OpenID Connect) de la oficina. |
| `https://oficina.hot-spot.es/tareas/` | Tablón de tareas. |
| `https://oficina.hot-spot.es/tareas/libro/` | Libro de cuentas de los socios. |
| `https://oficina.hot-spot.es/tareas/pizarra/` | Pizarra compartida (la de la sala de reuniones). |
| `https://oficina.hot-spot.es/tareas/archivo/` | Archivo de documentos del crew (la sala ARCHIVO). |
| `https://oficina.hot-spot.es/tareas/musica/` | La cabina de música: escuchar a la vez lo que pincha alguien del crew (Spotify). |
| `https://oficina.hot-spot.es/tareas/musica/mini/` | El reproductor pequeño (360 × 128 px) para abrirlo en la oficina mientras se anda. |
| `https://oficina.hot-spot.es/tareas/oficina/` | Puente invisible: lo abre el mapa de la oficina, sin enseñarlo, para leer el tablón de quien juega. |
| `https://oficina.hot-spot.es/tareas/cumples/` | El cartel de cumpleaños: lo abre el mapa (el calendario de la pared del hall) en un panel. |

## Crew e invitados

- Solo entran con Google los correos del **crew**: las personas del tablón con correo. Se gestionan en el
  tablón, menú de la cuenta → «Crew» (solo administradores). Si no se pone nombre, se usa el de Google.
- Quien sale del crew pierde al momento la oficina y el tablón (se le cierran sesiones y accesos); sus
  tareas se quedan. En esas tareas sigue saliendo en «Para quién» y «Pedido por» (marcado «fuera del crew»), para
  poder quitarlo; en las demás no se le puede elegir. Y al agrupar por persona (lista y cronograma) o filtrar, tiene
  su grupo mientras le quede alguna (`publico/app/personas.js`).
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
- **Pantallas pequeñas:** con 600 px o menos la cabecera cabe en una línea (las vistas, en un solo botón con el nombre de
  la de ahora y, encima y en pequeño, «Tareas»; los filtros, con la búsqueda, plegados detrás de «Filtros») y, si no hay
  una vista guardada, se abre la lista (por fecha) en vez del tablero. En un móvil estrecho la cabecera se aprieta
  para caber con la vista de nombre más largo («Cronograma»): con menos de 390 px, sin las flechas de «Filtros» y de
  la cuenta; con menos de 360, «+ Nueva» se queda en «+». Ninguna pantalla se desplaza de lado desde 320 px. En el panel de la oficina, de 930 px o más caben
  las cuatro columnas (miden entre 215 y 300 px, sin tocar la letra); en uno de 721 a 929 px «Hecho» se pliega en una
  etiqueta con su número, que se despliega al pulsarla. En un móvil la oficina abre el tablón casi a pantalla completa
  (`src/hq.js` del repositorio de mapas).
- **La lista con 720 px o menos:** no hay columnas que se salgan por la derecha. Cada fila enseña el título entero (hasta
  tres líneas) y, debajo, estado, prioridad, para quién y fecha; «Abrir» está siempre a la vista y un toque en la fila
  (fuera de la casilla) abre la tarea, que es donde se cambia lo demás. Más ancha es la tabla de siempre, que se edita
  en el sitio; donde no hay ratón (`hover: none`) «Abrir» tampoco se esconde.
- **La lista de 721 a 1114 px** (el panel de la oficina, una ventana sin maximizar): la tabla cabe siempre a lo ancho,
  sin cortar ninguna columna por la mitad. Las columnas que no caben se esconden por orden, de la menos importante a la
  más: «Pedido por» (por debajo de 1115 px de ventana), «Etiquetas» (1003), «Empieza» (893) y «Prioridad» (809), que
  sigue viéndose en la franja de color de la fila. El título usa todo el ancho de su columna: «Abrir» no ocupa sitio
  mientras no se ve (sale al pasar el ratón por la fila o al llegar con el teclado, y entonces el título le hace
  hueco), y un título que no cabe se lee entero al pasar el ratón. Título, estado, para quién y para cuándo están siempre; lo demás, en
  la ficha («Abrir»). Los cortes se miden en la caja de la lista (reglas `@container lista` de `publico/estilo.css`):
  cada columna tiene un mínimo y lo que lleva dentro no la ensancha (un nombre largo acaba en «…»), y los cortes dejan
  17 px para la barra de desplazar de un ordenador. Si aun así la
  tabla no cupiera (un navegador sin `@container`), una sombra marca el lado por el que sigue, como en el calendario.
- **Calendario y cronograma:** el calendario se abre desplazado hasta hoy (en un móvil solo caben tres o cuatro días) y
  marca con una sombra el lado por el que sigue; en los dos, el título de una barra que empieza antes del borde visible
  se corre hasta lo que se ve. Desde 600 px de ancho el mes se ve siempre entero, de lunes a domingo (los días se
  estrechan hasta 82 px antes que salirse); «Sin fecha» va al lado solo si caben los dos (desde 871 px) y, si no,
  debajo, dentro de la pantalla: el mes se encoge (se desplaza por dentro) para dejarle sitio. Al lado, «Sin fecha»
  mide siempre lo mismo (240 px; 190 hasta los 900): un título largo no lo ensancha, va en dos líneas y acaba en «…»
  (entero, al pasar el ratón), y el mes tiene siempre su sitio. En las barras del calendario y en los nombres del
  cronograma, los avatares pequeños van uno al lado del otro, sin montarse. En el cronograma, el rótulo del mes va pegado al borde de la columna de
  nombres mientras ese mes esté a la vista y solo sale si cabe entero (donde no cabe se acorta: «sep 2026», «sep»; en un
  móvil, sin el año si es el de ahora); el selector «Nada · Estado · Persona» lleva siempre su etiqueta «Agrupar»; y el
  título que va al lado de una barra corta se coloca detrás de lo que la barra mide de verdad.
- **Avisos y ventanas:** los avisos salen abajo, en el centro; con una ventana abierta (o la ficha de una tarea) van
  dentro de ella, debajo de la ventana o al pie de la ficha, para no tapar el pie de un formulario
  (`colocarAvisos()` en `publico/app/menus.js`). Una ventana nunca es más alta que la pantalla: se desplaza por dentro.
  Un menú mide como mucho 420 px (y se desplaza); en un móvil, lo que necesite hasta el alto de la pantalla, para que
  el menú de la cuenta salga entero.
- **Las capas** (ventanas, la ficha de una tarea y los menús, en las cinco pantallas; todo en `publico/app/capas.js`):
  - *El foco no se sale.* El tabulador y Mayús+Tab dan la vuelta dentro de la capa de arriba; Escape la cierra y, al
    cerrarla, el foco vuelve a lo que la abrió (o, si el tablón se ha repintado, a esa tarea).
  - *Lo de detrás de una ventana no se puede pulsar ni enfocar* (`inert`). La ficha no es modal: al lado sigue el
    tablón y pulsar otra tarea la abre.
  - *«Atrás» cierra lo que hay abierto* (el botón del navegador, el del teléfono o el gesto), en vez de sacar de la
    pantalla: en un móvil la ficha ocupa toda la pantalla. Mientras hay algo abierto hay UNA entrada de más en el
    historial; al cerrar con el botón o con Escape se retira sola (`history.back()`), así que abrir y cerrar no ensucia
    el historial, tampoco dentro del panel de la oficina (si la oficina ha apuntado algo después, no se vuelve atrás).
    Con la ficha abierta la dirección dice `?tarea=…` (con su `?solo=1`): recargar la vuelve a abrir. Los menús no
    cuentan para «atrás»: se cierran con lo que tengan debajo.
  - Una ventana nueva se hace siempre con `ventana()` (`menus.js`), que ya es una capa; algo que se abra encima y no
    sea una ventana, con `abrirCapa()`. Una pantalla que escuche `popstate` (el visor del archivo) no debe repetir lo
    que ya se ve: un «atrás» puede haber cerrado solo una ventana.
- **Cada tarea tiene:** título, estado, prioridad (urgente, alta, media, baja; cada una con su color),
  para quién, pedido por, fecha de inicio y fecha límite, etiquetas, subtareas y notas.
- **Buscar:** el buscador encuentra lo que el tablón enseña, como lo enseña: el título, las notas y las subtareas; las
  etiquetas, con y sin almohadilla («bolos», «#bolos»); las personas (para quién y quién la pidió), con y sin arroba
  y sin tildes («víctor», «@victor»; «sin asignar»); la prioridad («urgente», «!alta», «sin prioridad») y el estado
  («en marcha», «hecho»). Todas las palabras, en cualquier orden. La lógica está aparte, en
  `publico/app/tablon-buscar.js`, y se prueba en `pruebas/tablon.mjs`.
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
| `servidor/perfil.js` | Cumpleaños («MM-DD»), qué día es hoy en la oficina y el personaje de cada uno. |
| `servidor/musica.js` | Música: la cabina, conectar Spotify (OAuth) y mirar qué suena (en su propio `musica.json`). |
| `publico/` | Las pantallas (tablón, `libro/`, `pizarra/`, `archivo/`, `musica/`, `musica/mini/`, `oficina/` y `cumples/`): HTML, CSS y módulos de JavaScript sin compilar. |
| `publico/app/markdown.js` | Markdown a HTML seguro (todo escapado), para el visor del archivo. |
| `publico/app/archivo*.js` | El archivo en pantalla: la lista (`archivo.js`), el visor con índice y buscador (`archivo-visor.js`) y piezas comunes (`archivo-comun.js`). |
| `publico/app/musica*.js` | La música en pantalla: la cabina (`musica.js`), el reproductor pequeño (`musica-mini.js`), piezas comunes (`musica-comun.js`) y los estados del reproductor, sin página, para poder probarlos en Node (`musica-seguidor.js`). |
| `publico/app/cumple.js`, `confeti.js`, `oficina.js`, `cumples.js` | Los cumpleaños (cuentas y textos), el confeti, el puente invisible de la oficina (`/tareas/oficina/`) y el cartel de cumpleaños (`/tareas/cumples/`). |
| `publico/app/solo.js` | El modo «solo lo suyo» (`?solo=1`): cuándo se pone y cómo se conserva en las direcciones (ver «Solo lo suyo»). |
| `publico/app/capas.js` | Las capas (ventanas, ficha y menús): el foco que no se sale, lo de detrás inerte y «atrás» que cierra la de arriba (ver «Las capas»). La lógica del historial y del tabulador, sin página, para probarla en Node. |
| `publico/app/libro-espera.js` | La pantalla «Solo para los socios» del libro, en directo: sigue escuchando y abre el libro cuando a esa persona le dan acceso. Lógica sola, para probarla en Node. |
| `publico/app/libro-pestana.js` | La pestaña «Cuentas» de las otras cuatro pantallas, en directo: con los avisos «libro» y «usuarios» del canal pregunta por lo suyo (`GET /api/yo`) y la pone o la quita. Lógica sola, para probarla en Node. |
| `publico/app/libro-buscar.js` | El buscador del libro: qué se puede buscar de un movimiento (también el importe, la fecha y el tipo) y cuándo coincide. Lógica sola, para probarla en Node. |
| `pruebas/` | Las pruebas que se pasan en GitHub antes de publicar, una por pantalla y cada una con su servidor y su puerto (tabla en «Las pruebas»). |
| `portada/` | La portada (CREW / INVITADO) y el estilo de las pantallas de acceso. |

Las tareas borradas pasan 30 días en una papelera interna (el aviso «Deshacer» las recupera).

**Las cifras, en la rejilla de su letra.** Las dos letras son de píxeles y solo salen limpias, con la pantalla a escala 1,
a ciertos tamaños: Silkscreen (títulos) a 16 px (o 8, 24, 32…) y Pixelify Sans (texto) a 11 px, a 16 px y a 21–22 px. Por
eso todo lo que es una cifra (importes, saldos, fechas, horas, contadores, porcentajes) va a uno de esos tamaños: las
grandes del libro en Silkscreen a 16 o 24 px; los importes de las listas en Pixelify Sans a 16 px con peso 600; las
fechas de las tareas a 16 px; y lo menudo («hace 3 min», «3,4 KB», la escala del cronograma) a 11 px. La regla está al
principio de «piezas pequeñas» en `publico/estilo.css`; lo que escribe la gente (títulos, conceptos, notas) y las frases
con un número dentro no cuentan. Al añadir una cifra nueva, ponerla a uno de esos tamaños.

**Las horas, con su artículo.** Una hora dentro de una frase («a», «desde», «hasta») sale siempre de `laHora()`, en
`publico/app/util.js`: «desde la 1:08» (entre la 1:00 y la 1:59 es «la») y «desde las 13:05». Nunca «las» escrito a
mano delante de una hora (lo vigila `pruebas/musica.mjs`). Hoy la única es la de la cabina de la música.

**Cómo se llega de una pantalla a otra:** el menú de la cuenta (arriba a la derecha) de cada pantalla y las pestañas
de arriba llevan a las demás con los mismos nombres: «Tablón de tareas», «Libro de cuentas» (en las pestañas,
«Tareas» y «Cuentas»; esta, solo a quien tiene parte en el reparto o administra, y en directo: aparece o desaparece
sin recargar cuando cambia el reparto o quién administra, igual que «Libro de cuentas» en el menú;
`publico/app/libro-pestana.js`), «Pizarra», «Archivo» y «Música». Las cinco
pantallas llevan las mismas cinco pestañas, en ese orden y con la suya marcada; en el tablón, que además tiene sus
vistas (Tablero, Lista, Calendario y Cronograma), las vistas bajan a una segunda línea de la cabecera. Al añadir una
pantalla nueva hay que añadirla en todas (en `principal.js`, `libro.js`, `pizarra.js`, `archivo.js` y `musica.js`, de
`publico/app/`), y cada enlace a otra pantalla lleva la clase `otra-pantalla` (en los menús hechos con `opcionesMenu`,
`otra: true`), igual que la fila de pestañas entera. La cabecera dice siempre cómo se llama la pantalla (`.nombre-app`;
en la pizarra, el nombre de esa pizarra): con 600 px o menos no hay pestañas (queda el menú de la cuenta) pero el
nombre sigue ahí. El cartel de cumpleaños (`cumples/`) es la excepción: se abre desde el mapa, como el puente, y ni
enlaza ni se enlaza.

**La cabecera con pestañas, por anchos** (sin `?solo=1`; reglas al principio de «barra superior» en `publico/estilo.css`).
La fila de pestañas está en el mismo sitio en las cinco pantallas, el nombre de la pantalla no se corta, ningún botón
se queda solo en una fila y la cabecera no pasa de dos filas:

| Ancho | Cómo va | Dónde empiezan las pestañas |
| --- | --- | --- |
| 860 px o más | Una fila: logo, nombre, pestañas y, a la derecha, el botón de la pantalla y la cuenta. El nombre ocupa lo mismo en las cinco (`--ancho-nombre-app`, 136 px); uno largo va en dos líneas («PIZARRA DE / REUNIONES»). El tablón añade debajo su línea de vistas. | x = 208 px |
| de 601 a 859 px | Dos filas en las cinco. Arriba, lo de toda la oficina: logo, pestañas y la cuenta. Debajo, lo de esa pantalla: su nombre entero, las vistas del tablón y su botón («+ Nueva», «+ Apuntar») o quién más está (pizarra y música). | x = 52 px |
| 600 px o menos | Una fila sin pestañas (el móvil). | — |

El nombre de la cuenta, al lado del avatar, solo sale con 960 px o más (y nunca mide más de 120 px hasta los 1200), y
los avatares de quién más está en la pizarra o escucha la música no pasan de 124 px, sin su rótulo, hasta los 1100:
así ni un nombre largo ni mucha gente le quitan el sitio a las pestañas. Una pizarra con un nombre que no quepa en dos
líneas de 136 px («Pizarra ideas-para-la-fiesta») lo lleva cortado con «…» a partir de 860 px (entero, al pasar el
ratón y de 601 a 859 px). Al tocar la cabecera hay que volver a medirla con un navegador, de 600 a 1100 px de 20 en 20,
en las cinco pantallas, con y sin `?solo=1`: `pruebas/solo.mjs` solo vigila que las reglas sigan ahí.

### Solo lo suyo (`?solo=1`)

Cada personaje u objeto de la oficina enseña solo su pantalla: el mapa la abre con `?solo=1` y esa pantalla esconde
la fila de pestañas entera (tampoco queda la suya: el nombre ya está en la cabecera) y los enlaces a otras pantallas
del menú de la cuenta (lo demás del menú se queda). En el tablón, sin pestañas, las vistas se quedan en la primera
línea, al lado del nombre (con menos de 740 px no caben y bajan a la suya). Sin el parámetro todo sigue igual.

| Pantalla | Dirección para el mapa |
| --- | --- |
| Tablón de tareas | `/tareas/?solo=1` |
| Libro de cuentas | `/tareas/libro/?solo=1` |
| Pizarra (la de reuniones; otra, con su `p`) | `/tareas/pizarra/?solo=1` · `/tareas/pizarra/?p=reuniones&solo=1` |
| Archivo (y un documento directamente) | `/tareas/archivo/?solo=1` · `/tareas/archivo/?doc=<id>&solo=1` |
| Música (la cabina) | `/tareas/musica/?solo=1` |

- **Cómo está hecho:** `publico/app/solo.js` mira la dirección al cargar (solo vale `solo=1`) y pone la clase `solo`
  en `<html>`; una regla de `estilo.css` (`.solo .otra-pantalla`) esconde lo marcado. El servidor sirve la misma
  página; solo cuida de no perder el parámetro al redirigir a la carpeta (`/tareas/libro?solo=1` →
  `/tareas/libro/?solo=1`) y al volver de Spotify (`api/musica/conectar?volver=1&solo=1`).
- **El modo vive en la dirección**, no en el almacenamiento del navegador (lo compartirían todos los paneles de la
  oficina). Las direcciones que una pantalla construye para sí misma pasan por `conSolo()`: abrir y cerrar un
  documento del archivo, la ficha de una tarea (`?tarea=…`), la vuelta de entrar (con Google, con contraseña o con
  un enlace de alta) y la vuelta de conectar Spotify. Una dirección propia nueva tiene que hacer lo mismo (la prueba
  lo vigila). La entrada que apunta una ventana abierta (`capas.js`) no cambia la dirección.
- **Lo que sale de la oficina va sin el modo:** «Abrir en pestaña nueva ↗» (`sinSolo()`), el enlace de una tarea para
  compartir y la pestaña que se abre para entrar con Google desde un marco. Allí las pestañas y el menú son la única
  manera de moverse.
- En el libro, a quien no tiene parte («Solo para los socios») tampoco le sale el botón «Ir al tablón de tareas».
- `musica/mini/`, `oficina/` y `cumples/` no tienen pestañas ni menú: no usan el parámetro.

## Libro de cuentas

Una pantalla propia para las cuentas, sin tener que manejar una hoja de cálculo. Usa las mismas cuentas y la
misma sesión que el tablón.

- **Quién lo ve:** los administradores y quien tiene parte en el reparto. A los demás, la API les contesta 403 y la
  pantalla dice «Solo para los socios». Va en directo en los dos sentidos: a quien le quitan la parte se le cierra el
  libro al momento, y la pantalla «Solo para los socios» sigue escuchando el canal y abre el libro sola en cuanto a esa
  persona le dan parte o pasa a administrar (`publico/app/libro-espera.js`), sin cerrar ni recargar. En las otras
  cuatro pantallas, la pestaña «Cuentas» y «Libro de cuentas» del menú aparecen y desaparecen también en directo
  (`publico/app/libro-pestana.js`, que pregunta `GET /api/yo`: `{ yo: { …, libro } }`).
- **Apuntar:** gasto, ingreso o pago entre socios, con categoría, notas y la foto del tique (o un PDF).
- **Quién debe a quién:** cada gasto e ingreso se reparte según las partes. Las partes se fijan con el primer
  movimiento, a partes iguales entre los administradores, y se cambian en «Reparto».
- **Buscar:** el buscador de los movimientos encuentra por concepto, notas, categoría y persona y, además, por
  **importe** (como se ve y como se escribe: «345,90», «345.90», «345», «12.845,50», «-345,90 €»), por **fecha**
  («1/10», «01/10/2026», «1 oct», «octubre») y por **tipo** («gasto», «ingreso», «pago», «tique»). Todas las palabras,
  en cualquier orden; un número se busca desde su principio («40» no saca 240,00 €). La lógica está aparte, en
  `publico/app/libro-buscar.js`, y se prueba en `pruebas/libro.mjs`.
- **En el móvil** (480 px o menos) las marcas «Tique» y «Nota» de cada movimiento son dos dibujos pequeños debajo de
  la fecha (con más ancho, la palabra).
- **Excel y CSV:** descarga del libro entero, e importación de la hoja de cuentas de Drive.
- **Importar una descarga del propio libro no cambia nada.** La hoja «Movimientos» de la descarga lleva una columna
  escondida, «Id», con la que cada fila se reconoce como su movimiento: ya estaba, aunque después se haya cambiado en
  el libro (manda el libro), y si se borró después de descargar, no vuelve (el aviso los cuenta aparte). Una fila sin
  «Id» (la hoja de Drive, una descarga antigua) ya estaba si coincide con un movimiento en tipo, fecha, concepto,
  importe y persona (y, en un pago, a quién); el «Pago» que la descarga escribe como concepto de los pagos, que no
  lo tienen, cuenta como ninguno. Lo vigila la prueba de ida y vuelta de `pruebas/libro.mjs`.
- **Lo que entiende al importar:** fechas como número de Excel o escritas («1/10/2026», «01-10-26», «2026/10/01»,
  «1/10», «1 oct 2026», «1 de octubre de 2026»; una que no existe o no se entiende se queda en la de hoy) e importes
  con coma o con punto («12,5», «1.234,56», «1,234.56», «1.234» son 1234 €). Las filas que no se apuntan se cuentan
  en el aviso: las que ya estaban, las borradas después de la descarga, las que no tienen una persona del crew y las
  que no se han podido leer (sin importe, con un importe negativo o con letras).
- Los importes se guardan en céntimos. Lo borrado pasa 30 días en la papelera.

## Pizarra

`/tareas/pizarra/?p=reuniones` es la de la sala de reuniones; con otro `?p=` sale otra (hasta 20).

- **Herramientas:** lápiz (8 colores y 4 grosores; con Mayúsculas, línea recta), goma (borra trazos enteros),
  notas, fotos (elegir, pegar con Ctrl+V o arrastrar; JPG, PNG, WebP o GIF de hasta 10 MB), mover y cambiar
  el tamaño, lupa, deshacer y rehacer, y descargar como imagen. La lupa dice el tamaño de verdad (a cuánto se ve la
  pizarra respecto a sus 1920 × 1200: entera en un móvil es un 19 %, no un 100 %).
- **En el móvil (menos de 600 px):** las herramientas ocupan dos filas. El color y el grosor están plegados detrás de un
  botón que enseña los de ahora (se pliegan solos al empezar a pintar) y «¿Cómo funciona?» queda en el menú de la cuenta.
  Con menos de 372 px los botones van más juntos y, con menos de 340 (un móvil de 320), «Descargar» se queda solo en el
  menú de la cuenta: las dos filas caben sin cortar ningún botón.
- **Escribir una nota en una pantalla pequeña:** la letra de las notas mide 26 px de la pizarra; con la pizarra entera
  en un móvil (19 %) son 5 px. Al ponerse a escribir, si la letra mediría menos de 11 px, la pizarra se acerca a esa
  nota (hasta 16 px de letra, con la nota arriba, por encima del teclado) y, al terminar, vuelve a como estaba; quien
  cambia el tamaño a mano mientras escribe se queda con el suyo.
- **El texto de una nota** se guarda un rato después de la última letra, al salir de ella y al cerrar o recargar la
  página (`publico/app/guardado.js`).
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

## Cumpleaños y personaje

- **Cumpleaños:** cada persona pone el suyo en «Mi cuenta…»: solo día y mes (el año ni se pide ni se guarda; quien
  nació un 29 de febrero lo celebra el 28 los años que no son bisiestos). El día de cada cumple el tablón saca un
  aviso con confeti (se cierra y no vuelve hasta el día siguiente), y hay una tarta en el calendario y en el crew.
  En la oficina se ven todos en el cartel de cumpleaños (abajo), donde cada uno puede poner también el suyo.
- **«Hoy»** es el día en la oficina (`TAREAS_ZONA`, por defecto `Europe/Madrid`), no el del servidor, que va en UTC.
- **Personaje:** WorkAdventure guarda el muñeco y el compañero en el navegador; aquí se guardan también, para que
  cada uno salga igual desde cualquier aparato.

| Llamada (todas con sesión; sin ella, 401) | Qué hace |
| --- | --- |
| `PATCH /tareas/api/yo` con `{ "cumple": "05-17" }` | Pone el cumpleaños (`null` o `""` lo quita; con año se rechaza). Va junto a `color`, `nombre` y `clave`. |
| `GET /tareas/api/oficina` | `{ hoy, cumples: [{ id, nombre }], proximos: [{ id, nombre, dia, fecha, enDias }], todos: [{ id, nombre, dia, fecha, enDias, color }], yo: { id, cumple } }`: de quién es el cumple hoy, los de los próximos 30 días, todos los del crew (los que antes llegan, primero; `dia` es «MM-DD» y `fecha`, la próxima vez que se celebra) y el de quien pregunta (`null` si no lo ha puesto). Quien ha salido del crew no cuenta. |
| `GET /tareas/api/yo/personaje` | `{ texturas, companero, actualizado }` (con `null` en lo que no hay). |
| `PUT /tareas/api/yo/personaje` | Guarda `{ texturas: [de 1 a 10 piezas], companero: pieza o null }` (piezas de hasta 64 letras, números, `_`, `.` o `-`). |

### El cartel de cumpleaños (`/tareas/cumples/`)

El sitio de la oficina donde se ven los cumpleaños. Lo abre el mapa desde el calendario de la pared del hall, en un
panel como el del tablón (el 70 % de la pantalla; en un móvil, el 90 %), sin `?solo=1` y sin permisos especiales:

```js
WA.nav.openCoWebSite("/tareas/cumples/", false, "", 70);
```

- **Qué enseña:** arriba, si hoy cumple alguien, el aviso de siempre (el mismo texto que el tablón y la oficina) con
  confeti; el siguiente cumpleaños con los días que faltan; los doce meses, empezando por el de ahora, con el día y el
  color de cada persona; y «Mi cumpleaños», para poner, cambiar o quitar el propio ahí mismo (`PATCH /api/yo`, como
  en «Mi cuenta…»).
- **Es un cartel:** no tiene pestañas ni menú, no enlaza las otras pantallas y las otras no lo enlazan. Sin sesión
  enseña la pantalla de entrada de siempre y, al entrar, se vuelve a él.
- **Al día:** con los avisos en directo (los cambios de `usuarios`), al volver a la pestaña y preguntando cada minuto,
  que es como se entera de la medianoche de la oficina. Solo se repinta si cambia algo.
- **Tamaños:** con 720 px de ancho o más, «el siguiente» y «mi cumpleaños» van a un lado y los meses al otro (2, 3 o 4
  por fila); más estrecho, todo en una columna y solo los meses con cumpleaños. En el panel de 900 × 700 cabe entero.
- **Textos:** reutiliza los del tablón (`publico/app/cumple.js`); los nuevos están marcados con `PROVISIONAL-v0.3.1`
  hasta que los decida el equipo.

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
| `hsMusica` | `{ configurado, dj, suena, desde }` (siempre las cuatro; `null` sin sesión). `configurado`: `true` si el servidor tiene conectado Spotify; el mapa solo pone el botón «Música» si lo es (mientras no llegue la respuesta, no hay botón). `dj`: el nombre de quien pincha, o `null` si la cabina está libre. `suena`: `true` si ahora mismo suena algo que se puede oír; `false` si no (pausa, anuncio, archivo local del DJ, cabina libre… o si no se sabe, ver abajo). `desde`: desde cuándo pincha (fecha ISO, la de entrar en la cabina; `null` con la cabina libre): el mapa lo usa para avisar una sola vez de cada vez que alguien se pone a pinchar. |

- **Al día:** se actualiza con los avisos en directo del tablón; cada minuto recuenta las tareas (a medianoche
  cambian «hoy» y «atrasadas») y cada 10 minutos vuelve a preguntar qué día es, quién cumple y cómo está la música (y lo vuelve a leer todo al
  reconectar, por ejemplo tras reiniciar el servidor con Spotify). Sin sesión vuelve a
  probar cada vez más espaciado (1, 2, 4… hasta 15 minutos) y al momento si se vuelve a la pestaña o se entra en el
  tablón en ese navegador.
- **`hsMusica` en directo:** el puente la lee de `GET /api/musica` (`configurado`, `cabina.dj.nombre` y `suena`) y
  la cambia al momento cuando el servidor avisa por el canal general con `{ tipo: "musica-cabina", dj, suena, desde }`: al
  entrar o salir alguien de la cabina y cuando empieza o deja de sonar (un cambio de canción no avisa). Si quien pincha
  cambia de nombre, se vuelve a leer. El puente **no** abre el canal de la música: el servidor solo mira el Spotify del
  DJ mientras alguien tiene la música abierta (la cabina o el reproductor pequeño), y por eso `suena` solo se sabe
  entonces; con la música cerrada para todos es `false` aunque el DJ tenga algo puesto. Para avisar de que alguien
  pincha, el mapa tiene que fiarse de `dj`; `suena` es un extra. El mapa todavía solo usa `configurado`.
- **Aviso de cumpleaños:** lo saca él mismo (`WA.ui.banner.openBanner`, amarillo, se cierra a mano): «¡Hoy es el
  cumple de Diego!», «…de Diego y Víctor!» y, a quien cumple, «¡Feliz cumpleaños, Diego!». Una vez al día en cada
  navegador: el día visto lo recuerda en su `localStorage`, porque el mapa no puede recordar nada.
- **Fuera de la oficina** (sin `WA`: abierta en una pestaña, o en local) no hace nada ni pide `/iframe_api.js`.
- **Ligero y con la misma CSP** que las demás pantallas (`script-src 'self'`): sin interfaz, solo 4 módulos pequeños
  (`publico/app/oficina.js` y los que ya usa el tablón). `/iframe_api.js` pasa porque es de la misma web.

## Música (Spotify)

La cabina del estudio: una persona del crew pincha (pone música en su Spotify de siempre) y quien quiera la
oye a la vez. **Por aquí no pasa audio**: Spotify no permite retransmitir el de una cuenta. El servidor solo
mira qué le suena al DJ y lo cuenta a todos por el canal en directo; cada navegador pone la misma canción con
el reproductor oficial de Spotify (Embed, `https://open.spotify.com/embed/iframe-api/v1`) y salta al mismo
punto. Si esa persona ha entrado en Spotify en su navegador suena entera; si no, Spotify solo deja 30 segundos
de muestra (la pantalla lo avisa). Los anuncios, los archivos locales del DJ y lo que no está en Spotify no se
pueden poner. Por eso **no suena sola en la oficina**: cada persona la oye cuando abre «Música».

- **`/tareas/musica/`** (la cabina): lo que suena (portada, título, artistas, por dónde va), «Escuchar» /
  «Silenciar», «Pinchar yo» / «Dejar la cabina», conectar y desconectar tu Spotify, las últimas 20 canciones
  con quién las puso y, si falta configurar, los pasos de abajo. Solo hay un DJ a la vez; un administrador
  puede dejar libre la cabina de otro.
- **`/tareas/musica/mini/`**: la misma música en una barra de 360 × 128 px sin desplazamiento (portada,
  título y artistas, quién pincha, escuchar y enlace a la cabina; «cabina vacía», «sin sesión», «sin
  configurar» y «sin conexión»). Un título que no cabe se corta con «…»: entero sale al pasar el ratón y, mientras
  suena, se desplaza solo, despacio, de un extremo a otro (quieto si el sistema pide menos movimiento).
  La oficina la abre como un panel flotante; si la cabina y el pequeño están
  abiertos a la vez, solo suena uno. Los paneles de la oficina tienen que dejar pasar el sonido
  (`allow="autoplay; encrypted-media"` en el marco). El botón «Música» de la barra y la cabina del DJ del
  mapa se ponen en el repositorio de mapas, no aquí.
- Spotify no deja iniciar sesión dentro de un marco: «Conectar mi Spotify» se abre en una pestaña nueva y la
  página de la oficina se actualiza sola (por el canal en directo) cuando termina.

### Los dos recorridos

- **Quien pincha:** «Conectar mi Spotify» → Spotify → vuelta. Si la cabina está libre, **al volver ya está en la
  cabina** (no hace falta pulsar «Pinchar yo») y la página «¡Listo!» (o el aviso de la cabina, fuera de la oficina) dice
  el paso siguiente: poner música en su Spotify. Si pincha otra persona, se conecta pero no entra, y se le dice que
  pulse «Pinchar yo» cuando quede libre. «Pinchar yo» sigue estando para quien ya tiene su Spotify conectado. Quien
  pincha no se oye a sí mismo: si tenía la música sonando en la cabina o en el pequeño, se calla sola al pasar a
  pinchar (ya lo oye en su Spotify) y vuelve al dejar la cabina.
- **A quién le suena de verdad:** en «Escuchan ahora», junto a cada nombre: «suena», «solo 30 s», «le falta pulsar ▶»,
  «lo ha pausado», «cargando», «esperando» o «no le carga». Lo cuenta la pestaña de cada oyente (abajo, la API).
- **Quien escucha:** abrir el reproductor pequeño ya es querer oír. La preferencia de cada navegador
  (`localStorage`, `hs-tablon:musica-escuchar`) tiene tres valores: nunca dicho (sin la clave), sí (`1`, pulsó
  «Escuchar») y no (`0`, pulsó «Silenciar»). Con «nunca dicho» o «sí», el pequeño arranca solo al abrirse; con «no»,
  se respeta y enseña «Escuchar». La cabina solo arranca sola con «sí». Arrancar solo no cambia la preferencia.
- **Lo que se ve según cómo vaya** (estados del reproductor, `publico/app/musica-seguidor.js`):

| Estado | Qué pasa | En el pequeño | En la cabina |
| --- | --- | --- | --- |
| `cargando` | Se está poniendo el reproductor de Spotify. | Aviso sobre el hueco del reproductor. | Nota. |
| `arrancando` | Se le ha pedido que suene y aún no lo ha confirmado. Nunca se da por «sonando» sin confirmación. | Quién pincha. | Nota. |
| `sonando` | Suena la canción entera, a la vez que la cabina. | Quién pincha y a cuántos más les suena. | Nota. |
| `bloqueado` | A los 4,5 s de pedírselo no ha sonado: el navegador no le deja empezar solo. | Franja amarilla «Pulsa ▶ aquí abajo» y el reproductor con borde amarillo. | Caja amarilla grande encima del reproductor. |
| `muestra` | Suena, pero solo la muestra de 30 s (Spotify no reconoce a la persona en ese navegador). | Una línea a la vista con el enlace para entrar en Spotify. | La explicación completa y el botón para entrar en Spotify. |
| `muestra-acabada` | La muestra ha terminado: silencio hasta la canción siguiente. | Aviso sobre el reproductor, con el enlace. | La explicación completa y el botón. |
| `fallo` | El script de Spotify no llega, o el reproductor no dice que está listo en 12 s. | Aviso con «Reintentar» y «Abrir en Spotify». | Nota y «Reintentar». |
| `pausa`, `a-mano`, `esperando`, `local` | El DJ ha pausado; lo ha pausado la persona; no hay nada que poner; es un archivo local del DJ. | Una línea. | Nota. |

  Tras pulsar el enlace para entrar en Spotify, al volver a la pestaña se pone otra vez el reproductor, para que Spotify
  reconozca la sesión.
- **Textos:** los nuevos o cambiados en la v0.3.1 están marcados en el código con `PROVISIONAL-v0.3.1` hasta que los
  decida el equipo.

### API, datos y variables

- **API** (con sesión del crew; lo que cambia algo lleva además la cabecera `x-tablon: 1`): `GET /api/musica` (estado),
  `POST` y `DELETE /api/musica/cabina` (entrar y dejar la cabina), `POST /api/musica/desconectar`,
  `POST /api/musica/escucho` (lo que cuenta cada pestaña, con `x-cliente`), `GET /api/musica/conectar` (lleva a
  Spotify) y `GET /api/musica/vuelta` (la dirección de vuelta de Spotify; con la cabina libre, quien conecta entra en
  ella). En `GET /api/eventos?musica=1&cliente=…` llegan `musica`, `musica-oyentes` y `musica-yo`; por el canal general
  (`GET /api/eventos`, el del tablón y el puente), solo el aviso ligero `musica-cabina` (`{ dj, suena }`).
- **`POST /api/musica/escucho`** con `{ si, estado }`: `si` dice si esa pestaña escucha y `estado`, cómo le va, de
  una lista cerrada: `suena`, `muestra`, `falta-pulsar`, `pausado`, `cargando`, `espera` o `fallo` (sin `estado`,
  `cargando`; cualquier otra cosa, 400 y no cambia nada). Se guarda con la pestaña (solo en memoria) y sale en
  `oyentes: [{ id, estado }]`, tanto en `GET /api/musica` como en el evento `musica-oyentes` (que sigue llevando
  `escuchando`, la lista de ids). Si alguien escucha en dos pestañas cuenta la que mejor va. El pequeño y la cabina
  lo mandan al momento al ponerse o quitarse y, con un poco de calma (0,8 s), cuando cambia su estado.
- **`GET /api/musica`** lleva además `suena` (lo mismo que el aviso `musica-cabina`; es lo que lee el puente).
- **Número de serie:** el estado (`GET /api/musica`) y los avisos `musica` y `musica-oyentes` llevan `serie`, un número
  que solo crece (empieza en la hora del arranque, así que tampoco retrocede al reiniciar el servidor). La cabina y el
  pequeño no aplican un estado con una serie menor que la última que han visto: así, una respuesta pedida antes que
  llega después de un aviso más nuevo no deja puesta una canción que ya no suena (o callada una que sí).
- **Lo que se guarda:** `musica.json` en la carpeta de datos (permisos 600): quién está en la cabina, las
  últimas 20 canciones y el token de refresco de cada persona que ha conectado Spotify. Los tokens no salen
  del servidor (ni por la API, ni al registro) y el de acceso solo vive en memoria. Se pide únicamente permiso
  de lectura (`user-read-currently-playing user-read-playback-state`). Quien sale del crew, quita el permiso
  en Spotify o pulsa «Desconectar» pierde su token y deja la cabina.
- **Cuánto se pregunta a Spotify:** solo mientras haya alguien con la música abierta (la cabina o el reproductor
  pequeño; el puente de la oficina no cuenta), cada 5 segundos (`MUSICA_INTERVALO_MS`); si Spotify pide calma (429) se
  espera lo que diga.
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
navegador puede definir `window.onSpotifyIframeApiReady` con un reproductor de mentira: se le llama con un objeto que
tenga `createController(elemento, { uri, width, height }, alCrear)`, y `alCrear` recibe el reproductor (`addListener`,
`loadUri`, `play`, `resume`, `pause`, `seek`, `destroy`), que emite `ready` y `playback_update` con
`{ data: { isPaused, isBuffering, duration, position } }`. Con eso se ven todos los casos: que suene, que no arranque
solo (no emitir nada tras `play`), la muestra (`duration` de 30000) y su final, y que no cargue (no emitir `ready`).
La lógica de esos estados se prueba sin navegador con `node pruebas/reproductor.mjs`.

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

### Las pruebas

Se pasan en GitHub antes de publicar la imagen (`.github/workflows/hotspot-tareas.yml`). Cada paso arranca **su propio
servidor**, con su carpeta de datos (`/tmp/datos-…`), su registro y su puerto (ninguno se repite), y lo para al acabar;
las pruebas de las pantallas usan el enlace de alta que sale en el registro de su servidor. Los comandos exactos, con
sus variables, están en el workflow.

| Paso | Prueba | Puerto | Qué comprueba |
| --- | --- | --- | --- |
| Probar el servidor | (con `curl`) | 3999 | Que arranca, sirve el tablón, imprime el enlace de alta y pide sesión (401) a quien no la tiene. |
| Probar el libro de cuentas | `pruebas/libro.mjs` | 3991 | Gastos, ingresos y pagos, balance, CSV, Excel, importación de la hoja de Drive y tiques. La ida y vuelta de la descarga (descargar → importar → nada cambia: ni movimientos, ni cuentas, ni reparto; también tras cambiar o borrar un movimiento y con una descarga antigua sin «Id») y hojas raras (vacías, sin columnas, con fechas e importes escritos de otras maneras, de 3000 filas). Y «Solo para los socios» en directo: la espera de la pantalla (`publico/app/libro-espera.js`) contra el canal de verdad, al pasar a administrar y al recibir parte en el reparto. La pestaña «Cuentas» de las otras pantallas en directo (`publico/app/libro-pestana.js` y `GET /api/yo`), también contra el canal de verdad. Y el buscador (`publico/app/libro-buscar.js`): por importe, por fecha, por tipo y por persona. |
| Probar la pizarra | `pruebas/pizarra.mjs` | 3997 | Trazos, notas y fotos con dos personas a la vez, vaciar y recuperar, el lápiz en directo y quién la tiene abierta. |
| Probar el tablón | `pruebas/tablon.mjs` | 3993 | Que las notas no se pisan (409 con lo que hay ahora, y también si falta «antes» y la tarea ya tiene notas), que el cliente siempre manda «antes» y la franja «Sin conexión…» (`publico/app/conexion.js`). Y las capas (`publico/app/capas.js`) con un historial de mentira: el tabulador da la vuelta dentro, «atrás» cierra la de arriba, cerrar con el botón no deja entradas, y toda ventana pasa por `ventana()`. |
| Probar cumpleaños y personaje | `pruebas/cumple.mjs` | 3994 | Cumpleaños, «hoy» en la oficina (con `TAREAS_HOY` fijo), personaje, puente `/tareas/oficina/` y cartel `/tareas/cumples/` (la API y lo que sirve; en pantalla se mira con un navegador). |
| Probar el archivo | `pruebas/archivo.mjs` | 3992 | Subir un documento de cada tipo, enlaces, papelera, búsqueda, lo que no debe entrar, Markdown y Word escapados y el límite total (`ARCHIVO_MAXIMO_MB=40`). |
| Probar la música | `pruebas/musica.mjs` y `pruebas/spotify-falso.mjs` | 3995 (y 3996 para el servidor sin Spotify que arranca la prueba) y 8614 (el Spotify de mentira) | La cabina, conectar Spotify (y entrar en la cabina al conectar, libre u ocupada), lo que suena en directo, cómo le va a cada oyente, el aviso a la oficina y el puente con `hsMusica` (el módulo de verdad con una oficina de mentira); la música «sin configurar»; y las horas con su artículo («desde la 1:08», `laHora()`), sin ninguna escrita a mano en las pantallas. |
| Probar el reproductor de la música | `pruebas/reproductor.mjs` | ninguno (sin servidor ni navegador) | Los estados del reproductor (`publico/app/musica-seguidor.js`) con un Embed y un reloj de mentira: suena entera, la muestra de 30 s y su final, no arranca solo, no carga, y el cambio de canción. |
| Probar el modo solo | `pruebas/solo.mjs` | 3990 | `?solo=1` sin navegador: lo que sirve el servidor (las cinco pantallas, `app/solo.js`, la regla de `estilo.css`, la vuelta de entrar), la lógica del módulo y que las pantallas marcan sus enlaces a las demás y no pierden el modo al cambiar de dirección. También las pestañas: las mismas cinco en las cinco pantallas, la fila entera marcada, el nombre de la pantalla en la cabecera y las reglas que dejan las pestañas en el mismo sitio en las cinco (lo que miden se mira con un navegador). |
| Probar el acceso de la oficina | `pruebas/oficina-oidc.mjs` y `pruebas/google-falso.mjs` | 3998 y 8412 (el Google de mentira) | Entrar por `/cuentas` con `openid-client` 5 (la librería de WorkAdventure): PKCE, `userinfo` y revocar. Es el único paso que instala un paquete (`npm install`). |

El paso «Comprobar el código» pasa antes `node --check` a todo el JavaScript (`servidor/`, `publico/app/`, `portada/`
y `pruebas/`).
