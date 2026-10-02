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

        await comprobar(P, "aviso", "Sale el aviso «¡Bienvenido a la v0.3.1!»", [pagina], async () => {
            const titulo = pagina.locator("#hs-novedades-titulo");
            await expect(titulo).toBeVisible({ timeout: 20_000 });
            const texto = ((await titulo.textContent()) ?? "").trim();
            const lineas = await pagina.locator(".hs-lista li").allTextContents();
            const capturas = [
                await capturaEntera(pagina, "1-aviso-pantalla"),
                await capturaDeElemento(pagina, ".hs-ventana", "1-aviso", 12),
            ];
            return {
                estado: texto === "¡Bienvenido a la v0.3.1!" ? "bien" : "mal",
                dato: { titulo: texto, lineas },
                capturas,
            };
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
                estado: texto === "v0.3.1-alpha" && esquina ? "bien" : "mal",
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
