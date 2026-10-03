// Vista «Cronograma»: cada tarea es una barra de su inicio a su final sobre una línea de tiempo.
// Arrastra la barra para moverla, sus bordes para alargarla o acortarla, y en una fila «sin fechas»
// haz clic o arrastra para ponérselas.

import { h, hoy, aFecha, sumarDias, diasEntre, lunesDe, primeroDeMes, sumarMeses, MESES, MESES_CORTOS, ESTADOS, prioridadDe, pesoPrioridad, fechaMedia, fechaCorta } from "./util.js";
import { avatar } from "./menus.js";
import { arrastrable, autoDesplazamiento } from "./arrastre.js";

const ZOOMS = [
    { id: "dias", nombre: "Días", px: 34 },
    { id: "semanas", nombre: "Semanas", px: 14 },
    { id: "meses", nombre: "Meses", px: 4 },
];
const AGRUPAR = [
    { id: "nada", nombre: "Nada" },
    { id: "estado", nombre: "Estado" },
    { id: "persona", nombre: "Persona" },
];
const LETRAS = ["L", "M", "X", "J", "V", "S", "D"];

const rango = (t) => {
    const a = t.inicio || t.fin;
    const b = t.fin || t.inicio;
    return a && b ? [a, b] : null;
};

function limites(tareas, zoom) {
    const h0 = hoy();
    const fechas = tareas.flatMap((t) => [t.inicio, t.fin]).filter(Boolean).sort();
    const margenAntes = { dias: 14, semanas: 28, meses: 90 }[zoom];
    const margenDespues = { dias: 60, semanas: 150, meses: 400 }[zoom];
    let desde = sumarDias(h0, -margenAntes);
    let hasta = sumarDias(h0, margenDespues);
    if (fechas.length) {
        const primera = fechas[0] < sumarDias(h0, -540) ? sumarDias(h0, -540) : fechas[0];
        const ultima = fechas[fechas.length - 1] > sumarDias(h0, 900) ? sumarDias(h0, 900) : fechas[fechas.length - 1];
        if (sumarDias(primera, -7) < desde) desde = sumarDias(primera, -7);
        if (sumarDias(ultima, 21) > hasta) hasta = sumarDias(ultima, 21);
    }
    desde = zoom === "meses" ? primeroDeMes(desde) : lunesDe(desde);
    return { desde, dias: diasEntre(desde, hasta) + 1 };
}

// Tramos de la escala: meses (arriba) y días, semanas o meses (abajo).
function tramos(desde, dias, tipo) {
    const salida = [];
    let i = 0;
    while (i < dias) {
        const f = sumarDias(desde, i);
        const d = aFecha(f);
        let largo;
        let texto;
        let mes = null;
        if (tipo === "mes") {
            const siguiente = sumarMeses(f, 1);
            largo = Math.min(dias - i, diasEntre(f, siguiente));
            texto = `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
            // por piezas, para que el rótulo se pueda acortar donde no cabe entero (ver rotuloMayor)
            mes = { largo: MESES[d.getUTCMonth()], corto: MESES_CORTOS[d.getUTCMonth()], anio: d.getUTCFullYear() };
        } else if (tipo === "anio") {
            const siguiente = `${d.getUTCFullYear() + 1}-01-01`;
            largo = Math.min(dias - i, diasEntre(f, siguiente));
            texto = String(d.getUTCFullYear());
        } else if (tipo === "mes-corto") {
            const siguiente = sumarMeses(f, 1);
            largo = Math.min(dias - i, diasEntre(f, siguiente));
            texto = MESES_CORTOS[d.getUTCMonth()];
        } else if (tipo === "semana") {
            largo = Math.min(dias - i, 7 - ((d.getUTCDay() + 6) % 7));
            texto = String(d.getUTCDate());
        } else {
            largo = 1;
            texto = `${LETRAS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()}`;
        }
        salida.push({ i, largo, texto, mes, fecha: f, finde: tipo === "dia" && (d.getUTCDay() === 0 || d.getUTCDay() === 6) });
        i += largo;
    }
    return salida;
}

// El rótulo de un mes (o de un año) en la fila de arriba de la escala. Va pegado al borde visible mientras su tramo
// esté a la vista (sticky, en estilo.css), así que siempre se lee entero en qué mes se está. Donde no cabe se acorta en
// vez de cortarse: «septiembre 2026» → «sep 2026» → «sep» → nada, según lo que mida el tramo (uno de pocos días, en
// los extremos de la línea de tiempo); y en un móvil (CSS, 600 px o menos) sin el año si es el de ahora.
const ANCHO_LETRA_MAYOR = 12; // px por letra de Silkscreen a 16 px, tirando por lo alto
const cabeRotulo = (texto, ancho) => texto.length * ANCHO_LETRA_MAYOR + 12 <= ancho;
function rotuloMayor(t, ancho) {
    if (!t.mes) return cabeRotulo(t.texto, ancho) ? h("span", { class: "rotulo-mayor" }, t.texto) : null;
    const { largo, corto, anio } = t.mes;
    const forma = cabeRotulo(`${largo} ${anio}`, ancho) ? "entero" : cabeRotulo(`${corto} ${anio}`, ancho) ? "corto" : cabeRotulo(corto, ancho) ? "minimo" : null;
    if (!forma) return null;
    const esteAnio = String(anio) === hoy().slice(0, 4);
    return h("span", { class: ["rotulo-mayor", forma, esteAnio ? "este-anio" : "otro-anio"] }, h("span", { class: "mes-largo" }, largo), h("span", { class: "mes-corto" }, corto), h("span", { class: "anio" }, ` ${anio}`));
}

export function pintarCronograma(cont, ctx, ev) {
    ev.zoom ||= "dias";
    ev.agrupar ||= "nada";
    const zoom = ZOOMS.find((z) => z.id === ev.zoom) || ZOOMS[0];
    const px = zoom.px;
    const tareas = ctx.visibles();
    const { desde, dias } = limites(tareas, zoom.id);
    const ancho = dias * px;
    const h0 = hoy();
    const x = (fecha) => diasEntre(desde, fecha) * px;

    const desplazar = (n) => {
        const s = cont.querySelector(".crono");
        s?.scrollBy({ left: n * px, behavior: "smooth" });
    };
    const irAHoy = (suave = true) => {
        const s = cont.querySelector(".crono");
        if (!s) return;
        const izq = parseFloat(getComputedStyle(s).getPropertyValue("--ancho-nombre")) || 240;
        s.scrollTo({ left: Math.max(0, x(h0) - (s.clientWidth - izq) * 0.25), behavior: suave ? "smooth" : "auto" });
    };
    const salto = { dias: 7, semanas: 28, meses: 90 }[zoom.id];

    const barra = h(
        "div",
        { class: "barra-vista" },
        h("button", { type: "button", class: "btn pequeno", title: "Antes", onclick: () => desplazar(-salto) }, "‹"),
        h("button", { type: "button", class: "btn pequeno", onclick: () => irAHoy() }, "Hoy"),
        h("button", { type: "button", class: "btn pequeno", title: "Después", onclick: () => desplazar(salto) }, "›"),
        h("span", { class: "separador" }),
        h(
            "div",
            { class: "segmentos" },
            ZOOMS.map((z) => h("button", { type: "button", class: ["segmento", z.id === zoom.id && "activo"], onclick: () => ((ev.zoom = z.id), (ev.centrado = false), ctx.pintar()) }, z.nombre)),
        ),
        // La etiqueta y su selector van juntos y no se separan al saltar de línea: sin ella, «Nada» no se sabía de qué.
        h(
            "span",
            { class: "con-etiqueta" },
            h("span", { class: "tenue" }, "Agrupar"),
            h(
                "div",
                { class: "segmentos", role: "group", "aria-label": "Agrupar" },
                AGRUPAR.map((a) => h("button", { type: "button", class: ["segmento", a.id === ev.agrupar && "activo"], onclick: () => ((ev.agrupar = a.id), ctx.pintar()) }, a.nombre)),
            ),
        ),
    );

    // --- escala ---
    const arriba = tramos(desde, dias, zoom.id === "meses" ? "anio" : "mes");
    const abajo = tramos(desde, dias, zoom.id === "dias" ? "dia" : zoom.id === "semanas" ? "semana" : "mes-corto");
    const escala = h(
        "div",
        { class: "crono-escala", style: { width: `${ancho}px` } },
        h(
            "div",
            { class: "crono-escala-fila" },
            arriba.map((t) => h("div", { class: "crono-tramo mayor", title: t.texto, style: { left: `${t.i * px}px`, width: `${t.largo * px}px` } }, rotuloMayor(t, t.largo * px))),
        ),
        h(
            "div",
            { class: "crono-escala-fila" },
            abajo.map((t) =>
                h(
                    "div",
                    { class: ["crono-tramo", t.finde && "finde", t.fecha === h0 && "hoy", zoom.id !== "dias" && t.fecha <= h0 && sumarDias(t.fecha, t.largo - 1) >= h0 && "hoy"], style: { left: `${t.i * px}px`, width: `${t.largo * px}px` }, title: t.largo === 1 ? fechaMedia(t.fecha) : `${fechaCorta(t.fecha)} – ${fechaCorta(sumarDias(t.fecha, t.largo - 1))}` },
                    t.texto,
                ),
            ),
        ),
    );

    // --- filas ---
    const conFechas = tareas.filter(rango).sort((a, b) => {
        const [aa, ab] = rango(a);
        const [ba, bb] = rango(b);
        return aa.localeCompare(ba) || ab.localeCompare(bb) || pesoPrioridad(a.prioridad) - pesoPrioridad(b.prioridad);
    });
    const sinFechas = tareas.filter((t) => !rango(t)).sort((a, b) => pesoPrioridad(a.prioridad) - pesoPrioridad(b.prioridad) || a.orden - b.orden);

    let grupos;
    if (ev.agrupar === "estado") grupos = ESTADOS.map((e) => ({ nombre: e.nombre, color: e.color, tareas: conFechas.filter((t) => t.estado === e.id) }));
    else if (ev.agrupar === "persona")
        grupos = [
            ...ctx.activos().map((u) => ({ nombre: u.nombre, color: u.color, tareas: conFechas.filter((t) => t.responsables.includes(u.id)) })),
            { nombre: "Sin asignar", color: "#d8cabb", tareas: conFechas.filter((t) => !t.responsables.length) },
        ];
    else grupos = [{ nombre: null, tareas: conFechas }];
    grupos = grupos.filter((g) => g.tareas.length || !g.nombre);
    if (sinFechas.length) grupos.push({ nombre: "Sin fechas", color: "#d8cabb", tareas: sinFechas, sinFechas: true, ayuda: "Haz clic en su fila (o arrastra) para ponerle fechas." });

    const cuerpo = h("div", { class: "crono-cuerpo" });
    // Fondo: fines de semana, separación de meses y la línea de hoy.
    const fondo = h("div", { class: "crono-fondo", style: { width: `${ancho}px` } });
    if (zoom.id !== "meses") fondo.style.backgroundImage = `repeating-linear-gradient(90deg, transparent 0 ${5 * px}px, rgba(28,23,21,.06) ${5 * px}px ${7 * px}px)`;
    for (const t of arriba) if (t.i > 0) fondo.appendChild(h("div", { class: "crono-separador", style: { left: `${t.i * px}px` } }));
    if (zoom.id === "meses") for (const t of abajo) if (t.i > 0) fondo.appendChild(h("div", { class: "crono-separador suave", style: { left: `${t.i * px}px` } }));
    if (h0 >= desde && diasEntre(desde, h0) < dias) fondo.appendChild(h("div", { class: "crono-hoy", style: { left: `${x(h0) + px / 2}px` }, title: "Hoy" }));
    cuerpo.appendChild(fondo);

    for (const g of grupos) {
        if (g.nombre) {
            cuerpo.appendChild(
                h(
                    "div",
                    { class: "crono-grupo" },
                    h("div", { class: "crono-grupo-nombre" }, h("span", { class: "punto-estado", style: { background: g.color } }), g.nombre, h("span", { class: "cuenta" }, g.tareas.length), g.ayuda ? h("span", { class: "tenue ayuda" }, g.ayuda) : null),
                ),
            );
        }
        for (const t of g.tareas) cuerpo.appendChild(fila(t, { px, desde, dias, ancho, x, ctx, sinFechas: Boolean(g.sinFechas) }));
    }
    if (!tareas.length) cuerpo.appendChild(h("p", { class: "nota vacio-vista", style: { position: "sticky", left: "0" } }, ctx.E.tareas.size ? "Ninguna tarea cumple los filtros." : "Todavía no hay tareas."));

    const lienzo = h(
        "div",
        { class: "crono-lienzo", style: { width: `calc(var(--ancho-nombre) + ${ancho}px)` } },
        h("div", { class: "crono-cabecera" }, h("div", { class: "crono-esquina" }, `${tareas.length} tarea${tareas.length === 1 ? "" : "s"}`), escala),
        cuerpo,
    );
    // «--desplazado» es cuánto se ha corrido la línea de tiempo: con él, el título de una barra que empieza antes del
    // borde izquierdo se pega al borde visible en vez de salir cortado por delante (ver .crono-barra .texto).
    // Y el rótulo de un mes solo se enseña si cabe entero en lo que se ve de su tramo: el del mes que se va por la
    // izquierda se quita cuando ya no cabe en lo que queda («…BRE 2026» al lado del mes siguiente) y el del que entra
    // por la derecha no sale hasta que cabe («OCTUB» contra el borde). Siempre queda uno entero a la vista.
    const rotulos = arriba.map((t, n) => ({ el: escala.firstElementChild.children[n].querySelector(".rotulo-mayor"), inicio: t.i * px, fin: (t.i + t.largo) * px })).filter((r) => r.el);
    const alDesplazar = () => {
        const corrido = Math.round(scroll.scrollLeft);
        const aLaVista = scroll.clientWidth - (parseFloat(getComputedStyle(scroll).getPropertyValue("--ancho-nombre")) || 240); // lo que se ve de la línea de tiempo
        const sinSitio = rotulos.map((r) => {
            const ancho = r.el.offsetWidth;
            return r.fin - corrido < ancho || Math.max(0, r.inicio - corrido) + ancho > aLaVista;
        });
        scroll.style.setProperty("--desplazado", `${corrido}px`);
        rotulos.forEach((r, n) => r.el.classList.toggle("sin-sitio", sinSitio[n]));
    };
    const scroll = h("div", { class: "crono", "data-desplazar": `crono-${zoom.id}`, onscroll: alDesplazar }, lienzo);
    cont.append(barra, scroll);
    if (typeof ResizeObserver === "function") new ResizeObserver(alDesplazar).observe(scroll); // al girar el móvil o cambiar el panel
    // pintarYa() recoloca el desplazamiento después de pintar (sin avisar si no cambia): se mira otra vez entonces.
    requestAnimationFrame(alDesplazar);
    if (!ev.centrado) {
        ev.centrado = true;
        irAHoy(false);
    }
    alDesplazar();
}

function fila(t, { px, desde, dias, ancho, x, ctx, sinFechas }) {
    const prio = prioridadDe(t.prioridad);
    const responsables = t.responsables.map(ctx.usuario).filter(Boolean);
    const nombre = h(
        "button",
        { type: "button", class: ["crono-nombre", t.estado === "hecho" && "hecha"], style: { "--color-prioridad": prio.color }, title: t.titulo, onclick: () => ctx.abrir(t.id), dataset: { id: t.id } },
        h("span", { class: "texto" }, t.titulo),
        h("span", { class: "avatares" }, responsables.map((u) => avatar(u, { tam: "mini" }))),
    );
    const pista = h("div", { class: ["crono-pista", sinFechas && "sin-fechas"], style: { width: `${ancho}px` } });
    const el = h("div", { class: "crono-fila" }, nombre, pista);

    if (sinFechas) {
        dibujarFechas(pista, t, { px, desde, dias, ctx });
        return el;
    }

    const [a, b] = rango(t);
    const atrasada = t.estado !== "hecho" && t.fin && t.fin < hoy();
    const barra = h(
        "div",
        {
            class: ["crono-barra", t.estado === "hecho" && "hecha", atrasada && "atrasada", !t.inicio && "solo-fin"],
            style: { left: `${x(a) + 1}px`, "--izq": `${x(a) + 1}px`, width: `${(diasEntre(a, b) + 1) * px - 2}px`, background: prio.color, color: prio.texto },
            title: `${t.titulo} · ${a === b ? fechaMedia(a) : `${fechaMedia(a)} → ${fechaMedia(b)}`}`,
            tabindex: 0,
            role: "button",
            onkeydown: (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    ctx.abrir(t.id);
                }
            },
        },
        h("span", { class: "asa izq", title: "Arrastra para cambiar el inicio" }),
        h("span", { class: "texto" }, t.titulo),
        h("span", { class: "asa der", title: "Arrastra para cambiar el final" }),
    );
    pista.appendChild(barra);
    // Si la barra es corta, el nombre va a su derecha para que se pueda leer.
    const anchoBarra = (diasEntre(a, b) + 1) * px - 2;
    let fuera = null;
    if (anchoBarra < 90) {
        barra.querySelector(".texto").textContent = "";
        // Dónde empieza y cuánto mide la barra, para que el CSS lo ponga justo detrás de lo que mide de verdad (una barra
        // nunca es más estrecha que --barra-minima: con el zoom de meses, la de pocos días tapaba el principio del título).
        fuera = h("span", { class: ["crono-fuera", t.estado === "hecho" && "hecha"], style: { "--izq": `${x(a) + 1}px`, "--ancho": `${anchoBarra}px` } }, t.titulo);
        pista.appendChild(fuera);
    }

    arrastrable(barra, {
        umbral: 3,
        alClic: () => ctx.abrir(t.id),
        alEmpezar: (e, inicio) => {
            const modo = inicio.target.closest(".asa.izq") ? "inicio" : inicio.target.closest(".asa.der") ? "fin" : "mover";
            const etiqueta = h("div", { class: "fantasma-mini fechas" });
            document.body.appendChild(etiqueta);
            barra.classList.add("moviendo");
            if (fuera) fuera.hidden = true;
            const scroll = barra.closest(".crono");
            return { modo, x0: inicio.clientX, sx0: scroll.scrollLeft, a, b, etiqueta, auto: autoDesplazamiento(scroll, { vertical: false }) };
        },
        alMover: (e, c) => {
            c.auto.mover(e.clientX, e.clientY);
            const scroll = barra.closest(".crono");
            const d = Math.round((e.clientX - c.x0 + (scroll.scrollLeft - c.sx0)) / px);
            let na = c.a;
            let nb = c.b;
            if (c.modo === "mover") {
                na = sumarDias(c.a, d);
                nb = sumarDias(c.b, d);
            } else if (c.modo === "inicio") {
                na = sumarDias(c.a, d);
                if (na > c.b) na = c.b;
            } else {
                nb = sumarDias(c.b, d);
                if (nb < c.a) nb = c.a;
            }
            c.na = na;
            c.nb = nb;
            barra.style.left = `${x(na) + 1}px`;
            barra.style.setProperty("--izq", `${x(na) + 1}px`);
            barra.style.width = `${(diasEntre(na, nb) + 1) * px - 2}px`;
            c.etiqueta.textContent = na === nb ? fechaMedia(na) : `${fechaMedia(na)} → ${fechaMedia(nb)}`;
            c.etiqueta.style.left = `${e.clientX + 12}px`;
            c.etiqueta.style.top = `${e.clientY + 12}px`;
        },
        alSoltar: (e, c) => {
            terminar(c);
            if (!c.na || (c.na === c.a && c.nb === c.b)) return ctx.pintar();
            const cambios = {};
            if (c.modo === "mover") {
                if (t.inicio) cambios.inicio = c.na;
                if (t.fin) cambios.fin = t.inicio ? c.nb : c.na;
                if (!t.fin) cambios.inicio = c.na;
            } else if (c.modo === "inicio") {
                cambios.inicio = c.na === c.nb && !t.inicio ? null : c.na;
                if (!t.fin) cambios.fin = c.nb;
            } else {
                cambios.fin = c.nb;
                if (!t.inicio && c.nb !== c.a) cambios.inicio = c.a;
            }
            ctx.cambiar(t.id, cambios);
        },
        alCancelar: (c) => {
            terminar(c);
            ctx.pintar();
        },
    });
    function terminar(c) {
        c.etiqueta.remove();
        c.auto.parar();
        barra.classList.remove("moviendo");
    }
    return el;
}

// En las filas sin fechas: clic = fecha límite ese día; arrastrar = de un día a otro.
function dibujarFechas(pista, t, { px, desde, dias, ctx }) {
    const diaEn = (clientX) => {
        const r = pista.getBoundingClientRect();
        const i = Math.min(dias - 1, Math.max(0, Math.floor((clientX - r.left) / px)));
        return sumarDias(desde, i);
    };
    pista.title = "Clic para ponerle fecha límite; arrastra para marcar de cuándo a cuándo";
    arrastrable(pista, {
        umbral: 4,
        alClic: (e) => ctx.cambiar(t.id, { fin: diaEn(e.clientX) }),
        alEmpezar: (e, inicio) => {
            const d0 = diaEn(inicio.clientX);
            const prio = prioridadDe(t.prioridad);
            const barra = h("div", { class: "crono-barra borrador", style: { background: prio.color } });
            pista.appendChild(barra);
            const etiqueta = h("div", { class: "fantasma-mini fechas" });
            document.body.appendChild(etiqueta);
            return { d0, barra, etiqueta, auto: autoDesplazamiento(pista.closest(".crono"), { vertical: false }) };
        },
        alMover: (e, c) => {
            c.auto.mover(e.clientX, e.clientY);
            const d1 = diaEn(e.clientX);
            const [a, b] = c.d0 <= d1 ? [c.d0, d1] : [d1, c.d0];
            c.a = a;
            c.b = b;
            c.barra.style.left = `${diasEntre(desde, a) * px + 1}px`;
            c.barra.style.width = `${(diasEntre(a, b) + 1) * px - 2}px`;
            c.etiqueta.textContent = a === b ? fechaMedia(a) : `${fechaMedia(a)} → ${fechaMedia(b)}`;
            c.etiqueta.style.left = `${e.clientX + 12}px`;
            c.etiqueta.style.top = `${e.clientY + 12}px`;
        },
        alSoltar: (e, c) => {
            c.etiqueta.remove();
            c.auto.parar();
            if (!c.a) return ctx.pintar();
            ctx.cambiar(t.id, c.a === c.b ? { fin: c.a } : { inicio: c.a, fin: c.b });
        },
        alCancelar: (c) => {
            c.etiqueta.remove();
            c.auto.parar();
            ctx.pintar();
        },
    });
}
