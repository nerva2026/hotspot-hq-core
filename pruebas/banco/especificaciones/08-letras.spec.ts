/*
 * Punto 8 · LETRAS (hotspot-retro.css y los retoques hs-retoques-*.woff): capturas de la burbuja de «decir», la de
 * «pensar», el nombre sobre la cabeza y un aviso de zona, con la letra que el navegador usa de verdad en cada una;
 * y que las letras de la casa (con sus retoques) se han cargado. El mensaje del chat con su hora se captura en la
 * prueba de la llamada (05), que es donde hay chat.
 */
import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";
import {
    RESULTADOS,
    captura,
    capturaDeElemento,
    centro,
    comprobar,
    entrar,
    espera,
    letraDe,
    posicion,
    recorteDelMuneco,
    salir,
    teletransportar,
    type Jugador,
} from "./util";

const P = "8";
const FRASE = "¿Bailamos a las 17:35? Café con Gabi";
const MARGEN_ALTO = { lados: 110, arriba: 150, abajo: 32 };

test("8 · las letras de la casa", async ({ browser }) => {
    test.setTimeout(420_000);
    let a: Jugador | undefined;
    try {
        a = await entrar(browser, "Alicia", { sala: "letras" });
        const jugador = a;
        const pagina = a.pagina;
        await teletransportar(pagina, centro(12, 9));
        await espera(1500);
        const sitio = await posicion(pagina);
        const recorte = await recorteDelMuneco(pagina, sitio, MARGEN_ALTO);

        await comprobar(P, "nombre", "(d) El nombre sobre la cabeza", [pagina], async () => {
            const letra = await letraDe(pagina, ".username-display > p");
            const capturas = [await capturaDeElemento(pagina, ".username-display", "8d-nombre", 14), await captura(pagina, "8d-nombre-muneco", recorte)];
            return { estado: !!letra && letra.familia.includes("Silkscreen") ? "bien" : "mal", dato: letra, capturas };
        });

        await comprobar(P, "decir", "(a) La burbuja de «decir»", [pagina], async () => {
            await pagina.keyboard.press("Enter");
            await expect(pagina.getByTestId("say-popup")).toBeVisible();
            await pagina.keyboard.type(FRASE, { delay: 10 });
            await pagina.keyboard.press("Enter");
            const burbuja = pagina.locator(".say-bubble").first();
            await expect(burbuja).toBeVisible();
            await espera(500);
            const capturas = [await capturaDeElemento(pagina, ".say-bubble", "8a-decir", 14), await captura(pagina, "8a-decir-muneco", recorte)];
            const letra = await letraDe(pagina, ".say-bubble");
            const bien = !!letra && letra.familia.startsWith('"Pixelify Sans"') && letra.tamano === "11px" && letra.texto === FRASE;
            return { estado: bien ? "bien" : "mal", dato: letra, capturas };
        });

        await comprobar(P, "pensar", "(b) La burbuja de «pensar»", [pagina], async () => {
            await espera(600);
            await pagina.keyboard.down("Control");
            await pagina.keyboard.press("Enter");
            await pagina.keyboard.up("Control");
            await expect(pagina.getByTestId("say-popup")).toBeVisible();
            await pagina.keyboard.type(FRASE, { delay: 10 });
            await pagina.keyboard.press("Enter");
            const nube = pagina.locator(".thinking-cloud").first();
            await expect(nube).toBeVisible();
            await espera(500);
            const capturas = [await capturaDeElemento(pagina, ".thinking-cloud", "8b-pensar", 22), await captura(pagina, "8b-pensar-muneco", recorte)];
            const letra = await letraDe(pagina, ".thinking-cloud .thinking-text");
            const bien = !!letra && letra.familia.startsWith('"Pixelify Sans"') && letra.tamano === "11px";
            return { estado: bien ? "bien" : "mal", dato: letra, capturas };
        });

        await comprobar(P, "aviso-de-zona", "(e) Un aviso de zona con el texto de WorkAdventure («Pulse ESPACIO…»)", [pagina], async () => {
            await teletransportar(pagina, { x: 10 * 32, y: 7 * 32 }); // el centro de la zona «panel-defecto»
            const aviso = pagina.locator(".characterTriggerAction").first();
            await expect(aviso).toBeVisible();
            await espera(900);
            const aqui = await posicion(pagina);
            const capturas = [
                await capturaDeElemento(pagina, ".characterTriggerAction", "8e-aviso-de-zona", 14),
                await captura(pagina, "8e-aviso-de-zona-muneco", await recorteDelMuneco(pagina, aqui, MARGEN_ALTO)),
            ];
            const letra = await letraDe(pagina, ".characterTriggerAction");
            const bien = !!letra && letra.familia.startsWith('"Pixelify Sans"') && letra.tamano === "11px";
            return { estado: bien ? "bien" : "mal", dato: letra, capturas };
        });

        await comprobar(P, "aviso-del-mapa", "(e) Un aviso de zona con el texto que pone el mapa", [pagina], async () => {
            await teletransportar(pagina, centro(12, 9));
            await expect(pagina.locator(".characterTriggerAction")).toHaveCount(0, { timeout: 8_000 }).catch(() => undefined);
            await teletransportar(pagina, { x: 10 * 32, y: 3 * 32 }); // el centro de la zona «panel»
            const aviso = pagina.locator(".characterTriggerAction").first();
            await expect(aviso).toBeVisible();
            await espera(900);
            const aqui = await posicion(pagina);
            const capturas = [
                await capturaDeElemento(pagina, ".characterTriggerAction", "8e-aviso-del-mapa", 14),
                await captura(pagina, "8e-aviso-del-mapa-muneco", await recorteDelMuneco(pagina, aqui, MARGEN_ALTO)),
            ];
            const letra = await letraDe(pagina, ".characterTriggerAction");
            await teletransportar(pagina, centro(12, 9));
            return { estado: !!letra && letra.familia.startsWith('"Pixelify Sans"') ? "bien" : "mal", dato: letra, capturas };
        });

        await comprobar(P, "fuentes", "Las letras de la casa y sus retoques (hs-retoques-*.woff) se han cargado", [pagina], async () => {
            const fuentes = await pagina.evaluate(async (frase) => {
                await Promise.all([
                    document.fonts.load('500 11px "Pixelify Sans"', frase + "0123456789"),
                    document.fonts.load('700 11px "Pixelify Sans"', frase + "0123456789"),
                    document.fonts.load('400 11px "Silkscreen"', "ALICIA 0123456789"),
                    document.fonts.load('700 11px "Silkscreen"', "ALICIA 0123456789"),
                ]);
                await document.fonts.ready;
                const caras = Array.from(document.fonts)
                    .filter((f) => /Pixelify|Silkscreen/.test(f.family))
                    .map((f) => ({ familia: f.family, peso: f.weight, estado: f.status, caracteres: f.unicodeRange }));

                // ¿El 5 y la S salen distintos? (en la Pixelify Sans original son el mismo dibujo: si salen distintos,
                // el retoque está puesto). Se pintan grandes en un lienzo y se cuentan los puntos que cambian.
                const pintar = (letra: string, fuente: string): Uint8ClampedArray => {
                    const lienzo = document.createElement("canvas");
                    lienzo.width = 96;
                    lienzo.height = 120;
                    const pincel = lienzo.getContext("2d");
                    if (!pincel) throw new Error("sin lienzo");
                    pincel.fillStyle = "#fff";
                    pincel.fillRect(0, 0, 96, 120);
                    pincel.fillStyle = "#000";
                    pincel.font = fuente;
                    pincel.textBaseline = "alphabetic";
                    pincel.fillText(letra, 16, 96);
                    return pincel.getImageData(0, 0, 96, 120).data;
                };
                const distintos = (x: string, y: string, fuente: string): number => {
                    const p = pintar(x, fuente);
                    const q = pintar(y, fuente);
                    let n = 0;
                    for (let i = 0; i < p.length; i += 4) if (p[i] !== q[i]) n++;
                    return n;
                };
                const pixelify = '500 88px "Pixelify Sans"';

                // Una muestra para mirarla: cada letra con sus cifras y las letras retocadas, a 4 veces su tamaño
                const muestra = document.createElement("canvas");
                muestra.width = 1180;
                muestra.height = 420;
                const pincel = muestra.getContext("2d");
                if (!pincel) throw new Error("sin lienzo");
                pincel.fillStyle = "#f3e6d8";
                pincel.fillRect(0, 0, muestra.width, muestra.height);
                pincel.fillStyle = "#1c1715";
                pincel.textBaseline = "alphabetic";
                const lineas: [string, string][] = [
                    ['500 44px "Pixelify Sans"', "Pixelify 500: 0123456789 S5 B8 C G a o €"],
                    ['500 44px "Pixelify Sans"', frase],
                    ['700 44px "Pixelify Sans"', "Pixelify 700: 0123456789 S5 B8 C G a o €"],
                    ['400 40px "Silkscreen"', "Silkscreen 400: 0123456789 A4"],
                    ['700 40px "Silkscreen"', "Silkscreen 700: 0123456789 A4"],
                    ["500 44px monospace", "monospace (para comparar): 0123456789 S5"],
                ];
                lineas.forEach(([fuente, texto], i) => {
                    pincel.font = fuente;
                    pincel.fillText(texto, 16, 56 + i * 64);
                });

                return {
                    caras,
                    disponibles: {
                        pixelify500: document.fonts.check('500 11px "Pixelify Sans"', "5BCGa"),
                        silkscreen400: document.fonts.check('400 11px "Silkscreen"', "4"),
                    },
                    puntosQueCambian: {
                        "5 y S (Pixelify)": distintos("5", "S", pixelify),
                        "B y 8 (Pixelify)": distintos("B", "8", pixelify),
                        "a y o (Pixelify)": distintos("a", "o", pixelify),
                        "C y G (Pixelify)": distintos("C", "G", pixelify),
                        "S y S (control: tiene que dar 0)": distintos("S", "S", pixelify),
                    },
                    muestra: muestra.toDataURL("image/png"),
                };
            }, FRASE);
            const archivo = path.join("capturas", "8-muestra-de-letras.png");
            fs.writeFileSync(path.join(RESULTADOS, archivo), Buffer.from(fuentes.muestra.split(",")[1], "base64"));
            const pedidas = jugador.respuestas.filter((r) => r.includes("/static/fonts/"));
            const retoques = pedidas.filter((r) => r.includes("hs-retoques"));
            const retoquesCargados = fuentes.caras.filter((c) => c.familia.includes("Pixelify") && c.caracteres !== "U+0-10FFFF" && c.estado === "loaded");
            const bien =
                retoques.length > 0 &&
                retoques.every((r) => r.startsWith("200 ")) &&
                retoquesCargados.length > 0 &&
                fuentes.puntosQueCambian["5 y S (Pixelify)"] > 0;
            return {
                estado: bien ? "bien" : "mal",
                dato: { carasDeLetra: fuentes.caras, disponibles: fuentes.disponibles, puntosQueCambian: fuentes.puntosQueCambian, archivosPedidos: pedidas.map((r) => r.replace(/https:\/\/[^/]+/, "")) },
                capturas: [archivo],
            };
        });
    } finally {
        await salir(a);
    }
});
