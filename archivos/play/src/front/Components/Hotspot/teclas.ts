/*
 * HOT SPOT S.L. · las teclas de los avisos.
 *
 * En los avisos de la oficina («Pulsa ESPACIO para abrir la nevera», «Pulse ESPACIO o toque aquí…») la palabra ESPACIO
 * sale dibujada como una tecla, igual que las de la pastilla de ayuda del mapa: amarilla, con la letra en tinta y el
 * canto de abajo más oscuro (`.hs-tecla`, en hotspot-retro.css).
 *
 * El texto de un aviso lo pone el mapa o su script: aquí NUNCA se convierte en HTML. Se parte en trozos y cada trozo se
 * pinta como texto; los que son una tecla, dentro de un `<span class="hs-tecla">`:
 *   - en los avisos de abajo (componentes de Svelte), con TextoConTeclas.svelte;
 *   - en el aviso junto al muñeco (un elemento hecho a mano), con ponerTeclas().
 * El texto entero del aviso (`textContent`) es el mismo de antes: solo cambia cómo se ve esa palabra.
 */

/** Un trozo de un aviso: texto corriente o una tecla. */
export interface TrozoDeAviso {
    texto: string;
    tecla: boolean;
}

/** La clase del `<span>` de una tecla. */
export const CLASE_TECLA = "hs-tecla";

/**
 * Lo que se dibuja como una tecla: la palabra ESPACIO tal cual, en mayúsculas y entera («espacio» y «ESPACIOS», no).
 * Va entre paréntesis para que `split()` devuelva también las teclas: los trozos impares.
 */
const TECLAS = /\b(ESPACIO)\b/;

/**
 * Parte el texto de un aviso en trozos, por orden: «Pulsa ESPACIO para…» → «Pulsa », [ESPACIO], « para…».
 * Juntos son el mismo texto, letra por letra. Lo que no es un texto (un mapa puede traer un número en una propiedad) se
 * escribe como lo escribía la plantilla: tal cual, y nada si no hay nada.
 */
export function trozosConTeclas(aviso: unknown): TrozoDeAviso[] {
    const texto = typeof aviso === "string" ? aviso : aviso === undefined || aviso === null ? "" : String(aviso);
    return texto
        .split(TECLAS)
        .map((trozo, i) => ({ texto: trozo, tecla: i % 2 === 1 }))
        .filter((trozo) => trozo.texto !== "");
}

/**
 * Lo mismo en un elemento ya montado (el aviso junto al muñeco): dentro de `raiz`, cada ESPACIO que haya en un texto
 * pasa a ir en su `<span class="hs-tecla">`. Solo toca nodos de texto y solo crea elementos con `textContent`: lo que
 * hubiera alrededor (negritas, enlaces, las insignias de WorkAdventure) se queda como estaba.
 */
export function ponerTeclas(raiz: HTMLElement): void {
    const paseo = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    const textos: Text[] = [];
    for (let nodo = paseo.nextNode(); nodo !== null; nodo = paseo.nextNode()) {
        // ni lo que va dentro de un dibujo (el <text> de un SVG) ni lo que ya es una tecla
        if (!(nodo instanceof Text) || !(nodo.parentElement instanceof HTMLElement)) continue;
        if (nodo.parentElement.closest(`.${CLASE_TECLA}`)) continue;
        textos.push(nodo);
    }
    for (const nodo of textos) {
        const trozos = trozosConTeclas(nodo.data);
        if (!trozos.some((trozo) => trozo.tecla)) continue;
        const piezas = document.createDocumentFragment();
        for (const trozo of trozos) {
            if (!trozo.tecla) {
                piezas.appendChild(document.createTextNode(trozo.texto));
                continue;
            }
            const tecla = document.createElement("span");
            tecla.className = CLASE_TECLA;
            tecla.textContent = trozo.texto;
            piezas.appendChild(tecla);
        }
        nodo.replaceWith(piezas);
    }
}
