// Archivo de documentos de la oficina (la sala ARCHIVO): Markdown, PDF, fotos, textos, Word y enlaces (Google
// Docs, Hojas, Presentaciones, Drive…). Lo ve y lo toca todo el crew; principal.js le pasa aquí lo de
// /tareas/api/archivo… cuando ya ha comprobado la sesión y la cabecera propia del tablón.
//
// Se guarda en la carpeta de datos, en archivo/:
//   indice.json          la lista de documentos (título, descripción, carpeta, quién, cuándo…); copia diaria en
//                        archivo/copias/ (se guardan 30) y la anterior en indice.json.anterior
//   archivos/<id>.<ext>  el archivo tal cual se subió (el nombre en disco lo pone el servidor, nunca quien sube)
//   archivos/<id>.html   el Word ya pasado a HTML (servidor/docx.js)
// Lo borrado pasa 30 días en la papelera y luego se borra de verdad, con su archivo.
//
// Al subir, el tipo sale de la extensión y se comprueba con lo que hay dentro (las primeras letras de un PDF o
// de una foto, que el Word sea un zip con su documento, que un texto sea texto): si no cuadra, no entra.

import fs from "node:fs";
import path from "node:path";
import { ErrorDeDatos, nuevoId } from "./tareas.js";
import { docxAHtml, ErrorDocx } from "./docx.js";

const MB = 1024 * 1024;
export const MAXIMO_ARCHIVO = 25 * MB;
export const MAXIMO_TEXTO = 5 * MB;
const LIMITES = { documentos: 3000, titulo: 200, descripcion: 2000, carpeta: 60, nombre: 150, url: 2000, consulta: 200 };
const COPIAS_MAXIMAS = 30;

// Lo que se puede subir, por extensión.
const EXTENSIONES = {
    md: "md",
    markdown: "md",
    mdown: "md",
    mkd: "md",
    txt: "txt",
    text: "txt",
    pdf: "pdf",
    docx: "docx",
    png: "imagen",
    jpg: "imagen",
    jpeg: "imagen",
    webp: "imagen",
    gif: "imagen",
};
const ADMITIDOS = "Markdown (.md), PDF, fotos (PNG, JPG, WebP o GIF), textos (.txt) y Word (.docx)";
const MIME = {
    md: "text/markdown",
    txt: "text/plain",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// Firmas: cómo empiezan por dentro.
const FOTOS = [
    { ext: "png", mime: "image/png", firma: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    { ext: "jpg", mime: "image/jpeg", firma: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { ext: "webp", mime: "image/webp", firma: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
    { ext: "gif", mime: "image/gif", firma: (b) => /^GIF8[79]a$/.test(b.subarray(0, 6).toString("latin1")) },
];
const esPdf = (b) => b.subarray(0, 5).toString("latin1") === "%PDF-";
const esZip = (b) => b.readUInt32LE(0) === 0x04034b50;
// Lo que seguro que no es texto aunque se llame .md o .txt.
const BINARIOS = [
    ["un PDF", esPdf],
    ["una foto", (b) => FOTOS.some((f) => f.firma(b))],
    ["un archivo comprimido (zip, Word, Excel…)", esZip],
    ["un programa", (b) => b.subarray(0, 4).toString("latin1") === "\x7fELF"],
];

const GOOGLE = [
    { re: /^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([\w-]{10,})/, servicio: "Google Docs", incrustar: (id) => `https://docs.google.com/document/d/${id}/preview` },
    { re: /^https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([\w-]{10,})/, servicio: "Hojas de Google", incrustar: (id) => `https://docs.google.com/spreadsheets/d/${id}/preview` },
    { re: /^https:\/\/docs\.google\.com\/presentation\/(?:u\/\d+\/)?d\/([\w-]{10,})/, servicio: "Presentaciones de Google", incrustar: (id) => `https://docs.google.com/presentation/d/${id}/preview` },
    { re: /^https:\/\/drive\.google\.com\/file\/(?:u\/\d+\/)?d\/([\w-]{10,})/, servicio: "Google Drive", incrustar: (id) => `https://drive.google.com/file/d/${id}/preview` },
    { re: /^https:\/\/drive\.google\.com\/(?:u\/\d+\/)?open\?(?:.*&)?id=([\w-]{10,})/, servicio: "Google Drive", incrustar: (id) => `https://drive.google.com/file/d/${id}/preview` },
    { re: /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]{10,})/, servicio: "Carpeta de Google Drive", incrustar: (id) => `https://drive.google.com/embeddedfolderview?id=${id}#list` },
];

// ---------- textos ----------

const unaLinea = (v, max) =>
    (typeof v === "string" ? v : "")
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
        .trim();
const variasLineas = (v, max) =>
    (typeof v === "string" ? v : "")
        .replace(/\r\n?/g, "\n")
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, max);

// Minúsculas y sin tildes, letra a letra (el texto sale igual de largo, para poder recortar el original).
const PLEGADAS = new Map();
export function plegar(s) {
    let salida = "";
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        const n = c.charCodeAt(0);
        if (n < 128) {
            salida += n >= 65 && n <= 90 ? String.fromCharCode(n + 32) : c;
            continue;
        }
        let p = PLEGADAS.get(c);
        if (p === undefined) {
            p = c.normalize("NFD")[0].toLowerCase()[0] || c;
            PLEGADAS.set(c, p);
        }
        salida += p;
    }
    return salida;
}

// Lo que se ve de un Markdown, sin sus marcas (para buscar y para los trozos de los resultados).
export function textoDeMarkdown(md) {
    return md
        .replace(/\r\n?/g, "\n")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/^ {0,3}(`{3,}|~{3,}).*$/gm, "")
        .replace(/^ {0,3}#{1,6}[ \t]+/gm, "")
        .replace(/^(?: {0,3}>[ \t]?)+/gm, "")
        .replace(/^[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, "")
        .replace(/^ {0,3}(?:[-*_][ \t]*){3,}$/gm, "")
        .replace(/^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/gm, "")
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/g, "$2")
        .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, "$1$2")
        .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1$2")
        .replace(/`+/g, "")
        .replace(/\|/g, " ")
        .replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

// El texto del Word ya convertido (para buscar), a partir de su HTML.
function textoDeHtml(html) {
    return html
        .replace(/<br>|<\/(?:p|h\d|li|tr)>/g, "\n")
        .replace(/<\/t[dh]>/g, " ")
        .replace(/<[^>]*>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");
}

// El primer título de un Markdown (# Título, o Título subrayado con ===), sin marcas.
export function primerTitulo(md) {
    const lineas = md.replace(/\r\n?/g, "\n").split("\n", 400);
    let enCodigo = false;
    let anterior = "";
    let otro = null;
    for (const linea of lineas) {
        if (/^ {0,3}(`{3,}|~{3,})/.test(linea)) enCodigo = !enCodigo;
        if (enCodigo) continue;
        const m = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(linea);
        let encontrado = null;
        if (m) encontrado = { nivel: m[1].length, texto: m[2] };
        else if (/^ {0,3}=+[ \t]*$/.test(linea) && anterior.trim()) encontrado = { nivel: 1, texto: anterior };
        if (encontrado) {
            const limpio = unaLinea(textoDeMarkdown(encontrado.texto), LIMITES.titulo);
            if (limpio && encontrado.nivel === 1) return limpio;
            if (limpio && !otro) otro = limpio;
        }
        anterior = linea;
    }
    return otro;
}

// UTF-8 (con o sin BOM), UTF-16 con BOM o, si no es UTF-8 válido, Windows-1252 (los .txt viejos de Windows).
function decodificar(buf, codificacion = null) {
    const probar = (nombre, datos, opciones) => {
        try {
            return new TextDecoder(nombre, opciones).decode(datos);
        } catch {
            return null;
        }
    };
    if (codificacion) {
        const sin = codificacion.startsWith("utf-16") ? buf.subarray(2) : buf;
        return { texto: probar(codificacion, sin) ?? buf.toString("latin1"), codificacion };
    }
    if (buf[0] === 0xff && buf[1] === 0xfe) return { texto: probar("utf-16le", buf.subarray(2)) ?? "", codificacion: "utf-16le" };
    if (buf[0] === 0xfe && buf[1] === 0xff) return { texto: probar("utf-16be", buf.subarray(2)) ?? "", codificacion: "utf-16be" };
    const utf8 = probar("utf-8", buf, { fatal: true });
    if (utf8 !== null) return { texto: utf8, codificacion: "utf-8" };
    const ventanas = probar("windows-1252", buf);
    if (ventanas !== null) return { texto: ventanas, codificacion: "windows-1252" };
    return { texto: buf.toString("latin1"), codificacion: "latin1" };
}

function pareceMarkdown(texto) {
    const muestra = texto.slice(0, 200000);
    if (/^ {0,3}#{1,6}[ \t]+\S/m.test(muestra) || /^ {0,3}(`{3,}|~{3,})/m.test(muestra) || /^\s*\|.+\|\s*$\n^\s*\|?\s*:?-{3,}/m.test(muestra)) return true;
    let marcas = 0;
    marcas += (muestra.match(/^[ \t]*[-*+][ \t]+\S/gm) || []).length;
    marcas += (muestra.match(/\*\*[^*\n]+\*\*/g) || []).length;
    marcas += (muestra.match(/\[[^\]\n]+\]\([^)\s]+\)/g) || []).length;
    return marcas >= 3;
}

// ---------- nombres y direcciones ----------

const extensionDe = (nombre) => /\.([a-z0-9]{1,10})$/i.exec(nombre)?.[1].toLowerCase() || "";

// El nombre con el que se subió, para enseñarlo y para la descarga: sin carpetas («../»), sin caracteres raros.
export function limpiarNombre(crudo) {
    let n = String(crudo || "")
        .split(/[\\/]/)
        .pop()
        .normalize("NFC")
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
        .replace(/[<>:"|?*]/g, "_")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^[.\s]+/, "")
        .replace(/[.\s]+$/, "");
    if (n.length > LIMITES.nombre) {
        const ext = extensionDe(n);
        n = ext ? `${n.slice(0, LIMITES.nombre - ext.length - 1).trim()}.${ext}` : n.slice(0, LIMITES.nombre).trim();
    }
    return n || "documento";
}

const tituloDeNombre = (nombre) => unaLinea(nombre.replace(/\.[a-z0-9]{1,10}$/i, "").replace(/_+/g, " "), LIMITES.titulo) || "Documento";

function disposicion(tipo, nombre) {
    const ascii = nombre.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    const codificado = encodeURIComponent(nombre).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `${tipo}; filename="${ascii}"; filename*=UTF-8''${codificado}`;
}

// Enlaces: solo https, sin usuario ni contraseña dentro. Los de Google se ven dentro con su vista previa.
export function enlaceValido(crudo) {
    let texto = String(crudo || "").trim();
    if (!texto) throw new ErrorDeDatos("Pon la dirección del enlace.");
    // «docs.google.com/…» sin el https:// delante: se le pone.
    if (!/^[a-z][\w+.-]*:/i.test(texto) && /^[\w-]+(\.[\w-]+)+(\/|$)/.test(texto)) texto = `https://${texto}`;
    if (texto.length > LIMITES.url) throw new ErrorDeDatos("Esa dirección es demasiado larga.");
    let u;
    try {
        u = new URL(texto);
    } catch {
        throw new ErrorDeDatos("Esa dirección no parece válida (tiene que empezar por https://).");
    }
    if (u.protocol !== "https:") throw new ErrorDeDatos("Solo se pueden guardar enlaces que empiecen por https://.");
    if (u.username || u.password) throw new ErrorDeDatos("El enlace no puede llevar usuario ni contraseña.");
    const url = u.href;
    for (const g of GOOGLE) {
        const m = g.re.exec(url);
        if (m) return { url, servicio: g.servicio, incrustar: g.incrustar(m[1]) };
    }
    return { url, servicio: null, incrustar: null };
}

// ---------- HTTP (lo justo; el resto lo hace principal.js) ----------

function json(res, estado, cuerpo) {
    res.writeHead(estado, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(cuerpo));
}

// Lee lo que se sube. Si se pasa del límite, se contesta enseguida y Node tira el resto sin cortar la conexión.
function leerSubida(req, limite) {
    return new Promise((resolver, rechazar) => {
        const trozos = [];
        let total = 0;
        let pasado = false;
        req.on("data", (t) => {
            if (pasado) return;
            total += t.length;
            if (total > limite) {
                pasado = true;
                trozos.length = 0;
                rechazar(Object.assign(new ErrorDeDatos("Ese archivo es demasiado grande: como mucho 25 MB."), { estado: 413 }));
                return;
            }
            trozos.push(t);
        });
        req.on("end", () => {
            if (!pasado) resolver(Buffer.concat(trozos, total));
        });
        req.on("error", rechazar);
    });
}

async function leerJson(req) {
    const buf = await leerSubida(req, 256 * 1024);
    if (!buf.length) return {};
    try {
        const v = JSON.parse(buf.toString("utf8"));
        return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch {
        throw new ErrorDeDatos("Petición mal formada");
    }
}

const cabeceraTexto = (req, nombre) => {
    const v = req.headers[nombre];
    if (typeof v !== "string" || !v) return "";
    try {
        return decodeURIComponent(v);
    } catch {
        return "";
    }
};

// ---------- el archivo ----------

export function abrirArchivo(carpetaDatos, { emitir = () => {}, maximoTotal = 1024 * MB } = {}) {
    const carpeta = path.join(carpetaDatos, "archivo");
    const carpetaArchivos = path.join(carpeta, "archivos");
    const carpetaCopias = path.join(carpeta, "copias");
    const indice = path.join(carpeta, "indice.json");
    fs.mkdirSync(carpetaArchivos, { recursive: true });
    fs.mkdirSync(carpetaCopias, { recursive: true });

    let datos = null;
    const candidatos = [indice, `${indice}.anterior`];
    try {
        for (const c of fs.readdirSync(carpetaCopias).filter((n) => /^indice-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse()) candidatos.push(path.join(carpetaCopias, c));
    } catch {
        /* sin copias */
    }
    for (const candidato of candidatos) {
        if (!fs.existsSync(candidato)) continue;
        try {
            const leido = JSON.parse(fs.readFileSync(candidato, "utf8"));
            if (Array.isArray(leido.documentos)) {
                datos = leido;
                if (candidato !== indice) console.error(`[archivo] indice.json no se podía leer: recuperado de ${path.basename(candidato)}.`);
                break;
            }
        } catch (error) {
            console.error(`[archivo] ${path.basename(candidato)} no se puede leer (${error.message}).`);
        }
    }
    if (!datos) datos = { version: 1, documentos: [] };

    // ---------- guardar ----------

    let temporizador = null;
    let ultimaAnterior = 0;
    function guardarYa() {
        clearTimeout(temporizador);
        temporizador = null;
        if (fs.existsSync(indice)) {
            try {
                const hoy = new Date().toISOString().slice(0, 10);
                const copia = path.join(carpetaCopias, `indice-${hoy}.json`);
                if (!fs.existsSync(copia)) {
                    fs.copyFileSync(indice, copia);
                    const viejas = fs.readdirSync(carpetaCopias).filter((n) => /^indice-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
                    for (const n of viejas.slice(0, Math.max(0, viejas.length - COPIAS_MAXIMAS))) fs.rmSync(path.join(carpetaCopias, n), { force: true });
                }
                if (Date.now() - ultimaAnterior > 3600 * 1000) {
                    fs.copyFileSync(indice, `${indice}.anterior`);
                    ultimaAnterior = Date.now();
                }
            } catch (error) {
                console.error("[archivo] No se ha podido hacer la copia:", error.message);
            }
        }
        escribirSeguro(indice, JSON.stringify(datos));
    }
    function guardar() {
        if (temporizador) return;
        temporizador = setTimeout(() => {
            try {
                guardarYa();
            } catch (error) {
                console.error("[archivo] Error al guardar:", error);
            }
        }, 150);
    }
    // Primero a un temporal y luego se cambia el nombre: nunca queda un archivo a medias.
    function escribirSeguro(destino, contenido) {
        const temporal = `${destino}.tmp`;
        const fd = fs.openSync(temporal, "w");
        try {
            fs.writeSync(fd, contenido);
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
        fs.renameSync(temporal, destino);
    }

    // ---------- textos para buscar ----------

    const rutaDe = (d, ext = d.ext) => {
        const nombre = `${d.id}.${ext}`;
        if (!/^[\w-]{6,24}\.(md|txt|pdf|png|jpg|webp|gif|docx|html)$/.test(nombre)) throw new Error("Nombre de archivo no válido");
        return path.join(carpetaArchivos, nombre);
    };
    const textos = new Map(); // id → { plano, plegado }
    function prepararTexto(d, texto) {
        if (texto === null || texto === undefined) return;
        const plano = d.tipo === "md" ? textoDeMarkdown(texto) : texto;
        textos.set(d.id, { plano, plegado: plegar(plano) });
    }
    function leerContenido(d) {
        if (d.tipo === "md" || d.tipo === "txt") return { texto: decodificar(fs.readFileSync(rutaDe(d)), d.codificacion).texto };
        if (d.tipo === "docx") return { html: fs.readFileSync(rutaDe(d, "html"), "utf8") };
        return {};
    }
    for (const d of datos.documentos) {
        try {
            if (d.tipo === "md" || d.tipo === "txt") prepararTexto(d, leerContenido(d).texto);
            else if (d.tipo === "docx") prepararTexto(d, textoDeHtml(leerContenido(d).html));
        } catch (error) {
            console.error(`[archivo] No se puede leer el texto de ${d.id}: ${error.message}`);
        }
    }

    // ---------- piezas ----------

    const vivos = () => datos.documentos.filter((d) => !d.borrado);
    // Lo que ocupan los documentos (lo de la papelera no cuenta: se va solo a los 30 días o se borra del todo).
    const usado = () => vivos().reduce((s, d) => s + (d.tamano || 0), 0);
    const buscarDoc = (id) => datos.documentos.find((d) => d.id === id) || null;

    // Si ya hay una carpeta que se escribe igual (sin contar mayúsculas ni tildes), se usa esa.
    function limpiarCarpeta(v) {
        const c = unaLinea(v, LIMITES.carpeta);
        if (!c) return "";
        const igual = datos.documentos.find((d) => d.carpeta && plegar(d.carpeta) === plegar(c));
        return igual ? igual.carpeta : c;
    }

    function publico(d) {
        const p = {
            id: d.id,
            tipo: d.tipo,
            titulo: d.titulo,
            descripcion: d.descripcion,
            carpeta: d.carpeta,
            fijado: Boolean(d.fijado),
            autor: d.autor,
            creado: d.creado,
            actualizado: d.actualizado,
            actualizadoPor: d.actualizadoPor,
        };
        if (d.tipo === "enlace") Object.assign(p, { url: d.url, servicio: d.servicio, incrustar: d.incrustar });
        else Object.assign(p, { nombre: d.nombre, mime: d.mime, tamano: d.tamano });
        if (d.tipo === "docx") p.imagenes = d.imagenes || 0;
        if (d.borrado) Object.assign(p, { borrado: d.borrado, borradoPor: d.borradoPor });
        return p;
    }

    function avisar(accion, d, usuario, origen) {
        emitir({ tipo: "archivo", accion, id: d.id, autor: usuario.id }, origen);
    }

    // Reconoce lo subido: tipo, extensión en disco, texto (para buscar), HTML (Word) y título.
    function reconocer(buf, nombre) {
        const ext = extensionDe(nombre);
        let tipo = ext ? EXTENSIONES[ext] : null;
        if (ext && !tipo) {
            if (ext === "doc") throw new ErrorDeDatos("Los .doc antiguos no se pueden ver aquí: guárdalo como .docx (Word) o como PDF y súbelo otra vez.");
            throw new ErrorDeDatos(`Los .${ext} no se pueden subir. Se admiten: ${ADMITIDOS}. Para lo demás, añade un enlace.`);
        }
        if (!tipo) {
            // Sin extensión: se mira qué es por dentro.
            if (esPdf(buf)) tipo = "pdf";
            else if (FOTOS.some((f) => f.firma(buf))) tipo = "imagen";
            else if (esZip(buf)) tipo = "docx";
            else tipo = "texto";
        }
        if (tipo === "pdf") {
            if (!esPdf(buf)) throw new ErrorDeDatos(`«${nombre}» no es un PDF de verdad: por dentro es otra cosa.`);
            return { tipo, ext: "pdf", mime: MIME.pdf };
        }
        if (tipo === "imagen") {
            const foto = FOTOS.find((f) => f.firma(buf));
            if (!foto) throw new ErrorDeDatos(`«${nombre}» no es una foto de verdad (PNG, JPG, WebP o GIF): por dentro es otra cosa.`);
            return { tipo, ext: foto.ext, mime: foto.mime };
        }
        if (tipo === "docx") {
            if (!esZip(buf)) throw new ErrorDeDatos(`«${nombre}» no es un Word (.docx) de verdad: por dentro es otra cosa.`);
            let convertido;
            try {
                convertido = docxAHtml(buf);
            } catch (error) {
                if (error instanceof ErrorDocx) throw new ErrorDeDatos(`No he podido leer «${nombre}» como Word (.docx): ${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}.`);
                throw new ErrorDeDatos(`No he podido leer «${nombre}» como Word (.docx).`);
            }
            return { tipo, ext: "docx", mime: MIME.docx, html: convertido.html, texto: convertido.texto, titulo: convertido.titulo, imagenes: convertido.imagenes };
        }
        // Texto (md, txt o sin extensión)
        const binario = BINARIOS.find(([, firma]) => firma(buf));
        if (binario) throw new ErrorDeDatos(`«${nombre}» no es un texto: por dentro es ${binario[0]}.`);
        if (buf.length > MAXIMO_TEXTO) throw Object.assign(new ErrorDeDatos("Los textos y los Markdown pueden ocupar como mucho 5 MB."), { estado: 413 });
        const { texto, codificacion } = decodificar(buf);
        let raros = 0;
        for (let i = 0; i < texto.length; i++) {
            const n = texto.charCodeAt(i);
            if (n === 0) {
                raros = Infinity;
                break;
            }
            if (n < 32 && n !== 9 && n !== 10 && n !== 13 && n !== 12 && n !== 27) raros += 1;
        }
        if (raros > Math.max(8, texto.length / 100)) throw new ErrorDeDatos(`«${nombre}» no parece un texto: por dentro es otra cosa.`);
        const final = tipo === "texto" ? (pareceMarkdown(texto) ? "md" : "txt") : tipo;
        return {
            tipo: final,
            ext: final,
            mime: `${MIME[final]}; charset=${codificacion === "latin1" ? "iso-8859-1" : codificacion}`,
            codificacion,
            texto,
            titulo: final === "md" ? primerTitulo(texto) : null,
        };
    }

    // ---------- buscar ----------

    function buscar(consulta) {
        const q = plegar(unaLinea(consulta, LIMITES.consulta));
        if (q.replace(/\s/g, "").length < 2) return [];
        const terminos = [...new Set(q.split(" ").filter(Boolean))].slice(0, 8);
        const largo = [...terminos].sort((a, b) => b.length - a.length)[0];
        const resultados = [];
        for (const d of vivos()) {
            const titulo = plegar(d.titulo || "");
            const descripcion = plegar(d.descripcion || "");
            const otros = plegar(`${d.carpeta || ""} ${d.nombre || ""} ${d.url || ""}`);
            const texto = textos.get(d.id);
            let puntos = 0;
            let todos = true;
            for (const t of terminos) {
                const enTitulo = titulo.includes(t);
                const enDescripcion = descripcion.includes(t);
                const enOtros = otros.includes(t);
                const enTexto = texto ? texto.plegado.includes(t) : false;
                if (!enTitulo && !enDescripcion && !enOtros && !enTexto) {
                    todos = false;
                    break;
                }
                puntos += (enTitulo ? 10 : 0) + (enDescripcion ? 4 : 0) + (enOtros ? 2 : 0) + (enTexto ? 1 : 0);
            }
            if (!todos) continue;
            let fragmento = null;
            let coincidencias = 0;
            if (texto) {
                const termino = texto.plegado.includes(largo) ? largo : terminos.find((t) => texto.plegado.includes(t));
                if (termino) {
                    for (let p = texto.plegado.indexOf(termino); p >= 0 && coincidencias < 999; p = texto.plegado.indexOf(termino, p + termino.length)) coincidencias += 1;
                    const pos = texto.plegado.indexOf(termino);
                    let desde = Math.max(0, pos - 80);
                    let hasta = Math.min(texto.plano.length, pos + termino.length + 120);
                    if (desde > 0) {
                        const espacio = texto.plano.indexOf(" ", desde);
                        if (espacio >= 0 && espacio < pos) desde = espacio + 1;
                    }
                    if (hasta < texto.plano.length) {
                        const espacio = texto.plano.lastIndexOf(" ", hasta);
                        if (espacio > pos + termino.length) hasta = espacio;
                    }
                    fragmento = `${desde > 0 ? "…" : ""}${texto.plano.slice(desde, hasta).replace(/\s+/g, " ").trim()}${hasta < texto.plano.length ? "…" : ""}`;
                }
            }
            if (!fragmento && descripcion) fragmento = d.descripcion.length > 220 ? `${d.descripcion.slice(0, 220).trim()}…` : d.descripcion;
            resultados.push({ id: d.id, puntos, fragmento, coincidencias });
        }
        const fecha = new Map(datos.documentos.map((d) => [d.id, d.creado]));
        resultados.sort((a, b) => b.puntos - a.puntos || String(fecha.get(b.id)).localeCompare(String(fecha.get(a.id))));
        return resultados.slice(0, 100);
    }

    // ---------- API ----------

    async function subir(req, res, { usuario, origen }) {
        const largo = Number(req.headers["content-length"]);
        if (largo > MAXIMO_ARCHIVO) throw Object.assign(new ErrorDeDatos("Ese archivo es demasiado grande: como mucho 25 MB."), { estado: 413 });
        if (Number.isFinite(largo) && usado() + largo > maximoTotal) throw Object.assign(new ErrorDeDatos("El archivo está lleno: borra algo antes de subir más."), { estado: 413 });
        if (vivos().length >= LIMITES.documentos) throw new ErrorDeDatos("Ya hay demasiados documentos en el archivo.");
        const buf = await leerSubida(req, MAXIMO_ARCHIVO);
        if (buf.length < 4) throw new ErrorDeDatos("Ese archivo está vacío.");
        if (usado() + buf.length > maximoTotal) throw Object.assign(new ErrorDeDatos("El archivo está lleno: borra algo antes de subir más."), { estado: 413 });
        const nombre = limpiarNombre(cabeceraTexto(req, "x-nombre"));
        const r = reconocer(buf, nombre);
        let id;
        do id = nuevoId(9);
        while (buscarDoc(id) || !/^[\w-]{6,24}$/.test(id));
        const ahora = new Date().toISOString();
        const d = {
            id,
            tipo: r.tipo,
            titulo: unaLinea(cabeceraTexto(req, "x-titulo"), LIMITES.titulo) || r.titulo || tituloDeNombre(nombre),
            descripcion: variasLineas(cabeceraTexto(req, "x-descripcion"), LIMITES.descripcion),
            carpeta: limpiarCarpeta(cabeceraTexto(req, "x-carpeta")),
            fijado: false,
            nombre,
            ext: r.ext,
            mime: r.mime,
            tamano: buf.length,
            autor: usuario.id,
            creado: ahora,
            actualizado: ahora,
            actualizadoPor: usuario.id,
            borrado: null,
            borradoPor: null,
        };
        if (r.codificacion) d.codificacion = r.codificacion;
        if (r.tipo === "docx") d.imagenes = r.imagenes;
        if (r.tipo === "docx") escribirSeguro(rutaDe(d, "html"), r.html);
        escribirSeguro(rutaDe(d), buf);
        datos.documentos.push(d);
        guardar();
        prepararTexto(d, r.texto);
        avisar("nuevo", d, usuario, origen);
        return json(res, 201, publico(d));
    }

    async function nuevoEnlace(req, res, { usuario, origen }) {
        if (vivos().length >= LIMITES.documentos) throw new ErrorDeDatos("Ya hay demasiados documentos en el archivo.");
        const entrada = await leerJson(req);
        const enlace = enlaceValido(entrada.url);
        const ahora = new Date().toISOString();
        let id;
        do id = nuevoId(9);
        while (buscarDoc(id));
        const d = {
            id,
            tipo: "enlace",
            titulo: unaLinea(entrada.titulo, LIMITES.titulo) || new URL(enlace.url).hostname,
            descripcion: variasLineas(entrada.descripcion, LIMITES.descripcion),
            carpeta: limpiarCarpeta(entrada.carpeta),
            fijado: false,
            ...enlace,
            autor: usuario.id,
            creado: ahora,
            actualizado: ahora,
            actualizadoPor: usuario.id,
            borrado: null,
            borradoPor: null,
        };
        datos.documentos.push(d);
        guardar();
        avisar("nuevo", d, usuario, origen);
        return json(res, 201, publico(d));
    }

    // Cambia lo que se puede cambiar (título, descripción, carpeta, fijado y, en los enlaces, la dirección).
    function cambiar(d, cambios, usuario) {
        const nuevo = {};
        if ("titulo" in cambios) {
            nuevo.titulo = unaLinea(cambios.titulo, LIMITES.titulo);
            if (!nuevo.titulo) throw new ErrorDeDatos("El documento necesita un título.");
        }
        if ("descripcion" in cambios) nuevo.descripcion = variasLineas(cambios.descripcion, LIMITES.descripcion);
        if ("carpeta" in cambios) nuevo.carpeta = limpiarCarpeta(cambios.carpeta);
        if ("fijado" in cambios) nuevo.fijado = Boolean(cambios.fijado);
        if ("url" in cambios && d.tipo === "enlace") Object.assign(nuevo, enlaceValido(cambios.url));
        const cambiado = Object.keys(nuevo).some((k) => nuevo[k] !== d[k] && !(k === "fijado" && nuevo[k] === Boolean(d[k])));
        Object.assign(d, nuevo);
        if (cambiado) {
            d.actualizado = new Date().toISOString();
            d.actualizadoPor = usuario.id;
            guardar();
        }
        return cambiado;
    }

    function servirArchivo(req, res, d) {
        const ruta = rutaDe(d);
        let info;
        try {
            info = fs.statSync(ruta);
        } catch {
            return json(res, 404, { error: "Ese archivo ya no está." });
        }
        const descargar = new URL(req.url, "http://x").searchParams.has("descargar");
        const enLinea = !descargar && (d.tipo === "pdf" || d.tipo === "imagen");
        const cabeceras = {
            "Content-Type": d.mime,
            "Content-Length": info.size,
            "Cache-Control": "private, max-age=3600",
            "Content-Disposition": disposicion(enLinea ? "inline" : "attachment", d.nombre),
            "X-Content-Type-Options": "nosniff",
        };
        // Nada de lo subido puede ejecutar nada en nuestra web; el PDF va sin ella porque el visor del navegador la necesita.
        if (d.tipo !== "pdf") cabeceras["Content-Security-Policy"] = d.tipo === "imagen" ? "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" : "sandbox; default-src 'none'";
        res.writeHead(200, cabeceras);
        if (req.method === "HEAD") return res.end();
        return fs.createReadStream(ruta).pipe(res);
    }

    async function manejar(req, res, ruta, ctx) {
        const { usuario, origen } = ctx;
        const metodo = req.method;
        if (ruta === "/api/archivo" && metodo === "GET") {
            const ordenar = (a, b) => String(b.creado).localeCompare(String(a.creado));
            return json(res, 200, {
                yo: ctx.yo,
                usuarios: ctx.usuarios,
                documentos: vivos().sort(ordenar).map(publico),
                papelera: datos.documentos
                    .filter((d) => d.borrado)
                    .sort((a, b) => String(b.borrado).localeCompare(String(a.borrado)))
                    .map(publico),
                limites: { archivo: MAXIMO_ARCHIVO, texto: MAXIMO_TEXTO, total: maximoTotal, usado: usado() },
            });
        }
        if (ruta === "/api/archivo/buscar" && metodo === "GET") {
            const q = new URL(req.url, "http://x").searchParams.get("q") || "";
            return json(res, 200, { resultados: buscar(q) });
        }
        if (ruta === "/api/archivo/documentos" && metodo === "POST") return subir(req, res, ctx);
        if (ruta === "/api/archivo/enlaces" && metodo === "POST") return nuevoEnlace(req, res, ctx);

        const m = /^\/api\/archivo\/documentos\/([\w-]{6,24})(?:\/(archivo|restaurar|eliminar))?$/.exec(ruta);
        if (m) {
            const [, id, accion] = m;
            const d = buscarDoc(id);
            if (!d) return json(res, 404, { error: "Ese documento no existe." });
            if (accion === "restaurar" && metodo === "POST") {
                if (d.borrado) {
                    d.borrado = null;
                    d.borradoPor = null;
                    d.actualizado = new Date().toISOString();
                    d.actualizadoPor = usuario.id;
                    guardar();
                    avisar("restaurado", d, usuario, origen);
                }
                return json(res, 200, publico(d));
            }
            // Borrar del todo (sin esperar a los 30 días): solo lo que ya está en la papelera, y solo quien lo subió o
            // quien administra (por si se ha subido algo que no tocaba).
            if (accion === "eliminar" && metodo === "POST") {
                if (!d.borrado) throw new ErrorDeDatos("Primero hay que mandarlo a la papelera.");
                if (!usuario.admin && d.autor !== usuario.id) return json(res, 403, { error: "Solo quien lo subió o quien administra puede borrarlo del todo." });
                borrarDelTodo([d]);
                avisar("eliminado", d, usuario, origen);
                return json(res, 200, { ok: true });
            }
            if (d.borrado) return json(res, 404, { error: "Ese documento está en la papelera.", papelera: true, documento: publico(d) });
            if (accion === "archivo" && (metodo === "GET" || metodo === "HEAD")) {
                if (d.tipo === "enlace") return json(res, 404, { error: "Un enlace no tiene archivo." });
                return servirArchivo(req, res, d);
            }
            if (!accion && metodo === "GET") {
                let contenido = {};
                try {
                    contenido = leerContenido(d);
                } catch (error) {
                    console.error(`[archivo] No se puede leer ${d.id}: ${error.message}`);
                    return json(res, 500, { error: "No he podido leer ese documento." });
                }
                return json(res, 200, { documento: publico(d), ...contenido });
            }
            if (!accion && metodo === "PATCH") {
                if (cambiar(d, await leerJson(req), usuario)) avisar("cambiado", d, usuario, origen);
                return json(res, 200, publico(d));
            }
            if (!accion && metodo === "DELETE") {
                d.borrado = new Date().toISOString();
                d.borradoPor = usuario.id;
                guardar();
                avisar("borrado", d, usuario, origen);
                return json(res, 200, { ok: true });
            }
        }
        return json(res, 404, { error: "No existe" });
    }

    // Una vez cada hora (desde principal.js): lo que lleva 30 días en la papelera se borra de verdad, y los
    // archivos que ya no son de nadie (una subida que se cortó a medias), fuera.
    function borrarDelTodo(lista) {
        for (const d of lista) {
            for (const ext of [d.ext, "html"]) {
                if (!ext) continue;
                try {
                    fs.rmSync(rutaDe(d, ext), { force: true });
                } catch {
                    /* ya no estaba */
                }
            }
            textos.delete(d.id);
        }
        if (lista.length) {
            datos.documentos = datos.documentos.filter((d) => !lista.includes(d));
            guardar();
        }
    }

    function limpiarViejo(limite) {
        borrarDelTodo(datos.documentos.filter((d) => d.borrado && Date.parse(d.borrado) <= limite));
        const ids = new Set(datos.documentos.map((d) => d.id));
        let archivos = [];
        try {
            archivos = fs.readdirSync(carpetaArchivos);
        } catch {
            return;
        }
        for (const a of archivos) {
            const id = a.split(".")[0];
            if (ids.has(id) && !a.endsWith(".tmp")) continue;
            try {
                if (Date.now() - fs.statSync(path.join(carpetaArchivos, a)).mtimeMs > 3600 * 1000) fs.rmSync(path.join(carpetaArchivos, a), { force: true });
            } catch {
                /* da igual */
            }
        }
    }

    if (!fs.existsSync(indice)) guardarYa();

    return {
        manejar,
        limpiarViejo,
        guardarYa,
        pendiente: () => temporizador !== null,
        buscar,
    };
}
