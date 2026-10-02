/*
 * Punto 2 · TECLAS (parche 11): X, B, H, G y V llegan al script del mapa como el evento «hs:tecla», con { code } y sin
 * «senderId». No llegan al escribir en el campo de «decir» (ni en el chat: eso se comprueba en la prueba de la
 * llamada, que es donde el chat tiene dónde escribir). La E no llega.
 */
import { expect, test } from "@playwright/test";
import { banco, capturaEntera, comprobar, entrar, espera, salir, type Jugador } from "./util";

const P = "2";

test("2 · teclas del mapa (parche 11)", async ({ browser }) => {
    test.setTimeout(300_000);
    let a: Jugador | undefined;
    try {
        a = await entrar(browser, "Alicia", { sala: "teclas" });
        const pagina = a.pagina;
        const teclas = async (): Promise<{ name: string; data: { code?: string }; senderId: unknown; conSenderId: boolean }[]> =>
            (await banco(pagina)).teclas;
        const pulsar = async (tecla: string): Promise<void> => {
            await pagina.keyboard.press(tecla);
            await espera(200);
        };

        await comprobar(P, "llegan", "X, B, H, G y V llegan como «hs:tecla» con { code } y sin senderId", [pagina], async () => {
            const antes = (await teclas()).length;
            for (const t of ["x", "b", "h", "g", "v"]) await pulsar(t);
            const llegadas = (await teclas()).slice(antes);
            const codigos = llegadas.map((e) => e.data?.code);
            const bien =
                JSON.stringify(codigos) === JSON.stringify(["KeyX", "KeyB", "KeyH", "KeyG", "KeyV"]) &&
                llegadas.every((e) => e.name === "hs:tecla" && !e.conSenderId && Object.keys(e.data ?? {}).join() === "code");
            return { estado: bien ? "bien" : "mal", dato: { codigos, eventos: llegadas } };
        });

        await comprobar(P, "e-no", "La E no llega (no está en la lista): abre el explorador de la sala, como siempre", [pagina], async () => {
            const antes = (await teclas()).length;
            await pulsar("e");
            const despues = (await teclas()).length;
            const explorador = pagina.getByTestId("closeMapEditorButton");
            const abierto = await explorador.isVisible().catch(() => false);
            let conElExploradorAbierto: number | string = "el explorador no se ha abierto";
            if (abierto) {
                // con el explorador (o el editor de mapas) abierto, las teclas del mapa no se mandan: así lo dice el parche
                await pulsar("b");
                conElExploradorAbierto = (await teclas()).length - despues;
                await explorador.click();
                await expect(explorador).toBeHidden();
                await espera(600);
            }
            return {
                estado: despues === antes && (conElExploradorAbierto === 0 || !abierto) ? "bien" : "mal",
                dato: { eventosNuevos: despues - antes, laEAbreElExplorador: abierto, eventosConElExploradorAbierto: conElExploradorAbierto },
            };
        });

        await comprobar(P, "con-ctrl", "Con Ctrl o Alt pulsado no llegan", [pagina], async () => {
            const antes = (await teclas()).length;
            await pagina.keyboard.press("Control+b");
            await espera(200);
            await pagina.keyboard.press("Alt+h");
            await espera(200);
            const despues = (await teclas()).length;
            return { estado: despues === antes ? "bien" : "mal", dato: { eventosNuevos: despues - antes } };
        });

        await comprobar(P, "repeticion", "Dejar la tecla pulsada no repite el evento", [pagina], async () => {
            const antes = (await teclas()).length;
            await pagina.keyboard.down("x");
            await pagina.keyboard.down("x"); // Playwright manda la segunda como repetición
            await pagina.keyboard.down("x");
            await pagina.keyboard.up("x");
            await espera(200);
            const despues = (await teclas()).length;
            return { estado: despues - antes === 1 ? "bien" : "mal", dato: { eventosNuevos: despues - antes } };
        });

        await comprobar(P, "decir", "Escribiendo en el campo de «decir» no llegan", [pagina], async () => {
            const antes = (await teclas()).length;
            await pagina.keyboard.press("Enter");
            const campo = pagina.getByTestId("say-popup");
            await expect(campo).toBeVisible();
            await pagina.keyboard.type("xbhgv XBHGV", { delay: 40 });
            await espera(300);
            const escrito = await campo.evaluate((e) => (e.textContent ?? "").trim());
            const captura = await capturaEntera(pagina, "2-decir-escribiendo");
            const despues = (await teclas()).length;
            await pagina.getByTestId("btn-close-say-popup").click();
            await expect(campo).toBeHidden();
            return {
                estado: despues === antes ? "bien" : "mal",
                dato: { eventosNuevos: despues - antes, textoEnElCampo: escrito },
                capturas: [captura],
            };
        });

        await comprobar(P, "vuelven", "Al cerrar el campo, las teclas vuelven a llegar", [pagina], async () => {
            const antes = (await teclas()).length;
            await pulsar("b");
            const despues = (await teclas()).length;
            return { estado: despues - antes === 1 ? "bien" : "mal", dato: { eventosNuevos: despues - antes } };
        });
    } finally {
        await salir(a);
    }
});
