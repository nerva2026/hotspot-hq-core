// Word (.docx) → HTML, sin librerías, para el archivo de documentos (servidor/archivo.js).
//
// Un .docx es un zip de XML: se lee con zlib.inflateRawSync y se recorre word/document.xml con sus estilos
// (styles.xml: qué párrafos son títulos), su numeración (numbering.xml: listas con viñetas o numeradas) y sus
// relaciones (los enlaces). Sale un HTML con pocas etiquetas y todo el texto escapado:
//   <h1>–<h6>, <p>, <strong>, <em>, <u>, <s>, <br>, <ul>/<ol>/<li>, <table> (con colspan y rowspan) y
//   <a href> (solo http, https y mailto).
// Las imágenes no se pasan: en su sitio queda una marca «[imagen]» y se cuentan, para avisar en la pantalla.
// Con límites para que un zip hecho a mala idea (una «bomba» que ocupa gigas al descomprimir) no tumbe nada.

import zlib from "node:zlib";

const LIMITES = { entradas: 4000, parte: 40 * 1024 * 1024, total: 120 * 1024 * 1024, html: 20 * 1024 * 1024, profundidad: 200 };

export class ErrorDocx extends Error {}

// ---------- zip ----------

// Devuelve { nombres, leer(nombre) → Buffer | null }. Solo descomprime lo que se pide, y nunca más de lo razonable.
export function leerZip(buf) {
    let fin = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            fin = i;
            break;
        }
    }
    if (fin < 0) throw new ErrorDocx("No es un zip");
    const total = buf.readUInt16LE(fin + 10);
    const tamCentral = buf.readUInt32LE(fin + 12);
    let p = buf.readUInt32LE(fin + 16);
    if (total === 0xffff || p === 0xffffffff) throw new ErrorDocx("Zip64 no admitido");
    if (total > LIMITES.entradas) throw new ErrorDocx("Demasiados archivos dentro");
    if (p + tamCentral > fin) throw new ErrorDocx("Zip dañado");
    const entradas = new Map();
    for (let n = 0; n < total; n++) {
        if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ErrorDocx("Zip dañado");
        const banderas = buf.readUInt16LE(p + 8);
        const metodo = buf.readUInt16LE(p + 10);
        const tamComprimido = buf.readUInt32LE(p + 20);
        const tamReal = buf.readUInt32LE(p + 24);
        const largoNombre = buf.readUInt16LE(p + 28);
        const largoExtra = buf.readUInt16LE(p + 30);
        const largoComentario = buf.readUInt16LE(p + 32);
        const local = buf.readUInt32LE(p + 42);
        const nombre = buf.toString("utf8", p + 46, Math.min(buf.length, p + 46 + largoNombre));
        entradas.set(nombre, { banderas, metodo, tamComprimido, tamReal, local });
        p += 46 + largoNombre + largoExtra + largoComentario;
    }
    let descomprimido = 0;
    return {
        nombres: [...entradas.keys()],
        leer(nombre) {
            const e = entradas.get(nombre);
            if (!e) return null;
            if (e.banderas & 1) throw new ErrorDocx("El documento está protegido con contraseña");
            if (e.local + 30 > buf.length || buf.readUInt32LE(e.local) !== 0x04034b50) throw new ErrorDocx("Zip dañado");
            const inicio = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
            if (inicio + e.tamComprimido > buf.length) throw new ErrorDocx("Zip dañado");
            const trozo = buf.subarray(inicio, inicio + e.tamComprimido);
            let datos;
            if (e.metodo === 0) datos = trozo;
            else if (e.metodo === 8) {
                try {
                    datos = zlib.inflateRawSync(trozo, { maxOutputLength: LIMITES.parte });
                } catch {
                    throw new ErrorDocx("Hay una parte que no se puede descomprimir (o es enorme)");
                }
            } else throw new ErrorDocx("Compresión no admitida");
            descomprimido += datos.length;
            if (descomprimido > LIMITES.total) throw new ErrorDocx("Descomprimido ocupa demasiado");
            return datos;
        },
    };
}

// ---------- XML ----------

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function desxml(s) {
    if (!s.includes("&")) return s;
    return s.replace(/&(?:#(\d{1,7})|#x([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos));/g, (todo, dec, hex, nombre) => {
        if (nombre) return ENTIDADES[nombre];
        const n = dec ? Number(dec) : parseInt(hex, 16);
        return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "�";
    });
}

const local = (nombre) => {
    const i = nombre.indexOf(":");
    return i < 0 ? nombre : nombre.slice(i + 1);
};

const ETIQUETA = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
const ATRIBUTO = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

// Un árbol sencillo: { n: nombre sin prefijo, a: { atributo sin prefijo: valor }, h: [hijos] }; el texto va como cadenas.
// No se expanden entidades propias (<!DOCTYPE …>): solo las cinco de siempre y las numéricas.
export function leerXml(texto) {
    const raiz = { n: "#raiz", a: {}, h: [] };
    const pila = [raiz];
    const nombres = [""];
    let i = 0;
    const largo = texto.length;
    while (i < largo) {
        const menor = texto.indexOf("<", i);
        if (menor < 0) {
            pila.at(-1).h.push(desxml(texto.slice(i)));
            break;
        }
        if (menor > i) pila.at(-1).h.push(desxml(texto.slice(i, menor)));
        if (texto.startsWith("<!--", menor)) {
            const f = texto.indexOf("-->", menor + 4);
            if (f < 0) throw new ErrorDocx("XML mal formado");
            i = f + 3;
            continue;
        }
        if (texto.startsWith("<![CDATA[", menor)) {
            const f = texto.indexOf("]]>", menor + 9);
            if (f < 0) throw new ErrorDocx("XML mal formado");
            pila.at(-1).h.push(texto.slice(menor + 9, f));
            i = f + 3;
            continue;
        }
        if (texto.startsWith("<?", menor)) {
            const f = texto.indexOf("?>", menor + 2);
            if (f < 0) throw new ErrorDocx("XML mal formado");
            i = f + 2;
            continue;
        }
        if (texto.startsWith("<!", menor)) {
            // <!DOCTYPE …>, con o sin […]: se salta entero.
            const corchete = texto.indexOf("[", menor);
            const cierre = texto.indexOf(">", menor);
            const f = corchete >= 0 && corchete < cierre ? texto.indexOf("]>", corchete) + 1 : cierre;
            if (f <= 0) throw new ErrorDocx("XML mal formado");
            i = f + 1;
            continue;
        }
        ETIQUETA.lastIndex = menor;
        const m = ETIQUETA.exec(texto);
        if (!m) throw new ErrorDocx("XML mal formado");
        const [todo, cierra, nombre, atributos, sola] = m;
        if (cierra) {
            const donde = nombres.lastIndexOf(nombre);
            if (donde > 0) {
                pila.length = donde;
                nombres.length = donde;
            }
        } else {
            const a = {};
            if (atributos) for (const at of atributos.matchAll(ATRIBUTO)) a[local(at[1])] = desxml(at[2] ?? at[3] ?? "");
            const el = { n: local(nombre), a, h: [] };
            pila.at(-1).h.push(el);
            if (!sola) {
                if (pila.length > LIMITES.profundidad) throw new ErrorDocx("XML demasiado anidado");
                pila.push(el);
                nombres.push(nombre);
            }
        }
        i = menor + todo.length;
    }
    return raiz;
}

const hijos = (el, nombre) => (el ? el.h.filter((x) => typeof x === "object" && x.n === nombre) : []);
const hijo = (el, nombre) => (el ? el.h.find((x) => typeof x === "object" && x.n === nombre) || null : null);
function buscar(el, nombre) {
    if (!el) return null;
    for (const x of el.h) {
        if (typeof x !== "object") continue;
        if (x.n === nombre) return x;
        const dentro = buscar(x, nombre);
        if (dentro) return dentro;
    }
    return null;
}
function textoDe(el) {
    if (!el) return "";
    return el.h.map((x) => (typeof x === "string" ? x : textoDe(x))).join("");
}
// <w:b/> y <w:b w:val="true"/> encienden; <w:b w:val="0"/> o "false" apagan. Sin la etiqueta: null (no dice nada).
function interruptor(propiedades, nombre) {
    const el = hijo(propiedades, nombre);
    if (!el) return null;
    const v = el.a.val;
    return !(v === "0" || v === "false" || v === "off" || v === "none");
}

// ---------- HTML ----------

export const escapar = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function direccionPermitida(url) {
    const limpia = String(url || "").replace(/[\u0000- \u007f-\u009f]/g, "");
    let u;
    try {
        u = new URL(limpia);
    } catch {
        return null;
    }
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? u.href : null;
}

// ---------- conversión ----------

function leerEstilos(xml) {
    const estilos = new Map();
    if (!xml) return estilos;
    const raiz = leerXml(xml);
    for (const s of hijos(hijo(raiz, "styles"), "style")) {
        const id = s.a.styleId;
        if (!id) continue;
        const pPr = hijo(s, "pPr");
        const rPr = hijo(s, "rPr");
        const numPr = hijo(pPr, "numPr");
        const esquema = hijo(pPr, "outlineLvl");
        estilos.set(id, {
            nombre: (hijo(s, "name")?.a.val || "").toLowerCase(),
            basadoEn: hijo(s, "basedOn")?.a.val || null,
            nivelEsquema: esquema ? Number(esquema.a.val) : null,
            numId: hijo(numPr, "numId")?.a.val ?? null,
            ilvl: hijo(numPr, "ilvl")?.a.val ?? null,
            negrita: interruptor(rPr, "b"),
            cursiva: interruptor(rPr, "i"),
            subrayado: hijo(rPr, "u") ? hijo(rPr, "u").a.val !== "none" : null,
            tachado: interruptor(rPr, "strike"),
        });
    }
    return estilos;
}

// Busca una propiedad en el estilo y en los estilos en los que se basa.
function delEstilo(estilos, id, campo) {
    for (let n = 0, e = estilos.get(id); e && n < 12; n++, e = estilos.get(e.basadoEn)) {
        if (e[campo] !== null && e[campo] !== undefined) return e[campo];
    }
    return null;
}

function nivelDeTitulo(estilos, id) {
    for (let n = 0, e = estilos.get(id); e && n < 12; n++, e = estilos.get(e.basadoEn)) {
        const m = /^heading\s*([1-9])$/.exec(e.nombre);
        if (m) return Math.min(6, Number(m[1]));
        if (e.nombre === "title") return 1;
        if (e.nivelEsquema !== null && e.nivelEsquema >= 0 && e.nivelEsquema < 9) return Math.min(6, e.nivelEsquema + 1);
    }
    return 0;
}

function leerNumeracion(xml) {
    const abstractos = new Map();
    const numeros = new Map();
    if (!xml) return { tipo: () => "ul" };
    const raiz = hijo(leerXml(xml), "numbering");
    for (const a of hijos(raiz, "abstractNum")) {
        const niveles = new Map();
        for (const l of hijos(a, "lvl")) niveles.set(String(l.a.ilvl ?? "0"), hijo(l, "numFmt")?.a.val || "decimal");
        abstractos.set(a.a.abstractNumId, niveles);
    }
    for (const n of hijos(raiz, "num")) numeros.set(n.a.numId, hijo(n, "abstractNumId")?.a.val);
    return {
        tipo(numId, ilvl) {
            const formato = abstractos.get(numeros.get(numId))?.get(String(ilvl)) || "bullet";
            return formato === "bullet" || formato === "none" ? "ul" : "ol";
        },
    };
}

function leerRelaciones(xml) {
    const rel = new Map();
    if (!xml) return rel;
    for (const r of hijos(hijo(leerXml(xml), "Relationships"), "Relationship")) rel.set(r.a.Id, { destino: r.a.Target || "", externo: r.a.TargetMode === "External" });
    return rel;
}

// Convierte un .docx. Devuelve { html, texto, titulo, imagenes }. Lanza ErrorDocx si no es un Word de verdad.
export function docxAHtml(buf) {
    const zip = leerZip(buf);
    const leerTexto = (nombre) => {
        const b = zip.leer(nombre);
        return b ? b.toString("utf8") : null;
    };
    // El documento principal: el que diga _rels/.rels (casi siempre word/document.xml).
    let principal = "word/document.xml";
    const raizRels = leerTexto("_rels/.rels");
    if (raizRels) {
        for (const r of hijos(hijo(leerXml(raizRels), "Relationships"), "Relationship")) {
            if (/\/officeDocument$/.test(r.a.Type || "")) principal = String(r.a.Target || principal).replace(/^\//, "");
        }
    }
    const xmlDocumento = leerTexto(principal);
    if (!xmlDocumento) throw new ErrorDocx("No tiene word/document.xml");
    const carpeta = principal.includes("/") ? principal.slice(0, principal.lastIndexOf("/") + 1) : "";
    const archivoRels = `${carpeta}_rels/${principal.slice(carpeta.length)}.rels`;
    const estilos = leerEstilos(leerTexto(`${carpeta}styles.xml`));
    const numeracion = leerNumeracion(leerTexto(`${carpeta}numbering.xml`));
    const relaciones = leerRelaciones(leerTexto(archivoRels));
    const cuerpo = buscar(leerXml(xmlDocumento), "body");
    if (!cuerpo) throw new ErrorDocx("El documento no tiene cuerpo");

    let tituloCore = null;
    const core = leerTexto("docProps/core.xml");
    if (core) {
        const t = buscar(leerXml(core), "title");
        tituloCore = t ? textoDe(t).replace(/\s+/g, " ").trim() : null;
    }

    const salida = [];
    const lineasTexto = [];
    let imagenes = 0;
    let primerTitulo = null;
    let tamano = 0;
    const escribir = (s) => {
        tamano += s.length;
        if (tamano > LIMITES.html) throw new ErrorDocx("El documento es demasiado largo para verlo aquí");
        salida.push(s);
    };

    // --- lo de dentro de un párrafo: trozos de texto con su formato, saltos de línea y enlaces ---
    function trozosDe(parrafo, estiloParrafo) {
        const trozos = [];
        const enlaces = [];
        const campos = []; // campos complejos (HYPERLINK …): { instr, enlace }
        const base = {
            b: delEstilo(estilos, estiloParrafo, "negrita") || false,
            i: delEstilo(estilos, estiloParrafo, "cursiva") || false,
            u: false,
            s: false,
        };
        const enlaceActual = () => {
            for (let k = campos.length - 1; k >= 0; k--) if (campos[k].enlace !== undefined && campos[k].separado) return campos[k].enlace;
            return enlaces.length ? enlaces.at(-1) : null;
        };
        const dentroDeInstruccion = () => campos.some((c) => !c.separado);
        function recorrer(el) {
            for (const x of el.h) {
                if (typeof x !== "object") continue;
                switch (x.n) {
                    case "r":
                        run(x);
                        break;
                    case "hyperlink": {
                        let href = null;
                        if (x.a.id && relaciones.get(x.a.id)?.externo) href = direccionPermitida(relaciones.get(x.a.id).destino);
                        enlaces.push(href);
                        recorrer(x);
                        enlaces.pop();
                        break;
                    }
                    case "fldSimple": {
                        const m = /HYPERLINK\s+"([^"]+)"/i.exec(x.a.instr || "");
                        enlaces.push(m ? direccionPermitida(m[1]) : enlaceActual());
                        recorrer(x);
                        enlaces.pop();
                        break;
                    }
                    case "ins":
                    case "smartTag":
                    case "customXml":
                    case "bdo":
                    case "dir":
                    case "moveTo":
                        recorrer(x);
                        break;
                    case "sdt":
                        if (hijo(x, "sdtContent")) recorrer(hijo(x, "sdtContent"));
                        break;
                    case "AlternateContent":
                        imagen();
                        break;
                    default:
                        break; // del, moveFrom, marcadores, comentarios, revisiones…: fuera
                }
            }
        }
        function imagen() {
            imagenes += 1;
            trozos.push({ imagen: true });
        }
        function run(r) {
            const rPr = hijo(r, "rPr");
            const estiloLetra = hijo(rPr, "rStyle")?.a.val;
            const valor = (campo, etiqueta) => {
                const directo = interruptor(rPr, etiqueta);
                if (directo !== null) return directo;
                const deLetra = estiloLetra ? delEstilo(estilos, estiloLetra, campo) : null;
                return deLetra !== null ? deLetra : base[campo === "negrita" ? "b" : campo === "cursiva" ? "i" : campo === "subrayado" ? "u" : "s"];
            };
            const u = hijo(rPr, "u");
            const formato = {
                b: valor("negrita", "b"),
                i: valor("cursiva", "i"),
                u: u ? u.a.val !== "none" : Boolean(estiloLetra && delEstilo(estilos, estiloLetra, "subrayado")),
                s: valor("tachado", "strike") || interruptor(rPr, "dstrike") === true,
            };
            for (const x of r.h) {
                if (typeof x !== "object") continue;
                switch (x.n) {
                    case "t":
                        if (!dentroDeInstruccion()) trozos.push({ texto: textoDe(x), ...formato, enlace: enlaceActual() });
                        break;
                    case "tab":
                        if (!dentroDeInstruccion()) trozos.push({ texto: "\t", ...formato, enlace: enlaceActual() });
                        break;
                    case "noBreakHyphen":
                        trozos.push({ texto: "-", ...formato, enlace: enlaceActual() });
                        break;
                    case "br":
                    case "cr":
                        if (!x.a.type || x.a.type === "textWrapping") trozos.push({ salto: true });
                        break;
                    case "drawing":
                    case "pict":
                    case "object":
                        imagen();
                        break;
                    case "AlternateContent":
                        imagen();
                        break;
                    case "fldChar": {
                        const tipo = x.a.fldCharType;
                        if (tipo === "begin") campos.push({ instr: "", separado: false });
                        else if (tipo === "separate" && campos.length) {
                            const c = campos.at(-1);
                            c.separado = true;
                            const m = /HYPERLINK\s+(?:\\[a-z]\s+"[^"]*"\s+)*"([^"]+)"/i.exec(c.instr);
                            if (m) c.enlace = direccionPermitida(m[1]);
                        } else if (tipo === "end") campos.pop();
                        break;
                    }
                    case "instrText":
                        if (campos.length) campos.at(-1).instr += textoDe(x);
                        break;
                    default:
                        break;
                }
            }
        }
        recorrer(parrafo);
        return trozos;
    }

    function htmlDeTrozos(trozos, sinNegrita = false) {
        // Se juntan los trozos seguidos con el mismo formato y el mismo enlace.
        // En los títulos la negrita sobra (ya salen en negrita; en Word suele venir del estilo).
        const juntos = [];
        for (const trozo of trozos) {
            const t = sinNegrita && trozo.b ? { ...trozo, b: false } : trozo;
            const ultimo = juntos.at(-1);
            if (t.texto !== undefined && ultimo && ultimo.texto !== undefined && ["b", "i", "u", "s", "enlace"].every((k) => ultimo[k] === t[k])) ultimo.texto += t.texto;
            else juntos.push({ ...t });
        }
        let html = "";
        let enlaceAbierto = null;
        const cerrarEnlace = () => {
            if (enlaceAbierto !== null) html += "</a>";
            enlaceAbierto = null;
        };
        for (const t of juntos) {
            if (t.salto) {
                html += "<br>";
                continue;
            }
            if (t.imagen) {
                cerrarEnlace();
                html += '<span class="imagen-omitida">[imagen]</span>';
                continue;
            }
            if (!t.texto) continue;
            const href = t.enlace || null;
            if (href !== enlaceAbierto) {
                cerrarEnlace();
                if (href) {
                    html += `<a href="${escapar(href)}">`;
                    enlaceAbierto = href;
                }
            }
            let dentro = escapar(t.texto);
            if (t.s) dentro = `<s>${dentro}</s>`;
            if (t.u) dentro = `<u>${dentro}</u>`;
            if (t.i) dentro = `<em>${dentro}</em>`;
            if (t.b) dentro = `<strong>${dentro}</strong>`;
            html += dentro;
        }
        cerrarEnlace();
        return html;
    }

    const textoDeTrozos = (trozos) => trozos.map((t) => (t.salto ? "\n" : t.texto || "")).join("");

    // --- listas: se abren y cierran según el nivel de cada párrafo numerado ---
    const pilaListas = []; // { tipo, nivel, numId }
    function cerrarListas(hastaNivel = -1) {
        while (pilaListas.length && pilaListas.at(-1).nivel > hastaNivel) {
            const l = pilaListas.pop();
            escribir(`</li></${l.tipo}>`);
        }
    }

    function parrafo(p) {
        const pPr = hijo(p, "pPr");
        const idEstilo = hijo(pPr, "pStyle")?.a.val || "Normal";
        const trozos = trozosDe(p, idEstilo);
        const texto = textoDeTrozos(trozos);
        const conContenido = texto.trim() || trozos.some((t) => t.imagen);
        let nivel = 0;
        const esquema = hijo(pPr, "outlineLvl");
        if (esquema && Number(esquema.a.val) < 9) nivel = Math.min(6, Number(esquema.a.val) + 1);
        if (!nivel) nivel = nivelDeTitulo(estilos, idEstilo);
        const html = htmlDeTrozos(trozos, nivel > 0);
        const numPr = hijo(pPr, "numPr");
        let numId = hijo(numPr, "numId")?.a.val ?? delEstilo(estilos, idEstilo, "numId");
        let ilvl = Number(hijo(numPr, "ilvl")?.a.val ?? delEstilo(estilos, idEstilo, "ilvl") ?? 0);
        if (!Number.isFinite(ilvl) || ilvl < 0) ilvl = 0;
        ilvl = Math.min(ilvl, 8);
        if (numId === "0") numId = null;
        if (texto.trim()) lineasTexto.push(texto);

        if (numId && !nivel && conContenido) {
            const tipo = numeracion.tipo(numId, ilvl);
            const arriba = pilaListas.at(-1);
            if (arriba && arriba.nivel > ilvl) cerrarListas(ilvl);
            const actual = pilaListas.at(-1);
            if (actual && actual.nivel === ilvl && (actual.tipo !== tipo || actual.numId !== numId)) {
                cerrarListas(ilvl - 1);
            }
            const ahora = pilaListas.at(-1);
            if (ahora && ahora.nivel === ilvl) escribir(`</li><li>${html}`);
            else {
                escribir(`<${tipo}><li>${html}`);
                pilaListas.push({ tipo, nivel: ilvl, numId });
            }
            return;
        }
        cerrarListas();
        if (!conContenido) return;
        if (nivel) {
            escribir(`<h${nivel}>${html}</h${nivel}>`);
            if (!primerTitulo && texto.trim()) primerTitulo = texto.replace(/\s+/g, " ").trim();
        } else escribir(`<p>${html}</p>`);
    }

    function tabla(t) {
        cerrarListas();
        const filas = [];
        const juntarFilas = (el) => {
            for (const x of el.h) {
                if (typeof x !== "object") continue;
                if (x.n === "tr") filas.push(x);
                else if (x.n === "sdt" || x.n === "sdtContent" || x.n === "customXml") juntarFilas(x);
            }
        };
        juntarFilas(t);
        // Celdas combinadas: gridSpan → colspan; vMerge → rowspan (la celda de arriba crece).
        const abiertas = new Map(); // columna → celda que empezó la combinación hacia abajo
        const matriz = filas.map((fila) => {
            const celdas = [];
            const cabecera = Boolean(hijo(hijo(fila, "trPr"), "tblHeader"));
            let columna = 0;
            const juntarCeldas = (el) => {
                for (const x of el.h) {
                    if (typeof x !== "object") continue;
                    if (x.n === "tc") {
                        const tcPr = hijo(x, "tcPr");
                        const span = Math.max(1, Math.min(60, Number(hijo(tcPr, "gridSpan")?.a.val) || 1));
                        const vMerge = hijo(tcPr, "vMerge");
                        if (vMerge && vMerge.a.val !== "restart" && abiertas.has(columna)) {
                            abiertas.get(columna).rowspan += 1;
                        } else {
                            const celda = { el: x, colspan: span, rowspan: 1, cabecera };
                            celdas.push(celda);
                            if (vMerge && vMerge.a.val === "restart") abiertas.set(columna, celda);
                            else abiertas.delete(columna);
                        }
                        columna += span;
                    } else if (x.n === "sdt" || x.n === "sdtContent" || x.n === "customXml") juntarCeldas(x);
                }
            };
            juntarCeldas(fila);
            return celdas;
        });
        escribir("<table><tbody>");
        for (const celdas of matriz) {
            escribir("<tr>");
            for (const c of celdas) {
                const etiqueta = c.cabecera ? "th" : "td";
                const atributos = `${c.colspan > 1 ? ` colspan="${c.colspan}"` : ""}${c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ""}`;
                escribir(`<${etiqueta}${atributos}>`);
                bloques(c.el);
                cerrarListas();
                escribir(`</${etiqueta}>`);
            }
            escribir("</tr>");
        }
        escribir("</tbody></table>");
    }

    let profundidadTablas = 0;
    function bloques(el) {
        for (const x of el.h) {
            if (typeof x !== "object") continue;
            if (x.n === "p") parrafo(x);
            else if (x.n === "tbl") {
                if (profundidadTablas > 8) continue;
                profundidadTablas += 1;
                tabla(x);
                profundidadTablas -= 1;
            } else if (x.n === "sdt") {
                if (hijo(x, "sdtContent")) bloques(hijo(x, "sdtContent"));
            } else if (x.n === "customXml" || x.n === "ins" || x.n === "moveTo") bloques(x);
        }
    }

    bloques(cuerpo);
    cerrarListas();
    return {
        html: salida.join(""),
        texto: lineasTexto.join("\n"),
        titulo: tituloCore || primerTitulo || null,
        imagenes,
    };
}
