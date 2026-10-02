/*
 * Sonda del banco: dos jugadores se juntan y se guarda cómo queda la página (DOM y capturas). No comprueba nada de la
 * oficina: sirve para saber que el banco es capaz de montar una llamada y para escribir las demás pruebas sin adivinar.
 */
import { test } from "@playwright/test";
import {
    banco,
    capturaEntera,
    centro,
    comprobar,
    entrar,
    esperarLlamada,
    estadoDeLlamada,
    guardarDiagnostico,
    posicion,
    salir,
    teletransportar,
    type Jugador,
} from "./util";

const P = "0";

test("0 · sonda: dos jugadores se juntan", async ({ browser }) => {
    test.setTimeout(420_000);
    let a: Jugador | undefined;
    let b: Jugador | undefined;
    try {
        await comprobar(P, "llamada", "El banco es capaz de montar una llamada entre dos jugadores", [], async () => {
            a = await entrar(browser, "Alicia", { sala: "sonda" });
            await teletransportar(a.pagina, centro(5, 8));
            b = await entrar(browser, "Benito", { sala: "sonda", muneco: "hs-w02" });
            const antes = await estadoDeLlamada(a.pagina);
            await teletransportar(b.pagina, centro(6, 8));
            let estado;
            let error = "";
            try {
                estado = await esperarLlamada(a.pagina, 45_000);
            } catch (e) {
                error = String(e);
                estado = await estadoDeLlamada(a.pagina);
            }
            const capturas = [await capturaEntera(a.pagina, "0-llamada-alicia"), await capturaEntera(b.pagina, "0-llamada-benito")];
            guardarDiagnostico("llamada-cuerpo-alicia.html", await a.pagina.evaluate(() => document.body.outerHTML));
            return {
                estado: error === "" ? "bien" : "no se pudo",
                dato: {
                    error,
                    antesDeJuntarse: antes,
                    alicia: estado,
                    benito: await estadoDeLlamada(b.pagina),
                    posiciones: { alicia: await posicion(a.pagina), benito: await posicion(b.pagina) },
                    scriptAlicia: (await banco(a.pagina)).llamada,
                },
                capturas,
            };
        });
    } finally {
        await salir(a, b);
    }
});
