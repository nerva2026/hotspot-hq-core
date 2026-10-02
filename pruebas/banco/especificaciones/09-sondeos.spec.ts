/*
 * Punto 9 · SONDEOS de la API que usa el script de los mapas de verdad. Aquí casi nada es «bien» o «mal»: se apunta
 * el resultado EXACTO de cada llamada (dónde acaba el jugador, qué llega antes, con qué datos salta cada aviso…),
 * que es lo que hace falta para corregir el WorkAdventure de mentira con el que se prueban los scripts de los mapas.
 */
import { expect, test } from "@playwright/test";
import {
    MAPAS,
    aPantalla,
    banco,
    captura,
    capturaDeElemento,
    capturaEntera,
    casilla,
    centro,
    comprobar,
    diferencia,
    enLlamada,
    enScript,
    entrar,
    erroresDesde,
    espera,
    esperarLlamada,
    esperarSinLlamada,
    estadoDeLlamada,
    letraDe,
    posicion,
    recorteDelMapa,
    recorteDelMuneco,
    salir,
    teletransportar,
    type Jugador,
} from "./util";

type Suceso = { ms: number; que: string; moving?: boolean; x?: number; y?: number; resultado?: unknown; error?: string | null };
type Paseo = { sucesos: Suceso[]; resultado: unknown; error: string | null; final: { x: number; y: number } };

test("9 · sondeos de la API de los mapas (un jugador)", async ({ browser }) => {
    test.setTimeout(540_000);
    let a: Jugador | undefined;
    try {
        a = await entrar(browser, "Alicia", { sala: "sondeos" });
        const jugador = a;
        const pagina = a.pagina;

        // ---------- a) moveTo ----------
        const pasear = async (cx: number, cy: number): Promise<Paseo> =>
            enScript(
                pagina,
                async ({ x, y }) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const WA = (window as any).WA;
                    const sucesos: Suceso[] = [];
                    const t0 = performance.now();
                    const ahora = (): number => Math.round(performance.now() - t0);
                    let escuchando = true;
                    WA.player.onPlayerMove((m: { moving: boolean; x: number; y: number }) => {
                        if (escuchando) sucesos.push({ ms: ahora(), que: "onPlayerMove", moving: m.moving, x: Math.round(m.x), y: Math.round(m.y) });
                    });
                    let resultado: unknown = null;
                    let error: string | null = null;
                    try {
                        resultado = await Promise.race([
                            WA.player.moveTo(x, y),
                            new Promise((_, rechazar) => setTimeout(() => rechazar(new Error("sin respuesta en 20 s")), 20_000)),
                        ]);
                    } catch (e) {
                        error = String((e as Error)?.message ?? e);
                    }
                    sucesos.push({ ms: ahora(), que: "promesa", resultado, error });
                    await new Promise((r) => setTimeout(r, 1500));
                    escuchando = false;
                    const p = await WA.player.getPosition();
                    return { sucesos, resultado, error, final: { x: p.x, y: p.y } };
                },
                { x: cx * 32 + 16, y: cy * 32 + 24 },
            );
        const resumir = (p: Paseo): Record<string, unknown> => {
            const promesa = p.sucesos.findIndex((s) => s.que === "promesa");
            const parado = p.sucesos.map((s, i) => ({ s, i })).filter(({ s }) => s.que === "onPlayerMove" && s.moving === false);
            const ultimoParado = parado.length > 0 ? parado[parado.length - 1] : null;
            return {
                loQueDevuelve: p.resultado,
                error: p.error,
                acabaEn: p.final,
                casilla: casilla(p.final),
                avisos: p.sucesos.filter((s) => s.que === "onPlayerMove").length,
                promesaALos_ms: promesa >= 0 ? p.sucesos[promesa].ms : null,
                ultimoAvisoDeParado: ultimoParado ? ultimoParado.s : null,
                queLlegaAntes:
                    promesa < 0 || !ultimoParado
                        ? "no se sabe (falta la promesa o el aviso de parado)"
                        : ultimoParado.i < promesa
                          ? "el aviso onPlayerMove con moving: false, y después la promesa"
                          : "la promesa, y después el aviso onPlayerMove con moving: false",
                ultimosSucesos: p.sucesos.slice(-5),
            };
        };

        await comprobar("9a", "libre", "moveTo a una casilla libre a 4 casillas: dónde acaba y qué llega antes", [pagina], async () => {
            await teletransportar(pagina, centro(3, 12));
            await espera(800);
            const salida = await posicion(pagina);
            const p = await pasear(7, 12);
            return {
                estado: "dato",
                dato: { saleDe: salida, pedido: { x: 7 * 32 + 16, y: 12 * 32 + 24, casilla: { cx: 7, cy: 12 } }, ...resumir(p) },
                capturas: [await captura(pagina, "9a-moveto-libre", await recorteDelMapa(pagina, 32, 10 * 32, 11 * 32, 14 * 32))],
            };
        });
        await comprobar("9a", "pared", "moveTo a una casilla que es pared: qué devuelve", [pagina], async () => {
            const salida = await posicion(pagina);
            const p = await pasear(9, 12);
            return { estado: "dato", dato: { saleDe: salida, pedido: { x: 9 * 32 + 16, y: 12 * 32 + 24, casilla: { cx: 9, cy: 12 } }, ...resumir(p) } };
        });
        await comprobar("9a", "sin-camino", "moveTo a una casilla libre a la que no se puede llegar: qué devuelve", [pagina], async () => {
            const salida = await posicion(pagina);
            const p = await pasear(20, 12);
            return { estado: "dato", dato: { saleDe: salida, pedido: { x: 20 * 32 + 16, y: 12 * 32 + 24, casilla: { cx: 20, cy: 12 } }, ...resumir(p) } };
        });

        // ---------- c) ui.website ----------
        await comprobar("9c", "abrir", "ui.website.open escondida; cambiar después `visible` y `url`", [pagina], async () => {
            const marco = async (id: string): Promise<Record<string, unknown> | null> =>
                pagina.evaluate((identificador) => {
                    const m = document.getElementById("ui-website-" + identificador) as HTMLIFrameElement | null;
                    if (!m) return null;
                    const r = m.getBoundingClientRect();
                    return {
                        src: m.src,
                        visibility: getComputedStyle(m).visibility,
                        estilo: m.getAttribute("style"),
                        caja: { x: Math.round(r.x), y: Math.round(r.y), ancho: Math.round(r.width), alto: Math.round(r.height) },
                        ventana: { ancho: window.innerWidth, alto: window.innerHeight },
                    };
                }, id);
            const abierta = await enScript(
                pagina,
                async (url) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const w = await (window as any).WA.ui.website.open({
                        url,
                        visible: false,
                        allowApi: false,
                        position: { vertical: "bottom", horizontal: "right" },
                        size: { width: "320px", height: "120px" },
                        margin: { bottom: "88px", right: "12px" },
                    });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (window as any).bancoWeb = w;
                    return { id: w.id, url: w.url, visible: w.visible };
                },
                MAPAS + "panel.html?paso=1",
            );
            await espera(1200);
            const alAbrir = await marco(abierta.id);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await enScript(pagina, () => { (window as any).bancoWeb.visible = true; });
            await espera(1000);
            const visible = await marco(abierta.id);
            const captura1 = await capturaEntera(pagina, "9c-website-visible");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await enScript(pagina, (url) => { (window as any).bancoWeb.url = url; }, MAPAS + "panel.html?paso=2");
            await espera(1500);
            const conOtraUrl = await marco(abierta.id);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await enScript(pagina, () => { (window as any).bancoWeb.visible = false; });
            await espera(800);
            const escondida = await marco(abierta.id);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await enScript(pagina, async () => { await (window as any).bancoWeb.close(); });
            await espera(800);
            const cerrada = await marco(abierta.id);
            return {
                estado: "dato",
                dato: {
                    loQueDevuelveOpen: abierta,
                    alAbrirEscondida: alAbrir,
                    trasPonerVisibleTrue: visible,
                    trasCambiarUrl: conOtraUrl,
                    trasPonerVisibleFalse: escondida,
                    trasClose: cerrada === null ? "el <iframe> ya no está" : cerrada,
                    seReflejaVisible: alAbrir?.visibility === "hidden" && visible?.visibility === "visible",
                    seReflejaUrl: String(conOtraUrl?.src ?? "").endsWith("paso=2"),
                },
                capturas: [captura1],
            };
        });

        // ---------- d) banner ----------
        await comprobar("9d", "banner", "ui.banner.openBanner: dónde sale y si se cierra solo", [pagina], async () => {
            await enScript(pagina, () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).WA.ui.banner.openBanner({
                    id: "banco-aviso",
                    text: "Aviso de prueba del banco: 17:35",
                    bgColor: "#e0562a",
                    textColor: "#ffffff",
                    closable: true,
                    timeToClose: 4000,
                });
            });
            const aviso = pagina.locator("#banco-aviso");
            await expect(aviso).toBeVisible();
            await espera(700);
            const caja = await aviso.boundingBox();
            const ventana = pagina.viewportSize();
            const texto = ((await aviso.textContent()) ?? "").replace(/\s+/g, " ").trim();
            const letraDelTexto = await letraDe(pagina, "#banco-aviso > div");
            const letraDelBoton = await letraDe(pagina, "#banco-aviso button");
            const esquinasDelBoton = await pagina.evaluate(() => {
                const b = document.querySelector("#banco-aviso button");
                return b ? getComputedStyle(b).borderRadius : null;
            });
            const capturas = [await capturaEntera(pagina, "9d-banner-pantalla"), await capturaDeElemento(pagina, "#banco-aviso", "9d-banner", 10)];
            let seCierraSolo = false;
            let segundos = 0;
            const inicio = Date.now();
            while (Date.now() - inicio < 9000) {
                if ((await aviso.count()) === 0 || !(await aviso.isVisible())) {
                    seCierraSolo = true;
                    segundos = Math.round((Date.now() - inicio) / 100) / 10 + 0.7;
                    break;
                }
                await espera(250);
            }
            if (!seCierraSolo) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await enScript(pagina, () => (window as any).WA.ui.banner.closeBanner());
            }
            return {
                estado: "dato",
                dato: { caja, ventana, texto, letraDelTexto, letraDelBoton, esquinasDelBoton, seCierraSolo, alosSegundos: seCierraSolo ? segundos : "no se ha cerrado en 9 s (se ha cerrado con closeBanner)", pedido_timeToClose_ms: 4000 },
                capturas,
            };
        });

        // ---------- e) sonido ----------
        await comprobar("9e", "sonido", "sound.loadSound(url).play({ volume: 0.25 }) con un .wav pequeño", [pagina], async () => {
            const marca = jugador.consola.length;
            const respuestasAntes = jugador.respuestas.length;
            const r = await enScript(
                pagina,
                async (url) => {
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const sonido = (window as any).WA.sound.loadSound(url);
                        const devuelve = sonido.play({ volume: 0.25 });
                        await new Promise((r) => setTimeout(r, 1500));
                        const otraVez = sonido.play({ volume: 0.25 });
                        return { excepcion: null, loQueDevuelvePlay: String(devuelve), segundaVez: String(otraVez), metodos: Object.getOwnPropertyNames(Object.getPrototypeOf(sonido)) };
                    } catch (e) {
                        return { excepcion: String((e as Error)?.message ?? e) };
                    }
                },
                MAPAS + "pitido.wav",
            );
            await espera(1500);
            const enPagina = await pagina.evaluate(() => ({
                elementosDeAudio: document.querySelectorAll("audio").length,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                contextoDeAudio: (window as any).AudioContext ? "hay AudioContext" : "no hay",
            }));
            const pedidos = jugador.respuestas.slice(respuestasAntes).filter((x) => x.includes("pitido.wav"));
            const errores = erroresDesde(jugador, marca);
            return {
                estado: r.excepcion === null && errores.length === 0 && pedidos.some((x) => x.startsWith("200 ") || x.startsWith("206 ")) ? "bien" : "mal",
                dato: { ...r, elArchivoSeHaPedido: pedidos, erroresEnLaConsola: errores, ...enPagina },
            };
        });

        // ---------- f) capas (el velo) ----------
        await comprobar("9f", "velo", "room.showLayer de una capa de velo por encima de todo: ¿tiñe al muñeco y a su nombre?", [pagina], async () => {
            await teletransportar(pagina, centro(12, 9));
            await espera(1500);
            const sitio = await posicion(pagina);
            const recorte = await recorteDelMuneco(pagina, sitio);
            const cuerpo = await recorteDelMapa(pagina, sitio.x - 5, sitio.y - 14, sitio.x + 5, sitio.y - 2);
            const cajaNombre = await pagina.locator(".username-display").first().boundingBox();
            if (!cajaNombre) throw new Error("No se ve el nombre del muñeco");
            const nombre = { x: Math.round(cajaNombre.x), y: Math.round(cajaNombre.y), width: Math.round(cajaNombre.width), height: Math.round(cajaNombre.height) };
            const dato: Record<string, unknown> = {};
            const capturas: string[] = [];
            const sin = { todo: await captura(pagina, "9f-sin-velo", recorte), cuerpo: await captura(pagina, "9f-sin-velo-cuerpo", cuerpo), nombre: await captura(pagina, "9f-sin-velo-nombre", nombre) };
            capturas.push(sin.todo);
            for (const capa of ["velo-a", "velo-b"]) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await enScript(pagina, (n) => (window as any).WA.room.showLayer(n), capa);
                await espera(900);
                const con = { todo: await captura(pagina, `9f-con-${capa}`, recorte), cuerpo: await captura(pagina, `9f-con-${capa}-cuerpo`, cuerpo), nombre: await captura(pagina, `9f-con-${capa}-nombre`, nombre) };
                capturas.push(con.todo);
                const dTodo = await diferencia(pagina, sin.todo, con.todo);
                const dCuerpo = await diferencia(pagina, sin.cuerpo, con.cuerpo);
                const dNombre = await diferencia(pagina, sin.nombre, con.nombre);
                dato[capa] = {
                    seVeElVelo: dTodo.distintos > 0,
                    pixelesQueCambian: `${dTodo.distintos} de ${dTodo.total}`,
                    tiñeAlMuñeco: dCuerpo.distintos === dCuerpo.total,
                    cuerpo: `cambian ${dCuerpo.distintos} de ${dCuerpo.total} píxeles, ${dCuerpo.cambioMedio} de media (de 255)`,
                    // El nombre es un elemento de la página puesto ENCIMA del juego: el velo no lo tiñe. Lo poco que cambia es
                    // su fondo, que es algo transparente y deja ver el suelo (teñido) de debajo.
                    etiquetaDelNombre: `cambian ${dNombre.distintos} de ${dNombre.total} píxeles, ${dNombre.cambioMedio} de media (de 255)`,
                    tiñeLasLetrasDelNombre: dNombre.distintos === dNombre.total,
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await enScript(pagina, (n) => (window as any).WA.room.hideLayer(n), capa);
                await espera(700);
            }
            const alFinal = await captura(pagina, "9f-sin-velo-al-final", recorte);
            dato.alEsconderlaVuelveAEstarComoAntes = (await diferencia(pagina, sin.todo, alFinal)).distintos === 0;
            return { estado: "dato", dato, capturas };
        });

        // ---------- g) setTiles ----------
        await comprobar("9g", "casillas", "room.setTiles con una casilla con nombre y animación: ¿se pinta?, ¿se anima?, ¿null la quita?", [pagina], async () => {
            const zona = await recorteDelMapa(pagina, 15 * 32, 8 * 32, 19 * 32, 11 * 32);
            const antes = await captura(pagina, "9g-antes", zona);
            await enScript(pagina, () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).WA.room.setTiles([{ x: 16, y: 9, tile: "faro", layer: "objetos" }]);
            });
            await espera(700);
            const fotogramas: string[] = [];
            for (let i = 1; i <= 4; i++) {
                fotogramas.push(await captura(pagina, `9g-faro-${i}`, zona));
                await espera(400);
            }
            const pintada = await diferencia(pagina, antes, fotogramas[0]);
            const cambios: number[] = [];
            for (let i = 1; i < fotogramas.length; i++) cambios.push((await diferencia(pagina, fotogramas[i - 1], fotogramas[i])).distintos);
            await enScript(pagina, () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).WA.room.setTiles([{ x: 17, y: 9, tile: "poste", layer: "objetos" }]);
            });
            await espera(700);
            const conPoste = await captura(pagina, "9g-faro-y-poste", zona);
            const poste = await diferencia(pagina, fotogramas[fotogramas.length - 1], conPoste);
            await enScript(pagina, () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).WA.room.setTiles([
                    { x: 16, y: 9, tile: null, layer: "objetos" },
                    { x: 17, y: 9, tile: null, layer: "objetos" },
                ]);
            });
            await espera(700);
            const despues = await captura(pagina, "9g-despues-de-null", zona);
            const quitada = await diferencia(pagina, antes, despues);
            return {
                estado: "dato",
                dato: {
                    sePinta: pintada.distintos > 0,
                    dondeCambia: pintada.caja,
                    seAnima: cambios.some((n) => n > 0),
                    pixelesQueCambianCada400ms: cambios,
                    laCasillaSinAnimacionSePinta: poste.distintos > 0,
                    nullLaQuita: quitada.distintos === 0,
                    pixelesQueQuedanDistintos: quitada.distintos,
                },
                capturas: [antes, ...fotogramas, conPoste, despues],
            };
        });

        // ---------- h) room.website.create ----------
        await comprobar("9h", "cartel", "room.website.create con scale: 0.5: ¿sale donde se pide y de qué tamaño?", [pagina], async () => {
            const pedido = { x: 14 * 32, y: 12 * 32, width: 128, height: 40 };
            const creado = await enScript(
                pagina,
                ({ url, position }) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const w = (window as any).WA.room.website.create({
                        name: "banco-cartel",
                        url,
                        position,
                        visible: true,
                        allowApi: false,
                        origin: "map",
                        scale: 0.5,
                    });
                    return { name: w.name, url: w.url, x: w.x, y: w.y, width: w.width, height: w.height, scale: w.scale, visible: w.visible, origin: w.origin };
                },
                { url: MAPAS + "cartel.html", position: pedido },
            );
            await espera(2000);
            const enPantalla = await pagina.evaluate(() => {
                const m = Array.from(document.querySelectorAll("iframe")).find((f) => f.src.includes("cartel.html"));
                if (!m) return null;
                const r = m.getBoundingClientRect();
                return { x: r.x, y: r.y, ancho: r.width, alto: r.height, anchoPropio: m.offsetWidth, altoPropio: m.offsetHeight, estilo: m.getAttribute("style") };
            });
            const esquina = await aPantalla(pagina, { x: pedido.x, y: pedido.y });
            const unidad = await aPantalla(pagina, { x: pedido.x + 32, y: pedido.y + 32 });
            const pixelesPorPuntoDelMapa = (unidad.x - esquina.x) / 32;
            const capturas = [await captura(pagina, "9h-cartel", await recorteDelMapa(pagina, 12 * 32, 11 * 32, 20 * 32, 14 * 32))];
            const medidoEnElMapa = enPantalla
                ? {
                      x: Math.round(((enPantalla.x - esquina.x) / pixelesPorPuntoDelMapa + pedido.x) * 10) / 10,
                      y: Math.round(((enPantalla.y - esquina.y) / pixelesPorPuntoDelMapa + pedido.y) * 10) / 10,
                      ancho: Math.round((enPantalla.ancho / pixelesPorPuntoDelMapa) * 10) / 10,
                      alto: Math.round((enPantalla.alto / pixelesPorPuntoDelMapa) * 10) / 10,
                  }
                : null;
            return {
                estado: enPantalla ? "dato" : "mal",
                dato: { pedido: { ...pedido, scale: 0.5 }, loQueDevuelveCreate: creado, enPantalla, pixelesPorPuntoDelMapa, medidoEnPuntosDelMapa: medidoEnElMapa },
                capturas,
            };
        });

        // ---------- i) zona con panel ----------
        await comprobar("9i", "zona-panel", "Zona con openWebsite + onaction + texto: sale el aviso y ESPACIO abre el panel", [pagina], async () => {
            await teletransportar(pagina, { x: 10 * 32, y: 3 * 32 });
            // En esta versión de WorkAdventure el aviso de una zona no sale junto al muñeco: es un «popup» abajo, con un botón
            const aviso = pagina.locator(".popup-container").first();
            await expect(aviso).toBeVisible();
            await espera(800);
            const texto = ((await aviso.locator(".responsive-message").textContent()) ?? "").replace(/\s+/g, " ").trim();
            const boton = ((await aviso.locator(".buttons-wrapper button").first().textContent().catch(() => "")) ?? "").trim();
            const cajaDelAviso = await aviso.boundingBox();
            const juntoAlMuneco = await pagina.locator(".characterTriggerAction").count();
            const capturas = [await capturaEntera(pagina, "9i-aviso-pantalla"), await capturaDeElemento(pagina, ".popup-container", "9i-aviso", 12)];
            const marcosAntes = await pagina.evaluate(() => Array.from(document.querySelectorAll("iframe")).filter((f) => f.src.includes("panel.html")).length);
            await pagina.keyboard.press("Space");
            const panel = pagina.locator('iframe[src*="panel.html"]').first();
            await expect(panel).toBeVisible();
            await espera(1500);
            capturas.push(await capturaEntera(pagina, "9i-panel-abierto"));
            const datosDelPanel = await panel.evaluate((m) => {
                const marco = m as HTMLIFrameElement;
                const r = marco.getBoundingClientRect();
                return { src: marco.src, title: marco.title, caja: { x: Math.round(r.x), y: Math.round(r.y), ancho: Math.round(r.width), alto: Math.round(r.height) }, ventana: { ancho: window.innerWidth, alto: window.innerHeight } };
            });
            const avisoSigue = await aviso.isVisible().catch(() => false);
            await teletransportar(pagina, centro(12, 9));
            await espera(1500);
            const alSalir = await pagina.evaluate(() => Array.from(document.querySelectorAll("iframe")).filter((f) => f.src.includes("panel.html")).length);
            return {
                estado: texto.includes("abrir el panel de prueba") ? "bien" : "mal",
                dato: {
                    textoDelAviso: texto,
                    textoDelBoton: boton,
                    dondeSaleElAviso: cajaDelAviso,
                    avisosJuntoAlMuneco_characterTriggerAction: juntoAlMuneco,
                    marcosAntesDeEspacio: marcosAntes,
                    panel: datosDelPanel,
                    elAvisoSigueConElPanelAbierto: avisoSigue,
                    marcosDelPanelAlSalirDeLaZona: alSalir,
                },
                capturas,
            };
        });
    } finally {
        await salir(a);
    }
});

test("9 · sondeos de la API de los mapas (dos jugadores)", async ({ browser }) => {
    test.setTimeout(480_000);
    let a: Jugador | undefined;
    let b: Jugador | undefined;
    try {
        a = await entrar(browser, "Alicia", { sala: "sondeos2" });
        const alicia = a.pagina;
        await teletransportar(alicia, centro(5, 8));
        b = await entrar(browser, "Benito", { sala: "sondeos2", muneco: "hs-w02" });
        const benito = b.pagina;

        // ---------- b) proximityMeeting ----------
        await comprobar("9b", "avisos", "proximityMeeting.onJoin() y onLeave(): ¿saltan al formarse y deshacerse la burbuja?, ¿con qué datos?", [alicia, benito], async () => {
            const antes = { alicia: (await banco(alicia)).llamada, benito: (await banco(benito)).llamada };
            await teletransportar(benito, centro(6, 8));
            await esperarLlamada(alicia);
            await esperarLlamada(benito);
            await espera(1500);
            const juntos = { alicia: (await banco(alicia)).llamada, benito: (await banco(benito)).llamada };
            const ids = {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                alicia: await enScript(alicia, () => (window as any).WA.player.playerId),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                benito: await enScript(benito, () => (window as any).WA.player.playerId),
            };
            await teletransportar(benito, centro(12, 12));
            await esperarSinLlamada(alicia);
            await esperarSinLlamada(benito);
            await espera(1000);
            const separados = { alicia: (await banco(alicia)).llamada, benito: (await banco(benito)).llamada };
            const bien =
                juntos.alicia.entradas.length === antes.alicia.entradas.length + 1 &&
                juntos.benito.entradas.length === antes.benito.entradas.length + 1 &&
                separados.alicia.salidas.length === antes.alicia.salidas.length + 1 &&
                separados.benito.salidas.length === antes.benito.salidas.length + 1;
            return {
                estado: bien ? "bien" : "mal",
                dato: {
                    playerId: ids,
                    onJoin_enAlicia: juntos.alicia.entradas.slice(antes.alicia.entradas.length),
                    onJoin_enBenito: juntos.benito.entradas.slice(antes.benito.entradas.length),
                    onLeave_enAlicia: separados.alicia.salidas.slice(antes.alicia.salidas.length),
                    onLeave_enBenito: separados.benito.salidas.slice(antes.benito.salidas.length),
                    antesDeJuntarse: antes,
                },
            };
        });

        // ---------- j) zona silenciosa ----------
        await comprobar("9j", "silencio", "Zona `silent`: dentro no hay llamada; al salir andando, vuelve", [alicia, benito], async () => {
            await teletransportar(benito, centro(16, 6)); // fuera, pegado al borde de la zona
            await teletransportar(alicia, centro(16, 5)); // dentro, justo al lado de Benito
            const muestras: { s: number; alicia: boolean; benito: boolean }[] = [];
            for (let s = 1; s <= 6; s++) {
                await espera(1000);
                muestras.push({ s, alicia: enLlamada(await estadoDeLlamada(alicia)), benito: enLlamada(await estadoDeLlamada(benito)) });
            }
            const dentro = { alicia: await estadoDeLlamada(alicia), benito: await estadoDeLlamada(benito), posiciones: { alicia: await posicion(alicia), benito: await posicion(benito) } };
            const capturas = [await capturaEntera(alicia, "9j-dentro-alicia")];
            const textoDeLaBarra = await alicia.evaluate(() => (document.querySelector(".bp-menu")?.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200));
            // Alicia sale andando a la casilla de al lado de Benito, fuera de la zona
            const inicio = Date.now();
            const paseo = await enScript(alicia, async () => {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return await (window as any).WA.player.moveTo(15 * 32 + 16, 6 * 32 + 24);
                } catch (e) {
                    return "error: " + String((e as Error)?.message ?? e);
                }
            });
            let vuelve = false;
            let segundos = 0;
            while (Date.now() - inicio < 30_000) {
                if (enLlamada(await estadoDeLlamada(alicia)) && enLlamada(await estadoDeLlamada(benito))) {
                    vuelve = true;
                    segundos = Math.round((Date.now() - inicio) / 100) / 10;
                    break;
                }
                await espera(500);
            }
            capturas.push(await capturaEntera(alicia, "9j-fuera-alicia"));
            const sinLlamadaDentro = muestras.every((m) => !m.alicia && !m.benito);
            return {
                estado: sinLlamadaDentro && vuelve ? "bien" : "mal",
                dato: {
                    dentroNoHayLlamada: sinLlamadaDentro,
                    muestrasDentro: muestras,
                    dentro,
                    textoJuntoALaBarra: textoDeLaBarra,
                    paseoDeSalida: paseo,
                    alSalirVuelveLaLlamada: vuelve,
                    segundosDesdeQueEchaAAndar: segundos,
                    fuera: { alicia: await estadoDeLlamada(alicia), posicion: await posicion(alicia) },
                },
                capturas,
            };
        });
    } finally {
        await salir(a, b);
    }
});
