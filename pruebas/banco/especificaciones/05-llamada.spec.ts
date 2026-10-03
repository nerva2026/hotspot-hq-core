/*
 * Punto 5 · LLAMADA Y ACCIONES: con Alicia y Benito hablando (burbuja de conversación), Alicia baila, saluda y coge
 * algo. La llamada tiene que seguir en marcha 5 s después de cada cosa, para los dos, y nadie se mueve de su casilla.
 *
 * De paso, con el chat de la conversación abierto: que las teclas del mapa no lleguen al escribir en él (punto 2) y la
 * captura de un mensaje con su hora, los dos a un tamaño de la rejilla de la letra: 16 y 11 px (punto 8).
 */
import { expect, test } from "@playwright/test";
import {
    banco,
    captura,
    capturaDeElemento,
    capturaEntera,
    casilla,
    centro,
    comprobar,
    enLlamada,
    entrar,
    espera,
    esperarLlamada,
    estadoDeLlamada,
    guardarVariable,
    letraDe,
    posicion,
    recorteDelMapa,
    salir,
    teletransportar,
    type Jugador,
} from "./util";

const P = "5";
const FRASE = "¿Bailamos a las 17:35? Café con Gabi";

test("5 · la llamada aguanta las acciones", async ({ browser }) => {
    test.setTimeout(480_000);
    let a: Jugador | undefined;
    let b: Jugador | undefined;
    try {
        a = await entrar(browser, "Alicia", { sala: "llamada" });
        const alicia = a.pagina;
        await teletransportar(alicia, centro(5, 8));
        b = await entrar(browser, "Benito", { sala: "llamada", muneco: "hs-w02" });
        const benito = b.pagina;
        await teletransportar(benito, centro(6, 8));

        const montada = await comprobar(P, "se-forma", "Alicia y Benito se juntan y empieza la llamada", [alicia, benito], async () => {
            const ea = await esperarLlamada(alicia);
            const eb = await esperarLlamada(benito);
            await espera(2500);
            return {
                estado: "bien",
                dato: { alicia: ea, benito: eb, posiciones: { alicia: await posicion(alicia), benito: await posicion(benito) } },
                capturas: [await capturaEntera(alicia, "5-llamada-alicia"), await capturaEntera(benito, "5-llamada-benito")],
            };
        });
        if (montada.estado !== "bien") return;

        const sitioA = casilla(await posicion(alicia));
        const sitioB = casilla(await posicion(benito));
        const zona = await recorteDelMapa(alicia, 3 * 32, 4 * 32, 9 * 32, 10 * 32);

        const pasos: [string, string, () => Promise<void>][] = [
            ["bailar", 'Alicia guarda accion: "bailar"', () => guardarVariable(alicia, "accion", "bailar")],
            ["saludar", 'Alicia guarda accion: "saludar"', () => guardarVariable(alicia, "accion", "saludar")],
            ["lleva", 'Alicia guarda lleva: "lata"', () => guardarVariable(alicia, "lleva", "lata")],
            ["quitar", "Alicia lo quita todo (accion y lleva vacías)", async () => {
                await guardarVariable(alicia, "accion", null);
                await guardarVariable(alicia, "lleva", null);
            }],
        ];
        for (const [clave, titulo, hacer] of pasos) {
            await comprobar(P, clave, `${titulo}: la llamada sigue 5 s después y nadie se mueve`, [alicia, benito], async () => {
                const antesA = await estadoDeLlamada(alicia);
                const antesB = await estadoDeLlamada(benito);
                await hacer();
                // se mira cada segundo: si la llamada se cae y vuelve, también se ve
                const muestras: { s: number; alicia: boolean; benito: boolean }[] = [];
                for (let s = 1; s <= 5; s++) {
                    await espera(1000);
                    muestras.push({ s, alicia: enLlamada(await estadoDeLlamada(alicia)), benito: enLlamada(await estadoDeLlamada(benito)) });
                }
                const ea = await estadoDeLlamada(alicia);
                const eb = await estadoDeLlamada(benito);
                const pa = casilla(await posicion(alicia));
                const pb = casilla(await posicion(benito));
                const sigue = muestras.every((m) => m.alicia && m.benito);
                const sinCortes = ea.salidas === antesA.salidas && eb.salidas === antesB.salidas && ea.entradas === antesA.entradas && eb.entradas === antesB.entradas;
                const quietos = pa.cx === sitioA.cx && pa.cy === sitioA.cy && pb.cx === sitioB.cx && pb.cy === sitioB.cy;
                return {
                    estado: sigue && sinCortes && quietos ? "bien" : "mal",
                    dato: { sigueEnLlamada: sigue, sinCortesNiReenganches: sinCortes, nadieSeHaMovido: quietos, muestras, alicia: ea, benito: eb, casillas: { alicia: pa, benito: pb } },
                    capturas: [await captura(alicia, `5-${clave}-alicia`, zona), await capturaEntera(benito, `5-${clave}-benito`)],
                };
            });
        }

        // ---- el chat de la conversación ----
        await comprobar("2", "chat", "Escribiendo en el chat, las teclas del mapa no llegan", [alicia], async () => {
            const antes = (await banco(alicia)).teclas.length;
            const campo = alicia.getByTestId("messageInput");
            if (!(await campo.isVisible().catch(() => false))) await alicia.getByTestId("chat-btn").click();
            await expect(campo).toBeVisible();
            await campo.click();
            await alicia.keyboard.type("xbhgv XBHGV", { delay: 40 });
            await espera(300);
            const escrito = ((await campo.textContent()) ?? "").trim();
            const despues = (await banco(alicia)).teclas.length;
            // se borra lo escrito para dejar el campo limpio
            for (let i = 0; i < 11; i++) await alicia.keyboard.press("Backspace");
            return {
                estado: despues === antes && escrito.includes("xbhgv") ? "bien" : "mal",
                dato: { eventosNuevos: despues - antes, textoEnElCampo: escrito },
                capturas: [await capturaEntera(alicia, "2-chat-escribiendo")],
            };
        });

        await comprobar("8", "chat", "Un mensaje en el chat, con su hora", [alicia, benito], async () => {
            const campo = alicia.getByTestId("messageInput");
            await campo.click();
            await alicia.keyboard.type(FRASE, { delay: 15 });
            await alicia.keyboard.press("Enter");
            const mensaje = alicia.locator(".message-bubble", { hasText: "Bailamos" }).first();
            await expect(mensaje).toBeVisible();
            await espera(800);
            const cajaMensaje = alicia.locator("#message", { hasText: "Bailamos" }).first();
            const caja = await cajaMensaje.boundingBox();
            const capturas = [
                caja
                    ? await captura(alicia, "8c-chat-mensaje", { x: Math.max(0, caja.x - 8), y: Math.max(0, caja.y - 8), width: caja.width + 16, height: caja.height + 16 })
                    : await capturaDeElemento(alicia, ".message-bubble", "8c-chat-mensaje"),
                await capturaEntera(alicia, "8c-chat-pantalla"),
            ];
            // lo mismo, como lo ve Benito (el mensaje de otro)
            let deBenito = null;
            try {
                if (!(await benito.getByTestId("messageInput").isVisible().catch(() => false))) await benito.getByTestId("chat-btn").click();
                await expect(benito.locator(".message-bubble", { hasText: "Bailamos" }).first()).toBeVisible();
                const cajaB = await benito.locator("#message", { hasText: "Bailamos" }).first().boundingBox();
                if (cajaB) capturas.push(await captura(benito, "8c-chat-mensaje-benito", { x: Math.max(0, cajaB.x - 8), y: Math.max(0, cajaB.y - 8), width: cajaB.width + 16, height: cajaB.height + 16 }));
                deBenito = await letraDe(benito, ".message-bubble");
            } catch (e) {
                deBenito = "no se ha podido mirar en la pantalla de Benito: " + String(e).slice(0, 200);
            }
            const letra = await letraDe(alicia, ".message-bubble");
            const hora = await letraDe(alicia, "#message .font-condensed");
            const campoLetra = await letraDe(alicia, "[data-testid='messageInput']");
            // La letra de la casa y a un tamaño de su rejilla: el mensaje a 16 px y la hora, que es una cifra, a 11 px
            // (a los 13 px de WorkAdventure salía borrosa al lado del mensaje).
            // El mensaje con el que empieza la conversación («Nueva discusión con…», con su hora): también a 11 px. Si en
            // esta pasada no ha salido, no cuenta (es de WorkAdventure y no siempre lo pone).
            const delSistema = await letraDe(alicia, "#chat .message > span.text-xs.text-center").catch(() => null);
            const enLaRejilla = { mensaje: letra?.tamano === "16px", hora: hora?.tamano === "11px", mensajeDelSistema: delSistema ? delSistema.tamano === "11px" : null };
            const bien = !!letra && letra.familia.includes("Pixelify Sans") && !!hora && hora.familia.includes("Pixelify Sans") && enLaRejilla.mensaje && enLaRejilla.hora && enLaRejilla.mensajeDelSistema !== false;
            return { estado: bien ? "bien" : "mal", dato: { enLaRejilla, mensaje: letra, hora, mensajeDelSistema: delSistema, campoDeEscribir: campoLetra, enLaPantallaDeBenito: deBenito }, capturas };
        });

        await comprobar(P, "tras-el-chat", "Después de escribir en el chat, la llamada sigue", [alicia, benito], async () => {
            const ea = await estadoDeLlamada(alicia);
            const eb = await estadoDeLlamada(benito);
            return { estado: enLlamada(ea) && enLlamada(eb) ? "bien" : "mal", dato: { alicia: ea, benito: eb } };
        });
    } finally {
        await salir(a, b);
    }
});
