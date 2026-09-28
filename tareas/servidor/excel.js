// Excel sin dependencias: escribe y lee archivos .xlsx (que por dentro son un zip de XML).
//
// - exportarExcel(): el tablón entero en una hoja «Tareas», lista para abrir en Excel o Google Sheets.
// - leerExcel(): lee la primera hoja con una columna «Tarea» (o «Título»), para importar lo que
//   hubiera en la hoja de Pendiente de Drive o en una exportación anterior.

import zlib from "node:zlib";

// ---------- zip ----------

const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    if (typeof zlib.crc32 === "function") return zlib.crc32(buf) >>> 0;
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function fechaDos(d = new Date()) {
    const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { hora, dia };
}

export function crearZip(archivos) {
    const partes = [];
    const central = [];
    let desplazamiento = 0;
    const { hora, dia } = fechaDos();
    for (const { nombre, contenido } of archivos) {
        const datos = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, "utf8");
        const comprimido = zlib.deflateRawSync(datos);
        const nombreBuf = Buffer.from(nombre, "utf8");
        const crc = crc32(datos);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
        local.writeUInt16LE(8, 8); // deflate
        local.writeUInt16LE(hora, 10);
        local.writeUInt16LE(dia, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(comprimido.length, 18);
        local.writeUInt32LE(datos.length, 22);
        local.writeUInt16LE(nombreBuf.length, 26);
        local.writeUInt16LE(0, 28);
        partes.push(local, nombreBuf, comprimido);

        const cabecera = Buffer.alloc(46);
        cabecera.writeUInt32LE(0x02014b50, 0);
        cabecera.writeUInt16LE(20, 4);
        cabecera.writeUInt16LE(20, 6);
        cabecera.writeUInt16LE(0x0800, 8);
        cabecera.writeUInt16LE(8, 10);
        cabecera.writeUInt16LE(hora, 12);
        cabecera.writeUInt16LE(dia, 14);
        cabecera.writeUInt32LE(crc, 16);
        cabecera.writeUInt32LE(comprimido.length, 20);
        cabecera.writeUInt32LE(datos.length, 24);
        cabecera.writeUInt16LE(nombreBuf.length, 28);
        cabecera.writeUInt32LE(desplazamiento, 42);
        central.push(cabecera, nombreBuf);
        desplazamiento += 30 + nombreBuf.length + comprimido.length;
    }
    const tamCentral = central.reduce((s, b) => s + b.length, 0);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0);
    fin.writeUInt16LE(archivos.length, 8);
    fin.writeUInt16LE(archivos.length, 10);
    fin.writeUInt32LE(tamCentral, 12);
    fin.writeUInt32LE(desplazamiento, 16);
    return Buffer.concat([...partes, ...central, fin]);
}

export function leerZip(buf) {
    let fin = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            fin = i;
            break;
        }
    }
    if (fin < 0) throw new Error("No es un archivo .xlsx válido");
    const total = buf.readUInt16LE(fin + 10);
    let p = buf.readUInt32LE(fin + 16);
    const archivos = new Map();
    for (let n = 0; n < total; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Zip dañado");
        const metodo = buf.readUInt16LE(p + 10);
        const tamComprimido = buf.readUInt32LE(p + 20);
        const largoNombre = buf.readUInt16LE(p + 28);
        const largoExtra = buf.readUInt16LE(p + 30);
        const largoComentario = buf.readUInt16LE(p + 32);
        const local = buf.readUInt32LE(p + 42);
        const nombre = buf.toString("utf8", p + 46, p + 46 + largoNombre);
        const inicioDatos = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const trozo = buf.subarray(inicioDatos, inicioDatos + tamComprimido);
        archivos.set(nombre, () => (metodo === 8 ? zlib.inflateRawSync(trozo) : metodo === 0 ? trozo : null));
        p += 46 + largoNombre + largoExtra + largoComentario;
    }
    return archivos;
}

// ---------- escribir .xlsx ----------

const xml = (s) =>
    String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        // caracteres de control que XML no admite
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

const letra = (i) => {
    let s = "";
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
};

// Días desde el 30/12/1899, que es como Excel guarda las fechas.
const serieExcel = (iso) => {
    const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
    return Date.UTC(a, m - 1, d) / 86400000 + 25569;
};

// columnas: [{ titulo, ancho, tipo: "texto" | "fecha" | "largo" }]; filas: arrays de valores (texto o "AAAA-MM-DD").
export function crearExcel({ hoja, columnas, filas }) {
    const estilo = { cabecera: 1, fecha: 2, largo: 3, texto: 4 };
    const celdas = (fila, r) =>
        fila
            .map((v, c) => {
                const ref = `${letra(c)}${r}`;
                const col = columnas[c];
                if (v === null || v === undefined || v === "") return "";
                if (col.tipo === "fecha" && /^\d{4}-\d{2}-\d{2}/.test(v)) return `<c r="${ref}" s="${estilo.fecha}"><v>${serieExcel(v)}</v></c>`;
                return `<c r="${ref}" s="${col.tipo === "largo" ? estilo.largo : estilo.texto}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
            })
            .join("");
    const ultima = letra(columnas.length - 1);
    const cabecera = `<row r="1">${columnas
        .map((c, i) => `<c r="${letra(i)}1" s="${estilo.cabecera}" t="inlineStr"><is><t>${xml(c.titulo)}</t></is></c>`)
        .join("")}</row>`;
    const cuerpo = filas.map((f, i) => `<row r="${i + 2}">${celdas(f, i + 2)}</row>`).join("");
    const hojaXml =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
        `<sheetFormatPr defaultRowHeight="15"/>` +
        `<cols>${columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho || 14}" customWidth="1"/>`).join("")}</cols>` +
        `<sheetData>${cabecera}${cuerpo}</sheetData>` +
        `<autoFilter ref="A1:${ultima}${Math.max(1, filas.length + 1)}"/>` +
        `</worksheet>`;
    const estilos =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFF3E6D8"/><name val="Calibri"/></font></fonts>` +
        `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
        `<fill><patternFill patternType="solid"><fgColor rgb="FF1C1715"/><bgColor indexed="64"/></patternFill></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="5">` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
        `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>` +
        `</cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
        `</styleSheet>`;
    return crearZip([
        {
            nombre: "[Content_Types].xml",
            contenido:
                `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
                `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
                `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
                `<Default Extension="xml" ContentType="application/xml"/>` +
                `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
                `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
                `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
                `</Types>`,
        },
        {
            nombre: "_rels/.rels",
            contenido:
                `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
                `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
                `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
                `</Relationships>`,
        },
        {
            nombre: "xl/workbook.xml",
            contenido:
                `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
                `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
                `<sheets><sheet name="${xml(hoja)}" sheetId="1" r:id="rId1"/></sheets>` +
                `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(hoja)}'!$A$1:$${ultima}$${Math.max(1, filas.length + 1)}</definedName></definedNames>` +
                `</workbook>`,
        },
        {
            nombre: "xl/_rels/workbook.xml.rels",
            contenido:
                `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
                `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
                `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
                `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
                `</Relationships>`,
        },
        { nombre: "xl/styles.xml", contenido: estilos },
        { nombre: "xl/worksheets/sheet1.xml", contenido: hojaXml },
    ]);
}

// ---------- leer .xlsx ----------

const desxml = (s) =>
    s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&amp;/g, "&");

const textoDe = (fragmento) => desxml([...fragmento.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

const columna = (ref) => {
    const letras = ref.replace(/\d+/g, "");
    let n = 0;
    for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
};

// Devuelve las hojas como { nombre, filas: [[celda, …], …] }. Las celdas son texto o número.
export function leerExcel(buf) {
    const zip = leerZip(buf);
    const leer = (nombre) => {
        const f = zip.get(nombre);
        const b = f && f();
        return b ? b.toString("utf8") : null;
    };
    const libro = leer("xl/workbook.xml");
    if (!libro) throw new Error("No es un archivo .xlsx válido");
    const rels = leer("xl/_rels/workbook.xml.rels") || "";
    const destinos = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])?.[1], /Target="([^"]+)"/.exec(m[0])?.[1]]));
    const compartidas = (leer("xl/sharedStrings.xml") || "").match(/<si>[\s\S]*?<\/si>/g)?.map(textoDe) || [];
    const hojas = [];
    for (const m of libro.matchAll(/<sheet\b[^>]*>/g)) {
        const nombre = desxml(/name="([^"]*)"/.exec(m[0])?.[1] || "");
        const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
        let destino = destinos.get(rid) || "";
        destino = destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`;
        const contenido = leer(destino);
        if (!contenido) continue;
        const filas = [];
        for (const fila of contenido.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
            const r = Number(/\br="(\d+)"/.exec(fila[0])?.[1]) || filas.length + 1;
            const celdas = [];
            for (const c of (fila[1] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
                const attrs = c[1];
                const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
                const tipo = /\bt="([^"]+)"/.exec(attrs)?.[1];
                const dentro = c[2] || "";
                const v = /<v>([\s\S]*?)<\/v>/.exec(dentro)?.[1];
                let valor = null;
                if (tipo === "s") valor = compartidas[Number(v)] ?? "";
                else if (tipo === "inlineStr") valor = textoDe(dentro);
                else if (tipo === "str" || tipo === "e") valor = v !== undefined ? desxml(v) : "";
                else if (tipo === "b") valor = v === "1" ? "Sí" : "No";
                else if (v !== undefined) valor = Number(v);
                if (ref) celdas[columna(ref)] = valor;
                else celdas.push(valor);
            }
            filas[r - 1] = celdas;
        }
        hojas.push({ nombre, filas: Array.from(filas, (f) => f || []) });
    }
    return hojas;
}

// Convierte lo que haya en una celda de fecha a «AAAA-MM-DD» (o null).
export function fechaDeCelda(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number" && v > 20000 && v < 80000) {
        const d = new Date(Math.round((v - 25569) * 86400000));
        return d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
    if (m) {
        const a = m[3].length === 2 ? `20${m[3]}` : m[3];
        return `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    return null;
}
