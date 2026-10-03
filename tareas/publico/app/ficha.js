// Ficha de una tarea: panel lateral para verla y editarla entera, como una página de Notion.

import { h, rellenar, retrasar, estadoDe, prioridadDe, plazo, fechaMedia, fechaCorta, fechaLarga, haceCuanto } from "./util.js";
import { menuEstado, menuPrioridad, menuPersonas, menuPersona, menuFecha, menuEtiquetas, avatar, chipEtiqueta, cerrarMenu, aviso, colocarAvisos } from "./menus.js";
import { abrirCapa } from "./capas.js";
import { conSolo } from "./solo.js";

let abierta = null; // id
let panel = null;
let capa = null; // la ficha es una capa (capas.js): el tabulador no sale de ella y «atrás» la cierra
let guardarTitulo = null;
let guardarNotas = null;
let notasEnConflicto = false; // otra persona ha cambiado las notas a la vez y quien escribe aún no ha elegido

export const fichaAbierta = () => abierta;

// Mientras haya un choque de notas sin resolver no se cierra (se perdería lo escrito), salvo con «forzar» (tarea
// borrada, sesión cerrada…). Devuelve si se ha cerrado.
export function cerrarFicha({ forzar = false } = {}) {
    if (!panel) return true;
    if (notasEnConflicto && !forzar) {
        // Se llama la atención sin mover el foco: si se sigue escribiendo, una tecla no puede elegir por nadie.
        const caja = panel.querySelector(".ficha-conflicto");
        caja.classList.remove("llama");
        void caja.offsetWidth;
        caja.classList.add("llama");
        caja.scrollIntoView({ block: "nearest" });
        return false;
    }
    notasEnConflicto = false;
    guardarTitulo?.pendiente() && guardarTitulo.ya();
    guardarNotas?.pendiente() && guardarNotas.ya();
    cerrarMenu();
    panel.remove();
    panel = null;
    colocarAvisos(); // los avisos que estuvieran al pie de la ficha vuelven abajo
    const id = abierta;
    abierta = null;
    document.body.classList.remove("con-ficha");
    // El foco vuelve a lo que la abrió o, si el tablón se ha repintado mientras tanto, a esa tarea.
    capa?.quitar({
        alternativa: () => {
            const suya = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
            // en el tablero, el calendario y el cronograma es un botón; en la lista, una fila: ahí, su «Abrir»
            return suya?.matches("button, a[href], [tabindex]") ? suya : suya?.querySelector(".abrir");
        },
    });
    capa = null;
    return true;
}

// La dirección que enseña la barra del navegador con la ficha abierta: la de esa tarea, con el modo solo de esta página
// si lo tiene (el enlace para compartir, «Enlace», va siempre sin él: sale de la oficina).
const direccionDeTarea = (id) => conSolo(`${location.pathname}?tarea=${encodeURIComponent(id)}`);

function crecer(area) {
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight + 2}px`;
}

const ENLACE = /\bhttps?:\/\/[^\s<>"')]+/g;

// «mias»: unas notas que no se llegaron a guardar por un choque; se abre la ficha con ellas y el aviso para elegir.
export function abrirFicha(id, ctx, { nueva = false, mias } = {}) {
    if (abierta === id && panel) return;
    if (panel && !cerrarFicha()) return;
    const t = ctx.E.tareas.get(id);
    if (!t) return;
    abierta = id;

    const estadoGuardado = h("span", { class: "guardado", "aria-live": "polite" });
    const marcarGuardando = () => {
        estadoGuardado.textContent = "Guardando…";
    };
    const cambiar = async (cambios, opciones) => {
        marcarGuardando();
        const r = await ctx.cambiar(id, cambios, opciones);
        estadoGuardado.textContent = r === "ok" ? "Guardado" : "Sin guardar";
        return r;
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
    const avisoConflicto = h("div", { class: "ficha-conflicto", role: "alert", hidden: true });
    // Las notas del servidor en las que se basa lo que hay escrito. Se mandan al guardar: si otra persona ya las ha
    // cambiado, el servidor no las pisa (409) y aquí se deja elegir.
    let baseNotas = t.notas;
    let enVuelo = false;
    let conflicto = false;
    const notasSinConfirmar = () => guardarNotas.pendiente() || enVuelo || conflicto;
    async function enviarNotas() {
        if (conflicto || enVuelo || notas.value === baseNotas) return;
        const texto = notas.value;
        const suPanel = panel;
        enVuelo = true;
        const r = await cambiar({ notas: texto }, { antes: { notas: baseNotas } });
        enVuelo = false;
        if (r === "ok") baseNotas = texto;
        if (r === "conflicto") {
            if (panel === suPanel) mostrarConflicto();
            else aviso("Notas sin guardar: otra persona las cambió.", { tipo: "malo", accion: "Ver", duracion: 15000, alAccion: () => abrirFicha(id, ctx, { mias: texto }) });
            return;
        }
        if (panel === suPanel && notas.value !== baseNotas) guardarNotas(); // se ha seguido escribiendo mientras tanto
    }
    function mostrarConflicto() {
        conflicto = true;
        notasEnConflicto = true;
        const editor = ctx.usuario(ctx.E.tareas.get(id)?.actualizadaPor);
        rellenar(
            avisoConflicto,
            h("span", { class: "ficha-conflicto-texto" }, `${editor && editor.id !== ctx.E.yo.id ? editor.nombre : "Otra ventana tuya"} ha cambiado estas notas a la vez.`),
            h("button", { type: "button", class: "btn pequeno", onclick: dejarLasMias }, "Dejar las mías"),
            h("button", { type: "button", class: "btn pequeno", onclick: usarLasSuyas }, "Usar las suyas"),
        );
        avisoConflicto.hidden = false;
        estadoGuardado.textContent = "Sin guardar";
        panel.pintar(); // lo demás (último cambio, propiedades…) se pone como está en el servidor; las notas escritas no se tocan
    }
    function resolverConflicto() {
        conflicto = false;
        notasEnConflicto = false;
        avisoConflicto.hidden = true;
    }
    function dejarLasMias() {
        resolverConflicto();
        baseNotas = ctx.E.tareas.get(id)?.notas ?? baseNotas; // lo que hay ahora en el servidor: se guarda encima
        if (notas.value === baseNotas) estadoGuardado.textContent = "Guardado";
        enviarNotas();
    }
    function usarLasSuyas() {
        resolverConflicto();
        const actual = ctx.E.tareas.get(id);
        if (actual) {
            notas.value = actual.notas;
            baseNotas = actual.notas;
            crecer(notas);
            pintarEnlaces();
        }
        estadoGuardado.textContent = "Guardado";
    }
    guardarNotas = retrasar(enviarNotas, 800);
    notas.addEventListener("input", () => {
        crecer(notas);
        if (!conflicto) marcarGuardando();
        guardarNotas();
        pintarEnlaces();
    });
    notas.addEventListener("blur", () => guardarNotas.pendiente() && guardarNotas.ya());
    function pintarEnlaces() {
        const urls = [...new Set(notas.value.match(ENLACE) || [])].slice(0, 12);
        rellenar(enlaces, ...urls.map((u) => h("a", { href: u, target: "_blank", rel: "noopener noreferrer" }, u.replace(/^https?:\/\//, "").slice(0, 60), " ↗")));
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
            h("section", { class: "ficha-seccion" }, h("h3", null, "Notas"), avisoConflicto, notas, enlaces),
            pie,
        ),
    );
    // Una capa, pero no modal: al lado sigue el tablón (pulsar otra tarea la abre). «Atrás» la cierra (en un móvil
    // ocupa toda la pantalla y el botón de atrás sacaba del tablón entero) y la dirección dice qué tarea es.
    capa = abrirCapa({ el: panel, cerrar: () => cerrarFicha(), direccion: direccionDeTarea(id) });
    document.body.appendChild(panel);
    document.body.classList.add("con-ficha");
    colocarAvisos(); // los avisos que hubiera a la vista pasan al pie de la ficha, para no taparla

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
        rellenar(
            propiedades,
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
                    h(
                        "label",
                        { class: "zona-toque" },
                        h("input", {
                            type: "checkbox",
                            class: "casilla",
                            checked: s.hecha,
                            "aria-label": "Hecha",
                            onchange: (e) => guardarLista(t.subtareas.map((x, j) => (j === i ? { ...x, hecha: e.target.checked } : x))),
                        }),
                    ),
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
        rellenar(
            subtareas,
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
        rellenar(
            pie,
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
        // Con el cursor puesto también se actualizan, si no hay nada escrito encima de lo que se veía.
        if ((document.activeElement !== notas || notas.value === baseNotas) && notas.value !== t.notas && !notasSinConfirmar()) {
            const { selectionStart: desde, selectionEnd: hasta } = notas;
            notas.value = t.notas;
            baseNotas = t.notas;
            if (document.activeElement === notas) notas.setSelectionRange(Math.min(desde, t.notas.length), Math.min(hasta, t.notas.length));
            crecer(notas);
            pintarEnlaces();
        }
        pintarPropiedades();
        // No se repintan las subtareas mientras se está escribiendo en una (se perdería lo escrito).
        if (!document.activeElement?.matches?.(".subtarea-texto, .subtarea-nueva")) pintarSubtareas();
        pintarPie();
        if (deFuera && !conflicto) {
            const editor = ctx.usuario(t.actualizadaPor);
            if (editor && editor.id !== ctx.E.yo.id) estadoGuardado.textContent = `${editor.nombre} acaba de cambiarla`;
        }
    };

    titulo.value = t.titulo;
    notas.value = t.notas;
    panel.pintar();
    pintarEnlaces();
    if (mias !== undefined) {
        notas.value = mias;
        mostrarConflicto();
    }
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
