// Vista «Tablero»: columnas por estado con tarjetas que se arrastran de una a otra.

import { h, ESTADOS, prioridadDe, plazo, pesoPrioridad } from "./util.js";
import { avatar, chipEtiqueta, menuEstado } from "./menus.js";
import { arrastrable, autoDesplazamiento, hayArrastre } from "./arrastre.js";
import { interpretar } from "./rapida.js";

const HECHAS_VISIBLES = 15;

export function tarjeta(t, ctx) {
    const prio = prioridadDe(t.prioridad);
    const p = plazo(t.fin, t.estado === "hecho");
    const hechas = t.subtareas.filter((s) => s.hecha).length;
    const responsables = t.responsables.map(ctx.usuario).filter(Boolean);
    return h(
        "article",
        {
            class: ["tarjeta", t.estado === "hecho" && "hecha", t.prioridad && `prio-${t.prioridad}`],
            style: { "--color-prioridad": prio.color },
            tabindex: 0,
            dataset: { id: t.id },
            "aria-label": t.titulo,
            onkeydown: (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    ctx.abrir(t.id);
                }
            },
        },
        h("div", { class: "tarjeta-titulo" }, t.titulo),
        h(
            "div",
            { class: "tarjeta-meta" },
            t.prioridad ? h("span", { class: "chip prioridad", style: { background: prio.color, color: prio.texto } }, prio.nombre) : null,
            p ? h("span", { class: ["chip", "plazo", p.clase], title: t.fin }, p.texto) : null,
            t.subtareas.length ? h("span", { class: ["chip", hechas === t.subtareas.length && "completas"], title: "Subtareas hechas" }, `☑ ${hechas}/${t.subtareas.length}`) : null,
            t.notas.trim() ? h("span", { class: "chip tenue", title: "Tiene notas" }, "¶") : null,
            t.etiquetas.slice(0, 3).map((e) => chipEtiqueta(e)),
            t.etiquetas.length > 3 ? h("span", { class: "chip tenue" }, `+${t.etiquetas.length - 3}`) : null,
            h("span", { class: "crece" }),
            h("span", { class: "avatares" }, responsables.map((u) => avatar(u))),
        ),
    );
}

function ordenColumna(estado) {
    if (estado === "hecho") return (a, b) => (b.hechaEl || "").localeCompare(a.hechaEl || "") || a.orden - b.orden;
    return (a, b) => a.orden - b.orden;
}

export function pintarTablero(cont, ctx, estadoVista) {
    const tareas = ctx.visibles({ incluirHechas: true });
    const ocultarHechas = ctx.E.filtros.ocultarHechas;
    const tablero = h("div", { class: "tablero", "data-desplazar": "tablero" });

    for (const est of ESTADOS) {
        let enColumna = tareas.filter((t) => t.estado === est.id).sort(ordenColumna(est.id));
        const total = enColumna.length;
        let pie = null;
        if (est.id === "hecho") {
            if (ocultarHechas) {
                enColumna = [];
                pie = h("p", { class: "nota centro" }, total ? `${total} ocultas por el filtro` : "");
            } else if (total > HECHAS_VISIBLES && !estadoVista.todasHechas) {
                enColumna = enColumna.slice(0, HECHAS_VISIBLES);
                pie = h(
                    "button",
                    {
                        type: "button",
                        class: "enlace centro",
                        onclick: () => {
                            estadoVista.todasHechas = true;
                            ctx.pintar();
                        },
                    },
                    `Ver las ${total - HECHAS_VISIBLES} más antiguas`,
                );
            }
        }
        const lista = h("div", { class: "tarjetas", dataset: { estado: est.id, desplazar: `col-${est.id}` } });
        for (const t of enColumna) {
            const el = tarjeta(t, ctx);
            lista.appendChild(el);
            hacerArrastrable(el, t, ctx, tablero);
        }
        if (!enColumna.length && !pie) lista.appendChild(h("div", { class: "columna-vacia" }, est.id === "hecho" ? "Aquí van las terminadas." : "Nada por aquí."));

        const columna = h(
            "section",
            { class: "columna", dataset: { estado: est.id }, style: { "--color-estado": est.color } },
            h(
                "header",
                { class: "columna-cabecera" },
                h("span", { class: "punto-estado", style: { background: est.color } }),
                h("h2", null, est.nombre),
                h("span", { class: "cuenta" }, total),
                h("span", { class: "crece" }),
                est.id !== "hecho"
                    ? h(
                          "button",
                          {
                              type: "button",
                              class: "boton-icono",
                              title: `Nueva tarea en «${est.nombre}»`,
                              onclick: () => abrirAlta(est.id, ctx, estadoVista),
                          },
                          "+",
                      )
                    : null,
            ),
            lista,
            pie,
            est.id === "hecho" ? null : estadoVista.altaEn === est.id ? cajaAlta(est.id, ctx, estadoVista) : h("button", { type: "button", class: "anadir", onclick: () => abrirAlta(est.id, ctx, estadoVista) }, "+ Añadir tarea"),
        );
        tablero.appendChild(columna);
    }
    cont.appendChild(tablero);
}

// Escribir una tarea directamente al pie de una columna. Forma parte del pintado (estadoVista.altaEn)
// para que sobreviva a los cambios que llegan en directo mientras se escribe.
function cajaAlta(estado, ctx, ev) {
    const area = h("textarea", {
        class: "campo",
        rows: 2,
        "data-foco": `alta-${estado}`,
        placeholder: "Escribe y pulsa Intro…  (@persona !alta #etiqueta para el viernes)",
        maxlength: 300,
    });
    const cerrar = () => {
        ev.altaEn = null;
        ctx.pintar();
    };
    async function crear() {
        const r = interpretar(area.value, ctx.E.usuarios);
        if (!r.titulo) return cerrar();
        area.value = "";
        const datos = { titulo: r.titulo, estado, responsables: r.responsables, etiquetas: r.etiquetas };
        if (r.prioridad) datos.prioridad = r.prioridad;
        if (r.fin) datos.fin = r.fin;
        await ctx.crear(datos);
    }
    area.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            crear();
        } else if (e.key === "Escape") {
            e.stopPropagation();
            cerrar();
        }
    });
    area.addEventListener("blur", () => {
        setTimeout(() => {
            const caja = area.closest(".alta-columna");
            if (area.isConnected && caja && !caja.contains(document.activeElement) && !area.value.trim()) cerrar();
        }, 150);
    });
    return h(
        "div",
        { class: "alta-columna" },
        area,
        h(
            "div",
            { class: "fila-botones" },
            h("button", { type: "button", class: "btn primario pequeno", onclick: () => crear() }, "Añadir"),
            h("button", { type: "button", class: "enlace", onclick: () => cerrar() }, "Cancelar"),
        ),
    );
}

function abrirAlta(estado, ctx, ev) {
    ev.altaEn = estado;
    ctx.pintar();
    requestAnimationFrame(() => {
        const area = document.querySelector(`[data-foco="alta-${estado}"]`);
        area?.focus();
        area?.scrollIntoView({ block: "nearest" });
    });
}

function hacerArrastrable(el, t, ctx, tablero) {
    arrastrable(el, {
        alClic: () => ctx.abrir(t.id),
        alEmpezar: (e) => {
            const r = el.getBoundingClientRect();
            const hueco = h("div", { class: "hueco", style: { height: `${r.height}px` } });
            const fantasma = el.cloneNode(true);
            fantasma.classList.add("fantasma");
            Object.assign(fantasma.style, { width: `${r.width}px`, left: `${r.left}px`, top: `${r.top}px` });
            document.body.appendChild(fantasma);
            el.after(hueco);
            el.classList.add("arrastrada");
            return {
                hueco,
                fantasma,
                dx: e.clientX - r.left,
                dy: e.clientY - r.top,
                desplazarTablero: autoDesplazamiento(tablero, { vertical: false }),
                desplazarColumna: null,
            };
        },
        alMover: (e, c) => {
            c.fantasma.style.left = `${e.clientX - c.dx}px`;
            c.fantasma.style.top = `${e.clientY - c.dy}px`;
            c.desplazarTablero.mover(e.clientX, e.clientY);
            // Columna bajo el puntero
            const columnas = [...tablero.querySelectorAll(".columna")];
            const col = columnas.find((cl) => {
                const r = cl.getBoundingClientRect();
                return e.clientX >= r.left && e.clientX <= r.right;
            });
            if (!col) return;
            const lista = col.querySelector(".tarjetas");
            if (c.lista !== lista) {
                c.desplazarColumna?.parar();
                c.desplazarColumna = autoDesplazamiento(lista, { horizontal: false });
                c.lista = lista;
            }
            c.desplazarColumna.mover(e.clientX, e.clientY);
            const otras = [...lista.querySelectorAll(".tarjeta:not(.arrastrada)")];
            const siguiente = otras.find((o) => {
                const r = o.getBoundingClientRect();
                return e.clientY < r.top + r.height / 2;
            });
            if (siguiente) {
                if (c.hueco.nextElementSibling !== siguiente) siguiente.before(c.hueco);
            } else {
                const ultimo = otras[otras.length - 1];
                if (ultimo) {
                    if (ultimo.nextElementSibling !== c.hueco) ultimo.after(c.hueco);
                } else if (c.hueco.parentElement !== lista) {
                    lista.prepend(c.hueco);
                }
            }
            lista.querySelector(".columna-vacia")?.remove();
        },
        alSoltar: (e, c) => {
            limpiar(c);
            const lista = c.hueco.parentElement;
            const estado = lista?.dataset.estado;
            if (!estado) return c.hueco.remove();
            const idDe = (n) => n?.classList?.contains("tarjeta") && !n.classList.contains("arrastrada") ? n.dataset.id : null;
            let antes = c.hueco.previousElementSibling;
            while (antes && !idDe(antes)) antes = antes.previousElementSibling;
            let despues = c.hueco.nextElementSibling;
            while (despues && !idDe(despues)) despues = despues.nextElementSibling;
            c.hueco.remove();
            el.classList.remove("arrastrada");
            const oa = antes ? ctx.E.tareas.get(antes.dataset.id)?.orden : null;
            const od = despues ? ctx.E.tareas.get(despues.dataset.id)?.orden : null;
            let orden;
            if (oa != null && od != null) orden = (oa + od) / 2;
            else if (oa != null) orden = oa + 1;
            else if (od != null) orden = od - 1;
            else orden = 1;
            const cambios = {};
            if (estado !== t.estado) cambios.estado = estado;
            if (orden !== t.orden) cambios.orden = orden;
            if (Object.keys(cambios).length) ctx.cambiar(t.id, cambios);
            else ctx.pintar();
        },
        alCancelar: (c) => {
            limpiar(c);
            c.hueco.remove();
            el.classList.remove("arrastrada");
            ctx.pintar();
        },
    });
    el.addEventListener("contextmenu", (e) => {
        // Clic derecho: cambiar de estado rápido.
        if (e.pointerType === "touch" || hayArrastre()) return;
        e.preventDefault();
        menuEstado({ getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) }, t.estado, (v) => ctx.cambiar(t.id, { estado: v }));
    });
}

function limpiar(c) {
    c.fantasma.remove();
    c.desplazarTablero.parar();
    c.desplazarColumna?.parar();
}

export { pesoPrioridad };
