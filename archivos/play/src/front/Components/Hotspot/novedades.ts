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

export const VERSION = "v0.3.0-alpha";

export const TITULO = "¡Bienvenido a la v0.3.0!";

export const NOVEDADES: Novedad[] = [
    "Sentarse en sillas y sofás, y bailar (botón «Bailar» o la pista del estudio).",
    { texto: "El estudio de música: escuchar juntos lo que pone el DJ desde su Spotify.", requiere: "musica" },
    "El archivo de documentos.",
    "La pizarra de la sala de reuniones.",
    "El libro de cuentas, con su propia pantalla (Excel y CSV).",
    "Los cumpleaños: aviso del día y tartas en el calendario.",
    "El muñeco se guarda con tu cuenta.",
];
