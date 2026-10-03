/**
 * HOT SPOT S.L. · versión de la oficina, novedades que se enseñan al entrar e histórico de versiones.
 *
 * Es lo único que hay que tocar para sacar una versión nueva:
 *   1. VERSION: lo que pone la etiqueta de abajo a la izquierda.
 *   2. VERSION_DEL_AVISO: la versión de la que habla el aviso. Es su «clave»: a cada persona le sale una sola vez por
 *      cada valor distinto (se apunta en su navegador). Lo normal es que sea la misma que VERSION; si una versión no
 *      tiene nada que contar, se deja la anterior y el aviso no vuelve a salir.
 *   3. TITULO y NOVEDADES: el texto del aviso (frases cortas, una por línea).
 *   4. HISTORICO: al sacar una versión nueva, lo que eran FECHA y NOVEDADES de la anterior se pasa aquí, ARRIBA del todo
 *      (de la más nueva a la más vieja). El aviso lo enseña debajo, plegado, versión por versión.
 *   5. Una novedad que solo tiene sentido si el servidor lo tiene listo lleva la marca `requiere` (por ahora solo
 *      "musica": que Spotify esté conectado). Novedades.svelte lo pregunta al servidor al abrir el aviso y, si no
 *      contesta a tiempo o no está conectado, esa línea no sale (tampoco en el histórico).
 *
 * El componente que lo dibuja es Novedades.svelte (parche 06).
 */

/** Una línea del aviso: el texto solo, o el texto con lo que tiene que estar listo en el servidor para enseñarla. */
export type Novedad = string | { texto: string; requiere: "musica" };

/** Una versión del histórico: su número, el día que se publicó y lo que traía. */
export type VersionAnterior = { version: string; fecha: string; novedades: Novedad[] };

export const VERSION = "v0.4.1";

/** La versión de la que habla el aviso de bienvenida (ver arriba). */
export const VERSION_DEL_AVISO = "v0.4.1";

/** El día que se publicó (como se escribe en el histórico). */
export const FECHA = "3 oct 2026";

export const TITULO = "¡Bienvenido a la v0.4.1!";

// Textos PROVISIONAL-v0.3.1: los repasa el equipo antes de publicar.
export const NOVEDADES: Novedad[] = [
    "Vuelven los botones de la barra de arriba (Saludar, Bailar, Sentarse…): en la v0.4.0 no salían.",
    "La letra e, redibujada: se lee mejor.",
    "ESPACIO sale resaltado en amarillo en los avisos.",
    "En la calle ya no te sales por los bordes.",
    "Las teclas de ayuda ya no quedan tapadas en ventanas estrechas.",
    "El retrete libre ya no dice «Ocupado».",
    "A los flight cases se vuelve a llegar por arriba.",
];

/** Lo que pone encima del histórico. */
export const TITULO_DEL_HISTORICO = "Histórico de versiones"; // PROVISIONAL-v0.3.1

/**
 * Las versiones anteriores, de la más nueva a la más vieja, con lo que decía su aviso cuando salieron (las fechas son
 * las de publicación). De antes de la v0.3.0 no queda constancia en el repositorio: si el equipo quiere añadirlas, van
 * al final.
 */
export const HISTORICO: VersionAnterior[] = [
    {
        version: "v0.4.0",
        fecha: "3 oct 2026",
        // Textos PROVISIONAL-v0.3.1: los repasa el equipo antes de publicar.
        novedades: [
            "Teclas nuevas: X para sentarte, B para bailar, H para saludar y V para aplaudir. También mientras hablas con alguien.",
            "Los objetos hacen cosas: la nevera, la cafetera, el timbre, el espejo… y el baño.",
            "Oficina reformada: mesa larga en reuniones, despacho grande, aseos pequeños y luz que cambia con la hora.",
            "La calle y la terraza, terminadas. Ya te puedes sentar en ellas.",
            "Los cumpleaños, en el calendario del hall.",
            { texto: "Música: suena sola al abrir «Música», también en la terraza, y se nota cuando alguien pincha.", requiere: "musica" },
            "Cada personaje enseña solo lo suyo.",
            "Bombo, más gato que nunca.",
            "Letras y números más claros, y burbujas de decir y pensar nuevas.",
        ],
    },
    {
        version: "v0.3.0",
        fecha: "2 oct 2026",
        // (los textos del aviso de la v0.3.0, tal cual salieron)
        novedades: [
            "Sentarse en sillas y sofás, y bailar (botón «Bailar» o la pista del estudio).",
            { texto: "El estudio de música: escuchar juntos lo que pone el DJ desde su Spotify.", requiere: "musica" },
            "El archivo de documentos.",
            "La pizarra de la sala de reuniones.",
            "El libro de cuentas, con su propia pantalla (Excel y CSV).",
            "Los cumpleaños: aviso del día y tartas en el calendario.",
            "El muñeco se guarda con tu cuenta.",
        ],
    },
];
