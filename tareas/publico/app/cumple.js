// Cumpleaños: cuentas y textos comunes al tablón y al puente de la oficina (/tareas/oficina/).
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
