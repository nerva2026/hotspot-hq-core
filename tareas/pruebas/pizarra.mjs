// Prueba de la pizarra compartida contra un servidor en marcha sin Google (como el paso «Probar el servidor»):
//   node pruebas/pizarra.mjs http://127.0.0.1:3997/tareas <código de alta del registro>
// Crea dos cuentas (Diego y Víctor) con la pizarra abierta a la vez, y comprueba trazos, notas, fotos, quitar y
// volver a poner, vaciar y recuperar, el lápiz en directo, quién la tiene abierta y la página.

import assert from "node:assert/strict";

const [base, codigoAlta] = process.argv.slice(2);
if (!base || !codigoAlta) {
    console.error("Uso: node pruebas/pizarra.mjs <url del tablón> <código de alta>");
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
    // Los avisos en directo de una pizarra, como los recibe el navegador (EventSource).
    llamar.escuchar = async (pizarra) => {
        const control = new AbortController();
        const r = await fetch(`${base}/api/eventos?pizarra=${pizarra}`, { headers: { cookie: galleta }, signal: control.signal });
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
            eventos,
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

const diego = cliente();
const victor = cliente();
const P = "pizarras/reuniones";

// Cuentas
let r = await diego("POST", "alta", { codigo: codigoAlta, nombre: "Diego", clave: "una clave muy larga", color: "#e0562a" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
r = await diego("POST", "invitar", { tipo: "alta" });
assert.equal(r.estado, 200);
r = await victor("POST", "alta", { codigo: r.datos.codigo, nombre: "Víctor", clave: "otra clave muy larga", color: "#3b82c4" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
const idVictor = r.datos.yo.id;
const idDiego = r.datos.usuarios.find((u) => u.nombre === "Diego").id;

// Sin sesión no se ve; sin la cabecera propia no se cambia
assert.equal((await fetch(`${base}/api/${P}`)).status, 401);
const sinCabecera = await fetch(`${base}/api/${P}/elementos`, { method: "POST", body: "{}" });
assert.equal(sinCabecera.status, 403);

// La primera vez está en blanco (y mirarla no la crea)
r = await diego("GET", P);
assert.equal(r.estado, 200);
assert.equal(r.datos.pizarra.nombre, "Pizarra de reuniones");
assert.deepEqual(r.datos.pizarra.elementos, []);
assert.equal(r.datos.yo.id, idDiego);
assert.equal(typeof r.datos.yo.libro, "boolean");
r = await diego("GET", "pizarras");
assert.deepEqual(r.datos.pizarras, []);
assert.equal((await diego("GET", "pizarras/NO-VALE")).estado, 404);

// Los dos con la pizarra abierta: cada uno ve que el otro está
const ojosDiego = await diego.escuchar("reuniones");
const ojosVictor = await victor.escuchar("reuniones");
await ojosDiego.esperar((e) => e.tipo === "pizarra-presentes" && e.usuarios.includes(idVictor) && e.usuarios.includes(idDiego), "Víctor ha entrado");
r = await victor("GET", P);
assert.deepEqual([...r.datos.presentes].sort(), [idDiego, idVictor].sort());

// Un trazo de Diego: se guarda como llega (colores y grosores de la lista) y Víctor lo recibe
r = await diego("POST", `${P}/elementos`, { id: "trazo-prueba-1", tipo: "trazo", color: "#e0303a", grosor: 12, puntos: [10, 10, 50, 50, 90, 20] });
assert.equal(r.estado, 201, JSON.stringify(r.datos));
assert.equal(r.datos.id, "trazo-prueba-1");
assert.equal(r.datos.autor, idDiego);
let ev = await ojosVictor.esperar((e) => e.tipo === "pizarra" && e.accion === "poner" && e.elementos[0].id === "trazo-prueba-1", "el trazo de Diego");
assert.equal(ev.autor, idDiego);
assert.equal(ev.pizarra, "reuniones");
r = await diego("POST", `${P}/elementos`, { id: "trazo-prueba-2", tipo: "trazo", color: "red", grosor: 7, puntos: [0, 0, 99999, -99999] });
assert.equal(r.estado, 201);
assert.equal(r.datos.color, "#1c1715", "un color que no está en la lista se cambia por el negro");
assert.equal(r.datos.grosor, 6);
assert.deepEqual(r.datos.puntos, [0, 0, 2020, -100], "los puntos no se salen más de 100 de la pizarra");
assert.equal((await diego("POST", `${P}/elementos`, { id: "trazo-prueba-1", tipo: "trazo", puntos: [1, 1] })).estado, 400, "id repetido");
assert.equal((await diego("POST", `${P}/elementos`, { tipo: "trazo", puntos: [1, 1, 2] })).estado, 400, "puntos impares");
assert.equal((await diego("POST", `${P}/elementos`, { tipo: "imagen", archivo: "../../x.png" })).estado, 400, "las fotos solo se suben");

// Una nota de Víctor, que Diego mueve y reescribe
r = await victor("POST", `${P}/elementos`, { id: "nota-prueba-1", tipo: "nota", texto: "Orden del día", color: "#c9dff3", x: 99999, y: 100, ancho: 260, alto: 180 });
assert.equal(r.estado, 201, JSON.stringify(r.datos));
assert.equal(r.datos.x, 1880, "siempre queda un trozo dentro");
r = await diego("PATCH", `${P}/elementos/nota-prueba-1`, { texto: "Orden del día:\n1. Fiesta", color: "#cfe8c9", x: 400, ancho: 300 });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
assert.equal(r.datos.texto, "Orden del día:\n1. Fiesta");
assert.equal(r.datos.color, "#cfe8c9");
assert.deepEqual([r.datos.x, r.datos.y, r.datos.ancho, r.datos.alto], [400, 100, 300, 180]);
assert.equal(r.datos.cambiadoPor, idDiego);
ev = await ojosVictor.esperar((e) => e.tipo === "pizarra" && e.accion === "cambiar", "la nota cambiada");
assert.equal(ev.elementos[0].texto, "Orden del día:\n1. Fiesta");
assert.equal((await diego("PATCH", `${P}/elementos/trazo-prueba-1`, { x: 5 })).estado, 400, "los trazos no se mueven");
assert.equal((await diego("PATCH", `${P}/elementos/no-existe-123`, { x: 5 })).estado, 404);

// Quitar y volver a poner («Deshacer»)
r = await diego("POST", `${P}/quitar`, { ids: ["trazo-prueba-1", "no-existe-123"] });
assert.deepEqual(r.datos.ids, ["trazo-prueba-1"]);
await ojosVictor.esperar((e) => e.tipo === "pizarra" && e.accion === "quitar" && e.ids.includes("trazo-prueba-1"), "el trazo quitado");
r = await diego("GET", P);
assert.ok(!r.datos.pizarra.elementos.some((e) => e.id === "trazo-prueba-1"));
r = await diego("POST", `${P}/restaurar`, { ids: ["trazo-prueba-1"] });
assert.equal(r.datos.elementos.length, 1);
assert.deepEqual(r.datos.elementos[0].puntos, [10, 10, 50, 50, 90, 20]);
r = await victor("GET", P);
assert.deepEqual(
    r.datos.pizarra.elementos.map((e) => e.id),
    ["trazo-prueba-2", "nota-prueba-1", "trazo-prueba-1"],
    "lo que vuelve se pone encima",
);

// Una foto: solo imágenes de verdad, y solo para el crew
const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
r = await victor("POST", `${P}/imagenes`, png, { tipo: "image/png", cabeceras: { "x-id": "foto-prueba-1", "x-x": "300", "x-y": "200", "x-ancho": "320", "x-alto": "200" } });
assert.equal(r.estado, 201, JSON.stringify(r.datos));
assert.equal(r.datos.tipo, "imagen");
assert.match(r.datos.archivo, /^foto-prueba-1-[0-9a-f]{8}\.png$/);
assert.deepEqual([r.datos.x, r.datos.y, r.datos.ancho, r.datos.alto], [300, 200, 320, 200]);
const archivoFoto = r.datos.archivo;
await ojosDiego.esperar((e) => e.tipo === "pizarra" && e.accion === "poner" && e.elementos[0].tipo === "imagen", "la foto de Víctor");
const foto = await diego("GET", `pizarras/imagenes/${archivoFoto}`, undefined, { crudo: true });
assert.equal(foto.status, 200);
assert.equal(foto.headers.get("content-type"), "image/png");
assert.match(foto.headers.get("content-security-policy") || "", /sandbox/);
assert.deepEqual(new Uint8Array(await foto.arrayBuffer()), png);
assert.equal((await fetch(`${base}/api/pizarras/imagenes/${archivoFoto}`)).status, 401, "sin sesión no se ve");
assert.equal((await diego("GET", "pizarras/imagenes/otra-foto-12345678.png")).estado, 404);
const falsa = new Uint8Array(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"));
assert.equal((await victor("POST", `${P}/imagenes`, falsa, { tipo: "image/png" })).estado, 400, "algo que no es una foto no entra");
r = await diego("PATCH", `${P}/elementos/foto-prueba-1`, { x: 500, ancho: 480, alto: 300 });
assert.deepEqual([r.datos.x, r.datos.ancho, r.datos.alto], [500, 480, 300]);

// El lápiz en directo: no se guarda, solo lo ven los demás (y lo raro se corrige)
r = await victor("POST", `${P}/vivo`, { cursor: [100, 200], trazo: { id: "vivo-prueba-1", color: "#zzz", grosor: 999, puntos: [1, 2, 3, 4, 5], desde: 0 } });
assert.equal(r.estado, 200);
ev = await ojosDiego.esperar((e) => e.tipo === "pizarra-vivo" && e.trazo?.id === "vivo-prueba-1", "el lápiz de Víctor");
assert.equal(ev.autor, idVictor);
assert.deepEqual(ev.cursor, [100, 200]);
assert.equal(ev.trazo.color, "#1c1715");
assert.equal(ev.trazo.grosor, 6);
assert.deepEqual(ev.trazo.puntos, [1, 2, 3, 4]);
await victor("POST", `${P}/vivo`, { cursor: null });
await ojosDiego.esperar((e) => e.tipo === "pizarra-vivo" && e.cursor === null, "Víctor saca el ratón");
r = await diego("GET", P);
assert.ok(!r.datos.pizarra.elementos.some((e) => e.id === "vivo-prueba-1"));

// Vaciar y recuperar
const antes = (await diego("GET", P)).datos.pizarra.elementos.map((e) => e.id);
assert.equal(antes.length, 4);
r = await victor("POST", `${P}/vaciar`);
assert.equal(r.estado, 200);
await ojosDiego.esperar((e) => e.tipo === "pizarra" && e.accion === "vaciar", "la pizarra vaciada");
r = await diego("GET", P);
assert.deepEqual(r.datos.pizarra.elementos, []);
assert.equal(r.datos.pizarra.puedeRecuperar, true);
assert.equal((await diego("GET", `pizarras/imagenes/${archivoFoto}`, undefined, { crudo: true })).status, 200, "la foto se guarda mientras se pueda recuperar");
r = await diego("POST", `${P}/recuperar`);
assert.deepEqual(
    r.datos.elementos.map((e) => e.id),
    antes,
);
ev = await ojosVictor.esperar((e) => e.tipo === "pizarra" && e.accion === "todo", "lo recuperado");
assert.equal(ev.elementos.length, 4);
assert.equal((await diego("POST", `${P}/recuperar`)).estado, 400, "no hay nada más que recuperar");
r = await diego("GET", "pizarras");
assert.equal(r.datos.pizarras[0].elementos, 4);

// Víctor cierra la pizarra: Diego se queda solo
ojosVictor.cerrar();
await ojosDiego.esperar((e) => e.tipo === "pizarra-presentes" && e.usuarios.length === 1 && e.usuarios[0] === idDiego, "Víctor ha salido");
ojosDiego.cerrar();

// La página de la pizarra
const pagina = await fetch(`${base}/pizarra/?p=reuniones`);
assert.equal(pagina.status, 200);
assert.match(await pagina.text(), /Pizarra · HOT SPOT S\.L\./);
assert.match(pagina.headers.get("content-security-policy") || "", /frame-ancestors 'self'/);
assert.match(pagina.headers.get("content-security-policy") || "", /img-src 'self' data: blob:/);
const sinBarra = await fetch(`${base}/pizarra`, { redirect: "manual" });
assert.equal(sinBarra.status, 301);
assert.equal(new URL(sinBarra.headers.get("location"), base).pathname, new URL(`${base}/pizarra/`).pathname);
for (const archivo of ["app/pizarra.js", "pizarra/pizarra.css"]) assert.equal((await fetch(`${base}/${archivo}`)).status, 200, archivo);

console.log("Pizarra: bien");
