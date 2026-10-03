"""Los retoques de las letras de la oficina de HOT SPOT S.L.: las cifras de la casa y unas pocas letras.

Qué arregla (todo se veía en pantalla y costaba leerlo):

- Los números de Pixelify Sans: el 5 era igual que la S, y el 2, el 3 y el 4 se confundían entre sí.
- En Pixelify Sans, la B, la C y la G eran casi el mismo dibujo («Café con Bea» se leía «Gafé con Gea»), la «a»
  parecía una «o» con rabo y el € era una mancha.
- También en Pixelify Sans: la «c» se cerraba hasta parecer una «o» en cuanto la letra engordaba un poco («discusión»
  se leía «disousión»), la Z era el dibujo de un 2, la «j» no tenía punto y los paréntesis parecían llaves.
- Y la «f» y la «t» dejaban detrás un hueco que parecía un espacio («Caf é», «Ent endido»), y la tilde de la «í» se
  confundía con el punto de la «i» («dias», «Victor»). La E era redonda, casi un € sin rayas.
- En Silkscreen (los títulos), el 4 parecía otra letra y el 2 una Z.

Este guion dibuja esos caracteres píxel a píxel, con las mismas medidas que cada letra, y los guarda en cuatro
fuentes pequeñas que solo traen esos caracteres:

    hs-retoques-texto.woff          para Pixelify Sans, pesos 400-549
    hs-retoques-texto-negra.woff    para Pixelify Sans, pesos 550-700
    hs-retoques-titulo.woff         para Silkscreen normal
    hs-retoques-titulo-negra.woff   para Silkscreen negrita

En el CSS se declaran con el MISMO nombre de familia y el MISMO peso que la letra a la que acompañan, después de ella
y con `unicode-range`: el navegador saca de aquí esos caracteres y todo lo demás de la letra de siempre, sin tocar ni
un `font-family`. Quitar las cuatro declaraciones `@font-face` de «retoques» lo deja todo como estaba.

Cada una lleva además el mismo trato de «ajuste a la rejilla» («hinting») que la letra a la que acompaña (las tablas
`prep` y `gasp`; ver `sin_ajuste()`): sin él, en Linux, las letras retocadas avanzaban distinto que las de al lado y
entre letra y letra quedaban huecos desiguales.

Van copiadas en los dos sitios que sirven letras: `archivos/play/public/static/fonts/hotspot/` (la oficina; también
las usan los paneles del mapa) y `tareas/publico/fuentes/` (las pantallas del tablón).

Uso (necesita Python 3 con fontTools):  python3 herramientas/retoques.py
Al acabar imprime el `unicode-range` que hay que poner en el CSS. Si no ha cambiado ningún dibujo, los archivos salen
idénticos, byte a byte, a los que había (llevan una fecha fija).
"""
import os
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import newTable
from fontTools.ttLib.tables import ttProgram

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINOS = [os.path.join(RAIZ, 'archivos/play/public/static/fonts/hotspot'), os.path.join(RAIZ, 'tareas/publico/fuentes')]

# Para el texto (Pixelify Sans): cifras y mayúsculas de 5 × 7 píxeles con trazo de un píxel; las minúsculas, de 5 de
# alto. La última fila de cada dibujo se apoya en la línea de base. Las cifras son las de las pantallas de matriz de
# puntos de toda la vida: cada una con su silueta, sin parecerse a ninguna letra.
TEXTO = {
    '0': ['.##.', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'],   # más estrecho que la O, para que «O0» no se lea «00»
    '1': ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    'C': ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
    'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'É': ['...#.', '..#..', '.....', '#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'G': ['.####', '#....', '#....', '#..##', '#...#', '#...#', '.###.'],
    'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    'a': ['.###.', '....#', '.####', '#...#', '.####'],
    'c': ['.####', '#....', '#....', '#....', '.####'],
    'j': ['.#', '..', '##', '.#', '.#', '.#', '.#', '.#', '#.'],
    'f': ['.##', '#..', '###', '#..', '#..', '#..', '#..'],
    't': ['.#.', '.#.', '###', '.#.', '.#.', '.#.', '.##'],
    'í': ['.#', '#.', '..', '#.', '#.', '#.', '#.', '#.'],
    '(': ['.#', '#.', '#.', '#.', '#.', '#.', '#.', '#.', '.#'],
    ')': ['#.', '.#', '.#', '.#', '.#', '.#', '.#', '.#', '#.'],
    'á': ['...#.', '..#..', '.....', '.###.', '....#', '.####', '#...#', '.####'],
    'à': ['.#...', '..#..', '.....', '.###.', '....#', '.####', '#...#', '.####'],
    '€': ['..###', '.#...', '####.', '.#...', '####.', '.#...', '..###'],
}
# Cuántas filas de cada dibujo quedan por debajo de la línea de base (la «j» baja dos, como la «g» o la «y»).
BAJAN = {'j': 2, '(': 1, ')': 1}
# Para los títulos (Silkscreen): cifras de 4 × 5 píxeles, como sus mayúsculas.
TITULO = {
    '0': ['.##.', '#..#', '#..#', '#..#', '.##.'],
    '1': ['.#.', '##.', '.#.', '.#.', '###'],
    '2': ['###.', '...#', '.##.', '#...', '####'],
    '3': ['###.', '...#', '.##.', '...#', '###.'],
    '4': ['..#.', '.##.', '#.#.', '####', '..#.'],
    '5': ['####', '#...', '###.', '...#', '###.'],
    '6': ['.##.', '#...', '###.', '#..#', '.##.'],
    '7': ['####', '...#', '..#.', '.#..', '.#..'],
    '8': ['.##.', '#..#', '.##.', '#..#', '.##.'],
    '9': ['.##.', '#..#', '.###', '...#', '.##.'],
}

# Medidas de cada letra (leídas de sus archivos): dónde empieza el dibujo, cuánto mide un píxel y las alturas de línea.
# `grueso` es cuánto se ensancha cada píxel hacia la derecha en la negrita. El avance de cada carácter sale de su
# ancho: el margen de la izquierda, sus columnas y el mismo margen a la derecha (el 1 es más estrecho que las demás
# cifras, como en las dos letras: con el mismo ancho, «17:35» se leía «1 7:35»).
# `ppem_entero` dice si la letra a la que acompaña pide que su tamaño se redondee a píxeles enteros antes de dibujarla
# (el bit 3 de `head.flags`; ver `sin_ajuste()`): Silkscreen sí, Pixelify Sans no.
ESTILOS = {
    'hs-retoques-texto':        dict(dibujos=TEXTO,  x0=60,  px=93,  py=90,  grueso=0,   sube=920,  baja=-280, peso=400, ppem_entero=False),
    'hs-retoques-texto-negra':  dict(dibujos=TEXTO,  x0=60,  px=93,  py=90,  grueso=58,  sube=920,  baja=-280, peso=700, ppem_entero=False),
    'hs-retoques-titulo':       dict(dibujos=TITULO, x0=125, px=125, py=125, grueso=0,   sube=1030, baja=-250, peso=400, ppem_entero=True),
    'hs-retoques-titulo-negra': dict(dibujos=TITULO, x0=125, px=125, py=125, grueso=125, sube=1030, baja=-250, peso=700, ppem_entero=True),
}

# La fecha que llevan dentro las cuatro fuentes (segundos desde 1904: el 1 de octubre de 2026). Fija, para que volver a
# generarlas sin cambiar ningún dibujo dé los mismos archivos, byte a byte, y `git status` no enseñe nada.
FECHA = 3873657600


def glifo(filas, e, bajan=0):
    """Un rectángulo por cada tira de píxeles seguidos de cada fila (dentro de un glifo se rellenan todos juntos).
    `bajan` es cuántas filas del final quedan por debajo de la línea de base."""
    pen = TTGlyphPen(None)
    alto = len(filas) - bajan
    for j, fila in enumerate(filas):
        y1 = (alto - j) * e['py']; y0 = y1 - e['py']
        i = 0
        while i < len(fila):
            if fila[i] != '#': i += 1; continue
            k = i
            while k < len(fila) and fila[k] == '#': k += 1
            xa = e['x0'] + i * e['px']; xb = e['x0'] + k * e['px'] + e['grueso']
            pen.moveTo((xa, y0)); pen.lineTo((xa, y1)); pen.lineTo((xb, y1)); pen.lineTo((xb, y0)); pen.closePath()
            i = k
    return pen.glyph()


def sin_ajuste(fuente, e):
    """Le dice a quien pinta la letra que NO la ajuste a la rejilla por su cuenta: el mismo trato que tienen Pixelify
    Sans y Silkscreen, que traen estas tablas.

    Sin ellas, FreeType (el que pinta las letras en Chromium en Linux) da por hecho que una TrueType sin programa
    `prep` ni `fpgm` ni instrucciones «no viene ajustada» y, donde hay «hinting» medio o completo, le pasa su ajuste
    automático (el «autohinter»), que mueve los bordes de cada glifo y le cambia el avance: a 10,75 px una «o» de
    Pixelify Sans avanzaba 6 px y una «a» retocada, 7, y en las burbujas salían huecos de 1 a 4 px dentro de una
    palabra («¿B ailamos», «C af é»); al 1 se le soltaba el gancho. Con un `prep`, aunque no ajuste nada, FreeType usa
    el intérprete de TrueType, que deja el glifo tal cual y su avance en el de diseño (redondeado a píxeles enteros,
    como el de las letras de al lado).

    - `prep`: el programa de las fuentes «sin ajuste» de Google Fonts (el de `gftools fix-nonhinting`, el mismo que
      lleva Pixelify Sans): solo activa el control de «dropout» al rasterizar. Es la tabla que quita el autohinter
      (comprobado: sin ella vuelve; sin `gasp`, no).
    - `gasp`: suavizado y rejilla simétrica a todos los tamaños (0xFFFF → 15), como las dos letras.
    - `head.flags`, bit 3 («tamaño en píxeles enteros»): Silkscreen lo lleva, y con ajuste se dibuja al tamaño
      redondeado (a 21,5 px, como a 22: su A avanza 17 px y no 16); sus cifras tienen que hacer lo mismo o no
      medirían igual que sus letras. Pixelify Sans no lo lleva, y sus retoques tampoco.
    - `head.lowestRecPPEM` y `maxp.maxZones`, como los de la letra a la que acompaña (no cambian nada a la vista).
    Aquí no se toca ni un contorno ni un avance: solo estas tablas."""
    prep = newTable('prep')
    prep.program = ttProgram.Program()
    prep.program.fromAssembly(['PUSHW[]', '511', 'SCANCTRL[]', 'PUSHB[]', '4', 'SCANTYPE[]'])
    fuente['prep'] = prep
    gasp = newTable('gasp')
    gasp.version = 1
    gasp.gaspRange = {0xFFFF: 15}
    fuente['gasp'] = gasp
    fuente['head'].lowestRecPPEM = 6
    if e['ppem_entero']: fuente['head'].flags |= 1 << 3
    else: fuente['maxp'].maxZones = 1


def construir(nombre, e):
    caracteres = sorted(e['dibujos'])
    nombres = {c: 'uni%04X' % ord(c) for c in caracteres}
    orden = ['.notdef'] + [nombres[c] for c in caracteres]
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(orden)
    fb.setupCharacterMap({ord(c): nombres[c] for c in caracteres})
    glifos = {'.notdef': TTGlyphPen(None).glyph()}
    for c in caracteres: glifos[nombres[c]] = glifo(e['dibujos'][c], e, BAJAN.get(c, 0) if e['dibujos'] is TEXTO else 0)
    fb.setupGlyf(glifos)
    avances = {'.notdef': (2 * e['x0'] + 5 * e['px'], 0)}
    for c in caracteres: avances[nombres[c]] = (2 * e['x0'] + len(e['dibujos'][c][0]) * e['px'] + e['grueso'], e['x0'])
    fb.setupHorizontalMetrics(avances)
    fb.setupHorizontalHeader(ascent=e['sube'], descent=e['baja'])
    fb.setupNameTable({'familyName': 'HS Retoques', 'styleName': 'Bold' if e['peso'] >= 600 else 'Regular'})
    fb.setupOS2(sTypoAscender=e['sube'], sTypoDescender=e['baja'], usWinAscent=e['sube'], usWinDescent=-e['baja'], usWeightClass=e['peso'])
    fb.setupPost()
    sin_ajuste(fb.font, e)
    fb.font['head'].created = fb.font['head'].modified = FECHA
    fb.font.recalcTimestamp = False
    fb.font.flavor = 'woff'
    for d in DESTINOS:
        fb.save(os.path.join(d, nombre + '.woff'))


def rango(dibujos):
    """El `unicode-range` del CSS: los caracteres seguidos se juntan (U+30-39)."""
    cods = sorted(ord(c) for c in dibujos); tramos = []; i = 0
    while i < len(cods):
        k = i
        while k + 1 < len(cods) and cods[k + 1] == cods[k] + 1: k += 1
        tramos.append('U+%X' % cods[i] if k == i else 'U+%X-%X' % (cods[i], cods[k])); i = k + 1
    return ', '.join(tramos)


for nombre, e in ESTILOS.items(): construir(nombre, e)
print('Retoques guardados:', ', '.join(n + '.woff' for n in ESTILOS))
print('unicode-range del texto (Pixelify Sans):', rango(TEXTO))
print('unicode-range de los títulos (Silkscreen):', rango(TITULO))
