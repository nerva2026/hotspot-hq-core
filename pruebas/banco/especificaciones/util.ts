/*
 * Banco de pruebas · utilidades comunes de las especificaciones.
 *
 * Están hechas a imagen de las de las pruebas de WorkAdventure (`tests/tests/utils/`: auth.ts, scripting.ts,
 * gameCoordinates.ts, webRtc.ts), pero propias, porque el banco entra con el navegador en castellano (las suyas buscan
 * los textos en inglés), elige un muñeco de la casa y apunta cada resultado en un archivo en vez de fallar a la primera.
 *
 * Cada comprobación se apunta con `apuntar()` en `apuntes.jsonl` (una línea por comprobación). Con eso, `informe.mjs`
 * escribe `informe.md` e `informe.json`. Los estados: «bien», «mal» (la oficina no hace lo que debe), «no se pudo»
 * (el banco no ha llegado a comprobarlo) y «dato» (un sondeo: no hay bien ni mal, solo lo que se ha medido).
 */
import fs from "fs";
import path from "path";
import { expect, type Browser, type BrowserContext, type Frame, type Page } from "@playwright/test";

export const RESULTADOS = process.env.BANCO_RESULTADOS ?? path.join(process.cwd(), "banco-resultados");
export const PLAY = "https://play.workadventure.localhost";
export const MAPAS = "https://maps.workadventure.localhost/tests/banco/";
/** La versión de la oficina (la saca el flujo de `novedades.ts`): sirve para que el aviso de novedades no salga. */
export const VERSION = process.env.BANCO_VERSION ?? "";
export const LADO = 32;

export type Estado = "bien" | "mal" | "no se pudo" | "dato";
export type Punto = { x: number; y: number };
export type Recorte = { x: number; y: number; width: number; height: number };

fs.mkdirSync(path.join(RESULTADOS, "capturas"), { recursive: true });
fs.mkdirSync(path.join(RESULTADOS, "diagnostico"), { recursive: true });

export const espera = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** El centro de una casilla, en píxeles del mapa. */
export const centro = (cx: number, cy: number): Punto => ({ x: cx * LADO + LADO / 2, y: cy * LADO + LADO / 2 });
/** La casilla en la que cae un punto del mapa. */
export const casilla = (p: Punto): { cx: number; cy: number } => ({ cx: Math.floor(p.x / LADO), cy: Math.floor(p.y / LADO) });

export function direccionDelMapa(sala: string): string {
    return `${PLAY}/_/${sala}/maps.workadventure.localhost/tests/banco/banco.tmj`;
}

// ---------- apuntar resultados ----------

export function apuntar(
    punto: string,
    clave: string,
    titulo: string,
    estado: Estado,
    dato: unknown,
    capturas: string[] = [],
): void {
    const linea = { punto, clave, titulo, estado, dato, capturas, t: new Date().toISOString() };
    fs.appendFileSync(path.join(RESULTADOS, "apuntes.jsonl"), JSON.stringify(linea) + "\n");
    const resumen = typeof dato === "string" ? dato : JSON.stringify(dato);
    console.log(`[banco] ${punto} · ${clave} · ${estado.toUpperCase()} · ${(resumen ?? "").slice(0, 400)}`);
}

export function mensajeDe(e: unknown): string {
    const texto = e instanceof Error ? e.message : String(e);
    // fuera los colores de la consola de Playwright
    // eslint-disable-next-line no-control-regex
    return texto.replace(/\u001b\[[0-9;]*m/g, "").slice(0, 1500);
}

type Resultado = { estado: Estado; dato: unknown; capturas?: string[] };

/**
 * Hace una comprobación y la apunta. Si la comprobación revienta (un botón que no aparece, un tiempo de espera…),
 * no se para la prueba: se apunta «no se pudo» con el error y una captura de cada página, y se sigue con la siguiente.
 */
export async function comprobar(
    punto: string,
    clave: string,
    titulo: string,
    paginas: Page[],
    hacer: () => Promise<Resultado>,
): Promise<Resultado> {
    try {
        const r = await hacer();
        apuntar(punto, clave, titulo, r.estado, r.dato, r.capturas ?? []);
        return r;
    } catch (e) {
        const capturas: string[] = [];
        for (const [i, pagina] of paginas.entries()) {
            try {
                capturas.push(await capturaEntera(pagina, `error-${punto}-${clave}-${i}`));
            } catch {
                // la página ya no está: sin captura
            }
        }
        const r: Resultado = { estado: "no se pudo", dato: mensajeDe(e), capturas };
        apuntar(punto, clave, titulo, r.estado, r.dato, capturas);
        return r;
    }
}

export function guardarDiagnostico(nombre: string, contenido: unknown): string {
    const archivo = path.join("diagnostico", nombre);
    const texto = typeof contenido === "string" ? contenido : JSON.stringify(contenido, null, 1);
    fs.writeFileSync(path.join(RESULTADOS, archivo), texto);
    return archivo;
}

// ---------- entrar en la oficina ----------

export type Jugador = {
    nombre: string;
    pagina: Page;
    contexto: BrowserContext;
    consola: string[];
    /** Lo que ha pedido la página que interesa al banco (las letras de la casa y lo que va junto al mapa): «200 dirección». */
    respuestas: string[];
    muneco: string;
};

export type OpcionesDeEntrada = {
    sala?: string;
    muneco?: string;
    /** Si es false, el aviso de novedades sale (como a quien entra por primera vez). */
    novedadesVistas?: boolean;
    viewport?: { width: number; height: number };
};

/**
 * Entra en el mapa de prueba como una persona nueva: nombre, muñeco (uno de la casa, «hs-…», si la pantalla lo
 * ofrece), cámara y micrófono (de mentira). Devuelve la página ya dentro del mapa y con el script del mapa arrancado.
 */
export async function entrar(browser: Browser, nombre: string, opciones: OpcionesDeEntrada = {}): Promise<Jugador> {
    const sala = opciones.sala ?? "banco";
    const contexto = await browser.newContext({
        viewport: opciones.viewport ?? { width: 1280, height: 800 },
        locale: "es-ES",
        timezoneId: "Europe/Madrid",
        ignoreHTTPSErrors: true,
        permissions: ["microphone", "camera", "notifications"],
    });
    if (opciones.novedadesVistas !== false && VERSION !== "") {
        await contexto.addInitScript((version) => {
            try {
                localStorage.setItem("hotspot-novedades-vistas", version);
            } catch {
                // sin localStorage (un marco sin permiso): da igual
            }
        }, VERSION);
    }
    const pagina = await contexto.newPage();
    const consola: string[] = [];
    pagina.on("console", (m) => {
        consola.push(`[${m.type()}] ${m.text()}`.slice(0, 500));
        if (consola.length > 600) consola.shift();
    });
    pagina.on("pageerror", (e) => consola.push(`[excepción] ${e.message}`.slice(0, 500)));
    const respuestas: string[] = [];
    pagina.on("response", (r) => {
        const direccion = r.url();
        if (direccion.includes("/static/fonts/") || direccion.includes("/tests/banco/")) respuestas.push(`${r.status()} ${direccion}`);
    });

    await pagina.goto(direccionDelMapa(sala));

    // 1) el nombre
    const campoNombre = pagina.getByTestId("loginSceneNameInput");
    await expect(campoNombre).toBeVisible({ timeout: 90_000 });
    await campoNombre.fill(nombre);
    await campoNombre.press("Enter");

    // 2) el muñeco: uno de la casa si la pantalla lo ofrece
    const seguir = pagina.locator("button.selectCharacterSceneFormSubmit");
    await expect(seguir).toBeVisible({ timeout: 60_000 });
    let muneco = "(el que venía elegido)";
    const pedido = opciones.muneco ?? "hs-w01";
    const botonMuneco = pagina.locator(`[id="woka-${pedido}"]`);
    if ((await botonMuneco.count()) > 0) {
        await botonMuneco.scrollIntoViewIfNeeded();
        await botonMuneco.click();
        muneco = pedido;
    }
    await seguir.click();

    // 3) cámara y micrófono (los de mentira de Chromium)
    const camara = pagina.locator("form.enableCameraScene");
    await expect(camara).toBeVisible({ timeout: 60_000 });
    await camara.locator("button[type='submit']:visible").last().click();

    // 4) ya dentro: puede salir la pantalla de «instalar la aplicación» o el aviso de «activar sonido»
    await pagina.addLocatorHandler(pagina.getByTestId("audio-playback-retry"), async (boton) => {
        try {
            await boton.click({ force: true, timeout: 5_000 });
        } catch {
            // se ha ido solo
        }
    });
    const saltar = pagina.getByTestId("pwa-install-skip");
    const micro = pagina.getByTestId("microphone-button");
    await saltar.or(micro).first().waitFor({ state: "visible", timeout: 120_000 });
    if (await saltar.isVisible()) await saltar.click();
    await expect(micro).toBeVisible({ timeout: 120_000 });

    const jugador: Jugador = { nombre, pagina, contexto, consola, respuestas, muneco };
    await marcoDelScript(pagina);
    return jugador;
}

/** Cierra el aviso de novedades si sale (cuando no se ha podido evitar con `VERSION`). */
export async function cerrarNovedadesSiSalen(pagina: Page, ms = 6_000): Promise<boolean> {
    const cerrar = pagina.getByTestId("hotspot-novedades-cerrar");
    try {
        await cerrar.waitFor({ state: "visible", timeout: ms });
    } catch {
        return false;
    }
    await cerrar.click();
    await expect(cerrar).toBeHidden();
    return true;
}

export async function salir(...jugadores: (Jugador | undefined)[]): Promise<void> {
    for (const j of jugadores) {
        if (!j) continue;
        try {
            guardarDiagnostico(`consola-${j.nombre}-${Date.now()}.txt`, j.consola.slice(-300).join("\n"));
        } catch {
            // sin registro
        }
        try {
            await j.contexto.close();
        } catch {
            // ya estaba cerrado
        }
    }
}

// ---------- el script del mapa ----------

/** El marco (iframe) en el que corre el script del mapa, ya arrancado. */
export async function marcoDelScript(pagina: Page): Promise<Frame> {
    let marco: Frame | undefined;
    await expect
        .poll(
            async () => {
                marco = pagina.frames().find((f) => f.url().includes("/local-script"));
                if (!marco) return "sin marco";
                try {
                    return await marco.evaluate(() => {
                        const b = (window as unknown as { banco?: { listo: boolean } }).banco;
                        return b?.listo === true ? "listo" : "arrancando";
                    });
                } catch (e) {
                    return "error: " + mensajeDe(e).slice(0, 80);
                }
            },
            { timeout: 45_000, message: "El script del mapa no arranca" },
        )
        .toBe("listo");
    return marco as Frame;
}

/** Ejecuta una función dentro del marco del script del mapa (ahí están `WA` y `window.banco`). */
export async function enScript<R, A = undefined>(pagina: Page, funcion: (arg: A) => R | Promise<R>, arg?: A): Promise<R> {
    const marco = await marcoDelScript(pagina);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return marco.evaluate(funcion as any, arg as any) as Promise<R>;
}

/** Lo que el script del mapa lleva apuntado (teclas, llamada, botones pulsados…). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function banco(pagina: Page): Promise<any> {
    return enScript(pagina, () => JSON.parse(JSON.stringify((window as unknown as { banco: unknown }).banco)));
}

export async function posicion(pagina: Page): Promise<Punto> {
    return enScript(pagina, async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = await (window as any).WA.player.getPosition();
        return { x: p.x, y: p.y };
    });
}

export async function teletransportar(pagina: Page, p: Punto): Promise<void> {
    await enScript(
        pagina,
        async (destino) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (window as any).WA.player.teleport(destino.x, destino.y);
        },
        p,
    );
    await espera(400);
}

/** Guarda una variable pública del jugador, como hace el script de los mapas de verdad. */
export async function guardarVariable(pagina: Page, nombre: string, valor: unknown): Promise<void> {
    await enScript(
        pagina,
        async ({ nombre, valor }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (window as any).WA.player.state.saveVariable(nombre, valor, {
                public: true,
                persist: false,
                scope: "room",
            });
        },
        { nombre, valor },
    );
}

// ---------- llamada (burbuja de conversación) ----------

export type EstadoDeLlamada = {
    /** Conexiones WebRTC abiertas con otros (la cuenta que lleva WorkAdventure para sus propias pruebas). */
    webrtc: number;
    /** Cajas de vídeo en pantalla (la propia y las de los demás). */
    cajas: number;
    /** Lo que dice el script del mapa: si `proximityMeeting.onJoin` ha saltado y `onLeave` no. */
    script: boolean;
    entradas: number;
    salidas: number;
};

export async function estadoDeLlamada(pagina: Page): Promise<EstadoDeLlamada> {
    const dom = await pagina.evaluate(() => {
        const ganchos = (window as unknown as { e2eHooks?: { getWebRtcConnectionsCount(): number } }).e2eHooks;
        return {
            webrtc: ganchos ? ganchos.getWebRtcConnectionsCount() : -1,
            cajas: document.querySelectorAll("#cameras-container .camera-box").length,
        };
    });
    const b = await banco(pagina);
    return {
        ...dom,
        script: b.llamada.dentro === true,
        entradas: b.llamada.entradas.length,
        salidas: b.llamada.salidas.length,
    };
}

/** ¿Hay llamada en marcha? Que el script lo sepa (onJoin) y que haya conexión de vídeo con el otro. */
export const enLlamada = (e: EstadoDeLlamada): boolean => e.script && e.webrtc >= 1;

export async function esperarLlamada(pagina: Page, ms = 40_000): Promise<EstadoDeLlamada> {
    let ultimo: EstadoDeLlamada | undefined;
    const tope = Date.now() + ms;
    while (Date.now() < tope) {
        ultimo = await estadoDeLlamada(pagina);
        if (enLlamada(ultimo)) return ultimo;
        await espera(500);
    }
    throw new Error("La llamada no llega a formarse en " + ms + " ms: " + JSON.stringify(ultimo));
}

export async function esperarSinLlamada(pagina: Page, ms = 20_000): Promise<EstadoDeLlamada> {
    let ultimo: EstadoDeLlamada | undefined;
    const tope = Date.now() + ms;
    while (Date.now() < tope) {
        ultimo = await estadoDeLlamada(pagina);
        if (!ultimo.script && ultimo.webrtc === 0) return ultimo;
        await espera(500);
    }
    throw new Error("La llamada no se corta en " + ms + " ms: " + JSON.stringify(ultimo));
}

// ---------- capturas ----------

/** De un punto del mapa a un punto de la ventana del navegador (con el gancho de las pruebas de WorkAdventure). */
export async function aPantalla(pagina: Page, p: Punto): Promise<Punto> {
    return pagina.evaluate((punto) => {
        const ganchos = (
            window as unknown as { e2eHooks: { gameToBrowserCoordinates(p: { x: number; y: number }): Promise<{ x: number; y: number }> } }
        ).e2eHooks;
        return ganchos.gameToBrowserCoordinates(punto);
    }, p);
}

function dentroDeLaVentana(pagina: Page, r: Recorte): Recorte {
    const v = pagina.viewportSize() ?? { width: 1280, height: 800 };
    const x = Math.max(0, Math.round(r.x));
    const y = Math.max(0, Math.round(r.y));
    const width = Math.max(8, Math.min(v.width - x, Math.round(r.width)));
    const height = Math.max(8, Math.min(v.height - y, Math.round(r.height)));
    return { x, y, width, height };
}

/** El trozo de pantalla que ocupa un rectángulo del mapa (en píxeles del mapa). */
export async function recorteDelMapa(pagina: Page, x0: number, y0: number, x1: number, y1: number): Promise<Recorte> {
    const a = await aPantalla(pagina, { x: x0, y: y0 });
    const b = await aPantalla(pagina, { x: x1, y: y1 });
    return dentroDeLaVentana(pagina, { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y });
}

/** El trozo de pantalla de alrededor de un muñeco: con sitio para el nombre, la burbuja y lo que sube por encima. */
export async function recorteDelMuneco(
    pagina: Page,
    p: Punto,
    margen = { lados: 56, arriba: 112, abajo: 32 },
): Promise<Recorte> {
    return recorteDelMapa(pagina, p.x - margen.lados, p.y - margen.arriba, p.x + margen.lados, p.y + margen.abajo);
}

export async function captura(pagina: Page, nombre: string, recorte?: Recorte): Promise<string> {
    const archivo = path.join("capturas", nombre + ".png");
    await pagina.screenshot({ path: path.join(RESULTADOS, archivo), clip: recorte, animations: "allow" });
    return archivo;
}

export const capturaEntera = (pagina: Page, nombre: string): Promise<string> => captura(pagina, nombre);

/** Captura de un elemento de la página con un margen alrededor. */
export async function capturaDeElemento(pagina: Page, selector: string, nombre: string, margen = 8): Promise<string> {
    const caja = await pagina.locator(selector).first().boundingBox();
    if (!caja) throw new Error(`No se ve «${selector}» para capturarlo`);
    return captura(
        pagina,
        nombre,
        dentroDeLaVentana(pagina, {
            x: caja.x - margen,
            y: caja.y - margen,
            width: caja.width + margen * 2,
            height: caja.height + margen * 2,
        }),
    );
}

/** ¿Son distintas dos capturas? (para ver que algo se mueve). Compara los bytes: basta para «igual o no». */
export function distintas(a: string, b: string): boolean {
    const x = fs.readFileSync(path.join(RESULTADOS, a));
    const y = fs.readFileSync(path.join(RESULTADOS, b));
    return !x.equals(y);
}

// ---------- letras ----------

/** La letra con la que se pinta de verdad un elemento, su tamaño y su peso. */
export async function letraDe(pagina: Page, selector: string): Promise<Record<string, string> | null> {
    return pagina.evaluate((s) => {
        const e = document.querySelector(s);
        if (!e) return null;
        const c = getComputedStyle(e);
        return {
            texto: (e.textContent ?? "").trim().slice(0, 80),
            familia: c.fontFamily,
            tamano: c.fontSize,
            peso: c.fontWeight,
            interlineado: c.lineHeight,
            color: c.color,
            fondo: c.backgroundColor,
        };
    }, selector);
}

// ---------- comparar capturas ----------

export type Diferencia = {
    /** Píxeles que cambian entre las dos capturas. */
    distintos: number;
    total: number;
    /** Cuánto cambian, de media, los píxeles que cambian (0 a 255 por color): un tinte suave da poco; un dibujo nuevo, mucho. */
    cambioMedio: number;
    /** El rectángulo que encierra lo que cambia, en píxeles de la captura (o nada, si son iguales). */
    caja: { x0: number; y0: number; x1: number; y1: number } | null;
    /** Si no se han podido comparar (tamaños distintos…). */
    error?: string;
};

/**
 * Compara dos capturas píxel a píxel (lo hace el navegador, que ya sabe leer PNG). Sirve para saber si algo se ha
 * dibujado, si se mueve y DÓNDE cambia la imagen, sin fiarse solo de mirarlas.
 */
export async function diferencia(pagina: Page, a: string, b: string): Promise<Diferencia> {
    const leer = (f: string): string => fs.readFileSync(path.join(RESULTADOS, f)).toString("base64");
    return pagina.evaluate(
        async ([x, y]) => {
            const imagen = async (base64: string): Promise<ImageData> => {
                const binario = atob(base64);
                const octetos = new Uint8Array(binario.length);
                for (let i = 0; i < binario.length; i++) octetos[i] = binario.charCodeAt(i);
                const mapa = await createImageBitmap(new Blob([octetos], { type: "image/png" }));
                const lienzo = new OffscreenCanvas(mapa.width, mapa.height);
                const pincel = lienzo.getContext("2d");
                if (!pincel) throw new Error("sin lienzo");
                pincel.drawImage(mapa, 0, 0);
                return pincel.getImageData(0, 0, mapa.width, mapa.height);
            };
            const p = await imagen(x);
            const q = await imagen(y);
            if (p.width !== q.width || p.height !== q.height) {
                return { distintos: -1, total: p.width * p.height, cambioMedio: 0, caja: null, error: `tamaños distintos: ${p.width}×${p.height} y ${q.width}×${q.height}` };
            }
            let distintos = 0;
            let suma = 0;
            let x0 = p.width;
            let y0 = p.height;
            let x1 = -1;
            let y1 = -1;
            for (let i = 0; i < p.data.length; i += 4) {
                if (p.data[i] !== q.data[i] || p.data[i + 1] !== q.data[i + 1] || p.data[i + 2] !== q.data[i + 2]) {
                    distintos++;
                    suma += (Math.abs(p.data[i] - q.data[i]) + Math.abs(p.data[i + 1] - q.data[i + 1]) + Math.abs(p.data[i + 2] - q.data[i + 2])) / 3;
                    const px = (i / 4) % p.width;
                    const py = Math.floor(i / 4 / p.width);
                    if (px < x0) x0 = px;
                    if (px > x1) x1 = px;
                    if (py < y0) y0 = py;
                    if (py > y1) y1 = py;
                }
            }
            return {
                distintos,
                total: p.width * p.height,
                cambioMedio: distintos > 0 ? Math.round((suma / distintos) * 10) / 10 : 0,
                caja: distintos > 0 ? { x0, y0, x1, y1 } : null,
            };
        },
        [leer(a), leer(b)],
    );
}

/** Las excepciones y errores de consola que han salido desde una marca (para ver que algo «no hace nada raro»). */
export function erroresDesde(jugador: Jugador, desde: number): string[] {
    return jugador.consola.slice(desde).filter((l) => l.startsWith("[excepción]") || l.startsWith("[error]"));
}

/** La caja de un elemento en la pantalla (o nada si no está). */
export async function cajaDe(pagina: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number } | null> {
    const elemento = pagina.locator(selector).first();
    if ((await elemento.count()) === 0) return null;
    return elemento.boundingBox();
}
