// Pizarra compartida de HOT SPOT S.L. (la de la sala de reuniones): pintar a mano, pegar fotos y notas, y que
// todos lo vean a la vez, con el lápiz de cada uno moviéndose en directo.
//
// El lienzo mide siempre 1920 × 1200 (como en el servidor, servidor/pizarra.js) y se escala a la pantalla; con la
// lupa se acerca. Abajo van las fotos, luego las notas y encima los trazos (dos lienzos: lo guardado y lo que se
// está pintando ahora), para poder pintar encima de todo. Los botones de lo elegido y los lápices de los demás
// van a tamaño de pantalla, se vea la pizarra grande o pequeña.

import { h, $, vaciar, retrasar, hoy, textoSobre } from "./util.js";
import { api, escuchar, cuandoSePierdaLaSesion, direccionApi } from "./api.js";
import { pantallaEntrar, aplicacion } from "./acceso.js";
import { sinSolo } from "./solo.js";
import { abrirMenu, cerrarMenu, hayMenu, aviso, ventana, avatar } from "./menus.js";

aplicacion("PIZARRA", "La pizarra es del crew de HOT SPOT S.L. Entra con tu cuenta de Google.");

const ANCHO = 1920;
const ALTO = 1200;
const COLORES = [
    ["#1c1715", "Negro"],
    ["#e0303a", "Rojo"],
    ["#e0562a", "Naranja"],
    ["#ffd84a", "Amarillo"],
    ["#3a9d5d", "Verde"],
    ["#3b82c4", "Azul"],
    ["#8e5cc4", "Morado"],
    ["#ffffff", "Blanco"],
];
const GROSORES = [
    [3, "Fino"],
    [6, "Normal"],
    [12, "Gordo"],
    [28, "Rotulador"],
];
const COLORES_NOTA = [
    ["#ffd84a", "Amarilla"],
    ["#f6c8b4", "Rosa"],
    ["#c9dff3", "Azul"],
    ["#cfe8c9", "Verde"],
    ["#e5d3f2", "Lila"],
];
const HERRAMIENTAS = [
    { id: "mover", nombre: "Mover", tecla: "V" },
    { id: "lapiz", nombre: "Lápiz", tecla: "P" },
    { id: "goma", nombre: "Goma", tecla: "E" },
    { id: "nota", nombre: "Nota", tecla: "N" },
    { id: "foto", nombre: "Foto", tecla: "F" },
];
const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3, 4];
const RADIO_GOMA = 14;
const MAXIMO_PUNTOS = 4990; // el servidor admite 5000 por trazo: si se pasa, sigue en otro

const ID = (new URLSearchParams(location.search).get("p") || "reuniones").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30) || "reuniones";

const E = {
    yo: null,
    usuarios: [],
    pizarra: null,
    puedeRecuperar: false,
    elementos: new Map(), // id → elemento, en el orden de la pizarra (lo último, encima)
    presentes: [],
    herramienta: "lapiz",
    color: COLORES[0][0],
    grosor: 6,
    seleccion: null,
    editando: null,
    zoom: 1,
    deshacer: [],
    rehacer: [],
    vivos: new Map(), // autor → { cursor, trazo, visto }
};

const raiz = document.getElementById("app");
let dejarDeEscuchar = null;
let observador = null;
let escala = 1;

const cajas = new WeakMap();
const pendientes = new Map(); // id → promesa de lo que aún se está guardando (para no cambiarlo antes de que exista)
const nuevoId = () => {
    const b = crypto.getRandomValues(new Uint8Array(9));
    return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const usuario = (id) => E.usuarios.find((u) => u.id === id) || null;
const nombre = (id) => usuario(id)?.nombre || "Alguien";
const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

// ---------- iconos ----------

// Iconos de píxeles (12 × 12, cada «#» es un píxel), a juego con las letras de la oficina.
const ICONOS = {
    mover: ["#...........", "##..........", "###.........", "####........", "#####.......", "######......", "#######.....", "########....", "#####.......", "##.##.......", "#...##......", ".....##....."],
    lapiz: ["..........#.", ".........###", "........###.", ".......###..", "......###...", ".....###....", "....###.....", "...###......", "..###.......", "..##........", ".#..........", "............"],
    goma: ["............", "............", "............", ".##########.", ".#####....#.", ".#####....#.", ".#####....#.", ".##########.", "............", "............", "............", "............"],
    nota: ["############", "#..........#", "#.######...#", "#..........#", "#.#######..#", "#..........#", "#.#####....#", "#..........#", "#.......####", "#.......#.#.", "#.......##..", "#########..."],
    foto: ["............", "............", "############", "#..........#", "#.......##.#", "#.......##.#", "#...#......#", "#..###..#..#", "#.#####.####", "############", "............", "............"],
    deshacer: ["............", "...#........", "..##........", ".#########..", "..##......#.", "...#.......#", "...........#", "...........#", "..........#.", ".....#####..", "............", "............"],
    descargar: [".....##.....", ".....##.....", ".....##.....", ".....##.....", "..#..##..#..", "...#.##.#...", "....####....", ".....##.....", "............", "#..........#", "#..........#", "############"],
    vaciar: ["....####....", "############", "............", ".##########.", ".#.#.##.#.#.", ".#.#.##.#.#.", ".#.#.##.#.#.", ".#.#.##.#.#.", ".#.#.##.#.#.", ".#........#.", ".##########.", "............"],
};
ICONOS.rehacer = ICONOS.deshacer.map((fila) => [...fila].reverse().join(""));

function icono(nombreIcono) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 12 12");
    svg.setAttribute("class", "icono-pixel");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    let d = "";
    ICONOS[nombreIcono].forEach((fila, y) => {
        for (let x = 0; x < fila.length; x++) if (fila[x] === "#") d += `M${x} ${y}h1v1h-1z`;
    });
    const camino = document.createElementNS(NS, "path");
    camino.setAttribute("d", d);
    camino.setAttribute("fill", "currentColor");
    camino.setAttribute("shape-rendering", "crispEdges");
    svg.appendChild(camino);
    return svg;
}

// ---------- dibujar ----------

function dibujarTrazo(ctx, t) {
    const p = t.puntos;
    ctx.strokeStyle = t.color;
    ctx.fillStyle = t.color;
    ctx.lineWidth = t.grosor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (p.length <= 4 && (p.length < 4 || (p[0] === p[2] && p[1] === p[3]))) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], t.grosor / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
    }
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
    ctx.stroke();
}

function prepararLienzo(lienzo) {
    const r = lienzo.getBoundingClientRect();
    // Nitidez de la pantalla, pero sin pasarse de tamaño cuando se acerca mucho (la memoria del navegador).
    const factor = Math.min(window.devicePixelRatio || 1, 3200 / Math.max(1, r.width), 2000 / Math.max(1, r.height));
    const w = Math.max(1, Math.round(r.width * factor));
    const alto = Math.max(1, Math.round(r.height * factor));
    if (lienzo.width !== w || lienzo.height !== alto) {
        lienzo.width = w;
        lienzo.height = alto;
    }
    const ctx = lienzo.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, alto);
    ctx.setTransform(w / ANCHO, 0, 0, alto / ALTO, 0, 0);
    return ctx;
}

function pintarTrazos() {
    const lienzo = $("#trazos");
    if (!lienzo) return;
    const ctx = prepararLienzo(lienzo);
    for (const e of E.elementos.values()) if (e.tipo === "trazo") dibujarTrazo(ctx, e);
}

let trazoActual = null;
function pintarVivo() {
    const lienzo = $("#vivo");
    if (!lienzo) return;
    const ctx = prepararLienzo(lienzo);
    for (const v of E.vivos.values()) if (v.trazo?.puntos.length) dibujarTrazo(ctx, v.trazo);
    if (trazoActual) dibujarTrazo(ctx, trazoActual);
}

function pintarCursores() {
    const capa = $("#cursores");
    if (!capa) return;
    const ahora = Date.now();
    capa.replaceChildren(
        ...[...E.vivos]
            .filter(([, v]) => v.cursor && ahora - v.visto < 8000)
            .map(([autor, v]) => {
                const u = usuario(autor);
                const color = u?.color || "#1c1715";
                return h(
                    "div",
                    { class: "cursor-pizarra", style: { left: `${v.cursor[0]}px`, top: `${v.cursor[1]}px`, "--color": color } },
                    icono("mover"),
                    h("span", { class: "quien", style: { color: textoSobre(color) } }, u?.nombre || "Alguien"),
                );
            }),
    );
}

const srcFoto = (e) => e.local || direccionApi(`pizarras/imagenes/${e.archivo}`);

// Fotos y notas: elementos de la página dentro del «mundo» (1920 × 1200, escalado con transform).
function pintarPiezas() {
    const fotos = $("#fotos");
    const notas = $("#notas");
    if (!fotos) return;
    const hechas = new Map([...fotos.children, ...notas.children].map((el) => [el.dataset.id, el]));
    const vistas = new Set();
    for (const e of E.elementos.values()) {
        if (e.tipo === "trazo") continue;
        vistas.add(e.id);
        let el = hechas.get(e.id);
        if (!el) {
            // Lo nuevo va encima (al final); lo que ya estaba no se mueve, para no quitarle el foco a quien escribe.
            el = e.tipo === "imagen" ? crearFoto(e) : crearNota(e);
            (e.tipo === "imagen" ? fotos : notas).appendChild(el);
        }
        Object.assign(el.style, { left: `${e.x}px`, top: `${e.y}px`, width: `${e.ancho}px`, height: `${e.alto}px` });
        el.classList.toggle("elegida", E.seleccion === e.id);
        if (e.tipo === "imagen") {
            el.classList.toggle("subiendo", Boolean(e.subiendo));
            const img = el.querySelector("img");
            const src = srcFoto(e);
            if (img.getAttribute("src") !== src) img.src = src;
        } else {
            el.style.background = e.color;
            const texto = el.querySelector("textarea");
            if (E.editando !== e.id && texto.value !== e.texto) texto.value = e.texto;
        }
    }
    for (const [id, el] of hechas) if (!vistas.has(id)) el.remove();
    if (E.seleccion && !E.elementos.has(E.seleccion)) E.seleccion = null;
    if (E.editando && !E.elementos.has(E.editando)) E.editando = null;
    pintarEleccion();
}

function pintarTodo() {
    pintarTrazos();
    pintarVivo();
    pintarPiezas();
    pintarCursores();
    pintarCabecera();
    pintarVacia();
}

function pintarVacia() {
    const aviso = $("#aviso-vacia");
    if (!aviso) return;
    const vacia = !E.elementos.size && !trazoActual && ![...E.vivos.values()].some((v) => v.trazo?.puntos.length);
    aviso.hidden = !vacia;
    if (!vacia) return;
    const piezas = [
        h("span", null, "Pizarra en blanco. Pinta con el lápiz, pon una nota o pega una foto (Ctrl+V o arrastrándola aquí)."),
        E.puedeRecuperar ? h("button", { type: "button", class: "btn pequeno", onclick: () => recuperar(true) }, "Recuperar lo que había") : null,
    ];
    aviso.replaceChildren(...piezas.filter(Boolean));
}

// ---------- la barra de lo elegido (colores de la nota, escribir, quitar…) ----------

function pintarEleccion() {
    const barra = $("#barra-eleccion");
    if (!barra) return;
    const e = E.seleccion ? E.elementos.get(E.seleccion) : null;
    if (!e || e.tipo === "trazo" || E.herramienta !== "mover") {
        barra.hidden = true;
        barra.dataset.para = "";
        return;
    }
    const clave = `${e.id}|${e.color || ""}|${E.editando === e.id}|${Boolean(e.subiendo)}`;
    if (barra.dataset.para !== clave) {
        barra.dataset.para = clave;
        barra.replaceChildren(...contenidoEleccion(e).filter(Boolean));
    }
    barra.hidden = false;
    const marco = $("#mundo-marco");
    const anchoBarra = barra.offsetWidth;
    const altoBarra = barra.offsetHeight;
    let arriba = e.y * escala - altoBarra - 10;
    if (arriba < 4) arriba = (e.y + e.alto) * escala + 10;
    const izquierda = limitar(e.x * escala, 4, Math.max(4, marco.clientWidth - anchoBarra - 4));
    barra.style.left = `${izquierda}px`;
    barra.style.top = `${limitar(arriba, 4, Math.max(4, marco.clientHeight - altoBarra - 4))}px`;
}

function contenidoEleccion(e) {
    const quitarBoton = h("button", { type: "button", class: "accion", title: "Quitar (Supr)", onclick: () => quitar([e.id]) }, "Quitar");
    if (e.tipo === "imagen") {
        return [
            e.subiendo ? h("span", { class: "accion apagada" }, "Subiendo…") : h("a", { class: "accion", href: srcFoto(e), target: "_blank", rel: "noopener" }, "Ver en grande ↗"),
            h("span", { class: "separador" }),
            quitarBoton,
        ];
    }
    return [
        ...COLORES_NOTA.map(([c, n]) =>
            h("button", {
                type: "button",
                class: ["color-nota", e.color === c && "activo"],
                style: { background: c },
                title: `Nota ${n.toLowerCase()}`,
                "aria-label": `Nota ${n.toLowerCase()}`,
                "aria-pressed": String(e.color === c),
                onclick: () => colorNota(e.id, c),
            }),
        ),
        h("span", { class: "separador" }),
        E.editando === e.id ? null : h("button", { type: "button", class: "accion", title: "Escribir (Intro)", onclick: () => editar(e.id) }, "Escribir"),
        quitarBoton,
    ];
}

function colorNota(id, color) {
    const e = E.elementos.get(id);
    if (!e || e.color === color) return;
    registrar({ tipo: "cambiar", id, antes: { color: e.color }, despues: { color } });
    e.color = color;
    pintarPiezas();
    cambiarEnServidor(id, { color });
}

// ---------- fotos y notas ----------

function arrastrable(el, id, { proporcion = false } = {}) {
    el.addEventListener("pointerdown", (ev) => {
        if (E.herramienta !== "mover" || ev.button > 0) return;
        const e = E.elementos.get(id);
        if (!e) return;
        const texto = ev.target.closest("textarea");
        if (texto && !texto.readOnly) return; // escribiendo: el ratón es para el texto
        ev.preventDefault();
        ev.stopPropagation();
        const yaElegida = E.seleccion === id;
        if (E.editando && E.editando !== id) document.activeElement?.blur();
        elegir(id);
        const cambiarTamano = Boolean(ev.target.closest(".redimensionar"));
        const inicio = { x: ev.clientX, y: ev.clientY, caja: { x: e.x, y: e.y, ancho: e.ancho, alto: e.alto } };
        let movido = false;
        el.setPointerCapture(ev.pointerId);
        const mover = (m) => {
            const dx = (m.clientX - inicio.x) / escala;
            const dy = (m.clientY - inicio.y) / escala;
            if (!movido && Math.hypot(m.clientX - inicio.x, m.clientY - inicio.y) < 4) return;
            movido = true;
            document.body.classList.add("moviendo");
            if (cambiarTamano) {
                let ancho = limitar(Math.round(inicio.caja.ancho + dx), 60, ANCHO);
                let alto = limitar(Math.round(inicio.caja.alto + dy), 40, ALTO);
                if (proporcion) {
                    const p = inicio.caja.ancho / inicio.caja.alto;
                    alto = Math.round(ancho / p);
                    if (alto < 40) {
                        alto = 40;
                        ancho = Math.round(40 * p);
                    }
                }
                Object.assign(e, { ancho, alto });
            } else {
                // Como en el servidor: siempre queda un trozo dentro de la pizarra.
                e.x = limitar(Math.round(inicio.caja.x + dx), -e.ancho + 40, ANCHO - 40);
                e.y = limitar(Math.round(inicio.caja.y + dy), -e.alto + 40, ALTO - 40);
            }
            pintarPiezas();
        };
        const soltar = () => {
            el.removeEventListener("pointermove", mover);
            el.removeEventListener("pointerup", soltar);
            el.removeEventListener("pointercancel", soltar);
            document.body.classList.remove("moviendo");
            if (movido) guardarCaja(e, inicio.caja);
            else if (yaElegida && e.tipo === "nota") editar(id);
        };
        el.addEventListener("pointermove", mover);
        el.addEventListener("pointerup", soltar);
        el.addEventListener("pointercancel", soltar);
    });
    el.addEventListener("dblclick", () => {
        if (E.herramienta === "mover" && E.elementos.get(id)?.tipo === "nota") editar(id);
    });
}

function guardarCaja(e, antes) {
    const despues = { x: e.x, y: e.y, ancho: e.ancho, alto: e.alto };
    if (Object.keys(despues).every((k) => despues[k] === antes[k])) return;
    registrar({ tipo: "cambiar", id: e.id, antes, despues });
    cambiarEnServidor(e.id, despues);
}

// Lo de aquí manda (es lo último que ha hecho esta persona): la respuesta del servidor no se copia encima.
async function cambiarEnServidor(id, cambios) {
    try {
        await pendientes.get(id);
        await api.cambiarEnPizarra(ID, id, cambios);
    } catch (err) {
        aviso(err.message, { tipo: "malo" });
        recargar();
    }
}

function crearFoto(e) {
    const el = h(
        "div",
        { class: "foto-pizarra", dataset: { id: e.id } },
        h("img", { src: srcFoto(e), alt: "", draggable: "false" }),
        h("span", { class: "redimensionar", title: "Arrastra para cambiar el tamaño" }),
    );
    arrastrable(el, e.id, { proporcion: true });
    return el;
}

function crearNota(e) {
    const guardarTexto = retrasar(() => {
        const actual = E.elementos.get(e.id);
        if (actual) cambiarEnServidor(e.id, { texto: actual.texto });
    }, 600);
    const texto = h("textarea", {
        class: "texto-nota",
        maxlength: 1000,
        readonly: true,
        placeholder: "Escribe aquí…",
        "aria-label": "Texto de la nota",
        oninput: (ev) => {
            const actual = E.elementos.get(e.id);
            if (!actual) return;
            actual.texto = ev.target.value;
            guardarTexto();
        },
        onblur: () => {
            if (guardarTexto.pendiente()) guardarTexto.ya();
            dejarDeEditar(e.id);
        },
        onkeydown: (ev) => {
            if (ev.key === "Escape") {
                ev.preventDefault();
                ev.stopPropagation();
                ev.target.blur();
            }
        },
    });
    texto.value = e.texto;
    const el = h("div", { class: "nota-pizarra", dataset: { id: e.id } }, texto, h("span", { class: "redimensionar", title: "Arrastra para cambiar el tamaño" }));
    arrastrable(el, e.id);
    return el;
}

function elegir(id) {
    if (E.seleccion === id) return;
    E.seleccion = id;
    pintarPiezas();
}

function editar(id) {
    const el = document.querySelector(`.nota-pizarra[data-id="${id}"]`);
    const texto = el?.querySelector("textarea");
    if (!texto) return;
    if (E.herramienta !== "mover") usar("mover");
    E.seleccion = id;
    E.editando = id;
    texto.readOnly = false;
    el.classList.add("editando");
    texto.focus({ preventScroll: true });
    texto.setSelectionRange(texto.value.length, texto.value.length);
    pintarPiezas();
}

function dejarDeEditar(id) {
    const el = document.querySelector(`.nota-pizarra[data-id="${id}"]`);
    if (el) {
        el.classList.remove("editando");
        el.querySelector("textarea").readOnly = true;
    }
    if (E.editando === id) E.editando = null;
    pintarEleccion();
}

// ---------- acciones, con «Deshacer» y «Rehacer» ----------

function registrar(paso) {
    E.deshacer.push(paso);
    if (E.deshacer.length > 200) E.deshacer.shift();
    E.rehacer = [];
}

async function poner(elemento) {
    E.elementos.set(elemento.id, elemento);
    registrar({ tipo: "poner", ids: [elemento.id] });
    pintarTodo();
    const guardando = api.ponerEnPizarra(ID, elemento);
    pendientes.set(
        elemento.id,
        guardando.catch(() => {}),
    );
    try {
        const guardado = await guardando;
        // Se queda el mismo objeto (lo que se ha escrito o movido mientras tanto manda); del servidor, solo quién y cuándo.
        const actual = E.elementos.get(elemento.id);
        if (actual) Object.assign(actual, { autor: guardado.autor, creado: guardado.creado });
    } catch (err) {
        E.elementos.delete(elemento.id);
        aviso(err.message, { tipo: "malo" });
        pintarTodo();
    } finally {
        pendientes.delete(elemento.id);
    }
}

async function quitarDeVerdad(ids) {
    const quitados = ids.filter((id) => E.elementos.has(id));
    for (const id of quitados) E.elementos.delete(id);
    pintarTodo();
    if (!quitados.length) return;
    await Promise.all(quitados.map((id) => pendientes.get(id)));
    await api.quitarDePizarra(ID, quitados);
}

function quitar(ids) {
    const quitados = ids.filter((id) => E.elementos.has(id));
    if (!quitados.length) return;
    if (quitados.includes(E.editando)) document.activeElement?.blur();
    registrar({ tipo: "quitar", ids: quitados });
    quitarDeVerdad(quitados).catch((err) => {
        aviso(err.message, { tipo: "malo" });
        recargar();
    });
}

async function volverAPoner(ids) {
    const { elementos } = await api.restaurarEnPizarra(ID, ids);
    for (const e of elementos) E.elementos.set(e.id, e);
    if (!elementos.length) throw new Error("Eso ya no se puede recuperar.");
}

async function aplicar(paso, alReves) {
    if ((paso.tipo === "poner" && alReves) || (paso.tipo === "quitar" && !alReves)) await quitarDeVerdad(paso.ids);
    else if (paso.tipo === "poner" || paso.tipo === "quitar") await volverAPoner(paso.ids);
    else if (paso.tipo === "cambiar") {
        const e = E.elementos.get(paso.id);
        if (!e) throw new Error("Eso ya no está en la pizarra.");
        const cambios = alReves ? paso.antes : paso.despues;
        Object.assign(e, cambios);
        pintarPiezas();
        await api.cambiarEnPizarra(ID, paso.id, cambios);
    } else if (paso.tipo === "vaciar") {
        if (alReves) await recuperar();
        else await vaciarYa();
    }
}

async function deshacer() {
    if (E.editando) document.activeElement?.blur();
    const paso = E.deshacer.pop();
    if (!paso) {
        aviso("No hay nada que deshacer.");
        return;
    }
    try {
        await aplicar(paso, true);
        E.rehacer.push(paso);
    } catch (err) {
        aviso(err.message, { tipo: "malo" });
        recargar();
    }
    pintarTodo();
}

async function rehacer() {
    const paso = E.rehacer.pop();
    if (!paso) {
        aviso("No hay nada que rehacer.");
        return;
    }
    try {
        await aplicar(paso, false);
        E.deshacer.push(paso);
    } catch (err) {
        aviso(err.message, { tipo: "malo" });
        recargar();
    }
    pintarTodo();
}

function vaciarPizarra() {
    if (!E.elementos.size) {
        aviso("La pizarra ya está en blanco.");
        return;
    }
    const v = ventana(
        "Vaciar la pizarra",
        h(
            "div",
            { class: "pila" },
            h("p", null, "Se quita todo lo que hay en la pizarra, para todos. Se puede recuperar durante 30 días."),
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
                            v.cerrar();
                            try {
                                await vaciarYa();
                                registrar({ tipo: "vaciar" });
                                aviso("Pizarra vaciada.", { accion: "Deshacer", duracion: 10000, alAccion: deshacer });
                            } catch (err) {
                                aviso(err.message, { tipo: "malo" });
                            }
                            pintarTodo();
                        },
                    },
                    "Vaciar",
                ),
            ),
        ),
        { ancho: 400 },
    );
}

async function vaciarYa() {
    if (E.editando) document.activeElement?.blur();
    await api.vaciarPizarra(ID);
    E.elementos.clear();
    E.seleccion = null;
    E.puedeRecuperar = true;
}

async function recuperar(conAviso = false) {
    try {
        const { elementos } = await api.recuperarPizarra(ID);
        E.elementos = new Map(elementos.map((e) => [e.id, e]));
        E.puedeRecuperar = false;
        if (conAviso) aviso("Recuperado lo que había.");
    } catch (err) {
        if (!conAviso) throw err;
        aviso(err.message, { tipo: "malo" });
    }
    pintarTodo();
}

// ---------- fotos: elegir, pegar o soltar ----------

async function prepararFoto(archivo) {
    const imagen = await createImageBitmap(archivo);
    const { width, height } = imagen;
    const lado = Math.max(width, height);
    if (archivo.type === "image/gif" || (lado <= 1600 && archivo.size < 1.5 * 1024 * 1024 && /^image\/(jpeg|png|webp)$/.test(archivo.type))) {
        return { blob: archivo, ancho: width, alto: height };
    }
    const reduccion = Math.min(1, 1600 / lado);
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(width * reduccion);
    lienzo.height = Math.round(height * reduccion);
    lienzo.getContext("2d").drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    const tipo = archivo.type === "image/png" && archivo.size < 3 * 1024 * 1024 ? "image/png" : "image/jpeg";
    const blob = await new Promise((listo) => lienzo.toBlob(listo, tipo, 0.86));
    return { blob: blob || archivo, ancho: lienzo.width, alto: lienzo.height };
}

async function subirFoto(archivo, centro = [ANCHO / 2, ALTO / 2]) {
    if (!archivo.type.startsWith("image/")) {
        aviso("Solo se pueden poner fotos.", { tipo: "malo" });
        return;
    }
    let preparada;
    try {
        preparada = await prepararFoto(archivo);
    } catch {
        aviso("No he podido leer esa foto.", { tipo: "malo" });
        return;
    }
    const cabe = Math.min(1, 640 / preparada.ancho, 440 / preparada.alto);
    const ancho = Math.max(60, Math.round(preparada.ancho * cabe));
    const alto = Math.max(40, Math.round(preparada.alto * cabe));
    const e = {
        id: nuevoId(),
        tipo: "imagen",
        x: limitar(Math.round(centro[0] - ancho / 2), -ancho + 40, ANCHO - 40),
        y: limitar(Math.round(centro[1] - alto / 2), -alto + 40, ALTO - 40),
        ancho,
        alto,
        local: URL.createObjectURL(preparada.blob),
        subiendo: true,
    };
    E.elementos.set(e.id, e);
    pintarTodo();
    const subiendo = api.fotoEnPizarra(ID, preparada.blob, e);
    pendientes.set(
        e.id,
        subiendo.catch(() => {}),
    );
    try {
        const guardada = await subiendo;
        // Se queda la vista previa hasta que la de verdad ha cargado, para que no parpadee.
        Object.assign(e, { archivo: guardada.archivo, autor: guardada.autor, creado: guardada.creado, subiendo: false });
        registrar({ tipo: "poner", ids: [e.id] });
        const img = new Image();
        img.onload = img.onerror = () => {
            const local = e.local;
            delete e.local;
            pintarPiezas();
            setTimeout(() => URL.revokeObjectURL(local), 1000);
        };
        img.src = direccionApi(`pizarras/imagenes/${guardada.archivo}`);
    } catch (err) {
        E.elementos.delete(e.id);
        URL.revokeObjectURL(e.local);
        aviso(err.message, { tipo: "malo" });
    } finally {
        pendientes.delete(e.id);
    }
    pintarTodo();
}

function elegirFotos(centro) {
    const entrada = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
    entrada.addEventListener("change", () => {
        const archivos = [...entrada.files];
        entrada.remove();
        const [x, y] = centro || centroVisible();
        archivos.forEach((a, i) => subirFoto(a, [x + i * 40, y + i * 40]));
    });
    document.body.appendChild(entrada);
    entrada.click();
}

function nuevaNota(x, y, texto = "") {
    const nota = {
        id: nuevoId(),
        tipo: "nota",
        texto,
        color: COLORES_NOTA[0][0],
        x: limitar(Math.round(x - 130), -220, ANCHO - 40),
        y: limitar(Math.round(y - 40), -140, ALTO - 40),
        ancho: 260,
        alto: 180,
    };
    poner(nota);
    usar("mover");
    E.seleccion = nota.id;
    requestAnimationFrame(() => editar(nota.id));
}

// El punto de la pizarra que queda en el centro de lo que se ve (cuando está acercada, no es el del lienzo).
function centroVisible() {
    const zona = $("#zona-pizarra");
    const marco = $("#mundo-marco");
    if (!zona || !marco) return [ANCHO / 2, ALTO / 2];
    const rz = zona.getBoundingClientRect();
    const rm = marco.getBoundingClientRect();
    const x = (Math.max(rz.left, rm.left) + Math.min(rz.right, rm.right)) / 2;
    const y = (Math.max(rz.top, rm.top) + Math.min(rz.bottom, rm.bottom)) / 2;
    return [limitar((x - rm.left) / escala, 0, ANCHO), limitar((y - rm.top) / escala, 0, ALTO)];
}

// ---------- lápiz y goma ----------

function aMundo(ev, r = $("#mundo-marco").getBoundingClientRect()) {
    return [Math.round((ev.clientX - r.left) / escala), Math.round((ev.clientY - r.top) / escala)];
}

function cajaDe(t) {
    let c = cajas.get(t);
    if (c) return c;
    const p = t.puntos;
    c = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (let i = 0; i < p.length; i += 2) {
        c.x0 = Math.min(c.x0, p[i]);
        c.x1 = Math.max(c.x1, p[i]);
        c.y0 = Math.min(c.y0, p[i + 1]);
        c.y1 = Math.max(c.y1, p[i + 1]);
    }
    cajas.set(t, c);
    return c;
}

function distanciaASegmento2(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? limitar(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    const x = ax + t * dx - px;
    const y = ay + t * dy - py;
    return x * x + y * y;
}

function tocaTrazo(t, x, y) {
    const r = RADIO_GOMA + t.grosor / 2;
    const c = cajaDe(t);
    if (x < c.x0 - r || x > c.x1 + r || y < c.y0 - r || y > c.y1 + r) return false;
    const p = t.puntos;
    if (p.length <= 2) return (p[0] - x) ** 2 + (p[1] - y) ** 2 <= r * r;
    for (let i = 0; i < p.length - 2; i += 2) if (distanciaASegmento2(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= r * r) return true;
    return false;
}

// Lo que pinto yo y dónde está mi lápiz, en directo para los demás (como mucho cada 90 ms, solo lo nuevo).
let enviados = 0;
let ultimoEnvio = 0;
let cursorPendiente = null; // [x, y], «fuera» o null (nada que contar)
function enviarVivo() {
    if (!E.yo) return;
    const ahora = Date.now();
    if (ahora - ultimoEnvio < 90) return;
    const datos = {};
    if (trazoActual && trazoActual.puntos.length > enviados) {
        datos.trazo = { id: trazoActual.id, color: trazoActual.color, grosor: trazoActual.grosor, desde: enviados, puntos: trazoActual.puntos.slice(enviados) };
        enviados = trazoActual.puntos.length;
    }
    if (cursorPendiente) datos.cursor = cursorPendiente === "fuera" ? null : cursorPendiente;
    cursorPendiente = null;
    if (!("trazo" in datos) && !("cursor" in datos)) return;
    ultimoEnvio = ahora;
    api.vivoEnPizarra(ID, datos).catch(() => {});
}
setInterval(enviarVivo, 100);

function empezarTrazo(x, y) {
    trazoActual = { id: nuevoId(), tipo: "trazo", color: E.color, grosor: E.grosor, puntos: [x, y] };
    enviados = 0;
}

function cerrarTrazo() {
    const t = trazoActual;
    trazoActual = null;
    if (!t) return;
    if (t.puntos.length === 2) t.puntos.push(t.puntos[0], t.puntos[1]);
    // Los demás cambian el trazo en directo por el guardado cuando les llega (mismo id).
    poner({ id: t.id, tipo: "trazo", color: t.color, grosor: t.grosor, puntos: t.puntos });
    pintarVivo();
}

function prepararMarco(marco) {
    let borrando = null;
    let ultimo = null;
    let arrastre = null;
    let inicioRecta = null;
    marco.addEventListener("pointerdown", (ev) => {
        plegarTrazo(false);
        if (ev.button > 0 || ev.target.closest("#barra-eleccion, .aviso-vacia button")) return;
        const [x, y] = aMundo(ev);
        if (E.herramienta === "mover") {
            if (ev.target.closest(".foto-pizarra, .nota-pizarra")) return;
            if (E.editando) document.activeElement?.blur();
            elegir(null);
            // Arrastrar el fondo mueve lo que se ve cuando la pizarra está acercada (con el dedo lo hace el navegador).
            const zona = $("#zona-pizarra");
            if (ev.pointerType !== "touch" && (zona.scrollWidth > zona.clientWidth || zona.scrollHeight > zona.clientHeight)) {
                ev.preventDefault();
                arrastre = { x: ev.clientX, y: ev.clientY, izquierda: zona.scrollLeft, arriba: zona.scrollTop };
                marco.setPointerCapture(ev.pointerId);
                document.body.classList.add("arrastrando-vista");
            }
            return;
        }
        ev.preventDefault();
        if (E.herramienta === "nota") {
            nuevaNota(x, y);
            return;
        }
        if (E.herramienta === "foto") {
            elegirFotos([x, y]);
            return;
        }
        marco.setPointerCapture(ev.pointerId);
        if (E.herramienta === "lapiz") {
            empezarTrazo(x, y);
            inicioRecta = [x, y];
            pintarVivo();
            pintarVacia();
        } else if (E.herramienta === "goma") {
            borrando = new Set();
            ultimo = [x, y];
            borrarEn(x, y, borrando);
            moverGoma(ev);
        }
    });
    marco.addEventListener("pointermove", (ev) => {
        if (arrastre) {
            const zona = $("#zona-pizarra");
            zona.scrollLeft = arrastre.izquierda - (ev.clientX - arrastre.x);
            zona.scrollTop = arrastre.arriba - (ev.clientY - arrastre.y);
            return;
        }
        const r = marco.getBoundingClientRect();
        const [x, y] = aMundo(ev, r);
        cursorPendiente = [x, y];
        if (trazoActual) {
            if (ev.shiftKey) {
                // Con Mayúsculas, línea recta desde donde se empezó.
                trazoActual.puntos = [...inicioRecta, x, y];
                enviados = 0;
            } else {
                // Todos los puntos que ha visto el navegador (con ratón rápido o lápiz digital, salen muchos más).
                const eventos = ev.getCoalescedEvents?.() || [];
                for (const c of eventos.length ? eventos : [ev]) {
                    const [cx, cy] = aMundo(c, r);
                    const p = trazoActual.puntos;
                    if (Math.hypot(cx - p[p.length - 2], cy - p[p.length - 1]) < 1.5) continue;
                    if (p.length >= MAXIMO_PUNTOS * 2) {
                        // Trazo larguísimo: se guarda y sigue en otro nuevo, sin que se note.
                        const [ux, uy] = p.slice(-2);
                        cerrarTrazo();
                        empezarTrazo(ux, uy);
                        inicioRecta = [ux, uy];
                    }
                    trazoActual.puntos.push(cx, cy);
                }
            }
            pintarVivo();
        } else if (borrando) {
            // Entre dos posiciones seguidas se miran puntos intermedios, para no saltarse trazos al ir rápido.
            const pasos = Math.max(1, Math.ceil(Math.hypot(x - ultimo[0], y - ultimo[1]) / (RADIO_GOMA / 2)));
            for (let i = 1; i <= pasos; i++) borrarEn(ultimo[0] + ((x - ultimo[0]) * i) / pasos, ultimo[1] + ((y - ultimo[1]) * i) / pasos, borrando);
            ultimo = [x, y];
        }
        if (E.herramienta === "goma") moverGoma(ev);
        enviarVivo();
    });
    const terminar = () => {
        if (arrastre) {
            arrastre = null;
            document.body.classList.remove("arrastrando-vista");
        }
        if (trazoActual) cerrarTrazo();
        if (borrando) {
            const ids = [...borrando];
            borrando = null;
            if (ids.length) {
                registrar({ tipo: "quitar", ids });
                Promise.all(ids.map((id) => pendientes.get(id)))
                    .then(() => api.quitarDePizarra(ID, ids))
                    .catch((err) => {
                        aviso(err.message, { tipo: "malo" });
                        recargar();
                    });
            }
        }
    };
    marco.addEventListener("pointerup", terminar);
    marco.addEventListener("pointercancel", terminar);
    marco.addEventListener("pointerleave", () => {
        $("#goma")?.setAttribute("hidden", "");
        cursorPendiente = "fuera";
    });
    // Soltar fotos encima
    marco.addEventListener("dragover", (ev) => {
        if ([...(ev.dataTransfer?.items || [])].some((i) => i.kind === "file")) {
            ev.preventDefault();
            marco.classList.add("soltando");
        }
    });
    marco.addEventListener("dragleave", () => marco.classList.remove("soltando"));
    marco.addEventListener("drop", (ev) => {
        marco.classList.remove("soltando");
        const archivos = [...(ev.dataTransfer?.files || [])].filter((a) => a.type.startsWith("image/"));
        if (!archivos.length) return;
        ev.preventDefault();
        const [x, y] = aMundo(ev);
        archivos.forEach((a, i) => subirFoto(a, [x + i * 40, y + i * 40]));
    });
}

function borrarEn(x, y, borrando) {
    let alguno = false;
    for (const e of E.elementos.values()) {
        if (e.tipo !== "trazo" || !tocaTrazo(e, x, y)) continue;
        E.elementos.delete(e.id);
        borrando.add(e.id);
        alguno = true;
    }
    if (alguno) {
        pintarTrazos();
        pintarVacia();
    }
}

function moverGoma(ev) {
    const goma = $("#goma");
    const r = $("#mundo-marco").getBoundingClientRect();
    goma.hidden = false;
    const lado = RADIO_GOMA * 2 * escala;
    Object.assign(goma.style, { left: `${ev.clientX - r.left - lado / 2}px`, top: `${ev.clientY - r.top - lado / 2}px`, width: `${lado}px`, height: `${lado}px` });
}

// ---------- acercar y alejar ----------

function zoomA(nuevo, centro = null) {
    nuevo = limitar(Math.round(nuevo * 100) / 100, 1, ZOOMS[ZOOMS.length - 1]);
    if (nuevo === E.zoom) return;
    const zona = $("#zona-pizarra");
    const marco = $("#mundo-marco");
    if (!zona || !marco) return;
    const rz = zona.getBoundingClientRect();
    const [cx, cy] = centro || [rz.left + rz.width / 2, rz.top + rz.height / 2];
    const rm = marco.getBoundingClientRect();
    // El punto de la pizarra que está bajo el ratón (o en el centro) se queda donde está.
    const mx = (cx - rm.left) / escala;
    const my = (cy - rm.top) / escala;
    E.zoom = nuevo;
    ajustar();
    const rm2 = marco.getBoundingClientRect();
    zona.scrollLeft += rm2.left + mx * escala - cx;
    zona.scrollTop += rm2.top + my * escala - cy;
}

const acercar = () => zoomA(ZOOMS.find((z) => z > E.zoom + 0.01) ?? E.zoom);
const alejar = () => zoomA([...ZOOMS].reverse().find((z) => z < E.zoom - 0.01) ?? 1);

function pintarZoom() {
    const texto = $("#texto-zoom");
    // El tamaño de verdad: a cuánto se ve la pizarra respecto a su tamaño real (1920 × 1200). Entera en un móvil es un
    // 19 %, no un «100 %».
    if (texto) texto.textContent = `${Math.round(escala * 100)} %`;
    document.body.classList.toggle("acercada", E.zoom > 1);
}

// ---------- descargar como imagen ----------

async function descargar() {
    const lienzo = document.createElement("canvas");
    lienzo.width = ANCHO;
    lienzo.height = ALTO;
    const ctx = lienzo.getContext("2d");
    ctx.fillStyle = "#fffaf3";
    ctx.fillRect(0, 0, ANCHO, ALTO);
    const cargarImagen = (src) =>
        new Promise((listo) => {
            const img = new Image();
            img.onload = () => listo(img);
            img.onerror = () => listo(null);
            img.src = src;
        });
    const elementos = [...E.elementos.values()];
    for (const e of elementos) {
        if (e.tipo !== "imagen") continue;
        const img = await cargarImagen(srcFoto(e));
        if (!img) continue;
        // Como en pantalla: la foto llena su caja y se recorta lo que sobra.
        const escalaImg = Math.max(e.ancho / img.naturalWidth, e.alto / img.naturalHeight);
        const sw = e.ancho / escalaImg;
        const sh = e.alto / escalaImg;
        ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, e.x, e.y, e.ancho, e.alto);
    }
    await document.fonts?.load('26px "Pixelify Sans"').catch(() => {});
    for (const e of elementos) {
        if (e.tipo !== "nota") continue;
        ctx.fillStyle = "rgba(28, 23, 21, 0.3)";
        ctx.fillRect(e.x + 5, e.y + 6, e.ancho, e.alto);
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x, e.y, e.ancho, e.alto);
        ctx.strokeStyle = "rgba(28, 23, 21, 0.55)";
        ctx.lineWidth = 2;
        ctx.strokeRect(e.x + 1, e.y + 1, e.ancho - 2, e.alto - 2);
        ctx.save();
        ctx.beginPath();
        ctx.rect(e.x, e.y, e.ancho, e.alto);
        ctx.clip();
        ctx.fillStyle = "#1c1715";
        ctx.font = '26px "Pixelify Sans", monospace';
        ctx.textBaseline = "top";
        ctx.textRendering = "optimizeSpeed"; // sin ligaduras, como en la página
        let y = e.y + 16;
        // Pixelify Sans junta «fi» y «fl» en una letra que parece una A: un separador invisible lo evita.
        for (const parrafo of e.texto.replace(/f(?=[il])/g, "f\u200c").split("\n")) {
            let linea = "";
            for (const palabra of parrafo.split(" ")) {
                const prueba = linea ? `${linea} ${palabra}` : palabra;
                if (ctx.measureText(prueba).width > e.ancho - 36 && linea) {
                    ctx.fillText(linea, e.x + 18, y);
                    y += 32;
                    linea = palabra;
                } else linea = prueba;
            }
            ctx.fillText(linea, e.x + 18, y);
            y += 32;
        }
        ctx.restore();
    }
    for (const e of elementos) if (e.tipo === "trazo") dibujarTrazo(ctx, e);
    lienzo.toBlob((blob) => {
        if (!blob) {
            aviso("No he podido hacer la imagen.", { tipo: "malo" });
            return;
        }
        const a = h("a", { href: URL.createObjectURL(blob), download: `${E.pizarra.nombre} ${hoy()}.png` });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
}

// ---------- la página ----------

function dentroDeLaOficina() {
    try {
        return window.top !== window;
    } catch {
        return true;
    }
}

function usar(id) {
    E.herramienta = id;
    document.body.dataset.herramienta = id;
    if (id !== "mover") {
        if (E.editando) document.activeElement?.blur();
        E.seleccion = null;
    }
    for (const b of document.querySelectorAll(".herramienta")) {
        b.classList.toggle("activa", b.dataset.herramienta === id);
        b.setAttribute("aria-pressed", String(b.dataset.herramienta === id));
    }
    if (id !== "goma") $("#goma")?.setAttribute("hidden", "");
    pintarPiezas();
}

function pintarCabecera() {
    const zona = $("#presentes");
    if (!zona || !E.yo) return;
    const otros = E.presentes.filter((id) => id !== E.yo.id).map(usuario).filter(Boolean);
    zona.replaceChildren(...(otros.length ? [h("span", { class: "nota" }, "Aquí también:"), h("span", { class: "avatares" }, otros.map((u) => avatar(u)))] : []));
    zona.title = otros.length ? `También tienen la pizarra abierta: ${otros.map((u) => u.nombre).join(", ")}` : "";
    $("#boton-yo")?.replaceChildren(avatar(E.yo), h("span", { class: "nombre-yo" }, E.yo.nombre), h("span", { class: "flecha" }, "▾"));
    const titulo = $("#titulo-pizarra");
    if (titulo) {
        titulo.textContent = E.pizarra.nombre;
        titulo.title = E.pizarra.nombre;
    }
    document.title = `${E.pizarra.nombre} · HOT SPOT S.L.`;
}

function botonIcono(nombreIcono, titulo, onclick, clase = "") {
    return h("button", { type: "button", class: ["boton-icono", clase], title: titulo, "aria-label": titulo, onclick }, icono(nombreIcono));
}

function montar() {
    vaciar(raiz);
    document.body.classList.toggle("en-oficina", dentroDeLaOficina());
    const colores = h(
        "div",
        { class: "colores-pizarra", role: "group", "aria-label": "Color del lápiz" },
        COLORES.map(([c, n], i) =>
            h("button", {
                type: "button",
                class: ["color-trazo", c === E.color && "activo"],
                style: { background: c },
                title: `${n} (${i + 1})`,
                "aria-label": n,
                "aria-pressed": String(c === E.color),
                dataset: { color: c },
                onclick: () => elegirColor(c),
            }),
        ),
    );
    const grosores = h(
        "div",
        { class: "grosores-pizarra", role: "group", "aria-label": "Grosor del lápiz" },
        GROSORES.map(([g, n]) => {
            const lado = Math.min(20, Math.round(3 + g / 1.6));
            return h(
                "button",
                { type: "button", class: ["grosor", g === E.grosor && "activo"], title: n, "aria-label": n, "aria-pressed": String(g === E.grosor), dataset: { grosor: g }, onclick: () => elegirGrosor(g) },
                h("span", { style: { width: `${lado}px`, height: `${lado}px` } }),
            );
        }),
    );
    const marco = h(
        "div",
        { class: "mundo-marco", id: "mundo-marco" },
        h(
            "div",
            { class: "mundo", id: "mundo" },
            h("div", { class: "capa", id: "fotos" }),
            h("div", { class: "capa", id: "notas" }),
            h("canvas", { class: "capa lienzo", id: "trazos" }),
            h("canvas", { class: "capa lienzo", id: "vivo" }),
            h("div", { class: "capa cursores", id: "cursores" }),
        ),
        h("div", { class: "goma", id: "goma", hidden: true }),
        h("div", { class: "aviso-vacia", id: "aviso-vacia", hidden: true }),
        h("div", { class: "barra-eleccion", id: "barra-eleccion", hidden: true, role: "toolbar", "aria-label": "Lo elegido", onpointerdown: (ev) => ev.stopPropagation(), onmousedown: (ev) => ev.preventDefault() }),
    );
    prepararMarco(marco);
    const zona = h("main", { class: "zona-pizarra", id: "zona-pizarra" }, marco);
    zona.addEventListener(
        "wheel",
        (ev) => {
            // Ctrl + rueda (o pellizcar en el panel táctil) acerca y aleja, como en los mapas.
            if (!ev.ctrlKey && !ev.metaKey) return;
            ev.preventDefault();
            zoomA(E.zoom * Math.exp(-ev.deltaY / 300), [ev.clientX, ev.clientY]);
        },
        { passive: false },
    );
    raiz.append(
        h(
            "header",
            { class: "barra" },
            // El nombre es el de ESTA pizarra (la de reuniones, la del despacho…): así se sabe cuál es también en modo solo y en el móvil.
            h("div", { class: "marca" }, h("span", { class: "logo" }, "HS"), h("h1", { class: "nombre-app", id: "titulo-pizarra" }, E.pizarra.nombre)),
            h(
                "nav",
                { class: "pestanas pantallas otra-pantalla", "aria-label": "Aplicaciones" },
                h("a", { class: "pestana otra-pantalla", href: "../" }, "Tareas"),
                E.yo.libro ? h("a", { class: "pestana otra-pantalla", href: "../libro/" }, "Cuentas") : null,
                h("span", { class: "pestana activa", "aria-current": "page" }, "Pizarra"),
                h("a", { class: "pestana otra-pantalla", href: "../archivo/" }, "Archivo"),
                h("a", { class: "pestana otra-pantalla", href: "../musica/" }, "Música"),
            ),
            h("div", { class: "barra-derecha" }, h("div", { class: "presentes", id: "presentes" }), h("button", { type: "button", class: "boton-yo", id: "boton-yo", "aria-label": "Tu cuenta", onclick: (e) => menuYo(e.currentTarget) })),
        ),
        h(
            "div",
            { class: "herramientas-pizarra", role: "toolbar", "aria-label": "Herramientas" },
            h(
                "div",
                { class: "grupo-herramientas" },
                HERRAMIENTAS.map((t) =>
                    h(
                        "button",
                        {
                            type: "button",
                            class: "herramienta",
                            dataset: { herramienta: t.id },
                            title: `${t.nombre} (${t.tecla})`,
                            "aria-label": t.nombre,
                            onclick: () => (t.id === "foto" ? elegirFotos() : usar(t.id)),
                        },
                        icono(t.id),
                        h("span", { class: "nombre-herramienta" }, t.nombre),
                    ),
                ),
                // Solo en el móvil (pizarra.css): el color y el grosor de ahora; al pulsarlo se despliegan los dos.
                h(
                    "button",
                    { type: "button", class: "boton-icono boton-trazo", id: "boton-trazo", title: "Color y grosor", "aria-label": "Color y grosor del lápiz", "aria-expanded": "false", "aria-controls": "trazo-pizarra", onclick: () => plegarTrazo() },
                    h("span", { class: "muestra-color" }),
                    h("span", { class: "caja-grosor" }, h("span", { class: "muestra-grosor", id: "muestra-grosor" })),
                    h("span", { class: "flecha" }, "▾"),
                ),
            ),
            h("div", { class: "trazo-pizarra", id: "trazo-pizarra" }, colores, grosores),
            h(
                "div",
                { class: "grupo-herramientas derecha" },
                h(
                    "div",
                    { class: "zoom", role: "group", "aria-label": "Tamaño" },
                    h("button", { type: "button", class: "boton-icono texto", title: "Alejar (−)", "aria-label": "Alejar", onclick: alejar }, "−"),
                    h("button", { type: "button", class: "boton-icono texto-zoom", id: "texto-zoom", title: "Ver entera (0)", "aria-label": "Ver la pizarra entera", onclick: () => zoomA(1) }, "100 %"),
                    h("button", { type: "button", class: "boton-icono texto", title: "Acercar (+)", "aria-label": "Acercar", onclick: acercar }, "+"),
                ),
                h("span", { class: "separador-herramientas" }),
                botonIcono("deshacer", "Deshacer (Ctrl+Z)", deshacer),
                botonIcono("rehacer", "Rehacer (Ctrl+Mayús+Z)", rehacer),
                botonIcono("descargar", "Descargar como imagen", descargar),
                botonIcono("vaciar", "Vaciar la pizarra", vaciarPizarra, "peligro"),
                h("button", { type: "button", class: "boton-icono texto boton-ayuda", title: "¿Cómo funciona?", "aria-label": "¿Cómo funciona?", onclick: ayuda }, "?"),
            ),
        ),
        zona,
    );
    usar(E.herramienta);
    pintarMuestraTrazo();
    document.body.style.setProperty("--color-lapiz", E.color);
    observador?.disconnect();
    observador = new ResizeObserver(() => ajustar());
    observador.observe(zona);
    ajustar();
}

// En el móvil el color y el grosor están plegados detrás de un botón (así las herramientas caben en dos filas); se
// pliegan otra vez al empezar a pintar.
function plegarTrazo(abrir) {
    const panel = $("#trazo-pizarra");
    if (!panel) return;
    const abierto = abrir ?? !panel.classList.contains("abierto");
    panel.classList.toggle("abierto", abierto);
    $("#boton-trazo")?.setAttribute("aria-expanded", String(abierto));
}

function pintarMuestraTrazo() {
    const lado = Math.min(20, Math.round(3 + E.grosor / 1.6));
    const muestra = $("#muestra-grosor");
    if (muestra) Object.assign(muestra.style, { width: `${lado}px`, height: `${lado}px` });
}

function elegirColor(c) {
    E.color = c;
    document.body.style.setProperty("--color-lapiz", c);
    for (const b of document.querySelectorAll(".color-trazo")) {
        b.classList.toggle("activo", b.dataset.color === c);
        b.setAttribute("aria-pressed", String(b.dataset.color === c));
    }
    if (E.herramienta !== "lapiz") usar("lapiz");
}

function elegirGrosor(g) {
    E.grosor = g;
    for (const b of document.querySelectorAll(".grosor")) {
        b.classList.toggle("activo", Number(b.dataset.grosor) === g);
        b.setAttribute("aria-pressed", String(Number(b.dataset.grosor) === g));
    }
    pintarMuestraTrazo();
    if (E.herramienta !== "lapiz") usar("lapiz");
}

// La pizarra cabe entera en la pantalla (16 : 10) y, con la lupa, se acerca y se recorre con las barras o arrastrando.
function ajustar() {
    const zona = $("#zona-pizarra");
    const marco = $("#mundo-marco");
    if (!zona || !marco) return;
    const estilo = getComputedStyle(zona);
    const ancho = Math.max(100, zona.offsetWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight));
    const alto = Math.max(60, zona.offsetHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom));
    escala = Math.min(ancho / ANCHO, alto / ALTO) * E.zoom;
    marco.style.width = `${Math.floor(ANCHO * escala)}px`;
    marco.style.height = `${Math.floor(ALTO * escala)}px`;
    const mundo = $("#mundo");
    mundo.style.transform = `scale(${escala})`;
    mundo.style.setProperty("--inversa", String(1 / escala));
    pintarZoom();
    pintarTodo();
}

function menuYo(ancla) {
    abrirMenu(ancla, () =>
        h(
            "div",
            null,
            h("div", { class: "menu-titulo" }, `Hola, ${E.yo.nombre}`),
            h(
                "div",
                { class: "opciones" },
                dentroDeLaOficina() ? h("a", { class: "opcion", href: sinSolo(location.href.split("#")[0]), target: "_blank", rel: "noopener", onclick: cerrarMenu }, h("span", { class: "marca" }), "Abrir en pestaña nueva ↗") : null,
                h("button", { type: "button", class: "opcion", onclick: () => (cerrarMenu(), descargar()) }, h("span", { class: "marca" }), "Descargar como imagen"),
                E.puedeRecuperar ? h("button", { type: "button", class: "opcion", onclick: () => (cerrarMenu(), recuperar(true)) }, h("span", { class: "marca" }), "Recuperar lo vaciado") : null,
                h("button", { type: "button", class: "opcion", onclick: () => (cerrarMenu(), ayuda()) }, h("span", { class: "marca" }), "¿Cómo funciona?"),
                // «otra-pantalla»: lo que lleva a otra pantalla, con su raya (con ?solo=1 no sale, ver solo.js)
                h("hr", { class: "otra-pantalla" }),
                h("a", { class: "opcion otra-pantalla", href: "../" }, h("span", { class: "marca" }), "Tablón de tareas"),
                E.yo.libro ? h("a", { class: "opcion otra-pantalla", href: "../libro/" }, h("span", { class: "marca" }), "Libro de cuentas") : null,
                h("a", { class: "opcion otra-pantalla", href: "../archivo/" }, h("span", { class: "marca" }), "Archivo"),
                h("a", { class: "opcion otra-pantalla", href: "../musica/" }, h("span", { class: "marca" }), "Música"),
                h("hr"),
                h("button", { type: "button", class: "opcion", onclick: () => (cerrarMenu(), salir()) }, h("span", { class: "marca" }), "Salir"),
            ),
        ),
    );
}

function ayuda() {
    const fila = (tecla, que) => h("tr", null, h("td", null, h("kbd", null, tecla)), h("td", null, que));
    ventana(
        "¿Cómo funciona?",
        h(
            "div",
            { class: "pila ayuda-pizarra" },
            h("p", null, "Todo lo que pintas, pegas o escribes se guarda solo y lo ven a la vez todos los que tienen la pizarra abierta, con el lápiz de cada uno moviéndose en directo."),
            h(
                "ul",
                null,
                h("li", null, h("strong", null, "Lápiz: "), "pinta. Con Mayúsculas pulsada, línea recta."),
                h("li", null, h("strong", null, "Goma: "), "pasa por encima de un trazo y se borra entero."),
                h("li", null, h("strong", null, "Nota: "), "pulsa donde la quieras y escribe. Para volver a escribir, doble clic en ella."),
                h("li", null, h("strong", null, "Foto: "), "elige una, pégala con Ctrl+V o arrástrala encima."),
                h("li", null, h("strong", null, "Mover: "), "arrastra fotos y notas; con la esquina naranja cambias el tamaño."),
                h("li", null, h("strong", null, "Lupa: "), "Ctrl + rueda del ratón (o pellizca), o los botones − y +."),
            ),
            h("p", { class: "nota" }, "Si alguien vacía la pizarra por error, se puede recuperar durante 30 días."),
            h(
                "table",
                { class: "tabla-atajos" },
                fila("P · E · V · N · F", "Lápiz, goma, mover, nota, foto"),
                fila("1 – 8", "Colores del lápiz"),
                fila("Ctrl + Z", "Deshacer lo último que has hecho"),
                fila("Ctrl + Mayús + Z", "Rehacer"),
                fila("Supr", "Quitar la foto o la nota elegida"),
                fila("+ · − · 0", "Acercar, alejar, ver entera"),
            ),
        ),
        { ancho: 480 },
    );
}

async function salir() {
    try {
        await api.salir();
    } catch {
        /* da igual */
    }
    sinSesion();
}

// ---------- tiempo real ----------

function alRecibir(ev) {
    if (ev.tipo === "usuarios") {
        E.usuarios = ev.usuarios;
        pintarCabecera();
        return;
    }
    if (ev.pizarra !== ID) return;
    if (ev.tipo === "pizarra-presentes") {
        E.presentes = ev.usuarios;
        for (const autor of [...E.vivos.keys()]) if (!ev.usuarios.includes(autor)) E.vivos.delete(autor);
        pintarCabecera();
        pintarCursores();
        pintarVivo();
        return;
    }
    if (ev.tipo === "pizarra-vivo") {
        if (ev.autor === E.yo.id) return; // yo mismo en otra pestaña
        const v = E.vivos.get(ev.autor) || {};
        v.visto = Date.now();
        if (ev.cursor) v.cursor = ev.cursor;
        else if (ev.cursor === null) v.cursor = null;
        if (ev.trazo === null) v.trazo = null;
        else if (ev.trazo) {
            if (!v.trazo || v.trazo.id !== ev.trazo.id) v.trazo = { id: ev.trazo.id, color: ev.trazo.color, grosor: ev.trazo.grosor, puntos: [] };
            if (E.elementos.has(ev.trazo.id)) v.trazo = null; // ya ha llegado el trazo guardado
            else {
                v.trazo.puntos.length = Math.min(v.trazo.puntos.length, ev.trazo.desde);
                v.trazo.puntos.push(...ev.trazo.puntos);
            }
        }
        E.vivos.set(ev.autor, v);
        pintarVivo();
        pintarCursores();
        pintarVacia();
        return;
    }
    if (ev.tipo !== "pizarra") return;
    if (ev.accion === "poner" || ev.accion === "cambiar") {
        for (const e of ev.elementos) {
            const actual = E.elementos.get(e.id);
            // Si estoy escribiendo en esa nota, no se me pisa el texto.
            if (actual && e.tipo === "nota" && E.editando === e.id) e.texto = actual.texto;
            if (actual) Object.assign(actual, e);
            else E.elementos.set(e.id, e);
            for (const v of E.vivos.values()) if (v.trazo?.id === e.id) v.trazo = null;
        }
    } else if (ev.accion === "quitar") {
        for (const id of ev.ids) E.elementos.delete(id);
    } else if (ev.accion === "vaciar") {
        if (E.editando) document.activeElement?.blur();
        E.elementos.clear();
        E.puedeRecuperar = true;
        aviso(`${nombre(ev.autor)} ha vaciado la pizarra.`, { accion: "Recuperar", duracion: 10000, alAccion: () => recuperar(true) });
    } else if (ev.accion === "todo") {
        E.elementos = new Map(ev.elementos.map((e) => [e.id, e]));
        E.puedeRecuperar = false;
    }
    pintarTodo();
}

// Los lápices de quien lleva un rato quieto se esconden.
setInterval(() => {
    const ahora = Date.now();
    let cambio = false;
    for (const [autor, v] of E.vivos) {
        if (ahora - v.visto > 8000) {
            E.vivos.delete(autor);
            cambio = true;
        }
    }
    if (cambio) {
        pintarCursores();
        pintarVivo();
    }
}, 2000);

function cargar(datos) {
    E.yo = datos.yo;
    E.usuarios = datos.usuarios;
    E.pizarra = datos.pizarra;
    E.puedeRecuperar = Boolean(datos.pizarra.puedeRecuperar);
    E.presentes = datos.presentes || [];
    // Lo que aún se está subiendo o guardando se queda; y la nota en la que escribo, con mi texto.
    const mias = [...E.elementos.values()].filter((e) => e.subiendo || pendientes.has(e.id));
    const escribiendo = E.editando ? E.elementos.get(E.editando) : null;
    E.elementos = new Map(datos.pizarra.elementos.map((e) => [e.id, e]));
    for (const e of mias) if (!E.elementos.has(e.id)) E.elementos.set(e.id, e);
    if (escribiendo && E.elementos.has(escribiendo.id)) E.elementos.get(escribiendo.id).texto = escribiendo.texto;
}

async function recargar() {
    try {
        cargar(await api.pizarra(ID));
        pintarTodo();
    } catch {
        /* sin conexión: ya se avisará */
    }
}

function empezar(datos) {
    cargar(datos);
    montar();
    dejarDeEscuchar?.();
    dejarDeEscuchar = escuchar(alRecibir, recargar, { pizarra: ID });
}

async function entrarYEmpezar() {
    try {
        empezar(await api.pizarra(ID));
    } catch (err) {
        sinConexion(err.message);
    }
}

function sinSesion() {
    dejarDeEscuchar?.();
    dejarDeEscuchar = null;
    observador?.disconnect();
    E.yo = null;
    cerrarMenu();
    pantallaEntrar(raiz, entrarYEmpezar);
}
cuandoSePierdaLaSesion(() => {
    if (E.yo) sinSesion();
});

function sinConexion(mensaje) {
    vaciar(raiz).appendChild(
        h(
            "main",
            { class: "acceso" },
            h("div", { class: "acceso-caja" }, h("h1", null, "No hay conexión"), h("p", null, mensaje), h("button", { class: "btn ancho", type: "button", onclick: () => location.reload() }, "Reintentar")),
        ),
    );
}

// ---------- teclado y portapapeles ----------

document.addEventListener("keydown", (e) => {
    if (!E.yo || !E.pizarra) return;
    const en = e.target instanceof Element ? e.target : null;
    if (en?.closest("input, textarea, select, [contenteditable=true]") || document.querySelector(".fondo-ventana") || hayMenu()) return;
    const tecla = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (tecla === "y" || (tecla === "z" && e.shiftKey))) {
        e.preventDefault();
        rehacer();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && tecla === "z") {
        e.preventDefault();
        deshacer();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "0")) {
        // Que la lupa del navegador no agrande también los botones: se acerca la pizarra.
        e.preventDefault();
        if (e.key === "0") zoomA(1);
        else if (e.key === "-") alejar();
        else acercar();
        return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const herramienta = HERRAMIENTAS.find((t) => t.tecla.toLowerCase() === tecla);
    if (herramienta) {
        e.preventDefault();
        if (herramienta.id === "foto") elegirFotos();
        else usar(herramienta.id);
    } else if (/^[1-8]$/.test(e.key)) {
        elegirColor(COLORES[Number(e.key) - 1][0]);
    } else if (e.key === "+" || e.key === "=") {
        acercar();
    } else if (e.key === "-") {
        alejar();
    } else if (e.key === "0") {
        zoomA(1);
    } else if ((e.key === "Delete" || e.key === "Backspace") && E.seleccion) {
        e.preventDefault();
        quitar([E.seleccion]);
    } else if (e.key === "Enter" && E.seleccion && E.elementos.get(E.seleccion)?.tipo === "nota") {
        e.preventDefault();
        editar(E.seleccion);
    } else if (e.key === "Escape") {
        elegir(null);
    }
});

document.addEventListener("paste", (e) => {
    if (!E.yo || !E.pizarra) return;
    if (e.target instanceof Element && e.target.closest("input, textarea")) return;
    const fotos = [...(e.clipboardData?.files || [])].filter((a) => a.type.startsWith("image/"));
    const [x, y] = centroVisible();
    if (fotos.length) {
        e.preventDefault();
        fotos.forEach((a, i) => subirFoto(a, [x + i * 40, y + i * 40]));
        return;
    }
    const texto = e.clipboardData?.getData("text/plain");
    if (texto?.trim()) {
        e.preventDefault();
        nuevaNota(x, y, texto.trim().slice(0, 1000));
    }
});

// ---------- inicio ----------

(async function inicio() {
    try {
        empezar(await api.pizarra(ID));
    } catch (err) {
        if (err.estado === 401) pantallaEntrar(raiz, entrarYEmpezar);
        else sinConexion(err.message);
    }
})();
