// El buscador del libro de cuentas: qué se puede buscar de un movimiento y cuándo coincide con lo escrito.
//
// Además del concepto, las notas, la categoría y las personas, se encuentra por IMPORTE (para cuadrar con el banco es
// lo primero que se busca), por fecha y por tipo:
//   · el importe, como se ve y como se escribe: «345,90», «345.90», «345,9», «345», «12.845,50», «12845,5», «576»,
//     y con su signo («-345,90» solo es un gasto; «+576», un ingreso). El «€» da igual.
//   · la fecha: «1/10», «01/10/2026», «2026-10-01», «1 oct», «1 de octubre», «octubre», «octubre 2026».
//   · el tipo: «gasto», «ingreso», «pago» (y «tique», lo que lleva tique).
// Se buscan todas las palabras escritas, en cualquier orden y sin fijarse en tildes ni mayúsculas. Una palabra que
// empieza por una cifra se busca desde el principio del importe o de la fecha (o de un número del texto): «40»
// encuentra 40,00 € pero no 240,00 € ni 1840,00 €; «1/10» no encuentra el 21/10; y «10» no saca todo octubre.
//
// Lógica sola, sin página (los nombres de las personas se le pasan), para poder probarla en Node: pruebas/libro.mjs.

import { normalizar, MESES, MESES_CORTOS, DIAS, diaSemana } from "./util.js";

const TIPOS = { gasto: "gasto", ingreso: "ingreso", pago: "pago" };

// 1284550 → «12845.50», «12845,50», «12.845,50», «12,845.50»: como lo escribe cada uno y como sale en pantalla.
export function formasDeImporte(centimos) {
    const c = Math.abs(Math.round(Number(centimos) || 0));
    const entero = String(Math.floor(c / 100));
    const decimales = String(c % 100).padStart(2, "0");
    const agrupado = (separador) => entero.replace(/\B(?=(\d{3})+(?!\d))/g, separador);
    return [...new Set([`${entero}.${decimales}`, `${entero},${decimales}`, `${agrupado(".")},${decimales}`, `${agrupado(",")}.${decimales}`])];
}

// «2026-10-01» → las maneras de escribir ese día con cifras. «1·oct» es el día con su mes en una sola palabra: en eso
// se convierte «1 oct», «1 octubre» o «1 de octubre» al buscar (prepararConsulta), para que no valga cualquier 1.
export function formasDeFecha(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return [];
    const [, anio, mes, dia] = m;
    const d = String(Number(dia));
    const n = String(Number(mes));
    const corto = anio.slice(2);
    return [iso, `${d}/${n}/${anio}`, `${dia}/${mes}/${anio}`, `${d}/${n}/${corto}`, `${dia}/${mes}/${corto}`, `${d}·${MESES_CORTOS[Number(mes) - 1]}`];
}

// «2026-10-01» → «jueves 1 de octubre de 2026»: para buscar «octubre», «octubre 2026» o «jueves».
function fechaEscrita(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? `${DIAS[diaSemana(iso)]} ${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : "";
}

// Todo lo que se puede buscar de un movimiento: el texto (ya normalizado, en una línea) y, aparte, las formas de su
// importe y de su fecha, que se buscan desde el principio. «nombre(id)» da el de cada persona.
export function loBuscable(m, { nombre = () => "" } = {}) {
    const signo = m.tipo === "gasto" ? "-" : m.tipo === "ingreso" ? "+" : "";
    const importes = formasDeImporte(m.importe);
    const partes = [
        m.concepto,
        m.categoria,
        m.notas,
        nombre(m.persona),
        m.para ? nombre(m.para) : "",
        TIPOS[m.tipo] || "",
        // un pago se ve como «Víctor le paga a Diego»
        m.tipo === "pago" ? `${nombre(m.persona)} le paga a ${m.para ? nombre(m.para) : ""}` : "",
        m.tique ? `tique ${m.tique.nombre || ""}` : "",
        fechaEscrita(m.fecha),
    ];
    return {
        texto: normalizar(partes.filter(Boolean).join(" ")).replace(/\s+/g, " "),
        importes: signo ? [...importes, ...importes.map((f) => signo + f)] : importes,
        fechas: formasDeFecha(m.fecha),
    };
}

const NOMBRES_DE_MES = MESES.flatMap((mes, i) => [mes, MESES_CORTOS[i]]).concat("sept"); // el nombre entero antes que el corto
const MES_ESCRITO = new RegExp(`(^| )(\\d{1,2}) (?:de )?(${NOMBRES_DE_MES.join("|")})(?= |$)`, "g");

// Lo escrito en el buscador → las palabras que hay que encontrar. Sin «€», con la raya del menos de imprenta («−») como
// guion y con «1 oct» / «1 de octubre» en una sola palabra («1·oct»).
export function prepararConsulta(texto) {
    const limpio = normalizar(String(texto ?? "").replace(/€/g, " ").replace(/\u2212/g, "-")).replace(/\s+/g, " ");
    return limpio
        .replace(MES_ESCRITO, (_todo, antes, dia, mes) => `${antes}${Number(dia)}·${mes.slice(0, 3)}`)
        .split(" ")
        .filter(Boolean);
}

// ¿Está la palabra en lo buscable? Una que empieza por una cifra (o por su signo) se busca desde el principio de un
// importe o de una fecha y, en el texto, donde empieza un número (no en mitad de otro).
function esta(palabra, buscable) {
    if (!/^[-+]?\d/.test(palabra)) return buscable.texto.includes(palabra);
    if (buscable.importes.some((f) => f.startsWith(palabra))) return true;
    if (buscable.fechas.some((f) => f.startsWith(palabra))) return true;
    const { texto } = buscable;
    for (let i = texto.indexOf(palabra); i >= 0; i = texto.indexOf(palabra, i + 1)) {
        if (i === 0 || !/\d/.test(texto[i - 1])) return true;
    }
    return false;
}

// ¿Coincide el movimiento con lo escrito? Con el buscador vacío, sí. «consulta» es el texto o, para no prepararlo
// con cada movimiento, lo que devuelve prepararConsulta().
export function coincide(m, consulta, ayudas) {
    const palabras = Array.isArray(consulta) ? consulta : prepararConsulta(consulta);
    if (!palabras.length) return true;
    const buscable = loBuscable(m, ayudas);
    return palabras.every((p) => esta(p, buscable));
}
