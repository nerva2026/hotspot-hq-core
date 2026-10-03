// Las capas: lo que se abre ENCIMA de la pantalla (una ventana, la ficha de una tarea, un menú). Un solo sitio para lo
// que todas tienen que hacer igual, en las cinco pantallas:
//
//   · El foco se queda dentro. Con el tabulador (y Mayús+Tab) se da la vuelta dentro de la capa de arriba; nunca pasa
//     a lo de detrás ni se sale de la página. Al cerrar, vuelve a donde estaba.
//   · Debajo de una capa «modal» (una ventana) lo demás no se puede pulsar ni enfocar («inert»). La ficha de una tarea
//     no es modal: al lado sigue el tablón, y pulsar otra tarea la abre.
//   · «Atrás» (el botón del navegador, el del teléfono o el gesto) cierra la capa de arriba en vez de sacar de la
//     pantalla. Para eso, mientras hay algo abierto, hay UNA entrada de más en el historial (el «centinela»); al cerrar
//     con el botón o con Escape se retira sola (history.back()), para no dejar el historial sucio.
//
// Las direcciones no se construyen aquí: el centinela conserva la que hubiera (con su ?solo=1) o lleva la que le dé
// la capa («direccion», que quien la abre saca de conSolo(): la ficha pone «?tarea=…»).
//
// La lógica del historial (crearAtras) y la de la vuelta del tabulador (vueltaDeTab) no tocan la página, para poder
// probarlas en Node: pruebas/tablon.mjs.

export const MARCA = "hsCapa";

// La dirección con la que se cargó la página, antes de que este módulo toque el historial (ver el final del archivo).
export const BUSQUEDA_AL_CARGAR = typeof location === "undefined" ? "" : location.search;

// ---------- el tabulador ----------

// Con «total» paradas en la capa y el foco en la número «indice» (-1: en ninguna), ¿adónde va el tabulador?
// Devuelve el número de la parada, -1 si no hay ninguna (el foco se queda en la propia capa) o null si no hay que
// hacer nada especial (el navegador pasa a la siguiente, que está dentro). «dentro»: el foco está dentro de la capa.
export function vueltaDeTab({ total, indice, atras = false, dentro = true }) {
    if (!total) return -1;
    if (indice < 0) return dentro ? null : atras ? total - 1 : 0;
    if (atras && indice === 0) return total - 1;
    if (!atras && indice === total - 1) return 0;
    return null;
}

// ---------- «atrás» ----------

const marcado = (estado) => Boolean(estado && typeof estado === "object" && estado[MARCA]);

// historial: { state, length, pushState, replaceState, back, direccion() } (el del navegador, o uno de mentira);
// capas(): las capas abiertas que cuentan para «atrás», de abajo arriba (cada una puede llevar «direccion»);
// cerrarArriba(): cierra la de arriba (puede no dejarse: unas notas en conflicto).
// Devuelve { alCambiar, alVolver }: «alCambiar» se llama cuando se abre o se cierra una capa y «alVolver(estado)», con
// cada «popstate»; esta devuelve true si el «atrás» era cosa de las capas.
export function crearAtras({ historial, capas, cerrarArriba }) {
    let enCentinela = false; // la entrada de ahora es el centinela
    let retirando = false; // hemos pedido history.back() y aún no ha llegado
    let largo = 0; // lo que medía el historial justo después de poner el centinela
    let base; // la dirección de debajo del centinela

    const direccionDeArriba = () => {
        const lista = capas();
        for (let i = lista.length - 1; i >= 0; i--) if (lista[i].direccion) return lista[i].direccion;
        return undefined;
    };

    // Hay capas: que haya centinela, y con la dirección de la de arriba.
    function poner() {
        const direccion = direccionDeArriba();
        if (!enCentinela) {
            base = historial.direccion();
            // lo que ya dijera esa entrada se conserva (el archivo guarda ahí qué documento está abierto)
            historial.pushState({ ...(historial.state && typeof historial.state === "object" ? historial.state : {}), [MARCA]: true }, "", direccion ?? base);
            enCentinela = true;
            largo = historial.length;
        } else {
            const quiere = direccion ?? base;
            if (quiere !== undefined && quiere !== historial.direccion()) historial.replaceState(historial.state, "", quiere);
        }
    }

    // No queda ninguna: fuera el centinela. Solo si sigue siendo la entrada de ahora y nadie ha apuntado nada después
    // (dentro de la oficina el historial es el de toda la pestaña): si no, volver atrás sacaría de otra cosa.
    function retirar() {
        if (!enCentinela || retirando) return;
        if (!marcado(historial.state)) {
            enCentinela = false;
            return;
        }
        if (historial.length !== largo) {
            enCentinela = false;
            const { [MARCA]: _fuera, ...resto } = historial.state;
            historial.replaceState(Object.keys(resto).length ? resto : null, "", base ?? historial.direccion());
            return;
        }
        retirando = true;
        historial.back();
    }

    function alCambiar() {
        if (retirando) return; // cuando llegue nuestro «atrás» se pone lo que haga falta
        if (capas().length) poner();
        else retirar();
    }

    function alVolver(estado) {
        if (retirando) {
            // nuestro propio «atrás», al cerrar con el botón; si mientras tanto se ha abierto otra capa, su centinela
            retirando = false;
            enCentinela = marcado(estado);
            if (capas().length) poner();
            return true;
        }
        if (enCentinela) {
            // «atrás» de la persona con algo abierto: se cierra lo de arriba
            enCentinela = marcado(estado);
            if (!capas().length) return false;
            cerrarArriba();
            if (capas().length) poner(); // no se ha dejado cerrar, o quedan más debajo
            return true;
        }
        if (marcado(estado)) {
            // se ha llegado (con «adelante») a un centinela viejo
            enCentinela = true;
            largo = historial.length;
            base = undefined;
            if (!capas().length) retirar(); // no hay nada que enseñar ahí: se vuelve
            return true;
        }
        return false;
    }

    // La página se ha cargado sobre un centinela (se recargó con algo abierto): se retira ya.
    function alCargar() {
        if (!marcado(historial.state)) return;
        enCentinela = true;
        largo = historial.length;
        base = undefined;
        if (!capas().length) retirar();
    }

    return { alCambiar, alVolver, alCargar, estado: () => ({ enCentinela, retirando }) };
}

// ---------- las capas de esta página ----------

const pila = []; // de abajo arriba
let atras = null;

export const hayCapas = () => pila.length > 0;

const PARADAS = "a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function seVe(el) {
    return Boolean(el && el.isConnected && !el.hidden && el.getClientRects().length && !el.closest("[inert]"));
}

function paradas(el) {
    return [...el.querySelectorAll(PARADAS)].filter((x) => seVe(x) && getComputedStyle(x).visibility !== "hidden");
}

// Lo de detrás de la capa modal de más arriba, inerte (y solo lo que hayamos puesto nosotros se vuelve a activar).
function actualizarInertes() {
    if (typeof document === "undefined" || !document.body) return;
    let i = pila.length - 1;
    while (i >= 0 && !pila[i].modal) i--;
    const libres = i >= 0 ? pila.slice(i).map((c) => c.el) : null;
    for (const hijo of document.body.children) {
        const debe = Boolean(libres) && !libres.some((el) => el === hijo || hijo.contains(el)) && !hijo.matches(".avisos, .aviso-conexion, .confeti, script, style, link");
        if (debe && !hijo.hasAttribute("inert")) {
            hijo.setAttribute("inert", "");
            hijo.dataset.inertePorCapa = "1";
        } else if (!debe && hijo.dataset.inertePorCapa) {
            hijo.removeAttribute("inert");
            delete hijo.dataset.inertePorCapa;
        }
    }
}

// Abre una capa. «el»: su elemento (el foco no sale de él); «cerrar»: cómo se cierra desde fuera (con «atrás»);
// «modal»: lo de detrás queda inerte; «conAtras»: «atrás» la cierra (un menú no: se cierra con la capa de debajo);
// «direccion»: la que enseña la barra del navegador mientras está abierta (ya pasada por conSolo()).
// Devuelve la capa, con «quitar()» para cuando se cierre.
export function abrirCapa({ el, cerrar, modal = false, conAtras = true, direccion }) {
    const activo = typeof document === "undefined" ? null : document.activeElement;
    const capa = { el, cerrar, modal, conAtras, direccion, volverA: activo && activo !== document.body ? activo : null };
    capa.quitar = (opciones) => quitar(capa, opciones);
    if (el && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1"); // para dejarle el foco si no tiene dónde pararse
    pila.push(capa);
    actualizarInertes();
    atras?.alCambiar();
    return capa;
}

// «devolverFoco»: false si quien cierra ya lo pone donde quiere. «alternativa()»: adónde va el foco si lo que lo
// tenía al abrir ya no está (el tablón se repinta mientras la ficha está abierta).
function quitar(capa, { devolverFoco = true, alternativa } = {}) {
    const i = pila.indexOf(capa);
    if (i < 0) return;
    pila.splice(i, 1);
    actualizarInertes();
    atras?.alCambiar();
    if (!devolverFoco || typeof document === "undefined") return;
    const activo = document.activeElement;
    // Solo si el foco estaba en la capa (o se ha quedado sin sitio al quitarla): si ya está en otra cosa, no se toca.
    if (activo && activo !== document.body && activo.isConnected && !capa.el.contains(activo)) return;
    for (const destino of [capa.volverA, alternativa?.()]) {
        if (!seVe(destino) || typeof destino.focus !== "function") continue;
        destino.focus({ preventScroll: true });
        if (document.activeElement === destino) return; // si no se ha dejado (no se puede enfocar), el siguiente
    }
}

// «Atrás»: la capa de arriba que cuenta, con lo que tenga encima (un menú abierto sobre ella).
function cerrarArriba() {
    let i = pila.length - 1;
    while (i >= 0 && !pila[i].conAtras) i--;
    if (i < 0) return;
    for (const capa of pila.slice(i).reverse()) {
        capa.cerrar();
        if (pila.includes(capa)) return; // no se ha dejado cerrar
    }
}

function alTabular(e) {
    if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey || !pila.length) return;
    const capa = pila[pila.length - 1];
    if (!capa.el?.isConnected) return;
    const lista = paradas(capa.el);
    const activo = document.activeElement;
    const destino = vueltaDeTab({ total: lista.length, indice: lista.indexOf(activo), atras: e.shiftKey, dentro: activo !== capa.el && capa.el.contains(activo) });
    if (destino === null) return;
    e.preventDefault();
    (destino < 0 ? capa.el : lista[destino]).focus();
}

if (typeof window !== "undefined" && typeof document !== "undefined" && window.history) {
    // El historial de verdad. Aquí no se construye ninguna dirección: la del centinela es la que hay o la de la capa.
    const historial = {
        get state() {
            return window.history.state;
        },
        get length() {
            return window.history.length;
        },
        direccion: () => location.pathname + location.search + location.hash,
        pushState: (estado, titulo, direccion) => window.history.pushState(estado, titulo, direccion),
        replaceState: (estado, titulo, direccion) => window.history.replaceState(estado, titulo, direccion),
        back: () => window.history.back(),
    };
    atras = crearAtras({ historial, capas: () => pila.filter((c) => c.conAtras), cerrarArriba });
    window.addEventListener("popstate", (e) => atras.alVolver(e.state));
    document.addEventListener("keydown", alTabular, true);
    atras.alCargar();
}
