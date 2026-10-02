// Puente invisible entre la oficina (WorkAdventure) y el tablón: /tareas/oficina/
//
// El script del mapa va en un marco aislado (sin la sesión del crew y sin almacenamiento), así que no puede leer
// el tablón. Por eso abre esta página sin enseñarla:
//
//   WA.ui.website.open({ url: "/tareas/oficina/", visible: false, allowApi: true,
//                        position: { vertical: "top", horizontal: "left" }, size: { width: "1px", height: "1px" } })
//
// Esta página sí es de la misma web que el tablón (lleva la cookie de la sesión): carga la API de la oficina
// (/iframe_api.js, la sirve WorkAdventure en la misma dirección), espera a WA.onInit() y deja lo que necesita el mapa
// en variables PRIVADAS del jugador (no se guardan ni las ve nadie más; el mapa las lee con
// WA.player.state.loadVariable y onVariableChange):
//
//   hsSesion   true | false                                      si quien juega ha entrado en el tablón
//   hsTareas   { abiertas, hoy, atrasadas } | null               sus tareas sin terminar, las que vencen hoy y las
//                                                                atrasadas (como las cuenta la Jefa de Producción)
//   hsCumples  { hoy: "AAAA-MM-DD", cumples: [{ id, nombre }] } | null    cumpleaños de hoy en la oficina
//   hsMusica   { configurado } | null                            si el servidor tiene conectado Spotify (SPOTIFY_CLIENT_ID y
//                                                                SPOTIFY_CLIENT_SECRET); el mapa solo pone el botón «Música» si es true
//
// Sin sesión: hsSesion false y las otras tres a null. También saca el aviso de los cumpleaños de hoy (una vez al día
// en cada navegador; el día visto se recuerda aquí, porque el mapa no puede recordar nada).
// Se actualiza con los avisos en directo del tablón (/api/eventos), y al reconectar se vuelve a leer todo (también si
// han conectado Spotify al reiniciar el servidor); cada minuto se recuentan las tareas (a medianoche cambian «hoy» y
// «atrasadas»). Sin sesión se vuelve a probar cada vez más espaciado (1, 2, 4… hasta
// 15 minutos, para no llenar la consola de 401) y al momento cuando se vuelve a la pestaña o se entra en el tablón
// en este navegador (el tablón lo anuncia en localStorage, «hs-tablon:sesion»). Al cerrarse la página, se para.
// Fuera de la oficina (sin WA, por ejemplo abierta en una pestaña) no hace nada.

import { api, escuchar } from "./api.js";
import { hoy, retrasar } from "./util.js";
import { textoCumples } from "./cumple.js";

// Privadas y sin guardar. Ojo: WorkAdventure no admite { persist: false, scope: "world" } (lanza un error), así
// que las que no se guardan van con scope "room".
const OPCIONES = { public: false, persist: false, scope: "room" };
const CLAVE_AVISO = "hs-oficina:aviso-cumple";
const MINUTO = 60 * 1000;
const RATO = 10 * 60 * 1000; // cada cuánto se vuelve a preguntar el día, los cumpleaños de la oficina y si hay música
const ESPERA_MAXIMA = 15 * MINUTO;
const AVISO_DEL_TABLON = "hs-tablon:sesion"; // lo escribe el tablón cada vez que arranca con sesión

let WA = null;
let parado = false;
let yo = null; // { id, nombre… } de quien juega, si ha entrado en el tablón
const tareas = new Map();
let dejarDeEscuchar = null;
let reloj = null;
let ultimaOficina = 0;
let ultimaMusica = 0;
let espera = MINUTO; // sin sesión: lo que se espera antes de volver a probar (se dobla cada vez)
let reintento = null;
let avisoSinAlmacen = null; // el día del último aviso, si el navegador no deja guardar nada
const escritas = new Map(); // lo último escrito en cada variable, para no repetir

function escribir(nombre, valor) {
    if (parado || !WA) return;
    const texto = JSON.stringify(valor);
    if (escritas.get(nombre) === texto) return;
    escritas.set(nombre, texto);
    const fallo = (e) => {
        escritas.delete(nombre);
        console.warn(`[puente de la oficina] No se ha podido guardar «${nombre}»:`, e);
    };
    try {
        Promise.resolve(WA.player.state.saveVariable(nombre, valor, OPCIONES)).catch(fallo);
    } catch (e) {
        fallo(e);
    }
}

// Lo mismo que cuenta la Jefa de Producción: lo mío sin terminar, lo que vence hoy y lo atrasado.
function contarTareas() {
    if (!yo) return null;
    const dia = hoy();
    const mias = [...tareas.values()].filter((t) => t.estado !== "hecho" && t.responsables.includes(yo.id));
    return {
        abiertas: mias.length,
        hoy: mias.filter((t) => t.fin === dia).length,
        atrasadas: mias.filter((t) => t.fin && t.fin < dia).length,
    };
}
const recontar = retrasar(() => escribir("hsTareas", contarTareas()), 300);

// ---------- cumpleaños ----------

function diaDelUltimoAviso() {
    try {
        return localStorage.getItem(CLAVE_AVISO);
    } catch {
        return avisoSinAlmacen;
    }
}
function recordarAviso(dia) {
    avisoSinAlmacen = dia;
    try {
        localStorage.setItem(CLAVE_AVISO, dia);
    } catch {
        /* sin almacenamiento: se recuerda mientras la página siga abierta */
    }
}

function avisarCumples({ hoy: dia, cumples }) {
    if (!cumples.length || diaDelUltimoAviso() === dia) return;
    recordarAviso(dia);
    try {
        WA.ui.banner.openBanner({
            id: "hs-cumple",
            text: `🎂 ${textoCumples(cumples, yo?.id)}`,
            bgColor: "#ffd84a",
            textColor: "#1c1715",
            closable: true,
            timeToClose: 0, // se queda hasta que se cierra
        });
    } catch (e) {
        console.warn("[puente de la oficina] No se ha podido sacar el aviso del cumpleaños:", e);
    }
}

async function leerOficina() {
    let oficina;
    try {
        oficina = await api.oficina();
    } catch (e) {
        if (e.estado === 401 && yo) sinSesion(); // (si otra lectura ya la ha dado por perdida, no se repite)
        return; // sin conexión: se vuelve a probar más tarde
    }
    if (parado || !yo) return;
    ultimaOficina = Date.now();
    escribir("hsCumples", { hoy: oficina.hoy, cumples: oficina.cumples });
    avisarCumples(oficina);
}
const releerOficina = retrasar(leerOficina, 1000);

// ¿Está conectada la música (Spotify) en el servidor? Es lo único que se saca del estado de la cabina. Si no
// contesta, no se escribe nada (y mientras tanto el mapa no pone el botón «Música») y se vuelve a probar luego.
async function leerMusica() {
    if (parado || !yo) return;
    let musica;
    try {
        musica = await api.musica();
    } catch (e) {
        if (e.estado === 401 && yo) sinSesion();
        return;
    }
    if (parado || !yo) return;
    ultimaMusica = Date.now();
    escribir("hsMusica", { configurado: musica?.configurado === true });
}

// ---------- todo ----------

async function actualizar() {
    let datos;
    try {
        datos = await api.datos();
    } catch (e) {
        if (e.estado === 401) sinSesion();
        else reintentarEn(MINUTO); // sin conexión (si ya había sesión, se encarga la reconexión de los avisos)
        return;
    }
    if (parado) return;
    espera = MINUTO;
    yo = datos.yo;
    tareas.clear();
    for (const t of datos.tareas) tareas.set(t.id, t);
    escribir("hsSesion", true);
    escribir("hsTareas", contarTareas());
    await Promise.all([leerOficina(), leerMusica()]);
    if (!dejarDeEscuchar && !parado && yo) dejarDeEscuchar = escuchar(alRecibir, actualizar);
}

function sinSesion() {
    yo = null;
    tareas.clear();
    dejarDeEscuchar?.();
    dejarDeEscuchar = null;
    escribir("hsSesion", false);
    escribir("hsTareas", null);
    escribir("hsCumples", null);
    escribir("hsMusica", null);
    reintentarEn(espera);
    espera = Math.min(espera * 2, ESPERA_MAXIMA);
}

// Sin sesión: ¿ya ha entrado? (al cumplirse la espera, o antes si ha podido cambiar algo)
function probarYa() {
    if (!parado && !yo) actualizar();
}
function reintentarEn(ms) {
    clearTimeout(reintento);
    reintento = setTimeout(() => {
        reintento = null;
        probarYa();
    }, ms);
}

function alRecibir(ev) {
    if (!yo) return;
    if (ev.tipo === "tarea") {
        tareas.set(ev.tarea.id, ev.tarea);
        recontar();
    } else if (ev.tipo === "borrada") {
        tareas.delete(ev.id);
        recontar();
    } else if (ev.tipo === "usuarios") {
        const nuevo = ev.usuarios.find((u) => u.id === yo.id);
        if (nuevo) yo = { ...yo, ...nuevo };
        releerOficina(); // alguien ha cambiado su cumpleaños o su nombre
    }
}

function cadaMinuto() {
    if (parado || !yo) return;
    escribir("hsTareas", contarTareas());
    if (Date.now() - ultimaOficina > RATO) leerOficina();
    if (Date.now() - ultimaMusica > RATO) leerMusica();
}

function parar() {
    parado = true;
    clearInterval(reloj);
    reloj = null;
    clearTimeout(reintento);
    reintento = null;
    dejarDeEscuchar?.();
    dejarDeEscuchar = null;
}

function arrancar() {
    parado = false;
    espera = MINUTO;
    escritas.clear();
    actualizar();
    reloj = setInterval(cadaMinuto, MINUTO);
}

// La API de la oficina: /iframe_api.js lo sirve WorkAdventure en la misma web. Solo se pide dentro de un marco
// (la oficina); abierta suelta, o en local sin oficina, no se pide nada ni se queja.
function apiDeLaOficina() {
    if (window.WA) return Promise.resolve(window.WA);
    if (window.parent === window) return Promise.resolve(null);
    return new Promise((listo) => {
        const guion = document.createElement("script");
        guion.src = "/iframe_api.js";
        guion.onload = () => listo(window.WA || null);
        guion.onerror = () => listo(null);
        document.head.appendChild(guion);
    });
}

(async function inicio() {
    WA = await apiDeLaOficina();
    if (!WA) return;
    await WA.onInit();
    addEventListener("pagehide", parar);
    addEventListener("pageshow", (e) => {
        if (e.persisted && parado) arrancar();
    });
    addEventListener("storage", (e) => {
        if (e.key === AVISO_DEL_TABLON) probarYa();
    });
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) probarYa();
    });
    arrancar();
})().catch((e) => console.warn("[puente de la oficina] No ha podido arrancar:", e));
