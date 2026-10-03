// Tablón de tareas de HOT SPOT S.L. · arranque, estado compartido, barra superior y filtros.

import { h, $, vaciar, quitarErrorAlCorregir, hoy, plazo, ESTADOS, PRIORIDADES, SIN_PRIORIDAD, pesoPrioridad, guardarLocal, leerLocal, fechaMedia, retrasar, MESES } from "./util.js";
import { api, escuchar, cuandoSePierdaLaSesion } from "./api.js";
import { pantallaEntrar, pantallaAlta } from "./acceso.js";
import { sinSolo, conSolo } from "./solo.js";
import { BUSQUEDA_AL_CARGAR } from "./capas.js";
import { pestanaEnDirecto } from "./libro-pestana.js";
import { coincide, prepararBusqueda } from "./tablon-buscar.js";
import { paraElegir, conTareas } from "./personas.js";
import { abrirMenu, cerrarMenu, hayMenu, aviso, ventana, avatar, chipEtiqueta, personaEnMenu } from "./menus.js";
import { hayArrastre } from "./arrastre.js";
import { interpretar } from "./rapida.js";
import { pintarTablero } from "./tablero.js";
import { pintarLista } from "./lista.js";
import { pintarCalendario } from "./calendario.js";
import { pintarCronograma } from "./cronograma.js";
import { abrirFicha, cerrarFicha, fichaAbierta, actualizarFicha } from "./ficha.js";
import { textoCumples, fechaCumple, cumpleValido, maximoDelMes } from "./cumple.js";
import { lanzarConfeti } from "./confeti.js";

const VISTAS = [
    { id: "tablero", nombre: "Tablero", tecla: "1", pintar: pintarTablero },
    { id: "lista", nombre: "Lista", tecla: "2", pintar: pintarLista },
    { id: "calendario", nombre: "Calendario", tecla: "3", pintar: pintarCalendario },
    { id: "cronograma", nombre: "Cronograma", tecla: "4", pintar: pintarCronograma },
];

const FILTROS_VACIOS = { texto: "", persona: "todos", prioridades: [], etiqueta: null, ocultarHechas: false };

// «Móvil» = ventana de hasta 600 px, el mismo corte que el CSS (también un panel estrecho de la oficina).
function enMovil() {
    return window.matchMedia("(max-width: 600px)").matches;
}

const E = {
    yo: null,
    usuarios: [],
    tareas: new Map(),
    vista: leerLocal("vista", null),
    filtros: { ...FILTROS_VACIOS, ...leerLocal("filtros", {}), texto: "" },
    porVista: {}, // estado propio de cada vista (mes del calendario, zoom del cronograma…)
    oficina: null, // { hoy, cumples, proximos } de /api/oficina: el día de la oficina y sus cumpleaños
};
// Sin vista guardada: en el móvil, la lista (por fecha), que allí se lee mejor que el tablero; en el resto, el tablero.
if (!VISTAS.some((v) => v.id === E.vista)) E.vista = enMovil() ? "lista" : "tablero";

const raiz = document.getElementById("app");
// La pestaña «Cuentas» aparece o desaparece sola cuando a esa persona le dan o le quitan el libro (libro-pestana.js).
const pestanaCuentas = pestanaEnDirecto({ pedir: api.yo, estado: E, href: "libro/" }); // la pone marcada, con «otra-pantalla»
// La tarea que pide la dirección al cargar («?tarea=…»), leída antes de que nadie toque el historial.
let tareaPedida = new URLSearchParams(BUSQUEDA_AL_CARGAR).get("tarea");
let dejarDeEscuchar = null;
let pintura = null;
let pintarAlSoltarFoco = false;

// ---------- acceso a los datos para las vistas ----------

const ctx = {
    E,
    usuario: (id) => E.usuarios.find((u) => u.id === id) || null,
    // Las personas que siguen en el crew (las que se fueron siguen saliendo en sus tareas antiguas).
    activos: () => E.usuarios.filter((u) => !u.baja),
    // Para los menús «Para quién» y «Pedido por» de una tarea: el crew de ahora y, además, quien ya está puesto en ella
    // aunque haya salido del crew (el menú lo marca «fuera del crew»): si no saliera, no habría manera de quitarlo.
    paraElegir: (...ids) => paraElegir(E.usuarios, ...ids),
    // El crew de ahora y quien ha salido pero sigue siendo responsable de alguna de esas tareas: para agrupar o filtrar
    // por persona sin que esas tareas se queden sin sitio.
    conTareas: (tareas) => conTareas(E.usuarios, tareas),
    todasEtiquetas() {
        const cuenta = new Map();
        for (const t of E.tareas.values()) for (const e of t.etiquetas) cuenta.set(e, (cuenta.get(e) || 0) + 1);
        return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([e]) => e);
    },
    // Tareas que pasan los filtros. «incluirHechas» ignora el filtro de ocultar hechas.
    visibles({ incluirHechas = false } = {}) {
        const f = E.filtros;
        // El buscador encuentra también por etiqueta («#bolos»), por persona («@víctor»), por prioridad y por estado (tablon-buscar.js).
        const palabras = prepararBusqueda(f.texto);
        const ayudas = { nombre: (id) => ctx.usuario(id)?.nombre || "" };
        return [...E.tareas.values()].filter((t) => {
            if (f.ocultarHechas && !incluirHechas && t.estado === "hecho") return false;
            if (f.persona === "yo" && !t.responsables.includes(E.yo.id)) return false;
            if (f.persona === "nadie" && t.responsables.length) return false;
            if (!["todos", "yo", "nadie"].includes(f.persona) && !t.responsables.includes(f.persona)) return false;
            if (f.prioridades.length && !f.prioridades.includes(t.prioridad || "ninguna")) return false;
            if (f.etiqueta && !t.etiquetas.includes(f.etiqueta)) return false;
            return coincide(t, palabras, ayudas);
        });
    },
    abrir: (id, opciones) => abrirFicha(id, ctx, opciones),
    nueva: (base) => nuevaTarea(base),
    async crear(parcial, { abrir = false } = {}) {
        const base = { ...parcial };
        // En «Mis tareas», lo nuevo es para mí si no se dice otra cosa.
        if (!base.responsables?.length && E.filtros.persona === "yo") base.responsables = [E.yo.id];
        if (!base.responsables?.length && E.usuarios.some((u) => u.id === E.filtros.persona)) base.responsables = [E.filtros.persona];
        try {
            const t = await api.crear(base);
            E.tareas.set(t.id, t);
            pintar();
            if (abrir) ctx.abrir(t.id, { nueva: true });
            else if (!ctx.visibles().some((x) => x.id === t.id)) aviso("Tarea creada (los filtros la ocultan).", { accion: "Ver", alAccion: () => ctx.abrir(t.id) });
            return t;
        } catch (err) {
            aviso(err.message, { tipo: "malo" });
            return null;
        }
    },
    // Devuelve «ok», «conflicto» (otra persona cambió las notas y el servidor no las ha pisado) o «error».
    async cambiar(id, cambios, opciones = {}) {
        const t = E.tareas.get(id);
        if (!t) return "error";
        const c = { ...cambios };
        // Al cambiar de columna sin decir dónde, la tarea va al final de la nueva.
        if (c.estado && c.estado !== t.estado && !("orden" in c)) {
            const orden = [...E.tareas.values()].filter((x) => x.estado === c.estado).reduce((m, x) => Math.max(m, x.orden), 0);
            c.orden = orden + 1;
        }
        const antes = { ...t };
        Object.assign(t, c);
        if (t.inicio && t.fin && t.inicio > t.fin) [t.inicio, t.fin] = [t.fin, t.inicio];
        if ("estado" in c) t.hechaEl = t.estado === "hecho" ? antes.hechaEl || new Date().toISOString() : null;
        t.actualizada = new Date().toISOString();
        t.actualizadaPor = E.yo.id;
        pintar();
        actualizarFicha(ctx);
        try {
            const nueva = await api.cambiar(id, c, opciones.antes, { alSalir: opciones.alSalir });
            // Solo se copian los campos que se han pedido: si mientras tanto se ha seguido escribiendo, no se pisa.
            const actual = E.tareas.get(id);
            if (actual) {
                for (const k of Object.keys(nueva)) if (!(k in c) || ["inicio", "fin", "hechaEl"].includes(k)) actual[k] = nueva[k];
            }
            pintar();
            actualizarFicha(ctx);
            return "ok";
        } catch (err) {
            if (err.estado === 409 && err.datos?.tarea) {
                // El tablero enseña lo que hay ahora, pero la ficha no se repinta: lo escrito sigue ahí hasta que se elija.
                E.tareas.set(id, err.datos.tarea);
                pintar();
                return "conflicto";
            }
            aviso(`No se ha guardado: ${err.message}`, { tipo: "malo" });
            await recargar();
            return "error";
        }
    },
    async borrar(id) {
        const t = E.tareas.get(id);
        if (!t) return;
        E.tareas.delete(id);
        if (fichaAbierta() === id) cerrarFicha({ forzar: true });
        pintar();
        try {
            await api.borrar(id);
            aviso(`Tarea borrada: «${t.titulo.slice(0, 40)}${t.titulo.length > 40 ? "…" : ""}»`, {
                accion: "Deshacer",
                duracion: 8000,
                alAccion: async () => {
                    const vuelta = await api.restaurar(id);
                    E.tareas.set(vuelta.id, vuelta);
                    pintar();
                },
            });
        } catch (err) {
            aviso(`No se ha borrado: ${err.message}`, { tipo: "malo" });
            await recargar();
        }
    },
    pintar: () => pintar(),
};

// ---------- pintar ----------

function pintar() {
    if (pintura) return;
    pintura = requestAnimationFrame(() => {
        pintura = null;
        pintarYa();
    });
}

function pintarYa() {
    if (!E.yo) return;
    if (hayArrastre()) {
        setTimeout(pintar, 120);
        return;
    }
    const cont = $("#vista");
    if (!cont) return;
    // Si alguien está escribiendo en la vista, se espera a que termine para no borrarle lo escrito…
    const activo = document.activeElement;
    let foco = null;
    if (activo && cont.contains(activo) && activo.matches("input:not([type=checkbox]), textarea")) {
        // …salvo en los campos de «nueva tarea», que se vuelven a crear con lo escrito y el cursor en su sitio.
        if (!activo.dataset.foco) {
            pintarAlSoltarFoco = true;
            return;
        }
        foco = { clave: activo.dataset.foco, valor: activo.value, desde: activo.selectionStart, hasta: activo.selectionEnd };
    }
    const desplazamientos = new Map([...cont.querySelectorAll("[data-desplazar]")].map((el) => [el.dataset.desplazar, [el.scrollLeft, el.scrollTop]]));
    const vista = VISTAS.find((v) => v.id === E.vista);
    vaciar(cont);
    cont.dataset.vista = vista.id;
    E.porVista[vista.id] ||= {};
    vista.pintar(cont, ctx, E.porVista[vista.id]);
    for (const el of cont.querySelectorAll("[data-desplazar]")) {
        const d = desplazamientos.get(el.dataset.desplazar);
        if (d) [el.scrollLeft, el.scrollTop] = d;
    }
    if (foco) {
        const el = cont.querySelector(`[data-foco="${CSS.escape(foco.clave)}"]`);
        if (el) {
            el.value = foco.valor;
            el.focus({ preventScroll: true });
            try {
                el.setSelectionRange(foco.desde, foco.hasta);
            } catch {
                /* algunos campos no tienen cursor */
            }
        }
    }
    pintarBarra();
}

document.addEventListener("focusout", () => {
    if (!pintarAlSoltarFoco) return;
    setTimeout(() => {
        const activo = document.activeElement;
        const cont = $("#vista");
        if (cont && activo && cont.contains(activo) && activo.matches("input, textarea")) return;
        pintarAlSoltarFoco = false;
        pintar();
    }, 0);
});

// ---------- barra superior y filtros ----------

function dentroDeLaOficina() {
    try {
        return window.top !== window;
    } catch {
        return true;
    }
}

function montar() {
    vaciar(raiz);
    document.body.classList.toggle("en-oficina", dentroDeLaOficina());
    raiz.append(
        h(
            "header",
            { class: "barra barra-tablon" },
            h("div", { class: "marca" }, h("span", { class: "logo" }, "HS"), h("h1", { class: "nombre-app" }, "TAREAS")),
            // Las pestañas a las otras pantallas, las mismas que en todas («otra-pantalla»: con ?solo=1 no salen, ver solo.js).
            h(
                "nav",
                { class: "pestanas pantallas otra-pantalla", "aria-label": "Aplicaciones" },
                h("span", { class: "pestana activa", "aria-current": "page" }, "Tareas"),
                E.yo.libro ? h("a", { class: "pestana otra-pantalla", href: "libro/" }, "Cuentas") : null,
                h("a", { class: "pestana otra-pantalla", href: "pizarra/" }, "Pizarra"),
                h("a", { class: "pestana otra-pantalla", href: "archivo/" }, "Archivo"),
                h("a", { class: "pestana otra-pantalla", href: "musica/" }, "Música"),
            ),
            // Las vistas del tablón: al lado del nombre en modo solo y en su propia línea cuando están las pestañas de arriba.
            h(
                "nav",
                { class: "pestanas vistas", "aria-label": "Vistas" },
                VISTAS.map((v) =>
                    h(
                        "button",
                        {
                            type: "button",
                            class: "pestana",
                            dataset: { vista: v.id },
                            title: `${v.nombre} (${v.tecla})`,
                            onclick: () => cambiarVista(v.id),
                        },
                        v.nombre,
                    ),
                ),
            ),
            // Solo en el móvil (≤ 600 px): las vistas en un botón y los filtros plegados detrás de otro, para que la cabecera quepa en una línea.
            h("button", { type: "button", class: "boton-vista", id: "boton-vista", "aria-haspopup": "menu", title: "Vistas", onclick: (e) => menuVistas(e.currentTarget) }),
            h("button", { type: "button", class: "filtro boton-filtros", id: "boton-filtros", "aria-controls": "filtros", "aria-expanded": "false", onclick: () => alternarFiltros() }, "Filtros", h("span", { class: "flecha" }, "▾")),
            h(
                "div",
                { class: "barra-derecha" },
                // «+ Nueva»: en un móvil de menos de 360 px no cabe entero y se queda en «+» (estilo.css); qué es lo dice «aria-label».
                h("button", { type: "button", class: "btn primario", id: "boton-nueva", title: "Nueva tarea (N)", "aria-label": "Nueva tarea", onclick: () => nuevaTarea() }, h("span", { "aria-hidden": "true" }, "+"), h("span", { class: "texto-nueva" }, "Nueva")),
                h("button", { type: "button", class: "boton-yo", id: "boton-yo", onclick: (e) => menuYo(e.currentTarget) }),
            ),
        ),
        h("div", { id: "cumple-aviso", class: "cumple-zona", hidden: true }),
        h(
            "div",
            { class: "filtros", id: "filtros" },
            h("input", {
                id: "buscar",
                class: "campo buscar",
                type: "search",
                placeholder: "Buscar…  ( / )",
                "aria-label": "Buscar tareas",
                value: E.filtros.texto,
                oninput: (e) => {
                    E.filtros.texto = e.target.value;
                    pintar();
                },
                onkeydown: (e) => {
                    if (e.key === "Escape") {
                        e.target.value = "";
                        E.filtros.texto = "";
                        e.target.blur();
                        pintar();
                    }
                },
            }),
            h("button", { type: "button", class: "filtro", id: "filtro-persona", onclick: (e) => menuFiltroPersona(e.currentTarget) }),
            h("button", { type: "button", class: "filtro", id: "filtro-prioridad", onclick: (e) => menuFiltroPrioridad(e.currentTarget) }),
            h("button", { type: "button", class: "filtro", id: "filtro-etiqueta", onclick: (e) => menuFiltroEtiqueta(e.currentTarget) }),
            h(
                "label",
                { class: "filtro interruptor" },
                h("input", {
                    type: "checkbox",
                    id: "filtro-hechas",
                    onchange: (e) => {
                        E.filtros.ocultarHechas = e.target.checked;
                        guardarFiltros();
                        pintar();
                    },
                }),
                h("span", null, "Ocultar hechas"),
            ),
            h("button", { type: "button", class: "enlace", id: "limpiar-filtros", onclick: limpiarFiltros }, "Quitar filtros"),
            h("div", { class: "resumen", id: "resumen" }),
        ),
        h("main", { id: "vista", class: "vista" }),
    );
    pintarYa();
    pintarCumple();
}

// ---------- cumpleaños: el aviso del día (con confeti) ----------

// Se puede cerrar hasta el día siguiente (de la oficina). El confeti sale una vez por página y aviso.
let confetiLanzado = null;

function pintarCumple() {
    const zona = $("#cumple-aviso");
    if (!zona || !E.yo) return;
    const oficina = E.oficina;
    const texto = oficina ? textoCumples(oficina.cumples, E.yo.id) : "";
    if (!texto || leerLocal("cumple-cerrado", null) === oficina.hoy) {
        zona.hidden = true;
        zona.replaceChildren();
        delete zona.dataset.texto;
        return;
    }
    zona.hidden = false;
    if (zona.dataset.texto === texto) return; // ya está puesto: no se repinta (ni se repite el confeti)
    zona.dataset.texto = texto;
    const mio = oficina.cumples.some((c) => c.id === E.yo.id);
    const aviso = h(
        "div",
        { class: ["cumple-aviso", mio && "mio"], role: "status" },
        h("button", { type: "button", class: "cumple-tarta", title: "¡Más confeti!", "aria-label": "Más confeti", onclick: () => lanzarConfeti({ desde: aviso.getBoundingClientRect() }) }),
        h("span", { class: "cumple-texto" }, texto),
        h(
            "button",
            {
                type: "button",
                class: "cumple-cerrar",
                title: "Cerrar hasta mañana",
                "aria-label": "Cerrar el aviso hasta mañana",
                onclick: () => {
                    guardarLocal("cumple-cerrado", oficina.hoy);
                    pintarCumple();
                },
            },
            "×",
        ),
    );
    zona.replaceChildren(aviso);
    const clave = `${oficina.hoy} ${texto}`;
    if (confetiLanzado !== clave) {
        confetiLanzado = clave;
        requestAnimationFrame(() => lanzarConfeti({ desde: aviso.getBoundingClientRect() }));
    }
}

async function cargarOficina() {
    if (!E.yo) return;
    try {
        E.oficina = await api.oficina();
    } catch {
        return; // sin conexión (ya se avisa) o sin sesión (ya se pasa a la pantalla de entrada)
    }
    pintarCumple();
}
const recargarOficina = retrasar(cargarOficina, 600);
// El día cambia a medianoche de la oficina: se pregunta de vez en cuando.
setInterval(() => {
    if (E.yo && !document.hidden) cargarOficina();
}, 10 * 60 * 1000);

function pintarBarra() {
    for (const b of document.querySelectorAll(".vistas .pestana")) {
        b.classList.toggle("activa", b.dataset.vista === E.vista);
        b.setAttribute("aria-current", b.dataset.vista === E.vista ? "page" : "false");
    }
    const yo = $("#boton-yo");
    if (yo) yo.replaceChildren(avatar(E.yo), h("span", { class: "nombre-yo" }, E.yo.nombre), h("span", { class: "flecha" }, "▾"));

    const f = E.filtros;
    const vistaActual = VISTAS.find((v) => v.id === E.vista);
    const botonVista = $("#boton-vista");
    // En el móvil no cabe el nombre de la pantalla al lado: va en pequeño dentro del botón, encima de la vista.
    if (botonVista) botonVista.replaceChildren(h("span", { class: "boton-vista-pantalla" }, "Tareas"), h("span", { class: "boton-vista-nombre" }, vistaActual.nombre, h("span", { class: "flecha" }, "▾")));
    const hayFiltros = Boolean(f.texto || f.persona !== "todos" || f.prioridades.length || f.etiqueta || f.ocultarHechas);
    $("#boton-filtros")?.classList.toggle("activo", hayFiltros);
    const persona = $("#filtro-persona");
    if (persona) {
        const u = ctx.usuario(f.persona);
        persona.replaceChildren(f.persona === "todos" ? "Todos" : f.persona === "yo" ? "Mis tareas" : f.persona === "nadie" ? "Sin asignar" : u ? u.nombre : "Todos", h("span", { class: "flecha" }, "▾"));
        persona.classList.toggle("activo", f.persona !== "todos");
    }
    const prio = $("#filtro-prioridad");
    if (prio) {
        const nombres = f.prioridades.map((p) => (p === "ninguna" ? "Sin prioridad" : PRIORIDADES.find((x) => x.id === p)?.nombre)).filter(Boolean);
        prio.replaceChildren(nombres.length ? nombres.join(", ") : "Prioridad", h("span", { class: "flecha" }, "▾"));
        prio.classList.toggle("activo", nombres.length > 0);
    }
    const etq = $("#filtro-etiqueta");
    if (etq) {
        etq.replaceChildren(f.etiqueta ? `#${f.etiqueta}` : "Etiqueta", h("span", { class: "flecha" }, "▾"));
        etq.classList.toggle("activo", Boolean(f.etiqueta));
    }
    const hechas = $("#filtro-hechas");
    if (hechas) hechas.checked = f.ocultarHechas;
    const limpiar = $("#limpiar-filtros");
    if (limpiar) limpiar.hidden = !hayFiltros;

    // Resumen: lo mío que vence hoy o ya ha vencido.
    const mias = [...E.tareas.values()].filter((t) => t.estado !== "hecho" && t.responsables.includes(E.yo.id) && t.fin);
    const atrasadas = mias.filter((t) => t.fin < hoy()).length;
    const deHoy = mias.filter((t) => t.fin === hoy()).length;
    const resumen = $("#resumen");
    if (resumen) {
        const partes = [];
        if (atrasadas) partes.push(h("span", { class: "chip plazo atrasada" }, `${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}`));
        if (deHoy) partes.push(h("span", { class: "chip plazo hoy" }, `${deHoy} para hoy`));
        resumen.replaceChildren(
            ...(partes.length
                ? [
                      h(
                          "button",
                          {
                              type: "button",
                              class: "enlace resumen-boton",
                              title: "Ver mis tareas",
                              onclick: () => {
                                  E.filtros.persona = "yo";
                                  guardarFiltros();
                                  pintar();
                              },
                          },
                          "Tú: ",
                          ...partes,
                      ),
                  ]
                : []),
        );
    }
}

function guardarFiltros() {
    const { texto, ...resto } = E.filtros;
    guardarLocal("filtros", resto);
}

function limpiarFiltros() {
    E.filtros = { ...FILTROS_VACIOS };
    const b = $("#buscar");
    if (b) b.value = "";
    guardarFiltros();
    pintar();
}

// En el móvil los filtros (con la búsqueda) están plegados detrás del botón «Filtros»; en pantallas anchas siempre se ven.
function alternarFiltros(abrir) {
    const panel = $("#filtros");
    if (!panel) return;
    const abierto = abrir ?? !panel.classList.contains("abiertos");
    panel.classList.toggle("abiertos", abierto);
    $("#boton-filtros")?.setAttribute("aria-expanded", String(abierto));
}

// En el móvil las pestañas son un solo botón con el nombre de la vista de ahora; este es su menú.
function menuVistas(ancla) {
    abrirMenu(ancla, () => opcionesMenu(VISTAS.map((v) => ({ contenido: v.nombre, marcado: v.id === E.vista, accion: () => cambiarVista(v.id) }))));
}

function cambiarVista(id) {
    if (E.vista === id) return;
    E.vista = id;
    guardarLocal("vista", id);
    cerrarMenu();
    // Al volver a una vista se pinta de nuevas: que se coloque otra vez en hoy (el calendario y el cronograma).
    if (E.porVista[id]) E.porVista[id].centrado = false;
    pintarYa();
}

function opcionesMenu(opciones) {
    const lista = h("div", { class: "opciones" });
    for (const o of opciones) {
        if (o === "-") {
            lista.appendChild(h("hr"));
            continue;
        }
        if (!o) continue;
        lista.appendChild(
            h(
                o.href ? "a" : "button",
                {
                    class: ["opcion", o.marcado && "marcada", o.otra && "otra-pantalla"],
                    type: o.href ? null : "button",
                    href: o.href,
                    download: o.download,
                    target: o.target,
                    rel: o.target ? "noopener" : null,
                    onclick: (e) => {
                        if (!o.mantener) cerrarMenu();
                        o.accion?.(e);
                    },
                },
                h("span", { class: "marca" }, o.marcado ? "✓" : o.icono || ""),
                o.contenido,
            ),
        );
    }
    return lista;
}

function menuFiltroPersona(ancla) {
    const elegir = (v) => () => {
        E.filtros.persona = v;
        guardarFiltros();
        pintar();
    };
    abrirMenu(ancla, () =>
        opcionesMenu([
            { contenido: "Todos", marcado: E.filtros.persona === "todos", accion: elegir("todos") },
            { contenido: "Mis tareas", marcado: E.filtros.persona === "yo", accion: elegir("yo") },
            "-",
            ...ctx.conTareas([...E.tareas.values()]).filter((u) => u.id !== E.yo.id).map((u) => ({ contenido: personaEnMenu(u), marcado: E.filtros.persona === u.id, accion: elegir(u.id) })),
            { contenido: [avatar(null), "Sin asignar"], marcado: E.filtros.persona === "nadie", accion: elegir("nadie") },
        ]),
    );
}

function menuFiltroPrioridad(ancla) {
    const pintarLista = () =>
        opcionesMenu(
            [...PRIORIDADES, { ...SIN_PRIORIDAD, id: "ninguna" }].map((p) => ({
                contenido: [h("span", { class: "muestra-prioridad", style: { background: p.color } }), p.nombre],
                marcado: E.filtros.prioridades.includes(p.id),
                mantener: true,
                accion: () => {
                    const s = new Set(E.filtros.prioridades);
                    if (s.has(p.id)) s.delete(p.id);
                    else s.add(p.id);
                    E.filtros.prioridades = PRIORIDADES.map((x) => x.id)
                        .concat("ninguna")
                        .filter((x) => s.has(x));
                    guardarFiltros();
                    pintar();
                    caja.replaceChildren(pintarLista());
                },
            })),
        );
    const caja = h("div");
    caja.appendChild(pintarLista());
    abrirMenu(ancla, caja);
}

function menuFiltroEtiqueta(ancla) {
    const todas = ctx.todasEtiquetas();
    abrirMenu(ancla, () =>
        todas.length
            ? opcionesMenu([
                  { contenido: "Todas", marcado: !E.filtros.etiqueta, accion: () => ((E.filtros.etiqueta = null), guardarFiltros(), pintar()) },
                  "-",
                  ...todas.map((e) => ({ contenido: chipEtiqueta(e), marcado: E.filtros.etiqueta === e, accion: () => ((E.filtros.etiqueta = e), guardarFiltros(), pintar()) })),
              ])
            : h("div", { class: "vacio-menu" }, "Todavía no hay etiquetas. Se ponen en cada tarea (o escribiendo #algo al crearla)."),
    );
}

// ---------- menú de la cuenta ----------

function menuYo(ancla) {
    const enOficina = dentroDeLaOficina();
    abrirMenu(ancla, () =>
        h(
            "div",
            null,
            h("div", { class: "menu-titulo" }, `Hola, ${E.yo.nombre}`),
            opcionesMenu([
                enOficina ? { contenido: "Abrir en pestaña nueva ↗", href: sinSolo(location.href.split("#")[0]), target: "_blank" } : null,
                { contenido: "Descargar en Excel", href: "api/excel", download: "" },
                { contenido: "Importar desde Excel…", accion: importarExcel },
                "-",
                // «otra»: lleva a otra pantalla (con ?solo=1 no sale, ver solo.js)
                E.yo.libro ? { contenido: "Libro de cuentas", href: "libro/", otra: true } : null,
                { contenido: "Pizarra", href: "pizarra/", otra: true },
                { contenido: "Archivo", href: "archivo/", otra: true },
                { contenido: "Música", href: "musica/", otra: true },
                E.yo.admin ? { contenido: "Crew: quién puede entrar…", accion: panelCrew } : null,
                { contenido: "Mi cuenta…", accion: ajustesYo },
                { contenido: "Atajos de teclado", accion: atajos },
                "-",
                { contenido: "Salir", accion: salir },
            ]),
        ),
    );
}

// ---------- el crew: quién puede entrar con Google ----------

async function panelCrew() {
    let info;
    try {
        info = await api.crew();
    } catch (err) {
        aviso(err.message, { tipo: "malo" });
        return;
    }
    const lista = h("div", { class: "crew-lista" });
    const recargarCrew = async () => {
        info = await api.crew();
        pintarCrew();
    };
    const accion = async (fn) => {
        try {
            await fn();
            await recargarCrew();
        } catch (err) {
            aviso(err.message, { tipo: "malo" });
        }
    };
    function editar(ancla, persona) {
        const nombre = h("input", { class: "campo", value: persona.nombre, maxlength: 24 });
        const correo = h("input", { class: "campo", type: "email", value: persona.email || "", placeholder: "correo@gmail.com", maxlength: 120 });
        const error = h("p", { class: "error" });
        const formulario = h(
            "form",
            {
                class: "menu-fecha",
                onsubmit: async (e) => {
                    e.preventDefault();
                    try {
                        await api.cambiarCrew(persona.id, { nombre: nombre.value, email: correo.value });
                        cerrarMenu();
                        await recargarCrew();
                    } catch (err) {
                        error.textContent = err.message;
                    }
                },
            },
            h("div", { class: "menu-titulo" }, "Nombre"),
            nombre,
            h("div", { class: "menu-titulo" }, "Correo de Google"),
            correo,
            error,
            h("button", { class: "btn primario pequeno", type: "submit" }, "Guardar"),
        );
        quitarErrorAlCorregir(formulario, error);
        abrirMenu(ancla, formulario, { ancho: 280 });
    }
    function pintarCrew() {
        const personas = [...info.crew].sort((a, b) => Number(a.baja) - Number(b.baja) || a.nombre.localeCompare(b.nombre));
        lista.replaceChildren(
            ...personas.map((p) => {
                const estado = p.baja ? ["fuera", "Fuera del crew"] : p.entradoEl ? ["dentro", "Ha entrado"] : p.email ? ["espera", "Aún no ha entrado"] : ["sin", "Sin correo: no puede entrar con Google"];
                let confirmando = false;
                const sacar = h(
                    "button",
                    {
                        type: "button",
                        class: "btn pequeno peligro",
                        onclick: () => {
                            if (!confirmando) {
                                confirmando = true;
                                sacar.textContent = "¿Seguro?";
                                setTimeout(() => {
                                    confirmando = false;
                                    if (sacar.isConnected) sacar.textContent = "Sacar";
                                }, 3000);
                                return;
                            }
                            accion(() => api.cambiarCrew(p.id, { baja: true }));
                        },
                    },
                    "Sacar",
                );
                return h(
                    "div",
                    { class: ["crew-fila", p.baja && "baja"] },
                    avatar(p),
                    h(
                        "div",
                        { class: "crew-datos" },
                        h("strong", null, p.nombre, p.admin ? h("span", { class: "chip crew-admin" }, "ADMIN") : null),
                        h("span", { class: "tenue" }, p.email || "sin correo"),
                        h("span", { class: ["crew-estado", estado[0]] }, estado[1]),
                        p.cumple ? h("span", { class: "crew-cumple" }, `Cumple: ${fechaCumple(p.cumple)}`) : null,
                    ),
                    h(
                        "div",
                        { class: "crew-botones" },
                        p.baja
                            ? h("button", { type: "button", class: "btn pequeno", onclick: () => accion(() => api.cambiarCrew(p.id, { baja: false })) }, "Readmitir")
                            : [
                                  h("button", { type: "button", class: "btn pequeno", onclick: (e) => editar(e.currentTarget, p) }, "Editar"),
                                  h(
                                      "button",
                                      { type: "button", class: "btn pequeno", title: p.admin ? "Quitar permisos de administración" : "Dar permisos de administración (puede cambiar el crew)", onclick: () => accion(() => api.cambiarCrew(p.id, { admin: !p.admin })) },
                                      p.admin ? "Quitar admin" : "Hacer admin",
                                  ),
                                  p.id === E.yo.id ? null : sacar,
                              ],
                    ),
                );
            }),
        );
    }
    pintarCrew();
    const correo = h("input", { class: "campo", type: "email", placeholder: "correo@gmail.com", required: true, maxlength: 120, "aria-label": "Correo de Google" });
    const nombre = h("input", { class: "campo", placeholder: "Nombre (opcional)", maxlength: 24, "aria-label": "Nombre" });
    const error = h("p", { class: "error", role: "alert" });
    const form = h(
        "form",
        {
            class: "crew-nuevo",
            onsubmit: async (e) => {
                e.preventDefault();
                error.textContent = "";
                try {
                    await api.anadirCrew({ email: correo.value, nombre: nombre.value });
                    correo.value = "";
                    nombre.value = "";
                    await recargarCrew();
                    aviso("Añadido al crew. Ya puede entrar con Google.");
                } catch (err) {
                    error.textContent = err.message;
                }
            },
        },
        correo,
        nombre,
        h("button", { class: "btn primario", type: "submit" }, "Añadir"),
    );
    quitarErrorAlCorregir(form, error);
    ventana(
        "Crew",
        h(
            "div",
            { class: "pila" },
            h("p", null, "Solo los correos de esta lista pueden entrar con Google a la oficina, la terraza y el tablón. Si sacas a alguien, pierde el acceso al momento; sus tareas se quedan."),
            info.google ? null : h("p", { class: "error" }, "El acceso con Google aún no está configurado en el servidor."),
            lista,
            h("h3", null, "Añadir a alguien"),
            form,
            error,
            h("p", { class: "nota" }, "Si no pones nombre, se usará el de su cuenta de Google la primera vez que entre."),
        ),
        { ancho: 640 },
    );
}

function ajustesYo() {
    const colores = ["#e0562a", "#3b82c4", "#3a9d5d", "#8e5cc4", "#d6457f", "#c79100", "#1f9e98", "#6b5f58"];
    let color = E.yo.color;
    const muestras = h("div", { class: "muestras" });
    const pintarMuestras = () =>
        muestras.replaceChildren(
            ...colores.map((c) =>
                h("button", {
                    type: "button",
                    class: ["muestra", c === color && "elegida"],
                    style: { background: c },
                    "aria-label": `Color ${c}`,
                    onclick: async () => {
                        color = c;
                        pintarMuestras();
                        try {
                            const { yo } = await api.cambiarYo({ color });
                            actualizarUsuario(yo);
                        } catch (err) {
                            aviso(err.message, { tipo: "malo" });
                        }
                    },
                }),
            ),
        );
    pintarMuestras();

    // Cumpleaños: solo día y mes. Se guarda en cuanto están los dos; «Quitar» lo borra.
    const dos = (n) => String(n).padStart(2, "0");
    const selMes = h("select", { class: "campo selector-cumple mes", "aria-label": "Mes de tu cumpleaños" }, h("option", { value: "" }, "Mes"), MESES.map((m, i) => h("option", { value: dos(i + 1) }, m)));
    const selDia = h("select", { class: "campo selector-cumple dia", "aria-label": "Día de tu cumpleaños" });
    const estadoCumple = h("p", { class: "nota estado-cumple", role: "status" });
    const quitarCumple = h("button", { type: "button", class: "btn pequeno quitar-cumple", title: "Quitar mi cumpleaños", onclick: () => guardarCumple(null) }, "Quitar");
    const pintarDias = () => {
        const maximo = selMes.value ? maximoDelMes(Number(selMes.value)) : 31;
        const elegido = selDia.value;
        selDia.replaceChildren(h("option", { value: "" }, "Día"), ...Array.from({ length: maximo }, (_, i) => h("option", { value: dos(i + 1) }, String(i + 1))));
        selDia.value = elegido && Number(elegido) <= maximo ? elegido : "";
    };
    const ponerCumple = (cumple) => {
        const [mes, dia] = cumpleValido(cumple) ? cumple.split("-") : ["", ""];
        selMes.value = mes;
        pintarDias();
        selDia.value = dia;
        quitarCumple.hidden = !cumple;
    };
    const decir = (texto, malo = false) => {
        estadoCumple.className = `${malo ? "error" : "nota"} estado-cumple`;
        estadoCumple.textContent = texto;
    };
    async function guardarCumple(cumple) {
        try {
            const { yo } = await api.cambiarYo({ cumple });
            actualizarUsuario(yo);
            ponerCumple(yo.cumple);
            decir(yo.cumple ? `Guardado: ${fechaCumple(yo.cumple)}.` : "Quitado.");
            cargarOficina();
        } catch (err) {
            decir(err.message, true);
        }
    }
    const alElegir = () => {
        pintarDias();
        if (!selDia.value || !selMes.value) return decir(selMes.value ? "Elige el día." : "Elige el mes.");
        const cumple = `${selMes.value}-${selDia.value}`;
        if (cumple !== E.yo.cumple) guardarCumple(cumple);
    };
    selMes.addEventListener("change", alElegir);
    selDia.addEventListener("change", alElegir);
    ponerCumple(E.yo.cumple);

    const actual = h("input", { class: "campo", type: "password", autocomplete: "current-password" });
    const nueva = h("input", { class: "campo", type: "password", autocomplete: "new-password", minlength: 8 });
    const error = h("p", { class: "error", role: "alert" });
    const v = ventana(
        "Mi cuenta",
        h(
            "div",
            { class: "pila" },
            E.yo.email ? h("p", null, "Entras con tu cuenta de Google ", h("strong", null, E.yo.email), ".") : null,
            h("div", { class: "etiqueta-campo" }, h("span", null, "Mi color"), muestras),
            h(
                "div",
                { class: "etiqueta-campo", role: "group", "aria-label": "Mi cumpleaños" },
                h("span", null, "Mi cumpleaños"),
                h("div", { class: "fila-cumple" }, selDia, selMes, quitarCumple),
                estadoCumple,
                h("p", { class: "nota" }, "Solo el día y el mes, sin el año. Lo ve el crew: sale en el tablón y en la oficina."),
            ),
            !E.yo.tieneClave ? null : h(
                "form",
                {
                    class: "pila",
                    onsubmit: async (e) => {
                        e.preventDefault();
                        error.textContent = "";
                        try {
                            await api.cambiarYo({ claveActual: actual.value, clave: nueva.value });
                            v.cerrar();
                            aviso("Contraseña cambiada.");
                        } catch (err) {
                            error.textContent = err.message;
                        }
                    },
                },
                h("h3", null, "Cambiar la contraseña"),
                h("label", { class: "etiqueta-campo" }, h("span", null, "Contraseña actual"), actual),
                h("label", { class: "etiqueta-campo" }, h("span", null, "Contraseña nueva (8 o más caracteres)"), nueva),
                error,
                h("button", { class: "btn primario", type: "submit" }, "Cambiar contraseña"),
            ),
        ),
    );
    quitarErrorAlCorregir(v.caja, error);
}

function atajos() {
    const fila = (tecla, que) => h("tr", null, h("td", null, h("kbd", null, tecla)), h("td", null, que));
    ventana(
        "Atajos",
        h(
            "div",
            { class: "pila" },
            h("table", { class: "tabla-atajos" }, fila("N", "Nueva tarea"), fila("/", "Buscar"), fila("1 – 4", "Tablero, lista, calendario, cronograma"), fila("Esc", "Cerrar la tarea abierta")),
            h("h3", null, "Al escribir una tarea nueva"),
            h(
                "table",
                { class: "tabla-atajos" },
                fila("@víctor", "Para quién (o @todos)"),
                fila("!urgente  !alta  !media  !baja", "Prioridad (también !!! y !!)"),
                fila("#etiqueta", "Etiqueta"),
                fila("para mañana", "Fecha: hoy, mañana, el viernes, el 15/10, el 3 de noviembre…"),
            ),
        ),
        { ancho: 520 },
    );
}

function importarExcel() {
    const entrada = h("input", { type: "file", accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", hidden: true });
    entrada.addEventListener("change", async () => {
        const archivo = entrada.files[0];
        entrada.remove();
        if (!archivo) return;
        try {
            const r = await api.importar(archivo);
            for (const t of r.tareas) E.tareas.set(t.id, t);
            pintar();
            aviso(
                r.importadas
                    ? `Importadas ${r.importadas} tarea${r.importadas > 1 ? "s" : ""} de la hoja «${r.hoja}»${r.repetidas ? ` (${r.repetidas} ya estaban)` : ""}.`
                    : `No había tareas nuevas en «${r.hoja}»${r.repetidas ? ` (${r.repetidas} ya estaban)` : ""}.`,
                { duracion: 7000 },
            );
        } catch (err) {
            aviso(err.message, { tipo: "malo", duracion: 8000 });
        }
    });
    document.body.appendChild(entrada);
    entrada.click();
}

async function salir() {
    try {
        await api.salir();
    } catch {
        /* da igual: se sale igualmente */
    }
    sinSesion();
}

// ---------- tarea nueva (alta rápida) ----------

function nuevaTarea(base = {}) {
    const vista = h("div", { class: "piezas" });
    const entrada = h("input", {
        class: "campo grande",
        placeholder: "¿Qué hay que hacer?",
        maxlength: 300,
        "aria-label": "Título de la tarea",
    });
    const interpretado = () => interpretar(entrada.value, ctx.activos());
    const pintarPiezas = () => {
        const r = interpretado();
        const piezas = [];
        const personas = [...new Set([...(base.responsables || []), ...r.responsables])];
        for (const id of personas) {
            const u = ctx.usuario(id);
            if (u) piezas.push(h("span", { class: "chip" }, avatar(u), u.nombre));
        }
        const prio = r.prioridad || base.prioridad;
        if (prio) {
            const p = PRIORIDADES.find((x) => x.id === prio);
            piezas.push(h("span", { class: "chip prioridad", style: { background: p.color, color: p.texto } }, p.nombre));
        }
        const fin = r.fin || base.fin;
        if (fin) piezas.push(h("span", { class: "chip" }, `Para el ${fechaMedia(fin)}`));
        for (const e of r.etiquetas) piezas.push(chipEtiqueta(e));
        if (base.estado && base.estado !== "por-hacer") piezas.push(h("span", { class: "chip" }, ESTADOS.find((x) => x.id === base.estado)?.nombre));
        vista.replaceChildren(...(piezas.length ? piezas : [h("span", { class: "nota" }, "Atajos: @persona  !alta  #etiqueta  para el viernes")]));
    };
    entrada.addEventListener("input", pintarPiezas);
    const crear = async (abrir) => {
        const r = interpretado();
        if (!r.titulo) {
            entrada.focus();
            return;
        }
        const tarea = {
            ...base,
            titulo: r.titulo,
            responsables: [...new Set([...(base.responsables || []), ...r.responsables])],
            etiquetas: [...new Set([...(base.etiquetas || []), ...r.etiquetas])],
        };
        if (r.prioridad) tarea.prioridad = r.prioridad;
        if (r.fin) tarea.fin = r.fin;
        const t = await ctx.crear(tarea, { abrir });
        if (!t) return;
        if (abrir) v.cerrar();
        else {
            entrada.value = "";
            pintarPiezas();
            entrada.focus();
            aviso(`Creada: «${t.titulo}»`, { accion: "Abrir", alAccion: () => (v.cerrar(), ctx.abrir(t.id)) });
        }
    };
    entrada.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            crear(e.shiftKey);
        }
    });
    pintarPiezas();
    const v = ventana(
        "Nueva tarea",
        h(
            "div",
            { class: "pila" },
            entrada,
            vista,
            h(
                "div",
                { class: "acciones-ventana" },
                h("span", { class: "nota" }, "Intro: crear y seguir · Mayús+Intro: crear y abrir"),
                h("button", { type: "button", class: "btn", onclick: () => crear(true) }, "Crear y abrir"),
                h("button", { type: "button", class: "btn primario", onclick: () => crear(false) }, "Crear"),
            ),
        ),
        { ancho: 560 },
    );
    entrada.focus();
}

// ---------- tiempo real ----------

function actualizarUsuario(u) {
    const i = E.usuarios.findIndex((x) => x.id === u.id);
    if (i >= 0) E.usuarios[i] = u;
    else E.usuarios.push(u);
    if (E.yo.id === u.id) E.yo = { ...E.yo, ...u };
    pintar();
}

function alRecibir(ev) {
    pestanaCuentas.alRecibir(ev);
    if (ev.tipo === "tarea") {
        E.tareas.set(ev.tarea.id, ev.tarea);
        pintar();
        if (fichaAbierta() === ev.tarea.id) actualizarFicha(ctx, { deFuera: true });
    } else if (ev.tipo === "borrada") {
        E.tareas.delete(ev.id);
        if (fichaAbierta() === ev.id) {
            cerrarFicha({ forzar: true });
            const quien = ctx.usuario(ev.autor);
            aviso(`${quien ? quien.nombre : "Alguien"} ha borrado la tarea que tenías abierta.`);
        }
        pintar();
    } else if (ev.tipo === "usuarios") {
        E.usuarios = ev.usuarios;
        const yo = ev.usuarios.find((u) => u.id === E.yo.id);
        if (yo) E.yo = { ...E.yo, ...yo };
        pintar();
        recargarOficina(); // alguien ha puesto o cambiado su cumpleaños (o su nombre)
    }
}

async function recargar() {
    try {
        cargar(await api.datos());
    } catch {
        /* sin conexión: ya se avisará */
        return;
    }
    pestanaCuentas.repintar();
    cargarOficina();
}

function cargar(datos) {
    E.yo = datos.yo;
    E.usuarios = datos.usuarios;
    E.tareas = new Map(datos.tareas.map((t) => [t.id, t]));
    if (E.filtros.persona && !["todos", "yo", "nadie"].includes(E.filtros.persona) && !ctx.usuario(E.filtros.persona)) E.filtros.persona = "todos";
    pintar();
    if (fichaAbierta()) {
        if (E.tareas.has(fichaAbierta())) actualizarFicha(ctx, { deFuera: true });
        else cerrarFicha({ forzar: true });
    }
}

function empezar(datos) {
    cargar(datos);
    // Para el puente de la oficina (/tareas/oficina/): si estaba sin sesión, se entera al momento.
    guardarLocal("sesion", Date.now());
    montar();
    dejarDeEscuchar?.();
    dejarDeEscuchar = escuchar(alRecibir, recargar);
    cargarOficina();
    // «?tarea=…»: el enlace a una tarea (o la página recargada con su ficha abierta). La dirección de debajo se queda
    // limpia y la ficha pone la suya al abrirse (capas.js): así «atrás» la cierra y deja el tablón, sin la tarea.
    const pedida = tareaPedida;
    tareaPedida = null; // solo la primera vez (al volver a entrar tras perder la sesión, no)
    if (pedida) {
        if (new URLSearchParams(location.search).has("tarea")) history.replaceState(history.state, "", conSolo(location.pathname));
        if (E.tareas.has(pedida)) ctx.abrir(pedida);
    }
}

function sinSesion() {
    dejarDeEscuchar?.();
    dejarDeEscuchar = null;
    E.yo = null;
    E.oficina = null;
    cerrarFicha({ forzar: true });
    cerrarMenu();
    pantallaEntrar(raiz, empezar);
}
cuandoSePierdaLaSesion(() => {
    if (E.yo) sinSesion();
});

// ---------- teclado ----------

document.addEventListener("keydown", (e) => {
    if (!E.yo || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest("input, textarea, select, [contenteditable=true]") || document.querySelector(".fondo-ventana") || hayMenu()) return;
    if (e.key === "Escape" && fichaAbierta()) {
        cerrarFicha();
        return;
    }
    if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        nuevaTarea();
    } else if (e.key === "/") {
        e.preventDefault();
        alternarFiltros(true); // en el móvil la búsqueda está dentro de los filtros plegados
        $("#buscar")?.focus();
    } else {
        const v = VISTAS.find((x) => x.tecla === e.key);
        if (v) cambiarVista(v.id);
    }
});

// Al volver a la pestaña después de un rato, se refresca por si se ha perdido algún aviso.
let oculta = 0;
document.addEventListener("visibilitychange", () => {
    if (document.hidden) oculta = Date.now();
    else if (E.yo && oculta && Date.now() - oculta > 60000) recargar();
});

// ---------- inicio ----------

(async function inicio() {
    const alta = /[#&]alta=([\w-]+)/.exec(location.hash);
    if (alta) {
        pantallaAlta(raiz, alta[1], empezar);
        return;
    }
    try {
        empezar(await api.datos());
    } catch (err) {
        if (err.estado === 401) pantallaEntrar(raiz, empezar);
        else
            vaciar(raiz).appendChild(
                h(
                    "main",
                    { class: "acceso" },
                    h("div", { class: "acceso-caja" }, h("h1", null, "No hay conexión"), h("p", null, err.message), h("button", { class: "btn ancho", type: "button", onclick: () => location.reload() }, "Reintentar")),
                ),
            );
    }
})();

export { ctx, pesoPrioridad, plazo };
