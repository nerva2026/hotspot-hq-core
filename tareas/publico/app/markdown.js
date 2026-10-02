// Markdown → HTML seguro, sin librerías. Lo usa el archivo (publico/app/archivo.js) para enseñar los .md, y las
// pruebas (pruebas/archivo.mjs) para comprobar que no se cuela nada.
//
// Entiende: títulos (# y subrayados con === o ---), párrafos, negrita, cursiva, tachado (~~), código en línea y en
// bloque, citas, listas con viñetas o numeradas (anidadas, y de tareas: - [x]), tablas, líneas horizontales,
// enlaces ([texto](https://…), <https://…>, direcciones sueltas y [texto][referencia]) y saltos de línea. Cada salto
// de línea cuenta, como en un chat: así se ven bien los documentos escritos a mano o sacados de una conversación.
//
// Seguridad: todo el texto sale escapado. El HTML que traiga el documento se enseña como texto (no se pasa), salvo
// <br> (salto de línea) y los comentarios <!-- … --> (no se ven). Los enlaces solo pueden ir a http, https, mailto o
// a un título del propio documento (#…); los de fuera se abren en una pestaña nueva.

const PUNTUACION_ASCII = /[!-/:-@[-`{-~]/;
const ESPACIO = /\s/u;
const PUNTUACION = /[\p{P}\p{S}]/u;

const CAMBIOS = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => CAMBIOS[c]);

// Como los de GitHub: minúsculas, sin signos, los espacios pasan a guiones («0. Cómo usar» → «0-cómo-usar»).
export function slug(texto) {
    return String(texto)
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
        .replace(/\s/g, "-")
        .slice(0, 120);
}

// ¿Adónde puede llevar un enlace? { href } (http, https o mailto), { ancla } (un título del documento) o null.
export function direccionSegura(url, prefijo = "doc-") {
    const limpia = String(url ?? "").replace(/[\u0000- \u007f-\u009f]/g, "");
    if (!limpia) return null;
    // Un enlace a un título del documento («#Tabla de cosas») puede llevar espacios: solo se quitan los caracteres de control.
    const conEspacios = String(url ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim();
    if (conEspacios.startsWith("#")) {
        let fragmento = conEspacios.slice(1);
        try {
            fragmento = decodeURIComponent(fragmento);
        } catch {
            /* se queda como está */
        }
        if (fragmento.startsWith(prefijo)) fragmento = fragmento.slice(prefijo.length);
        const s = slug(fragmento);
        return s ? { ancla: prefijo + s } : null;
    }
    let u;
    try {
        u = new URL(limpia);
    } catch {
        return null;
    }
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? { href: u.href } : null;
}

const ENTIDADES = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™", hellip: "…",
    mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", euro: "€",
    deg: "°", middot: "·", bull: "•", times: "×", divide: "÷", iexcl: "¡", iquest: "¿", aacute: "á", eacute: "é",
    iacute: "í", oacute: "ó", uacute: "ú", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
    ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü", ccedil: "ç", Ccedil: "Ç", ordf: "ª", ordm: "º", sect: "§",
    para: "¶", plusmn: "±", frac12: "½", frac14: "¼", frac34: "¾", larr: "←", rarr: "→", uarr: "↑", darr: "↓",
    harr: "↔", check: "✓", shy: "­", zwj: "‍", zwnj: "‌",
};

function entidad(s, i) {
    const m = /^&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/.exec(s.slice(i, i + 40));
    if (!m) return null;
    if (m[3]) return ENTIDADES[m[3]] === undefined ? null : { c: ENTIDADES[m[3]], largo: m[0].length };
    const n = m[1] ? parseInt(m[1], 10) : parseInt(m[2], 16);
    const c = n === 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff) ? "�" : String.fromCodePoint(n);
    return { c, largo: m[0].length };
}

function desescapar(s) {
    let salida = "";
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === "\\" && PUNTUACION_ASCII.test(s[i + 1] || "")) {
            salida += s[++i];
        } else if (c === "&") {
            const e = entidad(s, i);
            if (e) {
                salida += e.c;
                i += e.largo - 1;
            } else salida += c;
        } else salida += c;
    }
    return salida;
}

// ---------- bloques ----------

const RE = {
    atx: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/,
    hr: /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/,
    setext: /^ {0,3}(=+|-+)[ \t]*$/,
    valla: /^( {0,3})(`{3,}|~{3,})(.*)$/,
    cita: /^ {0,3}> ?(.*)$/,
    item: /^( {0,3})([-+*]|\d{1,9}[.)])(?:([ \t]+)(.*))?$/,
    tablaSep: /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/,
    definicion: /^ {0,3}\[((?:[^\]\\]|\\.){1,999})\]:[ \t]*(?:<([^>\n]*)>|(\S+))(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/,
    comentario: /^ {0,3}<!--/,
};

const vacia = (l) => /^[ \t]*$/.test(l);
const sangriaDe = (l) => /^ */.exec(l)[0].length;
// Los tabuladores del principio, a espacios (paradas de 4), para poder contar la sangría.
function expandir(linea) {
    const m = /^[ \t]+/.exec(linea);
    if (!m || !m[0].includes("\t")) return linea;
    let col = 0;
    for (const c of m[0]) col += c === "\t" ? 4 - (col % 4) : 1;
    return " ".repeat(col) + linea.slice(m[0].length);
}
const empiezaBloque = (l) => RE.atx.test(l) || RE.valla.test(l) || RE.cita.test(l) || RE.hr.test(l) || RE.item.test(l) || RE.comentario.test(l);
const normalizarEtiqueta = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();

function celdas(linea) {
    let s = linea.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
    const salida = [];
    let actual = "";
    for (let i = 0; i < s.length; i++) {
        if (s[i] === "\\" && s[i + 1] === "|") {
            actual += "|";
            i++;
        } else if (s[i] === "|") {
            salida.push(actual.trim());
            actual = "";
        } else actual += s[i];
    }
    salida.push(actual.trim());
    return salida.slice(0, 100);
}

function parsearBloques(crudas, ctx) {
    const lineas = crudas.map(expandir);
    const bloques = [];
    const n = lineas.length;
    let parrafo = null;
    let vaciaTras = false;
    const cerrar = () => {
        if (parrafo) bloques.push({ t: "p", texto: parrafo.join("\n") });
        parrafo = null;
    };
    let i = 0;
    while (i < n) {
        const linea = lineas[i];
        if (vacia(linea)) {
            cerrar();
            if (bloques.length) vaciaTras = true;
            i++;
            continue;
        }
        if (vaciaTras && !parrafo) bloques.separados = true;
        vaciaTras = false;
        const sangria = sangriaDe(linea);
        if (sangria >= 4 && !parrafo) {
            const codigo = [];
            while (i < n && (vacia(lineas[i]) || sangriaDe(lineas[i]) >= 4)) codigo.push(lineas[i++].slice(4));
            while (codigo.length && vacia(codigo.at(-1))) codigo.pop();
            bloques.push({ t: "codigo", texto: codigo.join("\n"), lenguaje: "" });
            continue;
        }
        let m;
        if (sangria < 4) {
            if ((m = RE.valla.exec(linea)) && !(m[2][0] === "`" && m[3].includes("`"))) {
                cerrar();
                const [, sang, valla, info] = m;
                const cierre = new RegExp(`^ {0,3}${valla[0] === "`" ? "`" : "~"}{${valla.length},}[ \\t]*$`);
                const codigo = [];
                i++;
                while (i < n && !cierre.test(lineas[i])) {
                    const l = lineas[i++];
                    codigo.push(l.slice(Math.min(sang.length, sangriaDe(l))));
                }
                i++;
                bloques.push({ t: "codigo", texto: codigo.join("\n"), lenguaje: (/^[\w+#.-]{1,20}/.exec(desescapar(info.trim())) || [""])[0] });
                continue;
            }
            if ((m = RE.atx.exec(linea))) {
                cerrar();
                bloques.push({ t: "titulo", nivel: m[1].length, texto: (m[2] || "").trim() });
                i++;
                continue;
            }
            if (parrafo && (m = RE.setext.exec(linea))) {
                bloques.push({ t: "titulo", nivel: m[1][0] === "=" ? 1 : 2, texto: parrafo.join("\n").trim() });
                parrafo = null;
                i++;
                continue;
            }
            if (RE.hr.test(linea)) {
                cerrar();
                bloques.push({ t: "hr" });
                i++;
                continue;
            }
            if (RE.comentario.test(linea)) {
                cerrar();
                while (i < n && !lineas[i].includes("-->")) i++;
                i++;
                continue;
            }
            if (RE.cita.test(linea)) {
                cerrar();
                const dentro = [];
                while (i < n) {
                    const l = lineas[i];
                    const mc = RE.cita.exec(l);
                    if (mc) dentro.push(mc[1]);
                    else if (!vacia(l) && dentro.length && !vacia(dentro.at(-1)) && !empiezaBloque(l)) dentro.push(l);
                    else break;
                    i++;
                }
                bloques.push({ t: "cita", hijos: parsearBloques(dentro, ctx) });
                continue;
            }
            if ((m = RE.item.exec(linea))) {
                // Una lista puede cortar un párrafo si el elemento tiene algo escrito (y, si va numerada, empieza por 1).
                const puede = !parrafo || (Boolean((m[4] || "").trim()) && (!/\d/.test(m[2]) || parseInt(m[2], 10) === 1));
                if (puede) {
                    cerrar();
                    const r = parsearLista(lineas, i, ctx);
                    bloques.push(r.bloque);
                    i = r.siguiente;
                    continue;
                }
            }
            if (linea.includes("|") && i + 1 < n && RE.tablaSep.test(lineas[i + 1])) {
                const cabecera = celdas(linea);
                const separador = celdas(lineas[i + 1]);
                if (cabecera.length === separador.length) {
                    cerrar();
                    const alineaciones = separador.map((c) => {
                        const izq = c.startsWith(":");
                        const der = c.endsWith(":");
                        return izq && der ? "centro" : der ? "der" : izq ? "izq" : "";
                    });
                    i += 2;
                    const filas = [];
                    while (i < n && !vacia(lineas[i]) && !empiezaBloque(lineas[i])) filas.push(celdas(lineas[i++]));
                    bloques.push({ t: "tabla", cabecera, alineaciones, filas });
                    continue;
                }
            }
            if (!parrafo && (m = RE.definicion.exec(linea))) {
                const etiqueta = normalizarEtiqueta(m[1]);
                if (!ctx.referencias.has(etiqueta)) ctx.referencias.set(etiqueta, desescapar(m[2] ?? m[3]));
                i++;
                continue;
            }
        }
        const contenido = linea.replace(/^[ \t]+/, "");
        if (parrafo) parrafo.push(contenido);
        else parrafo = [contenido];
        i++;
    }
    cerrar();
    return bloques;
}

function parsearLista(lineas, inicio, ctx) {
    const n = lineas.length;
    const primero = RE.item.exec(lineas[inicio]);
    const ordenada = /\d/.test(primero[2]);
    const marca = (m) => (/\d/.test(m[2]) ? m[2].slice(-1) : m[2]);
    const tipo = marca(primero);
    const empieza = ordenada ? Math.min(999999999, parseInt(primero[2], 10)) : 1;
    const items = [];
    let suelta = false;
    let i = inicio;
    const mismaLista = (l) => {
        const m = RE.item.exec(l);
        return Boolean(m) && !RE.hr.test(l) && /\d/.test(m[2]) === ordenada && marca(m) === tipo;
    };
    while (i < n && mismaLista(lineas[i])) {
        const m = RE.item.exec(lineas[i]);
        let espacios = m[3] ? m[3].length : 1;
        let primera = m[4] ?? "";
        if (m[3] && vacia(primera)) {
            espacios = 1;
            primera = "";
        } else if (espacios > 4) {
            primera = " ".repeat(espacios - 1) + primera;
            espacios = 1;
        }
        const ancho = m[1].length + m[2].length + espacios;
        const contenido = [primera];
        i++;
        let vaciaPendiente = false;
        while (i < n) {
            const l = lineas[i];
            if (vacia(l)) {
                if (contenido.length === 1 && !contenido[0]) break; // un elemento vacío no sigue tras una línea en blanco
                contenido.push("");
                vaciaPendiente = true;
                i++;
                continue;
            }
            if (sangriaDe(l) >= ancho) {
                contenido.push(l.slice(ancho));
                vaciaPendiente = false;
                i++;
                continue;
            }
            if (vaciaPendiente) break;
            // Línea «perezosa»: sigue el párrafo del elemento aunque no lleve sangría.
            const ultima = contenido.at(-1);
            if (!empiezaBloque(l) && !vacia(ultima) && !RE.valla.test(ultima) && !RE.atx.test(ultima) && sangriaDe(ultima) < 4) {
                contenido.push(l.replace(/^[ \t]+/, ""));
                i++;
                continue;
            }
            break;
        }
        let finales = 0;
        while (contenido.length > 1 && vacia(contenido.at(-1))) {
            contenido.pop();
            finales++;
        }
        const hijos = parsearBloques(contenido, ctx);
        if (hijos.separados) suelta = true;
        let tarea = null;
        if (hijos[0]?.t === "p") {
            const mt = /^\[([ xX])\][ \t]+(?=\S)/.exec(hijos[0].texto);
            if (mt) {
                tarea = mt[1] !== " ";
                hijos[0].texto = hijos[0].texto.slice(mt[0].length);
            }
        }
        items.push({ hijos, tarea });
        if (finales) {
            if (i < n && mismaLista(lineas[i])) suelta = true;
            else break;
        }
    }
    return { bloque: { t: "lista", ordenada, empieza, suelta, items }, siguiente: i };
}

// ---------- en línea ----------

function recortarDireccion(url) {
    let u = url;
    for (;;) {
        const antes = u;
        u = u.replace(/[?!.,:*_~'"]+$/, "");
        if (u.endsWith(")") && (u.match(/\)/g) || []).length > (u.match(/\(/g) || []).length) u = u.slice(0, -1);
        u = u.replace(/&[A-Za-z0-9]+;$/, "");
        if (u === antes) return u;
    }
}

function leerDestino(s, j) {
    if (s[j] !== "(") return null;
    const n = s.length;
    let i = j + 1;
    while (i < n && /[ \t\n]/.test(s[i])) i++;
    let url;
    if (s[i] === "<") {
        const f = s.indexOf(">", i + 1);
        if (f < 0) return null;
        url = s.slice(i + 1, f);
        if (/[\n<]/.test(url)) return null;
        i = f + 1;
    } else {
        const desde = i;
        let profundidad = 0;
        while (i < n) {
            const c = s[i];
            if (c === "\\" && PUNTUACION_ASCII.test(s[i + 1] || "")) {
                i += 2;
                continue;
            }
            if (c === "(") profundidad++;
            else if (c === ")") {
                if (profundidad === 0) break;
                profundidad--;
            } else if (/[\s\u0000-\u001f]/.test(c)) break;
            i++;
        }
        url = s.slice(desde, i);
    }
    const antesDelTitulo = i;
    while (i < n && /[ \t\n]/.test(s[i])) i++;
    if (i < n && i > antesDelTitulo && (s[i] === '"' || s[i] === "'" || s[i] === "(")) {
        const cierre = s[i] === "(" ? ")" : s[i];
        let k = i + 1;
        while (k < n && s[k] !== cierre) k += s[k] === "\\" ? 2 : 1;
        if (k >= n) return null;
        i = k + 1;
        while (i < n && /[ \t\n]/.test(s[i])) i++;
    }
    if (s[i] !== ")") return null;
    return { url: desescapar(url), fin: i + 1 };
}

const ESPECIAL = /[\\`*_~[\]!<\n&hHwW]/g;

function analizarLinea(s, ctx) {
    const nodos = [];
    let buffer = "";
    const volcar = () => {
        if (buffer) nodos.push({ t: "texto", v: buffer });
        buffer = "";
    };
    const salto = () => {
        buffer = buffer.replace(/[ \t]+$/, "");
        volcar();
        const ultimo = nodos.at(-1);
        if (ultimo?.t === "texto") ultimo.v = ultimo.v.replace(/[ \t]+$/, "");
        nodos.push({ t: "br" });
    };
    const n = s.length;
    let i = 0;
    while (i < n) {
        ESPECIAL.lastIndex = i;
        const m = ESPECIAL.exec(s);
        const siguiente = m ? m.index : n;
        if (siguiente > i) {
            buffer += s.slice(i, siguiente);
            i = siguiente;
            continue;
        }
        const c = s[i];
        if (c === "\\") {
            const sig = s[i + 1];
            if (sig === "\n") {
                salto();
                i += 2;
                while (i < n && (s[i] === " " || s[i] === "\t")) i++;
            } else if (sig !== undefined && PUNTUACION_ASCII.test(sig)) {
                buffer += sig;
                i += 2;
            } else {
                buffer += c;
                i++;
            }
            continue;
        }
        if (c === "`") {
            let k = i;
            while (k < n && s[k] === "`") k++;
            const largo = k - i;
            let cierre = -1;
            for (let j = k; j < n; ) {
                const p = s.indexOf("`", j);
                if (p < 0) break;
                let q = p;
                while (q < n && s[q] === "`") q++;
                if (q - p === largo) {
                    cierre = p;
                    break;
                }
                j = q;
            }
            if (cierre < 0) {
                buffer += s.slice(i, k);
                i = k;
                continue;
            }
            let codigo = s.slice(k, cierre).replace(/\n/g, " ");
            if (/^ [\s\S]*[^ ][\s\S]* $/.test(codigo)) codigo = codigo.slice(1, -1);
            volcar();
            nodos.push({ t: "codigo", v: codigo });
            i = cierre + largo;
            continue;
        }
        if (c === "*" || c === "_" || c === "~") {
            let k = i;
            while (k < n && s[k] === c) k++;
            const largo = k - i;
            if (c === "~" && largo !== 2) {
                buffer += s.slice(i, k);
                i = k;
                continue;
            }
            const antes = i > 0 ? s[i - 1] : " ";
            const despues = k < n ? s[k] : " ";
            const izquierda = !ESPACIO.test(despues) && (!PUNTUACION.test(despues) || ESPACIO.test(antes) || PUNTUACION.test(antes));
            const derecha = !ESPACIO.test(antes) && (!PUNTUACION.test(antes) || ESPACIO.test(despues) || PUNTUACION.test(despues));
            let abre = izquierda;
            let cierra = derecha;
            if (c === "_") {
                abre = izquierda && (!derecha || PUNTUACION.test(antes));
                cierra = derecha && (!izquierda || PUNTUACION.test(despues));
            }
            volcar();
            nodos.push({ t: "delim", c, n: largo, original: largo, abre, cierra });
            i = k;
            continue;
        }
        if (c === "!" && s[i + 1] === "[") {
            volcar();
            nodos.push({ t: "abre", imagen: true, activo: true, desde: i + 2 });
            i += 2;
            continue;
        }
        if (c === "[") {
            volcar();
            nodos.push({ t: "abre", imagen: false, activo: true, desde: i + 1 });
            i++;
            continue;
        }
        if (c === "]") {
            volcar();
            let k = nodos.length - 1;
            while (k >= 0 && nodos[k].t !== "abre") k--;
            if (k < 0) {
                buffer += "]";
                i++;
                continue;
            }
            const abre = nodos[k];
            if (!abre.activo) {
                nodos[k] = { t: "texto", v: abre.imagen ? "![" : "[" };
                buffer += "]";
                i++;
                continue;
            }
            let destino = null;
            let fin = -1;
            const enLinea = leerDestino(s, i + 1);
            if (enLinea) {
                destino = enLinea.url;
                fin = enLinea.fin;
            } else {
                const mr = /^\[((?:[^\]\\]|\\.){0,999})\]/.exec(s.slice(i + 1, i + 1003));
                const etiqueta = mr && mr[1].trim() ? mr[1] : s.slice(abre.desde, i);
                const ref = ctx.referencias.get(normalizarEtiqueta(etiqueta));
                if (ref !== undefined) {
                    destino = ref;
                    fin = mr ? i + 1 + mr[0].length : i + 1;
                }
            }
            if (fin < 0) {
                nodos[k] = { t: "texto", v: abre.imagen ? "![" : "[" };
                buffer += "]";
                i++;
                continue;
            }
            const dentro = nodos.splice(k + 1);
            nodos.pop();
            procesarEnfasis(dentro);
            nodos.push({ t: abre.imagen ? "imagen" : "enlace", destino, hijos: dentro });
            if (!abre.imagen) for (const x of nodos) if (x.t === "abre" && !x.imagen) x.activo = false;
            i = fin;
            continue;
        }
        if (c === "<") {
            if (s.startsWith("<!--", i)) {
                const f = s.indexOf("-->", i + 4);
                if (f >= 0) {
                    i = f + 3;
                    continue;
                }
            }
            const resto = s.slice(i, i + 2100);
            let ma;
            if ((ma = /^<br\s*\/?>/i.exec(resto))) {
                salto();
                i += ma[0].length;
                continue;
            }
            if ((ma = /^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*)>/.exec(resto))) {
                volcar();
                nodos.push({ t: "auto", destino: ma[1], texto: ma[1] });
                i += ma[0].length;
                continue;
            }
            if ((ma = /^<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)>/.exec(resto))) {
                volcar();
                nodos.push({ t: "auto", destino: `mailto:${ma[1]}`, texto: ma[1] });
                i += ma[0].length;
                continue;
            }
            buffer += c;
            i++;
            continue;
        }
        if (c === "\n") {
            salto();
            i++;
            while (i < n && (s[i] === " " || s[i] === "\t")) i++;
            continue;
        }
        if (c === "&") {
            const e = entidad(s, i);
            if (e) {
                buffer += e.c;
                i += e.largo;
            } else {
                buffer += c;
                i++;
            }
            continue;
        }
        if (c === "h" || c === "H" || c === "w" || c === "W") {
            const cuatro = s.slice(i, i + 4).toLowerCase();
            if ((cuatro === "http" || cuatro === "www.") && (i === 0 || /[\s*_~(]/.test(s[i - 1]))) {
                const ma = /^(?:https?:\/\/|www\.)[^\s<]*/i.exec(s.slice(i, i + 2100));
                if (ma) {
                    const url = recortarDireccion(ma[0]);
                    const destino = /^www\./i.test(url) ? `https://${url}` : url;
                    let valida = false;
                    try {
                        valida = Boolean(new URL(destino).hostname) && url.length > (url.startsWith("w") || url.startsWith("W") ? 4 : 8);
                    } catch {
                        valida = false;
                    }
                    if (valida) {
                        volcar();
                        nodos.push({ t: "auto", destino, texto: url });
                        i += url.length;
                        continue;
                    }
                }
            }
            buffer += c;
            i++;
            continue;
        }
        buffer += c;
        i++;
    }
    volcar();
    procesarEnfasis(nodos);
    return nodos;
}

// Negritas, cursivas y tachados, con las reglas de CommonMark (qué asteriscos abren y cuáles cierran).
function procesarEnfasis(nodos) {
    let i = 0;
    while (i < nodos.length) {
        const cierre = nodos[i];
        if (cierre.t !== "delim" || !cierre.cierra) {
            i++;
            continue;
        }
        let k = i - 1;
        let encontrado = -1;
        for (; k >= 0; k--) {
            const a = nodos[k];
            if (a.t !== "delim" || a.c !== cierre.c || !a.abre) continue;
            if (cierre.c === "~") {
                if (a.n === cierre.n) {
                    encontrado = k;
                    break;
                }
                continue;
            }
            const ambiguo = (a.abre && a.cierra) || (cierre.abre && cierre.cierra);
            if (ambiguo && (a.original + cierre.original) % 3 === 0 && !(a.original % 3 === 0 && cierre.original % 3 === 0)) continue;
            encontrado = k;
            break;
        }
        if (encontrado < 0) {
            if (!cierre.abre) nodos[i] = { t: "texto", v: cierre.c.repeat(cierre.n) };
            i++;
            continue;
        }
        const a = nodos[encontrado];
        const usar = cierre.c === "~" ? 2 : a.n >= 2 && cierre.n >= 2 ? 2 : 1;
        const etiqueta = cierre.c === "~" ? "del" : usar === 2 ? "strong" : "em";
        const dentro = nodos.slice(encontrado + 1, i).map((x) => (x.t === "delim" ? { t: "texto", v: x.c.repeat(x.n) } : x));
        a.n -= usar;
        cierre.n -= usar;
        nodos.splice(encontrado + 1, i - encontrado - 1, { t: etiqueta, hijos: dentro });
        i = encontrado + 2;
        if (a.n === 0) {
            nodos.splice(encontrado, 1);
            i--;
        }
        if (cierre.n === 0) nodos.splice(i, 1);
    }
    for (let j = 0; j < nodos.length; j++) if (nodos[j].t === "delim") nodos[j] = { t: "texto", v: nodos[j].c.repeat(nodos[j].n) };
}

function aTexto(nodos) {
    let s = "";
    for (const x of nodos) {
        if (x.t === "texto" || x.t === "codigo") s += x.v;
        else if (x.t === "br") s += " ";
        else if (x.t === "auto") s += x.texto;
        else if (x.t === "abre") s += x.imagen ? "![" : "[";
        else if (x.hijos) s += aTexto(x.hijos);
    }
    return s;
}

function enlaceHtml(d, dentro) {
    if (d.ancla) return `<a href="#${escapar(d.ancla)}" class="ancla">${dentro}</a>`;
    return `<a href="${escapar(d.href)}" target="_blank" rel="noopener noreferrer">${dentro}</a>`;
}

function aHtml(nodos, ctx, enEnlace = false) {
    let html = "";
    for (const x of nodos) {
        switch (x.t) {
            case "texto":
                html += escapar(x.v);
                break;
            case "codigo":
                html += `<code>${escapar(x.v)}</code>`;
                break;
            case "br":
                html += "<br>";
                break;
            case "em":
            case "strong":
            case "del":
                html += `<${x.t}>${aHtml(x.hijos, ctx, enEnlace)}</${x.t}>`;
                break;
            case "abre":
                html += x.imagen ? "![" : "[";
                break;
            case "auto": {
                const d = enEnlace ? null : direccionSegura(x.destino, ctx.prefijo);
                html += d && !d.ancla ? enlaceHtml(d, escapar(x.texto)) : escapar(x.texto);
                break;
            }
            case "enlace": {
                const d = enEnlace ? null : direccionSegura(x.destino, ctx.prefijo);
                const dentro = aHtml(x.hijos, ctx, true);
                html += d ? enlaceHtml(d, dentro) : dentro;
                break;
            }
            case "imagen": {
                const d = enEnlace ? null : direccionSegura(x.destino, ctx.prefijo);
                const marca = `<span class="imagen-md">${escapar(aTexto(x.hijos).trim() || "imagen")}</span>`;
                html += d && !d.ancla ? enlaceHtml(d, marca) : marca;
                break;
            }
            default:
                break;
        }
    }
    return html;
}

function renderBloques(bloques, ctx, apretada = false, delante = "") {
    let html = "";
    bloques.forEach((b, indice) => {
        const prefijo = indice === 0 ? delante : "";
        switch (b.t) {
            case "p": {
                const dentro = prefijo + aHtml(analizarLinea(b.texto, ctx), ctx);
                html += apretada ? dentro : `<p>${dentro}</p>`;
                break;
            }
            case "titulo": {
                const nodos = analizarLinea(b.texto, ctx);
                const texto = aTexto(nodos).replace(/\s+/g, " ").trim();
                const base = slug(texto) || "seccion";
                let id = base;
                for (let k = 1; ctx.ids.has(id); k++) id = `${base}-${k}`;
                ctx.ids.add(id);
                const completo = ctx.prefijo + id;
                ctx.titulos.push({ nivel: b.nivel, texto, id: completo });
                const etiqueta = `h${Math.min(6, b.nivel + 1)}`;
                html += `${prefijo}<${etiqueta} id="${escapar(completo)}" class="t${b.nivel}" tabindex="-1">${aHtml(nodos, ctx)}</${etiqueta}>`;
                break;
            }
            case "codigo":
                html += `${prefijo}<pre class="codigo" tabindex="0"${b.lenguaje ? ` data-lenguaje="${escapar(b.lenguaje)}"` : ""}><code>${escapar(b.texto)}</code></pre>`;
                break;
            case "hr":
                html += `${prefijo}<hr>`;
                break;
            case "cita":
                html += `${prefijo}<blockquote>${renderBloques(b.hijos, ctx)}</blockquote>`;
                break;
            case "lista": {
                const etiqueta = b.ordenada ? "ol" : "ul";
                const tareas = b.items.some((it) => it.tarea !== null);
                html += `${prefijo}<${etiqueta}${b.ordenada && b.empieza !== 1 ? ` start="${b.empieza}"` : ""}${tareas ? ' class="tareas"' : ""}>`;
                for (const it of b.items) {
                    const casilla = it.tarea === null ? "" : `<input type="checkbox" disabled${it.tarea ? " checked" : ""}> `;
                    const dentro = renderBloques(it.hijos, ctx, !b.suelta, casilla);
                    html += `<li${it.tarea === null ? "" : ' class="tarea"'}>${it.hijos.length ? dentro : casilla}</li>`;
                }
                html += `</${etiqueta}>`;
                break;
            }
            case "tabla": {
                const columnas = b.cabecera.length;
                const al = (k) => (b.alineaciones[k] ? ` class="al-${b.alineaciones[k]}"` : "");
                html += `${prefijo}<div class="tabla-doc" tabindex="0"><table><thead><tr>`;
                b.cabecera.forEach((c, k) => {
                    html += `<th${al(k)}>${aHtml(analizarLinea(c, ctx), ctx)}</th>`;
                });
                html += "</tr></thead>";
                if (b.filas.length) {
                    html += "<tbody>";
                    for (const fila of b.filas) {
                        html += "<tr>";
                        for (let k = 0; k < columnas; k++) html += `<td${al(k)}>${aHtml(analizarLinea(fila[k] ?? "", ctx), ctx)}</td>`;
                        html += "</tr>";
                    }
                    html += "</tbody>";
                }
                html += "</table></div>";
                break;
            }
            default:
                break;
        }
    });
    return html;
}

// Devuelve { html, titulos: [{ nivel, texto, id }] }. Los títulos van un nivel por debajo (# → <h2 class="t1">),
// porque el <h1> de la página es el nombre del documento; «class» guarda el nivel que tenían.
export function markdownAHtml(texto, { prefijo = "doc-" } = {}) {
    const ctx = { prefijo, referencias: new Map(), ids: new Set(), titulos: [] };
    const lineas = String(texto ?? "")
        .replace(/^﻿/, "")
        .replace(/\r\n?/g, "\n")
        .replace(/\u0000/g, "�")
        .split("\n");
    const bloques = parsearBloques(lineas, ctx);
    return { html: renderBloques(bloques, ctx), titulos: ctx.titulos };
}
