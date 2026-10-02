// El visor del archivo: enseña un documento dentro de la página (Markdown, Word, PDF, foto, texto o enlace), con el
// índice de títulos (a un lado en pantallas anchas, plegado en el móvil, y marcando en qué sección estás) y un
// buscador dentro del documento (resalta, cuenta y salta de uno en uno).
//
// Todo lo que viene del documento se enseña escapado: el Markdown pasa por markdown.js, el Word llega ya limpio del
// servidor y aun así se vuelve a filtrar aquí (solo las etiquetas de texto, tablas y listas; enlaces solo http,
// https o mailto). La página además tiene una CSP que no deja ejecutar nada suelto.

import { h, vaciar, haceCuanto } from "./util.js";
import { api, direccionApi } from "./api.js";
import { markdownAHtml, slug } from "./markdown.js";
import { tipoDe, tamano, insignia, plegarConMapa } from "./archivo-comun.js";

const MAXIMO_MARCAS = 3000;
const sinMovimiento = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export const direccionArchivo = (doc, extra = "") => direccionApi(`archivo/documentos/${doc.id}/archivo${extra}`);
export const direccionDescarga = (doc) => direccionArchivo(doc, "?descargar");
// «Abrir en pestaña nueva»: el PDF y las fotos, tal cual (el navegador los enseña); un enlace, su dirección; y los
// demás (que el servidor solo deja descargar), este mismo visor a pantalla completa.
export function direccionAparte(doc) {
    if (doc.tipo === "enlace") return doc.url;
    if (doc.tipo === "pdf" || doc.tipo === "imagen") return direccionArchivo(doc);
    const u = new URL(location.href);
    u.search = "";
    u.hash = "";
    u.searchParams.set("doc", doc.id);
    return u.href;
}

// ---------- el Word, filtrado otra vez ----------

const ETIQUETAS_WORD = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "STRONG", "EM", "U", "S", "BR", "UL", "OL", "LI", "TABLE", "TBODY", "THEAD", "TR", "TH", "TD", "A", "SPAN", "BLOCKQUOTE"]);

function htmlSeguro(html) {
    const dom = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    const limpiar = (nodo) => {
        for (const hijo of [...nodo.childNodes]) {
            if (hijo.nodeType === Node.TEXT_NODE) continue;
            if (hijo.nodeType !== Node.ELEMENT_NODE || !ETIQUETAS_WORD.has(hijo.tagName)) {
                hijo.remove();
                continue;
            }
            for (const a of [...hijo.attributes]) {
                const vale =
                    (hijo.tagName === "A" && a.name === "href") ||
                    ((hijo.tagName === "TD" || hijo.tagName === "TH") && (a.name === "colspan" || a.name === "rowspan") && /^\d{1,3}$/.test(a.value)) ||
                    (hijo.tagName === "SPAN" && a.name === "class" && a.value === "imagen-omitida");
                if (!vale) hijo.removeAttribute(a.name);
            }
            if (hijo.tagName === "A") {
                if (/^(https?:|mailto:)/i.test(hijo.getAttribute("href") || "")) {
                    hijo.setAttribute("target", "_blank");
                    hijo.setAttribute("rel", "noopener noreferrer");
                } else hijo.removeAttribute("href");
            }
            limpiar(hijo);
        }
    };
    limpiar(dom.body);
    return dom.body.innerHTML;
}

// Pone id a los títulos del Word (como hace markdown.js con los del Markdown) y devuelve su lista.
function titulosDeHtml(raiz) {
    const usados = new Set();
    const titulos = [];
    for (const el of raiz.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
        const texto = el.textContent.replace(/\s+/g, " ").trim();
        if (!texto) continue;
        const base = slug(texto) || "seccion";
        let id = base;
        for (let k = 1; usados.has(id); k++) id = `${base}-${k}`;
        usados.add(id);
        const nivel = Number(el.tagName[1]);
        el.id = `doc-${id}`;
        el.tabIndex = -1;
        el.classList.add(`t${nivel}`);
        titulos.push({ nivel, texto, id: el.id });
    }
    return titulos;
}

// Enlaces del documento: los de dentro (#título) se desplazan sin cambiar de página; los de fuera, a otra pestaña.
function enlazarDocumento(raiz) {
    for (const a of raiz.querySelectorAll("a[href]")) {
        const href = a.getAttribute("href") || "";
        if (href.startsWith("#")) continue;
        if (/^(https?:|mailto:)/i.test(href)) {
            a.target = "_blank";
            a.rel = "noopener noreferrer";
        } else a.removeAttribute("href");
    }
    raiz.addEventListener("click", (ev) => {
        const a = ev.target instanceof Element ? ev.target.closest('a[href^="#"]') : null;
        if (!a) return;
        ev.preventDefault();
        irATitulo(a.getAttribute("href").slice(1));
    });
}

function irATitulo(id) {
    const el = id ? document.getElementById(id) : null;
    if (!el) return false;
    el.scrollIntoView({ block: "start", behavior: sinMovimiento() ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
    try {
        history.replaceState(history.state, "", `${location.pathname}${location.search}#${id}`);
    } catch {
        /* da igual */
    }
    return true;
}

// ---------- el buscador dentro del documento ----------

function quitarMarcas(raiz) {
    for (const m of raiz.querySelectorAll("mark.hallazgo")) m.replaceWith(...m.childNodes);
    raiz.normalize();
}

// Marca cada aparición (sin fijarse en tildes ni mayúsculas) con <mark class="hallazgo">. Solo busca dentro de un
// mismo trozo de texto: una frase partida por una negrita no se encuentra.
function marcar(raiz, consulta) {
    const q = plegarConMapa(consulta.trim().replace(/\s+/g, " ")).plano;
    const marcas = [];
    if (!q) return marcas;
    const nodos = [];
    const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) nodos.push(n);
    for (const nodo of nodos) {
        if (marcas.length >= MAXIMO_MARCAS) break;
        const { plano, original } = plegarConMapa(nodo.data);
        if (!plano.includes(q)) continue;
        const rangos = [];
        for (let p = plano.indexOf(q); p >= 0; p = plano.indexOf(q, p + q.length)) {
            const desde = original(p);
            rangos.push([desde, Math.max(original(p + q.length), desde + 1)]);
        }
        // De atrás hacia delante, para que las posiciones de delante no cambien al partir el texto.
        const creadas = [];
        for (let k = rangos.length - 1; k >= 0; k--) {
            const rango = document.createRange();
            rango.setStart(nodo, rangos[k][0]);
            rango.setEnd(nodo, rangos[k][1]);
            const marca = document.createElement("mark");
            marca.className = "hallazgo";
            rango.surroundContents(marca);
            creadas.unshift(marca);
        }
        marcas.push(...creadas);
    }
    return marcas;
}

function montarBuscador(raiz, inicial) {
    let marcas = [];
    let actual = -1;
    const entrada = h("input", { type: "search", class: "campo", id: "buscar-doc", placeholder: "Buscar en el documento", autocomplete: "off", spellcheck: "false", "aria-label": "Buscar en el documento", value: inicial || "" });
    const cuenta = h("span", { class: "cuenta-hallazgos", "aria-live": "polite", role: "status" });
    const mostrar = () => {
        if (!entrada.value.trim()) cuenta.textContent = "";
        else if (!marcas.length) cuenta.textContent = "Sin resultados";
        else cuenta.textContent = `${actual + 1} de ${marcas.length}${marcas.length >= MAXIMO_MARCAS ? "+" : ""}`;
        anterior.disabled = siguiente.disabled = marcas.length < 2;
    };
    function ir(i) {
        if (!marcas.length) {
            actual = -1;
            mostrar();
            return;
        }
        marcas[actual]?.classList.remove("actual");
        actual = (i + marcas.length) % marcas.length;
        const m = marcas[actual];
        m.classList.add("actual");
        m.scrollIntoView({ block: "center", inline: "nearest" });
        mostrar();
    }
    function aplicar() {
        quitarMarcas(raiz);
        marcas = entrada.value.trim() ? marcar(raiz, entrada.value) : [];
        actual = -1;
        if (marcas.length) ir(0);
        else mostrar();
    }
    const anterior = h("button", { type: "button", class: "btn pequeno", "aria-label": "Resultado anterior", title: "Anterior (Mayús+Intro)", onclick: () => ir(actual - 1) }, "↑");
    const siguiente = h("button", { type: "button", class: "btn pequeno", "aria-label": "Resultado siguiente", title: "Siguiente (Intro)", onclick: () => ir(actual + 1) }, "↓");
    let espera = null;
    entrada.addEventListener("input", () => {
        clearTimeout(espera);
        espera = setTimeout(() => {
            espera = null;
            aplicar();
        }, 150);
    });
    entrada.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
            ev.preventDefault();
            if (espera) {
                clearTimeout(espera);
                espera = null;
                aplicar();
            } else ir(actual + (ev.shiftKey ? -1 : 1));
        } else if (ev.key === "Escape") {
            // Primero se vacía y luego se sale del campo; el visor se cierra con el Esc siguiente.
            ev.stopPropagation();
            if (entrada.value) {
                entrada.value = "";
                aplicar();
            } else entrada.blur();
        }
    });
    const el = h(
        "div",
        { class: "visor-buscar", role: "search" },
        h("label", { class: "visor-buscar-campo" }, h("span", { class: "oculto" }, "Buscar en el documento"), entrada),
        cuenta,
        anterior,
        siguiente,
    );
    if (entrada.value) setTimeout(aplicar, 0);
    else mostrar();
    return {
        el,
        enfocar: () => {
            entrada.focus();
            entrada.select();
        },
    };
}

// ---------- el índice de títulos ----------

function montarIndice(titulos, area) {
    const minimo = Math.min(...titulos.map((t) => t.nivel));
    const enlaces = new Map();
    const lista = h(
        "ul",
        { class: "indice-lista" },
        titulos.map((t) => {
            const a = h("a", { href: `#${t.id}`, dataset: { id: t.id }, title: t.texto }, t.texto);
            enlaces.set(t.id, a);
            return h("li", { class: `n${Math.min(4, t.nivel - minimo + 1)}` }, a);
        }),
    );
    const boton = h("button", { type: "button", class: "indice-boton", "aria-expanded": "false", "aria-controls": "indice-nav" }, `Contenido (${titulos.length})`);
    const el = h("aside", { class: "indice", "aria-label": "Índice del documento" }, h("div", { class: "indice-titulo" }, "Contenido"), boton, h("nav", { id: "indice-nav", "aria-label": "Títulos del documento" }, lista));
    const plegar = (abierto) => {
        el.classList.toggle("abierto", abierto);
        boton.setAttribute("aria-expanded", String(abierto));
    };
    boton.addEventListener("click", () => plegar(!el.classList.contains("abierto")));
    el.addEventListener("click", (ev) => {
        const a = ev.target instanceof Element ? ev.target.closest("a[data-id]") : null;
        if (!a) return;
        ev.preventDefault();
        irATitulo(a.dataset.id);
        plegar(false);
    });

    // En qué sección estás: el último título que ya ha pasado por arriba (y, al final del todo, el último).
    const elementos = titulos.map((t) => document.getElementById(t.id));
    let marcado = null;
    let pendiente = false;
    function seguir() {
        pendiente = false;
        if (!elementos.length) return;
        const tope = area.getBoundingClientRect().top + 28;
        let indice = 0;
        for (let i = 0; i < elementos.length; i++) {
            if (!elementos[i]) continue;
            if (elementos[i].getBoundingClientRect().top <= tope) indice = i;
            else break;
        }
        if (area.scrollTop > 0 && area.scrollTop + area.clientHeight >= area.scrollHeight - 2) indice = elementos.length - 1;
        const id = titulos[indice].id;
        if (id === marcado) return;
        enlaces.get(marcado)?.classList.remove("actual");
        enlaces.get(marcado)?.removeAttribute("aria-current");
        marcado = id;
        const a = enlaces.get(id);
        a.classList.add("actual");
        a.setAttribute("aria-current", "location");
        // Que el índice enseñe la sección actual (solo si él mismo tiene scroll y está a la vista).
        const caja = el.querySelector("nav");
        if (caja.offsetParent && caja.scrollHeight > caja.clientHeight) {
            const r = a.getBoundingClientRect();
            const c = caja.getBoundingClientRect();
            if (r.top < c.top + 4 || r.bottom > c.bottom - 4) caja.scrollTop += r.top - c.top - c.height / 3;
        }
    }
    area.addEventListener(
        "scroll",
        () => {
            if (pendiente) return;
            pendiente = true;
            requestAnimationFrame(seguir);
        },
        { passive: true },
    );
    return { el, seguir };
}

// ---------- el visor ----------

export function crearVisor({ contenedor, usuarioDe, acciones }) {
    let sesion = null;

    function cerrar() {
        if (!sesion) return;
        sesion = null;
        vaciar(contenedor);
    }

    function cabecera(doc) {
        const autor = usuarioDe(doc.autor);
        const t = tipoDe(doc);
        const tiempo = h("span", { title: new Date(doc.creado).toLocaleString("es-ES") }, haceCuanto(doc.creado));
        const meta = h("div", { class: "visor-meta" }, `${doc.tipo === "enlace" ? "Añadido" : "Subido"} por ${autor ? autor.nombre : "alguien del crew"} `, tiempo, doc.tamano ? ` · ${tamano(doc.tamano)}` : "", ` · ${t.nombre}`);
        // En el móvil los textos van más cortos (el nombre completo queda en aria-label y en el título).
        const etiqueta = (largo, corto) => [h("span", { class: "largo" }, largo), h("span", { class: "corto" }, corto)];
        const botones = [
            h("button", { type: "button", class: "btn pequeno", "aria-pressed": String(Boolean(doc.fijado)), title: doc.fijado ? "Quitar de los fijados" : "Fijar arriba del todo", onclick: () => acciones.fijar(doc) }, doc.fijado ? "Fijado" : "Fijar"),
            h("button", { type: "button", class: "btn pequeno", onclick: () => acciones.editar(doc) }, "Editar"),
            doc.tipo !== "enlace" ? h("a", { class: "btn pequeno", href: direccionDescarga(doc), download: doc.nombre || "" }, "Descargar") : null,
            h("a", { class: "btn pequeno", href: direccionAparte(doc), target: "_blank", rel: "noopener noreferrer", "aria-label": "Abrir en pestaña nueva", title: "Abrir en pestaña nueva" }, etiqueta("Abrir en pestaña nueva ↗", "Abrir ↗")),
            h("button", { type: "button", class: "btn pequeno peligro", "aria-label": "Mandar a la papelera", title: "Mandar a la papelera: se queda 30 días", onclick: () => acciones.borrar(doc) }, etiqueta("A la papelera", "Papelera")),
        ];
        return h(
            "header",
            { class: "visor-cab" },
            h("button", { type: "button", class: "btn pequeno", id: "visor-volver", "aria-label": "Volver al archivo (Esc)", title: "Volver al archivo (Esc)", onclick: () => acciones.cerrar() }, "← Archivo"),
            h("div", { class: "visor-acciones" }, botones),
            h(
                "div",
                { class: "visor-titulo" },
                insignia(doc, { grande: true }),
                h("div", { class: "visor-titulos" }, h("h1", null, doc.titulo), h("div", { class: "visor-linea" }, meta, doc.carpeta ? h("span", { class: "chip-carpeta" }, doc.carpeta) : null)),
            ),
            doc.descripcion ? h("p", { class: "visor-desc" }, doc.descripcion) : null,
        );
    }

    function actualizar(doc) {
        if (!sesion || sesion.doc.id !== doc.id) return;
        sesion.doc = doc;
        const nueva = cabecera(doc);
        sesion.cabecera.replaceWith(nueva);
        sesion.cabecera = nueva;
    }

    async function pintarTexto(mia, cuerpo, doc, consulta) {
        const area = h("div", { class: "visor-contenido", id: "visor-contenido", tabindex: "-1" }, h("p", { class: "nota visor-cargando" }, "Cargando el documento…"));
        cuerpo.append(area);
        let datos;
        try {
            datos = await api.documento(doc.id);
        } catch (error) {
            if (mia !== sesion) return;
            area.replaceChildren(
                h("div", { class: "visor-aviso-grande" }, h("p", null, error.message), h("button", { type: "button", class: "btn", onclick: () => abrir(doc, { consulta }) }, "Reintentar")),
            );
            return;
        }
        if (mia !== sesion) return;
        let raiz;
        let titulos = [];
        if (doc.tipo === "md") {
            const r = markdownAHtml(datos.texto);
            raiz = h("article", { class: "documento md", id: "documento" });
            raiz.innerHTML = r.html;
            titulos = r.titulos;
            enlazarDocumento(raiz);
        } else if (doc.tipo === "docx") {
            raiz = h("article", { class: "documento docx", id: "documento" });
            raiz.innerHTML = htmlSeguro(datos.html || "");
            titulos = titulosDeHtml(raiz);
            enlazarDocumento(raiz);
        } else {
            raiz = h("pre", { class: "texto-plano", id: "documento", tabindex: "0", "aria-label": "Texto del documento" }, datos.texto || "");
        }
        if (!raiz.textContent.trim() && doc.tipo !== "txt") raiz.append(h("p", { class: "nota" }, "El documento está vacío o no tiene nada que enseñar aquí. Puedes descargarlo."));
        area.replaceChildren(raiz);
        mia.raiz = raiz;
        mia.area = area;
        // Buscador (arriba del cuerpo) e índice (a un lado).
        const buscador = montarBuscador(raiz, consulta);
        mia.buscador = buscador;
        cuerpo.before(buscador.el);
        if (titulos.length) {
            const indice = montarIndice(titulos, area);
            cuerpo.prepend(indice.el);
            cuerpo.classList.add("con-indice");
            indice.seguir();
            mia.seguir = indice.seguir;
        }
        const ancla = decodeURIComponent(location.hash.slice(1) || "");
        if (ancla) irATitulo(ancla);
        area.dataset.listo = "1";
    }

    function pintarPdf(cuerpo, doc) {
        // Los navegadores del móvil no suelen enseñar PDF dentro de la página: ahí, botones.
        if (navigator.pdfViewerEnabled === false) {
            cuerpo.append(
                h(
                    "div",
                    { class: "visor-aviso-grande" },
                    h("p", null, "Este navegador no enseña los PDF dentro de la página."),
                    h("div", { class: "visor-aviso-botones" }, h("a", { class: "btn primario", href: direccionArchivo(doc), target: "_blank", rel: "noopener noreferrer" }, "Abrir el PDF ↗"), h("a", { class: "btn", href: direccionDescarga(doc), download: doc.nombre || "" }, "Descargar")),
                ),
            );
            return;
        }
        cuerpo.append(h("iframe", { class: "visor-marco", src: direccionArchivo(doc), title: `PDF: ${doc.titulo}` }));
    }

    function pintarImagen(cuerpo, doc) {
        const caja = h("div", { class: "visor-imagen" });
        const img = h("img", { src: direccionArchivo(doc), alt: doc.descripcion || doc.titulo, role: "button", tabindex: "0", "aria-pressed": "false", "aria-label": `${doc.titulo}: pulsa para verla a tamaño real` });
        const alternar = () => {
            const real = caja.classList.toggle("real");
            img.setAttribute("aria-pressed", String(real));
            img.setAttribute("aria-label", `${doc.titulo}: pulsa para ${real ? "ajustarla a la pantalla" : "verla a tamaño real"}`);
            if (!real) caja.scrollTo(0, 0);
        };
        img.addEventListener("click", alternar);
        img.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                alternar();
            }
        });
        img.addEventListener("error", () => caja.replaceChildren(h("div", { class: "visor-aviso-grande" }, h("p", null, "No he podido cargar la foto."))));
        caja.append(img, h("p", { class: "visor-pista", "aria-hidden": "true" }, "Pulsa la foto para verla a tamaño real"));
        cuerpo.append(caja);
    }

    function pintarEnlace(cuerpo, doc) {
        let sitio = doc.url;
        try {
            sitio = new URL(doc.url).hostname;
        } catch {
            /* se enseña la dirección entera */
        }
        const abrirEnlace = h("a", { class: "btn primario", href: doc.url, target: "_blank", rel: "noopener noreferrer" }, "Abrir enlace ↗");
        if (doc.incrustar) {
            cuerpo.append(
                h(
                    "div",
                    { class: "visor-columna" },
                    h("p", { class: "visor-aviso nota" }, `Vista previa de ${doc.servicio || sitio}. Si no se ve, hace falta tener acceso con tu cuenta de Google: `, h("a", { href: doc.url, target: "_blank", rel: "noopener noreferrer" }, "ábrelo en una pestaña nueva ↗")),
                    h("iframe", {
                        class: "visor-marco",
                        src: doc.incrustar,
                        title: doc.titulo,
                        referrerpolicy: "no-referrer",
                        sandbox: "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms",
                    }),
                ),
            );
            return;
        }
        cuerpo.append(h("div", { class: "visor-aviso-grande" }, insignia(doc, { grande: true }), h("p", { class: "visor-sitio" }, sitio), h("p", { class: "nota visor-url" }, doc.url), h("p", { class: "nota" }, "Este enlace se abre en una pestaña nueva."), abrirEnlace));
    }

    async function abrir(doc, { consulta = "" } = {}) {
        cerrar();
        const cuerpo = h("div", { class: "visor-cuerpo" });
        const mia = { doc, cabecera: cabecera(doc), cuerpo };
        sesion = mia;
        contenedor.append(h("div", { class: "visor" }, mia.cabecera, cuerpo));
        if (doc.tipo === "pdf") pintarPdf(cuerpo, doc);
        else if (doc.tipo === "imagen") pintarImagen(cuerpo, doc);
        else if (doc.tipo === "enlace") pintarEnlace(cuerpo, doc);
        else await pintarTexto(mia, cuerpo, doc, consulta);
        // Cabecera y cuerpo van dentro de .visor: el buscador (que se añade con before) cae entre ellos.
        return mia;
    }

    return {
        abrir,
        cerrar,
        actualizar,
        idAbierto: () => sesion?.doc.id || null,
        enfocarBusqueda: () => {
            if (!sesion?.buscador) return false;
            sesion.buscador.enfocar();
            return true;
        },
    };
}
