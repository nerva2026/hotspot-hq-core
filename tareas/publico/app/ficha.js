// Ficha de una tarea: panel lateral para verla y editarla entera, como una página de Notion.

import { h, retrasar, estadoDe, prioridadDe, plazo, fechaMedia, fechaCorta, fechaLarga, haceCuanto } from "./util.js";
import { menuEstado, menuPrioridad, menuPersonas, menuPersona, menuFecha, menuEtiquetas, avatar, chipEtiqueta, cerrarMenu } from "./menus.js";

let abierta = null; // id
let panel = null;
let guardarTitulo = null;
let guardarNotas = null;

export const fichaAbierta = () => abierta;

export function cerrarFicha() {
    if (!panel) return;
    guardarTitulo?.pendiente() && guardarTitulo.ya();
    guardarNotas?.pendiente() && guardarNotas.ya();
    cerrarMenu();
    panel.remove();
    panel = null;
    const id = abierta;
    abierta = null;
    document.body.classList.remove("con-ficha");
    document.querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
}

function crecer(area) {
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight + 2}px`;
}

const ENLACE = /\bhttps?:\/\/[^\s<>"')]+/g;

export function abrirFicha(id, ctx, { nueva = false } = {}) {
    if (abierta === id && panel) return;
    if (panel) cerrarFicha();
    const t = ctx.E.tareas.get(id);
    if (!t) return;
    abierta = id;

    const estadoGuardado = h("span", { class: "guardado", "aria-live": "polite" });
    const marcarGuardando = () => {
        estadoGuardado.textContent = "Guardando…";
    };
    const cambiar = async (cambios) => {
        marcarGuardando();
        await ctx.cambiar(id, cambios);
        estadoGuardado.textContent = "Guardado";
    };

    const titulo = h("textarea", {
        class: "ficha-titulo",
        rows: 1,
        maxlength: 300,
        "aria-label": "Título",
        placeholder: "Sin título",
    });
    guardarTitulo = retrasar(() => {
        const v = titulo.value.replace(/\s+/g, " ").trim();
        if (v && v !== ctx.E.tareas.get(id)?.titulo) cambiar({ titulo: v });
    }, 700);
    titulo.addEventListener("input", () => {
        crecer(titulo);
        marcarGuardando();
        guardarTitulo();
    });
    titulo.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            titulo.blur();
        }
    });
    titulo.addEventListener("blur", () => {
        if (!titulo.value.trim()) titulo.value = ctx.E.tareas.get(id)?.titulo || "";
        guardarTitulo.pendiente() && guardarTitulo.ya();
    });

    const notas = h("textarea", { class: "ficha-notas", placeholder: "Detalles, enlaces, contactos, lo que haga falta…", "aria-label": "Notas" });
    const enlaces = h("div", { class: "ficha-enlaces" });
    guardarNotas = retrasar(() => {
        if (notas.value !== ctx.E.tareas.get(id)?.notas) cambiar({ notas: notas.value });
    }, 800);
    notas.addEventListener("input", () => {
        crecer(notas);
        marcarGuardando();
        guardarNotas();
        pintarEnlaces();
    });
    notas.addEventListener("blur", () => guardarNotas.pendiente() && guardarNotas.ya());
    function pintarEnlaces() {
        const urls = [...new Set(notas.value.match(ENLACE) || [])].slice(0, 12);
        enlaces.replaceChildren(...urls.map((u) => h("a", { href: u, target: "_blank", rel: "noopener noreferrer" }, u.replace(/^https?:\/\//, "").slice(0, 60), " ↗")));
    }

    const propiedades = h("div", { class: "propiedades" });
    const subtareas = h("section", { class: "ficha-seccion" });
    const pie = h("footer", { class: "ficha-pie" });

    panel = h(
        "aside",
        { class: "ficha", role: "dialog", "aria-label": "Tarea" },
        h(
            "header",
            { class: "ficha-cabecera" },
            h("span", { class: "ficha-migas" }, "TAREA"),
            estadoGuardado,
            h("span", { class: "crece" }),
            h(
                "button",
                {
                    type: "button",
                    class: "btn pequeno",
                    title: "Copiar el enlace a esta tarea",
                    onclick: async (e) => {
                        const url = `${location.origin}${location.pathname}?tarea=${encodeURIComponent(id)}`;
                        try {
                            await navigator.clipboard.writeText(url);
                            e.target.textContent = "¡Copiado!";
                        } catch {
                            prompt("Enlace a la tarea:", url);
                        }
                        setTimeout(() => (e.target.textContent = "Enlace"), 1500);
                    },
                },
                "Enlace",
            ),
            h(
                "button",
                {
                    type: "button",
                    class: "btn pequeno peligro",
                    title: "Borrar la tarea",
                    onclick: () => ctx.borrar(id),
                },
                "Borrar",
            ),
            h("button", { type: "button", class: "cerrar", title: "Cerrar (Esc)", onclick: cerrarFicha }, "×"),
        ),
        h(
            "div",
            { class: "ficha-cuerpo", "data-desplazar": "ficha" },
            titulo,
            propiedades,
            subtareas,
            h("section", { class: "ficha-seccion" }, h("h3", null, "Notas"), notas, enlaces),
            pie,
        ),
    );
    document.body.appendChild(panel);
    document.body.classList.add("con-ficha");

    panel.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !document.querySelector(".menu")) {
            e.stopPropagation();
            cerrarFicha();
        }
    });

    // --- propiedades ---
    function fila(nombre, valor, alPulsar) {
        return h(
            "div",
            { class: "propiedad" },
            h("span", { class: "propiedad-nombre" }, nombre),
            h("button", { type: "button", class: "propiedad-valor", onclick: (e) => alPulsar(e.currentTarget) }, valor),
        );
    }
    const vacio = (texto) => h("span", { class: "tenue" }, texto);

    function pintarPropiedades() {
        const t = ctx.E.tareas.get(id);
        if (!t) return;
        const est = estadoDe(t.estado);
        const prio = prioridadDe(t.prioridad);
        const p = plazo(t.fin, t.estado === "hecho");
        const responsables = t.responsables.map(ctx.usuario).filter(Boolean);
        const pedido = ctx.usuario(t.pedidoPor);
        panel.style.setProperty("--color-prioridad", prio.color);
        propiedades.replaceChildren(
            fila("Estado", [h("span", { class: "punto-estado", style: { background: est.color } }), est.nombre], (a) => menuEstado(a, t.estado, (v) => cambiar({ estado: v }))),
            fila(
                "Prioridad",
                t.prioridad ? h("span", { class: "chip prioridad", style: { background: prio.color, color: prio.texto } }, prio.nombre) : vacio("Sin prioridad"),
                (a) => menuPrioridad(a, t.prioridad, (v) => cambiar({ prioridad: v })),
            ),
            fila(
                "Para quién",
                responsables.length ? responsables.map((u) => h("span", { class: "persona" }, avatar(u), u.nombre)) : vacio("Sin asignar"),
                (a) => menuPersonas(a, ctx.activos(), t.responsables, (v) => cambiar({ responsables: v })),
            ),
            fila("Para cuándo", t.fin ? [h("span", { class: ["chip", "plazo", p.clase] }, p.texto), /\d/.test(p.texto) ? null : h("span", { class: "tenue" }, fechaCorta(t.fin))] : vacio("Sin fecha"), (a) =>
                menuFecha(a, t.fin, (v) => cambiar({ fin: v }), { titulo: "Para cuándo" }),
            ),
            fila("Empieza", t.inicio ? fechaMedia(t.inicio) : vacio("—"), (a) => menuFecha(a, t.inicio, (v) => cambiar({ inicio: v }), { titulo: "Empieza el" })),
            fila("Etiquetas", t.etiquetas.length ? t.etiquetas.map((e) => chipEtiqueta(e)) : vacio("Ninguna"), (a) => menuEtiquetas(a, t.etiquetas, ctx.todasEtiquetas(), (v) => cambiar({ etiquetas: v }))),
            fila("Pedido por", pedido ? h("span", { class: "persona" }, avatar(pedido), pedido.nombre) : vacio("—"), (a) => menuPersona(a, ctx.activos(), t.pedidoPor, (v) => cambiar({ pedidoPor: v }))),
        );
    }

    // --- subtareas ---
    function pintarSubtareas() {
        const t = ctx.E.tareas.get(id);
        if (!t) return;
        const hechas = t.subtareas.filter((s) => s.hecha).length;
        const total = t.subtareas.length;
        const guardarLista = (lista) => cambiar({ subtareas: lista });
        const lista = h(
            "ul",
            { class: "subtareas" },
            t.subtareas.map((s, i) =>
                h(
                    "li",
                    { class: ["subtarea", s.hecha && "hecha"] },
                    h("input", {
                        type: "checkbox",
                        class: "casilla",
                        checked: s.hecha,
                        "aria-label": "Hecha",
                        onchange: (e) => guardarLista(t.subtareas.map((x, j) => (j === i ? { ...x, hecha: e.target.checked } : x))),
                    }),
                    h("input", {
                        class: "subtarea-texto",
                        value: s.texto,
                        maxlength: 300,
                        "aria-label": "Subtarea",
                        onkeydown: (e) => {
                            if (e.key === "Enter") e.target.blur();
                        },
                        onchange: (e) => {
                            const v = e.target.value.trim();
                            guardarLista(v ? t.subtareas.map((x, j) => (j === i ? { ...x, texto: v } : x)) : t.subtareas.filter((_, j) => j !== i));
                        },
                    }),
                    h("button", { type: "button", class: "quitar", title: "Quitar", onclick: () => guardarLista(t.subtareas.filter((_, j) => j !== i)) }, "×"),
                ),
            ),
        );
        const nueva = h("input", {
            class: "campo subtarea-nueva",
            placeholder: "+ Añadir subtarea",
            maxlength: 300,
            onkeydown: async (e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const v = e.target.value.trim();
                if (!v) return;
                e.target.value = "";
                await guardarLista([...ctx.E.tareas.get(id).subtareas, { texto: v, hecha: false }]);
                pintarSubtareas();
                subtareas.querySelector(".subtarea-nueva")?.focus();
            },
        });
        subtareas.replaceChildren(
            h("h3", null, "Subtareas", total ? h("span", { class: "tenue" }, ` ${hechas}/${total}`) : null),
            total ? h("div", { class: "progreso" }, h("span", { style: { width: `${(100 * hechas) / total}%` } })) : null,
            lista,
            nueva,
        );
    }

    function pintarPie() {
        const t = ctx.E.tareas.get(id);
        if (!t) return;
        const creador = ctx.usuario(t.creadaPor);
        const editor = ctx.usuario(t.actualizadaPor);
        pie.replaceChildren(
            h("span", null, `Creada ${creador ? `por ${creador.nombre} ` : ""}el ${fechaLarga(t.creada.slice(0, 10))}.`),
            t.actualizada !== t.creada ? h("span", null, ` Último cambio ${editor ? `de ${editor.nombre} ` : ""}${haceCuanto(t.actualizada)}.`) : null,
            t.hechaEl ? h("span", null, ` Hecha el ${fechaMedia(t.hechaEl.slice(0, 10))}.`) : null,
        );
    }

    panel.pintar = ({ deFuera = false } = {}) => {
        const t = ctx.E.tareas.get(id);
        if (!t) return;
        if (document.activeElement !== titulo && titulo.value !== t.titulo && !guardarTitulo.pendiente()) {
            titulo.value = t.titulo;
            crecer(titulo);
        }
        if (document.activeElement !== notas && notas.value !== t.notas && !guardarNotas.pendiente()) {
            notas.value = t.notas;
            crecer(notas);
            pintarEnlaces();
        }
        pintarPropiedades();
        // No se repintan las subtareas mientras se está escribiendo en una (se perdería lo escrito).
        if (!document.activeElement?.matches?.(".subtarea-texto, .subtarea-nueva")) pintarSubtareas();
        pintarPie();
        if (deFuera) {
            const editor = ctx.usuario(t.actualizadaPor);
            if (editor && editor.id !== ctx.E.yo.id) estadoGuardado.textContent = `${editor.nombre} acaba de cambiarla`;
        }
    };

    titulo.value = t.titulo;
    notas.value = t.notas;
    panel.pintar();
    pintarEnlaces();
    requestAnimationFrame(() => {
        crecer(titulo);
        crecer(notas);
    });
    (nueva ? titulo : panel.querySelector(".propiedad-valor"))?.focus({ preventScroll: true });
    if (nueva) titulo.select();
}

export function actualizarFicha(ctx, opciones) {
    if (!panel || !abierta) return;
    if (!ctx.E.tareas.has(abierta)) return;
    panel.pintar(opciones);
}
