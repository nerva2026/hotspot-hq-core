// Utilidades comunes: crear elementos, fechas y colores.

// h("div", { class: "x", onclick: fn, style: {...} }, hijos…)
export function h(etiqueta, props, ...hijos) {
    const el = document.createElement(etiqueta);
    if (props) {
        for (const [k, v] of Object.entries(props)) {
            if (v === undefined || v === null || v === false) continue;
            if (k === "class") el.className = Array.isArray(v) ? v.filter(Boolean).join(" ") : v;
            else if (k === "style" && typeof v === "object") {
                for (const [prop, val] of Object.entries(v)) {
                    if (val === undefined || val === null) continue;
                    if (prop.startsWith("--")) el.style.setProperty(prop, val);
                    else el.style[prop] = val;
                }
            }
            else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
            else if (k === "dataset") Object.assign(el.dataset, v);
            else if (k === "value") el.value = v;
            else if (k === "checked") el.checked = Boolean(v);
            else if (v === true) el.setAttribute(k, "");
            else el.setAttribute(k, v);
        }
    }
    poner(el, hijos);
    return el;
}

function poner(el, hijos) {
    for (const hijo of hijos) {
        if (hijo === null || hijo === undefined || hijo === false) continue;
        if (Array.isArray(hijo)) poner(el, hijo);
        else if (hijo instanceof Node) el.appendChild(hijo);
        else el.appendChild(document.createTextNode(String(hijo)));
    }
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function vaciar(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
}

// Como «el.replaceChildren(...hijos)», pero sin pintar «null», «undefined» ni «false» (y aplanando listas):
// así se puede poner «condición ? h(…) : null» sin que salga la palabra «null» en pantalla.
export function rellenar(el, ...hijos) {
    vaciar(el);
    poner(el, hijos);
    return el;
}

export const normalizar = (s) =>
    String(s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim();

// ---------- los errores de los formularios ----------

// El mensaje de error de un formulario se quita solo en cuanto se corrige: si se puso con ponerError(error, texto, campo),
// al escribir o elegir algo en ESE campo; si no es de ningún campo (lo que contesta el servidor), al tocar cualquier
// cosa de «zona» (el formulario). Antes seguía en rojo, con el campo ya bien, hasta volver a pulsar el botón.
const campoDelError = new WeakMap(); // error → { campo, texto }
const ELECCIONES = "[role=radio], [role=checkbox], [aria-pressed], select";

export function ponerError(error, texto, campo = null) {
    error.textContent = texto;
    if (campo) campoDelError.set(error, { campo, texto });
    else campoDelError.delete(error);
}

// ¿Quita el error este gesto? «suyo»: { campo, texto } si el error se puso para un campo; «dentro(campo)»: si el gesto
// ha sido en ese campo. Un clic solo cuenta si es en algo que se elige (una opción), no en cualquier botón.
export function corrigeElError({ texto, suyo, tipo, enEleccion, dentro }) {
    if (!texto) return false;
    if (tipo === "click" && !enEleccion) return false;
    // el campo solo manda mientras el error sea el que se puso para él y el campo siga en la página
    if (suyo && suyo.texto === texto && suyo.campo.isConnected && !dentro(suyo.campo)) return false;
    return true;
}

// Devuelve el error, para ponerlo donde vaya.
export function quitarErrorAlCorregir(zona, error) {
    const quitar = (e) => {
        const corrige = corrigeElError({
            texto: error.textContent,
            suyo: campoDelError.get(error),
            tipo: e.type,
            enEleccion: Boolean(e.target.closest?.(ELECCIONES)),
            dentro: (campo) => campo.contains(e.target),
        });
        if (!corrige) return;
        error.textContent = "";
        campoDelError.delete(error);
    };
    for (const tipo of ["input", "change", "click"]) zona.addEventListener(tipo, quitar);
    return error;
}

// El campo de «nueva tarea» se vacía al pulsar Intro, antes de que conteste el servidor (para seguir con la siguiente);
// si la tarea no se crea, lo escrito vuelve al campo (el de ahora: la vista puede haberse repintado), salvo que ya
// tenga otra cosa.
export function devolverLoEscrito(clave, escrito) {
    const campo = document.querySelector(`[data-foco="${CSS.escape(clave)}"]`);
    if (campo && !campo.value) campo.value = escrito;
}

export function retrasar(fn, ms) {
    let t = null;
    const envuelta = (...args) => {
        clearTimeout(t);
        t = setTimeout(() => {
            t = null;
            fn(...args);
        }, ms);
    };
    envuelta.ya = (...args) => {
        clearTimeout(t);
        t = null;
        fn(...args);
    };
    envuelta.pendiente = () => t !== null;
    return envuelta;
}

// ---------- fechas (siempre «AAAA-MM-DD», sin horas ni zonas horarias) ----------

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
export const DIAS_CORTOS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

const dos = (n) => String(n).padStart(2, "0");

export function hoy() {
    const d = new Date();
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

export const aFecha = (iso) => {
    const [a, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(a, m - 1, d));
};
export const deFecha = (f) => `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}`;
export const sumarDias = (iso, n) => deFecha(new Date(aFecha(iso).getTime() + n * 86400000));
export const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 86400000);
// 0 = lunes … 6 = domingo
export const diaSemana = (iso) => (aFecha(iso).getUTCDay() + 6) % 7;
export const lunesDe = (iso) => sumarDias(iso, -diaSemana(iso));
export const primeroDeMes = (iso) => `${iso.slice(0, 7)}-01`;
export function sumarMeses(iso, n) {
    const [a, m] = iso.split("-").map(Number);
    const t = a * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${dos((t % 12) + 1)}-01`;
}
export const diasDelMes = (iso) => {
    const [a, m] = iso.split("-").map(Number);
    return new Date(Date.UTC(a, m, 0)).getUTCDate();
};

export function fechaCorta(iso) {
    if (!iso) return "";
    const f = aFecha(iso);
    const base = `${f.getUTCDate()} ${MESES_CORTOS[f.getUTCMonth()]}`;
    return iso.slice(0, 4) === hoy().slice(0, 4) ? base : `${base} ${iso.slice(2, 4)}`;
}

export function fechaMedia(iso) {
    if (!iso) return "";
    return `${DIAS_CORTOS[diaSemana(iso)]} ${fechaCorta(iso)}`;
}

export function fechaLarga(iso) {
    const f = aFecha(iso);
    return `${DIAS[diaSemana(iso)]} ${f.getUTCDate()} de ${MESES[f.getUTCMonth()]} de ${f.getUTCFullYear()}`;
}

// ---------- horas (la del navegador de cada uno) ----------

// «1:08», «13:05».
export function horaCorta(iso) {
    const d = new Date(iso);
    return `${d.getHours()}:${dos(d.getMinutes())}`;
}

// La hora con su artículo, para escribirla detrás de «a», «desde» o «hasta»: «la 1:08» (la una), «las 13:05»,
// «las 0:15». Toda hora que vaya dentro de una frase sale de aquí: nunca «las ${…}» escrito a mano (lo vigila
// pruebas/musica.mjs), que entre la 1:00 y la 1:59 decía «desde las 1:08».
export function laHora(iso) {
    return `${new Date(iso).getHours() === 1 ? "la" : "las"} ${horaCorta(iso)}`;
}

// Cómo de cerca queda una fecha límite: texto corto y clase para el color.
export function plazo(iso, hecha = false) {
    if (!iso) return null;
    const d = diasEntre(hoy(), iso);
    let texto;
    if (d === 0) texto = "Hoy";
    else if (d === 1) texto = "Mañana";
    else if (d === -1) texto = "Ayer";
    else if (d < -1 && d >= -30) texto = `Hace ${-d} días`;
    else if (d > 1 && d < 7) texto = DIAS[diaSemana(iso)].replace(/^./, (c) => c.toUpperCase());
    else texto = fechaCorta(iso);
    let clase = "";
    if (!hecha) {
        if (d < 0) clase = "atrasada";
        else if (d === 0) clase = "hoy";
        else if (d <= 2) clase = "pronto";
    }
    return { texto, clase, dias: d };
}

export function haceCuanto(isoCompleto) {
    const s = Math.round((Date.now() - Date.parse(isoCompleto)) / 1000);
    if (s < 60) return "hace un momento";
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    const dia = isoCompleto.slice(0, 10);
    const d = new Date(isoCompleto);
    return `el ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}${dia.slice(0, 4) === hoy().slice(0, 4) ? "" : ` ${d.getFullYear()}`}`;
}

// ---------- colores ----------

export const ESTADOS = [
    { id: "por-hacer", nombre: "Por hacer", color: "#8d857e" },
    { id: "en-marcha", nombre: "En marcha", color: "#3b82c4" },
    { id: "esperando", nombre: "Esperando", color: "#8e5cc4" },
    { id: "hecho", nombre: "Hecho", color: "#3a9d5d" },
];
export const PRIORIDADES = [
    { id: "urgente", nombre: "Urgente", color: "#e0303a", texto: "#fff" },
    { id: "alta", nombre: "Alta", color: "#f08c2c", texto: "#1c1715" },
    { id: "media", nombre: "Media", color: "#ffd84a", texto: "#1c1715" },
    { id: "baja", nombre: "Baja", color: "#8cbcea", texto: "#1c1715" },
];
export const SIN_PRIORIDAD = { id: null, nombre: "Sin prioridad", color: "#d8cabb", texto: "#1c1715" };
export const estadoDe = (id) => ESTADOS.find((e) => e.id === id) || ESTADOS[0];
export const prioridadDe = (id) => PRIORIDADES.find((p) => p.id === id) || SIN_PRIORIDAD;
export const pesoPrioridad = (id) => {
    const i = PRIORIDADES.findIndex((p) => p.id === id);
    return i < 0 ? PRIORIDADES.length : i;
};

const COLORES_ETIQUETA = ["#f6c8b4", "#c9dff3", "#cfe8c9", "#e5d3f2", "#f7d9e6", "#f7e7a8", "#c7ebe8", "#e3d9cf"];
export function colorEtiqueta(nombre) {
    let n = 0;
    for (const ch of nombre) n = (n * 31 + ch.codePointAt(0)) >>> 0;
    return COLORES_ETIQUETA[n % COLORES_ETIQUETA.length];
}

export const inicial = (nombre) => (nombre || "?").trim().charAt(0).toUpperCase();

// Texto claro u oscuro según el fondo.
export function textoSobre(color) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color || "");
    if (!m) return "#fff";
    const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
    return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#1c1715" : "#fff";
}

export const guardarLocal = (clave, valor) => {
    try {
        localStorage.setItem(`hs-tablon:${clave}`, JSON.stringify(valor));
    } catch {
        /* sin almacenamiento: no pasa nada */
    }
};
export const leerLocal = (clave, porDefecto) => {
    try {
        const v = localStorage.getItem(`hs-tablon:${clave}`);
        return v === null ? porDefecto : JSON.parse(v);
    } catch {
        return porDefecto;
    }
};
