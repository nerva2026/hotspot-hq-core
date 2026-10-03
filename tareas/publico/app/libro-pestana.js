// La pestaña «Cuentas» (y «Libro de cuentas» del menú de la cuenta) de las OTRAS cuatro pantallas, en directo.
//
// Solo le sale a quien puede ver el libro: quien tiene parte en el reparto o administra. Eso cambia sin que esa
// persona haga nada (alguien cambia el reparto, o le hace administradora), y la pestaña tiene que aparecer o
// desaparecer sin recargar, igual que la pantalla del libro se abre o se cierra sola (libro-espera.js). El servidor ya
// avisa a todos por el canal general de los cambios del libro («libro») y del crew («usuarios»); a qué persona le
// afecta no va en el aviso: cada pantalla pregunta por lo suyo (GET api/yo) y, si ha cambiado, lo pinta.
//
// seguirAccesoAlLibro() es lógica sola, sin página, para poder probarla en Node (pruebas/libro.mjs);
// pintarPestanaCuentas() es lo único que toca la página.

// Los avisos del canal general que pueden dar o quitar el acceso al libro.
export const AVISOS_QUE_CAMBIAN = ["libro", "usuarios"];

// pedir() → promesa con true o false: ¿puede ver el libro esa persona ahora? (lo dice el servidor);
// tiene() → lo que la pantalla cree ahora; alCambiar(puede) → ha cambiado: que lo apunte y lo pinte.
// Devuelve { alRecibir, comprobar, parar }: «alRecibir(aviso)» se llama con cada aviso del canal y «comprobar()»
// pregunta ya (al reconectar, por si el cambio llegó con el canal caído).
export function seguirAccesoAlLibro({ pedir, tiene, alCambiar, calma = 250 }) {
    let parado = false;
    let pidiendo = false;
    let pendiente = false; // llegó otro aviso mientras se preguntaba: se vuelve a preguntar al acabar
    let reloj = null;

    async function comprobar() {
        if (parado) return;
        if (pidiendo) {
            pendiente = true;
            return;
        }
        pidiendo = true;
        try {
            const puede = Boolean(await pedir());
            if (!parado && puede !== Boolean(tiene())) alCambiar(puede);
        } catch {
            // sin conexión o sin sesión (de eso ya se encarga la pantalla): se volverá a preguntar con el aviso siguiente
        } finally {
            pidiendo = false;
            if (pendiente && !parado) pronto();
            pendiente = false;
        }
    }

    // Varios avisos seguidos (un reparto y sus movimientos) preguntan una sola vez.
    function pronto() {
        if (parado) return;
        clearTimeout(reloj);
        reloj = setTimeout(comprobar, calma);
    }

    return {
        alRecibir(aviso) {
            if (AVISOS_QUE_CAMBIAN.includes(aviso?.tipo)) pronto();
        },
        comprobar,
        parar() {
            parado = true;
            clearTimeout(reloj);
        },
    };
}

// Pone o quita la pestaña «Cuentas» en la fila de pestañas de la cabecera, en su sitio de siempre: la segunda, detrás
// de «Tareas». «href» es la dirección del libro vista desde esa pantalla («libro/» en el tablón, «../libro/» en las
// demás). La fila entera ya lleva «otra-pantalla»: con ?solo=1 sigue sin verse.
export function pintarPestanaCuentas(puede, { href }) {
    const fila = document.querySelector("header.barra nav.pantallas");
    if (!fila) return;
    const esta = [...fila.children].find((el) => el.matches("a.pestana") && el.getAttribute("href") === href);
    if (puede && !esta) {
        const pestana = document.createElement("a");
        pestana.className = "pestana otra-pantalla";
        pestana.href = href;
        pestana.textContent = "Cuentas";
        fila.insertBefore(pestana, fila.children[1] || null);
    } else if (!puede && esta) esta.remove();
}

// Lo que hace cada una de las cuatro pantallas con todo lo anterior. «estado» es el suyo (con «yo», que lleva «libro»),
// «pedir» es api.yo y «href», la dirección del libro vista desde ella. Devuelve { alRecibir, repintar }: «alRecibir» va
// con cada aviso del canal y «repintar», después de volver a pedir los datos (al reconectar ya traen «yo.libro»).
export function pestanaEnDirecto({ pedir, estado, href }) {
    const repintar = () => {
        if (estado.yo && typeof document !== "undefined") pintarPestanaCuentas(Boolean(estado.yo.libro), { href });
    };
    const seguidor = seguirAccesoAlLibro({
        pedir: async () => (await pedir()).yo.libro,
        tiene: () => estado.yo?.libro,
        alCambiar: (puede) => {
            if (!estado.yo) return; // se ha perdido la sesión mientras se preguntaba
            estado.yo.libro = puede;
            repintar();
        },
    });
    return { alRecibir: seguidor.alRecibir, repintar };
}
