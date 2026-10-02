"""Los retoques de las letras de la oficina de HOT SPOT S.L.: las cifras de la casa y unas pocas letras.

Qué arregla (todo se veía en pantalla y costaba leerlo):

- Los números de Pixelify Sans: el 5 era igual que la S, y el 2, el 3 y el 4 se confundían entre sí.
- En Pixelify Sans, la B, la C y la G eran casi el mismo dibujo («Café con Bea» se leía «Gafé con Gea»), la «a»
  parecía una «o» con rabo y el € era una mancha.
- También en Pixelify Sans: la «c» se cerraba hasta parecer una «o» en cuanto la letra engordaba un poco («discusión»
  se leía «disousión»), la Z era el dibujo de un 2, la «j» no tenía punto y los paréntesis parecían llaves.
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

Van copiadas en los dos sitios que sirven letras: `archivos/play/public/static/fonts/hotspot/` (la oficina; también
las usan los paneles del mapa) y `tareas/publico/fuentes/` (las pantallas del tablón).

Uso (necesita Python 3 con fontTools):  python3 herramientas/retoques.py
Al acabar imprime el `unicode-range` que hay que poner en el CSS.
"""
import os
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINOS = [os.path.join(RAIZ, 'archivos/play/public/static/fonts/hotspot'), os.path.join(RAIZ, 'tareas/publico/fuentes')]

# Para el texto (Pixelify Sans): cifras y mayúsculas de 5 × 7 píxeles con trazo de un píxel; las minúsculas, de 5 de
# alto. La última fila de cada dibujo se apoya en la línea de base. Las cifras son las de las pantallas de matriz de
# puntos de toda la vida: cada una con su silueta, sin parecerse a ninguna letra.
TEXTO = {
    '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
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
    'G': ['.####', '#....', '#....', '#..##', '#...#', '#...#', '.###.'],
    'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    'a': ['.###.', '....#', '.####', '#...#', '.####'],
    'c': ['.####', '#....', '#....', '#....', '.####'],
    'j': ['.#', '..', '##', '.#', '.#', '.#', '.#', '.#', '#.'],
    '(': ['..#', '.#.', '#..', '#..', '#..', '.#.', '..#'],
    ')': ['#..', '.#.', '..#', '..#', '..#', '.#.', '#..'],
    'á': ['...#.', '..#..', '.....', '.###.', '....#', '.####', '#...#', '.####'],
    'à': ['.#...', '..#..', '.....', '.###.', '....#', '.####', '#...#', '.####'],
    '€': ['..###', '.#...', '####.', '.#...', '####.', '.#...', '..###'],
}
# Cuántas filas de cada dibujo quedan por debajo de la línea de base (la «j» baja dos, como la «g» o la «y»).
BAJAN = {'j': 2}
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
ESTILOS = {
    'hs-retoques-texto':        dict(dibujos=TEXTO,  x0=60,  px=93,  py=90,  grueso=0,   sube=920,  baja=-280, peso=400),
    'hs-retoques-texto-negra':  dict(dibujos=TEXTO,  x0=60,  px=93,  py=90,  grueso=58,  sube=920,  baja=-280, peso=700),
    'hs-retoques-titulo':       dict(dibujos=TITULO, x0=125, px=125, py=125, grueso=0,   sube=1030, baja=-250, peso=400),
    'hs-retoques-titulo-negra': dict(dibujos=TITULO, x0=125, px=125, py=125, grueso=125, sube=1030, baja=-250, peso=700),
}


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
