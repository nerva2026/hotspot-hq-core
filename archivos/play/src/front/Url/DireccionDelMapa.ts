/*
 * HOT SPOT S.L. · la dirección entera de algo que el script del mapa pide con una ruta: el icono de un botón de la
 * barra (`WA.ui.actionBar.addButton({ imageSrc })`) o la página de una ventana (`WA.ui.modal.openModal({ src })`).
 *
 * WorkAdventure la resolvía contra `currentStartedRoom.mapUrl`, que solo existe cuando la sala se carga por la
 * dirección de su `.tmj`. En la oficina de verdad el mapa llega del map-storage por su `.wam`, y ahí `mapUrl` no existe:
 * con una ruta relativa, `new URL()` daba «Invalid URL» en mitad de la actualización del almacén de botones y la barra
 * se quedaba sin los botones del mapa (pasó en la v0.4.0).
 *
 * Ahora se resuelve contra la dirección del mapa de verdad de la escena (`mapUrlFile`, la misma que usan los sonidos
 * en GameScene: existe también con `.wam`) y, si no la hay, contra la de la sala. Y si aun así no sale, no revienta:
 * avisa en la consola y devuelve `undefined`, para que quien llama siga sin esa dirección (un botón, sin icono).
 */
import { gameManager } from "../Phaser/Game/GameManager";

/** Las direcciones contra las que se puede resolver una ruta del mapa, de mejor a peor. Nunca falla. */
function basesDelMapa(): string[] {
    const bases: string[] = [];
    try {
        // `mapUrlFile` no tiene valor hasta que se sabe qué mapa es (con `.wam`, hasta que se lee): de ahí el «?»
        const deLaEscena: string | undefined = gameManager.getCurrentGameScene().mapUrlFile;
        if (deLaEscena) bases.push(deLaEscena);
    } catch {
        // todavía no hay escena
    }
    try {
        const deLaSala = gameManager.currentStartedRoom.mapUrl;
        if (deLaSala) bases.push(deLaSala);
    } catch {
        // todavía no hay sala
    }
    return bases;
}

/**
 * La dirección entera de `ruta` (relativa al mapa, o ya entera), o `undefined` si no se puede saber.
 * `paraQue` solo sirve para que el aviso de la consola diga de qué era («El icono del botón «musica»»).
 */
export function direccionDesdeElMapa(ruta: string, paraQue: string): string | undefined {
    // Sin base (la última) solo sale una dirección que ya viene entera: la que piden los mapas de la oficina.
    for (const base of [...basesDelMapa(), undefined]) {
        try {
            return new URL(ruta, base).toString();
        } catch {
            // con esta base no sale: se prueba la siguiente
        }
    }
    console.warn(`[HOT SPOT] ${paraQue}: no se ha podido saber su dirección («${ruta}»). Se sigue sin ella.`);
    return undefined;
}
