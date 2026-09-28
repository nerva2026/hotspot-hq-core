// Menús desplegables (estado, prioridad, personas, fechas, etiquetas), avisos y ventanas.

import { h, ESTADOS, PRIORIDADES, SIN_PRIORIDAD, hoy, sumarDias, lunesDe, fechaMedia, colorEtiqueta, normalizar, inicial } from "./util.js";

let abierto = null;

export function cerrarMenu() {
    if (!abierto) return;
    const m = abierto;
    abierto = null;
    m.el.remove();
    document.removeEventListener("pointerdown", m.fuera, true);
    document.removeEventListener("keydown", m.tecla, true);
    window.removeEventListener("resize", m.recolocar);
    m.alCerrar?.();
    if (m.ancla?.isConnected && m.devolverFoco) m.ancla.focus({ preventScroll: true });
}

export const hayMenu = () => abierto !== null;

// Abre un menú pegado a «ancla». «contenido» es un elemento o una función que lo crea.
export function abrirMenu(ancla, contenido, { clase = "", alCerrar, ancho } = {}) {
    cerrarMenu();
    const el = h("div", { class: ["menu", clase], role: "dialog" });
    if (ancho) el.style.width = `${ancho}px`;
    el.appendChild(typeof contenido === "function" ? contenido() : contenido);
    document.body.appendChild(el);
    const recolocar = () => colocar(el, ancla);
    recolocar();
    const fuera = (e) => {
        if (!el.contains(e.target) && !(ancla?.contains && ancla.contains(e.target))) cerrarMenu();
    };
    const tecla = (e) => {
        if (e.key === "Escape") {
            e.stopPropagation();
            abierto.devolverFoco = true;
            cerrarMenu();
        }
    };
    document.addEventListener("pointerdown", fuera, true);
    document.addEventListener("keydown", tecla, true);
    window.addEventListener("resize", recolocar);
    abierto = { el, ancla, fuera, tecla, recolocar, alCerrar };
    const primero = el.querySelector("input:not([type=checkbox]), button.opcion, [autofocus]");
    primero?.focus({ preventScroll: true });
    return el;
}

function colocar(el, ancla) {
    const margen = 8;
    const r = ancla.getBoundingClientRect ? ancla.getBoundingClientRect() : ancla;
    const w = el.offsetWidth;
    const alto = el.offsetHeight;
    let x = r.left;
    let y = r.bottom + 4;
    if (x + w > innerWidth - margen) x = Math.max(margen, innerWidth - margen - w);
    if (y + alto > innerHeight - margen) y = Math.max(margen, r.top - 4 - alto);
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
}

// Navegación con flechas entre las opciones de un menú.
function conFlechas(lista) {
    lista.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const ops = [...lista.querySelectorAll("button.opcion")];
        const i = ops.indexOf(document.activeElement);
        const j = e.key === "ArrowDown" ? Math.min(ops.length - 1, i + 1) : Math.max(0, i - 1);
        ops[j]?.focus();
        e.preventDefault();
    });
    return lista;
}

function opcion({ marcado, contenido, alElegir }) {
    return h(
        "button",
        { class: ["opcion", marcado && "marcada"], type: "button", onclick: alElegir },
        h("span", { class: "marca" }, marcado ? "✓" : ""),
        contenido,
    );
}

export function menuEstado(ancla, actual, alElegir) {
    abrirMenu(ancla, () =>
        conFlechas(
            h(
                "div",
                { class: "opciones" },
                ESTADOS.map((e) =>
                    opcion({
                        marcado: e.id === actual,
                        contenido: [h("span", { class: "punto-estado", style: { background: e.color } }), e.nombre],
                        alElegir: () => {
                            cerrarMenu();
                            alElegir(e.id);
                        },
                    }),
                ),
            ),
        ),
    );
}

export function menuPrioridad(ancla, actual, alElegir) {
    abrirMenu(ancla, () =>
        conFlechas(
            h(
                "div",
                { class: "opciones" },
                [...PRIORIDADES, SIN_PRIORIDAD].map((p) =>
                    opcion({
                        marcado: p.id === (actual || null),
                        contenido: [h("span", { class: "muestra-prioridad", style: { background: p.color } }), p.nombre],
                        alElegir: () => {
                            cerrarMenu();
                            alElegir(p.id);
                        },
                    }),
                ),
            ),
        ),
    );
}

export function avatar(u, { tam = "" } = {}) {
    if (!u) return h("span", { class: ["avatar", "vacio", tam], title: "Sin asignar" }, "?");
    return h("span", { class: ["avatar", tam], style: { background: u.color }, title: u.nombre }, inicial(u.nombre));
}

// Selección de varias personas (responsables).
export function menuPersonas(ancla, usuarios, seleccion, alCambiar) {
    let elegidos = new Set(seleccion);
    const pintar = (lista) => {
        lista.replaceChildren(
            ...usuarios.map((u) =>
                opcion({
                    marcado: elegidos.has(u.id),
                    contenido: [avatar(u), u.nombre],
                    alElegir: () => {
                        if (elegidos.has(u.id)) elegidos.delete(u.id);
                        else elegidos.add(u.id);
                        alCambiar([...elegidos]);
                        pintar(lista);
                        lista.querySelectorAll("button.opcion")[usuarios.indexOf(u)]?.focus();
                    },
                }),
            ),
            usuarios.length > 1
                ? h(
                      "div",
                      { class: "pie-menu" },
                      h(
                          "button",
                          {
                              type: "button",
                              class: "enlace",
                              onclick: () => {
                                  elegidos = new Set(elegidos.size === usuarios.length ? [] : usuarios.map((u) => u.id));
                                  alCambiar([...elegidos]);
                                  pintar(lista);
                              },
                          },
                          elegidos.size === usuarios.length ? "Nadie" : usuarios.length === 2 ? "Los dos" : "Todos",
                      ),
                  )
                : null,
        );
    };
    abrirMenu(ancla, () => {
        const lista = conFlechas(h("div", { class: "opciones" }));
        pintar(lista);
        return lista;
    });
}

// Una sola persona (pedido por).
export function menuPersona(ancla, usuarios, actual, alElegir) {
    abrirMenu(ancla, () =>
        conFlechas(
            h(
                "div",
                { class: "opciones" },
                [...usuarios, null].map((u) =>
                    opcion({
                        marcado: (u?.id || null) === (actual || null),
                        contenido: u ? [avatar(u), u.nombre] : [avatar(null), "Nadie"],
                        alElegir: () => {
                            cerrarMenu();
                            alElegir(u?.id || null);
                        },
                    }),
                ),
            ),
        ),
    );
}

// Fecha: calendario del navegador y atajos.
export function menuFecha(ancla, actual, alElegir, { titulo = "Para cuándo" } = {}) {
    const h0 = hoy();
    const viernes = sumarDias(lunesDe(h0), 4);
    const atajos = [
        ["Hoy", h0],
        ["Mañana", sumarDias(h0, 1)],
        [viernes > h0 ? "Este viernes" : "El viernes que viene", viernes > h0 ? viernes : sumarDias(viernes, 7)],
        ["Lunes que viene", sumarDias(lunesDe(h0), 7)],
        ["En 2 semanas", sumarDias(h0, 14)],
    ];
    abrirMenu(
        ancla,
        () => {
            const entrada = h("input", {
                type: "date",
                class: "campo",
                value: actual || "",
                onchange: (e) => {
                    if (e.target.value) {
                        cerrarMenu();
                        alElegir(e.target.value);
                    }
                },
                onkeydown: (e) => {
                    if (e.key === "Enter" && e.target.value) {
                        cerrarMenu();
                        alElegir(e.target.value);
                    }
                },
            });
            return h(
                "div",
                { class: "menu-fecha" },
                h("div", { class: "menu-titulo" }, titulo),
                entrada,
                conFlechas(
                    h(
                        "div",
                        { class: "opciones" },
                        atajos.map(([nombre, iso]) =>
                            opcion({
                                marcado: iso === actual,
                                contenido: [h("span", { class: "crece" }, nombre), h("span", { class: "tenue" }, fechaMedia(iso))],
                                alElegir: () => {
                                    cerrarMenu();
                                    alElegir(iso);
                                },
                            }),
                        ),
                        actual
                            ? opcion({
                                  marcado: false,
                                  contenido: [h("span", { class: "crece" }, "Quitar fecha")],
                                  alElegir: () => {
                                      cerrarMenu();
                                      alElegir(null);
                                  },
                              })
                            : null,
                    ),
                ),
            );
        },
        { ancho: 240 },
    );
}

export function chipEtiqueta(nombre, alQuitar) {
    return h(
        "span",
        { class: "etiqueta", style: { background: colorEtiqueta(nombre) } },
        `#${nombre}`,
        alQuitar
            ? h(
                  "button",
                  {
                      type: "button",
                      class: "quitar",
                      title: `Quitar #${nombre}`,
                      onclick: (e) => {
                          e.stopPropagation();
                          alQuitar();
                      },
                  },
                  "×",
              )
            : null,
    );
}

// Etiquetas: escribir para buscar o crear, clic para poner o quitar.
export function menuEtiquetas(ancla, actuales, todas, alCambiar) {
    let elegidas = [...actuales];
    abrirMenu(
        ancla,
        () => {
            const caja = h("div", { class: "menu-etiquetas" });
            const puestas = h("div", { class: "etiquetas-puestas" });
            const lista = conFlechas(h("div", { class: "opciones" }));
            const entrada = h("input", {
                class: "campo",
                placeholder: "Buscar o crear etiqueta…",
                maxlength: 30,
                oninput: () => pintar(),
                onkeydown: (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        const v = limpiar(entrada.value);
                        if (!v) return;
                        if (!elegidas.includes(v)) elegidas.push(v);
                        entrada.value = "";
                        alCambiar([...elegidas]);
                        pintar();
                    } else if (e.key === "Backspace" && !entrada.value && elegidas.length) {
                        elegidas.pop();
                        alCambiar([...elegidas]);
                        pintar();
                    } else if (e.key === "ArrowDown") {
                        lista.querySelector("button.opcion")?.focus();
                        e.preventDefault();
                    }
                },
            });
            const limpiar = (s) => normalizar(s).replace(/^#+/, "").replace(/\s+/g, "-").slice(0, 30);
            function pintar() {
                puestas.replaceChildren(
                    ...elegidas.map((e) =>
                        chipEtiqueta(e, () => {
                            elegidas = elegidas.filter((x) => x !== e);
                            alCambiar([...elegidas]);
                            pintar();
                        }),
                    ),
                );
                const q = limpiar(entrada.value);
                const sugeridas = todas.filter((e) => !elegidas.includes(e) && (!q || e.includes(q))).slice(0, 8);
                lista.replaceChildren(
                    ...sugeridas.map((e) =>
                        opcion({
                            marcado: false,
                            contenido: chipEtiqueta(e),
                            alElegir: () => {
                                elegidas.push(e);
                                entrada.value = "";
                                alCambiar([...elegidas]);
                                pintar();
                                entrada.focus();
                            },
                        }),
                    ),
                    q && !todas.includes(q) && !elegidas.includes(q)
                        ? opcion({
                              marcado: false,
                              contenido: ["Crear ", chipEtiqueta(q)],
                              alElegir: () => {
                                  elegidas.push(q);
                                  entrada.value = "";
                                  alCambiar([...elegidas]);
                                  pintar();
                                  entrada.focus();
                              },
                          })
                        : null,
                );
                if (!lista.children.length) lista.appendChild(h("div", { class: "vacio-menu" }, "Escribe para crear una etiqueta."));
            }
            pintar();
            caja.append(puestas, entrada, lista);
            return caja;
        },
        { ancho: 260 },
    );
}

// ---------- avisos abajo («Tarea borrada · Deshacer») ----------

let zonaAvisos = null;
export function aviso(texto, { accion, alAccion, duracion = 5000, tipo = "" } = {}) {
    if (!zonaAvisos) {
        zonaAvisos = h("div", { class: "avisos", "aria-live": "polite" });
        document.body.appendChild(zonaAvisos);
    }
    const el = h(
        "div",
        { class: ["aviso", tipo] },
        h("span", null, texto),
        accion
            ? h(
                  "button",
                  {
                      type: "button",
                      class: "enlace",
                      onclick: () => {
                          el.remove();
                          alAccion();
                      },
                  },
                  accion,
              )
            : null,
    );
    zonaAvisos.appendChild(el);
    setTimeout(() => el.remove(), duracion);
}

// ---------- ventana modal sencilla ----------

export function ventana(titulo, contenido, { ancho = 420, alCerrar } = {}) {
    cerrarMenu();
    const fondo = h("div", { class: "fondo-ventana" });
    const caja = h(
        "div",
        { class: "ventana", role: "dialog", "aria-modal": "true", style: { maxWidth: `${ancho}px` } },
        h("header", null, h("h2", null, titulo), h("button", { type: "button", class: "cerrar", title: "Cerrar (Esc)", onclick: () => cerrar() }, "×")),
        h("div", { class: "cuerpo-ventana" }, contenido),
    );
    fondo.appendChild(caja);
    const tecla = (e) => {
        if (e.key === "Escape" && !hayMenu()) {
            e.stopPropagation();
            cerrar();
        }
    };
    function cerrar() {
        fondo.remove();
        document.removeEventListener("keydown", tecla, true);
        alCerrar?.();
    }
    fondo.addEventListener("pointerdown", (e) => {
        if (e.target === fondo) cerrar();
    });
    document.addEventListener("keydown", tecla, true);
    document.body.appendChild(fondo);
    caja.querySelector("input, textarea, button:not(.cerrar)")?.focus();
    return { cerrar, caja };
}
