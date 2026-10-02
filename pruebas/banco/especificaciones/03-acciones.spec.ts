/*
 * Punto 3 · ACCIONES (parche 08): el script guarda las variables públicas «accion» y «lleva» del jugador y el muñeco
 * las dibuja. Por cada valor: dos capturas del muñeco separadas 300 ms (para ver que se mueve) y la cuenta de píxeles
 * que cambian respecto al muñeco sin hacer nada y entre las dos capturas.
 */
import { test } from "@playwright/test";
import {
    captura,
    centro,
    comprobar,
    diferencia,
    entrar,
    erroresDesde,
    espera,
    guardarVariable,
    posicion,
    recorteDelMapa,
    recorteDelMuneco,
    salir,
    teletransportar,
    type Jugador,
} from "./util";

const P = "3";

/** valor de «accion» → si tiene que verse moverse entre dos capturas */
const ACCIONES: [string, boolean][] = [
    ["bailar", true],
    ["sentado:abajo", false],
    ["sentado:izquierda", false],
    ["sentado:derecha", false],
    ["sentado:arriba", false],
    ["saludar", true],
    ["aplaudir", true],
    ["sentado:abajo+mano", true],
    ["sentado:abajo+palmas", true],
    ["bailar+mano", true],
    ["sentado:abajo+gotas", true],
    ["sentado:abajo+nube", true],
    ["quieto+burbujas", true],
    ["sentado:abajo+zetas", true],
    ["quieto+corazones", true],
    ["quieto+chispas", true],
];
const OBJETOS = ["lata", "cafe", "agua", "cana", "snack", "disco"];
const NO_EXISTEN = ["volar", "sentado:abajo+nada"];

const archivo = (texto: string): string => texto.replace(/[:+]/g, "-");

test("3 · acciones y cosas en la mano (parche 08)", async ({ browser }) => {
    test.setTimeout(420_000);
    let a: Jugador | undefined;
    try {
        a = await entrar(browser, "Alicia", { sala: "acciones" });
        const jugador = a;
        const pagina = a.pagina;
        await teletransportar(pagina, centro(12, 9));
        await espera(1500); // que la cámara se quede quieta
        const sitio = await posicion(pagina);
        const recorte = await recorteDelMuneco(pagina, sitio);

        // El muñeco sin hacer nada: la referencia. Dos capturas tienen que salir iguales (si no, comparar no vale).
        let referencia = "";
        await comprobar(P, "referencia", "El muñeco sin hacer nada (referencia para comparar)", [pagina], async () => {
            await guardarVariable(pagina, "accion", null);
            await guardarVariable(pagina, "lleva", null);
            await espera(800);
            referencia = await captura(pagina, "3-nada-1", recorte);
            await espera(300);
            const otra = await captura(pagina, "3-nada-2", recorte);
            const d = await diferencia(pagina, referencia, otra);
            return {
                estado: d.distintos === 0 ? "dato" : "no se pudo",
                dato: { muneco: jugador.muneco, posicion: sitio, recorte, pixelesQueCambianSolos: d.distintos },
                capturas: [referencia, otra],
            };
        });

        for (const [valor, seMueve] of ACCIONES) {
            await comprobar(P, `accion-${archivo(valor)}`, `accion: "${valor}"`, [pagina], async () => {
                const marca = jugador.consola.length;
                await guardarVariable(pagina, "accion", valor);
                await espera(1300); // los dibujitos empiezan a salir con el siguiente tiempo (medio segundo)
                const una = await captura(pagina, `3-accion-${archivo(valor)}-1`, recorte);
                await espera(300);
                const otra = await captura(pagina, `3-accion-${archivo(valor)}-2`, recorte);
                const conNada = await diferencia(pagina, referencia, una);
                const entreLasDos = await diferencia(pagina, una, otra);
                // Dos capturas pueden caer por casualidad en el mismo momento de un vaivén corto (el aplauso da dos
                // botes por tiempo): si salen iguales, se sacan unas cuantas más, a destiempo, antes de decir que no se mueve.
                const capturas = [una, otra];
                let seHaVistoMoverse = entreLasDos.distintos > 0;
                for (let i = 3; seMueve && !seHaVistoMoverse && i <= 7; i++) {
                    await espera(70 + i * 23);
                    const mas = await captura(pagina, `3-accion-${archivo(valor)}-${i}`, recorte);
                    capturas.push(mas);
                    seHaVistoMoverse = (await diferencia(pagina, una, mas)).distintos > 0;
                }
                const errores = erroresDesde(jugador, marca);
                const seVe = conNada.distintos > 0;
                const bien = seVe && (seMueve ? seHaVistoMoverse : entreLasDos.distintos === 0) && errores.length === 0;
                return {
                    estado: bien ? "bien" : "mal",
                    dato: {
                        cambiaRespectoANada: conNada,
                        cambiaEntreLasDosCapturas: entreLasDos,
                        teniaQueMoverse: seMueve,
                        seHaVistoMoverse,
                        capturasHechas: capturas.length,
                        errores,
                    },
                    capturas,
                };
            });
        }
        await guardarVariable(pagina, "accion", null);
        await espera(600);

        for (const objeto of OBJETOS) {
            await comprobar(P, `lleva-${objeto}`, `lleva: "${objeto}"`, [pagina], async () => {
                const marca = jugador.consola.length;
                await guardarVariable(pagina, "lleva", objeto);
                await espera(700);
                const una = await captura(pagina, `3-lleva-${objeto}`, recorte);
                const conNada = await diferencia(pagina, referencia, una);
                const errores = erroresDesde(jugador, marca);
                return {
                    estado: conNada.distintos > 0 && errores.length === 0 ? "bien" : "mal",
                    dato: { cambiaRespectoANada: conNada, errores },
                    capturas: [una],
                };
            });
        }

        await comprobar(P, "beber", 'accion: "beber" con una lata en la mano', [pagina], async () => {
            const marca = jugador.consola.length;
            await guardarVariable(pagina, "lleva", "lata");
            await guardarVariable(pagina, "accion", "beber");
            await espera(900);
            const capturas: string[] = [];
            for (let i = 1; i <= 4; i++) {
                capturas.push(await captura(pagina, `3-beber-${i}`, recorte));
                await espera(300);
            }
            const conNada = await diferencia(pagina, referencia, capturas[0]);
            const movimientos = [];
            for (let i = 1; i < capturas.length; i++) movimientos.push((await diferencia(pagina, capturas[i - 1], capturas[i])).distintos);
            const errores = erroresDesde(jugador, marca);
            return {
                estado: conNada.distintos > 0 && movimientos.some((n) => n > 0) && errores.length === 0 ? "bien" : "mal",
                dato: { cambiaRespectoANada: conNada, pixelesQueCambianEntreCapturas: movimientos, errores },
                capturas,
            };
        });
        await guardarVariable(pagina, "accion", null);
        await guardarVariable(pagina, "lleva", null);
        await espera(600);

        for (const valor of NO_EXISTEN) {
            await comprobar(P, `no-existe-${archivo(valor)}`, `Un valor que no existe: "${valor}"`, [pagina], async () => {
                const marca = jugador.consola.length;
                await guardarVariable(pagina, "accion", valor);
                await espera(1300);
                const una = await captura(pagina, `3-no-existe-${archivo(valor)}`, recorte);
                const conNada = await diferencia(pagina, referencia, una);
                const errores = erroresDesde(jugador, marca);
                return {
                    estado: conNada.distintos === 0 && errores.length === 0 ? "bien" : "mal",
                    dato: { cambiaRespectoANada: conNada, errores },
                    capturas: [una],
                };
            });
        }

        await comprobar(P, "no-existe-lleva", 'Algo en la mano que no existe: lleva "piano"', [pagina], async () => {
            const marca = jugador.consola.length;
            await guardarVariable(pagina, "accion", null);
            await guardarVariable(pagina, "lleva", "piano");
            await espera(800);
            const una = await captura(pagina, "3-no-existe-lleva-piano", recorte);
            const conNada = await diferencia(pagina, referencia, una);
            const errores = erroresDesde(jugador, marca);
            await guardarVariable(pagina, "lleva", null);
            return {
                estado: conNada.distintos === 0 && errores.length === 0 ? "bien" : "mal",
                dato: { cambiaRespectoANada: conNada, errores },
                capturas: [una],
            };
        });

        await comprobar(P, "saludar-tras-sentarse", 'El mismo valor se dibuja igual venga de donde venga: "saludar" desde nada y desde "sentado:abajo"', [pagina], async () => {
            // solo el cuerpo (de la cintura para abajo y sin la mano, que se mueve): si el muñeco está más bajo, cambia
            const cuerpo = await recorteDelMapa(pagina, sitio.x - 10, sitio.y - 6, sitio.x + 6, sitio.y + 24);
            await guardarVariable(pagina, "accion", null);
            await espera(700);
            const dePie = await captura(pagina, "3-saludar-cuerpo-de-pie-sin-hacer-nada", cuerpo);
            await guardarVariable(pagina, "accion", "saludar");
            await espera(1200);
            const desdeNada = await captura(pagina, "3-saludar-cuerpo-desde-nada", cuerpo);
            const enteroDesdeNada = await captura(pagina, "3-saludar-desde-nada", recorte);
            await guardarVariable(pagina, "accion", "sentado:abajo");
            await espera(700);
            await guardarVariable(pagina, "accion", "saludar");
            await espera(1200);
            const desdeSentado = await captura(pagina, "3-saludar-cuerpo-desde-sentado", cuerpo);
            const enteroDesdeSentado = await captura(pagina, "3-saludar-desde-sentado", recorte);
            await guardarVariable(pagina, "accion", null);
            await espera(600);
            const d = await diferencia(pagina, desdeNada, desdeSentado);
            const conDePie = await diferencia(pagina, dePie, desdeNada);
            return {
                estado: d.distintos === 0 ? "bien" : "mal",
                dato: {
                    elCuerpoCambiaSegunDeDondeVenga: d,
                    saludandoDesdeNadaElCuerpoEstaComoDePie: conDePie.distintos === 0,
                    nota: d.distintos === 0 ? "igual" : 'Al pasar de "sentado:…" a "saludar" el muñeco se queda bajado (como sentado); desde nada, saluda de pie. Quien entra después lo ve de pie.',
                },
                capturas: [enteroDesdeNada, enteroDesdeSentado],
            };
        });

        // Sentado se recortan las piernas del dibujo: al dejar de estar sentado tiene que quedar EXACTAMENTE como antes.
        await comprobar(P, "de-pie-tras-sentarse", "Tras estar sentado (hacia los cuatro lados), el muñeco sin hacer nada vuelve a ser el de la referencia", [pagina], async () => {
            const peores: Record<string, number> = {};
            const capturas: string[] = [];
            for (const mira of ["abajo", "izquierda", "derecha", "arriba"]) {
                await guardarVariable(pagina, "accion", `sentado:${mira}`);
                await espera(500);
                await guardarVariable(pagina, "accion", null);
                await espera(700);
                const ahora = await captura(pagina, `3-de-pie-tras-sentado-${mira}`, recorte);
                capturas.push(ahora);
                peores[mira] = (await diferencia(pagina, referencia, ahora)).distintos;
            }
            return { estado: Object.values(peores).every((n) => n === 0) ? "bien" : "mal", dato: { pixelesDistintosDeLaReferencia: peores }, capturas };
        });

        await comprobar(P, "andando", "Al echar a andar se deja la postura (y al parar, vuelve)", [pagina], async () => {
            await guardarVariable(pagina, "accion", "sentado:abajo");
            await espera(700);
            const sentado = await captura(pagina, "3-andando-0-sentado", recorte);
            await pagina.keyboard.down("ArrowRight");
            await espera(450);
            const andando = await captura(pagina, "3-andando-1-andando", await recorteDelMuneco(pagina, await posicion(pagina)));
            await pagina.keyboard.up("ArrowRight");
            await espera(900);
            const parado = await captura(pagina, "3-andando-2-parado", await recorteDelMuneco(pagina, await posicion(pagina)));
            await guardarVariable(pagina, "accion", null);
            return { estado: "dato", dato: { nota: "mirar las capturas: sentado, andando, parado", posicionFinal: await posicion(pagina) }, capturas: [sentado, andando, parado] };
        });
    } finally {
        await salir(a);
    }
});
