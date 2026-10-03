// Libro de cuentas de HOT SPOT S.L. (el de Don Balance): cómo vais, apuntar gastos, ingresos y pagos, y la lista.
//
// Pensado para quien no usa Excel: se apunta con un formulario, el reparto y quién debe a quién salen solos, y
// si hace falta se descarga en Excel o en CSV. Los importes van en céntimos, como en el servidor (servidor/libro.js).

import { h, $, vaciar, hoy, sumarDias, fechaCorta, fechaLarga, MESES, MESES_CORTOS, haceCuanto, retrasar } from "./util.js";
import { api, escuchar, cuandoSePierdaLaSesion, direccionApi } from "./api.js";
import { pantallaEntrar, aplicacion } from "./acceso.js";
import { sinSolo } from "./solo.js";
import { esperarAcceso } from "./libro-espera.js";
import { coincide, prepararConsulta } from "./libro-buscar.js";
import { abrirMenu, cerrarMenu, hayMenu, aviso, colocarAvisos, ventana, avatar } from "./menus.js";

aplicacion("CUENTAS", "El libro de cuentas es de los socios de HOT SPOT S.L. Entra con tu cuenta de Google.");

const TIPOS = {
    gasto: {
        nombre: "Gasto",
        accion: "Apuntar un gasto",
        explica: "He pagado algo de HOT SPOT.",
        quien: "¿Quién lo ha pagado?",
        que: "¿En qué?",
        ejemplo: "Dominio, altavoces, cena del equipo…",
        icono: "−",
    },
    ingreso: {
        nombre: "Ingreso",
        accion: "Apuntar un ingreso",
        explica: "He cobrado dinero para HOT SPOT.",
        quien: "¿Quién lo ha cobrado?",
        que: "¿De qué?",
        ejemplo: "Entradas, un bolo, un patrocinio…",
        icono: "+",
    },
    pago: {
        nombre: "Pago",
        accion: "Apuntar un pago",
        explica: "Le he dado dinero a otro socio para quedar en paz.",
        quien: "¿Quién paga?",
        que: "Nota (si quieres)",
        ejemplo: "Bizum, en mano…",
        icono: "⇄",
    },
};

const FILTROS_VACIOS = { texto: "", tipo: "todos", persona: "todas", categoria: null, mes: null };

const E = {
    yo: null,
    usuarios: [],
    partes: {},
    categorias: [],
    movimientos: [],
    resumen: null,
    filtros: { ...FILTROS_VACIOS },
};

const raiz = document.getElementById("app");
let dejarDeEscuchar = null;
let espera = null; // quien ve «Solo para los socios» sigue escuchando por si le dan parte (libro-espera.js)

// ---------- dinero ----------

const formato = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const euros = (c) => `${formato.format((c || 0) / 100)} €`;
const porcentaje = (n) => `${String(Math.round(n * 100) / 100).replace(".", ",")} %`;
// Las cifras van con la letra de los títulos: en la del texto el 5 parece una S y el € un 0.
const cifra = (texto) => h("span", { class: "cifra-pixel" }, texto);
const sumar = (lista) => lista.reduce((s, m) => s + m.importe, 0);

// Lo que escribe la gente → céntimos: «12», «12,5», «12.50», «1.234,56», «1,234.56», «12 €». null si no se entiende.
export function leerImporte(texto) {
    let s = String(texto ?? "").replace(/[€\s]/g, "");
    if (!s) return null;
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
    else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, "");
    else if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    const n = Math.round(Number(s) * 100);
    return Number.isFinite(n) && n > 0 ? n : null;
}

const paraEscribir = (c) => (c ? (c / 100).toFixed(2).replace(".", ",").replace(/,00$/, "") : "");

// Igual que en el servidor: reparte «total» céntimos según las partes sin perder ninguno por el redondeo.
export function repartir(total, partes) {
    const ids = Object.keys(partes).filter((id) => partes[id] > 0);
    const suma = ids.reduce((s, id) => s + partes[id], 0);
    const salida = {};
    if (!ids.length || !suma || !total) {
        for (const id of ids) salida[id] = 0;
        return salida;
    }
    const exactos = ids.map((id) => ({ id, exacto: (total * partes[id]) / suma }));
    let repartido = 0;
    for (const e of exactos) {
        salida[e.id] = Math.floor(e.exacto);
        repartido += salida[e.id];
    }
    exactos.sort((a, b) => b.exacto - Math.floor(b.exacto) - (a.exacto - Math.floor(a.exacto)) || partes[b.id] - partes[a.id]);
    for (let i = 0; repartido < total; i = (i + 1) % exactos.length, repartido++) salida[exactos[i].id] += 1;
    return salida;
}

function saldar(balances) {
    const deben = balances.filter((b) => b.balance < 0).map((b) => ({ id: b.id, falta: -b.balance })).sort((a, b) => b.falta - a.falta);
    const cobran = balances.filter((b) => b.balance > 0).map((b) => ({ id: b.id, falta: b.balance })).sort((a, b) => b.falta - a.falta);
    const pagos = [];
    let i = 0;
    let j = 0;
    while (i < deben.length && j < cobran.length) {
        const importe = Math.min(deben[i].falta, cobran[j].falta);
        if (importe > 0) pagos.push({ de: deben[i].id, a: cobran[j].id, importe });
        deben[i].falta -= importe;
        cobran[j].falta -= importe;
        if (!deben[i].falta) i++;
        if (!cobran[j].falta) j++;
    }
    return pagos;
}

// Quién debería a quién con estos movimientos (para enseñar cómo quedaría antes de apuntar).
export function deudasCon(movimientos, partes, usuarios) {
    const gastos = movimientos.filter((m) => m.tipo === "gasto");
    const ingresos = movimientos.filter((m) => m.tipo === "ingreso");
    const pagos = movimientos.filter((m) => m.tipo === "pago");
    const toca = repartir(sumar(gastos), partes);
    const recibe = repartir(sumar(ingresos), partes);
    const ids = new Set([...Object.keys(partes), ...movimientos.flatMap((m) => [m.persona, m.para]).filter(Boolean)]);
    const balances = usuarios
        .filter((u) => ids.has(u.id))
        .map((u) => {
            const de = (lista, campo = "persona") => sumar(lista.filter((m) => m[campo] === u.id));
            return { id: u.id, balance: de(gastos) - (toca[u.id] || 0) - (de(ingresos) - (recibe[u.id] || 0)) + de(pagos) - de(pagos, "para") };
        });
    return saldar(balances);
}

// ---------- personas y fechas ----------

const usuario = (id) => E.usuarios.find((u) => u.id === id) || null;
const nombre = (id) => usuario(id)?.nombre || "Alguien";
// Quién sale para elegir: los socios (con parte), tú y quien ya estuviera en el movimiento.
const socios = (...ademas) => E.usuarios.filter((u) => (!u.baja && ((E.partes[u.id] || 0) > 0 || u.id === E.yo.id)) || ademas.includes(u.id));
const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const nombreMes = (mes) => `${mayus(MESES[Number(mes.slice(5, 7)) - 1])} ${mes.slice(0, 4)}`;
const mesCorto = (mes) => `${MESES_CORTOS[Number(mes.slice(5, 7)) - 1]}${mes.slice(0, 4) === hoy().slice(0, 4) ? "" : ` ${mes.slice(2, 4)}`}`;

// «Víctor le debe 6,00 € a Diego», o «Le debes…» / «… te debe…» cuando va contigo.
function fraseDeuda(d, futuro = false) {
    const cifra = euros(d.importe);
    const fuerte = h("strong", { class: "cifra-pixel" }, cifra);
    if (d.de === E.yo.id) return [futuro ? "Le deberás " : "Le debes ", fuerte, ` a ${nombre(d.a)}`];
    if (d.a === E.yo.id) return [`${nombre(d.de)} ${futuro ? "te deberá" : "te debe"} `, fuerte];
    return [`${nombre(d.de)} le ${futuro ? "deberá" : "debe"} `, fuerte, ` a ${nombre(d.a)}`];
}

function dentroDeLaOficina() {
    try {
        return window.top !== window;
    } catch {
        return true;
    }
}

// ---------- montar la página ----------

function montar() {
    vaciar(raiz);
    document.body.classList.toggle("en-oficina", dentroDeLaOficina());
    const tipos = [
        ["todos", "Todo"],
        ["gasto", "Gastos"],
        ["ingreso", "Ingresos"],
        ["pago", "Pagos"],
    ];
    raiz.append(
        h(
            "header",
            { class: "barra" },
            h("div", { class: "marca" }, h("span", { class: "logo" }, "HS"), h("h1", { class: "nombre-app" }, "CUENTAS")),
            h("nav", { class: "pestanas pantallas otra-pantalla", "aria-label": "Aplicaciones" }, h("a", { class: "pestana otra-pantalla", href: "../" }, "Tareas"), h("span", { class: "pestana activa", "aria-current": "page" }, "Cuentas"), h("a", { class: "pestana otra-pantalla", href: "../pizarra/" }, "Pizarra"), h("a", { class: "pestana otra-pantalla", href: "../archivo/" }, "Archivo"), h("a", { class: "pestana otra-pantalla", href: "../musica/" }, "Música")),
            h(
                "div",
                { class: "barra-derecha" },
                h("button", { type: "button", class: "btn primario", title: "Apuntar (N)", onclick: () => formulario() }, "+ Apuntar"),
                h("button", { type: "button", class: "boton-yo", id: "boton-yo", onclick: (e) => menuYo(e.currentTarget) }),
            ),
        ),
        h(
            "main",
            { class: "libro", id: "libro" },
            h(
                "div",
                { class: "libro-contenido" },
                h("section", { id: "estado-libro", class: "estado-libro-zona", "aria-live": "polite" }),
                h(
                    "section",
                    { class: "acciones-libro", "aria-label": "Apuntar" },
                    Object.entries(TIPOS).map(([id, t]) =>
                        h(
                            "button",
                            { type: "button", class: ["accion-libro", id], onclick: () => formulario({ tipo: id }) },
                            h("span", { class: "accion-icono", "aria-hidden": "true" }, t.icono),
                            h("span", { class: "accion-textos" }, h("strong", null, t.accion), h("small", null, t.explica)),
                        ),
                    ),
                ),
                h(
                    "section",
                    { class: "tarjeta-libro bloque-movimientos" },
                    h(
                        "header",
                        { class: "cabecera-bloque" },
                        h("h2", null, "Movimientos"),
                        h(
                            "div",
                            { class: "descargas" },
                            h("span", { class: "nota" }, "Descargar:"),
                            h("a", { class: "btn pequeno", href: direccionApi("libro/excel"), download: "" }, "Excel"),
                            h("a", { class: "btn pequeno", href: direccionApi("libro/csv"), download: "" }, "CSV"),
                        ),
                    ),
                    h(
                        "div",
                        { class: "filtros-libro" },
                        h("input", {
                            id: "buscar-libro",
                            class: "campo buscar",
                            type: "search",
                            placeholder: "Buscar…  ( / )",
                            "aria-label": "Buscar movimientos",
                            oninput: (e) => {
                                E.filtros.texto = e.target.value;
                                pintarLista();
                            },
                        }),
                        h(
                            "div",
                            { class: "segmentos", role: "group", "aria-label": "Tipo" },
                            tipos.map(([id, texto]) =>
                                h(
                                    "button",
                                    {
                                        type: "button",
                                        class: "segmento",
                                        dataset: { tipo: id },
                                        onclick: () => {
                                            E.filtros.tipo = id;
                                            pintarLista();
                                        },
                                    },
                                    texto,
                                ),
                            ),
                        ),
                        h("select", { id: "filtro-persona-libro", class: "campo selector", "aria-label": "Persona", onchange: (e) => filtrar({ persona: e.target.value }) }),
                        h("select", { id: "filtro-categoria-libro", class: "campo selector", "aria-label": "Categoría", onchange: (e) => filtrar({ categoria: e.target.value === "·todas" ? null : e.target.value === "·sin" ? "" : e.target.value }) }),
                        h("select", { id: "filtro-mes-libro", class: "campo selector", "aria-label": "Mes", onchange: (e) => filtrar({ mes: e.target.value || null }) }),
                        h("button", { type: "button", class: "enlace", id: "quitar-filtros-libro", onclick: () => filtrar({ ...FILTROS_VACIOS }) }, "Quitar filtros"),
                    ),
                    h("div", { id: "lista-libro", class: "lista-libro" }),
                ),
                h("section", { id: "graficos-libro", class: "graficos-libro" }),
                h("p", { class: "nota pie-libro" }, "Los importes se reparten según la parte de cada socio. ", h("button", { type: "button", class: "enlace", onclick: ayuda }, "¿Cómo funciona?")),
            ),
        ),
    );
    pintar();
}

function filtrar(cambios) {
    Object.assign(E.filtros, cambios);
    if ("texto" in cambios && $("#buscar-libro")) $("#buscar-libro").value = E.filtros.texto;
    pintarLista();
    if (!cambios.texto && Object.keys(cambios).some((k) => k !== "texto")) $(".bloque-movimientos")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function pintar() {
    if (!$("#libro")) return;
    const yo = $("#boton-yo");
    yo.replaceChildren(avatar(E.yo), h("span", { class: "nombre-yo" }, E.yo.nombre), h("span", { class: "flecha" }, "▾"));
    pintarEstado();
    pintarLista();
    pintarGraficos();
}

// ---------- cómo vais ----------

function pintarEstado() {
    const r = E.resumen;
    const cont = $("#estado-libro");
    if (!r.movimientos) {
        cont.replaceChildren(
            h(
                "div",
                { class: "tarjeta-libro estado-libro vacio" },
                h("h2", null, "Aquí van las cuentas de HOT SPOT"),
                h("p", null, "Apunta cada gasto, lo que se cobra y los pagos entre socios. El reparto y quién le debe a quién salen solos."),
                h("p", { class: "nota" }, "¿Las tenías en una hoja de Excel o de Drive? ", h("button", { type: "button", class: "enlace", onclick: importar }, "Impórtala"), " y no tendrás que copiar nada."),
            ),
            lineaReparto(),
        );
        return;
    }
    const deudas = r.deudas;
    const estado = deudas.length
        ? h(
              "div",
              { class: "tarjeta-libro estado-libro pendiente" },
              h("h2", null, deudas.length === 1 ? "Cuenta pendiente" : "Cuentas pendientes"),
              h(
                  "ul",
                  { class: "deudas" },
                  deudas.map((d) =>
                      h(
                          "li",
                          null,
                          h("span", { class: "avatares" }, avatar(usuario(d.de)), avatar(usuario(d.a))),
                          h("span", { class: "frase-deuda" }, fraseDeuda(d)),
                          h("button", { type: "button", class: "btn pequeno", onclick: () => formulario({ tipo: "pago", persona: d.de, para: d.a, importe: d.importe }) }, "Apuntar el pago"),
                      ),
                  ),
              ),
          )
        : h("div", { class: "tarjeta-libro estado-libro en-paz" }, h("h2", null, "✓ Estáis en paz"), h("p", null, "Nadie le debe nada a nadie."));
    const personas = h("div", { class: "personas-libro" }, r.personas.map(tarjetaPersona));
    const resultado = r.resultado;
    const totales = h(
        "div",
        { class: "totales-libro" },
        h("div", { class: "total" }, h("span", null, "Gastos"), h("strong", { class: "negativo" }, euros(r.totalGastos))),
        h("div", { class: "total" }, h("span", null, "Ingresos"), h("strong", { class: "positivo" }, euros(r.totalIngresos))),
        h(
            "div",
            { class: "total", title: "Ingresos menos gastos" },
            h("span", null, "Resultado"),
            h("strong", { class: resultado > 0 ? "positivo" : resultado < 0 ? "negativo" : "" }, `${resultado > 0 ? "+" : resultado < 0 ? "−" : ""}${euros(Math.abs(resultado))}`),
        ),
    );
    cont.replaceChildren(estado, personas, totales, lineaReparto());
}

function lineaReparto() {
    const partes = E.usuarios.filter((u) => (E.partes[u.id] || 0) > 0).map((u, i) => [i ? " · " : "", `${u.nombre} `, cifra(porcentaje(E.partes[u.id]))]);
    return h(
        "p",
        { class: "nota linea-reparto" },
        "Reparto: ",
        partes.length ? partes : "sin decidir",
        ". ",
        E.yo.admin ? h("button", { type: "button", class: "enlace", onclick: ajustes }, "Cambiar el reparto") : null,
    );
}

function tarjetaPersona(p) {
    const u = usuario(p.id);
    const lineas = [
        ["Ha pagado", p.haPagado],
        [["Le toca pagar (", cifra(porcentaje(p.parte)), ")"], p.leToca],
    ];
    if (E.resumen.totalIngresos) lineas.push(["Ha cobrado", p.haCobrado], [["Le corresponde (", cifra(porcentaje(p.parte)), ")"], p.leCorresponde]);
    if (p.pagosHechos || p.pagosRecibidos) lineas.push(["Ha dado en pagos", p.pagosHechos], ["Ha recibido en pagos", p.pagosRecibidos]);
    const [clase, texto] =
        p.balance > 0 ? ["positivo", `Le deben ${euros(p.balance)}`] : p.balance < 0 ? ["negativo", `Debe ${euros(-p.balance)}`] : ["cero", "En paz"];
    return h(
        "div",
        { class: "tarjeta-libro persona-libro" },
        h("div", { class: "persona-cabecera" }, avatar(u), h("strong", null, u?.nombre || "Alguien"), p.id === E.yo.id ? h("span", { class: "chip" }, "Tú") : null),
        h(
            "dl",
            null,
            lineas.map(([k, v]) => h("div", null, h("dt", null, k), h("dd", null, euros(v)))),
        ),
        h("p", { class: ["balance-libro", clase] }, texto),
    );
}

// ---------- la lista ----------

function filtrados() {
    const f = E.filtros;
    // El buscador encuentra también por importe, por fecha y por tipo (libro-buscar.js).
    const palabras = prepararConsulta(f.texto);
    return E.movimientos.filter((m) => {
        if (f.tipo !== "todos" && m.tipo !== f.tipo) return false;
        if (f.persona !== "todas" && m.persona !== f.persona && m.para !== f.persona) return false;
        if (f.categoria !== null && (m.categoria || "") !== f.categoria) return false;
        if (f.mes && m.fecha.slice(0, 7) !== f.mes) return false;
        if (palabras.length && !coincide(m, palabras, { nombre })) return false;
        return true;
    });
}

function pintarFiltros() {
    const f = E.filtros;
    for (const b of document.querySelectorAll(".filtros-libro .segmento")) {
        b.classList.toggle("activo", b.dataset.tipo === f.tipo);
        b.setAttribute("aria-pressed", String(b.dataset.tipo === f.tipo));
    }
    const opcion = (valor, texto, elegida) => h("option", { value: valor, selected: elegida }, texto);
    const personas = E.usuarios.filter((u) => E.movimientos.some((m) => m.persona === u.id || m.para === u.id) || (E.partes[u.id] || 0) > 0);
    $("#filtro-persona-libro").replaceChildren(opcion("todas", "Todas las personas", f.persona === "todas"), ...personas.map((u) => opcion(u.id, u.nombre, f.persona === u.id)));
    const categorias = [...new Set([...E.categorias, ...E.movimientos.map((m) => m.categoria).filter(Boolean)])];
    $("#filtro-categoria-libro").replaceChildren(
        opcion("·todas", "Todas las categorías", f.categoria === null),
        ...categorias.map((c) => opcion(c, c, f.categoria === c)),
        opcion("·sin", "Sin categoría", f.categoria === ""),
    );
    const meses = [...new Set(E.movimientos.map((m) => m.fecha.slice(0, 7)))].sort().reverse();
    if (f.mes && !meses.includes(f.mes)) meses.unshift(f.mes);
    $("#filtro-mes-libro").replaceChildren(opcion("", "Todos los meses", !f.mes), ...meses.map((m) => opcion(m, nombreMes(m), f.mes === m)));
    const hayFiltros = f.texto || f.tipo !== "todos" || f.persona !== "todas" || f.categoria !== null || f.mes;
    $("#quitar-filtros-libro").hidden = !hayFiltros;
    for (const [id, activo] of [
        ["#filtro-persona-libro", f.persona !== "todas"],
        ["#filtro-categoria-libro", f.categoria !== null],
        ["#filtro-mes-libro", Boolean(f.mes)],
    ])
        $(id).classList.toggle("activo", activo);
}

function pintarLista() {
    const cont = $("#lista-libro");
    if (!cont) return;
    pintarFiltros();
    if (!E.movimientos.length) {
        cont.replaceChildren(h("p", { class: "vacio-libro" }, "Todavía no hay nada apuntado. Empieza con uno de los botones de arriba."));
        return;
    }
    const lista = filtrados().sort((a, b) => (a.fecha === b.fecha ? (a.creado < b.creado ? 1 : -1) : a.fecha < b.fecha ? 1 : -1));
    if (!lista.length) {
        cont.replaceChildren(h("p", { class: "vacio-libro" }, "No hay movimientos con estos filtros. ", h("button", { type: "button", class: "enlace", onclick: () => filtrar({ ...FILTROS_VACIOS }) }, "Quitar filtros")));
        return;
    }
    const grupos = new Map();
    for (const m of lista) {
        const mes = m.fecha.slice(0, 7);
        if (!grupos.has(mes)) grupos.set(mes, []);
        grupos.get(mes).push(m);
    }
    cont.replaceChildren(
        ...[...grupos].map(([mes, movs]) => {
            const gastos = sumar(movs.filter((m) => m.tipo === "gasto"));
            const ingresos = sumar(movs.filter((m) => m.tipo === "ingreso"));
            return h(
                "section",
                { class: "mes-libro" },
                h(
                    "h3",
                    null,
                    h("span", null, nombreMes(mes)),
                    h("small", null, gastos ? ["gastos ", cifra(euros(gastos))] : null, gastos && ingresos ? " · " : null, ingresos ? ["ingresos ", cifra(euros(ingresos))] : null),
                ),
                h("ul", { class: "movimientos" }, movs.map(filaMovimiento)),
            );
        }),
    );
}

function filaMovimiento(m) {
    const t = TIPOS[m.tipo];
    let titulo;
    let detalle;
    if (m.tipo === "pago") {
        titulo = `${nombre(m.persona)} le paga a ${nombre(m.para)}`;
        detalle = m.concepto || "Para quedar en paz";
    } else {
        titulo = m.concepto;
        detalle = [m.categoria, `${m.tipo === "gasto" ? "pagó" : "cobró"} ${nombre(m.persona)}`].filter(Boolean).join(" · ");
    }
    const signo = m.tipo === "gasto" ? "−" : m.tipo === "ingreso" ? "+" : "";
    return h(
        "li",
        null,
        h(
            "button",
            { type: "button", class: ["mov", m.tipo], title: "Ver o cambiar", onclick: () => formulario({ movimiento: m }) },
            h("span", { class: "mov-fecha" }, fechaCorta(m.fecha)),
            h("span", { class: "mov-tipo" }, t.nombre),
            h("span", { class: "mov-texto" }, h("strong", null, titulo), h("small", null, detalle)),
            // Las marcas de «lleva tique» y «lleva nota»: con sitio, la palabra; en un móvil, su dibujo debajo de la fecha (libro.css).
            m.tique || m.notas
                ? h(
                      "span",
                      { class: "mov-marcas" },
                      m.tique ? h("span", { class: "chip mov-tique", title: m.tique.nombre || "Tiene tique" }, "Tique") : null,
                      m.notas ? h("span", { class: "chip mov-nota", title: m.notas }, "Nota") : null,
                  )
                : null,
            h("span", { class: "mov-importe" }, `${signo}${euros(m.importe)}`),
        ),
    );
}

// ---------- gráficos ----------

function pintarGraficos() {
    const r = E.resumen;
    const cont = $("#graficos-libro");
    if (!r.movimientos) {
        cont.replaceChildren();
        return;
    }
    const maxCat = Math.max(1, ...r.porCategoria.map((c) => c.total));
    const categorias = h(
        "div",
        { class: "tarjeta-libro grafico" },
        h("h2", null, "¿En qué se va el dinero?"),
        r.porCategoria.length
            ? h(
                  "ul",
                  { class: "barras-categoria" },
                  r.porCategoria.map((c) =>
                      h(
                          "li",
                          null,
                          h(
                              "button",
                              {
                                  type: "button",
                                  class: "fila-grafico",
                                  title: "Ver estos gastos",
                                  onclick: () => filtrar({ tipo: "gasto", categoria: c.categoria === "Sin categoría" ? "" : c.categoria }),
                              },
                              h("span", { class: "nombre-barra" }, c.categoria),
                              h("span", { class: "pista" }, h("span", { class: "relleno", style: { width: `${Math.max(2, (c.total / maxCat) * 100)}%` } })),
                              h("span", { class: "cifra" }, euros(c.total)),
                              h("span", { class: "cifra tenue" }, porcentaje(Math.round((c.total / r.totalGastos) * 100))),
                          ),
                      ),
                  ),
              )
            : h("p", { class: "nota" }, "Todavía no hay gastos."),
    );
    const meses = r.porMes.slice(-12);
    const maxMes = Math.max(1, ...meses.flatMap((m) => [m.gastos, m.ingresos]));
    const alto = (c) => `${c ? Math.max(3, (c / maxMes) * 100) : 0}%`;
    const porMes = h(
        "div",
        { class: "tarjeta-libro grafico" },
        h("h2", null, "Mes a mes"),
        h("p", { class: "leyenda" }, h("span", { class: "muestra-libro gasto" }), "Gastos", h("span", { class: "muestra-libro ingreso" }), "Ingresos"),
        meses.length
            ? h(
                  "div",
                  { class: "barras-mes" },
                  meses.map((m) =>
                      h(
                          "button",
                          {
                              type: "button",
                              class: ["mes-columna", E.filtros.mes === m.mes && "elegido"],
                              title: `${nombreMes(m.mes)}: gastos ${euros(m.gastos)}, ingresos ${euros(m.ingresos)}`,
                              onclick: () => filtrar({ mes: E.filtros.mes === m.mes ? null : m.mes }),
                          },
                          h("span", { class: "columnas" }, h("span", { class: "col gasto", style: { height: alto(m.gastos) } }), h("span", { class: "col ingreso", style: { height: alto(m.ingresos) } })),
                          h("span", { class: "mes-nombre" }, mesCorto(m.mes)),
                      ),
                  ),
              )
            : h("p", { class: "nota" }, "Solo hay pagos entre socios."),
    );
    cont.replaceChildren(categorias, porMes);
}

// ---------- apuntar y cambiar ----------

// Elegir una persona con botones (en vez de un desplegable): se ve de un vistazo y se toca bien en el móvil.
function eleccionPersonas(lista, actual, alElegir) {
    const cont = h("div", { class: "elecciones", role: "radiogroup" });
    const pintarle = (elegido) =>
        cont.replaceChildren(
            ...lista().map((u) =>
                h(
                    "button",
                    {
                        type: "button",
                        class: ["eleccion", u.id === elegido && "elegida"],
                        role: "radio",
                        "aria-checked": String(u.id === elegido),
                        onclick: () => {
                            pintarle(u.id);
                            alElegir(u.id);
                        },
                    },
                    avatar(u),
                    u.id === E.yo.id ? `${u.nombre} (tú)` : u.nombre,
                ),
            ),
        );
    pintarle(actual);
    return { el: cont, pintar: pintarle };
}

async function prepararTique(archivo) {
    // Las fotos del móvil pesan mucho: se reducen a 2000 px de lado (se sigue leyendo bien) antes de subirlas.
    if (!/^image\/(jpeg|png|webp)$/.test(archivo.type) || archivo.size < 1.5 * 1024 * 1024) return archivo;
    try {
        const imagen = await createImageBitmap(archivo);
        const escala = Math.min(1, 2000 / Math.max(imagen.width, imagen.height));
        const lienzo = document.createElement("canvas");
        lienzo.width = Math.round(imagen.width * escala);
        lienzo.height = Math.round(imagen.height * escala);
        lienzo.getContext("2d").drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
        const reducida = await new Promise((listo) => lienzo.toBlob(listo, "image/jpeg", 0.85));
        return reducida && reducida.size < archivo.size ? reducida : archivo;
    } catch {
        return archivo;
    }
}

function formulario({ movimiento = null, tipo = "gasto", persona, para, importe } = {}) {
    let actual = movimiento;
    const otros = (id) => socios(movimiento?.para).filter((u) => u.id !== id);
    const v = {
        tipo: movimiento?.tipo || tipo,
        importe: movimiento?.importe ?? importe ?? null,
        concepto: movimiento?.concepto ?? "",
        categoria: movimiento?.categoria ?? "",
        persona: movimiento?.persona ?? persona ?? E.yo.id,
        para: movimiento?.para ?? para ?? null,
        fecha: movimiento?.fecha ?? hoy(),
        notas: movimiento?.notas ?? "",
    };
    let tiqueNuevo = null;
    let quitarTique = false;
    let ventanaAbierta = null;

    const cuerpo = h("form", {
        class: "formulario-libro",
        novalidate: true,
        onsubmit: (e) => {
            e.preventDefault();
            guardar();
        },
    });
    const error = h("p", { class: "error", role: "alert" });
    const previo = h("div", { class: "previo-libro", "aria-live": "polite" });
    const boton = h("button", { class: "btn primario", type: "submit" });
    const campos = {};

    function pintarPrevio() {
        const lineas = [];
        if (!v.importe) {
            previo.replaceChildren(h("p", { class: "nota" }, "Escribe cuánto y aquí verás cómo queda."));
            return;
        }
        if (v.tipo === "pago") {
            if (!v.para || v.para === v.persona) {
                previo.replaceChildren(h("p", { class: "nota" }, "Elige a quién se le paga."));
                return;
            }
            const cuanto = h("strong", { class: "cifra-pixel" }, euros(v.importe));
            if (v.persona === E.yo.id) lineas.push(h("p", null, "Le das ", cuanto, ` a ${nombre(v.para)}.`));
            else if (v.para === E.yo.id) lineas.push(h("p", null, `${nombre(v.persona)} te da `, cuanto, "."));
            else lineas.push(h("p", null, `${nombre(v.persona)} le da `, cuanto, ` a ${nombre(v.para)}.`));
        } else {
            const reparto = repartir(v.importe, E.partes);
            const trozos = E.usuarios.filter((u) => reparto[u.id] !== undefined).map((u, i) => [i ? " · " : "", `${u.nombre} `, h("strong", { class: "cifra-pixel" }, euros(reparto[u.id]))]);
            if (trozos.length > 1) lineas.push(h("p", null, v.tipo === "gasto" ? "Se reparte: " : "A cada uno le corresponde: ", trozos));
        }
        const nuevo = { ...(actual || {}), ...v, id: actual?.id || "·nuevo" };
        const lista = [...E.movimientos.filter((m) => m.id !== nuevo.id), nuevo];
        const deudas = deudasCon(lista, E.partes, E.usuarios);
        lineas.push(
            deudas.length
                ? h("p", null, "Después: ", deudas.map((d, i) => [i ? "; " : "", fraseDeuda(d, true)]), ".")
                : h("p", null, "Después: ", h("strong", null, "estaréis en paz"), "."),
        );
        previo.replaceChildren(...lineas);
    }

    function construir() {
        const t = TIPOS[v.tipo];
        if (v.tipo === "pago" && (!v.para || v.para === v.persona)) v.para = otros(v.persona)[0]?.id || null;
        const tipos = h(
            "div",
            { class: "tipos-libro", role: "radiogroup", "aria-label": "Qué es" },
            Object.entries(TIPOS).map(([id, x]) =>
                h(
                    "button",
                    {
                        type: "button",
                        role: "radio",
                        "aria-checked": String(id === v.tipo),
                        class: ["tipo-libro", id, id === v.tipo && "elegido"],
                        onclick: () => {
                            if (v.tipo === id) return;
                            v.tipo = id;
                            construir();
                            campoImporte.focus();
                        },
                    },
                    h("span", { "aria-hidden": "true" }, x.icono),
                    x.nombre,
                ),
            ),
        );
        const entendido = h("span", { class: "entendido" });
        const campoImporte = h("input", {
            class: "campo importe-libro",
            inputmode: "decimal",
            autocomplete: "off",
            placeholder: "0,00",
            "aria-label": "Importe en euros",
            value: paraEscribir(v.importe),
            oninput: (e) => {
                v.importe = leerImporte(e.target.value);
                entendido.textContent = e.target.value.trim() && !v.importe ? "No lo entiendo: escribe algo como 12,50" : "";
                entendido.classList.toggle("mal", Boolean(e.target.value.trim() && !v.importe));
                pintarPrevio();
            },
            onblur: (e) => {
                if (v.importe) e.target.value = formato.format(v.importe / 100);
            },
        });
        const conceptos = [...new Set(E.movimientos.filter((m) => m.tipo === v.tipo && m.concepto).reverse().map((m) => m.concepto))].slice(0, 60);
        const idLista = `conceptos-${v.tipo}`;
        const campoConcepto = h("input", {
            class: "campo",
            maxlength: 200,
            placeholder: t.ejemplo,
            list: conceptos.length ? idLista : null,
            value: v.concepto,
            oninput: (e) => {
                v.concepto = e.target.value;
                // Si es algo que ya se había apuntado, se propone la misma categoría.
                const antes = E.movimientos.find((m) => m.tipo === v.tipo && m.concepto === v.concepto && m.categoria);
                if (antes && !v.categoria) {
                    v.categoria = antes.categoria;
                    pintarCategorias();
                }
            },
        });
        const categorias = h("div", { class: "elecciones categorias-libro", role: "radiogroup", "aria-label": "Categoría" });
        function pintarCategorias() {
            const todas = [...new Set([...E.categorias, ...(v.categoria ? [v.categoria] : [])])];
            categorias.replaceChildren(
                ...todas.map((c) =>
                    h(
                        "button",
                        {
                            type: "button",
                            role: "radio",
                            "aria-checked": String(c === v.categoria),
                            class: ["eleccion", c === v.categoria && "elegida"],
                            onclick: () => {
                                v.categoria = v.categoria === c ? "" : c;
                                pintarCategorias();
                            },
                        },
                        c,
                    ),
                ),
            );
        }
        pintarCategorias();
        const elegirPara = eleccionPersonas(
            () => otros(v.persona),
            v.para,
            (id) => {
                v.para = id;
                pintarPrevio();
            },
        );
        const elegirPersona = eleccionPersonas(
            () => socios(movimiento?.persona),
            v.persona,
            (id) => {
                v.persona = id;
                if (v.tipo === "pago") {
                    if (!v.para || v.para === id) v.para = otros(id)[0]?.id || null;
                    elegirPara.pintar(v.para);
                }
                pintarPrevio();
            },
        );
        const campoFecha = h("input", {
            class: "campo fecha-libro",
            type: "date",
            value: v.fecha,
            max: sumarDias(hoy(), 366),
            required: true,
            onchange: (e) => {
                v.fecha = e.target.value || hoy();
                pintarPrevio();
            },
        });
        const atajoFecha = (texto, fecha) =>
            h(
                "button",
                {
                    type: "button",
                    class: "btn pequeno",
                    onclick: () => {
                        v.fecha = fecha;
                        campoFecha.value = fecha;
                    },
                },
                texto,
            );
        const campoNotas = h("textarea", {
            class: "campo",
            rows: 2,
            maxlength: 4000,
            placeholder: "Número de factura, para qué evento era…",
            oninput: (e) => {
                v.notas = e.target.value;
            },
        });
        campoNotas.value = v.notas;
        const zonaNotas = h("label", { class: "etiqueta-campo", hidden: !v.notas }, h("span", null, "Notas"), campoNotas);
        const abrirNotas = h(
            "button",
            {
                type: "button",
                class: "enlace",
                hidden: Boolean(v.notas),
                onclick: () => {
                    zonaNotas.hidden = false;
                    abrirNotas.hidden = true;
                    campoNotas.focus();
                },
            },
            "+ Añadir una nota",
        );

        // Tique: una foto (el móvil deja hacerla en el momento) o un PDF
        const entradaTique = h("input", {
            type: "file",
            accept: "image/jpeg,image/png,image/webp,application/pdf,image/*",
            hidden: true,
            onchange: () => {
                const archivo = entradaTique.files[0];
                entradaTique.value = "";
                if (!archivo) return;
                if (archivo.size > 12 * 1024 * 1024 && !archivo.type.startsWith("image/")) {
                    error.textContent = "Ese archivo pesa demasiado (máximo 12 MB).";
                    return;
                }
                tiqueNuevo = archivo;
                quitarTique = false;
                pintarTique();
            },
        });
        const zonaTique = h("div", { class: "tique-libro" });
        function pintarTique() {
            const tiene = actual?.tique && !quitarTique;
            const partes = [];
            if (tiqueNuevo) {
                partes.push(h("span", { class: "chip" }, "Nuevo"), h("span", { class: "nombre-tique" }, tiqueNuevo.name || "foto"));
                partes.push(
                    h(
                        "button",
                        {
                            type: "button",
                            class: "enlace",
                            onclick: () => {
                                tiqueNuevo = null;
                                pintarTique();
                            },
                        },
                        "Quitar",
                    ),
                );
            } else if (tiene) {
                const url = direccionApi(`libro/tiques/${actual.tique.archivo}`);
                if (actual.tique.tipo.startsWith("image/")) partes.push(h("a", { href: url, target: "_blank", rel: "noopener", class: "miniatura-tique", title: "Ver el tique" }, h("img", { src: url, alt: "Tique" })));
                partes.push(h("a", { href: url, target: "_blank", rel: "noopener", class: "enlace" }, "Ver el tique ↗"));
                partes.push(h("button", { type: "button", class: "enlace", onclick: () => entradaTique.click() }, "Cambiar"));
                partes.push(
                    h(
                        "button",
                        {
                            type: "button",
                            class: "enlace",
                            onclick: () => {
                                quitarTique = true;
                                pintarTique();
                            },
                        },
                        "Quitar",
                    ),
                );
            } else {
                partes.push(h("button", { type: "button", class: "btn pequeno", onclick: () => entradaTique.click() }, "Adjuntar foto o PDF"));
                if (quitarTique) partes.push(h("span", { class: "nota" }, "Se quitará al guardar."));
            }
            zonaTique.replaceChildren(...partes, entradaTique);
        }
        pintarTique();

        const fila = (etiqueta, ...contenido) => h("div", { class: "etiqueta-campo" }, h("span", null, etiqueta), ...contenido);
        const piezas = [
            tipos,
            h("p", { class: "nota explica-tipo" }, t.explica),
            fila("¿Cuánto?", h("div", { class: "fila-importe" }, campoImporte, h("span", { class: "moneda" }, "€")), entendido),
            v.tipo === "pago" ? null : fila(t.que, campoConcepto),
            v.tipo === "pago" ? null : fila("Categoría", categorias),
            fila(t.quien, elegirPersona.el),
            v.tipo === "pago" ? fila("¿A quién?", elegirPara.el) : null,
            fila("¿Cuándo?", h("div", { class: "fila-fecha" }, campoFecha, atajoFecha("Hoy", hoy()), atajoFecha("Ayer", sumarDias(hoy(), -1)))),
            v.tipo === "pago" ? fila(t.que, campoConcepto) : null,
            conceptos.length ? h("datalist", { id: idLista }, conceptos.map((c) => h("option", { value: c }))) : null,
            v.tipo === "pago" ? null : fila("Tique", zonaTique),
            v.tipo === "pago" ? null : h("div", null, abrirNotas, zonaNotas),
            previo,
            error,
            h(
                "div",
                { class: "acciones-ventana" },
                actual ? h("button", { type: "button", class: "btn peligro", onclick: borrar }, "Borrar") : null,
                h("span", { class: "crece" }),
                h("button", { type: "button", class: "btn", onclick: () => ventanaAbierta?.cerrar() }, "Cancelar"),
                boton,
            ),
            actual
                ? h(
                      "p",
                      { class: "nota autoria" },
                      `Apuntado por ${nombre(actual.creadoPor)} ${haceCuanto(actual.creado)}`,
                      actual.actualizado !== actual.creado ? ` · cambiado por ${nombre(actual.actualizadoPor)} ${haceCuanto(actual.actualizado)}` : "",
                      ".",
                  )
                : null,
        ];
        cuerpo.replaceChildren(...piezas.filter(Boolean));
        boton.textContent = actual ? "Guardar" : `Apuntar ${t.nombre.toLowerCase()}`;
        pintarPrevio();
        campos.importe = campoImporte;
        campos.concepto = campoConcepto;
    }

    async function guardar() {
        error.textContent = "";
        if (!v.importe) {
            error.textContent = "Escribe cuánto, por ejemplo 12,50.";
            campos.importe.focus();
            return;
        }
        if (v.tipo !== "pago" && !v.concepto.trim()) {
            error.textContent = v.tipo === "gasto" ? "Pon en qué se ha gastado." : "Pon de dónde viene el dinero.";
            campos.concepto.focus();
            return;
        }
        if (v.tipo === "pago" && (!v.para || v.para === v.persona)) {
            error.textContent = "Elige a quién se le paga.";
            return;
        }
        const datos = {
            tipo: v.tipo,
            fecha: v.fecha || hoy(),
            concepto: v.concepto.trim(),
            categoria: v.tipo === "pago" ? "" : v.categoria,
            persona: v.persona,
            para: v.tipo === "pago" ? v.para : null,
            importe: v.importe,
            notas: v.tipo === "pago" ? actual?.notas || "" : v.notas,
        };
        boton.disabled = true;
        const eraNuevo = !actual;
        try {
            if (actual) {
                const cambios = {};
                for (const [k, x] of Object.entries(datos)) if ((actual[k] ?? null) !== (x ?? null)) cambios[k] = x;
                if (Object.keys(cambios).length) actual = await api.cambiarMovimiento(actual.id, cambios);
            } else {
                actual = await api.apuntar(datos);
            }
            if (quitarTique && actual.tique) actual = await api.quitarTique(actual.id);
            quitarTique = false;
            if (tiqueNuevo) {
                boton.textContent = "Subiendo el tique…";
                actual = await api.subirTique(actual.id, await prepararTique(tiqueNuevo), tiqueNuevo.name);
                tiqueNuevo = null;
            }
            ventanaAbierta?.cerrar();
            aviso(eraNuevo ? `${TIPOS[v.tipo].nombre} apuntado.` : "Cambios guardados.");
            await recargar();
        } catch (err) {
            error.textContent = err.message;
            // Si ya se había apuntado (y falló el tique), un segundo intento no lo apunta dos veces.
            if (eraNuevo && actual) boton.textContent = "Reintentar";
            recargar();
        } finally {
            boton.disabled = false;
        }
    }

    async function borrar() {
        const m = actual;
        try {
            await api.borrarMovimiento(m.id);
            ventanaAbierta?.cerrar();
            await recargar();
            aviso("Movimiento borrado.", {
                accion: "Deshacer",
                duracion: 8000,
                alAccion: async () => {
                    try {
                        await api.restaurarMovimiento(m.id);
                        await recargar();
                    } catch (err) {
                        aviso(err.message, { tipo: "malo" });
                    }
                },
            });
        } catch (err) {
            error.textContent = err.message;
        }
    }

    construir();
    const titulo = movimiento ? `${TIPOS[movimiento.tipo].nombre} del ${fechaLarga(movimiento.fecha).replace(/^\S+ /, "")}` : "Apuntar";
    ventanaAbierta = ventana(titulo, cuerpo, { ancho: 540 });
    if (!movimiento) campos.importe.focus();
}

// ---------- reparto y categorías (quien administra) ----------

function ajustes() {
    const gente = E.usuarios.filter((u) => !u.baja);
    const valores = Object.fromEntries(gente.map((u) => [u.id, E.partes[u.id] || 0]));
    let categorias = [...E.categorias];
    const suma = h("p", { class: "suma-partes" });
    const error = h("p", { class: "error", role: "alert" });
    const entradas = {};
    const pintarSuma = () => {
        const s = Math.round(Object.values(valores).reduce((a, b) => a + (Number(b) || 0), 0) * 100) / 100;
        suma.textContent = `Suman ${porcentaje(s)}${Math.abs(s - 100) < 0.001 ? " ✓" : " (tienen que sumar 100 %)"}`;
        suma.classList.toggle("mal", Math.abs(s - 100) >= 0.001);
    };
    const filas = gente.map((u) => {
        entradas[u.id] = h("input", {
            class: "campo parte-libro",
            type: "number",
            min: 0,
            max: 100,
            step: 0.01,
            inputmode: "decimal",
            value: valores[u.id],
            "aria-label": `Parte de ${u.nombre}`,
            oninput: (e) => {
                valores[u.id] = Number(String(e.target.value).replace(",", ".")) || 0;
                pintarSuma();
            },
        });
        return h("label", { class: "fila-parte" }, avatar(u), h("span", { class: "crece" }, u.nombre), entradas[u.id], h("span", null, "%"));
    });
    const iguales = () => {
        const con = gente.filter((u) => valores[u.id] > 0);
        const quienes = con.length ? con : gente;
        const base = Math.floor(10000 / quienes.length) / 100;
        for (const u of gente) valores[u.id] = 0;
        quienes.forEach((u, i) => {
            valores[u.id] = i === 0 ? Math.round((100 - base * (quienes.length - 1)) * 100) / 100 : base;
        });
        for (const u of gente) entradas[u.id].value = valores[u.id];
        pintarSuma();
    };
    const listaCategorias = h("div", { class: "etiquetas-puestas categorias-ajustes" });
    const pintarCategorias = () =>
        listaCategorias.replaceChildren(
            ...categorias.map((c) =>
                h(
                    "span",
                    { class: "etiqueta chip-categoria" },
                    c,
                    h(
                        "button",
                        {
                            type: "button",
                            class: "quitar",
                            "aria-label": `Quitar ${c}`,
                            onclick: () => {
                                categorias = categorias.filter((x) => x !== c);
                                pintarCategorias();
                            },
                        },
                        "×",
                    ),
                ),
            ),
        );
    pintarCategorias();
    const nueva = h("input", { class: "campo", maxlength: 40, placeholder: "Categoría nueva" });
    const anadir = () => {
        const c = nueva.value.trim().replace(/\s+/g, " ");
        if (c && !categorias.some((x) => x.toLowerCase() === c.toLowerCase())) categorias.push(c);
        nueva.value = "";
        pintarCategorias();
        nueva.focus();
    };
    nueva.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            anadir();
        }
    });
    pintarSuma();
    const v = ventana(
        "Reparto y categorías",
        h(
            "div",
            { class: "pila" },
            h("h3", null, "Parte de cada socio"),
            h("p", { class: "nota" }, "Cada gasto y cada ingreso se reparte con estos porcentajes. Ojo: el reparto vale para todas las cuentas, también para lo que ya está apuntado."),
            h("div", { class: "filas-partes" }, filas),
            h("div", { class: "fila-botones" }, suma, h("button", { type: "button", class: "btn pequeno", onclick: iguales }, "A partes iguales")),
            h("h3", null, "Categorías"),
            listaCategorias,
            h("div", { class: "fila-botones" }, nueva, h("button", { type: "button", class: "btn pequeno", onclick: anadir }, "Añadir")),
            error,
            h(
                "div",
                { class: "acciones-ventana" },
                h("button", { type: "button", class: "btn", onclick: () => v.cerrar() }, "Cancelar"),
                h(
                    "button",
                    {
                        type: "button",
                        class: "btn primario",
                        onclick: async () => {
                            error.textContent = "";
                            try {
                                if (nueva.value.trim()) anadir();
                                cargar(await api.ajustesLibro({ partes: valores, categorias }));
                                v.cerrar();
                                aviso("Reparto y categorías guardados.");
                            } catch (err) {
                                error.textContent = err.message;
                            }
                        },
                    },
                    "Guardar",
                ),
            ),
        ),
        { ancho: 480 },
    );
}

function ayuda() {
    ventana(
        "¿Cómo funciona?",
        h(
            "div",
            { class: "pila ayuda-libro" },
            h("p", null, h("strong", null, "Gasto: "), "alguien paga algo de HOT SPOT con su dinero. Se reparte entre los socios según su parte; quien lo ha pagado pone de más, así que se le debe la diferencia."),
            h("p", null, h("strong", null, "Ingreso: "), "alguien cobra dinero de HOT SPOT (entradas, un bolo…). También se reparte: a cada socio le corresponde su parte, y quien lo tiene debe dárselo."),
            h("p", null, h("strong", null, "Pago: "), "un socio le da dinero a otro para quedar en paz. Arriba sale siempre quién le debe a quién y cuánto; con el botón «Apuntar el pago» se apunta con un clic."),
            h("p", null, "Para verlo en Excel, descárgalo en Excel o en CSV (el CSV también se abre en Numbers o en Hojas de cálculo de Google)."),
            h("p", { class: "nota" }, "Los importes se guardan al céntimo y los repartos no pierden ni un céntimo por el redondeo."),
        ),
        { ancho: 520 },
    );
}

function importar() {
    const entrada = h("input", { type: "file", accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", hidden: true });
    entrada.addEventListener("change", async () => {
        const archivo = entrada.files[0];
        entrada.remove();
        if (!archivo) return;
        try {
            const r = await api.importarLibro(archivo);
            await recargar();
            const extra = [r.repetidos ? `${r.repetidos} ya estaban` : "", r.sinPersona ? `${r.sinPersona} sin una persona del crew en «Pagado por»` : ""].filter(Boolean).join("; ");
            aviso(
                r.importados
                    ? `Importados ${r.importados} movimiento${r.importados > 1 ? "s" : ""} de la hoja «${r.hoja}»${extra ? ` (${extra})` : ""}.`
                    : `No había movimientos nuevos en «${r.hoja}»${extra ? ` (${extra})` : ""}.`,
                { duracion: 9000 },
            );
        } catch (err) {
            aviso(err.message, { tipo: "malo", duracion: 9000 });
        }
    });
    document.body.appendChild(entrada);
    entrada.click();
}

// ---------- menú de la cuenta ----------

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
                    class: ["opcion", o.otra && "otra-pantalla"],
                    type: o.href ? null : "button",
                    href: o.href,
                    download: o.download,
                    target: o.target,
                    rel: o.target ? "noopener" : null,
                    onclick: (e) => {
                        cerrarMenu();
                        o.accion?.(e);
                    },
                },
                h("span", { class: "marca" }, ""),
                o.contenido,
            ),
        );
    }
    return lista;
}

function menuYo(ancla) {
    abrirMenu(ancla, () =>
        h(
            "div",
            null,
            h("div", { class: "menu-titulo" }, `Hola, ${E.yo.nombre}`),
            opcionesMenu([
                dentroDeLaOficina() ? { contenido: "Abrir en pestaña nueva ↗", href: sinSolo(location.href.split("#")[0]), target: "_blank" } : null,
                { contenido: "Descargar en Excel", href: direccionApi("libro/excel"), download: "" },
                { contenido: "Descargar en CSV", href: direccionApi("libro/csv"), download: "" },
                { contenido: "Importar desde Excel…", accion: importar },
                "-",
                E.yo.admin ? { contenido: "Reparto y categorías…", accion: ajustes } : null,
                { contenido: "¿Cómo funciona?", accion: ayuda },
                // «otra»: lleva a otra pantalla (con ?solo=1 no sale, ver solo.js)
                { contenido: "Tablón de tareas", href: "../", otra: true },
                { contenido: "Pizarra", href: "../pizarra/", otra: true },
                { contenido: "Archivo", href: "../archivo/", otra: true },
                { contenido: "Música", href: "../musica/", otra: true },
                "-",
                { contenido: "Salir", accion: salir },
            ]),
        ),
    );
}

async function salir() {
    try {
        await api.salir();
    } catch {
        /* da igual: se sale igualmente */
    }
    sinSesion();
}

// ---------- datos y tiempo real ----------

function cargar(datos) {
    E.yo = datos.yo;
    E.usuarios = datos.usuarios;
    E.partes = datos.partes || {};
    E.categorias = datos.categorias || [];
    E.movimientos = datos.movimientos || [];
    E.resumen = datos.resumen;
    if (E.filtros.persona !== "todas" && !usuario(E.filtros.persona)) E.filtros.persona = "todas";
    pintar();
}

async function recargar() {
    if (espera) return espera.probar(); // en «Solo para los socios» no hay libro que repintar: se prueba a entrar
    try {
        cargar(await api.libro());
    } catch (err) {
        if (err.estado === 403) sinAcceso(err.message);
    }
}
const recargarPronto = retrasar(recargar, 250);

function alRecibir(ev) {
    if (ev.tipo === "libro" || ev.tipo === "usuarios") recargarPronto();
}

function empezar(datos) {
    espera = null;
    cargar(datos);
    montar();
    dejarDeEscuchar?.();
    dejarDeEscuchar = escuchar(alRecibir, recargar);
    const pedido = new URLSearchParams(location.search).get("apuntar");
    if (TIPOS[pedido]) formulario({ tipo: pedido });
}

async function entrarYEmpezar() {
    try {
        empezar(await api.libro());
    } catch (err) {
        if (err.estado === 403) sinAcceso(err.message);
        else sinConexion(err.message);
    }
}

function sinSesion() {
    dejarDeEscuchar?.();
    dejarDeEscuchar = null;
    espera = null;
    E.yo = null;
    cerrarMenu();
    document.querySelector(".fondo-ventana")?.remove();
    colocarAvisos();
    pantallaEntrar(raiz, entrarYEmpezar);
}
cuandoSePierdaLaSesion(() => {
    if (E.yo) sinSesion();
});

function caja(...contenido) {
    vaciar(raiz).appendChild(
        h(
            "main",
            { class: "acceso" },
            h(
                "div",
                { class: "acceso-caja" },
                h("div", { class: "acceso-marca" }, h("span", { class: "logo" }, "HS"), h("div", null, h("strong", null, "CUENTAS"), h("small", null, "HOT SPOT S.L."))),
                ...contenido,
            ),
        ),
    );
}

function sinAcceso(mensaje) {
    dejarDeEscuchar?.();
    // Ya no hay libro que enseñar: fuera también lo que hubiera abierto encima (un menú, el formulario de apuntar) y
    // los atajos del teclado (sin E.yo no hacen nada).
    E.yo = null;
    cerrarMenu();
    document.querySelector(".fondo-ventana")?.remove();
    colocarAvisos();
    caja(h("h1", null, "Solo para los socios"), h("p", null, mensaje), h("a", { class: "btn primario ancho otra-pantalla", href: "../" }, "Ir al tablón de tareas"));
    // La pantalla sigue escuchando: si le dan parte en el reparto (o pasa a administrar), el libro se abre solo.
    espera = esperarAcceso({ escuchar, pedir: api.libro, alEntrar: empezar, alPerderSesion: sinSesion });
    dejarDeEscuchar = espera.parar;
}

function sinConexion(mensaje) {
    caja(h("h1", null, "No hay conexión"), h("p", null, mensaje), h("button", { class: "btn ancho", type: "button", onclick: () => location.reload() }, "Reintentar"));
}

// ---------- teclado ----------

document.addEventListener("keydown", (e) => {
    if (!E.yo || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest("input, textarea, select, [contenteditable=true]") || document.querySelector(".fondo-ventana") || hayMenu()) return;
    if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        formulario();
    } else if (e.key === "/") {
        e.preventDefault();
        $("#buscar-libro")?.focus();
    }
});

// Al volver a la pestaña después de un rato, se refresca por si se ha perdido algún aviso.
let oculta = 0;
document.addEventListener("visibilitychange", () => {
    if (document.hidden) oculta = Date.now();
    else if (E.yo && oculta && Date.now() - oculta > 60000) recargar();
    else if (espera && oculta && Date.now() - oculta > 60000) espera.probar();
});

// ---------- inicio ----------

(async function inicio() {
    try {
        empezar(await api.libro());
    } catch (err) {
        if (err.estado === 401) pantallaEntrar(raiz, entrarYEmpezar);
        else if (err.estado === 403) sinAcceso(err.message);
        else sinConexion(err.message);
    }
})();
