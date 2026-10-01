// Prueba del tablón de tareas contra un servidor en marcha sin Google (como el paso «Probar el servidor»):
//   node pruebas/tablon.mjs http://127.0.0.1:3993/tareas <código de alta del registro>
// Crea dos cuentas (Diego y Víctor) y comprueba que las notas de una tarea no se pisan: quien guarda sobre una versión
// que ya no es la que hay recibe un 409 con lo que hay ahora, y con la versión buena se guarda.

import assert from "node:assert/strict";

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

// Sin «antes» se guarda como siempre (pestañas con la versión anterior del tablón); un «antes» raro se ignora
r = await victor("PATCH", T, { notas: "Sin antes" });
assert.equal(r.estado, 200);
for (const raro of [null, "texto", 7, [], {}]) {
    r = await victor("PATCH", T, { notas: `Con antes raro ${JSON.stringify(raro)}`, antes: raro });
    assert.equal(r.estado, 200, JSON.stringify(raro));
}

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

console.log("Tablón (notas que no se pisan): bien");
