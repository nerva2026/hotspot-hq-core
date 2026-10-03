// Guardado retrasado de un texto que se va escribiendo (las notas de una tarea, el texto de una nota de la pizarra).
//
// Se guarda un rato después de la última letra («espera») y, sin esperar, cuando hace falta: al salir del campo, al
// cerrar la ficha… y al CERRAR O RECARGAR LA PÁGINA, que es cuando antes se perdía la última frase (lo escrito en el
// último segundo). Quien lo usa llama a guardarAlSalir() una vez por pantalla: al esconderse la página
// («visibilitychange») y al irse («pagehide») se manda lo que estuviera esperando, con «alSalir» para que el envío
// sobreviva a la página (fetch con «keepalive», ver api.js).
//
// No se guarda dos veces lo mismo: lo que ya va de camino no se repite, y un texto igual al que tiene el servidor no
// se manda (salir del campo después de que la página se haya escondido no vuelve a guardar). Si hay un guardado de
// camino y se sigue escribiendo, lo nuevo sale cuando ese vuelve. Solo al irse la página («forzar») no se espera:
// lo nuevo sale ya, diciendo que se basa en lo que va de camino; y si lo de camino es justo lo escrito, se repite ese
// mismo texto con un envío que sobreviva a la página (el corriente puede quedarse sin salir; para el servidor,
// recibir otra vez lo que ya tiene no es un cambio).
//
// Lógica sola, sin página (el reloj se le puede pasar), para poder probarla en Node: pruebas/tablon.mjs.

// leer():    el texto que hay escrito ahora.
// enviar(texto, antes, { alSalir }): lo manda y devuelve (una promesa de) «ok», «conflicto» o «error». «antes» es el
//            texto que tendrá el servidor cuando llegue este envío (lo último confirmado o lo que va de camino).
// parado():  mientras devuelva verdadero no se manda nada (unas notas en conflicto, hasta que se elija).
// base:      el texto que tiene el servidor al empezar (si no se dice, lo que haya escrito en ese momento).
export function guardadoRetrasado({ leer, enviar, espera = 800, parado = () => false, base: alEmpezar, reloj = { poner: (fn, ms) => setTimeout(fn, ms), quitar: (t) => clearTimeout(t) } }) {
    let base = alEmpezar === undefined ? leer() : alEmpezar; // lo último que el servidor ha confirmado (o lo que traía)
    let enviado = base; // lo último que se ha mandado: lo que tendrá el servidor cuando llegue todo lo que va de camino
    let enVuelo = 0;
    let temporizador = null;
    let serie = 0;
    let confirmada = 0;
    let conPrisa = false; // la página se ha escondido con un guardado de camino: lo que falte sale en cuanto vuelva

    const quitarEspera = () => {
        if (temporizador === null) return;
        reloj.quitar(temporizador);
        temporizador = null;
    };

    // Guarda ahora, si hay algo que guardar. Devuelve el resultado del envío, o null si no se ha mandado nada.
    // «alSalir»: la página se esconde o se va (el envío tiene que sobrevivirla). «forzar»: se va de verdad, así que no
    // se espera al que vaya de camino; y si lo de camino es justo lo escrito, se repite (puede que no llegue a salir:
    // al irse la página el navegador corta los envíos corrientes; repetido no hace daño, es el mismo texto).
    async function ya({ alSalir = false, forzar = false } = {}) {
        quitarEspera();
        const texto = leer();
        if (parado()) return null;
        const repetir = forzar && enVuelo > 0 && texto === enviado;
        if (texto === enviado && !repetir) return null; // nada nuevo (o ya va de camino)
        if (enVuelo && !forzar) {
            if (alSalir) conPrisa = true; // en cuanto vuelva el que va de camino, sin esperar otra vez
            return null; // cuando vuelva se manda lo que falte
        }
        const antes = repetir ? base : enviado;
        const numero = ++serie;
        enviado = texto;
        enVuelo += 1;
        let resultado;
        try {
            resultado = await enviar(texto, antes, { alSalir });
        } catch {
            resultado = "error";
        }
        enVuelo -= 1;
        if (resultado === "ok" && numero > confirmada) {
            confirmada = numero;
            base = texto;
        }
        if (!enVuelo) {
            enviado = base; // lo que no haya llegado bien deja de darse por mandado
            const prisa = conPrisa;
            conPrisa = false;
            // Se ha seguido escribiendo mientras tanto: otra vuelta. Tras un fallo no se reintenta solo (se haría sin
            // parar con el servidor caído): lo vuelve a intentar la siguiente letra, reintentar() o el cierre.
            if (resultado === "ok" && leer() !== base && !parado()) {
                if (prisa) ya({ alSalir: true });
                else tocar();
            }
        }
        return resultado;
    }

    // Se ha escrito algo: guardar dentro de «espera» milisegundos (cada letra vuelve a empezar la cuenta).
    function tocar() {
        quitarEspera();
        temporizador = reloj.poner(() => {
            temporizador = null;
            ya();
        }, espera);
    }

    return {
        tocar,
        ya,
        // hay algo esperando su turno
        pendiente: () => temporizador !== null,
        // hay envíos de camino
        enVuelo: () => enVuelo > 0,
        // lo escrito es lo que tiene el servidor y no hay nada a medias: se puede cambiar por lo que llegue de fuera
        limpio: () => temporizador === null && !enVuelo && leer() === base,
        // lo escrito no está guardado y nadie lo va a guardar (falló el envío): hay que reintentar()
        colgado: () => temporizador === null && !enVuelo && !parado() && leer() !== base,
        reintentar: () => {
            if (temporizador === null && !enVuelo && !parado() && leer() !== base) tocar();
        },
        base: () => base,
        // El servidor tiene ahora este texto (ha llegado de fuera, o se ha elegido en un conflicto).
        poner(texto) {
            base = texto;
            if (!enVuelo) enviado = texto;
        },
    };
}

// Lo que hay que guardar al esconderse o irse la página. «pendientes()» devuelve los guardados que puede haber a
// medias (objetos de guardadoRetrasado, o cualquier cosa con ya({ alSalir, forzar })). Al esconderse (cambiar de pestaña
// o de aplicación: en un móvil puede ser la última vez que la página hace algo) se manda lo que esperaba; al irse
// (cerrar, recargar, ir a otra página), además, sin esperar a lo que vaya de camino. Devuelve cómo dejar de escuchar.
export function guardarAlSalir(pendientes, { ventana = globalThis, documento = globalThis.document } = {}) {
    const mandar = (forzar) => {
        for (const g of pendientes()) g?.ya?.({ alSalir: true, forzar });
    };
    const alEsconder = () => {
        if (documento.visibilityState === "hidden") mandar(false);
    };
    const alIrse = () => mandar(true);
    documento.addEventListener("visibilitychange", alEsconder);
    ventana.addEventListener("pagehide", alIrse);
    return () => {
        documento.removeEventListener("visibilitychange", alEsconder);
        ventana.removeEventListener("pagehide", alIrse);
    };
}
