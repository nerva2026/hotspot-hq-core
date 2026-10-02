/**
 * HOT SPOT S.L. · el muñeco y el compañero se guardan con la cuenta del crew (parche 10).
 *
 * El tablón de tareas (mismo origen que la oficina) guarda el personaje de cada persona. Usa su cookie de sesión:
 *   GET /tareas/api/yo/personaje → { texturas: string[] | null, companero: string | null, actualizado }
 *   PUT /tareas/api/yo/personaje   con { texturas: [1 a 10 piezas], companero: pieza | null }
 * Todas las peticiones llevan la cabecera «X-Tablon: 1» (el tablón rechaza con 403 los cambios que no la traen).
 *
 * - Al entrar con cuenta, si la API trae «texturas», mandan sobre las del navegador: el muñeco es el mismo en
 *   todos los aparatos.
 * - Al elegir o cambiar el muñeco o el compañero, se guarda en la API (un instante después, y solo si ha cambiado).
 * - Si la API no responde (sin sesión, 401, 404, sin red o más de 2 s), todo sigue como si no existiera:
 *   sin avisos ni errores visibles, y sin guardar nada en la cuenta en esa visita.
 */
import { gameManager } from "../Phaser/Game/GameManager";
import { localUserStore } from "./LocalUserStore";

const URL_API = "/tareas/api/yo/personaje";
const TIEMPO_MAXIMO_MS = 2000;
const ESPERA_PARA_GUARDAR_MS = 600;
const MAXIMO_PIEZAS = 10;

interface Personaje {
    texturas: string[];
    companero: string | null;
}

/** La API ha contestado bien a la lectura de esta visita: solo entonces se guarda en ella. */
let sincronizada = false;
/** La API ha dicho que no existe o que no hay sesión: no se vuelve a probar en esta visita. */
let apiNoDisponible = false;
/** Lo último que se sabe que tiene la cuenta guardado (para no repetir lo que ya está). */
let ultimoEnLaCuenta: string | null = null;
let temporizador: ReturnType<typeof setTimeout> | undefined;

/** Clave para comparar personajes: el orden de las piezas no importa (el pusher las devuelve ordenadas a su manera). */
function claveDe(personaje: Personaje): string {
    return JSON.stringify([[...personaje.texturas].sort(), personaje.companero]);
}

function leerPersonaje(datos: unknown): Personaje | undefined {
    if (typeof datos !== "object" || datos === null) return undefined;
    const { texturas, companero } = datos as { texturas?: unknown; companero?: unknown };
    if (
        !Array.isArray(texturas) ||
        texturas.length === 0 ||
        texturas.length > MAXIMO_PIEZAS ||
        !texturas.every((t) => typeof t === "string" && t !== "")
    ) {
        return undefined;
    }
    return { texturas: texturas as string[], companero: typeof companero === "string" && companero !== "" ? companero : null };
}

/** Llama a la API con un tiempo máximo. Devuelve el JSON, o undefined si algo falla (sin ruido). */
async function pedir(metodo: "GET" | "PUT", cuerpo?: Personaje): Promise<unknown> {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);
    try {
        const respuesta = await fetch(URL_API, {
            method: metodo,
            credentials: "same-origin",
            // «X-Tablon: 1» es la protección del tablón: sin ella rechaza (403) todo lo que no sea leer.
            headers: cuerpo ? { "Content-Type": "application/json", "X-Tablon": "1" } : { "X-Tablon": "1" },
            body: cuerpo ? JSON.stringify(cuerpo) : undefined,
            signal: control.signal,
        });
        if (respuesta.status === 401 || respuesta.status === 403 || respuesta.status === 404) {
            apiNoDisponible = true;
            return undefined;
        }
        if (!respuesta.ok) return undefined;
        return await respuesta.json();
    } catch {
        return undefined;
    } finally {
        clearTimeout(reloj);
    }
}

/**
 * Al entrar con cuenta, antes de que la oficina compruebe el muñeco: si la cuenta tiene uno guardado, es el que vale.
 * Nunca falla ni tarda más de unos 2 s.
 */
export async function sincronizarPersonajeConLaCuenta(): Promise<void> {
    try {
        if (apiNoDisponible || !localUserStore.isLogged()) return; // sin cuenta no hay API que preguntar
        const datos = await pedir("GET");
        if (typeof datos !== "object" || datos === null) return;
        sincronizada = true;
        const guardado = leerPersonaje(datos);
        if (guardado === undefined) {
            ultimoEnLaCuenta = null; // la cuenta no tiene personaje: queda el del navegador (si hay) y se sube al entrar
            return;
        }
        ultimoEnLaCuenta = claveDe(guardado);
        localUserStore.setCharacterTextures(guardado.texturas);
        localUserStore.setCompanionTextureId(guardado.companero);
        gameManager.setCharacterTextureIds(guardado.texturas);
        gameManager.setCompanionTextureId(guardado.companero);
    } catch (error) {
        console.warn("[personaje] No se pudo leer el personaje de la cuenta; se sigue con el del navegador.", error);
    }
}

async function enviarPersonaje(): Promise<void> {
    const texturas = gameManager.getCharacterTextureIds();
    if (!texturas || texturas.length === 0 || texturas.length > MAXIMO_PIEZAS) return;
    const personaje: Personaje = { texturas: [...texturas], companero: gameManager.getCompanionTextureId() };
    const clave = claveDe(personaje);
    if (clave === ultimoEnLaCuenta) return;
    const guardado = leerPersonaje(await pedir("PUT", personaje));
    if (guardado !== undefined) ultimoEnLaCuenta = claveDe(guardado);
}

/**
 * Se llama cada vez que cambia el muñeco o el compañero. Un instante después (para juntar los dos cambios)
 * guarda el personaje entero, si la API respondió al entrar y lo guardado ya no es lo mismo.
 */
export function guardarPersonajeEnLaCuenta(): void {
    try {
        if (!sincronizada || apiNoDisponible || !localUserStore.isLogged()) return;
        clearTimeout(temporizador);
        temporizador = setTimeout(() => {
            enviarPersonaje().catch(() => undefined);
        }, ESPERA_PARA_GUARDAR_MS);
    } catch {
        // guardar en la cuenta nunca debe estorbar a la oficina
    }
}
