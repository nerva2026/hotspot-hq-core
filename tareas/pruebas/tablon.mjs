// Prueba del tablón de tareas contra un servidor en marcha sin Google (como el paso «Probar el servidor»):
//   node pruebas/tablon.mjs http://127.0.0.1:3993/tareas <código de alta del registro>
// Crea dos cuentas (Diego y Víctor) y comprueba que las notas de una tarea no se pisan: quien guarda sobre una versión
// que ya no es la que hay recibe un 409 con lo que hay ahora, y con la versión buena se guarda. Sin «antes» pasa lo
// mismo si la tarea ya tiene notas, y el cliente de ahora (publico/app/) siempre lo manda.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const [base, codigoAlta] = process.argv.slice(2);
if (!base || !codigoAlta) {
    console.error("Uso: node pruebas/tablon.mjs <url del tablón> <código de alta>");
    process.exit(2);
}

function cliente() {
    let galleta = "";
    return async function llamar(metodo, ruta, cuerpo) {
        const cabeceras = { "x-tablon": "1" };
        if (galleta) cabeceras.cookie = galleta;
        if (cuerpo !== undefined) cabeceras["content-type"] = "application/json";
        const r = await fetch(`${base}/api/${ruta}`, { method: metodo, headers: cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
        const puesta = r.headers.get("set-cookie");
        if (puesta) galleta = puesta.split(";")[0];
        return { estado: r.status, datos: await r.json().catch(() => null) };
    };
}

const diego = cliente();
const victor = cliente();

// Cuentas
let r = await diego("POST", "alta", { codigo: codigoAlta, nombre: "Diego", clave: "una clave muy larga", color: "#e0562a" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
const idDiego = r.datos.yo.id;
r = await diego("POST", "invitar", { tipo: "alta" });
r = await victor("POST", "alta", { codigo: r.datos.codigo, nombre: "Víctor", clave: "otra clave muy larga", color: "#3b82c4" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));

// Una tarea con notas, que los dos tienen abierta
r = await diego("POST", "tareas", { titulo: "Preparar la feria", notas: "Punto de partida" });
assert.equal(r.estado, 201, JSON.stringify(r.datos));
const ID = r.datos.id;
const T = `tareas/${ID}`;
const tarea = async () => (await victor("GET", "datos")).datos.tareas.find((t) => t.id === ID);
const PARTIDA = "Punto de partida";

// Con la versión buena se guarda (y «antes» no se queda en la tarea)
r = await diego("PATCH", T, { notas: `${PARTIDA}\nDiego añade esto`, antes: { notas: PARTIDA } });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
assert.equal(r.datos.notas, `${PARTIDA}\nDiego añade esto`);
assert.equal(r.datos.actualizadaPor, idDiego);
assert.equal("antes" in r.datos, false);
const deDiego = r.datos;

// Víctor escribía sobre la versión vieja: 409 con lo que hay ahora, y no se pisa nada
r = await victor("PATCH", T, { notas: `${PARTIDA}\nVíctor escribe otra cosa`, antes: { notas: PARTIDA } });
assert.equal(r.estado, 409, JSON.stringify(r.datos));
assert.deepEqual(r.datos.conflicto, ["notas"]);
assert.equal(r.datos.tarea.notas, deDiego.notas, "el 409 trae lo que hay ahora");
assert.equal(r.datos.tarea.actualizadaPor, idDiego, "y quién lo cambió");
assert.equal(typeof r.datos.error, "string");
let t = await tarea();
assert.equal(t.notas, deDiego.notas, "no se ha pisado");
assert.equal(t.actualizada, deDiego.actualizada, "un 409 no toca la tarea");

// Un 409 no guarda nada de lo demás que viniera en la misma petición
r = await victor("PATCH", T, { notas: "otra", estado: "hecho", antes: { notas: PARTIDA } });
assert.equal(r.estado, 409);
t = await tarea();
assert.equal(t.estado, "por-hacer");
assert.equal(t.notas, deDiego.notas);

// Con la versión buena (la que trae el 409) se guarda sobre lo nuevo
const suyo = `${deDiego.notas}\nY esto es de Víctor`;
r = await victor("PATCH", T, { notas: suyo, antes: { notas: deDiego.notas } });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
assert.equal(r.datos.notas, suyo);
assert.equal((await tarea()).notas, suyo);

// Que otra persona cambie otra cosa (estado, fechas…) no es un choque: lo que cuenta es el texto de las notas
r = await diego("PATCH", T, { estado: "en-marcha", fin: "2026-12-01" });
assert.equal(r.estado, 200);
r = await victor("PATCH", T, { notas: `${suyo}\nUna línea más`, antes: { notas: suyo } });
assert.equal(r.estado, 200, "cambiar el estado no hace que las notas choquen");
const actual = r.datos.notas;
assert.equal(r.datos.estado, "en-marcha");

// Los saltos de línea de Windows cuentan igual que los normales
r = await diego("PATCH", T, { notas: "L1\nL2", antes: { notas: actual } });
assert.equal(r.estado, 200);
r = await diego("PATCH", T, { notas: "L1\nL2\nL3", antes: { notas: "L1\r\nL2" } });
assert.equal(r.estado, 200, JSON.stringify(r.datos));

// Si lo que llega es justo lo que hay, no hay nada que pisar
r = await victor("PATCH", T, { notas: "L1\nL2\nL3", antes: { notas: "algo muy viejo" } });
assert.equal(r.estado, 200, JSON.stringify(r.datos));

// Sin «antes» no se sabe en qué texto se basa el cambio: si la tarea ya tiene notas, 409 y no se guarda nada (una
// pestaña con el JS viejo recibe el aviso en vez de pisar lo de otra persona). Un «antes» raro, o sin «notas», es lo mismo.
const conNotas = await tarea();
assert.notEqual(conNotas.notas, "", "la tarea tiene notas");
r = await victor("PATCH", T, { notas: "Sin antes", estado: "hecho" });
assert.equal(r.estado, 409, JSON.stringify(r.datos));
assert.deepEqual(r.datos.conflicto, ["notas"]);
assert.equal(r.datos.tarea.notas, conNotas.notas, "el 409 trae lo que hay ahora");
for (const raro of [null, "texto", 7, [], {}, { titulo: "otra cosa" }]) {
    r = await victor("PATCH", T, { notas: `Con antes raro ${JSON.stringify(raro)}`, antes: raro });
    assert.equal(r.estado, 409, JSON.stringify(raro));
}
const trasLosRechazos = await tarea();
assert.equal(trasLosRechazos.notas, conNotas.notas, "ningún rechazo guarda nada");
assert.equal(trasLosRechazos.estado, conNotas.estado, "ni lo demás que viniera en la misma petición");
assert.equal(trasLosRechazos.actualizada, conNotas.actualizada, "un 409 no toca la tarea");
// Lo que llega ya es lo que hay: no es un cambio y pasa aunque no venga «antes»
r = await victor("PATCH", T, { notas: conNotas.notas });
assert.equal(r.estado, 200, JSON.stringify(r.datos));

// Dos guardados a la vez sobre la misma versión: entra uno y el otro recibe el 409 (no se pierde ninguno sin avisar)
const version = (await tarea()).notas;
const [a, b] = await Promise.all([
    diego("PATCH", T, { notas: "A a la vez", antes: { notas: version } }),
    victor("PATCH", T, { notas: "B a la vez", antes: { notas: version } }),
]);
assert.deepEqual([a.estado, b.estado].sort(), [200, 409], `${a.estado} y ${b.estado}`);
const ganador = a.estado === 200 ? a : b;
const perdedor = a.estado === 200 ? b : a;
assert.equal((await tarea()).notas, ganador.datos.notas);
assert.equal(perdedor.datos.tarea.notas, ganador.datos.notas, "el que pierde recibe lo del que gana");

// Lo que no es texto largo sigue como estaba: el título y el estado no piden versión
r = await victor("PATCH", T, { titulo: "Preparar la feria de octubre", estado: "esperando" });
assert.equal(r.estado, 200);
assert.equal(r.datos.titulo, "Preparar la feria de octubre");

// Una tarea que no existe o está borrada sigue dando 404 aunque venga «antes»
assert.equal((await victor("PATCH", "tareas/no-existe", { notas: "x", antes: { notas: "y" } })).estado, 404);
assert.equal((await victor("DELETE", T)).estado, 200);
assert.equal((await victor("PATCH", T, { notas: "x", antes: { notas: "y" } })).estado, 404);

// Una tarea sin notas no tiene nada que pisar: sin «antes» se acepta (y cuando ya las tiene, sí lo pide)
r = await diego("POST", "tareas", { titulo: "Sin notas todavía" });
assert.equal(r.estado, 201, JSON.stringify(r.datos));
const vacia = `tareas/${r.datos.id}`;
r = await victor("PATCH", vacia, { notas: "Primeras notas" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
assert.equal(r.datos.notas, "Primeras notas");
r = await victor("PATCH", vacia, { notas: "Segundas notas, sin antes" });
assert.equal(r.estado, 409, JSON.stringify(r.datos));
r = await victor("PATCH", vacia, { notas: "Segundas notas", antes: { notas: "Primeras notas" } });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
r = await victor("PATCH", vacia, { estado: "en-marcha", prioridad: "alta" }); // lo que no son notas no pide «antes»
assert.equal(r.estado, 200, JSON.stringify(r.datos));
r = await victor("PATCH", vacia, { notas: "", antes: { notas: "Segundas notas" } }); // borrar las notas, con «antes»
assert.equal(r.estado, 200, JSON.stringify(r.datos));
r = await victor("PATCH", vacia, { notas: "De nuevo sin notas antes" }); // sin notas otra vez: nada que pisar
assert.equal(r.estado, 200, JSON.stringify(r.datos));

// El cliente de ahora siempre manda «antes» con las notas: api.cambiar lo exige (y lo manda tal cual), y ninguna otra
// pantalla cambia tareas a mano ni llama a «cambiar» con notas sin «antes».
const carpetaApp = new URL("../publico/app/", import.meta.url);
for (const f of readdirSync(carpetaApp).filter((f) => f.endsWith(".js") && f !== "api.js")) {
    const codigo = readFileSync(new URL(f, carpetaApp), "utf8");
    assert.ok(!/["'`]PATCH["'`]\s*,\s*[`"']tareas\//.test(codigo) && !/method:\s*["']PATCH["']/.test(codigo), `${f} cambia tareas sin pasar por api.cambiar`);
    for (const llamada of codigo.matchAll(/cambiar\(\s*\{[^}]*\bnotas\b[^}]*\}[^;]*;/g)) assert.match(llamada[0], /\bantes\b/, `${f}: unas notas sin «antes»: ${llamada[0]}`);
}
const { api } = await import(new URL("api.js", carpetaApp).href);
const enviadas = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, opciones) => {
    enviadas.push([opciones.method, opciones.body ? JSON.parse(opciones.body) : null]);
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
};
try {
    await assert.rejects(() => api.cambiar("t1", { notas: "x" }), /siempre/);
    await assert.rejects(() => api.cambiar("t1", { notas: "x" }, {}), /siempre/);
    await assert.rejects(() => api.cambiar("t1", { notas: "x" }, { notas: null }), /siempre/);
    assert.equal(enviadas.length, 0, "sin «antes» no sale nada");
    await api.cambiar("t1", { notas: "x" }, { notas: "" }); // «antes» vacío vale: la tarea no tenía notas
    await api.cambiar("t1", { estado: "hecho" }); // lo que no son notas no pide «antes»
    assert.deepEqual(enviadas, [["PATCH", { notas: "x", antes: { notas: "" } }], ["PATCH", { estado: "hecho" }]]);
} finally {
    globalThis.fetch = fetchReal;
}

// La franja «Sin conexión…» (app/conexion.js): sale cuando el canal lleva caído un rato y se quita sola al volver
const { vigilante, TEXTO_SIN_CONEXION } = await import(new URL("conexion.js", carpetaApp).href);
const puestas = [];
globalThis.document = {
    createElement: () => ({ setAttribute() {}, isConnected: false, remove() { this.isConnected = false; } }),
    body: { append(e) { e.isConnected = true; puestas.push(e); } },
};
try {
    const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
    const v = vigilante(40);
    v.cayo();
    v.cayo(); // cada intento fallido de reconectar avisa otra vez: solo cuenta el primero
    await pausa(10);
    v.volvio();
    await pausa(80);
    assert.equal(puestas.length, 0, "un corte corto no la saca");
    v.cayo();
    await pausa(90);
    assert.equal(puestas.length, 1, "sale si sigue caído");
    assert.equal(puestas[0].textContent, TEXTO_SIN_CONEXION);
    assert.equal(puestas[0].isConnected, true);
    v.volvio();
    assert.equal(puestas[0].isConnected, false, "se quita sola al volver");
} finally {
    delete globalThis.document;
}

console.log("Tablón (notas que no se pisan): bien");
