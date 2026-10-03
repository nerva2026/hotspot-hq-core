// Cumpleaños: cuentas y textos comunes al tablón, al puente de la oficina (/tareas/oficina/) y al cartel de
// cumpleaños (/tareas/cumples/).
// Un cumpleaños es «MM-DD» (sin año). El 29 de febrero se celebra el 28 los años que no son bisiestos.

import { MESES } from "./util.js";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS_DEL_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // febrero con su 29

export const bisiesto = (anio) => (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;

// Cuántos días puede tener un mes (1 a 12) en un cumpleaños: febrero, 29.
export const maximoDelMes = (mes) => DIAS_DEL_MES[mes - 1] || 31;

export function cumpleValido(cumple) {
    if (typeof cumple !== "string" || !/^\d{2}-\d{2}$/.test(cumple)) return false;
    const [m, d] = cumple.split("-").map(Number);
    return m >= 1 && m <= 12 && d >= 1 && d <= maximoDelMes(m);
}

// ¿Se celebra este cumpleaños el día «AAAA-MM-DD»?
export function seCelebraEl(cumple, dia) {
    if (!cumpleValido(cumple)) return false;
    const mmdd = dia.slice(5);
    if (cumple === mmdd) return true;
    return cumple === "02-29" && mmdd === "02-28" && !bisiesto(Number(dia.slice(0, 4)));
}

// «17 de mayo» / «17 may»
export function fechaCumple(cumple, { corta = false } = {}) {
    if (!cumpleValido(cumple)) return "";
    const [m, d] = cumple.split("-").map(Number);
    return corta ? `${d} ${MESES_CORTOS[m - 1]}` : `${d} de ${MESES[m - 1]}`;
}

// «Ana», «Ana y Diego», «Ana, Diego y Víctor»
export function listaNombres(nombres) {
    if (nombres.length <= 1) return nombres.join("");
    return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

// El aviso del día: «¡Hoy es el cumple de Diego!», y a quien cumple, «¡Feliz cumpleaños, Diego!».
// «cumples» es la lista de /api/oficina ([{ id, nombre }]); «yo», el id de quien lo va a leer.
export function textoCumples(cumples, yo) {
    if (!cumples?.length) return "";
    const mio = cumples.find((c) => c.id === yo);
    const otros = cumples.filter((c) => c !== mio).map((c) => c.nombre);
    if (!mio) return `¡Hoy es el cumple de ${listaNombres(otros)}!`;
    if (!otros.length) return `¡Feliz cumpleaños, ${mio.nombre}!`;
    return `¡Feliz cumpleaños, ${mio.nombre}! Hoy también es el cumple de ${listaNombres(otros)}.`;
}

// ---------- el cartel de cumpleaños (/tareas/cumples/) ----------
// Trabaja con «todos» de /api/oficina: [{ id, nombre, dia: "MM-DD", fecha, enDias, color }], los que antes llegan primero.

// Cuánto falta, con los días que ya ha contado el servidor («enDias», 1 o más): «mañana», «en 5 días».
export function cuantoFalta(enDias) {
    if (enDias === 1) return "mañana"; // PROVISIONAL-v0.3.1
    return `en ${enDias} días`; // PROVISIONAL-v0.3.1
}

// El siguiente cumpleaños que viene (sin contar los de hoy): todas las personas que lo celebran ese mismo día.
// Devuelve null si no queda ninguno por venir, o { fecha, enDias, personas }.
export function elSiguiente(todos) {
    const primero = (todos || []).find((c) => c.enDias > 0);
    if (!primero) return null;
    return { fecha: primero.fecha, enDias: primero.enDias, personas: todos.filter((c) => c.enDias === primero.enDias) };
}

// Los doce meses seguidos, empezando por «desde» (1 a 12; el cartel empieza por el mes en el que estamos, que es
// donde están los que antes llegan), cada uno con sus cumpleaños por día (y, el mismo día, por nombre).
// Cada persona sale en el mes de su día de verdad: quien nació un 29 de febrero, en febrero y con su 29.
export function porMeses(todos, desde = 1) {
    const meses = Array.from({ length: 12 }, (_, i) => ({ mes: ((desde - 1 + i) % 12) + 1, cumples: [] }));
    for (const c of todos || []) {
        if (cumpleValido(c.dia)) meses.find((m) => m.mes === Number(c.dia.slice(0, 2))).cumples.push(c);
    }
    for (const m of meses) m.cumples.sort((a, b) => a.dia.localeCompare(b.dia) || a.nombre.localeCompare(b.nombre, "es"));
    return meses;
}
