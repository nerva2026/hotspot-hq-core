/**
 * HOT SPOT S.L. · versión de la oficina y novedades que se enseñan al entrar.
 *
 * Es lo único que hay que tocar para sacar una versión nueva:
 *   1. VERSION: lo que pone la etiqueta de abajo a la izquierda. Además es la «clave» del aviso: a cada
 *      persona le sale una sola vez por cada valor distinto de VERSION (se apunta en su navegador).
 *   2. TITULO y NOVEDADES: el texto del aviso (frases cortas, una por línea).
 *
 * El componente que lo dibuja es Novedades.svelte (parche 06).
 */

export const VERSION = "v0.3.0-alpha";

export const TITULO = "¡Bienvenido a la v0.3.0!";

export const NOVEDADES: string[] = [
    "Sentarse en sillas y sofás, y bailar (botón «Bailar» o la pista del estudio).",
    "El estudio de música: escuchar juntos lo que pone el DJ desde su Spotify.",
    "El archivo de documentos.",
    "La pizarra de la sala de reuniones.",
    "El libro de cuentas, con su propia pantalla (Excel y CSV).",
    "Los cumpleaños: aviso del día y tartas en el calendario.",
    "El muñeco se guarda con tu cuenta.",
];
