#!/usr/bin/env python3
"""
Banco de pruebas · genera el mapa de prueba, su tileset, los iconos de los botones y el sonido.

    python3 pruebas/banco/generar.py        (hace falta Pillow: pip install pillow)

Todo lo que sale de aquí es GENÉRICO y está hecho solo para el banco: no tiene nada de los mapas de la oficina
(que viven en otro repositorio, privado). Lo generado se guarda en `pruebas/banco/mapa/` y va al repositorio, así
que el flujo de trabajo no necesita Python.

El mapa (24×16 casillas de 32 px):

    capas, de abajo arriba ............ start · suelo · collisions · objetos · floorLayer (zonas) · velo-a · velo-b
    paredes ........................... el borde, un bloque suelto en (9,12) y un anillo (19..21, 11..13)
    casilla sin camino ................ (20,12): el hueco de dentro del anillo
    zona `panel` ...................... casillas (9..10, 2..3): openWebsite + onaction + texto propio
    zona `panel-defecto` .............. casillas (9..10, 6..7): openWebsite + onaction SIN texto (el de WorkAdventure)
    zona `silencio` ................... casillas (15..18, 2..5): silent
    capas `velo-a` y `velo-b` ......... por encima de todo, escondidas, con casillas semitransparentes
    casilla con nombre `faro` ......... animada (4 fotogramas de 200 ms); `poste`, con nombre y sin animación
"""
import json
import math
import struct
import wave
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent / "mapa"
LADO = 32
ANCHO, ALTO = 24, 16

TINTA = (28, 23, 21, 255)
CREMA = (243, 230, 216, 255)
NARANJA = (224, 86, 42, 255)
AMARILLO = (255, 216, 74, 255)
AZUL = (111, 195, 245, 255)
ROSA = (232, 70, 124, 255)

# ---------- tileset ----------
COLUMNAS, FILAS = 8, 3
SUELO, SUELO2, PARED, SALIDA, VELO_A, VELO_B, MARCA_PANEL, MARCA_SILENCIO = range(8)
FARO = 8  # 8..11: los cuatro fotogramas
POSTE = 12
MARCA_DESTINO = 13
MARCA_JUGADOR = 14


def casilla_suelo(color, linea):
    im = Image.new("RGBA", (LADO, LADO), color)
    d = ImageDraw.Draw(im)
    d.line([(0, LADO - 1), (LADO - 1, LADO - 1)], fill=linea)
    d.line([(LADO - 1, 0), (LADO - 1, LADO - 1)], fill=linea)
    return im


def con_marco(base, color, grosor=2):
    im = base.copy()
    d = ImageDraw.Draw(im)
    for i in range(grosor):
        d.rectangle([i + 1, i + 1, LADO - 3 - i, LADO - 3 - i], outline=color)
    return im


def tileset():
    hoja = Image.new("RGBA", (COLUMNAS * LADO, FILAS * LADO), (0, 0, 0, 0))
    suelo = casilla_suelo((120, 108, 98, 255), (104, 93, 84, 255))
    suelo2 = casilla_suelo((112, 100, 91, 255), (98, 87, 79, 255))

    pared = Image.new("RGBA", (LADO, LADO), TINTA)
    d = ImageDraw.Draw(pared)
    for y in (0, 11, 22):
        d.line([(0, y), (LADO - 1, y)], fill=(70, 58, 52, 255))
    for x, y in ((8, 0), (24, 0), (0, 11), (16, 11), (8, 22), (24, 22)):
        d.line([(x, y), (x, y + 10)], fill=(70, 58, 52, 255))

    salida = suelo.copy()
    d = ImageDraw.Draw(salida)
    d.polygon([(16, 6), (26, 16), (16, 26), (6, 16)], outline=NARANJA)

    destino = suelo.copy()
    d = ImageDraw.Draw(destino)
    d.line([(8, 8), (23, 23)], fill=AMARILLO, width=2)
    d.line([(23, 8), (8, 23)], fill=AMARILLO, width=2)

    jugador = suelo.copy()
    d = ImageDraw.Draw(jugador)
    d.ellipse([10, 10, 21, 21], outline=CREMA)

    velo_a = Image.new("RGBA", (LADO, LADO), (224, 86, 42, 110))
    velo_b = Image.new("RGBA", (LADO, LADO), (12, 16, 48, 150))

    faros = []
    for i, color in enumerate((NARANJA, AMARILLO, CREMA, ROSA)):
        im = Image.new("RGBA", (LADO, LADO), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rectangle([6, 6, 25, 25], fill=TINTA)
        d.rectangle([8, 8, 23, 23], fill=color)
        # una muesca que da la vuelta: se ve a simple vista en qué fotograma está
        x, y = ((8, 8), (20, 8), (20, 20), (8, 20))[i]
        d.rectangle([x, y, x + 3, y + 3], fill=TINTA)
        faros.append(im)

    poste = Image.new("RGBA", (LADO, LADO), (0, 0, 0, 0))
    d = ImageDraw.Draw(poste)
    d.rectangle([13, 4, 18, 27], fill=TINTA)
    d.rectangle([14, 5, 17, 26], fill=AZUL)

    casillas = {
        SUELO: suelo,
        SUELO2: suelo2,
        PARED: pared,
        SALIDA: salida,
        VELO_A: velo_a,
        VELO_B: velo_b,
        MARCA_PANEL: con_marco(suelo, AMARILLO),
        MARCA_SILENCIO: con_marco(suelo, AZUL),
        POSTE: poste,
        MARCA_DESTINO: destino,
        MARCA_JUGADOR: jugador,
    }
    for i, im in enumerate(faros):
        casillas[FARO + i] = im
    for numero, im in casillas.items():
        hoja.paste(im, ((numero % COLUMNAS) * LADO, (numero // COLUMNAS) * LADO))
    hoja.save(AQUI / "banco.png")


# ---------- mapa ----------
def capa(nombre, datos, identificador, visible=True, propiedades=None):
    c = {
        "id": identificador,
        "name": nombre,
        "type": "tilelayer",
        "x": 0,
        "y": 0,
        "width": ANCHO,
        "height": ALTO,
        "opacity": 1,
        "visible": visible,
        "data": datos,
    }
    if propiedades:
        c["properties"] = propiedades
    return c


def vacia():
    return [0] * (ANCHO * ALTO)


def poner(datos, x, y, numero):
    datos[y * ANCHO + x] = numero + 1  # gid = número de casilla + 1


def zona(identificador, nombre, x0, y0, ancho, alto, propiedades):
    return {
        "id": identificador,
        "name": nombre,
        "type": "area",
        "x": x0 * LADO,
        "y": y0 * LADO,
        "width": ancho * LADO,
        "height": alto * LADO,
        "rotation": 0,
        "visible": True,
        "properties": propiedades,
    }


def texto(nombre, valor):
    return {"name": nombre, "type": "string", "value": valor}


def logico(nombre, valor):
    return {"name": nombre, "type": "bool", "value": valor}


def mapa():
    start, suelo, colisiones, objetos = vacia(), vacia(), vacia(), vacia()
    velo_a, velo_b = vacia(), vacia()

    for y in range(ALTO):
        for x in range(ANCHO):
            poner(suelo, x, y, SUELO if (x + y) % 2 == 0 else SUELO2)
            poner(velo_a, x, y, VELO_A)
            poner(velo_b, x, y, VELO_B)
            if x in (0, ANCHO - 1) or y in (0, ALTO - 1):
                poner(colisiones, x, y, PARED)

    # un bloque suelto (destino «en una pared») y un anillo con un hueco dentro (destino «sin camino»)
    poner(colisiones, 9, 12, PARED)
    for x in (19, 20, 21):
        for y in (11, 12, 13):
            if (x, y) != (20, 12):
                poner(colisiones, x, y, PARED)

    # por dónde se entra
    for x, y in ((2, 2), (3, 2), (2, 3), (3, 3)):
        poner(start, x, y, SALIDA)
        poner(suelo, x, y, SALIDA)

    # marcas en el suelo: las zonas, el destino del paseo y los sitios donde se colocan los jugadores
    for x in (9, 10):
        for y in (2, 3, 6, 7):
            poner(suelo, x, y, MARCA_PANEL)
    for x in range(15, 19):
        for y in range(2, 6):
            poner(suelo, x, y, MARCA_SILENCIO)
    poner(suelo, 7, 12, MARCA_DESTINO)
    for x, y in ((5, 8), (6, 8), (12, 9), (3, 12)):
        poner(suelo, x, y, MARCA_JUGADOR)

    zonas = [
        zona(
            1,
            "panel",
            9,
            2,
            2,
            2,
            [
                texto("openWebsite", "panel.html"),
                texto("openWebsiteTrigger", "onaction"),
                texto("openWebsiteTriggerMessage", "Pulsa ESPACIO para abrir el panel de prueba"),
            ],
        ),
        zona(
            2,
            "panel-defecto",
            9,
            6,
            2,
            2,
            [texto("openWebsite", "panel.html"), texto("openWebsiteTrigger", "onaction")],
        ),
        zona(3, "silencio", 15, 2, 4, 4, [logico("silent", True)]),
    ]

    documento = {
        "type": "map",
        "version": "1.10",
        "tiledversion": "1.11.2",
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "infinite": False,
        "compressionlevel": -1,
        "width": ANCHO,
        "height": ALTO,
        "tilewidth": LADO,
        "tileheight": LADO,
        "nextlayerid": 8,
        "nextobjectid": 4,
        "properties": [
            texto("mapName", "Banco de pruebas"),
            texto("mapDescription", "Mapa genérico para probar la oficina en GitHub Actions."),
            texto("mapCopyright", "Gráficos del banco de pruebas, hechos por un script (pruebas/banco/generar.py)."),
            texto("script", "banco.js"),
        ],
        "layers": [
            capa("start", start, 1),
            capa("suelo", suelo, 2),
            capa("collisions", colisiones, 3),
            capa("objetos", objetos, 4),
            {
                "id": 5,
                "name": "floorLayer",
                "type": "objectgroup",
                "draworder": "topdown",
                "x": 0,
                "y": 0,
                "opacity": 1,
                "visible": True,
                "objects": zonas,
            },
            capa("velo-a", velo_a, 6, visible=False),
            capa("velo-b", velo_b, 7, visible=False),
        ],
        "tilesets": [
            {
                "firstgid": 1,
                "name": "banco",
                "image": "banco.png",
                "imagewidth": COLUMNAS * LADO,
                "imageheight": FILAS * LADO,
                "columns": COLUMNAS,
                "tilecount": COLUMNAS * FILAS,
                "tilewidth": LADO,
                "tileheight": LADO,
                "margin": 0,
                "spacing": 0,
                "properties": [texto("tilesetCopyright", "Gráficos del banco de pruebas (generados).")],
                "tiles": [
                    {"id": PARED, "properties": [logico("collides", True)]},
                    {
                        "id": FARO,
                        "properties": [texto("name", "faro")],
                        "animation": [{"tileid": FARO + i, "duration": 200} for i in range(4)],
                    },
                    {"id": POSTE, "properties": [texto("name", "poste")]},
                ],
            }
        ],
    }
    (AQUI / "banco.tmj").write_text(json.dumps(documento, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


# ---------- iconos de los botones (24×24, crema sobre transparente) ----------
def iconos():
    carpeta = AQUI / "iconos"
    carpeta.mkdir(exist_ok=True)

    def nuevo():
        im = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
        return im, ImageDraw.Draw(im)

    im, d = nuevo()
    d.ellipse([3, 3, 20, 20], fill=CREMA, outline=TINTA)
    im.save(carpeta / "circulo.png")

    im, d = nuevo()
    d.rectangle([4, 4, 19, 19], fill=CREMA, outline=TINTA)
    im.save(carpeta / "cuadrado.png")

    im, d = nuevo()
    d.polygon([(12, 2), (22, 21), (2, 21)], fill=CREMA, outline=TINTA)
    im.save(carpeta / "triangulo.png")

    im, d = nuevo()
    d.polygon([(12, 1), (22, 12), (12, 22), (2, 12)], fill=CREMA, outline=TINTA)
    im.save(carpeta / "rombo.png")

    im, d = nuevo()
    puntos = []
    for i in range(10):
        radio = 10.5 if i % 2 == 0 else 4.5
        angulo = -math.pi / 2 + i * math.pi / 5
        puntos.append((12 + radio * math.cos(angulo), 12 + radio * math.sin(angulo)))
    d.polygon(puntos, fill=CREMA, outline=TINTA)
    im.save(carpeta / "estrella.png")

    # el mismo círculo en amarillo: para comprobar que un botón se sustituye en su sitio
    im, d = nuevo()
    d.ellipse([3, 3, 20, 20], fill=AMARILLO, outline=TINTA)
    im.save(carpeta / "circulo-amarillo.png")


# ---------- un sonido corto (0,2 s, 660 Hz) ----------
def sonido():
    frecuencia, muestras_por_segundo, duracion = 660.0, 22050, 0.2
    total = int(muestras_por_segundo * duracion)
    with wave.open(str(AQUI / "pitido.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(muestras_por_segundo)
        for i in range(total):
            envolvente = min(1.0, i / 200, (total - i) / 800)
            valor = int(12000 * envolvente * math.sin(2 * math.pi * frecuencia * i / muestras_por_segundo))
            w.writeframes(struct.pack("<h", valor))


if __name__ == "__main__":
    AQUI.mkdir(parents=True, exist_ok=True)
    tileset()
    mapa()
    iconos()
    sonido()
    print("Hecho:", ", ".join(sorted(p.name for p in AQUI.iterdir())))
