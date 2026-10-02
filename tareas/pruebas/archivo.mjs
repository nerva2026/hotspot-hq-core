// Prueba del archivo de documentos contra un servidor en marcha sin Google (como el paso «Probar el servidor»):
//   node pruebas/archivo.mjs http://127.0.0.1:3992/tareas <código de alta del registro>
// Crea dos cuentas (Diego y Víctor), sube un documento de cada tipo (Markdown, texto, PDF, fotos y Word, hechos aquí
// mismo, inventados) y comprueba la lista, los cambios, fijar, buscar, la papelera, los enlaces, lo que no debe entrar
// (tipos que no cuadran, demasiado grande, nombres con «../»), las cabeceras de los archivos y que un Markdown y un
// Word con trampas (<script>, javascript:…) salen escapados.
// Si el servidor tiene poco sitio (ARCHIVO_MAXIMO_MB=40, como en GitHub), también prueba el límite total.

import assert from "node:assert/strict";
import http from "node:http";
import { crearZip } from "../servidor/excel.js";
import { markdownAHtml, direccionSegura } from "../publico/app/markdown.js";

const [base, codigoAlta] = process.argv.slice(2);
if (!base || !codigoAlta) {
    console.error("Uso: node pruebas/archivo.mjs <url del tablón> <código de alta>");
    process.exit(2);
}

function cliente() {
    let galleta = "";
    const llamar = async function (metodo, ruta, cuerpo, { tipo, crudo = false, cabeceras: extra = {} } = {}) {
        const cabeceras = { "x-tablon": "1", ...extra };
        if (galleta) cabeceras.cookie = galleta;
        let body;
        if (cuerpo instanceof Uint8Array) {
            body = cuerpo;
            cabeceras["content-type"] = tipo || "application/octet-stream";
        } else if (cuerpo !== undefined) {
            body = JSON.stringify(cuerpo);
            cabeceras["content-type"] = "application/json";
        }
        const r = await fetch(`${base}/api/${ruta}`, { method: metodo, headers: cabeceras, body });
        const puesta = r.headers.get("set-cookie");
        if (puesta) galleta = puesta.split(";")[0];
        if (crudo) return r;
        const datos = await r.json().catch(() => null);
        return { estado: r.status, datos };
    };
    // Subir un archivo como lo hace la página: el contenido tal cual y el nombre en una cabecera.
    llamar.subir = (nombre, contenido, { carpeta, titulo, tipo } = {}) => {
        const cabeceras = { "x-nombre": encodeURIComponent(nombre) };
        if (carpeta) cabeceras["x-carpeta"] = encodeURIComponent(carpeta);
        if (titulo) cabeceras["x-titulo"] = encodeURIComponent(titulo);
        const bytes = typeof contenido === "string" ? new Uint8Array(Buffer.from(contenido, "utf8")) : new Uint8Array(contenido);
        return llamar("POST", "archivo/documentos", bytes, { tipo, cabeceras });
    };
    llamar.escuchar = async () => {
        const control = new AbortController();
        const r = await fetch(`${base}/api/eventos`, { headers: { cookie: galleta }, signal: control.signal });
        assert.equal(r.status, 200);
        const eventos = [];
        (async () => {
            const lector = r.body.getReader();
            const texto = new TextDecoder();
            let resto = "";
            try {
                for (;;) {
                    const { value, done } = await lector.read();
                    if (done) break;
                    resto += texto.decode(value, { stream: true });
                    let fin;
                    while ((fin = resto.indexOf("\n\n")) >= 0) {
                        const bloque = resto.slice(0, fin);
                        resto = resto.slice(fin + 2);
                        for (const linea of bloque.split("\n")) if (linea.startsWith("data: ")) eventos.push(JSON.parse(linea.slice(6)));
                    }
                }
            } catch {
                /* cerrado */
            }
        })();
        return {
            cerrar: () => control.abort(),
            async esperar(condicion, que) {
                for (let i = 0; i < 60; i++) {
                    const e = eventos.find(condicion);
                    if (e) return e;
                    await new Promise((listo) => setTimeout(listo, 50));
                }
                throw new Error(`No ha llegado: ${que}`);
            },
        };
    };
    return llamar;
}

// ---------- documentos de prueba (inventados) ----------

// Un PDF pequeño de verdad (una página con una frase), con su tabla de posiciones bien hecha.
function pdfDePrueba(frase = "Hola") {
    const objetos = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        null,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    const flujo = `BT /F1 24 Tf 30 100 Td (${frase}) Tj ET`;
    objetos[3] = `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`;
    let pdf = "%PDF-1.4\n";
    const posiciones = [];
    objetos.forEach((o, i) => {
        posiciones.push(pdf.length);
        pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posiciones.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
    pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf, "latin1");
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const WEBP = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64");
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);

const MARKDOWN = `# Manual de la sala de pruebas

Este documento es **inventado** para las pruebas del archivo. Habla de canciones y de la *sala de máquinas*.
Segunda línea del mismo párrafo.

## Tabla de cosas

| Cosa | Cuántas |
|:-----|-------:|
| Sillas | 4 |
| Mesas \\| grandes | 2 |

- [x] Hecho
- [ ] Pendiente
  - Anidado

1. Uno
2. Dos

> Una cita.

\`\`\`
const codigo = "<b>no es negrita</b>";
\`\`\`

---

## Trampas

<script>alert("md")</script>
<img src=x onerror=alert(1)>
<a href="javascript:alert(1)">enlace html</a>
[malo](javascript:alert(1)) [malo2](JAVASCRIPT:alert(1)) [malo3](&#106;avascript:alert(1)) [malo4](java	script:alert(1))
[datos](data:text/html,hola) [relativo](/tareas/api/datos) [protocolo](//ejemplo.com)
![foto](javascript:alert(1)) <javascript:alert(1)> \`<script>\`
[bueno](https://ejemplo.com/a?b=1&c=2 "título") y https://ejemplo.com/suelto, <correo@ejemplo.com> y [sección](#tabla-de-cosas)
`;

// Un Word pequeño: título, formatos, enlaces (uno bueno y otro con trampa), listas, una tabla, una imagen y texto
// tachado en revisión (que no debe salir).
function docxDePrueba() {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const run = (texto, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${texto}</w:t></w:r>`;
    const parrafo = (contenido, pPr = "") => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${contenido}</w:p>`;
    const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>
${parrafo(run("Presupuesto de la fiesta de prueba"), '<w:pStyle w:val="Ttulo1"/>')}
${parrafo(run("Texto normal, ") + run("negrita", "<w:b/>") + run(", ") + run("cursiva", "<w:i/>") + run(", ") + run("subrayado", '<w:u w:val="single"/>') + run(" y ") + run("tachado", "<w:strike/>") + run("."))}
${parrafo(run("Línea uno") + '<w:r><w:br/></w:r>' + run("línea dos"))}
${parrafo(run("&lt;script&gt;alert(\"docx\")&lt;/script&gt; &lt;img src=x onerror=alert(1)&gt;"))}
${parrafo(`<w:hyperlink r:id="rIdBueno">${run("enlace bueno")}</w:hyperlink> y <w:hyperlink r:id="rIdMalo">${run("enlace malo")}</w:hyperlink>`.replace(" y ", run(" y ")))}
${parrafo(`<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> HYPERLINK "https://ejemplo.org/campo" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run("enlace de campo")}<w:r><w:fldChar w:fldCharType="end"/></w:r>`)}
${parrafo(run("Viñeta uno"), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')}
${parrafo(run("Viñeta anidada"), '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>')}
${parrafo(run("Viñeta dos"), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')}
${parrafo(run("Paso uno"), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>')}
${parrafo(run("Paso dos"), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>')}
<w:tbl><w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc>${parrafo(run("Concepto"))}</w:tc><w:tc>${parrafo(run("Euros"))}</w:tc></w:tr>
<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>${parrafo(run("Celda doble"))}</w:tc></w:tr></w:tbl>
${parrafo('<w:r><w:drawing><wp:inline xmlns:wp="x"/></w:drawing></w:r>' + run("Debajo de la foto"))}
${parrafo(run("Se queda") + '<w:del><w:r><w:delText>BORRADO EN REVISION</w:delText></w:r></w:del>')}
<w:sectPr/></w:body></w:document>`;
    const estilos = `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}>
<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Ttulo1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/></w:rPr></w:style>
</w:styles>`;
    const numeracion = `<?xml version="1.0" encoding="UTF-8"?><w:numbering ${W}>
<w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="20"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="20"/></w:num>
</w:numbering>`;
    const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdBueno" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://ejemplo.com/ruta?x=1&amp;y=2" TargetMode="External"/>
<Relationship Id="rIdMalo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/>
</Relationships>`;
    return crearZip([
        { nombre: "[Content_Types].xml", contenido: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
        {
            nombre: "_rels/.rels",
            contenido: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        },
        { nombre: "word/document.xml", contenido: documento },
        { nombre: "word/styles.xml", contenido: estilos },
        { nombre: "word/numbering.xml", contenido: numeracion },
        { nombre: "word/_rels/document.xml.rels", contenido: rels },
    ]);
}

// Lo que no puede salir nunca en el HTML que se enseña.
function sinTrampas(html, que) {
    assert.doesNotMatch(html, /<script/i, `${que}: <script>`);
    assert.doesNotMatch(html, /<img/i, `${que}: <img>`);
    assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i, `${que}: atributo on…=`);
    assert.doesNotMatch(html, /(href|src)\s*=\s*["']?\s*(javascript|data|vbscript):/i, `${que}: enlace peligroso`);
    for (const [, href] of html.matchAll(/href="([^"]*)"/g)) assert.match(href, /^(https?:|mailto:|#doc-)/, `${que}: enlace raro ${href}`);
}

// ---------- empieza ----------

const diego = cliente();
const victor = cliente();

let r = await diego("POST", "alta", { codigo: codigoAlta, nombre: "Diego", clave: "una clave muy larga", color: "#e0562a" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
r = await diego("POST", "invitar", { tipo: "alta" });
assert.equal(r.estado, 200);
r = await victor("POST", "alta", { codigo: r.datos.codigo, nombre: "Víctor", clave: "otra clave muy larga", color: "#3b82c4" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
const idVictor = r.datos.yo.id;
const idDiego = r.datos.usuarios.find((u) => u.nombre === "Diego").id;

// Sin sesión no se ve nada; sin la cabecera propia no se cambia nada
assert.equal((await fetch(`${base}/api/archivo`)).status, 401);
assert.equal((await fetch(`${base}/api/archivo/buscar?q=hola`)).status, 401);
assert.equal((await fetch(`${base}/api/archivo/documentos`, { method: "POST", headers: { "x-tablon": "1" }, body: "hola" })).status, 401);
const sinCabecera = await fetch(`${base}/api/archivo/documentos`, { method: "POST", body: "hola" });
assert.equal(sinCabecera.status, 403);

// Vacío al principio
r = await diego("GET", "archivo");
assert.equal(r.estado, 200);
assert.deepEqual(r.datos.documentos, []);
assert.deepEqual(r.datos.papelera, []);
assert.equal(r.datos.yo.id, idDiego);
assert.equal(typeof r.datos.yo.libro, "boolean");
assert.equal(r.datos.limites.archivo, 25 * 1024 * 1024);
assert.equal(r.datos.limites.usado, 0);
const limiteTotal = r.datos.limites.total;

// ---------- subir uno de cada ----------

const ojosVictor = await victor.escuchar();

r = await diego.subir("Manual de pruebas.md", MARKDOWN, { carpeta: "Guías" });
assert.equal(r.estado, 201, JSON.stringify(r.datos));
const md = r.datos;
assert.equal(md.tipo, "md");
assert.equal(md.titulo, "Manual de la sala de pruebas", "el título sale del primer título del Markdown");
assert.equal(md.carpeta, "Guías");
assert.equal(md.nombre, "Manual de pruebas.md");
assert.equal(md.autor, idDiego);
assert.equal(md.tamano, Buffer.byteLength(MARKDOWN));
assert.equal(md.mime, "text/markdown; charset=utf-8");
assert.equal(md.fijado, false);
let ev = await ojosVictor.esperar((e) => e.tipo === "archivo" && e.id === md.id, "el aviso del documento nuevo");
assert.equal(ev.accion, "nuevo");
assert.equal(ev.autor, idDiego);

r = await victor.subir("notas_de_la_reunion.txt", "Lista de la compra: canción, café y una mesa.\nSegunda línea.", { carpeta: "guías" });
assert.equal(r.estado, 201, JSON.stringify(r.datos));
const txt = r.datos;
assert.equal(txt.tipo, "txt");
assert.equal(txt.titulo, "notas de la reunion", "el título sale del nombre del archivo");
assert.equal(txt.carpeta, "Guías", "la carpeta se junta con la que ya existe aunque se escriba distinto");

// Un .txt viejo de Windows (no es UTF-8): se entiende igual
const viejo = Buffer.concat([Buffer.from("Receta de la pi"), Buffer.from([0xf1]), Buffer.from("a colada para la fiesta")]);
r = await victor.subir("receta.txt", viejo);
assert.equal(r.estado, 201, JSON.stringify(r.datos));
const receta = r.datos;
assert.equal(receta.mime, "text/plain; charset=windows-1252");

r = await diego.subir("Factura de prueba.pdf", pdfDePrueba("Factura"), { tipo: "application/pdf" });
assert.equal(r.estado, 201, JSON.stringify(r.datos));
const pdf = r.datos;
assert.equal(pdf.tipo, "pdf");
assert.equal(pdf.titulo, "Factura de prueba");
assert.equal(pdf.carpeta, "");

const fotos = {};
for (const [nombre, bytes, mime] of [
    ["punto.png", PNG, "image/png"],
    ["punto.gif", GIF, "image/gif"],
    ["punto.webp", WEBP, "image/webp"],
    ["punto.jpeg", JPG, "image/jpeg"],
]) {
    r = await victor.subir(nombre, bytes, { carpeta: "Fotos" });
    assert.equal(r.estado, 201, `${nombre}: ${JSON.stringify(r.datos)}`);
    assert.equal(r.datos.tipo, "imagen");
    assert.equal(r.datos.mime, mime);
    fotos[nombre] = r.datos;
}
// Una foto con la extensión cambiada sigue siendo una foto: se guarda con su tipo de verdad
r = await victor.subir("en-realidad-png.jpg", PNG);
assert.equal(r.estado, 201);
assert.equal(r.datos.mime, "image/png");

r = await diego.subir("Presupuesto.docx", docxDePrueba(), { carpeta: "Guías" });
assert.equal(r.estado, 201, JSON.stringify(r.datos));
const docx = r.datos;
assert.equal(docx.tipo, "docx");
assert.equal(docx.titulo, "Presupuesto de la fiesta de prueba", "el título sale del primer título del Word");
assert.equal(docx.imagenes, 1);

// Sin extensión: se mira qué es por dentro
r = await diego.subir("documento-maestro", "# Documento sin extensión\n\n- uno\n- dos\n");
assert.equal(r.estado, 201, JSON.stringify(r.datos));
assert.equal(r.datos.tipo, "md");
assert.equal(r.datos.titulo, "Documento sin extensión");
const sinExtension = r.datos;
r = await diego.subir("apunte", "Solo un apunte sin marcas.");
assert.equal(r.datos.tipo, "txt");
const apunte = r.datos;
r = await diego.subir("escaneo", pdfDePrueba("Escaneo"));
assert.equal(r.datos.tipo, "pdf");
const escaneo = r.datos;

// ---------- lo que no entra ----------

const rechazado = async (nombre, contenido, que, estado = 400) => {
    const x = await diego.subir(nombre, contenido);
    assert.equal(x.estado, estado, `${que}: ${JSON.stringify(x.datos)}`);
    assert.ok(x.datos?.error, `${que}: sin mensaje`);
    return x.datos.error;
};
assert.match(await rechazado("foto.png", "esto es texto, no una foto", "texto disfrazado de foto"), /no es una foto/);
assert.match(await rechazado("informe.pdf", "<html><script>alert(1)</script></html>", "HTML disfrazado de PDF"), /no es un PDF/);
await rechazado("foto.jpg", pdfDePrueba(), "PDF disfrazado de foto");
await rechazado("carta.docx", Buffer.from("PK\u0003\u0004 esto no es un zip de verdad"), "zip falso");
await rechazado("vacio.docx", crearZip([{ nombre: "hola.txt", contenido: "hola" }]), "zip sin documento de Word");
await rechazado("otra.docx", "no es un zip", "texto disfrazado de Word");
assert.match(await rechazado("binario.md", Buffer.from([0x68, 0x6f, 0x6c, 0x61, 0x00, 0x00, 0x01, 0x02]), "binario disfrazado de Markdown"), /no parece un texto/);
assert.match(await rechazado("pdf.md", pdfDePrueba(), "PDF disfrazado de Markdown"), /PDF/);
assert.match(await rechazado("dibujo.svg", "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "SVG"), /no se pueden subir/);
await rechazado("pagina.html", "<script>alert(1)</script>", "HTML");
await rechazado("programa.exe", Buffer.from("MZ\u0090\u0000"), "programa");
assert.match(await rechazado("viejo.doc", "x".repeat(20), ".doc antiguo"), /\.docx/);
await rechazado("vacio.md", "", "archivo vacío");

// Demasiado grande: textos de más de 5 MB y cualquier cosa de más de 25 MB
await rechazado("enorme.md", "a".repeat(5 * 1024 * 1024 + 10), "Markdown de más de 5 MB", 413);
const grande = Buffer.alloc(25 * 1024 * 1024 + 1, 0x20);
grande.write("%PDF-1.4\n");
assert.match(await rechazado("enorme.pdf", grande, "PDF de más de 25 MB", 413), /25 MB/);

// Nombres con carpetas («../»): se quedan solo con el nombre; en disco el nombre lo pone el servidor
r = await diego.subir("../../../tablon.json.md", "# Intento\n\nnada");
assert.equal(r.estado, 201);
assert.equal(r.datos.nombre, "tablon.json.md");
const intento1 = r.datos;
r = await diego.subir("..\\..\\secreto.txt", "nada");
assert.equal(r.datos.nombre, "secreto.txt");
const intento2 = r.datos;
r = await diego.subir("..", "nada de nada");
assert.equal(r.datos.nombre, "documento");
const intento3 = r.datos;
for (const ruta of ["archivo/documentos/..%2F..%2Ftablon.json/archivo", "archivo/documentos/..%2F..%2Ftablon.json", `archivo/documentos/${md.id}%2F..%2F..%2Ftablon.json/archivo`]) {
    assert.equal((await diego("GET", ruta)).estado, 404, ruta);
}
const crudo = await new Promise((listo, fallo) => {
    const u = new URL(base);
    const req = http.request({ host: u.hostname, port: u.port, path: `${u.pathname}/api/archivo/documentos/../../../tablon.json`, headers: { "x-tablon": "1" } }, (res) => {
        res.resume();
        listo(res.statusCode);
    });
    req.on("error", fallo);
    req.end();
});
assert.equal(crudo, 404, "con «../» en la dirección no se sale de la API");

// ---------- la lista ----------

r = await victor("GET", "archivo");
assert.equal(r.estado, 200);
const lista = r.datos.documentos;
for (const d of [md, txt, receta, pdf, docx, sinExtension, apunte, escaneo]) assert.ok(lista.some((x) => x.id === d.id), `falta ${d.nombre}`);
assert.equal(lista.find((x) => x.id === md.id).autor, idDiego);
assert.ok(!("archivo" in lista[0]) && !("ext" in lista[0]) && !("codificacion" in lista[0]), "lo de dentro del servidor no sale");
assert.ok(r.datos.limites.usado > 0);
assert.ok(lista.every((d, i) => i === 0 || d.creado <= lista[i - 1].creado), "lo más nuevo, primero");

// ---------- ver cada uno ----------

r = await victor("GET", `archivo/documentos/${md.id}`);
assert.equal(r.estado, 200);
assert.equal(r.datos.texto, MARKDOWN, "el Markdown llega tal cual (lo pinta la página)");
assert.equal(r.datos.documento.titulo, md.titulo);

r = await victor("GET", `archivo/documentos/${receta.id}`);
assert.equal(r.datos.texto, "Receta de la piña colada para la fiesta");

r = await victor("GET", `archivo/documentos/${docx.id}`);
assert.equal(r.estado, 200);
const htmlWord = r.datos.html;
sinTrampas(htmlWord, "Word");
assert.match(htmlWord, /<h1>Presupuesto de la fiesta de prueba<\/h1>/);
assert.match(htmlWord, /<strong>negrita<\/strong>/);
assert.match(htmlWord, /<em>cursiva<\/em>/);
assert.match(htmlWord, /<u>subrayado<\/u>/);
assert.match(htmlWord, /<s>tachado<\/s>/);
assert.match(htmlWord, /Línea uno<br>línea dos/);
assert.match(htmlWord, /&lt;script&gt;alert\(&quot;docx&quot;\)&lt;\/script&gt; &lt;img src=x onerror=alert\(1\)&gt;/);
assert.match(htmlWord, /<a href="https:\/\/ejemplo\.com\/ruta\?x=1&amp;y=2">enlace bueno<\/a>/);
assert.match(htmlWord, /enlace malo/);
assert.doesNotMatch(htmlWord, /<a[^>]*>enlace malo/, "el enlace con javascript: se queda en texto");
assert.match(htmlWord, /<a href="https:\/\/ejemplo\.org\/campo">enlace de campo<\/a>/);
assert.match(htmlWord, /<ul><li>Viñeta uno<ul><li>Viñeta anidada<\/li><\/ul><\/li><li>Viñeta dos<\/li><\/ul>/);
assert.match(htmlWord, /<ol><li>Paso uno<\/li><li>Paso dos<\/li><\/ol>/);
assert.match(htmlWord, /<table><tbody><tr><th><p>Concepto<\/p><\/th><th><p>Euros<\/p><\/th><\/tr><tr><td colspan="2"><p>Celda doble<\/p><\/td><\/tr><\/tbody><\/table>/);
assert.match(htmlWord, /<span class="imagen-omitida">\[imagen\]<\/span>Debajo de la foto/);
assert.doesNotMatch(htmlWord, /BORRADO EN REVISION/);
for (const [, etiqueta] of htmlWord.matchAll(/<\/?([a-z0-9]+)/g)) {
    assert.ok(["h1", "h2", "h3", "h4", "h5", "h6", "p", "strong", "em", "u", "s", "br", "ul", "ol", "li", "table", "tbody", "tr", "th", "td", "a", "span"].includes(etiqueta), `etiqueta inesperada en el Word: ${etiqueta}`);
}

r = await victor("GET", `archivo/documentos/${pdf.id}`);
assert.equal(r.estado, 200);
assert.equal(r.datos.texto, undefined);
assert.equal((await victor("GET", "archivo/documentos/NoExiste123")).estado, 404);

// El Markdown con trampas, tal como lo pinta la página
const pintado = markdownAHtml(MARKDOWN);
sinTrampas(pintado.html, "Markdown");
assert.match(pintado.html, /&lt;script&gt;alert\(&quot;md&quot;\)&lt;\/script&gt;/);
assert.match(pintado.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
assert.match(pintado.html, /<h2 id="doc-manual-de-la-sala-de-pruebas" class="t1" tabindex="-1">Manual de la sala de pruebas<\/h2>/);
assert.match(pintado.html, /<strong>inventado<\/strong>/);
assert.match(pintado.html, /<em>sala de máquinas<\/em>\.<br>Segunda línea/);
assert.match(pintado.html, /<th class="al-izq">Cosa<\/th><th class="al-der">Cuántas<\/th>/);
assert.match(pintado.html, /<td class="al-izq">Mesas \| grandes<\/td>/);
assert.match(pintado.html, /<li class="tarea"><input type="checkbox" disabled checked> Hecho<\/li>/);
assert.match(pintado.html, /<li class="tarea"><input type="checkbox" disabled> Pendiente<ul><li>Anidado<\/li><\/ul><\/li>/);
assert.match(pintado.html, /<ol><li>Uno<\/li><li>Dos<\/li><\/ol>/);
assert.match(pintado.html, /<blockquote><p>Una cita\.<\/p><\/blockquote>/);
assert.match(pintado.html, /<pre class="codigo" tabindex="0"><code>const codigo = &quot;&lt;b&gt;no es negrita&lt;\/b&gt;&quot;;<\/code><\/pre>/);
assert.match(pintado.html, /<hr>/);
assert.match(pintado.html, /<a href="https:\/\/ejemplo\.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">bueno<\/a>/);
assert.match(pintado.html, /<a href="https:\/\/ejemplo\.com\/suelto" target="_blank" rel="noopener noreferrer">https:\/\/ejemplo\.com\/suelto<\/a>,/);
assert.match(pintado.html, /<a href="mailto:correo@ejemplo\.com" target="_blank" rel="noopener noreferrer">correo@ejemplo\.com<\/a>/);
assert.match(pintado.html, /<a href="#doc-tabla-de-cosas" class="ancla">sección<\/a>/);
assert.match(pintado.html, /<code>&lt;script&gt;<\/code>/);
assert.deepEqual(
    pintado.titulos.map((t) => [t.nivel, t.texto]),
    [
        [1, "Manual de la sala de pruebas"],
        [2, "Tabla de cosas"],
        [2, "Trampas"],
    ],
);
for (const malo of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "java\tscript:alert(1)", "data:text/html,x", "vbscript:x", "//ejemplo.com", "/tareas/api/datos", "file:///etc/passwd"]) {
    assert.equal(direccionSegura(malo), null, malo);
}
assert.deepEqual(direccionSegura("#Tabla de cosas"), { ancla: "doc-tabla-de-cosas" });

// ---------- las cabeceras al servir los archivos ----------

const cabeceras = async (d, consulta = "") => {
    const res = await victor("GET", `archivo/documentos/${d.id}/archivo${consulta}`, undefined, { crudo: true });
    assert.equal(res.status, 200, d.nombre);
    const cuerpo = Buffer.from(await res.arrayBuffer());
    return { h: (n) => res.headers.get(n) || "", cuerpo };
};
let c = await cabeceras(md);
assert.equal(c.h("content-type"), "text/markdown; charset=utf-8");
assert.equal(c.h("x-content-type-options"), "nosniff");
assert.match(c.h("content-disposition"), /^attachment; filename="Manual de pruebas\.md"; filename\*=UTF-8''Manual%20de%20pruebas\.md$/);
assert.match(c.h("content-security-policy"), /^sandbox/);
assert.equal(c.cuerpo.toString("utf8"), MARKDOWN);
c = await cabeceras(fotos["punto.png"]);
assert.equal(c.h("content-type"), "image/png");
assert.match(c.h("content-disposition"), /^inline/);
assert.match(c.h("content-security-policy"), /^sandbox/);
assert.equal(c.h("x-content-type-options"), "nosniff");
assert.deepEqual(c.cuerpo, PNG);
c = await cabeceras(pdf);
assert.equal(c.h("content-type"), "application/pdf");
assert.match(c.h("content-disposition"), /^inline; filename="Factura de prueba\.pdf"/);
assert.equal(c.h("content-security-policy"), "", "el PDF va sin sandbox (el visor del navegador lo necesita)");
assert.equal(c.h("x-content-type-options"), "nosniff");
assert.equal(c.cuerpo.subarray(0, 5).toString(), "%PDF-");
c = await cabeceras(pdf, "?descargar=1");
assert.match(c.h("content-disposition"), /^attachment/);
c = await cabeceras(docx);
assert.equal(c.h("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
assert.match(c.h("content-disposition"), /^attachment/);
assert.match(c.h("content-security-policy"), /^sandbox/);
c = await cabeceras(receta);
assert.equal(c.h("content-type"), "text/plain; charset=windows-1252");
c = await cabeceras(txt);
assert.match(c.h("content-disposition"), /filename\*=UTF-8''notas_de_la_reunion\.txt/);
assert.equal((await fetch(`${base}/api/archivo/documentos/${pdf.id}/archivo`)).status, 401, "sin sesión no se descarga");
const cabeza = await victor("HEAD", `archivo/documentos/${pdf.id}/archivo`, undefined, { crudo: true });
assert.equal(cabeza.status, 200);

// ---------- cambiar, fijar ----------

r = await victor("PATCH", `archivo/documentos/${md.id}`, { titulo: "   Manual   nuevo  ", descripcion: "Para probar.\nCon dos líneas.", carpeta: "  guías ", fijado: true, autor: idVictor, tipo: "pdf" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
assert.equal(r.datos.titulo, "Manual nuevo");
assert.equal(r.datos.descripcion, "Para probar.\nCon dos líneas.");
assert.equal(r.datos.carpeta, "Guías");
assert.equal(r.datos.fijado, true);
assert.equal(r.datos.autor, idDiego, "quién lo subió no se cambia");
assert.equal(r.datos.tipo, "md", "el tipo no se cambia");
assert.equal(r.datos.actualizadoPor, idVictor);
assert.equal((await victor("PATCH", `archivo/documentos/${md.id}`, { titulo: "  " })).estado, 400, "sin título no");
r = await victor("PATCH", `archivo/documentos/${md.id}`, { titulo: "x".repeat(500) });
assert.equal(r.datos.titulo.length, 200);
await victor("PATCH", `archivo/documentos/${md.id}`, { titulo: "Manual nuevo" });
r = await diego("GET", "archivo");
assert.equal(r.datos.documentos.find((d) => d.id === md.id).fijado, true);
r = await victor("PATCH", `archivo/documentos/${pdf.id}`, { carpeta: "Facturas" });
assert.equal(r.datos.carpeta, "Facturas");
assert.equal((await victor("PATCH", "archivo/documentos/NoExiste123", { titulo: "x" })).estado, 404);

// ---------- buscar ----------

const buscar = async (q) => (await diego("GET", `archivo/buscar?q=${encodeURIComponent(q)}`)).datos.resultados;
let res = await buscar("canciones");
assert.equal(res.length, 1);
assert.equal(res[0].id, md.id);
assert.match(res[0].fragmento, /Habla de canciones y de la sala de máquinas/, "el trozo va sin las marcas del Markdown");
assert.equal(res[0].coincidencias, 1);
assert.equal((await buscar("CANCIONES"))[0].id, md.id, "sin mayúsculas");
assert.equal((await buscar("maquinas"))[0].id, md.id, "sin tildes");
assert.equal((await buscar("piña"))[0].id, receta.id, "en un .txt de Windows");
res = await buscar("cafe");
assert.equal(res[0].id, txt.id);
assert.match(res[0].fragmento, /café/);
res = await buscar("viñeta anidada");
assert.equal(res[0].id, docx.id, "dentro del Word");
res = await buscar("manual");
assert.equal(res[0].id, md.id, "lo que coincide en el título, primero");
assert.equal((await buscar("sala canciones")).length, 1, "varias palabras: todas tienen que estar");
assert.deepEqual(await buscar("sala zzzzzz"), []);
assert.deepEqual(await buscar("a"), [], "con una letra no se busca");
assert.equal((await buscar("dos líneas"))[0].id, md.id, "también en la descripción");
assert.equal((await buscar("facturas"))[0].id, pdf.id, "y en la carpeta");

// ---------- papelera ----------

r = await victor("DELETE", `archivo/documentos/${md.id}`);
assert.equal(r.estado, 200);
ev = await ojosVictor.esperar((e) => e.tipo === "archivo" && e.accion === "cambiado" && e.id === md.id, "el aviso del cambio");
r = await diego("GET", "archivo");
assert.ok(!r.datos.documentos.some((d) => d.id === md.id));
const enPapelera = r.datos.papelera.find((d) => d.id === md.id);
assert.ok(enPapelera);
assert.equal(enPapelera.borradoPor, idVictor);
assert.ok(enPapelera.borrado);
r = await diego("GET", `archivo/documentos/${md.id}`);
assert.equal(r.estado, 404);
assert.equal(r.datos.papelera, true);
assert.equal((await diego("GET", `archivo/documentos/${md.id}/archivo`)).estado, 404);
assert.deepEqual(await buscar("canciones"), [], "lo de la papelera no sale al buscar");
assert.equal((await diego("PATCH", `archivo/documentos/${md.id}`, { titulo: "x" })).estado, 404);
r = await diego("POST", `archivo/documentos/${md.id}/restaurar`);
assert.equal(r.estado, 200);
assert.equal(r.datos.borrado, undefined);
assert.equal((await buscar("canciones"))[0].id, md.id);
r = await diego("GET", `archivo/documentos/${md.id}`);
assert.equal(r.estado, 200);
assert.equal(r.datos.documento.fijado, true, "vuelve como estaba");

// Borrar del todo: solo desde la papelera, y solo quien lo subió o quien administra
assert.equal((await diego("POST", `archivo/documentos/${apunte.id}/eliminar`)).estado, 400, "antes, a la papelera");
await diego("DELETE", `archivo/documentos/${apunte.id}`);
await victor("DELETE", `archivo/documentos/${receta.id}`);
r = await diego("GET", "archivo");
const victorEsAdmin = r.datos.usuarios.find((u) => u.id === idVictor).admin;
r = await diego("POST", `archivo/documentos/${apunte.id}/eliminar`);
assert.equal(r.estado, 200);
r = await diego("GET", "archivo");
assert.ok(!r.datos.papelera.some((d) => d.id === apunte.id), "ya no está ni en la papelera");
assert.equal((await diego("GET", `archivo/documentos/${apunte.id}`)).estado, 404);
assert.equal((await diego("POST", `archivo/documentos/${apunte.id}/restaurar`)).estado, 404);
if (!victorEsAdmin) {
    // Diego (el primero, que administra) sí puede con lo que subió Víctor
    r = await victor("POST", `archivo/documentos/${pdf.id}/restaurar`);
    await diego("DELETE", `archivo/documentos/${pdf.id}`);
    assert.equal((await victor("POST", `archivo/documentos/${pdf.id}/eliminar`)).estado, 403, "Víctor no subió el PDF ni administra");
    await victor("POST", `archivo/documentos/${pdf.id}/restaurar`);
}
assert.equal((await diego("POST", `archivo/documentos/${receta.id}/eliminar`)).estado, 200);

// ---------- enlaces ----------

r = await victor("POST", "archivo/enlaces", { url: "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit?usp=sharing", titulo: "Guion de la fiesta", carpeta: "Guías", descripcion: "En Drive." });
assert.equal(r.estado, 201, JSON.stringify(r.datos));
const enlace = r.datos;
assert.equal(enlace.tipo, "enlace");
assert.equal(enlace.servicio, "Google Docs");
assert.equal(enlace.incrustar, "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/preview");
assert.equal(enlace.carpeta, "Guías");
assert.equal(enlace.tamano, undefined);
r = await victor("POST", "archivo/enlaces", { url: "docs.google.com/spreadsheets/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765/edit#gid=0" });
assert.equal(r.estado, 201);
assert.equal(r.datos.url, "https://docs.google.com/spreadsheets/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765/edit#gid=0", "sin https:// delante, se le pone");
assert.equal(r.datos.servicio, "Hojas de Google");
assert.equal(r.datos.titulo, "docs.google.com", "sin título: el nombre de la web");
const hoja = r.datos;
r = await victor("POST", "archivo/enlaces", { url: "https://docs.google.com/presentation/u/1/d/1PrEsEnTaCiOn1234567890/edit", titulo: "Presentación" });
assert.equal(r.datos.incrustar, "https://docs.google.com/presentation/d/1PrEsEnTaCiOn1234567890/preview");
const presentacion = r.datos;
r = await victor("POST", "archivo/enlaces", { url: "https://drive.google.com/file/d/1ArChIvOdEdRiVe12345/view?usp=drive_link", titulo: "Vídeo" });
assert.equal(r.datos.incrustar, "https://drive.google.com/file/d/1ArChIvOdEdRiVe12345/preview");
const video = r.datos;
r = await victor("POST", "archivo/enlaces", { url: "https://drive.google.com/drive/folders/1CaRpEtAdEdRiVe12345", titulo: "Carpeta" });
assert.equal(r.datos.incrustar, "https://drive.google.com/embeddedfolderview?id=1CaRpEtAdEdRiVe12345#list");
const carpetaDrive = r.datos;
r = await victor("POST", "archivo/enlaces", { url: "https://ejemplo.com/pagina?a=1", titulo: "Una web" });
assert.equal(r.estado, 201);
assert.equal(r.datos.incrustar, null);
assert.equal(r.datos.servicio, null);
const web = r.datos;
for (const malo of ["http://ejemplo.com", "javascript:alert(1)", "ftp://ejemplo.com/x", "https://usuario:clave@ejemplo.com/", "", "no es una dirección", "data:text/html,hola"]) {
    r = await victor("POST", "archivo/enlaces", { url: malo, titulo: "Malo" });
    assert.equal(r.estado, 400, `${malo}: ${JSON.stringify(r.datos)}`);
}
r = await victor("PATCH", `archivo/documentos/${web.id}`, { url: "http://ejemplo.com" });
assert.equal(r.estado, 400, "al cambiarlo, también solo https");
r = await victor("PATCH", `archivo/documentos/${web.id}`, { url: "https://docs.google.com/document/d/1OtRoDoCuMeNtO12345/edit" });
assert.equal(r.datos.servicio, "Google Docs");
assert.equal(r.datos.incrustar, "https://docs.google.com/document/d/1OtRoDoCuMeNtO12345/preview");
assert.equal((await victor("GET", `archivo/documentos/${web.id}/archivo`)).estado, 404, "un enlace no tiene archivo");
r = await victor("PATCH", `archivo/documentos/${pdf.id}`, { url: "https://ejemplo.com" });
assert.equal(r.datos.url, undefined, "a un archivo no se le pone dirección");

// ---------- el límite total (solo si el servidor tiene poco sitio) ----------

const MB = 1024 * 1024;
if (limiteTotal <= 64 * MB) {
    const usado = (await diego("GET", "archivo")).datos.limites.usado;
    const bloque = Math.min(24 * MB, Math.floor((limiteTotal - usado) * 0.6));
    const gordo = Buffer.alloc(bloque, 0x20);
    gordo.write("%PDF-1.4\n");
    r = await diego.subir("gordo-1.pdf", gordo);
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    const gordo1 = r.datos;
    r = await diego.subir("gordo-2.pdf", gordo);
    assert.equal(r.estado, 413, "ya no cabe");
    assert.match(r.datos.error, /lleno/);
    await diego("DELETE", `archivo/documentos/${gordo1.id}`);
    r = await diego.subir("gordo-2.pdf", gordo);
    assert.equal(r.estado, 201, "lo de la papelera no cuenta");
    await diego("DELETE", `archivo/documentos/${r.datos.id}`);
    await diego("POST", `archivo/documentos/${r.datos.id}/eliminar`);
    await diego("POST", `archivo/documentos/${gordo1.id}/eliminar`);
    console.log(`(límite total de ${Math.round(limiteTotal / MB)} MB: probado)`);
} else {
    console.log(`(límite total de ${Math.round(limiteTotal / MB)} MB: sin probar; arranca el servidor con ARCHIVO_MAXIMO_MB=40)`);
}

// ---------- la página ----------

const pagina = await fetch(`${base}/archivo/`);
assert.equal(pagina.status, 200);
assert.match(await pagina.text(), /<title>Archivo · HOT SPOT S\.L\.<\/title>/);
const csp = pagina.headers.get("content-security-policy") || "";
assert.match(csp, /frame-ancestors 'self'/);
assert.match(csp, /frame-src 'self' https:\/\/docs\.google\.com https:\/\/drive\.google\.com/);
assert.match(csp, /script-src 'self'(;|$)/);
assert.doesNotMatch((await fetch(`${base}/`)).headers.get("content-security-policy") || "", /frame-src/, "las demás pantallas siguen sin marcos de fuera");
const sinBarra = await fetch(`${base}/archivo`, { redirect: "manual" });
assert.equal(sinBarra.status, 301);
assert.equal(new URL(sinBarra.headers.get("location"), base).pathname, new URL(`${base}/archivo/`).pathname);
for (const archivo of ["app/archivo.js", "app/markdown.js", "archivo/archivo.css"]) assert.equal((await fetch(`${base}/${archivo}`)).status, 200, archivo);
assert.match(await (await fetch(`${base}/app/principal.js`)).text(), /href: "archivo\/"/, "el tablón lleva al archivo desde el menú de la cuenta");

ojosVictor.cerrar();
// Se deja recogido: lo que se ha subido para probar, fuera.
for (const d of [md, txt, pdf, docx, sinExtension, escaneo, intento1, intento2, intento3, enlace, hoja, presentacion, video, carpetaDrive, web, ...Object.values(fotos)]) {
    await diego("DELETE", `archivo/documentos/${d.id}`);
}
console.log("Archivo: bien");
