/*
 * Punto 6 · BARRA DE BOTONES EN LLAMADA: el script del mapa quita el botón de invitar y pone cinco botones de icono
 * (el último, con un número). Se mide en el DOM cuáles se ven en la barra (enteros: ni recortados ni en el menú ☰)
 * SIN llamada y EN llamada, a 1280×800, 1024×768 y 1440×900, y se captura la barra en los seis casos.
 */
import { expect, test, type Page } from "@playwright/test";
import {
    banco,
    captura,
    capturaEntera,
    centro,
    comprobar,
    enLlamada,
    enScript,
    entrar,
    espera,
    esperarLlamada,
    estadoDeLlamada,
    guardarDiagnostico,
    mensajeDe,
    quitarAvisoDelMicrofono,
    salir,
    teletransportar,
    type Jugador,
} from "./util";

const P = "6";
const TAMANOS = [
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
];

type Boton = {
    nombre: string;
    imagen: string;
    etiqueta: string;
    marcadoInvisible: boolean;
    entero: boolean;
    seVe: boolean;
    x: number;
    ancho: number;
};
type Medida = {
    ventana: { width: number; height: number };
    botones: Boton[];
    /** los del mapa (los cinco «Botón N») que se ven enteros en la barra */
    delMapaALaVista: string[];
    delMapaEscondidos: string[];
    /** todo lo que hay en la parte derecha de la barra, por orden */
    orden: string[];
    hayInvitar: boolean;
    anchoDeLaBarra: number;
    textosDeLaBarra: string;
};

/** Lo que hay en la parte derecha de la barra (los botones del mapa y los de WorkAdventure), medido en el DOM. */
async function medir(pagina: Page): Promise<Medida> {
    const medida = await pagina.evaluate(() => {
        const envoltorio = document.querySelector("#action-wrapper");
        if (!envoltorio) throw new Error("No hay #action-wrapper: la barra no está");
        // el trozo de barra que recorta lo que no cabe (overflow: hidden)
        let marco: Element | null = envoltorio.parentElement;
        while (marco && getComputedStyle(marco).overflowX !== "hidden") marco = marco.parentElement;
        const limite = (marco ?? envoltorio).getBoundingClientRect();
        const botones = Array.from(envoltorio.querySelectorAll('[class*="visibilitychecker"]'))
            .filter((e) => e.classList.contains("visible") || e.classList.contains("invisible"))
            .map((e) => {
                const r = e.getBoundingClientRect();
                const imagen = e.querySelector("img");
                const boton = e.querySelector("button");
                const prueba = e.querySelector("[data-testid]");
                const marcadoInvisible = e.classList.contains("invisible");
                const entero = r.width > 0 && r.left >= limite.left - 1 && r.right <= limite.right + 1;
                const oculto = getComputedStyle(e).visibility === "hidden";
                return {
                    nombre: imagen?.getAttribute("alt") || prueba?.getAttribute("data-testid") || (boton?.textContent ?? "").trim() || "(vacío)",
                    imagen: (imagen?.getAttribute("src") ?? "").split("/").pop() ?? "",
                    etiqueta: (boton?.textContent ?? "").trim(),
                    marcadoInvisible,
                    entero,
                    seVe: r.width > 0 && entero && !marcadoInvisible && !oculto,
                    x: Math.round(r.left),
                    ancho: Math.round(r.width),
                };
            });
        const barra = document.querySelector(".bp-menu");
        return {
            botones,
            anchoDeLaBarra: Math.round(barra?.getBoundingClientRect().width ?? 0),
            textosDeLaBarra: (barra?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
        };
    });
    const delMapa = medida.botones.filter((b) => b.nombre.startsWith("Botón "));
    return {
        ventana: pagina.viewportSize() ?? { width: 0, height: 0 },
        ...medida,
        delMapaALaVista: delMapa.filter((b) => b.seVe).map((b) => b.nombre),
        delMapaEscondidos: delMapa.filter((b) => !b.seVe).map((b) => b.nombre),
        orden: medida.botones.filter((b) => b.ancho > 0).map((b) => b.nombre),
        hayInvitar: /compartir|invitar|share|invite/i.test(medida.textosDeLaBarra),
    };
}

/** Lo que hay dentro del menú ☰ (ahí van a parar los botones que no caben). */
async function menu(pagina: Page): Promise<string[]> {
    await pagina.getByTestId("action-user").click();
    const contenido = pagina.getByTestId("profile-menu");
    await expect(contenido).toBeVisible();
    await espera(400);
    const textos = await contenido.locator("button").allTextContents();
    await pagina.getByTestId("action-user").click();
    await expect(contenido).toBeHidden();
    return textos.map((t) => t.replace(/\s+/g, " ").trim()).filter((t) => t !== "");
}

async function medirEnCadaTamano(pagina: Page, cuando: "sin-llamada" | "en-llamada"): Promise<void> {
    for (const tamano of TAMANOS) {
        const clave = `${cuando}-${tamano.width}x${tamano.height}`;
        const titulo = `${cuando === "en-llamada" ? "EN llamada" : "SIN llamada"}, ${tamano.width}×${tamano.height}: botones del mapa a la vista`;
        await comprobar(P, clave, titulo, [pagina], async () => {
            await pagina.setViewportSize(tamano);
            await espera(2500); // la barra se recoloca sola (y tarda un poco en decidir qué cabe)
            const llamada = await estadoDeLlamada(pagina);
            if (cuando === "en-llamada" && !enLlamada(llamada)) throw new Error("La llamada se ha cortado al cambiar el tamaño: " + JSON.stringify(llamada));
            await quitarAvisoDelMicrofono(pagina);
            const m = await medir(pagina);
            const capturas = [
                await captura(pagina, `6-barra-${clave}`, { x: 0, y: 0, width: tamano.width, height: 110 }),
                await capturaEntera(pagina, `6-pantalla-${clave}`),
            ];
            const enElMenu = await menu(pagina).catch((e) => ["(no se ha podido abrir el menú: " + mensajeDe(e).slice(0, 200) + ")"]);
            return {
                estado: m.delMapaALaVista.length === 5 && !m.hayInvitar ? "bien" : "mal",
                dato: {
                    aLaVista: m.delMapaALaVista,
                    escondidos: m.delMapaEscondidos,
                    ordenEnLaBarra: m.orden,
                    hayInvitar: m.hayInvitar,
                    enElMenu,
                    anchoDeLaBarra: m.anchoDeLaBarra,
                    botones: m.botones,
                    llamada: cuando === "en-llamada" ? llamada : undefined,
                },
                capturas,
            };
        });
    }
    // Y hasta qué ancho caben los cinco: se va estrechando la ventana y se cuenta cuántos quedan a la vista
    await comprobar(P, `${cuando}-anchos`, `${cuando === "en-llamada" ? "EN llamada" : "SIN llamada"}: cuántos botones del mapa quedan a la vista según el ancho de la ventana`, [pagina], async () => {
        const porAncho: Record<string, string> = {};
        let minimoConLosCinco: number | null = null;
        for (const ancho of [1100, 1024, 960, 900, 860, 820, 780, 740, 700, 640]) {
            await pagina.setViewportSize({ width: ancho, height: 768 });
            await espera(1800);
            const m = await medir(pagina);
            porAncho[String(ancho)] = `${m.delMapaALaVista.length} a la vista` + (m.delMapaEscondidos.length > 0 ? ` (escondidos: ${m.delMapaEscondidos.map((n) => n.slice(0, 7)).join(", ")})` : "");
            if (m.delMapaALaVista.length === 5) minimoConLosCinco = ancho;
            if (m.delMapaALaVista.length < 5 && !porAncho.captura) {
                porAncho.captura = String(ancho);
                await captura(pagina, `6-barra-${cuando}-${ancho}-ya-no-caben`, { x: 0, y: 0, width: ancho, height: 110 });
            }
        }
        return {
            estado: "dato",
            dato: { anchoMasEstrechoConLosCincoALaVista: minimoConLosCinco, porAncho },
            capturas: porAncho.captura ? [`capturas/6-barra-${cuando}-${porAncho.captura}-ya-no-caben.png`] : [],
        };
    });
    await pagina.setViewportSize(TAMANOS[0]);
    await espera(1500);
}

test("6 · la barra de botones, sin llamada y en llamada", async ({ browser }) => {
    test.setTimeout(540_000);
    let a: Jugador | undefined;
    let b: Jugador | undefined;
    try {
        a = await entrar(browser, "Alicia", { sala: "barra" });
        const alicia = a.pagina;
        await teletransportar(alicia, centro(5, 8));
        await espera(1500);
        guardarDiagnostico("barra-sin-llamada.html", await alicia.evaluate(() => document.querySelector(".bp-menu")?.outerHTML ?? "(sin barra)"));

        await comprobar(P, "sin-invitar", "«Compartir/Invitar» no está en la barra ni en el menú", [alicia], async () => {
            const m = await medir(alicia);
            const enElMenu = await menu(alicia).catch((e) => ["(no se ha podido abrir el menú: " + mensajeDe(e).slice(0, 200) + ")"]);
            const enMenu = enElMenu.some((t) => /compartir|invitar|share|invite/i.test(t));
            return { estado: !m.hayInvitar && !enMenu ? "bien" : "mal", dato: { textosDeLaBarra: m.textosDeLaBarra, enElMenu } };
        });

        await medirEnCadaTamano(alicia, "sin-llamada");

        await comprobar(P, "callback", "Pulsar un botón llama a su `callback`", [alicia], async () => {
            const antes = (await banco(alicia)).pulsados.length;
            await alicia.locator('#action-wrapper img[alt^="Botón 5"]').click();
            await espera(400);
            await alicia.locator('#action-wrapper img[alt^="Botón 2"]').click();
            await espera(400);
            const pulsados: { id: string }[] = (await banco(alicia)).pulsados.slice(antes);
            const ids = pulsados.map((p) => p.id);
            return { estado: JSON.stringify(ids) === JSON.stringify(["banco-5", "banco-2"]) ? "bien" : "mal", dato: { pulsados: ids } };
        });

        await comprobar(P, "sustituir", "`addButton` con el mismo id sustituye el botón en su sitio (sin `removeButton`)", [alicia], async () => {
            const antes = await medir(alicia);
            await enScript(alicia, () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).banco.ponerBoton({ id: "banco-2", toolTip: "Botón 2 (cambiado)", imageSrc: "iconos/circulo-amarillo.png" });
            });
            await espera(1200);
            const despues = await medir(alicia);
            const captura1 = await captura(alicia, "6-sustituir-despues", { x: 0, y: 0, width: 1280, height: 110 });
            // sigue respondiendo (con el callback nuevo)
            const pulsadosAntes = (await banco(alicia)).pulsados.length;
            await alicia.locator('#action-wrapper img[alt="Botón 2 (cambiado)"]').click();
            await espera(400);
            const pulsados: { id: string }[] = (await banco(alicia)).pulsados.slice(pulsadosAntes);
            // y se deja como estaba
            await enScript(alicia, () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).banco.ponerBoton({ id: "banco-2", toolTip: "Botón 2 (cuadrado)", imageSrc: "iconos/cuadrado.png" });
            });
            await espera(800);
            const alFinal = await medir(alicia);
            const esperado = antes.orden.map((n) => (n === "Botón 2 (cuadrado)" ? "Botón 2 (cambiado)" : n));
            const bien =
                JSON.stringify(despues.orden) === JSON.stringify(esperado) &&
                JSON.stringify(alFinal.orden) === JSON.stringify(antes.orden) &&
                pulsados.length === 1 &&
                pulsados[0].id === "banco-2";
            return {
                estado: bien ? "bien" : "mal",
                dato: { ordenAntes: antes.orden, ordenDespues: despues.orden, ordenAlVolver: alFinal.orden, imagenNueva: despues.botones.find((x) => x.nombre === "Botón 2 (cambiado)")?.imagen, pulsados },
                capturas: [captura1],
            };
        });

        // ---- en llamada ----
        b = await entrar(browser, "Benito", { sala: "barra", muneco: "hs-w02" });
        const benito = b.pagina;
        await teletransportar(benito, centro(6, 8));
        const montada = await comprobar(P, "llamada", "Alicia y Benito en llamada (para medir la barra)", [alicia, benito], async () => {
            const e = await esperarLlamada(alicia);
            await esperarLlamada(benito);
            await espera(3000);
            guardarDiagnostico("barra-en-llamada.html", await alicia.evaluate(() => document.querySelector(".bp-menu")?.outerHTML ?? "(sin barra)"));
            return { estado: "dato", dato: e };
        });
        if (montada.estado === "no se pudo") return;

        await medirEnCadaTamano(alicia, "en-llamada");

        // Con el chat abierto la barra tiene menos sitio (el chat ocupa un lado de la ventana): es fácil que pase en una
        // llamada, porque el chat de la conversación se abre para escribirse.
        await comprobar(P, "en-llamada-con-chat-1280x800", "EN llamada y con el chat abierto, 1280×800: las cuatro acciones a la vista y lo que no cabe, en el menú ☰", [alicia], async () => {
            await alicia.setViewportSize({ width: 1280, height: 800 });
            await espera(1500);
            await alicia.getByTestId("chat-btn").click();
            await expect(alicia.getByTestId("closeChatButton")).toBeVisible();
            await espera(2500);
            const barraVisible = await alicia.locator("#action-wrapper").count();
            const m = barraVisible > 0 ? await medir(alicia) : null;
            const chat = await alicia.evaluate(() => {
                const c = document.querySelector("#chat");
                const r = c?.getBoundingClientRect();
                return r ? { x: Math.round(r.x), ancho: Math.round(r.width) } : null;
            });
            const capturas = [await capturaEntera(alicia, "6-pantalla-en-llamada-con-chat-1280x800"), await captura(alicia, "6-barra-en-llamada-con-chat-1280x800", { x: 0, y: 0, width: 1280, height: 110 })];
            // Lo que no cabe tiene que estar en el menú ☰ (WorkAdventure esconde primero los de la izquierda: en la
            // oficina el de más a la izquierda es «Música», que no es una acción). Las acciones —los cuatro de la
            // derecha— tienen que seguir a la vista.
            let enElMenu: string[] = [];
            if (m && m.delMapaEscondidos.length > 0) {
                await alicia.getByTestId("action-user").click();
                const contenido = alicia.getByTestId("profile-menu");
                await expect(contenido).toBeVisible();
                await espera(400);
                enElMenu = await contenido.locator("img").evaluateAll((imagenes) => imagenes.map((i) => i.getAttribute("alt") ?? "").filter((a) => a.startsWith("Botón")));
                capturas.push(await capturaEntera(alicia, "6-menu-en-llamada-con-chat-1280x800"));
                await alicia.getByTestId("action-user").click();
                await expect(contenido).toBeHidden();
            }
            await alicia.getByTestId("closeChatButton").click();
            await espera(1500);
            const cuatroDeLaDerecha = m ? ["Botón 2", "Botón 3", "Botón 4", "Botón 5"].every((n) => m.delMapaALaVista.some((v) => v.startsWith(n))) : false;
            const escondidosEnElMenu = m ? m.delMapaEscondidos.every((n) => enElMenu.includes(n)) : false;
            return {
                estado: m && cuatroDeLaDerecha && escondidosEnElMenu ? "bien" : "mal",
                dato: m
                    ? { aLaVista: m.delMapaALaVista, escondidos: m.delMapaEscondidos, escondidosEnElMenu: enElMenu, anchoDeLaBarra: m.anchoDeLaBarra, chat }
                    : { nota: "con el chat abierto la barra entera desaparece", chat },
                capturas,
            };
        });

        await comprobar(P, "callback-en-llamada", "En llamada, pulsar un botón del mapa sigue llamando a su `callback`", [alicia], async () => {
            const antes = (await banco(alicia)).pulsados.length;
            const boton = alicia.locator('#action-wrapper img[alt^="Botón 5"]');
            await boton.click({ timeout: 5_000 });
            await espera(400);
            const pulsados: { id: string }[] = (await banco(alicia)).pulsados.slice(antes);
            const llamada = await estadoDeLlamada(alicia);
            return {
                estado: pulsados.length === 1 && pulsados[0].id === "banco-5" && enLlamada(llamada) ? "bien" : "mal",
                dato: { pulsados: pulsados.map((p) => p.id), laLlamadaSigue: enLlamada(llamada) },
            };
        });
    } finally {
        await salir(a, b);
    }
});
