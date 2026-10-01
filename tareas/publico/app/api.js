// Conversación con el servidor del tablón (y del libro de cuentas, que usa la misma API).

// La API está en /tareas/api/ vista desde cualquier página (el tablón en /tareas/, el libro en /tareas/libro/…).
export const BASE_API = new URL("../api/", import.meta.url);

export const CLIENTE = Math.random().toString(36).slice(2, 12);

export class ErrorApi extends Error {
    constructor(mensaje, estado, datos = null) {
        super(mensaje);
        this.estado = estado;
        this.datos = datos; // lo que contestó el servidor (un 409 trae la tarea tal como está ahora)
    }
}

let alPerderSesion = () => {};
export const cuandoSePierdaLaSesion = (fn) => {
    alPerderSesion = fn;
};

async function llamar(metodo, ruta, cuerpo, { binario = false, nombre, extra } = {}) {
    const cabeceras = { "x-tablon": "1", "x-cliente": CLIENTE, ...extra };
    let body;
    if (binario) {
        cabeceras["content-type"] = cuerpo?.type || "application/octet-stream";
        if (nombre) cabeceras["x-nombre"] = encodeURIComponent(nombre);
        body = cuerpo;
    } else if (cuerpo !== undefined) {
        cabeceras["content-type"] = "application/json";
        body = JSON.stringify(cuerpo);
    }
    let r;
    try {
        r = await fetch(new URL(ruta, BASE_API), { method: metodo, headers: cabeceras, body, credentials: "same-origin", cache: "no-store" });
    } catch {
        throw new ErrorApi("No hay conexión con el servidor.", 0);
    }
    let datos = null;
    try {
        datos = await r.json();
    } catch {
        /* respuesta sin cuerpo */
    }
    if (!r.ok) {
        if (r.status === 401 && ruta !== "entrar") alPerderSesion();
        throw new ErrorApi(datos?.error || `Error ${r.status}`, r.status, datos);
    }
    return datos;
}

export const api = {
    datos: () => llamar("GET", "datos"),
    entrar: (nombre, clave) => llamar("POST", "entrar", { nombre, clave }),
    salir: () => llamar("POST", "salir"),
    invitacion: (codigo) => llamar("GET", `invitacion?codigo=${encodeURIComponent(codigo)}`),
    alta: (datos) => llamar("POST", "alta", datos),
    invitar: (datos) => llamar("POST", "invitar", datos),
    acceso: () => llamar("GET", "acceso"),
    crew: () => llamar("GET", "crew"),
    anadirCrew: (datos) => llamar("POST", "crew", datos),
    cambiarCrew: (id, datos) => llamar("PATCH", `crew/${id}`, datos),
    cambiarYo: (datos) => llamar("PATCH", "yo", datos),
    // la oficina: qué día es hoy allí y de quién es el cumple (hoy y los próximos 30 días)
    oficina: () => llamar("GET", "oficina"),
    crear: (tarea) => llamar("POST", "tareas", tarea),
    // «antes»: el texto en el que se basan los cambios de las notas; si ya no es el que hay, el servidor contesta 409.
    cambiar: (id, cambios, antes) => llamar("PATCH", `tareas/${id}`, antes ? { ...cambios, antes } : cambios),
    borrar: (id) => llamar("DELETE", `tareas/${id}`),
    restaurar: (id) => llamar("POST", `tareas/${id}/restaurar`),
    importar: (archivo) => llamar("POST", "importar", archivo, { binario: true }),
    // libro de cuentas
    libro: () => llamar("GET", "libro"),
    apuntar: (movimiento) => llamar("POST", "libro/movimientos", movimiento),
    cambiarMovimiento: (id, cambios) => llamar("PATCH", `libro/movimientos/${id}`, cambios),
    borrarMovimiento: (id) => llamar("DELETE", `libro/movimientos/${id}`),
    restaurarMovimiento: (id) => llamar("POST", `libro/movimientos/${id}/restaurar`),
    subirTique: (id, archivo, nombre) => llamar("POST", `libro/movimientos/${id}/tique`, archivo, { binario: true, nombre }),
    quitarTique: (id) => llamar("DELETE", `libro/movimientos/${id}/tique`),
    ajustesLibro: (cambios) => llamar("PATCH", "libro/ajustes", cambios),
    importarLibro: (archivo) => llamar("POST", "libro/importar", archivo, { binario: true }),
    // pizarras
    pizarra: (id) => llamar("GET", `pizarras/${id}`),
    ponerEnPizarra: (id, elemento) => llamar("POST", `pizarras/${id}/elementos`, elemento),
    cambiarEnPizarra: (id, idElemento, cambios) => llamar("PATCH", `pizarras/${id}/elementos/${idElemento}`, cambios),
    quitarDePizarra: (id, ids) => llamar("POST", `pizarras/${id}/quitar`, { ids }),
    restaurarEnPizarra: (id, ids) => llamar("POST", `pizarras/${id}/restaurar`, { ids }),
    vaciarPizarra: (id) => llamar("POST", `pizarras/${id}/vaciar`),
    recuperarPizarra: (id) => llamar("POST", `pizarras/${id}/recuperar`),
    fotoEnPizarra: (id, archivo, { id: idElemento, x, y, ancho, alto }) =>
        llamar("POST", `pizarras/${id}/imagenes`, archivo, { binario: true, extra: { "x-id": idElemento, "x-x": String(x), "x-y": String(y), "x-ancho": String(ancho), "x-alto": String(alto) } }),
    vivoEnPizarra: (id, datos) => llamar("POST", `pizarras/${id}/vivo`, datos),
};

// Direcciones para descargar (enlaces normales, con la sesión del navegador).
export const direccionApi = (ruta) => new URL(ruta, BASE_API).href;

// Cambios en directo: el servidor avisa de todo lo que hacen los demás (y, con «pizarra», de lo que pasa en ella).
export function escuchar(alRecibir, alReconectar, { pizarra } = {}) {
    let fuente = null;
    let cayo = false;
    let parado = false;
    function abrir() {
        if (parado) return;
        const direccion = new URL("eventos", BASE_API);
        if (pizarra) direccion.searchParams.set("pizarra", pizarra);
        fuente = new EventSource(direccion);
        fuente.onopen = () => {
            if (cayo) alReconectar();
            cayo = false;
        };
        fuente.onmessage = (e) => {
            try {
                const ev = JSON.parse(e.data);
                if (ev.origen && ev.origen === CLIENTE) return; // lo he hecho yo
                alRecibir(ev);
            } catch {
                /* mensaje raro: se ignora */
            }
        };
        fuente.onerror = () => {
            cayo = true;
            // El navegador reintenta solo; si se rinde (p. ej. el servidor se está actualizando), se vuelve
            // a pedir todo (así, si la sesión ha caducado, se pasa a la pantalla de entrada) y se reabre.
            if (fuente.readyState === EventSource.CLOSED && !parado) {
                setTimeout(async () => {
                    if (parado) return;
                    await alReconectar();
                    setTimeout(abrir, 2000);
                }, 1000);
            }
        };
    }
    abrir();
    return () => {
        parado = true;
        fuente?.close();
    };
}
