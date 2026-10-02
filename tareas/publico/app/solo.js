// «Cada personaje enseña solo lo suyo». Cuando el mapa de la oficina abre una pantalla desde un personaje o un objeto,
// le añade ?solo=1 a la dirección, y esa pantalla (tablón, libro de cuentas, pizarra, archivo o música) esconde lo que
// lleva a las demás: las pestañas de arriba y los enlaces del menú de la cuenta. Sin el parámetro no cambia nada.
//
// Todo está aquí y en una regla de estilo.css: este módulo pone la clase «solo» en <html> y la regla esconde lo que
// lleve la clase «otra-pantalla» (cada pantalla marca así sus enlaces a las demás).
//
// El modo vive solo en la dirección: nada de sessionStorage ni localStorage, que lo compartirían todos los paneles de
// la misma pestaña de la oficina. Por eso las direcciones que una pantalla construye para sí misma (history.pushState
// y replaceState, la vuelta de entrar…) pasan por conSolo(). Lo que se abre en una pestaña nueva sale de la oficina y
// va sin él (sinSolo): allí las pestañas y el menú son la única manera de moverse.
//
// Sin dependencias y sin tocar la página si no la hay, para poder probarlo desde Node.

export const PARAMETRO = "solo";

// ¿Pide el modo solo esta búsqueda («?p=reuniones&solo=1»)? Solo vale «solo=1».
export function pideSolo(busqueda) {
    return new URLSearchParams(busqueda || "").get(PARAMETRO) === "1";
}

// La misma dirección con solo=1 (si «solo») o sin él. Lo demás (la ruta, los otros parámetros tal como vienen y el
// #ancla) se queda como está. Vale para direcciones enteras («https://…») y para rutas («/tareas/archivo/?doc=…»).
export function ponerSolo(direccion, solo) {
    const [sinAncla, ...ancla] = String(direccion).split("#");
    const [ruta, ...busqueda] = sinAncla.split("?");
    const parametros = busqueda
        .join("?")
        .split("&")
        .filter((p) => p && p.split("=")[0] !== PARAMETRO);
    if (solo) parametros.push(`${PARAMETRO}=1`);
    return ruta + (parametros.length ? `?${parametros.join("&")}` : "") + (ancla.length ? `#${ancla.join("#")}` : "");
}

// Esta página, ¿está en modo solo? Se decide una vez, al cargar (la dirección de después lo conserva con conSolo).
let enSolo = false;
try {
    enSolo = pideSolo(location.search);
    document.documentElement.classList.toggle("solo", enSolo);
} catch {
    /* sin página (en las pruebas, desde Node): no hay dirección que mirar ni dónde poner la clase */
}
export const SOLO = enSolo;

// Para las direcciones de esta misma pantalla: conservan el modo en el que está.
export const conSolo = (direccion) => ponerSolo(direccion, SOLO);
// Para lo que se abre en una pestaña nueva, fuera de la oficina: siempre la pantalla de siempre.
export const sinSolo = (direccion) => ponerSolo(direccion, false);
