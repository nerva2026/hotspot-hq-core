// Vista «Lista»: una tabla como la de Notion. Cada celda se edita en el sitio.

import { h, ESTADOS, PRIORIDADES, SIN_PRIORIDAD, estadoDe, prioridadDe, plazo, fechaCorta, pesoPrioridad, normalizar } from "./util.js";
import { avatar, chipEtiqueta, menuEstado, menuPrioridad, menuPersonas, menuPersona, menuFecha, menuEtiquetas, abrirMenu, cerrarMenu } from "./menus.js";
import { interpretar } from "./rapida.js";

const COLUMNAS = [
    { id: "titulo", nombre: "Tarea", ordenable: true },
    { id: "estado", nombre: "Estado", ordenable: true },
    { id: "prioridad", nombre: "Prioridad", ordenable: true },
    { id: "responsables", nombre: "Para quién", ordenable: true },
    { id: "fin", nombre: "Para cuándo", ordenable: true },
    { id: "inicio", nombre: "Empieza", ordenable: true },
    { id: "etiquetas", nombre: "Etiquetas", ordenable: false },
    { id: "pedidoPor", nombre: "Pedido por", ordenable: true },
];

const AGRUPACIONES = [
    { id: "estado", nombre: "Estado" },
    { id: "prioridad", nombre: "Prioridad" },
    { id: "persona", nombre: "Persona" },
    { id: "nada", nombre: "Nada" },
];

function comparador(campo, dir, ctx) {
    const nombre = (id) => ctx.usuario(id)?.nombre || "~";
    const valor = {
        titulo: (t) => normalizar(t.titulo),
        estado: (t) => ESTADOS.findIndex((e) => e.id === t.estado),
        prioridad: (t) => pesoPrioridad(t.prioridad),
        responsables: (t) => normalizar(t.responsables.map(nombre).sort().join(",") || "~"),
        fin: (t) => t.fin || "9999",
        inicio: (t) => t.inicio || "9999",
        pedidoPor: (t) => normalizar(nombre(t.pedidoPor)),
    }[campo];
    return (a, b) => {
        const va = valor(a);
        const vb = valor(b);
        let r = va < vb ? -1 : va > vb ? 1 : 0;
        if (dir === "desc") r = -r;
        // Desempate útil: lo que vence antes y lo más importante primero.
        return r || (a.fin || "9999").localeCompare(b.fin || "9999") || pesoPrioridad(a.prioridad) - pesoPrioridad(b.prioridad) || a.orden - b.orden;
    };
}

function grupos(tareas, agrupar, ctx) {
    if (agrupar === "estado") return ESTADOS.map((e) => ({ clave: e.id, nombre: e.nombre, color: e.color, base: { estado: e.id }, tareas: tareas.filter((t) => t.estado === e.id) }));
    if (agrupar === "prioridad")
        return [...PRIORIDADES, SIN_PRIORIDAD].map((p) => ({ clave: p.id || "ninguna", nombre: p.nombre, color: p.color, base: { prioridad: p.id }, tareas: tareas.filter((t) => (t.prioridad || null) === p.id) }));
    if (agrupar === "persona")
        return [
            ...ctx.activos().map((u) => ({ clave: u.id, nombre: u.nombre, color: u.color, base: { responsables: [u.id] }, tareas: tareas.filter((t) => t.responsables.includes(u.id)) })),
            { clave: "nadie", nombre: "Sin asignar", color: "#d8cabb", base: {}, tareas: tareas.filter((t) => !t.responsables.length) },
        ];
    return [{ clave: "todo", nombre: null, base: {}, tareas }];
}

export function pintarLista(cont, ctx, ev) {
    ev.agrupar ||= "estado";
    ev.orden ||= { campo: "fin", dir: "asc" };
    ev.plegados ||= {};
    const tareas = ctx.visibles();

    const barra = h(
        "div",
        { class: "barra-vista barra-lista" },
        h("span", { class: "tenue" }, "Agrupar por"),
        h(
            "div",
            { class: "segmentos" },
            AGRUPACIONES.map((a) =>
                h(
                    "button",
                    {
                        type: "button",
                        class: ["segmento", ev.agrupar === a.id && "activo"],
                        onclick: () => {
                            ev.agrupar = a.id;
                            ctx.pintar();
                        },
                    },
                    a.nombre,
                ),
            ),
        ),
        h("span", { class: "crece" }),
        h("span", { class: "tenue" }, `${tareas.length} tarea${tareas.length === 1 ? "" : "s"}`),
    );

    const cabecera = h(
        "tr",
        null,
        h("th", { class: "col-hecha" }),
        COLUMNAS.map((c) =>
            h(
                "th",
                { class: `col-${c.id}`, "aria-sort": ev.orden.campo === c.id ? (ev.orden.dir === "asc" ? "ascending" : "descending") : null },
                c.ordenable
                    ? h(
                          "button",
                          {
                              type: "button",
                              class: "ordenar",
                              onclick: () => {
                                  ev.orden = { campo: c.id, dir: ev.orden.campo === c.id && ev.orden.dir === "asc" ? "desc" : "asc" };
                                  ctx.pintar();
                              },
                          },
                          c.nombre,
                          ev.orden.campo === c.id ? (ev.orden.dir === "asc" ? " ▲" : " ▼") : "",
                      )
                    : c.nombre,
            ),
        ),
    );

    const cuerpo = h("tbody");
    const orden = comparador(ev.orden.campo, ev.orden.dir, ctx);
    for (const g of grupos(tareas, ev.agrupar, ctx)) {
        if (ev.agrupar !== "nada" && !g.tareas.length && ev.agrupar !== "estado") continue;
        const plegado = ev.plegados[`${ev.agrupar}:${g.clave}`];
        if (g.nombre) {
            cuerpo.appendChild(
                h(
                    "tr",
                    { class: "fila-grupo" },
                    h(
                        "td",
                        { colspan: COLUMNAS.length + 1 },
                        h(
                            "button",
                            {
                                type: "button",
                                class: "grupo",
                                "aria-expanded": String(!plegado),
                                onclick: () => {
                                    ev.plegados[`${ev.agrupar}:${g.clave}`] = !plegado;
                                    ctx.pintar();
                                },
                            },
                            h("span", { class: "plegar" }, plegado ? "▸" : "▾"),
                            h("span", { class: "punto-estado", style: { background: g.color } }),
                            g.nombre,
                            h("span", { class: "cuenta" }, g.tareas.length),
                        ),
                    ),
                ),
            );
        }
        if (plegado) continue;
        for (const t of [...g.tareas].sort(orden)) cuerpo.appendChild(fila(t, ctx));
        cuerpo.appendChild(filaNueva(g.base, ctx, `nueva-${ev.agrupar}-${g.clave}`));
    }

    // La tabla va en un marco que marca con una sombra el lado por el que sigue si no cabe a lo ancho (como el mes del
    // calendario). Las columnas se esconden por orden para que quepa (estilo.css, «la lista en un panel estrecho»): la
    // sombra es el aviso que queda para un navegador que no sepa esconderlas.
    const tabla = h("table", { class: "lista" }, h("thead", null, cabecera), cuerpo);
    const envoltura = h(
        "div",
        { class: "lista-envoltura", "data-desplazar": "lista" },
        tabla,
        tareas.length ? null : h("p", { class: "nota centro vacio-vista" }, ctx.E.tareas.size ? "Ninguna tarea cumple los filtros." : "Todavía no hay tareas. Pulsa «+ Nueva» o escribe en «+ Nueva tarea»."),
    );
    const marco = h("div", { class: "lista-marco" }, envoltura);
    const marcarBordes = () => {
        marco.classList.toggle("sigue-izquierda", envoltura.scrollLeft > 2);
        marco.classList.toggle("sigue-derecha", envoltura.scrollLeft + envoltura.clientWidth < envoltura.scrollWidth - 2);
    };
    envoltura.addEventListener("scroll", marcarBordes, { passive: true });
    if (typeof ResizeObserver === "function") {
        // cambia lo que mide la caja (la ventana) o lo que mide la tabla (las letras, al terminar de cargarse)
        const observador = new ResizeObserver(marcarBordes);
        observador.observe(envoltura);
        observador.observe(tabla);
    }
    cont.append(barra, marco);
    marcarBordes();
}

// En una pantalla estrecha (≤ 720 px, el mismo corte que estilo.css) cada fila es una ficha pequeña: el título y,
// debajo, lo esencial. Ahí, y donde no hay ratón, un toque en la fila abre la tarea.
const filaEstrecha = () => window.matchMedia("(max-width: 720px)").matches;
const sinRaton = () => window.matchMedia("(hover: none)").matches;

// Una persona en su celda: el avatar y el nombre, que si no cabe en la columna acaba en «…» (entero, al pasar el ratón).
const persona = (u) => h("span", { class: "persona", title: u.nombre }, avatar(u), h("span", { class: "texto" }, u.nombre));

function celda(clase, contenido, alPulsar, titulo) {
    return h("td", { class: clase }, h("button", { type: "button", class: "celda", title: titulo, onclick: (e) => alPulsar(e.currentTarget) }, contenido));
}

function fila(t, ctx) {
    const est = estadoDe(t.estado);
    const prio = prioridadDe(t.prioridad);
    const p = plazo(t.fin, t.estado === "hecho");
    const responsables = t.responsables.map(ctx.usuario).filter(Boolean);
    const pedido = ctx.usuario(t.pedidoPor);
    const hecha = t.estado === "hecho";
    const titulo = h("input", {
        class: "celda-titulo",
        value: t.titulo,
        maxlength: 300,
        "aria-label": "Título",
        title: t.titulo, // si no cabe en su columna acaba en «…»: entero, al pasar el ratón
        onkeydown: (e) => {
            if (e.key === "Enter") e.target.blur();
            if (e.key === "Escape") {
                e.target.value = t.titulo;
                e.target.blur();
            }
        },
        onchange: (e) => {
            const v = e.target.value.replace(/\s+/g, " ").trim();
            if (v && v !== t.titulo) ctx.cambiar(t.id, { titulo: v });
            else e.target.value = t.titulo;
        },
    });
    const subtareas = () => (t.subtareas.length ? h("span", { class: "chip tenue" }, `☑ ${t.subtareas.filter((s) => s.hecha).length}/${t.subtareas.length}`) : null);
    const notas = () => (t.notas.trim() ? h("span", { class: "chip tenue", title: "Tiene notas" }, "¶") : null);
    // Lo esencial de la tarea en una línea, para la fila estrecha (en la ancha cada cosa tiene su columna).
    const resumen = h(
        "div",
        { class: "fila-resumen" },
        h("span", { class: "resumen-estado" }, h("span", { class: "punto-estado", style: { background: est.color } }), est.nombre),
        t.prioridad ? h("span", { class: "chip prioridad", style: { background: prio.color, color: prio.texto } }, prio.nombre) : null,
        responsables.length === 1 ? h("span", { class: "persona" }, avatar(responsables[0]), responsables[0].nombre) : responsables.length ? h("span", { class: "avatares" }, responsables.map((u) => avatar(u))) : null,
        p ? h("span", { class: ["chip", "plazo", p.clase], title: t.fin }, p.texto) : null,
        subtareas(),
        notas(),
    );
    return h(
        "tr",
        {
            class: ["fila", hecha && "hecha"],
            dataset: { id: t.id },
            style: { "--color-prioridad": prio.color },
            onclick: (e) => {
                // Fuera de lo que ya hace algo (la casilla, el texto que se edita, los botones de cada celda).
                if (!(filaEstrecha() || sinRaton()) || e.target.closest("input, button, a, label, select, textarea")) return;
                ctx.abrir(t.id);
            },
        },
        h(
            "td",
            { class: "col-hecha" },
            h(
                "label",
                { class: "zona-toque" },
                h("input", {
                    type: "checkbox",
                    class: "casilla",
                    checked: hecha,
                    title: hecha ? "Marcar como pendiente" : "Marcar como hecha",
                    "aria-label": "Hecha",
                    onchange: (e) => ctx.cambiar(t.id, { estado: e.target.checked ? "hecho" : "por-hacer" }),
                }),
            ),
        ),
        h(
            "td",
            { class: "col-titulo" },
            h(
                "div",
                { class: "titulo-celda" },
                titulo,
                h("span", { class: "titulo-texto" }, t.titulo),
                subtareas(),
                notas(),
                h("button", { type: "button", class: "btn pequeno abrir", title: "Abrir la tarea", onclick: () => ctx.abrir(t.id) }, "Abrir"),
            ),
            resumen,
        ),
        celda("col-estado", [h("span", { class: "punto-estado", style: { background: est.color } }), est.nombre], (a) => menuEstado(a, t.estado, (v) => ctx.cambiar(t.id, { estado: v }))),
        celda(
            "col-prioridad",
            t.prioridad ? h("span", { class: "chip prioridad", style: { background: prio.color, color: prio.texto } }, prio.nombre) : h("span", { class: "tenue" }, "—"),
            (a) => menuPrioridad(a, t.prioridad, (v) => ctx.cambiar(t.id, { prioridad: v })),
        ),
        celda(
            "col-responsables",
            responsables.length ? (responsables.length === 1 ? persona(responsables[0]) : h("span", { class: "avatares" }, responsables.map((u) => avatar(u)))) : h("span", { class: "tenue" }, "—"),
            (a) => menuPersonas(a, ctx.activos(), t.responsables, (v) => ctx.cambiar(t.id, { responsables: v })),
        ),
        celda("col-fin", p ? h("span", { class: ["chip", "plazo", p.clase] }, p.texto) : h("span", { class: "tenue" }, "—"), (a) => menuFecha(a, t.fin, (v) => ctx.cambiar(t.id, { fin: v })), t.fin || ""),
        celda("col-inicio", t.inicio ? fechaCorta(t.inicio) : h("span", { class: "tenue" }, "—"), (a) => menuFecha(a, t.inicio, (v) => ctx.cambiar(t.id, { inicio: v }), { titulo: "Empieza el" })),
        celda("col-etiquetas", t.etiquetas.length ? t.etiquetas.map((e) => chipEtiqueta(e)) : h("span", { class: "tenue" }, "—"), (a) => menuEtiquetas(a, t.etiquetas, ctx.todasEtiquetas(), (v) => ctx.cambiar(t.id, { etiquetas: v }))),
        celda("col-pedidoPor", pedido ? persona(pedido) : h("span", { class: "tenue" }, "—"), (a) => menuPersona(a, ctx.activos(), t.pedidoPor, (v) => ctx.cambiar(t.id, { pedidoPor: v }))),
    );
}

function filaNueva(base, ctx, clave) {
    const entrada = h("input", {
        class: "celda-nueva",
        "data-foco": clave,
        placeholder: "+ Nueva tarea",
        maxlength: 300,
        "aria-label": "Nueva tarea",
        onkeydown: async (e) => {
            if (e.key === "Escape") {
                e.target.value = "";
                e.target.blur();
                return;
            }
            if (e.key !== "Enter") return;
            const r = interpretar(e.target.value, ctx.activos());
            if (!r.titulo) return;
            e.target.value = "";
            const datos = { ...base, titulo: r.titulo, responsables: [...new Set([...(base.responsables || []), ...r.responsables])], etiquetas: r.etiquetas };
            if (r.prioridad) datos.prioridad = r.prioridad;
            if (r.fin) datos.fin = r.fin;
            await ctx.crear(datos);
        },
    });
    return h("tr", { class: "fila-nueva" }, h("td"), h("td", { colspan: COLUMNAS.length }, entrada));
}

export { abrirMenu, cerrarMenu };
