/*
 * Punto 1 · ARRANCA: se entra en el mapa de prueba con nuestra imagen, abajo a la izquierda pone la versión y sale
 * (y se cierra) el aviso de bienvenida.
 */
import { expect, test } from "@playwright/test";
import {
    VERSION,
    aPantalla,
    banco,
    captura,
    capturaDeElemento,
    capturaEntera,
    comprobar,
    entrar,
    guardarDiagnostico,
    posicion,
    salir,
    type Jugador,
} from "./util";

const P = "1";

test("1 · arranca: versión y aviso de bienvenida", async ({ browser }) => {
    test.setTimeout(420_000);
    let a: Jugador | undefined;
    try {
        const entrada = await comprobar(P, "entra", "Se entra en el mapa de prueba con nuestra imagen", [], async () => {
            a = await entrar(browser, "Alicia", { sala: "arranca", novedadesVistas: false });
            const titulo = await a.pagina.title();
            const b = await banco(a.pagina);
            return {
                estado: b.errores.length === 0 ? "bien" : "mal",
                dato: {
                    titulo,
                    muneco: a.muneco,
                    direccion: a.pagina.url(),
                    erroresDelScript: b.errores,
                    posicion: await posicion(a.pagina),
                },
            };
        });
        if (!a || entrada.estado === "no se pudo") throw new Error("No se ha podido entrar: " + JSON.stringify(entrada.dato));
        const pagina = a.pagina;

        await comprobar(P, "aviso", "Sale el aviso «¡Bienvenido a la v0.4.1!»", [pagina], async () => {
            const titulo = pagina.locator("#hs-novedades-titulo");
            await expect(titulo).toBeVisible({ timeout: 20_000 });
            const texto = ((await titulo.textContent()) ?? "").trim();
            const lineas = await pagina.locator(".hs-cuerpo > .hs-lista li").allTextContents();
            const capturas = [
                await capturaEntera(pagina, "1-aviso-pantalla"),
                await capturaDeElemento(pagina, ".hs-ventana", "1-aviso", 12),
            ];
            return {
                estado: texto === "¡Bienvenido a la v0.4.1!" && lineas.length >= 5 ? "bien" : "mal",
                dato: { titulo: texto, lineas },
                capturas,
            };
        });

        await comprobar(P, "historico", "Debajo de las novedades, el histórico: cada versión anterior, plegada, se abre y enseña lo que traía", [pagina], async () => {
            const anteriores = pagina.getByTestId("hotspot-version-anterior");
            const versiones = (await anteriores.locator(".hs-anterior-numero").allTextContents()).map((t) => t.trim());
            const fechas = (await anteriores.locator(".hs-anterior-fecha").allTextContents()).map((t) => t.trim());
            const plegadas = await anteriores.evaluateAll((lista) => lista.map((d) => !(d as HTMLDetailsElement).open));
            await anteriores.first().locator("summary").click();
            const abierta = await anteriores.first().evaluate((d) => (d as HTMLDetailsElement).open);
            const lineasDeLaPrimera = await anteriores.first().locator("li").allTextContents();
            const capturas = [await capturaDeElemento(pagina, ".hs-ventana", "1-aviso-historico", 12)];
            // …y se vuelve a plegar (el botón de cerrar tiene que seguir a la vista para lo que viene después)
            await anteriores.first().locator("summary").click();
            const bien =
                versiones.length >= 2 &&
                versiones[0] === "v0.4.0" &&
                versiones.includes("v0.3.0") &&
                fechas.every((f) => f.length > 0) &&
                plegadas.every((x) => x) &&
                abierta &&
                lineasDeLaPrimera.length >= 5;
            return { estado: bien ? "bien" : "mal", dato: { versiones, fechas, plegadas, abierta, lineasDeLaPrimera }, capturas };
        });

        await comprobar(P, "aviso-cierra", "El aviso se cierra con su botón", [pagina], async () => {
            await pagina.getByTestId("hotspot-novedades-cerrar").click();
            await expect(pagina.locator("#hs-novedades-titulo")).toBeHidden();
            return { estado: "bien", dato: "cerrado con el botón «Cerrar»" };
        });

        await comprobar(P, "version", "Abajo a la izquierda pone la versión", [pagina], async () => {
            const etiqueta = pagina.locator("#hotspot-version");
            await expect(etiqueta).toBeVisible();
            const texto = ((await etiqueta.textContent()) ?? "").trim();
            const caja = await etiqueta.boundingBox();
            const ventana = pagina.viewportSize();
            const capturas = [
                await capturaEntera(pagina, "1-pantalla-1280x800"),
                await captura(pagina, "1-version", { x: 0, y: (ventana?.height ?? 800) - 120, width: 360, height: 120 }),
            ];
            const esquina = !!caja && !!ventana && caja.x < 200 && caja.y + caja.height > ventana.height - 120;
            return {
                estado: texto === "v0.4.1" && esquina ? "bien" : "mal",
                dato: { texto, caja, ventana, versionDelRepositorio: VERSION },
                capturas,
            };
        });

        await comprobar(P, "aviso-vuelve", "Pulsar la versión vuelve a abrir el aviso, y Esc lo cierra", [pagina], async () => {
            await pagina.locator("#hotspot-version").click();
            await expect(pagina.locator("#hs-novedades-titulo")).toBeVisible();
            await pagina.keyboard.press("Escape");
            await expect(pagina.locator("#hs-novedades-titulo")).toBeHidden();
            return { estado: "bien", dato: "se abre al pulsar la versión y se cierra con Esc" };
        });

        // Datos para escribir y entender las demás pruebas (no es una comprobación de la oficina)
        await comprobar(P, "medidas", "Medidas de la pantalla (para leer las capturas)", [pagina], async () => {
            const o = await aPantalla(pagina, { x: 0, y: 0 });
            const u = await aPantalla(pagina, { x: 32, y: 32 });
            const dom = await pagina.evaluate(() => ({
                marcos: Array.from(document.querySelectorAll("iframe")).map((f) => f.src || "(srcdoc)"),
                lienzo: document.querySelector("#game canvas")?.getBoundingClientRect().toJSON(),
                dpr: window.devicePixelRatio,
                idioma: navigator.language,
            }));
            guardarDiagnostico("arranque-cuerpo.html", await pagina.evaluate(() => document.body.outerHTML));
            return {
                estado: "dato",
                dato: { pixelesDePantallaPorCasilla: { x: u.x - o.x, y: u.y - o.y }, origenDelMapaEnPantalla: o, ...dom },
            };
        });
    } finally {
        await salir(a);
    }
});
