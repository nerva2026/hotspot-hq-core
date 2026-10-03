// Conversación con el servidor del tablón (y del libro de cuentas, que usa la misma API).

import { vigilante } from "./conexion.js";

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

export async function llamar(metodo, ruta, cuerpo, { binario = false, nombre, extra } = {}) {
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
    // lo propio de quien pregunta ({ yo: { …, libro } }): ¿puede ver el libro de cuentas ahora? (libro-pestana.js)
    yo: () => llamar("GET", "yo"),
    // la oficina: qué día es hoy allí y de quién es el cumple (hoy, los próximos 30 días y todos los del crew), y el mío
    oficina: () => llamar("GET", "oficina"),
    // la música: el estado de la cabina (el puente de la oficina mira «configurado», quién pincha y «suena»)
    musica: () => llamar("GET", "musica"),
    crear: (tarea) => llamar("POST", "tareas", tarea),
    // «antes»: el texto en el que se basan los cambios de las notas; si ya no es el que hay, el servidor contesta 409
    // (y también si falta y la tarea ya tiene notas). Por eso unas notas no salen nunca de aquí sin «antes».
    cambiar: (id, cambios, antes) => {
        if ("notas" in cambios && typeof antes?.notas !== "string") return Promise.reject(new ErrorApi("Las notas se guardan siempre diciendo en qué texto se basan («antes»).", 400));
        return llamar("PATCH", `tareas/${id}`, antes ? { ...cambios, antes } : cambios);
    },
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
    // archivo de documentos
    archivo: () => llamar("GET", "archivo"),
    buscarEnArchivo: (consulta) => llamar("GET", `archivo/buscar?q=${encodeURIComponent(consulta)}`),
    documento: (id) => llamar("GET", `archivo/documentos/${id}`),
    cambiarDocumento: (id, cambios) => llamar("PATCH", `archivo/documentos/${id}`, cambios),
    borrarDocumento: (id) => llamar("DELETE", `archivo/documentos/${id}`),
    restaurarDocumento: (id) => llamar("POST", `archivo/documentos/${id}/restaurar`),
    eliminarDocumento: (id) => llamar("POST", `archivo/documentos/${id}/eliminar`),
    anadirEnlace: (datos) => llamar("POST", "archivo/enlaces", datos),
};

// Direcciones para descargar (enlaces normales, con la sesión del navegador).
export const direccionApi = (ruta) => new URL(ruta, BASE_API).href;

// Sube un documento al archivo con el progreso (fetch no lo da): el archivo va tal cual y el nombre y la carpeta, en
// cabeceras. Devuelve una promesa con el documento creado; si se le llama a .cancelar(), se rechaza con estado 0.
export function subirDocumento(archivo, { carpeta = "", alProgreso } = {}) {
    const xhr = new XMLHttpRequest();
    const promesa = new Promise((resolver, rechazar) => {
        xhr.open("POST", new URL("archivo/documentos", BASE_API));
        xhr.responseType = "text";
        xhr.setRequestHeader("x-tablon", "1");
        xhr.setRequestHeader("x-cliente", CLIENTE);
        xhr.setRequestHeader("content-type", archivo.type || "application/octet-stream");
        xhr.setRequestHeader("x-nombre", encodeURIComponent(archivo.name));
        if (carpeta) xhr.setRequestHeader("x-carpeta", encodeURIComponent(carpeta));
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) alProgreso?.(e.loaded / e.total);
        };
        xhr.onerror = () => rechazar(new ErrorApi("No hay conexión con el servidor.", 0));
        xhr.onabort = () => rechazar(new ErrorApi("Subida cancelada.", 0));
        xhr.ontimeout = () => rechazar(new ErrorApi("La subida ha tardado demasiado.", 0));
        xhr.onload = () => {
            let datos = null;
            try {
                datos = JSON.parse(xhr.responseText);
            } catch {
                /* respuesta sin cuerpo */
            }
            if (xhr.status >= 200 && xhr.status < 300) return resolver(datos);
            if (xhr.status === 401) alPerderSesion();
            rechazar(new ErrorApi(datos?.error || `Error ${xhr.status}`, xhr.status));
        };
        xhr.send(archivo);
    });
    promesa.cancelar = () => xhr.abort();
    return promesa;
}

// Cambios en directo: el servidor avisa de todo lo que hacen los demás (y, con «pizarra», de lo que pasa en ella).
// «aviso»: que salga la franja «Sin conexión…» (app/conexion.js) mientras el canal esté caído. Todas las pantallas la
// sacan por este mismo código; solo el puente invisible de la oficina no la quiere.
export function escuchar(alRecibir, alReconectar, { pizarra, aviso = true } = {}) {
    let fuente = null;
    let cayo = false;
    let parado = false;
    const franja = aviso ? vigilante() : null;
    function abrir() {
        if (parado) return;
        const direccion = new URL("eventos", BASE_API);
        if (pizarra) direccion.searchParams.set("pizarra", pizarra);
        fuente = new EventSource(direccion);
        fuente.onopen = () => {
            franja?.volvio();
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
            franja?.cayo();
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
        franja?.parar();
        fuente?.close();
    };
}
