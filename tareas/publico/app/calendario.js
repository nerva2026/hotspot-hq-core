// Vista «Calendario»: el mes entero con las tareas en su fecha (o de su inicio a su final).
// Se arrastran para cambiarlas de día; lo que no tiene fecha espera en la columna «Sin fecha».

import { h, hoy, aFecha, sumarDias, diasEntre, lunesDe, primeroDeMes, sumarMeses, diasDelMes, MESES, DIAS_CORTOS, prioridadDe, pesoPrioridad, fechaMedia, fechaLarga } from "./util.js";
import { abrirMenu, cerrarMenu, avatar } from "./menus.js";
import { arrastrable } from "./arrastre.js";
import { interpretar } from "./rapida.js";

const CARRILES = 4; // barras visibles por semana antes de «+N más»

const rango = (t) => {
    const a = t.inicio || t.fin;
    const b = t.fin || t.inicio;
    return a && b ? [a, b] : null;
};

export function pintarCalendario(cont, ctx, ev) {
    ev.mes ||= primeroDeMes(hoy());
    ev.verSinFecha ??= true;
    const tareas = ctx.visibles();
    const primero = ev.mes;
    const ultimo = sumarDias(primero, diasDelMes(primero) - 1);
    const desde = lunesDe(primero);
    const semanas = Math.ceil((diasEntre(desde, ultimo) + 1) / 7);
    const h0 = hoy();
    const [anio, mes] = primero.split("-").map(Number);

    const barra = h(
        "div",
        { class: "barra-vista" },
        h("button", { type: "button", class: "btn pequeno", title: "Mes anterior", onclick: () => ((ev.mes = sumarMeses(ev.mes, -1)), ctx.pintar()) }, "‹"),
        h("h2", { class: "titulo-mes" }, `${MESES[mes - 1]} ${anio}`),
        h("button", { type: "button", class: "btn pequeno", title: "Mes siguiente", onclick: () => ((ev.mes = sumarMeses(ev.mes, 1)), ctx.pintar()) }, "›"),
        h("button", { type: "button", class: "btn pequeno", onclick: () => ((ev.mes = primeroDeMes(hoy())), ctx.pintar()) }, "Hoy"),
        h("span", { class: "crece" }),
        h(
            "label",
            { class: "interruptor" },
            h("input", { type: "checkbox", checked: ev.verSinFecha, onchange: (e) => ((ev.verSinFecha = e.target.checked), ctx.pintar()) }),
            h("span", null, "Sin fecha"),
        ),
    );

    const mesEl = h("div", { class: "cal-mes" }, h("div", { class: "cal-cabecera" }, DIAS_CORTOS.map((d) => h("div", null, d))));
    const conFecha = tareas.filter(rango);

    for (let s = 0; s < semanas; s++) {
        const lunes = sumarDias(desde, s * 7);
        const domingo = sumarDias(lunes, 6);
        const semana = h("div", { class: "cal-semana", dataset: { lunes } });
        const rejilla = h("div", { class: "cal-rejilla", style: { gridTemplateRows: `24px repeat(${CARRILES}, 22px) 18px` } });
        // Días (fondo y número)
        for (let d = 0; d < 7; d++) {
            const dia = sumarDias(lunes, d);
            const fuera = dia < primero || dia > ultimo;
            rejilla.appendChild(
                h(
                    "div",
                    {
                        class: ["cal-dia", fuera && "fuera", dia === h0 && "hoy", d >= 5 && "finde"],
                        style: { gridColumn: `${d + 1}`, gridRow: "1 / -1" },
                        dataset: { dia },
                        onclick: (e) => {
                            if (e.target.closest(".cal-barra, .cal-mas")) return;
                            altaEnDia(e.currentTarget, dia, ctx);
                        },
                    },
                    h("span", { class: "cal-numero", title: fechaLarga(dia) }, aFecha(dia).getUTCDate() === 1 ? `1 ${MESES[aFecha(dia).getUTCMonth()].slice(0, 3)}` : aFecha(dia).getUTCDate()),
                ),
            );
        }
        // Barras en carriles
        const trozos = conFecha
            .map((t) => {
                const [a, b] = rango(t);
                if (b < lunes || a > domingo) return null;
                return { t, a: a < lunes ? lunes : a, b: b > domingo ? domingo : b, antes: a < lunes, despues: b > domingo, largo: diasEntre(a, b) };
            })
            .filter(Boolean)
            .sort((x, y) => x.a.localeCompare(y.a) || y.largo - x.largo || pesoPrioridad(x.t.prioridad) - pesoPrioridad(y.t.prioridad));
        const carriles = []; // último día ocupado en cada carril
        const ocultas = Array.from({ length: 7 }, () => []);
        for (const tr of trozos) {
            const i0 = diasEntre(lunes, tr.a);
            const i1 = diasEntre(lunes, tr.b);
            let c = carriles.findIndex((fin) => fin < i0);
            if (c < 0) {
                c = carriles.length;
                carriles.push(-1);
            }
            carriles[c] = i1;
            if (c >= CARRILES) {
                for (let d = i0; d <= i1; d++) ocultas[d].push(tr.t);
                continue;
            }
            rejilla.appendChild(barraTarea(tr, i0, i1, c, ctx));
        }
        ocultas.forEach((lista, d) => {
            if (!lista.length) return;
            const dia = sumarDias(lunes, d);
            rejilla.appendChild(
                h(
                    "button",
                    {
                        type: "button",
                        class: "cal-mas",
                        style: { gridColumn: `${d + 1}`, gridRow: `${CARRILES + 2}` },
                        onclick: (e) => menuDia(e.currentTarget, dia, conFecha.filter((t) => rango(t)[0] <= dia && rango(t)[1] >= dia), ctx),
                    },
                    `+${lista.length} más`,
                ),
            );
        });
        semana.appendChild(rejilla);
        mesEl.appendChild(semana);
    }

    const cuerpo = h("div", { class: ["cal-cuerpo", ev.verSinFecha && "con-lateral"] }, h("div", { class: "cal-principal", "data-desplazar": "calendario" }, mesEl));
    if (ev.verSinFecha) {
        const sinFecha = tareas.filter((t) => !rango(t)).sort((a, b) => pesoPrioridad(a.prioridad) - pesoPrioridad(b.prioridad) || a.orden - b.orden);
        const lista = h(
            "div",
            { class: "cal-sinfecha-lista", "data-desplazar": "sinfecha" },
            sinFecha.map((t) => {
                const prio = prioridadDe(t.prioridad);
                const el = h(
                    "button",
                    {
                        type: "button",
                        class: ["cal-suelta", "arrastrable", t.estado === "hecho" && "hecha"],
                        dataset: { id: t.id },
                        style: { "--color-prioridad": prio.color },
                        onclick: (e) => e.detail === 0 && ctx.abrir(t.id), // con el teclado
                    },
                    h("span", { class: "texto" }, t.titulo),
                    h("span", { class: "avatares" }, t.responsables.map(ctx.usuario).filter(Boolean).map((u) => avatar(u))),
                );
                hacerArrastrable(el, t, ctx, { suelta: true });
                return el;
            }),
            sinFecha.length ? null : h("p", { class: "nota" }, "Todo tiene fecha. ¡Bien!"),
        );
        cuerpo.appendChild(h("aside", { class: "cal-sinfecha" }, h("h3", null, "Sin fecha ", h("span", { class: "cuenta" }, sinFecha.length)), h("p", { class: "nota" }, "Arrastra una al calendario para darle fecha."), lista));
    }
    cont.append(barra, cuerpo);
}

function barraTarea(tr, i0, i1, carril, ctx) {
    const t = tr.t;
    const prio = prioridadDe(t.prioridad);
    const atrasada = t.estado !== "hecho" && t.fin && t.fin < hoy();
    const el = h(
        "button",
        {
            type: "button",
            class: ["cal-barra", "arrastrable", t.estado === "hecho" && "hecha", atrasada && "atrasada", tr.antes && "sigue-antes", tr.despues && "sigue-despues"],
            style: { gridColumn: `${i0 + 1} / ${i1 + 2}`, gridRow: `${carril + 2}`, background: prio.color, color: prio.texto },
            dataset: { id: t.id },
            onclick: (e) => e.detail === 0 && ctx.abrir(t.id), // con el teclado
            title: `${t.titulo}${t.inicio && t.fin && t.inicio !== t.fin ? ` · del ${fechaMedia(t.inicio)} al ${fechaMedia(t.fin)}` : t.fin ? ` · ${fechaMedia(t.fin)}` : ""}`,
        },
        t.responsables.length ? h("span", { class: "avatares" }, t.responsables.map(ctx.usuario).filter(Boolean).map((u) => avatar(u, { tam: "mini" }))) : null,
        h("span", { class: "texto" }, t.titulo),
    );
    hacerArrastrable(el, t, ctx, {});
    return el;
}

// Día bajo el puntero (por coordenadas, porque las barras tapan las casillas).
function diaEn(x, y) {
    const pila = document.elementsFromPoint(x, y);
    const semana = pila.map((e) => e.closest?.(".cal-semana")).find(Boolean);
    if (semana) {
        const r = semana.getBoundingClientRect();
        const i = Math.min(6, Math.max(0, Math.floor(((x - r.left) / r.width) * 7)));
        return sumarDias(semana.dataset.lunes, i);
    }
    if (pila.some((e) => e.closest?.(".cal-sinfecha"))) return "sin-fecha";
    return null;
}

function hacerArrastrable(el, t, ctx, { suelta = false }) {
    arrastrable(el, {
        alClic: () => ctx.abrir(t.id),
        alEmpezar: (e) => {
            const origen = suelta ? null : diaEn(e.clientX, e.clientY);
            const fantasma = h("div", { class: "fantasma-mini", style: { background: prioridadDe(t.prioridad).color, color: prioridadDe(t.prioridad).texto } }, t.titulo);
            document.body.appendChild(fantasma);
            el.classList.add("levantada");
            return { origen, fantasma, marcado: null };
        },
        alMover: (e, c) => {
            c.fantasma.style.left = `${e.clientX + 10}px`;
            c.fantasma.style.top = `${e.clientY + 8}px`;
            const dia = diaEn(e.clientX, e.clientY);
            c.destino = dia;
            const casilla = dia && dia !== "sin-fecha" ? document.querySelector(`.cal-dia[data-dia="${dia}"]`) : dia === "sin-fecha" ? document.querySelector(".cal-sinfecha") : null;
            if (c.marcado !== casilla) {
                c.marcado?.classList.remove("destino");
                casilla?.classList.add("destino");
                c.marcado = casilla;
            }
        },
        alSoltar: (e, c) => {
            fin(c);
            const destino = c.destino;
            if (!destino) return ctx.pintar();
            if (destino === "sin-fecha") {
                if (t.inicio || t.fin) ctx.cambiar(t.id, { inicio: null, fin: null });
                else ctx.pintar();
                return;
            }
            if (suelta || !c.origen) {
                ctx.cambiar(t.id, { fin: destino });
                return;
            }
            const delta = diasEntre(c.origen, destino);
            if (!delta) return ctx.pintar();
            const cambios = {};
            if (t.inicio) cambios.inicio = sumarDias(t.inicio, delta);
            if (t.fin) cambios.fin = sumarDias(t.fin, delta);
            ctx.cambiar(t.id, cambios);
        },
        alCancelar: (c) => {
            fin(c);
            ctx.pintar();
        },
    });
    function fin(c) {
        c.fantasma.remove();
        c.marcado?.classList.remove("destino");
        el.classList.remove("levantada");
    }
}

function altaEnDia(ancla, dia, ctx) {
    const entrada = h("input", { class: "campo", placeholder: "Nueva tarea…", maxlength: 300 });
    entrada.addEventListener("keydown", async (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const r = interpretar(entrada.value, ctx.activos());
        if (!r.titulo) return;
        cerrarMenu();
        const datos = { titulo: r.titulo, fin: r.fin || dia, responsables: r.responsables, etiquetas: r.etiquetas };
        if (r.prioridad) datos.prioridad = r.prioridad;
        await ctx.crear(datos);
    });
    abrirMenu(ancla.querySelector(".cal-numero") || ancla, h("div", { class: "menu-fecha" }, h("div", { class: "menu-titulo" }, `Para el ${fechaMedia(dia)}`), entrada, h("p", { class: "nota" }, "Intro para crear.")), { ancho: 260 });
}

function menuDia(ancla, dia, tareas, ctx) {
    abrirMenu(
        ancla,
        h(
            "div",
            null,
            h("div", { class: "menu-titulo" }, fechaLarga(dia)),
            h(
                "div",
                { class: "opciones" },
                tareas
                    .sort((a, b) => pesoPrioridad(a.prioridad) - pesoPrioridad(b.prioridad))
                    .map((t) =>
                        h(
                            "button",
                            {
                                type: "button",
                                class: "opcion",
                                onclick: () => {
                                    cerrarMenu();
                                    ctx.abrir(t.id);
                                },
                            },
                            h("span", { class: "muestra-prioridad", style: { background: prioridadDe(t.prioridad).color } }),
                            h("span", { class: t.estado === "hecho" ? "tachado" : "" }, t.titulo),
                        ),
                    ),
            ),
        ),
        { ancho: 280 },
    );
}
