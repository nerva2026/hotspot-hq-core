// Reglas de las tareas: qué campos tienen, qué valores admiten y cómo se crean o cambian.

import crypto from "node:crypto";

export const ESTADOS = ["por-hacer", "en-marcha", "esperando", "hecho"];
export const PRIORIDADES = ["urgente", "alta", "media", "baja"];

const LIMITES = { titulo: 300, notas: 20000, etiqueta: 30, etiquetas: 12, subtarea: 300, subtareas: 100 };

export const nuevoId = (bytes = 8) => crypto.randomBytes(bytes).toString("base64url");

export class ErrorDeDatos extends Error {
    constructor(mensaje) {
        super(mensaje);
        this.estado = 400;
    }
}

const texto = (v, max) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").slice(0, max) : "");
const unaLinea = (v, max) => texto(v, max).replace(/\s+/g, " ").trim();

export function fechaValida(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ErrorDeDatos(`Fecha no válida: ${v}`);
    const [a, m, d] = v.split("-").map(Number);
    const f = new Date(Date.UTC(a, m - 1, d));
    if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) throw new ErrorDeDatos(`Fecha no válida: ${v}`);
    if (a < 2000 || a > 2100) throw new ErrorDeDatos(`Fecha fuera de rango: ${v}`);
    return v;
}

function etiquetas(v) {
    if (!Array.isArray(v)) throw new ErrorDeDatos("Las etiquetas deben ser una lista");
    const vistas = new Set();
    const salida = [];
    for (const e of v) {
        const limpia = unaLinea(e, LIMITES.etiqueta).replace(/^#+/, "").toLowerCase();
        if (!limpia || vistas.has(limpia)) continue;
        vistas.add(limpia);
        salida.push(limpia);
        if (salida.length >= LIMITES.etiquetas) break;
    }
    return salida;
}

function subtareas(v) {
    if (!Array.isArray(v)) throw new ErrorDeDatos("Las subtareas deben ser una lista");
    return v.slice(0, LIMITES.subtareas).map((s) => ({
        id: typeof s?.id === "string" && /^[\w-]{4,24}$/.test(s.id) ? s.id : nuevoId(6),
        texto: unaLinea(s?.texto, LIMITES.subtarea),
        hecha: Boolean(s?.hecha),
    }));
}

function personas(v, usuarios) {
    if (!Array.isArray(v)) throw new ErrorDeDatos("Los responsables deben ser una lista");
    const ids = new Set(usuarios.map((u) => u.id));
    return [...new Set(v.filter((id) => ids.has(id)))];
}

// Aplica sobre «tarea» los campos de «cambios» que sean válidos. Devuelve la lista de campos cambiados.
export function aplicarCambios(tarea, cambios, usuarios) {
    const cambiados = [];
    const poner = (campo, valor) => {
        if (JSON.stringify(tarea[campo]) === JSON.stringify(valor)) return;
        tarea[campo] = valor;
        cambiados.push(campo);
    };
    if ("titulo" in cambios) poner("titulo", unaLinea(cambios.titulo, LIMITES.titulo));
    if ("notas" in cambios) poner("notas", texto(cambios.notas, LIMITES.notas));
    if ("estado" in cambios) {
        if (!ESTADOS.includes(cambios.estado)) throw new ErrorDeDatos("Estado desconocido");
        poner("estado", cambios.estado);
    }
    if ("prioridad" in cambios) {
        const p = cambios.prioridad || null;
        if (p !== null && !PRIORIDADES.includes(p)) throw new ErrorDeDatos("Prioridad desconocida");
        poner("prioridad", p);
    }
    if ("responsables" in cambios) poner("responsables", personas(cambios.responsables, usuarios));
    if ("pedidoPor" in cambios) {
        const id = cambios.pedidoPor || null;
        poner("pedidoPor", id && usuarios.some((u) => u.id === id) ? id : null);
    }
    if ("inicio" in cambios) poner("inicio", fechaValida(cambios.inicio));
    if ("fin" in cambios) poner("fin", fechaValida(cambios.fin));
    if (tarea.inicio && tarea.fin && tarea.inicio > tarea.fin) {
        // Si el inicio queda después del final, se intercambian (es lo que casi siempre se quería decir).
        [tarea.inicio, tarea.fin] = [tarea.fin, tarea.inicio];
        for (const c of ["inicio", "fin"]) if (!cambiados.includes(c)) cambiados.push(c);
    }
    if ("etiquetas" in cambios) poner("etiquetas", etiquetas(cambios.etiquetas));
    if ("subtareas" in cambios) poner("subtareas", subtareas(cambios.subtareas));
    if ("orden" in cambios) {
        const o = Number(cambios.orden);
        if (!Number.isFinite(o)) throw new ErrorDeDatos("Orden no válido");
        poner("orden", o);
    }
    if (cambiados.includes("estado")) {
        tarea.hechaEl = tarea.estado === "hecho" ? tarea.hechaEl || new Date().toISOString() : null;
    }
    return cambiados;
}

export function crearTarea(entrada, usuario, datos) {
    const ahora = new Date().toISOString();
    const tarea = {
        id: nuevoId(),
        titulo: "",
        notas: "",
        estado: "por-hacer",
        prioridad: null,
        responsables: [],
        pedidoPor: usuario.id,
        inicio: null,
        fin: null,
        etiquetas: [],
        subtareas: [],
        orden: 0,
        creada: ahora,
        creadaPor: usuario.id,
        actualizada: ahora,
        actualizadaPor: usuario.id,
        hechaEl: null,
        borrada: null,
    };
    aplicarCambios(tarea, entrada, datos.usuarios);
    if (!tarea.titulo) throw new ErrorDeDatos("La tarea necesita un título");
    if (!("orden" in entrada)) {
        // Al final de su columna.
        const enColumna = datos.tareas.filter((t) => !t.borrada && t.estado === tarea.estado);
        tarea.orden = enColumna.reduce((max, t) => Math.max(max, t.orden), 0) + 1;
    }
    return tarea;
}

// Lo que ve el navegador de cada tarea (sin campos internos).
export function publica(t) {
    return {
        id: t.id,
        titulo: t.titulo,
        notas: t.notas,
        estado: t.estado,
        prioridad: t.prioridad,
        responsables: t.responsables,
        pedidoPor: t.pedidoPor,
        inicio: t.inicio,
        fin: t.fin,
        etiquetas: t.etiquetas,
        subtareas: t.subtareas,
        orden: t.orden,
        creada: t.creada,
        creadaPor: t.creadaPor,
        actualizada: t.actualizada,
        actualizadaPor: t.actualizadaPor,
        hechaEl: t.hechaEl,
    };
}

export const NOMBRES_ESTADO = { "por-hacer": "Por hacer", "en-marcha": "En marcha", esperando: "Esperando", hecho: "Hecho" };
export const NOMBRES_PRIORIDAD = { urgente: "Urgente", alta: "Alta", media: "Media", baja: "Baja" };
