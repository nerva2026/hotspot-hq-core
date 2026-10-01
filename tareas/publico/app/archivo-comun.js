// Piezas comunes de la pantalla del archivo (la lista y el visor): tipos de documento, tamaños y el texto sin
// tildes ni mayúsculas para buscar y resaltar.

import { h } from "./util.js";

const TIPOS = {
    md: { nombre: "Markdown", corto: "MD", color: "#3b82c4" },
    txt: { nombre: "Texto", corto: "TXT", color: "#7a716a" },
    pdf: { nombre: "PDF", corto: "PDF", color: "#c4461f" },
    imagen: { nombre: "Foto", corto: "FOTO", color: "#2f8a50" },
    docx: { nombre: "Word", corto: "DOC", color: "#2b5fa8" },
    enlace: { nombre: "Enlace", corto: "WEB", color: "#8e5cc4" },
};
// Los enlaces de Google llevan su propio icono (el servicio lo pone el servidor).
const SERVICIOS = {
    "Google Docs": { corto: "DOCS", color: "#3b82c4" },
    "Hojas de Google": { corto: "HOJA", color: "#2f8a50" },
    "Presentaciones de Google": { corto: "SLIDE", color: "#ffd84a", tinta: "#1c1715" },
    "Google Drive": { corto: "DRIVE", color: "#8e5cc4" },
    "Carpeta de Google Drive": { corto: "DRIVE", color: "#8e5cc4" },
};

export function tipoDe(doc) {
    const base = TIPOS[doc?.tipo] || TIPOS.txt;
    if (doc?.tipo === "enlace" && doc.servicio && SERVICIOS[doc.servicio]) return { ...base, nombre: doc.servicio, ...SERVICIOS[doc.servicio] };
    return base;
}

export function insignia(doc, { grande = false } = {}) {
    const t = tipoDe(doc);
    return h("span", { class: ["insignia", grande && "grande"], style: { "--color": t.color, "--tinta-insignia": t.tinta || "#fff" }, title: t.nombre, "aria-hidden": "true" }, t.corto);
}

export function tamano(bytes) {
    if (!Number.isFinite(bytes)) return "";
    const num = (n, d) => n.toLocaleString("es-ES", { maximumFractionDigits: d });
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${num(bytes / 1024, bytes < 10240 ? 1 : 0)} KB`;
    if (bytes < 1024 ** 3) return `${num(bytes / 1048576, 1)} MB`;
    return `${num(bytes / 1024 ** 3, 1)} GB`;
}

// El texto «plegado» (sin tildes, en minúsculas) y dónde cae cada letra en el original, para poder buscar sin
// fijarse en tildes ni mayúsculas y marcar luego lo encontrado en el texto de verdad.
export function plegarConMapa(texto) {
    texto = String(texto);
    // Lo habitual (ASCII) no cambia de largo: sin mapa.
    if (/^[\x00-\x7f]*$/.test(texto)) return { plano: texto.toLowerCase(), original: (p) => p };
    let plano = "";
    const mapa = [];
    for (let i = 0; i < texto.length; ) {
        const c = String.fromCodePoint(texto.codePointAt(i));
        const n = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        for (let k = 0; k < n.length; k++) mapa.push(i);
        plano += n;
        i += c.length;
    }
    mapa.push(texto.length);
    return { plano, original: (p) => mapa[Math.min(p, mapa.length - 1)] };
}

// Las palabras de una búsqueda, como las plegaría el servidor.
export function terminosDe(consulta) {
    return [...new Set(plegarConMapa(String(consulta || "").trim()).plano.split(/\s+/).filter(Boolean))].slice(0, 8);
}

// Un texto con lo buscado entre <mark>: devuelve nodos para pasarle a h().
export function resaltar(texto, terminos) {
    const { plano, original } = plegarConMapa(texto);
    const rangos = [];
    for (const t of terminos) {
        for (let p = plano.indexOf(t); p >= 0 && t; p = plano.indexOf(t, p + t.length)) {
            const desde = original(p);
            rangos.push([desde, Math.max(original(p + t.length), desde + 1)]);
        }
    }
    rangos.sort((a, b) => a[0] - b[0]);
    const juntos = [];
    for (const r of rangos) {
        const ultimo = juntos.at(-1);
        if (ultimo && r[0] <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], r[1]);
        else juntos.push([...r]);
    }
    const nodos = [];
    let desde = 0;
    for (const [a, b] of juntos) {
        if (a > desde) nodos.push(texto.slice(desde, a));
        nodos.push(h("mark", null, texto.slice(a, b)));
        desde = b;
    }
    if (desde < texto.length) nodos.push(texto.slice(desde));
    return nodos;
}
