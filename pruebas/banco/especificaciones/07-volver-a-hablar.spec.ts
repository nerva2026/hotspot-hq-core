/*
 * Punto 7 · VOLVER A HABLAR (parche 12): Alicia y Benito, quietos, pegados y en llamada. Alicia pasa a un estado que
 * no deja hablar SIN moverse (la llamada se corta) y luego lo deja, también sin moverse: con el parche, la llamada
 * tiene que volver sola en unos segundos.
 */
import { test, type Page } from "@playwright/test";
import {
    capturaEntera,
    casilla,
    centro,
    comprobar,
    enLlamada,
    enScript,
    entrar,
    espera,
    esperarLlamada,
    esperarSinLlamada,
    estadoDeLlamada,
    posicion,
    salir,
    teletransportar,
    type Jugador,
} from "./util";

const P = "7";
const SIN_PARCHE = process.env.BANCO_SIN_PARCHE_12 === "1";

/** Espera a que vuelva la llamada y dice cuántos segundos ha tardado (o que no ha vuelto). */
async function cuantoTardaEnVolver(pagina: Page, otra: Page, tope = 25_000): Promise<{ vuelve: boolean; segundos: number }> {
    const inicio = Date.now();
    while (Date.now() - inicio < tope) {
        if (enLlamada(await estadoDeLlamada(pagina)) && enLlamada(await estadoDeLlamada(otra))) {
            return { vuelve: true, segundos: Math.round((Date.now() - inicio) / 100) / 10 };
        }
        await espera(500);
    }
    return { vuelve: false, segundos: Math.round((Date.now() - inicio) / 100) / 10 };
}

test("7 · volver a hablar sin moverse (parche 12)", async ({ browser }) => {
    test.setTimeout(480_000);
    let a: Jugador | undefined;
    let b: Jugador | undefined;
    try {
        a = await entrar(browser, "Alicia", { sala: "volver" });
        const alicia = a.pagina;
        await teletransportar(alicia, centro(5, 8));
        b = await entrar(browser, "Benito", { sala: "volver", muneco: "hs-w02" });
        const benito = b.pagina;
        await teletransportar(benito, centro(6, 8));

        const montada = await comprobar(P, "se-forma", "Alicia y Benito, pegados y en llamada", [alicia, benito], async () => {
            const e = await esperarLlamada(alicia);
            await esperarLlamada(benito);
            await espera(2500);
            return { estado: "dato", dato: { alicia: e, sinElParche12: SIN_PARCHE } };
        });
        if (montada.estado === "no se pudo") return;
        const sitioA = casilla(await posicion(alicia));
        const sitioB = casilla(await posicion(benito));
        const quietos = async (): Promise<boolean> => {
            const pa = casilla(await posicion(alicia));
            const pb = casilla(await posicion(benito));
            return pa.cx === sitioA.cx && pa.cy === sitioA.cy && pb.cx === sitioB.cx && pb.cy === sitioB.cy;
        };

        const casos: [string, string, () => Promise<void>, () => Promise<void>][] = [
            [
                "proximidad",
                "disablePlayerProximityMeeting() y restorePlayerProximityMeeting()",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                () => enScript(alicia, () => (window as any).WA.controls.disablePlayerProximityMeeting()),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                () => enScript(alicia, () => (window as any).WA.controls.restorePlayerProximityMeeting()),
            ],
            [
                "no-molestar",
                'setStatus("DO_NOT_DISTURB") y setStatus("ONLINE")',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                () => enScript(alicia, () => (window as any).WA.player.setStatus("DO_NOT_DISTURB")),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                () => enScript(alicia, () => (window as any).WA.player.setStatus("ONLINE")),
            ],
        ];

        for (const [clave, titulo, cortar, volver] of casos) {
            let cortada = false;
            await comprobar(P, `${clave}-corta`, `${titulo}: al pasar al estado que no deja hablar, la llamada se corta`, [alicia, benito], async () => {
                if (!enLlamada(await estadoDeLlamada(alicia))) {
                    // si el caso anterior dejó a los dos sin llamada, se vuelve a montar andando (un paso y vuelta)
                    await teletransportar(alicia, centro(5, 10));
                    await teletransportar(alicia, centro(5, 8));
                    await esperarLlamada(alicia);
                    await esperarLlamada(benito);
                    await espera(2000);
                }
                await cortar();
                const ea = await esperarSinLlamada(alicia);
                const eb = await esperarSinLlamada(benito);
                cortada = true;
                await espera(3000); // un rato así, sin llamada
                return {
                    estado: "bien",
                    dato: { alicia: ea, benito: eb, nadieSeHaMovido: await quietos() },
                    capturas: [await capturaEntera(alicia, `7-${clave}-cortada-alicia`)],
                };
            });
            await comprobar(P, `${clave}-vuelve`, `${titulo}: al dejarlo, SIN moverse nadie, la llamada vuelve sola`, [alicia, benito], async () => {
                if (!cortada) throw new Error("La llamada no llegó a cortarse: no hay nada que comprobar");
                await volver();
                const vuelta = await cuantoTardaEnVolver(alicia, benito);
                const sinMoverse = await quietos();
                const capturas = [await capturaEntera(alicia, `7-${clave}-vuelta-alicia`), await capturaEntera(benito, `7-${clave}-vuelta-benito`)];
                // Sin el parche 12 se espera que NO vuelva: ahí el resultado es solo un dato para comparar.
                const estado = SIN_PARCHE ? "dato" : vuelta.vuelve && sinMoverse ? "bien" : "mal";
                return {
                    estado,
                    dato: { ...vuelta, nadieSeHaMovido: sinMoverse, sinElParche12: SIN_PARCHE, alicia: await estadoDeLlamada(alicia), benito: await estadoDeLlamada(benito) },
                    capturas,
                };
            });
        }
    } finally {
        await salir(a, b);
    }
});
