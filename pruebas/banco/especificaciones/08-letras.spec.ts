/*
 * Punto 8 · LETRAS (hotspot-retro.css y los retoques hs-retoques-*.woff): capturas de la burbuja de «decir», la de
 * «pensar», el nombre sobre la cabeza y un aviso de zona, con la letra que el navegador usa de verdad en cada una;
 * y que las letras de la casa (con sus retoques) se han cargado. El mensaje del chat con su hora se captura en la
 * prueba de la llamada (05), que es donde hay chat.
 *
 * Y los HUECOS ENTRE LETRAS (`letras.ts`), que no se ven mirando solo el tamaño: que en las burbujas de decir y de
 * pensar, a 1280×800, 1440×900 y 1920×1080, cada letra retocada deje detrás el mismo hueco que las demás y avance lo
 * mismo que una letra normal de su ancho; y, en una muestra aparte, que cada retoque avance lo que dice su dibujo.
 * Se mide dos veces: con el navegador del banco, que ajusta las letras a la rejilla («hinting» completo:
 * `banco.config.ts`), y con otro que se arranca aquí sin ajuste (como se ven las letras en un Mac). La tabla de
 * avances de cada burbuja queda en `diagnostico/8-huecos-….md`.
 */
import fs from "fs";
import path from "path";
import { chromium, expect, test, type Page } from "@playwright/test";
import { esDeLaRejillaDeTexto, juzgarHuecos, juzgarSonda, medirLetras, sondaDeLetras } from "./letras";
import {
    RESULTADOS,
    aPantalla,
    cajaDe,
    captura,
    capturaDeElemento,
    capturaEntera,
    centro,
    comprobar,
    enScript,
    entrar,
    espera,
    guardarDiagnostico,
    letraDe,
    posicion,
    recorteDelMuneco,
    salir,
    teletransportar,
    type Estado,
    type Jugador,
} from "./util";

const P = "8";
const FRASE = "¿Bailamos a las 17:35? Café con Gabi";
const MARGEN_ALTO = { lados: 110, arriba: 150, abajo: 32 };
/** Para medir los huecos: todas las cifras y las letras retocadas (B C G Z a c f j t í, los paréntesis y el €) entre letras normales. Cabe en los 100 caracteres de «decir». */
const FRASE_DE_HUECOS = "¿Bailamos a las 22:30? Café con Gabi (día de jazz y fútbol). Zona 2: 1234567890 €";
const VENTANAS = [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
];
/** Con qué se arranca el segundo navegador, el que no ajusta las letras (lo demás, como el del banco: `banco.config.ts`). */
const NAVEGADOR_SIN_HINTING = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--font-render-hinting=none"];

/** Dice (o piensa) algo y espera a que salga la burbuja. */
async function decirEn(pagina: Page, texto: string, pensando = false): Promise<void> {
    if (pensando) await pagina.keyboard.down("Control");
    await pagina.keyboard.press("Enter");
    if (pensando) await pagina.keyboard.up("Control");
    await expect(pagina.getByTestId("say-popup")).toBeVisible();
    await pagina.keyboard.type(texto, { delay: 10 });
    await pagina.keyboard.press("Enter");
    await expect(pagina.locator(pensando ? ".thinking-cloud" : ".say-bubble").first()).toBeVisible();
    await espera(500);
}

/**
 * Los huecos entre letras, con el navegador de `jugador`. `conHinting` dice lo que se espera de ese navegador: si no
 * ajusta las letras cuando debería (o al revés), la medida no vale para lo que se quiere y se apunta «no se pudo».
 * Las claves llevan `sufijo` («» con el navegador del banco, «-sin-hinting» con el otro).
 */
async function comprobarHuecos(jugador: Jugador, conHinting: boolean, sufijo: string): Promise<void> {
    const pagina = jugador.pagina;
    const comoSeVe = conHinting ? "con «hinting» completo" : "sin «hinting»";

    await comprobar(P, "retoques" + sufijo, `Cada letra retocada avanza lo que dice su dibujo y lo mismo que una normal de su ancho (${comoSeVe})`, [pagina], async () => {
        const juicio = juzgarSonda(await sondaDeLetras(pagina));
        const tabla = guardarDiagnostico(`8-avances-de-los-retoques${sufijo}.md`, ["# Lo que avanza cada letra en la muestra, en px (las retocadas, con *)", "", ...juicio.tabla.map((l) => "- " + l), "", "## Desajustadas", "", ...(juicio.desajustados.length > 0 ? juicio.desajustados.map((l) => "- " + l) : ["Ninguna."]), ""].join("\n"));
        const dato = { elNavegadorAjustaLasLetras: juicio.conHinting, retoquesMedidos: juicio.retoquesMedidos, desajustados: juicio.desajustados.length, losPrimeros: juicio.desajustados.slice(0, 6), muestra: juicio.tabla.slice(0, 2), tabla };
        let estado: Estado = juicio.bien ? "bien" : "mal";
        if (juicio.conHinting !== conHinting) estado = juicio.bien ? "no se pudo" : "mal";
        return { estado, dato: juicio.conHinting !== conHinting ? { aviso: `se esperaba un navegador ${comoSeVe} y no lo es: la medida no vale para eso`, ...dato } : dato, capturas: [tabla] };
    });

    for (const [clave, pensando, burbuja, texto] of [
        ["decir", false, ".say-bubble", ".say-bubble"],
        ["pensar", true, ".thinking-cloud", ".thinking-cloud .thinking-text"],
    ] as const) {
        await comprobar(P, `huecos-${clave}${sufijo}`, `Huecos parejos entre letras en la burbuja de «${clave}», a 1280, 1440 y 1920 px (${comoSeVe})`, [pagina], async () => {
            const medidas: Record<string, unknown> = {};
            const capturas: string[] = [];
            const tablas: string[] = [`# Burbuja de «${clave}» ${comoSeVe}: letra (con * las retocadas), lo que avanza en px de la pantalla y el hueco que deja, en puntos de la letra`, ""];
            let parejos = true;
            for (const ventana of VENTANAS) {
                const nombre = `${ventana.width}x${ventana.height}`;
                await pagina.setViewportSize(ventana);
                await espera(2000);
                await decirEn(pagina, FRASE_DE_HUECOS, pensando);
                await pagina.evaluate(() => document.fonts.ready);
                await espera(300);
                const medida = await medirLetras(pagina, texto);
                if (!medida) throw new Error(`No se ve el texto de la burbuja («${texto}») a ${nombre}`);
                const juicio = juzgarHuecos(medida);
                const { tabla, ...resumen } = juicio;
                medidas[nombre] = { letra_px: medida.tamano, ampliacion: Math.round(medida.ampliacion * 1000) / 1000, trazado: medida.trazado, ...resumen };
                tablas.push(`## ${nombre}: letra de ${medida.tamano} px ampliada ×${Math.round(medida.ampliacion * 1000) / 1000} · ${juicio.parejos ? "parejos" : "DESIGUALES: " + juicio.desiguales.join(", ")}`, "", tabla, "");
                parejos = parejos && juicio.parejos;
                capturas.push(await capturaDeElemento(pagina, burbuja, `8f-huecos-${clave}-${nombre}${sufijo}`, 14));
                await espera(5200); // la burbuja se va sola a los 5 s
            }
            capturas.push(guardarDiagnostico(`8-huecos-${clave}${sufijo}.md`, tablas.join("\n")));
            return { estado: parejos ? "bien" : "mal", dato: medidas, capturas };
        });
    }
    await pagina.setViewportSize(VENTANAS[0]);
    await espera(2000);
}

test("8 · las letras de la casa", async ({ browser }) => {
    test.setTimeout(900_000);
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

        /** Dice algo y espera a que salga la burbuja. */
        const decir = (texto: string, pensando = false): Promise<void> => decirEn(pagina, texto, pensando);
        /** Cuánto se meten la burbuja (con su pico, de 5 puntos del mapa) y la etiqueta del nombre una en la otra, en píxeles de pantalla. */
        const solape = async (burbuja: string): Promise<Record<string, unknown>> => {
            const b = await cajaDe(pagina, burbuja);
            const n = await cajaDe(pagina, ".username-display");
            if (!b || !n) return { error: "no se ve la burbuja o el nombre" };
            const zoom = (await aPantalla(pagina, { x: 32, y: 0 })).x - (await aPantalla(pagina, { x: 0, y: 0 })).x;
            const pico = 5 * (zoom / 32);
            const seCruzanALoAncho = b.x < n.x + n.width && n.x < b.x + b.width;
            return {
                burbuja: { arriba: Math.round(b.y), abajo: Math.round(b.y + b.height), alto: Math.round(b.height), ancho: Math.round(b.width) },
                nombre: { arriba: Math.round(n.y), abajo: Math.round(n.y + n.height) },
                huecoEntreLaBurbujaYElNombre_px: Math.round((n.y - (b.y + b.height)) * 10) / 10,
                elPicoMide_px: Math.round(pico * 10) / 10,
                elNombreTapaElPico: seCruzanALoAncho && n.y < b.y + b.height + pico - 0.5,
                laBurbujaPisaElNombre: seCruzanALoAncho && n.y < b.y + b.height - 0.5,
            };
        };

        /**
         * ¿Cae la letra de la burbuja en puntos enteros de la pantalla? Pixelify Sans es de píxeles: a 10,75 px cada punto
         * suyo mide 1 px. El parche 13 elige el tamaño según la ampliación del juego; aquí se mide lo que ha salido.
         */
        const nitidez = async (tamano: string): Promise<{ enPantalla_px: number; puntosDePantallaPorPuntoDeLetra: number; limpia: boolean }> => {
            const porCasilla = (await aPantalla(pagina, { x: 32, y: 0 })).x - (await aPantalla(pagina, { x: 0, y: 0 })).x;
            const densidad = await pagina.evaluate(() => window.devicePixelRatio);
            const enPantalla = parseFloat(tamano) * (porCasilla / 32);
            const puntos = (enPantalla * densidad) / 10.75;
            return {
                enPantalla_px: Math.round(enPantalla * 100) / 100,
                puntosDePantallaPorPuntoDeLetra: Math.round(puntos * 1000) / 1000,
                limpia: Math.abs(puntos - Math.round(puntos)) < 0.05 && enPantalla >= 14.5,
            };
        };

        await comprobar(P, "decir", "(a) La burbuja de «decir» (dos líneas)", [pagina], async () => {
            await decir(FRASE);
            const capturas = [await capturaDeElemento(pagina, ".say-bubble", "8a-decir", 14), await captura(pagina, "8a-decir-muneco", recorte)];
            const letra = await letraDe(pagina, ".say-bubble");
            const sitioDeLaBurbuja = await solape(".say-bubble");
            const nitida = letra ? await nitidez(letra.tamano) : null;
            const letraBien = !!letra && letra.familia.startsWith('"Pixelify Sans"') && !!nitida && nitida.limpia && letra.texto === FRASE;
            const sitioBien = sitioDeLaBurbuja.elNombreTapaElPico === false;
            return { estado: letraBien && sitioBien ? "bien" : "mal", dato: { letra, nitidez: nitida, sitioDeLaBurbuja }, capturas };
        });

        await comprobar(P, "decir-corto", "(a) La burbuja de «decir» con un texto corto (una línea)", [pagina], async () => {
            await espera(5200); // la anterior se va sola a los 5 s
            await decir("¡Hola! 5 S");
            const capturas = [await capturaDeElemento(pagina, ".say-bubble", "8a-decir-corto", 14), await captura(pagina, "8a-decir-corto-muneco", recorte)];
            const sitioDeLaBurbuja = await solape(".say-bubble");
            return { estado: sitioDeLaBurbuja.elNombreTapaElPico === false ? "bien" : "mal", dato: { sitioDeLaBurbuja }, capturas };
        });

        await comprobar(P, "decir-largo", "(a) La burbuja de «decir» con un texto largo (tres líneas o más)", [pagina], async () => {
            await espera(5200);
            await decir("¿Bailamos a las 17:35? Café con Gabi y luego 2 cañas en el bar de abajo, a las 20:45");
            const capturas = [await captura(pagina, "8a-decir-largo-muneco", await recorteDelMuneco(pagina, sitio, { lados: 130, arriba: 170, abajo: 32 }))];
            const sitioDeLaBurbuja = await solape(".say-bubble");
            return { estado: sitioDeLaBurbuja.elNombreTapaElPico === false ? "bien" : "mal", dato: { sitioDeLaBurbuja }, capturas };
        });

        await comprobar(P, "pensar", "(b) La burbuja de «pensar»", [pagina], async () => {
            await espera(5200);
            await decir(FRASE, true);
            const capturas = [await capturaDeElemento(pagina, ".thinking-cloud", "8b-pensar", 22), await captura(pagina, "8b-pensar-muneco", recorte)];
            const letra = await letraDe(pagina, ".thinking-cloud .thinking-text");
            const sitioDeLaBurbuja = await solape(".thinking-cloud");
            const nitida = letra ? await nitidez(letra.tamano) : null;
            const bien = !!letra && letra.familia.startsWith('"Pixelify Sans"') && !!nitida && nitida.limpia && sitioDeLaBurbuja.laBurbujaPisaElNombre === false;
            return { estado: bien ? "bien" : "mal", dato: { letra, nitidez: nitida, sitioDeLaBurbuja }, capturas };
        });

        await comprobar(P, "zoom", "Con qué ampliación se ve el juego (de ella depende que las letras de las burbujas salgan limpias)", [pagina], async () => {
            const medidas: Record<string, unknown> = {};
            const capturas: string[] = [];
            for (const tamano of [
                { width: 1280, height: 800 },
                { width: 1440, height: 900 },
                { width: 1920, height: 1080 },
            ]) {
                await pagina.setViewportSize(tamano);
                await espera(2000);
                const o = await aPantalla(pagina, { x: 0, y: 0 });
                const u = await aPantalla(pagina, { x: 32, y: 0 });
                const ampliacion = (u.x - o.x) / 32;
                medidas[`${tamano.width}x${tamano.height}`] = { ampliacion, pixelesDePantallaPorPuntoDeLetraDe11: ampliacion, letraDe11pxSeVeA_px: 11 * ampliacion, sale: Number.isInteger(ampliacion) ? "limpia (ampliación entera)" : "con medios píxeles (ampliación no entera)" };
                if (tamano.width !== 1280) {
                    await decir(FRASE);
                    capturas.push(await capturaDeElemento(pagina, ".say-bubble", `8a-decir-${tamano.width}x${tamano.height}`, 14));
                    await espera(5200);
                }
            }
            await pagina.setViewportSize({ width: 1280, height: 800 });
            await espera(2000);
            return { estado: "dato", dato: medidas, capturas };
        });

        /** La letra del texto y del botón de un aviso de los de abajo (los «popup» de WorkAdventure). */
        const letrasDelAviso = async (): Promise<{ texto: Record<string, string> | null; boton: Record<string, string> | null; caja: unknown }> => ({
            texto: await letraDe(pagina, ".popup-container .responsive-message"),
            boton: await letraDe(pagina, ".popup-container .buttons-wrapper button"),
            caja: await cajaDe(pagina, ".popup-container"),
        });
        const deLaCasa = (letra: Record<string, string> | null): boolean => !!letra && /^"?(Pixelify Sans|Silkscreen)/.test(letra.familia);

        await comprobar(P, "aviso-de-zona", "(e) El aviso de una zona con el texto de WorkAdventure («Pulse ESPACIO…»)", [pagina], async () => {
            await teletransportar(pagina, { x: 10 * 32, y: 7 * 32 }); // el centro de la zona «panel-defecto»
            await expect(pagina.locator(".popup-container").first()).toBeVisible();
            await espera(900);
            const capturas = [await capturaDeElemento(pagina, ".popup-container", "8e-aviso-de-zona", 14), await capturaEntera(pagina, "8e-aviso-de-zona-pantalla")];
            const letras = await letrasDelAviso();
            const avisosJuntoAlMuneco = await pagina.locator(".characterTriggerAction").count();
            return {
                estado: deLaCasa(letras.texto) && (letras.boton === null || deLaCasa(letras.boton)) ? "bien" : "mal",
                dato: { ...letras, avisosJuntoAlMuneco_characterTriggerAction: avisosJuntoAlMuneco },
                capturas,
            };
        });

        await comprobar(P, "aviso-del-mapa", "(e) El aviso de una zona con el texto que pone el mapa", [pagina], async () => {
            await teletransportar(pagina, centro(12, 9));
            await expect(pagina.locator(".popup-container")).toHaveCount(0, { timeout: 8_000 }).catch(() => undefined);
            await teletransportar(pagina, { x: 10 * 32, y: 3 * 32 }); // el centro de la zona «panel»
            await expect(pagina.locator(".popup-container").first()).toBeVisible();
            await espera(900);
            const capturas = [await capturaDeElemento(pagina, ".popup-container", "8e-aviso-del-mapa", 14)];
            const letras = await letrasDelAviso();
            await teletransportar(pagina, centro(12, 9));
            await expect(pagina.locator(".popup-container")).toHaveCount(0, { timeout: 8_000 }).catch(() => undefined);
            return { estado: deLaCasa(letras.texto) && (letras.boton === null || deLaCasa(letras.boton)) ? "bien" : "mal", dato: letras, capturas };
        });

        await comprobar(P, "aviso-del-script", "(e) Un aviso puesto por el script del mapa con ui.displayActionMessage", [pagina], async () => {
            await enScript(pagina, () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const w = window as any;
                w.bancoAvisoPulsado = 0;
                w.bancoAviso = w.WA.ui.displayActionMessage({
                    message: "Pulsa ESPACIO para probar el aviso (17:35)",
                    type: "message",
                    callback: () => {
                        w.bancoAvisoPulsado++;
                    },
                });
            });
            await expect(pagina.locator(".popup-container").first()).toBeVisible();
            await espera(900);
            const capturas = [await capturaDeElemento(pagina, ".popup-container", "8e-aviso-del-script", 14), await capturaEntera(pagina, "8e-aviso-del-script-pantalla")];
            const letras = await letrasDelAviso();
            const avisosJuntoAlMuneco = await pagina.locator(".characterTriggerAction").count();
            await pagina.keyboard.press("Space");
            await espera(600);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pulsado = await enScript(pagina, () => (window as any).bancoAvisoPulsado);
            const sigue = await pagina.locator(".popup-container").count();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await enScript(pagina, async () => { try { await (window as any).bancoAviso.remove(); } catch { /* ya no está */ } });
            return {
                estado: deLaCasa(letras.texto) ? "bien" : "mal",
                dato: { dondeSale: "abajo, en el centro de la pantalla (no junto al muñeco)", ...letras, avisosJuntoAlMuneco_characterTriggerAction: avisosJuntoAlMuneco, espacioLlamaAlCallback: pulsado, trasEspacioElAvisoSigue: sigue > 0 },
                capturas,
            };
        });

        await comprobar(P, "aviso-junto-al-muneco", "(e) Un aviso junto al muñeco (ui.displayPlayerMessage): es el que viste hotspot-retro.css (.characterTriggerAction)", [pagina], async () => {
            await enScript(pagina, () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const w = window as any;
                w.bancoMensaje = w.WA.ui.displayPlayerMessage({ message: "Pulsa ESPACIO para probar (17:35)", type: "message", callback: () => undefined });
            });
            const aviso = pagina.locator(".characterTriggerAction").first();
            await expect(aviso).toBeVisible();
            await espera(900);
            const capturas = [await capturaDeElemento(pagina, ".characterTriggerAction", "8e-aviso-junto-al-muneco", 14), await captura(pagina, "8e-aviso-junto-al-muneco-muneco", recorte)];
            const letra = await letraDe(pagina, ".characterTriggerAction");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await enScript(pagina, async () => { try { await (window as any).bancoMensaje.remove(); } catch { /* ya no está */ } });
            const bien = !!letra && letra.familia.startsWith('"Pixelify Sans"') && letra.tamano === "11px";
            return { estado: bien ? "bien" : "mal", dato: letra, capturas };
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
                muestra.width = 1400;
                muestra.height = 420;
                const pincel = muestra.getContext("2d");
                if (!pincel) throw new Error("sin lienzo");
                pincel.fillStyle = "#f3e6d8";
                pincel.fillRect(0, 0, muestra.width, muestra.height);
                pincel.fillStyle = "#1c1715";
                pincel.textBaseline = "alphabetic";
                const lineas: [string, string][] = [
                    ['500 44px "Pixelify Sans"', "Pixelify 500: 0123456789 S5 B8 C G a o c Z2 j (1) € Efectivo: día"],
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
                        "c y o (Pixelify)": distintos("c", "o", pixelify),
                        "Z y 2 (Pixelify)": distintos("Z", "2", pixelify),
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

        await comprobar(P, "franja", "La franja de avisos (WA.ui.banner), a un tamaño de la rejilla de la letra: 16 px el texto y el botón", [pagina], async () => {
            await enScript(pagina, () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).WA.ui.banner.openBanner({ id: "banco-franja", text: "Aviso de prueba del banco: 17:35", bgColor: "#e0562a", textColor: "#ffffff", closable: true });
            });
            const franja = pagina.locator("#banco-franja");
            await expect(franja).toBeVisible();
            await espera(700);
            const texto = await letraDe(pagina, "#banco-franja > div");
            const boton = await letraDe(pagina, "#banco-franja button");
            const capturas = [await capturaDeElemento(pagina, "#banco-franja", "8g-franja", 10)];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await enScript(pagina, () => (window as any).WA.ui.banner.closeBanner());
            await expect(franja).toHaveCount(0, { timeout: 8_000 }).catch(() => undefined);
            const deLaCasaYEnLaRejilla = (letra: Record<string, string> | null): boolean => deLaCasa(letra) && esDeLaRejillaDeTexto(letra?.tamano);
            return { estado: deLaCasaYEnLaRejilla(texto) && deLaCasaYEnLaRejilla(boton) && texto?.tamano === "16px" ? "bien" : "mal", dato: { texto, boton }, capturas };
        });

        // Los huecos entre letras, con el navegador del banco («hinting» completo)
        await teletransportar(pagina, centro(12, 9));
        await comprobarHuecos(jugador, true, "");
    } finally {
        await salir(a);
    }

    // Y otra vez sin «hinting» (como se ven las letras en un Mac), con un navegador arrancado aquí para eso
    const sinHinting = await chromium.launch({ args: NAVEGADOR_SIN_HINTING });
    let b: Jugador | undefined;
    try {
        b = await entrar(sinHinting, "Alicia", { sala: "letras-sin-hinting" });
        await teletransportar(b.pagina, centro(12, 9));
        await espera(1500);
        await comprobarHuecos(b, false, "-sin-hinting");
    } finally {
        await salir(b);
        await sinHinting.close();
    }
});
