// Perfil de cada persona del crew: su cumpleaños y el personaje con el que sale en la oficina.
//
// - Cumpleaños: solo el día y el mes, como «MM-DD» (el año ni se pide ni se guarda). El 29 de febrero se
//   celebra el 28 los años que no son bisiestos.
// - «Hoy» es el día en la oficina (zona horaria TAREAS_ZONA, por defecto Europe/Madrid), no el del servidor,
//   que va en UTC: a las 23:30 en UTC, en Madrid ya es el día siguiente.
// - Personaje: lo que WorkAdventure guarda en el navegador (claves «characterTextures» y «companion» de
//   LocalUserStore), para que cada uno salga igual desde cualquier aparato.

import { ErrorDeDatos } from "./tareas.js";

export const ZONA_POR_DEFECTO = "Europe/Madrid";
export const DIAS_PROXIMOS = 30;
export const MAXIMO_TEXTURAS = 10;
export const ID_PIEZA = /^[A-Za-z0-9_.-]{1,64}$/;

const DIA = 86400000;
const bisiesto = (anio) => (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
const diasDelMes = (mes, anio) => new Date(Date.UTC(anio, mes, 0)).getUTCDate(); // mes de 1 a 12
const aDias = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DIA;
const diasEntre = (desde, hasta) => Math.round(aDias(hasta) - aDias(desde));

function fechaReal(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const [a, m, d] = iso.split("-").map(Number);
    return m >= 1 && m <= 12 && d >= 1 && d <= diasDelMes(m, a);
}

// ---------- cumpleaños ----------

// Lo que llega del formulario: «MM-DD», o null / "" para quitarlo. Devuelve lo que se guarda.
export function validarCumple(valor) {
    if (valor === null || valor === undefined || valor === "") return null;
    if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
        throw new ErrorDeDatos("Del cumpleaños solo hace falta el día y el mes (MM-DD): el año no se guarda.");
    }
    if (typeof valor !== "string" || !/^\d{2}-\d{2}$/.test(valor)) {
        throw new ErrorDeDatos("El cumpleaños tiene que ser el día y el mes (MM-DD).");
    }
    // 2024 es bisiesto: así vale el 29 de febrero.
    if (!fechaReal(`2024-${valor}`)) throw new ErrorDeDatos(`Esa fecha no existe: ${valor}.`);
    return valor;
}

// Qué día se celebra un cumpleaños un año concreto (el 29 de febrero, el 28 si el año no es bisiesto).
export function diaDelCumple(cumple, anio) {
    return `${anio}-${cumple === "02-29" && !bisiesto(anio) ? "02-28" : cumple}`;
}

// El próximo día en que se celebra, contando desde «hoy» (0 = hoy mismo).
export function proximoCumple(cumple, hoy) {
    const anio = Number(hoy.slice(0, 4));
    let fecha = diaDelCumple(cumple, anio);
    if (fecha < hoy) fecha = diaDelCumple(cumple, anio + 1);
    return { fecha, enDias: diasEntre(hoy, fecha) };
}

// ¿Tiene esta persona un cumpleaños guardado que se pueda enseñar? (uno raro en los datos no cuenta)
const conCumple = (u) => typeof u.cumple === "string" && fechaReal(`2024-${u.cumple}`);

// Lo que ven la oficina y el tablón: de quién es el cumple hoy, cuáles vienen en los próximos días y todos los del
// crew («todos», para el cartel de cumpleaños: los que antes llegan, primero; el de hoy va con enDias 0).
// Quien ha salido del crew no cuenta. Sin año en ningún sitio: «fecha» es la próxima vez que se celebra.
export function resumenOficina(usuarios, hoy, dias = DIAS_PROXIMOS) {
    const cumples = [];
    const proximos = [];
    const todos = [];
    for (const u of usuarios) {
        if (u.baja || !conCumple(u)) continue;
        const { fecha, enDias } = proximoCumple(u.cumple, hoy);
        todos.push({ id: u.id, nombre: u.nombre, dia: u.cumple, fecha, enDias, color: u.color || null });
        if (enDias === 0) cumples.push({ id: u.id, nombre: u.nombre });
        else if (enDias <= dias) proximos.push({ id: u.id, nombre: u.nombre, dia: u.cumple, fecha, enDias });
    }
    const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es");
    const porLlegada = (a, b) => a.enDias - b.enDias || porNombre(a, b);
    cumples.sort(porNombre);
    proximos.sort(porLlegada);
    todos.sort(porLlegada);
    return { hoy, cumples, proximos, todos };
}

// GET /api/oficina: el resumen y, además, el cumpleaños de quien pregunta («yo»; null si no lo ha puesto), para que
// el cartel sepa si tiene que ofrecerle ponerlo.
export function oficinaPara(usuarios, hoy, usuario) {
    return { ...resumenOficina(usuarios, hoy), yo: { id: usuario.id, cumple: conCumple(usuario) ? usuario.cumple : null } };
}

// ---------- el día de hoy en la oficina ----------

export function zonaValida(zona) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: zona });
        return true;
    } catch {
        return false;
    }
}

// Día («AAAA-MM-DD») de un instante en una zona horaria.
export function diaEn(zona, instante = new Date()) {
    const partes = {};
    for (const p of new Intl.DateTimeFormat("en-US", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instante)) {
        partes[p.type] = p.value;
    }
    return `${partes.year}-${partes.month}-${partes.day}`;
}

// TAREAS_HOY (solo para pruebas): «2027-02-28» fija el día; «2027-02-27T23:30:00Z» fija el instante y el día
// sale de la zona horaria. El instante tiene que llevar su zona («Z» o «+02:00»): sin ella dependería de la
// hora del aparato. Devuelve null si no hay nada y undefined si no se entiende.
export function leerHoyFijo(valor) {
    if (!valor) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return fechaReal(valor) ? { dia: valor } : undefined;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(valor)) return undefined;
    const t = Date.parse(valor);
    return Number.isFinite(t) && fechaReal(valor.slice(0, 10)) ? { instante: new Date(t) } : undefined;
}

export function hoyEnLaOficina(zona, fijo = null) {
    if (fijo?.dia) return fijo.dia;
    return diaEn(zona, fijo?.instante || new Date());
}

// ---------- personaje de la oficina (WorkAdventure) ----------

// PUT /api/yo/personaje: { texturas: [1 a 10 piezas], companero: pieza o null }. Lo demás se ignora.
// Se guarda entero: sin «companero» (o con "", como lo trata WorkAdventure) queda sin compañero.
export function validarPersonaje(cuerpo) {
    const texturas = cuerpo?.texturas;
    const companero = cuerpo?.companero === "" ? null : (cuerpo?.companero ?? null);
    if (!Array.isArray(texturas) || texturas.length < 1 || texturas.length > MAXIMO_TEXTURAS) {
        throw new ErrorDeDatos(`«texturas» tiene que ser una lista de 1 a ${MAXIMO_TEXTURAS} piezas.`);
    }
    for (const t of texturas) {
        if (typeof t !== "string" || !ID_PIEZA.test(t)) throw new ErrorDeDatos("Alguna pieza de «texturas» no es válida.");
    }
    if (companero !== null && (typeof companero !== "string" || !ID_PIEZA.test(companero))) {
        throw new ErrorDeDatos("«companero» tiene que ser una pieza o null.");
    }
    return { texturas: [...texturas], companero };
}

export function personajeDe(usuario) {
    const p = usuario.personaje;
    return { texturas: p?.texturas ?? null, companero: p?.companero ?? null, actualizado: p?.actualizado ?? null };
}
