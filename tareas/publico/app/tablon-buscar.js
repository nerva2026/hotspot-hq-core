// El buscador del tablón: qué se puede buscar de una tarea y cuándo coincide con lo escrito.
//
// Se encuentra lo que el tablón enseña, tal como lo enseña y tal como se escribe al crear una tarea:
//   · el título, las notas y las subtareas;
//   · las etiquetas, con y sin almohadilla: «bolos» y «#bolos» (con ella, solo la etiqueta, no un título que lo diga);
//   · las personas, para quién es y quién la pidió, con y sin arroba: «víctor» y «@víctor» (también quien ya ha salido
//     del crew y sigue en la tarea); y «sin asignar» la que no es de nadie;
//   · la prioridad, con y sin admiración: «urgente», «!alta»… y «sin prioridad»;
//   · el estado: «por hacer», «en marcha», «esperando», «hecho» (o «hecha»).
// Se buscan todas las palabras escritas, en cualquier orden y sin fijarse en tildes ni mayúsculas, como en el libro
// de cuentas (libro-buscar.js).
//
// Lógica sola, sin página (los nombres de las personas se le pasan), para poder probarla en Node: pruebas/tablon.mjs.

import { normalizar, ESTADOS, PRIORIDADES } from "./util.js";

// Lo escrito en el buscador → las palabras que hay que encontrar.
export function prepararBusqueda(texto) {
    return normalizar(texto).split(/\s+/).filter(Boolean);
}

// Todo lo que se puede buscar de una tarea, en una línea ya normalizada. «nombre(id)» da el de cada persona.
export function loBuscable(t, { nombre = () => "" } = {}) {
    const personas = [...new Set([...(t.responsables || []), t.pedidoPor].filter(Boolean))].map(nombre).filter(Boolean);
    const prioridad = PRIORIDADES.find((p) => p.id === t.prioridad);
    const estado = ESTADOS.find((e) => e.id === t.estado);
    const partes = [
        t.titulo,
        t.notas,
        ...(t.subtareas || []).map((s) => s.texto),
        ...(t.etiquetas || []).map((e) => `${e} #${e}`),
        ...personas.map((n) => `${n} @${n}`),
        (t.responsables || []).length ? "" : "sin asignar",
        prioridad ? `prioridad ${prioridad.nombre} !${prioridad.id}` : "sin prioridad",
        estado ? estado.nombre : "",
        t.estado === "hecho" ? "hecha" : "",
    ];
    return normalizar(partes.filter(Boolean).join(" ")).replace(/\s+/g, " ");
}

// ¿Coincide la tarea con lo escrito? Con el buscador vacío, sí. «consulta» es el texto o, para no prepararlo con cada
// tarea, lo que devuelve prepararBusqueda().
export function coincide(t, consulta, ayudas) {
    const palabras = Array.isArray(consulta) ? consulta : prepararBusqueda(consulta);
    if (!palabras.length) return true;
    const buscable = loBuscable(t, ayudas);
    return palabras.every((p) => buscable.includes(p));
}
