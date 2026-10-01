// Archivo de documentos de HOT SPOT S.L. (la sala ARCHIVO de la oficina): lo que el crew quiere tener a mano y
// compartido: Markdown, PDF, fotos, textos, Word y enlaces (Google Docs, Hojas, Presentaciones y Drive se ven
// dentro). Aquí está la lista (carpetas, búsqueda, subir y soltar, papelera); el visor de un documento está en
// archivo-visor.js. Todo lo que hace uno lo ven los demás en directo (el servidor avisa a todos).

import { h, $, vaciar, retrasar, haceCuanto, guardarLocal, leerLocal, MESES_CORTOS } from "./util.js";
import { api, escuchar, cuandoSePierdaLaSesion, subirDocumento } from "./api.js";
import { pantallaEntrar, aplicacion } from "./acceso.js";
import { abrirMenu, cerrarMenu, hayMenu, aviso, ventana, avatar } from "./menus.js";
import { tipoDe, tamano, insignia, terminosDe, resaltar } from "./archivo-comun.js";
import { crearVisor, direccionArchivo, direccionAparte, direccionDescarga } from "./archivo-visor.js";

aplicacion("ARCHIVO", "El archivo es del crew de HOT SPOT S.L. Entra con tu cuenta de Google.");

const raiz = document.getElementById("app");
const DIAS_PAPELERA = 30;
const RECIENTES = 12;
const ACEPTADOS = ".md,.markdown,.txt,.pdf,.docx,.png,.jpg,.jpeg,.webp,.gif";
const EXTENSIONES = new Set(["md", "markdown", "mdown", "mkd", "txt", "text", "pdf", "docx", "png", "jpg", "jpeg", "webp", "gif"]);
const TEXTOS = new Set(["md", "markdown", "mdown", "mkd", "txt", "text"]);
const ADMITIDOS = "Markdown (.md), PDF, fotos (PNG, JPG, WebP o GIF), textos (.txt) y Word (.docx)";
const MINIATURA_MAXIMA = 1.5 * 1024 * 1024; // las fotos más grandes no se usan de miniatura (se bajarían enteras)
const EN_PARALELO = 3;

const E = {
    yo: null,
    usuarios: [],
    documentos: [],
    papelera: [],
    limites: { archivo: 25 * 1024 * 1024, texto: 5 * 1024 * 1024, total: 0, usado: 0 },
    carpeta: "todo", // todo | recientes | sin | papelera | c:<nombre de la carpeta>
    orden: leerLocal("archivo:orden", "fecha") === "titulo" ? "titulo" : "fecha",
    consulta: "",
    resultados: null, // [{ id, fragmento, coincidencias }] de la búsqueda de `consultaResultados`
    consultaResultados: "",
    subidas: [],
    docId: null,
};
let visor = null;
let dejarDeEscuchar = null;
let ultimoDoc = null;
let scrollLista = 0;

// ---------- cosas pequeñas ----------

const usuarioDe = (id) => E.usuarios.find((u) => u.id === id) || null;
const nombreDe = (id) => usuarioDe(id)?.nombre || "alguien del crew";
const recortar = (texto, n = 44) => (texto.length > n ? `${texto.slice(0, n - 1).trim()}…` : texto);
const nombreExtension = (nombre) => /\.([a-z0-9]{1,10})$/i.exec(nombre)?.[1].toLowerCase() || "";

function dentroDeLaOficina() {
    try {
        return window.top !== window;
    } catch {
        return true;
    }
}

const comparar = {
    fecha: (a, b) => String(b.creado).localeCompare(String(a.creado)),
    actualizado: (a, b) => String(b.actualizado || b.creado).localeCompare(String(a.actualizado || a.creado)),
    titulo: (a, b) => a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base", numeric: true }),
};
const fijadosPrimero = (cmp) => (a, b) => Number(Boolean(b.fijado)) - Number(Boolean(a.fijado)) || cmp(a, b);

const buscando = () => E.consulta.replace(/\s/g, "").length >= 2;

function carpetas() {
    const cuentas = new Map();
    for (const d of E.documentos) if (d.carpeta) cuentas.set(d.carpeta, (cuentas.get(d.carpeta) || 0) + 1);
    return [...cuentas].sort((a, b) => a[0].localeCompare(b[0], "es", { sensitivity: "base" }));
}

function aplicar(datos) {
    E.yo = datos.yo;
    E.usuarios = datos.usuarios || [];
    E.documentos = datos.documentos || [];
    E.papelera = datos.papelera || [];
    E.limites = { ...E.limites, ...datos.limites };
}

const enlaceDoc = (id) => `${location.pathname}?doc=${encodeURIComponent(id)}`;

// ---------- cambios sobre los documentos ----------

function reemplazar(nuevo) {
    const i = E.documentos.findIndex((d) => d.id === nuevo.id);
    if (i >= 0) E.documentos[i] = nuevo;
    else E.documentos.unshift(nuevo);
    pintar();
    visor?.actualizar(nuevo);
}

async function fijar(doc) {
    try {
        reemplazar(await api.cambiarDocumento(doc.id, { fijado: !doc.fijado }));
    } catch (error) {
        aviso(error.message, { tipo: "malo" });
    }
}

async function borrar(doc) {
    try {
        await api.borrarDocumento(doc.id);
    } catch (error) {
        aviso(error.message, { tipo: "malo" });
        return;
    }
    E.documentos = E.documentos.filter((d) => d.id !== doc.id);
    E.papelera.unshift({ ...doc, borrado: new Date().toISOString(), borradoPor: E.yo.id });
    E.limites.usado = Math.max(0, E.limites.usado - (doc.tamano || 0));
    if (E.docId === doc.id) cerrarDoc();
    pintar();
    aviso(`«${recortar(doc.titulo)}» está en la papelera`, { accion: "Deshacer", alAccion: () => restaurar(doc), duracion: 8000 });
}

async function restaurar(doc) {
    try {
        const nuevo = await api.restaurarDocumento(doc.id);
        E.papelera = E.papelera.filter((d) => d.id !== doc.id);
        E.limites.usado += nuevo.tamano || 0;
        reemplazar(nuevo);
        aviso(`«${recortar(doc.titulo)}» vuelve al archivo`);
    } catch (error) {
        aviso(error.message, { tipo: "malo" });
    }
}

function eliminarDelTodo(doc) {
    confirmar("Borrar del todo", `«${doc.titulo}» se borra para siempre, con su archivo. No se puede deshacer.`, "Borrar del todo", async () => {
        try {
            await api.eliminarDocumento(doc.id);
            E.papelera = E.papelera.filter((d) => d.id !== doc.id);
            pintar();
            aviso("Borrado del todo");
        } catch (error) {
            aviso(error.message, { tipo: "malo" });
        }
    });
}

function confirmar(titulo, texto, boton, alConfirmar) {
    const cuerpo = h(
        "div",
        { class: "pila" },
        h("p", null, texto),
        h(
            "div",
            { class: "fila-botones" },
            h("button", { type: "button", class: "btn", onclick: () => v.cerrar() }, "Cancelar"),
            h("button", { type: "button", class: "btn primario", onclick: () => (v.cerrar(), alConfirmar()) }, boton),
        ),
    );
    const v = ventana(titulo, cuerpo, { ancho: 420 });
}

// ---------- ventanas: editar y añadir un enlace ----------

function campoCarpeta(valor) {
    const lista = h("datalist", { id: "carpetas-sugeridas" }, carpetas().map(([nombre]) => h("option", { value: nombre })));
    const entrada = h("input", { class: "campo", id: "campo-carpeta", maxlength: "60", list: "carpetas-sugeridas", value: valor || "", placeholder: "Sin carpeta", autocomplete: "off" });
    return {
        entrada,
        el: h("label", { class: "etiqueta-campo" }, h("span", null, "Carpeta"), entrada, lista, h("small", { class: "nota" }, "Escribe una nueva o elige una de las que ya hay.")),
    };
}

function editar(doc) {
    const titulo = h("input", { class: "campo", id: "campo-titulo", maxlength: "200", value: doc.titulo, autocomplete: "off" });
    const descripcion = h("textarea", { class: "campo", id: "campo-descripcion", rows: "4", maxlength: "2000", placeholder: "Para qué sirve, de cuándo es… (opcional)" });
    descripcion.value = doc.descripcion || "";
    const carpeta = campoCarpeta(doc.carpeta);
    const direccion = doc.tipo === "enlace" ? h("input", { class: "campo", id: "campo-url", type: "url", value: doc.url, autocomplete: "off" }) : null;
    const error = h("p", { class: "error", role: "alert" });
    const guardar = h("button", { type: "submit", class: "btn primario" }, "Guardar");
    const formulario = h(
        "form",
        {
            class: "pila",
            novalidate: true,
            onsubmit: async (ev) => {
                ev.preventDefault();
                const cambios = { titulo: titulo.value.trim(), descripcion: descripcion.value.trim(), carpeta: carpeta.entrada.value.trim() };
                if (direccion) cambios.url = direccion.value.trim();
                if (!cambios.titulo) {
                    error.textContent = "El documento necesita un título.";
                    titulo.focus();
                    return;
                }
                guardar.disabled = true;
                try {
                    reemplazar(await api.cambiarDocumento(doc.id, cambios));
                    v.cerrar();
                    aviso("Cambios guardados");
                } catch (err) {
                    error.textContent = err.message;
                    guardar.disabled = false;
                }
            },
        },
        h("label", { class: "etiqueta-campo" }, h("span", null, "Título"), titulo),
        h("label", { class: "etiqueta-campo" }, h("span", null, "Descripción"), descripcion),
        carpeta.el,
        direccion ? h("label", { class: "etiqueta-campo" }, h("span", null, "Dirección (https)"), direccion) : null,
        error,
        h("div", { class: "fila-botones" }, h("button", { type: "button", class: "btn", onclick: () => v.cerrar() }, "Cancelar"), guardar),
    );
    const v = ventana("Editar documento", formulario, { ancho: 480 });
}

function nuevoEnlace() {
    const direccion = h("input", { class: "campo", id: "campo-url", type: "url", placeholder: "https://", autocomplete: "off", inputmode: "url" });
    const titulo = h("input", { class: "campo", id: "campo-titulo", maxlength: "200", placeholder: "Si lo dejas vacío, se usa el nombre de la web", autocomplete: "off" });
    const descripcion = h("textarea", { class: "campo", id: "campo-descripcion", rows: "3", maxlength: "2000", placeholder: "Para qué sirve (opcional)" });
    const carpeta = campoCarpeta(E.carpeta.startsWith("c:") ? E.carpeta.slice(2) : "");
    const error = h("p", { class: "error", role: "alert" });
    const guardar = h("button", { type: "submit", class: "btn primario" }, "Añadir");
    const formulario = h(
        "form",
        {
            class: "pila",
            novalidate: true,
            onsubmit: async (ev) => {
                ev.preventDefault();
                if (!direccion.value.trim()) {
                    error.textContent = "Pega la dirección del enlace.";
                    direccion.focus();
                    return;
                }
                guardar.disabled = true;
                try {
                    const doc = await api.anadirEnlace({ url: direccion.value.trim(), titulo: titulo.value.trim(), descripcion: descripcion.value.trim(), carpeta: carpeta.entrada.value.trim() });
                    reemplazar(doc);
                    v.cerrar();
                    aviso(`«${recortar(doc.titulo)}» añadido`);
                } catch (err) {
                    error.textContent = err.message;
                    guardar.disabled = false;
                }
            },
        },
        h("p", { class: "nota" }, "Solo direcciones https. Los de Google Docs, Hojas, Presentaciones y Drive se ven aquí dentro; cualquier otra se abre en una pestaña nueva."),
        h("label", { class: "etiqueta-campo" }, h("span", null, "Dirección"), direccion),
        h("label", { class: "etiqueta-campo" }, h("span", null, "Título"), titulo),
        h("label", { class: "etiqueta-campo" }, h("span", null, "Descripción"), descripcion),
        carpeta.el,
        error,
        h("div", { class: "fila-botones" }, h("button", { type: "button", class: "btn", onclick: () => v.cerrar() }, "Cancelar"), guardar),
    );
    const v = ventana("Añadir enlace", formulario, { ancho: 480 });
}

// ---------- subir (botón y soltar) ----------

const idSubida = () => Math.random().toString(36).slice(2, 10);

function problemaDe(archivo) {
    const ext = nombreExtension(archivo.name);
    if (ext && !EXTENSIONES.has(ext)) return `Los .${ext} no se pueden subir. Se admiten: ${ADMITIDOS}. Para lo demás, añade un enlace.`;
    if (archivo.size === 0) return "Ese archivo está vacío.";
    if (TEXTOS.has(ext) && archivo.size > E.limites.texto) return `Los textos y los Markdown pueden ocupar como mucho ${tamano(E.limites.texto)}.`;
    if (archivo.size > E.limites.archivo) return `Ese archivo es demasiado grande: como mucho ${tamano(E.limites.archivo)}.`;
    return null;
}

async function subirVarios(archivos) {
    const lista = [...archivos];
    if (!lista.length || !E.yo) return;
    const carpeta = E.carpeta.startsWith("c:") ? E.carpeta.slice(2) : "";
    const nuevas = lista.map((archivo) => ({ id: idSubida(), archivo, nombre: archivo.name || "archivo", estado: "esperando", progreso: 0, mensaje: "", titulo: "" }));
    E.subidas.push(...nuevas);
    pintarSubidas();
    let siguiente = 0;
    const trabajar = async () => {
        while (siguiente < nuevas.length) await subirUna(nuevas[siguiente++], carpeta);
    };
    await Promise.all(Array.from({ length: Math.min(EN_PARALELO, nuevas.length) }, trabajar));
    const buenas = nuevas.filter((s) => s.estado === "listo");
    if (buenas.length) aviso(buenas.length === 1 ? `«${recortar(buenas[0].titulo)}» subido` : `${buenas.length} documentos subidos`);
}

async function subirUna(s, carpeta) {
    if (s.estado === "cancelada") return;
    const problema = problemaDe(s.archivo);
    if (problema) return fallo(s, problema);
    s.estado = "subiendo";
    refrescarSubida(s);
    try {
        const promesa = subirDocumento(s.archivo, { carpeta, alProgreso: (p) => ((s.progreso = p), refrescarSubida(s)) });
        s.cancelar = promesa.cancelar;
        const doc = await promesa;
        s.estado = "listo";
        s.progreso = 1;
        s.titulo = doc.titulo;
        E.limites.usado += doc.tamano || 0;
        reemplazar(doc);
        refrescarSubida(s);
        setTimeout(() => quitarSubida(s), 6000);
    } catch (error) {
        if (s.estado === "cancelada") return quitarSubida(s);
        fallo(s, error.message);
    }
}

function fallo(s, mensaje) {
    s.estado = "error";
    s.mensaje = mensaje;
    refrescarSubida(s);
}

function quitarSubida(s) {
    if (s.estado === "subiendo") {
        s.estado = "cancelada";
        s.cancelar?.(); // al abortar, subirUna vuelve a llamar aquí y ya se quita
        return;
    }
    if (s.estado === "esperando") s.estado = "cancelada"; // para que no llegue a subirse
    E.subidas = E.subidas.filter((x) => x !== s);
    pintarSubidas();
}

function refrescarSubida(s) {
    if (!s.el) return pintarSubidas();
    s.el.className = `subida ${s.estado}`;
    const barra = s.el.querySelector("progress");
    barra.value = s.progreso;
    barra.hidden = s.estado === "error" || s.estado === "listo";
    s.el.querySelector(".subida-estado").textContent =
        s.estado === "esperando" ? "En cola" : s.estado === "subiendo" ? (s.progreso >= 1 ? "Procesando…" : `Subiendo ${Math.round(s.progreso * 100)} %`) : s.estado === "listo" ? "Subido" : s.mensaje;
    const quitar = s.el.querySelector("button");
    quitar.setAttribute("aria-label", s.estado === "subiendo" || s.estado === "esperando" ? `Cancelar ${s.nombre}` : `Quitar ${s.nombre} de la lista`);
    $("#subidas-resumen")?.replaceChildren(resumenSubidas());
}

function resumenSubidas() {
    const activas = E.subidas.filter((s) => s.estado === "esperando" || s.estado === "subiendo").length;
    const errores = E.subidas.filter((s) => s.estado === "error").length;
    if (activas) return document.createTextNode(`Subiendo ${activas} ${activas === 1 ? "archivo" : "archivos"}…`);
    if (errores) return document.createTextNode(errores === 1 ? "No se ha podido subir 1 archivo" : `No se han podido subir ${errores} archivos`);
    return document.createTextNode("Subidas terminadas");
}

function pintarSubidas() {
    const caja = $("#subidas");
    if (!caja) return;
    caja.hidden = E.subidas.length === 0;
    if (!E.subidas.length) return caja.replaceChildren();
    const lista = h("ul", { class: "subidas-lista" });
    for (const s of E.subidas) {
        s.el = h(
            "li",
            { class: `subida ${s.estado}` },
            h("div", { class: "subida-fila" }, h("span", { class: "subida-nombre", title: s.nombre }, s.nombre), h("button", { type: "button", class: "boton-icono", onclick: () => quitarSubida(s) }, "×")),
            h("progress", { max: "1", value: String(s.progreso), "aria-label": `Progreso de ${s.nombre}` }),
            h("div", { class: "subida-estado" }),
        );
        lista.append(s.el);
    }
    caja.replaceChildren(h("div", { class: "subidas-cab", id: "subidas-resumen" }), lista);
    E.subidas.forEach(refrescarSubida);
}

let arrastres = 0;
const traeArchivos = (ev) => [...(ev.dataTransfer?.types || [])].includes("Files");
const mostrarSoltar = (si) => {
    const caja = $("#soltar");
    if (caja) caja.hidden = !si;
};
document.addEventListener("dragenter", (ev) => {
    if (!E.yo || !traeArchivos(ev)) return;
    ev.preventDefault();
    arrastres += 1;
    mostrarSoltar(true);
});
document.addEventListener("dragover", (ev) => {
    if (!E.yo || !traeArchivos(ev)) return;
    ev.preventDefault();
    try {
        ev.dataTransfer.dropEffect = "copy";
    } catch {
        /* da igual */
    }
});
document.addEventListener("dragleave", (ev) => {
    if (!E.yo || !traeArchivos(ev)) return;
    arrastres = Math.max(0, arrastres - 1);
    if (!arrastres) mostrarSoltar(false);
});
document.addEventListener("drop", (ev) => {
    if (!E.yo || !traeArchivos(ev)) return;
    ev.preventDefault();
    arrastres = 0;
    mostrarSoltar(false);
    subirVarios(ev.dataTransfer.files);
});

// ---------- buscar ----------

let numeroBusqueda = 0;
async function lanzarBusqueda() {
    if (!buscando()) {
        E.resultados = null;
        pintarLista();
        return;
    }
    const mia = ++numeroBusqueda;
    const consulta = E.consulta.trim();
    try {
        const r = await api.buscarEnArchivo(consulta);
        if (mia !== numeroBusqueda) return;
        E.resultados = r.resultados || [];
        E.consultaResultados = consulta;
    } catch (error) {
        if (mia !== numeroBusqueda) return;
        E.resultados = [];
        aviso(error.message, { tipo: "malo" });
    }
    pintarLista();
}
const buscarLuego = retrasar(lanzarBusqueda, 250);

function ponerConsulta(texto) {
    E.consulta = texto;
    const campo = $("#buscar");
    if (campo && campo.value !== texto) campo.value = texto;
    if (!buscando()) {
        numeroBusqueda += 1;
        E.resultados = null;
        pintar();
    } else buscarLuego();
}

function elegirCarpeta(clave) {
    E.carpeta = clave;
    if (E.consulta) ponerConsulta("");
    else pintar();
    if (E.docId) cerrarDoc();
    $("#lista")?.scrollTo(0, 0);
}

// ---------- pintar la lista ----------

function vistaActual() {
    const orden = fijadosPrimero(comparar[E.orden]);
    switch (E.carpeta) {
        case "recientes":
            return { titulo: "Lo último", nota: "Lo que se ha subido o cambiado hace poco.", docs: [...E.documentos].sort(comparar.actualizado).slice(0, RECIENTES), vacio: "Todavía no hay nada." };
        case "sin":
            return { titulo: "Sin carpeta", docs: E.documentos.filter((d) => !d.carpeta).sort(orden), vacio: "Todo tiene carpeta." };
        case "papelera":
            return { titulo: "Papelera", nota: `Lo que borras se queda aquí ${DIAS_PAPELERA} días; después se borra del todo.`, docs: E.papelera, vacio: "La papelera está vacía." };
        case "todo":
            return { titulo: "Todo el archivo", docs: [...E.documentos].sort(orden), vacio: null };
        default: {
            const nombre = E.carpeta.slice(2);
            return { titulo: nombre, docs: E.documentos.filter((d) => d.carpeta === nombre).sort(orden), vacio: "No hay nada en esta carpeta." };
        }
    }
}

function pintarCarpetas() {
    const caja = $("#carpetas");
    if (!caja) return;
    const lista = carpetas();
    const sin = E.documentos.filter((d) => !d.carpeta).length;
    // Si la carpeta elegida ya no existe (se ha quedado vacía), se vuelve a «Todo».
    if ((E.carpeta.startsWith("c:") && !lista.some(([n]) => `c:${n}` === E.carpeta)) || (E.carpeta === "sin" && !(lista.length && sin))) E.carpeta = "todo";
    const item = (clave, nombre, cuenta, clase = "") =>
        h(
            "button",
            { type: "button", class: ["carpeta-item", clase], "aria-current": E.carpeta === clave && !(buscando() && E.resultados) ? "true" : null, dataset: { carpeta: clave }, onclick: () => elegirCarpeta(clave) },
            h("span", { class: "carpeta-nombre" }, nombre),
            h("span", { class: "cuenta" }, String(cuenta)),
        );
    const usado = E.limites.total ? h("p", { class: "nota espacio" }, `Ocupa ${tamano(E.limites.usado)} de ${tamano(E.limites.total)}`) : null;
    // (replaceChildren no se salta los null: los pintaría como «null».)
    const hijos = [
        item("todo", "Todo", E.documentos.length),
        item("recientes", "Recientes", Math.min(RECIENTES, E.documentos.length)),
        lista.length ? h("div", { class: "carpetas-titulo" }, "Carpetas") : null,
        ...lista.map(([nombre, n]) => item(`c:${nombre}`, nombre, n)),
        lista.length && sin ? item("sin", "Sin carpeta", sin, "suave") : null,
        h("div", { class: "carpetas-sep" }),
        item("papelera", "Papelera", E.papelera.length),
        usado,
    ];
    caja.replaceChildren(...hijos.filter(Boolean));
}

function pintarLista() {
    const zona = $("#lista");
    if (!zona) return;
    const buscar = buscando() && E.resultados;
    const terminos = buscar ? terminosDe(E.consultaResultados) : [];
    let cab;
    let tarjetas;
    let vacio = null;
    if (buscar) {
        const porId = new Map(E.documentos.map((d) => [d.id, d]));
        const filas = E.resultados.filter((r) => porId.has(r.id));
        cab = { titulo: `${filas.length} ${filas.length === 1 ? "resultado" : "resultados"} para «${E.consultaResultados}»`, nota: "Se busca en los títulos, las descripciones y el texto de los Markdown, textos y Word." };
        tarjetas = filas.map((r) => tarjeta(porId.get(r.id), { terminos, fragmento: r.fragmento, coincidencias: r.coincidencias }));
        if (!filas.length) vacio = h("div", { class: "vacio" }, h("p", { class: "vacio-titulo" }, "No he encontrado nada"), h("p", { class: "nota" }, "Prueba con otras palabras o con menos."));
    } else {
        const v = vistaActual();
        cab = { titulo: v.titulo, nota: v.nota };
        tarjetas = E.carpeta === "papelera" ? v.docs.map(tarjetaPapelera) : v.docs.map((d) => tarjeta(d));
        if (!v.docs.length) vacio = E.carpeta === "todo" ? estadoVacio() : h("div", { class: "vacio" }, h("p", { class: "vacio-titulo" }, v.vacio));
    }
    const orden = $("#orden");
    if (orden) orden.hidden = Boolean(buscar) || E.carpeta === "recientes" || E.carpeta === "papelera";
    zona.replaceChildren(
        h(
            "div",
            { class: "lista-cab" },
            h("div", { class: "lista-cab-texto" }, h("h2", null, cab.titulo), cab.nota ? h("p", { class: "nota" }, cab.nota) : null),
            buscar ? h("button", { type: "button", class: "btn pequeno", onclick: () => (ponerConsulta(""), $("#buscar")?.focus()) }, "Quitar búsqueda") : null,
        ),
        vacio || h("div", { class: "tarjetas" }, tarjetas),
    );
}

function estadoVacio() {
    return h(
        "div",
        { class: "vacio grande" },
        h("p", { class: "vacio-titulo" }, "Todavía no hay nada en el archivo"),
        h("p", null, "Arrastra aquí tus documentos o pulsa el botón para subirlos. También puedes añadir un enlace."),
        h("p", { class: "nota" }, `Se admiten ${ADMITIDOS}; hasta ${tamano(E.limites.archivo)} cada uno.`),
        h("div", { class: "fila-botones centro-botones" }, h("button", { type: "button", class: "btn primario", onclick: () => $("#elegir").click() }, "Subir archivos"), h("button", { type: "button", class: "btn", onclick: nuevoEnlace }, "Añadir enlace")),
    );
}

function tarjeta(doc, { terminos = [], fragmento = null, coincidencias = 0 } = {}) {
    const t = tipoDe(doc);
    const resaltado = (texto) => (terminos.length ? resaltar(texto, terminos) : texto);
    const miniatura = doc.tipo === "imagen" && doc.tamano <= MINIATURA_MAXIMA ? h("img", { class: "miniatura", src: direccionArchivo(doc), alt: "", loading: "lazy", decoding: "async" }) : null;
    const abrir = (ev) => {
        if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey || ev.button > 0) return;
        ev.preventDefault();
        abrirDoc(doc.id, { consulta: buscando() && E.resultados ? E.consultaResultados : "" });
    };
    return h(
        "article",
        { class: ["tarjeta-doc", doc.fijado && "fijada"], dataset: { id: doc.id } },
        h(
            "div",
            { class: "tarjeta-cabeza" },
            miniatura ? h("span", { class: "miniatura-caja" }, miniatura) : insignia(doc),
            h(
                "div",
                { class: "tarjeta-titulos" },
                h("h3", null, h("a", { class: "tarjeta-titulo", href: enlaceDoc(doc.id), onclick: abrir }, resaltado(doc.titulo))),
                h("div", { class: "tarjeta-meta" }, t.nombre, doc.tamano ? ` · ${tamano(doc.tamano)}` : ""),
            ),
        ),
        doc.fijado || doc.carpeta ? h("div", { class: "tarjeta-etiquetas" }, doc.fijado ? h("span", { class: "chip-fijado" }, "Fijado") : null, doc.carpeta ? h("span", { class: "chip-carpeta" }, doc.carpeta) : null) : null,
        doc.descripcion ? h("p", { class: "tarjeta-desc" }, resaltado(doc.descripcion)) : null,
        fragmento ? h("p", { class: "tarjeta-fragmento" }, resaltado(fragmento), coincidencias > 1 ? h("span", { class: "coincidencias" }, ` · ${coincidencias} coincidencias`) : null) : null,
        h(
            "div",
            { class: "tarjeta-pie" },
            h("span", { class: "tarjeta-quien" }, avatar(usuarioDe(doc.autor)), h("span", { class: "tarjeta-quien-texto" }, `${nombreDe(doc.autor)} · ${haceCuanto(doc.creado)}`)),
            h(
                "span",
                { class: "tarjeta-botones" },
                h(
                    "button",
                    {
                        type: "button",
                        class: ["boton-icono", "pin", doc.fijado && "activo"],
                        "aria-pressed": String(Boolean(doc.fijado)),
                        "aria-label": doc.fijado ? `Quitar fijado de «${doc.titulo}»` : `Fijar «${doc.titulo}»`,
                        title: doc.fijado ? "Quitar fijado" : "Fijar arriba del todo",
                        onclick: () => fijar(doc),
                    },
                    doc.fijado ? "★" : "☆",
                ),
                h("button", { type: "button", class: "boton-icono", "aria-label": `Más acciones de «${doc.titulo}»`, title: "Más acciones", onclick: (ev) => menuDoc(ev.currentTarget, doc) }, "…"),
            ),
        ),
    );
}

function tarjetaPapelera(doc) {
    const hasta = new Date(Date.parse(doc.borrado) + DIAS_PAPELERA * 86400000);
    const puedeBorrar = E.yo.admin || doc.autor === E.yo.id;
    return h(
        "article",
        { class: "tarjeta-doc en-papelera", dataset: { id: doc.id } },
        h("div", { class: "tarjeta-cabeza" }, insignia(doc), h("div", { class: "tarjeta-titulos" }, h("h3", null, doc.titulo), h("div", { class: "tarjeta-meta" }, tipoDe(doc).nombre, doc.tamano ? ` · ${tamano(doc.tamano)}` : ""))),
        h("p", { class: "tarjeta-desc" }, `Borrado por ${nombreDe(doc.borradoPor)} ${haceCuanto(doc.borrado)}. Se borra del todo el ${hasta.getDate()} ${MESES_CORTOS[hasta.getMonth()]}.`),
        h(
            "div",
            { class: "tarjeta-pie" },
            h("span", { class: "tarjeta-botones izquierda" }, h("button", { type: "button", class: "btn pequeno", onclick: () => restaurar(doc) }, "Restaurar"), puedeBorrar ? h("button", { type: "button", class: "btn pequeno peligro", onclick: () => eliminarDelTodo(doc) }, "Borrar del todo") : null),
        ),
    );
}

function menuDoc(ancla, doc) {
    const opcion = (texto, fn) => h("button", { type: "button", class: "opcion", onclick: () => (cerrarMenu(), fn()) }, h("span", { class: "marca" }), texto);
    const enlace = (texto, href, extra) => h("a", { class: "opcion", href, onclick: cerrarMenu, ...extra }, h("span", { class: "marca" }), texto);
    abrirMenu(ancla, () =>
        h(
            "div",
            null,
            h("div", { class: "menu-titulo" }, recortar(doc.titulo, 32)),
            h(
                "div",
                { class: "opciones" },
                opcion("Abrir", () => abrirDoc(doc.id)),
                opcion("Editar…", () => editar(doc)),
                opcion(doc.fijado ? "Quitar fijado" : "Fijar arriba del todo", () => fijar(doc)),
                h("hr"),
                doc.tipo !== "enlace" ? enlace("Descargar", direccionDescarga(doc), { download: doc.nombre || "" }) : null,
                enlace("Abrir en pestaña nueva ↗", direccionAparte(doc), { target: "_blank", rel: "noopener noreferrer" }),
                h("hr"),
                opcion("Mandar a la papelera", () => borrar(doc)),
            ),
        ),
    );
}

function pintar() {
    pintarCarpetas();
    pintarLista();
}

// ---------- abrir un documento (?doc=<id>) ----------

function mostrarVista(verVisor) {
    const inicio = $("#vista-inicio");
    const zona = $("#vista-visor");
    if (!inicio || !zona) return;
    if (verVisor && !inicio.hidden) scrollLista = $("#lista")?.scrollTop || 0;
    inicio.hidden = verVisor;
    zona.hidden = !verVisor;
    if (!verVisor) {
        const lista = $("#lista");
        if (lista) lista.scrollTop = scrollLista;
    }
}

async function abrirDoc(id, { empujar = true, consulta = "" } = {}) {
    const doc = E.documentos.find((d) => d.id === id);
    E.docId = id;
    ultimoDoc = id;
    if (empujar) history.pushState({ doc: id }, "", enlaceDoc(id));
    mostrarVista(true);
    if (!doc) {
        visor.cerrar();
        const enPapelera = E.papelera.find((d) => d.id === id);
        $("#vista-visor").replaceChildren(
            h(
                "div",
                { class: "visor-aviso-grande" },
                h("p", { class: "visor-sitio" }, enPapelera ? "Ese documento está en la papelera" : "Ese documento no existe"),
                h("p", { class: "nota" }, enPapelera ? `«${enPapelera.titulo}» se puede restaurar.` : "Puede que se haya borrado del todo o que la dirección no esté bien."),
                h(
                    "div",
                    { class: "visor-aviso-botones" },
                    enPapelera ? h("button", { type: "button", class: "btn primario", onclick: async () => (await restaurar(enPapelera), abrirDoc(id, { empujar: false })) }, "Restaurar") : null,
                    h("button", { type: "button", class: "btn", id: "visor-volver", onclick: cerrarDoc }, "← Archivo"),
                ),
            ),
        );
        return;
    }
    await visor.abrir(doc, { consulta });
    if (E.docId !== id) return;
    ($("#visor-contenido") || $("#visor-volver"))?.focus({ preventScroll: true });
}

function mostrarLista() {
    const id = E.docId || ultimoDoc;
    E.docId = null;
    visor?.cerrar();
    mostrarVista(false);
    // Que el foco vuelva a la tarjeta que se estaba mirando.
    if (id) [...document.querySelectorAll(".tarjeta-doc")].find((t) => t.dataset.id === id)?.querySelector(".tarjeta-titulo")?.focus({ preventScroll: true });
}

function cerrarDoc() {
    if (!E.docId) return;
    if (history.state && history.state.doc) {
        // Se vuelve atrás en el historial (y popstate enseña la lista); E.docId ya no vale para un segundo Esc.
        ultimoDoc = E.docId;
        E.docId = null;
        history.back();
    } else {
        history.replaceState(null, "", location.pathname);
        mostrarLista();
    }
}

window.addEventListener("popstate", () => {
    if (!E.yo) return;
    const id = new URLSearchParams(location.search).get("doc");
    if (id) abrirDoc(id, { empujar: false });
    else mostrarLista();
});

// ---------- la pantalla ----------

function menuYo(ancla) {
    const opcion = (texto, fn) => h("button", { type: "button", class: "opcion", onclick: () => (cerrarMenu(), fn()) }, h("span", { class: "marca" }), texto);
    const enlace = (texto, href, extra) => h("a", { class: "opcion", href, ...extra }, h("span", { class: "marca" }), texto);
    abrirMenu(ancla, () =>
        h(
            "div",
            null,
            h("div", { class: "menu-titulo" }, `Hola, ${E.yo.nombre}`),
            h(
                "div",
                { class: "opciones" },
                dentroDeLaOficina() ? enlace("Abrir en pestaña nueva ↗", location.href.split("#")[0], { target: "_blank", rel: "noopener", onclick: cerrarMenu }) : null,
                opcion(`Papelera${E.papelera.length ? ` (${E.papelera.length})` : ""}`, () => elegirCarpeta("papelera")),
                h("hr"),
                enlace("Tablón de tareas", "../"),
                E.yo.libro ? enlace("Libro de cuentas", "../libro/") : null,
                enlace("Pizarra", "../pizarra/"),
                h("hr"),
                opcion("Salir", salir),
            ),
        ),
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

function montar() {
    vaciar(raiz);
    const buscar = h("input", {
        type: "search",
        class: "campo",
        id: "buscar",
        placeholder: "Buscar en el archivo ( / )",
        "aria-label": "Buscar en el archivo",
        autocomplete: "off",
        spellcheck: "false",
        value: E.consulta,
        oninput: (ev) => ponerConsulta(ev.target.value),
    });
    const orden = h(
        "select",
        {
            class: "campo",
            id: "orden",
            "aria-label": "Ordenar por",
            onchange: (ev) => {
                E.orden = ev.target.value === "titulo" ? "titulo" : "fecha";
                guardarLocal("archivo:orden", E.orden);
                pintarLista();
            },
        },
        h("option", { value: "fecha" }, "Más nuevos primero"),
        h("option", { value: "titulo" }, "Título (A–Z)"),
    );
    orden.value = E.orden;
    raiz.append(
        h(
            "header",
            { class: "barra" },
            h("div", { class: "marca" }, h("span", { class: "logo" }, "HS"), h("span", { class: "nombre-app" }, "ARCHIVO")),
            h(
                "nav",
                { class: "pestanas", "aria-label": "Aplicaciones" },
                h("a", { class: "pestana", href: "../" }, "Tareas"),
                E.yo.libro ? h("a", { class: "pestana", href: "../libro/" }, "Cuentas") : null,
                h("a", { class: "pestana", href: "../pizarra/" }, "Pizarra"),
                h("span", { class: "pestana activa", "aria-current": "page" }, "Archivo"),
            ),
            h("div", { class: "barra-derecha" }, h("button", { type: "button", class: "boton-yo", id: "boton-yo", "aria-label": "Tu cuenta", onclick: (ev) => menuYo(ev.currentTarget) }, avatar(E.yo), h("span", { class: "nombre-yo" }, E.yo.nombre), h("span", { class: "flecha" }, "▾"))),
        ),
        h(
            "main",
            { class: "archivo-cuerpo" },
            h("h1", { class: "oculto" }, "Archivo de documentos"),
            h(
                "section",
                { class: "inicio", id: "vista-inicio" },
                h(
                    "div",
                    { class: "herramientas-archivo", role: "toolbar", "aria-label": "Buscar y subir" },
                    h("div", { class: "buscar-archivo" }, buscar),
                    orden,
                    h("button", { type: "button", class: "btn primario", id: "boton-subir", onclick: () => $("#elegir").click() }, "Subir archivos"),
                    h("button", { type: "button", class: "btn", id: "boton-enlace", onclick: nuevoEnlace }, "Añadir enlace"),
                    h("input", {
                        type: "file",
                        id: "elegir",
                        multiple: true,
                        accept: ACEPTADOS,
                        hidden: true,
                        "aria-label": "Elegir archivos para subir",
                        onchange: (ev) => {
                            const archivos = [...ev.target.files];
                            ev.target.value = "";
                            subirVarios(archivos);
                        },
                    }),
                ),
                h("div", { class: "inicio-cuerpo" }, h("nav", { class: "carpetas", id: "carpetas", "aria-label": "Carpetas" }), h("div", { class: "lista-zona", id: "lista" })),
            ),
            h("section", { class: "visor-zona", id: "vista-visor", hidden: true, "aria-label": "Documento" }),
        ),
        h("div", { class: "soltar-aviso", id: "soltar", hidden: true }, h("div", { class: "soltar-caja" }, h("strong", null, "Suelta aquí para subir"), h("span", null, ADMITIDOS))),
        h("div", { class: "subidas", id: "subidas", hidden: true, role: "status" }),
    );
    visor = crearVisor({ contenedor: $("#vista-visor"), usuarioDe, acciones: { cerrar: cerrarDoc, fijar, editar, borrar } });
    pintar();
    pintarSubidas();
}

function alRecibir(ev) {
    if (ev.tipo === "archivo") recargarLuego();
    else if (ev.tipo === "usuarios") {
        E.usuarios = ev.usuarios || E.usuarios;
        pintar();
    }
}

async function recargar() {
    try {
        aplicar(await api.archivo());
    } catch {
        return; // sin conexión (o sin sesión: ya se ha avisado): se queda como está
    }
    pintar();
    if (buscando()) lanzarBusqueda();
    if (E.docId) {
        const d = E.documentos.find((x) => x.id === E.docId);
        if (d) visor.actualizar(d);
        else if (visor.idAbierto()) {
            aviso("Ese documento ya no está en el archivo: alguien lo ha mandado a la papelera.");
            cerrarDoc();
        }
    }
}
const recargarLuego = retrasar(recargar, 300);

function empezar(datos) {
    aplicar(datos);
    montar();
    dejarDeEscuchar?.();
    dejarDeEscuchar = escuchar(alRecibir, recargar);
    const id = new URLSearchParams(location.search).get("doc");
    if (id) abrirDoc(id, { empujar: false });
}

async function entrarYEmpezar() {
    try {
        empezar(await api.archivo());
    } catch (err) {
        sinConexion(err.message);
    }
}

function sinSesion() {
    dejarDeEscuchar?.();
    dejarDeEscuchar = null;
    cerrarMenu();
    for (const s of E.subidas) s.cancelar?.();
    E.yo = null;
    E.subidas = [];
    E.docId = null;
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

// ---------- teclado ----------

document.addEventListener("keydown", (ev) => {
    if (!E.yo || !$("#vista-inicio")) return;
    const en = ev.target instanceof Element ? ev.target : null;
    const escribiendo = Boolean(en?.closest("input, textarea, select, [contenteditable=true]"));
    if (document.querySelector(".fondo-ventana") || hayMenu()) return;
    if (ev.key === "/" && !escribiendo && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault();
        if (E.docId) visor.enfocarBusqueda();
        else $("#buscar")?.focus();
    } else if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.key.toLowerCase() === "f" && E.docId) {
        // Buscar dentro del documento (si es de texto); si no, el buscador del navegador.
        if (visor.enfocarBusqueda()) ev.preventDefault();
    } else if (ev.key === "Escape") {
        if (en?.id === "buscar") {
            if (E.consulta) ponerConsulta("");
            else en.blur();
        } else if (E.docId && en?.id !== "buscar-doc") cerrarDoc(); // el buscador del documento atiende su propio Esc
    }
});

// ---------- inicio ----------

(async function inicio() {
    try {
        empezar(await api.archivo());
    } catch (err) {
        if (err.estado === 401) pantallaEntrar(raiz, entrarYEmpezar);
        else sinConexion(err.message);
    }
})();
