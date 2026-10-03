/**
 * HOT SPOT S.L. · versión de la oficina y novedades que se enseñan al entrar.
 *
 * Es lo único que hay que tocar para sacar una versión nueva:
 *   1. VERSION: lo que pone la etiqueta de abajo a la izquierda. Además es la «clave» del aviso: a cada
 *      persona le sale una sola vez por cada valor distinto de VERSION (se apunta en su navegador).
 *   2. TITULO y NOVEDADES: el texto del aviso (frases cortas, una por línea).
 *   3. Una novedad que solo tiene sentido si el servidor lo tiene listo lleva la marca `requiere` (por ahora solo
 *      "musica": que Spotify esté conectado). Novedades.svelte lo pregunta al servidor al abrir el aviso y, si no
 *      contesta a tiempo o no está conectado, esa línea no sale.
 *
 * El componente que lo dibuja es Novedades.svelte (parche 06).
 */

/** Una línea del aviso: el texto solo, o el texto con lo que tiene que estar listo en el servidor para enseñarla. */
export type Novedad = string | { texto: string; requiere: "musica" };

export const VERSION = "v0.4.0";

export const TITULO = "¡Bienvenido a la v0.4.0!";

// Textos PROVISIONAL-v0.3.1: los repasa el equipo antes de publicar.
export const NOVEDADES: Novedad[] = [
    "Teclas nuevas: X para sentarte, B para bailar, H para saludar y V para aplaudir. También mientras hablas con alguien.",
    "Los objetos hacen cosas: la nevera, la cafetera, el timbre, el espejo… y el baño.",
    "Oficina reformada: mesa larga en reuniones, despacho grande, aseos pequeños y luz que cambia con la hora.",
    "La calle y la terraza, terminadas. Ya te puedes sentar en ellas.",
    "Los cumpleaños, en el calendario del hall.",
    { texto: "Música: suena sola al abrir «Música», también en la terraza, y se nota cuando alguien pincha.", requiere: "musica" },
    "Cada personaje enseña solo lo suyo.",
    "Bombo, más gato que nunca.",
    "Letras y números más claros, y burbujas de decir y pensar nuevas.",
];
