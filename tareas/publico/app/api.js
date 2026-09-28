// Conversación con el servidor del tablón.

export const CLIENTE = Math.random().toString(36).slice(2, 12);

export class ErrorApi extends Error {
    constructor(mensaje, estado) {
        super(mensaje);
        this.estado = estado;
    }
}

let alPerderSesion = () => {};
export const cuandoSePierdaLaSesion = (fn) => {
    alPerderSesion = fn;
};

async function llamar(metodo, ruta, cuerpo, { binario = false } = {}) {
    const cabeceras = { "x-tablon": "1", "x-cliente": CLIENTE };
    let body;
    if (binario) {
        cabeceras["content-type"] = "application/octet-stream";
        body = cuerpo;
    } else if (cuerpo !== undefined) {
        cabeceras["content-type"] = "application/json";
        body = JSON.stringify(cuerpo);
    }
    let r;
    try {
        r = await fetch(`api/${ruta}`, { method: metodo, headers: cabeceras, body, credentials: "same-origin", cache: "no-store" });
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
        throw new ErrorApi(datos?.error || `Error ${r.status}`, r.status);
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
    crear: (tarea) => llamar("POST", "tareas", tarea),
    cambiar: (id, cambios) => llamar("PATCH", `tareas/${id}`, cambios),
    borrar: (id) => llamar("DELETE", `tareas/${id}`),
    restaurar: (id) => llamar("POST", `tareas/${id}/restaurar`),
    importar: (archivo) => llamar("POST", "importar", archivo, { binario: true }),
};

// Cambios en directo: el servidor avisa de todo lo que hacen los demás.
export function escuchar(alRecibir, alReconectar) {
    let fuente = null;
    let cayo = false;
    let parado = false;
    function abrir() {
        if (parado) return;
        fuente = new EventSource("api/eventos");
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
