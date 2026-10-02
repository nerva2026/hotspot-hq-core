/*
 * Punto 4 · LO VEN LOS DEMÁS: lo que hace Alicia («bailar», «saludar», llevar una lata) se ve en la pantalla de
 * Benito, también si Benito entra DESPUÉS de que Alicia lo haya puesto. Todas las capturas son de la pantalla de Benito.
 */
import { test } from "@playwright/test";
import {
    aPantalla,
    captura,
    capturaEntera,
    centro,
    comprobar,
    diferencia,
    entrar,
    espera,
    estadoDeLlamada,
    guardarVariable,
    posicion,
    recorteDelMuneco,
    salir,
    teletransportar,
    type Jugador,
    type Recorte,
} from "./util";

const P = "4";

test("4 · lo que hace uno lo ven los demás", async ({ browser }) => {
    test.setTimeout(420_000);
    let a: Jugador | undefined;
    let b: Jugador | undefined;
    try {
        a = await entrar(browser, "Alicia", { sala: "demas" });
        const alicia = a.pagina;
        await teletransportar(alicia, centro(12, 9));
        await espera(800);
        const sitio = await posicion(alicia);

        // Alicia se pone a bailar con una lata ANTES de que entre Benito
        await guardarVariable(alicia, "lleva", "lata");
        await guardarVariable(alicia, "accion", "bailar");
        await espera(1000);

        b = await entrar(browser, "Benito", { sala: "demas", muneco: "hs-w02" });
        const benito = b.pagina;
        let recorte: Recorte = { x: 0, y: 0, width: 8, height: 8 };

        await comprobar(P, "entra-despues", "Benito entra DESPUÉS y ve a Alicia bailando con la lata", [benito, alicia], async () => {
            // ¿Alicia cae dentro de la pantalla de Benito? Si no, Benito se acerca (sin llegar a juntarse con ella)
            let enPantalla = await aPantalla(benito, sitio);
            const ventana = benito.viewportSize() ?? { width: 1280, height: 800 };
            const cabe = (p: { x: number; y: number }): boolean => p.x > 150 && p.x < ventana.width - 150 && p.y > 300 && p.y < ventana.height - 100;
            let seHaAcercado = false;
            if (!cabe(enPantalla)) {
                await teletransportar(benito, centro(7, 9));
                await espera(1500);
                enPantalla = await aPantalla(benito, sitio);
                seHaAcercado = true;
            }
            await espera(1200);
            recorte = await recorteDelMuneco(benito, sitio);
            const una = await captura(benito, "4-entra-despues-bailar-1", recorte);
            await espera(300);
            const otra = await captura(benito, "4-entra-despues-bailar-2", recorte);
            const entera = await capturaEntera(benito, "4-pantalla-de-benito");
            const seMueve = await diferencia(benito, una, otra);
            return {
                estado: seMueve.distintos > 0 ? "bien" : "mal",
                dato: {
                    aliciaEnElMapa: sitio,
                    aliciaEnLaPantallaDeBenito: enPantalla,
                    benitoSeHaAcercado: seHaAcercado,
                    benito: await posicion(benito),
                    cambiaEntreLasDosCapturas: seMueve,
                    llamada: await estadoDeLlamada(benito),
                },
                capturas: [una, otra, entera],
            };
        });

        await comprobar(P, "saludar", "Alicia saluda y Benito lo ve (en directo)", [benito, alicia], async () => {
            await guardarVariable(alicia, "accion", "saludar");
            await espera(1200);
            const una = await captura(benito, "4-saludar-1", recorte);
            await espera(300);
            const otra = await captura(benito, "4-saludar-2", recorte);
            const seMueve = await diferencia(benito, una, otra);
            return { estado: seMueve.distintos > 0 ? "bien" : "mal", dato: { cambiaEntreLasDosCapturas: seMueve }, capturas: [una, otra] };
        });

        // Ahora se va quitando todo, para tener con qué comparar
        let conLata = "";
        let sinNada = "";
        await comprobar(P, "lata", "Alicia lleva una lata y Benito la ve; al soltarla, deja de verla", [benito, alicia], async () => {
            await guardarVariable(alicia, "accion", null);
            await espera(900);
            conLata = await captura(benito, "4-lata", recorte);
            await guardarVariable(alicia, "lleva", null);
            await espera(900);
            sinNada = await captura(benito, "4-nada-1", recorte);
            await espera(300);
            const sinNada2 = await captura(benito, "4-nada-2", recorte);
            const quieta = await diferencia(benito, sinNada, sinNada2);
            const lata = await diferencia(benito, sinNada, conLata);
            return {
                estado: lata.distintos > 0 && quieta.distintos === 0 ? "bien" : lata.distintos > 0 ? "dato" : "mal",
                dato: { laLataCambiaLaImagen: lata, sinNadaLaImagenEstaQuieta: quieta.distintos === 0, pixelesQueCambianSolos: quieta.distintos },
                capturas: [conLata, sinNada],
            };
        });

        await comprobar(P, "bailar-en-directo", "Alicia se pone a bailar con Benito ya dentro y él lo ve", [benito, alicia], async () => {
            await guardarVariable(alicia, "accion", "bailar");
            await espera(1300);
            const una = await captura(benito, "4-bailar-en-directo-1", recorte);
            await espera(300);
            const otra = await captura(benito, "4-bailar-en-directo-2", recorte);
            const seMueve = await diferencia(benito, una, otra);
            const conNada = await diferencia(benito, sinNada, una);
            await guardarVariable(alicia, "accion", null);
            return {
                estado: seMueve.distintos > 0 && conNada.distintos > 0 ? "bien" : "mal",
                dato: { cambiaEntreLasDosCapturas: seMueve, cambiaRespectoANada: conNada },
                capturas: [una, otra],
            };
        });
    } finally {
        await salir(a, b);
    }
});
