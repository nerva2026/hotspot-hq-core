// Prueba de los cumpleaños y del personaje de la oficina contra un servidor en marcha sin Google, arrancado con
// un «hoy» fijo (solo para pruebas) justo en el cambio de día: a las 23:30 en UTC, en Madrid ya es el día siguiente.
//
//   TAREAS_HOY=2027-02-27T23:30:00Z TAREAS_DATOS=/tmp/datos-cumple TAREAS_PUERTO=3994 node servidor/principal.js &
//   node pruebas/cumple.mjs http://127.0.0.1:3994/tareas <código de alta del registro>
//
// Primero comprueba las cuentas de fechas de servidor/perfil.js (zonas horarias, 29 de febrero, cambio de año…) y
// luego la API: poner, quitar y comprobar el cumpleaños, «hoy en la oficina» (/api/oficina, con todos los cumpleaños
// del crew y el de quien pregunta), el personaje (/api/yo/personaje), que sin sesión no se ve nada, la página del
// puente de la oficina (/tareas/oficina/) y lo que sirve el cartel de cumpleaños (/tareas/cumples/).
// (El puente en funcionamiento, con una oficina de mentira —window.WA—, y el cartel en pantalla necesitan un
// navegador y no se prueban aquí.)

import assert from "node:assert/strict";
import * as perfil from "../servidor/perfil.js";
import { ErrorDeDatos } from "../servidor/tareas.js";

const [base, codigoAlta] = process.argv.slice(2);
if (!base || !codigoAlta) {
    console.error("Uso: node pruebas/cumple.mjs <url del tablón> <código de alta>   (servidor con TAREAS_HOY=2027-02-27T23:30:00Z)");
    process.exit(2);
}

// ---------- 1. las cuentas de fechas (sin servidor) ----------

// Cumpleaños: día y mes, nada de años
assert.equal(perfil.validarCumple("05-17"), "05-17");
assert.equal(perfil.validarCumple("02-29"), "02-29", "el 29 de febrero vale");
for (const vacio of [null, undefined, ""]) assert.equal(perfil.validarCumple(vacio), null, "vacío = quitarlo");
for (const malo of ["02-30", "13-01", "00-05", "04-31", "05-00", "5-17", "17/05", " 05-17", 517, true, { dia: 17, mes: 5 }, ["05", "17"]]) {
    assert.throws(() => perfil.validarCumple(malo), ErrorDeDatos, `debería rechazar ${JSON.stringify(malo)}`);
}
assert.throws(() => perfil.validarCumple("1990-05-17"), /año/, "con año se rechaza y se dice por qué");

// El 29 de febrero se celebra el 28 los años que no son bisiestos
assert.equal(perfil.diaDelCumple("02-29", 2027), "2027-02-28");
assert.equal(perfil.diaDelCumple("02-29", 2028), "2028-02-29");
assert.equal(perfil.diaDelCumple("02-29", 2100), "2100-02-28", "2100 no es bisiesto");
assert.equal(perfil.diaDelCumple("02-29", 2000), "2000-02-29", "2000 sí");
assert.equal(perfil.diaDelCumple("05-17", 2027), "2027-05-17");
assert.deepEqual(perfil.proximoCumple("02-29", "2027-02-28"), { fecha: "2027-02-28", enDias: 0 });
assert.deepEqual(perfil.proximoCumple("02-28", "2027-02-28"), { fecha: "2027-02-28", enDias: 0 });
assert.deepEqual(perfil.proximoCumple("02-29", "2028-02-28"), { fecha: "2028-02-29", enDias: 1 }, "en año bisiesto, su día");
assert.deepEqual(perfil.proximoCumple("02-29", "2027-03-01"), { fecha: "2028-02-29", enDias: 365 });
assert.deepEqual(perfil.proximoCumple("01-05", "2026-12-20"), { fecha: "2027-01-05", enDias: 16 }, "cambio de año");
assert.deepEqual(perfil.proximoCumple("12-20", "2026-12-20"), { fecha: "2026-12-20", enDias: 0 });

// Quién cumple hoy y quién pronto (30 días), sin los que ya no están ni fechas raras
const gente = [
    { id: "a", nombre: "Víctor", cumple: "02-29" },
    { id: "b", nombre: "Ana", cumple: "02-28" },
    { id: "c", nombre: "Diego", cumple: "03-01" },
    { id: "d", nombre: "Bea", cumple: "03-01", baja: true },
    { id: "e", nombre: "Carla", cumple: "03-30" },
    { id: "f", nombre: "Dani", cumple: "03-31" },
    { id: "g", nombre: "Eva", cumple: "99-99" },
    { id: "h", nombre: "Fede" },
    { id: "i", nombre: "Alba", cumple: "03-01" },
];
for (const [i, u] of gente.entries()) u.color = `#00000${i}`;
const resumen = perfil.resumenOficina(gente, "2027-02-28");
assert.deepEqual(resumen, {
    hoy: "2027-02-28",
    cumples: [
        { id: "b", nombre: "Ana" },
        { id: "a", nombre: "Víctor" },
    ],
    proximos: [
        { id: "i", nombre: "Alba", dia: "03-01", fecha: "2027-03-01", enDias: 1 },
        { id: "c", nombre: "Diego", dia: "03-01", fecha: "2027-03-01", enDias: 1 },
        { id: "e", nombre: "Carla", dia: "03-30", fecha: "2027-03-30", enDias: 30 },
    ],
    // todos los del crew, los que antes llegan primero (y, el mismo día, por nombre): los de hoy, los próximos y los
    // que quedan más allá de los 30 días; cada uno con su día, la próxima vez que se celebra y su color
    todos: [
        { id: "b", nombre: "Ana", dia: "02-28", fecha: "2027-02-28", enDias: 0, color: "#000001" },
        { id: "a", nombre: "Víctor", dia: "02-29", fecha: "2027-02-28", enDias: 0, color: "#000000" },
        { id: "i", nombre: "Alba", dia: "03-01", fecha: "2027-03-01", enDias: 1, color: "#000008" },
        { id: "c", nombre: "Diego", dia: "03-01", fecha: "2027-03-01", enDias: 1, color: "#000002" },
        { id: "e", nombre: "Carla", dia: "03-30", fecha: "2027-03-30", enDias: 30, color: "#000004" },
        { id: "f", nombre: "Dani", dia: "03-31", fecha: "2027-03-31", enDias: 31, color: "#000005" },
    ],
});
assert.deepEqual(perfil.resumenOficina(gente, "2028-02-28").cumples, [{ id: "b", nombre: "Ana" }], "en 2028 Víctor lo celebra el 29");
// Al día siguiente del cumple, queda un año entero (el último de la lista); y el del 29 de febrero, a su día de 2028
const despues = perfil.resumenOficina(gente, "2027-03-01");
assert.deepEqual(
    despues.todos.map((c) => [c.nombre, c.fecha, c.enDias]),
    [
        ["Alba", "2027-03-01", 0],
        ["Diego", "2027-03-01", 0],
        ["Carla", "2027-03-30", 29],
        ["Dani", "2027-03-31", 30],
        ["Ana", "2028-02-28", 364],
        ["Víctor", "2028-02-29", 365],
    ],
);
// Quien pregunta: su cumpleaños, o null si no lo ha puesto (o si lo guardado no vale)
assert.deepEqual(perfil.oficinaPara(gente, "2027-02-28", gente[0]), { ...resumen, yo: { id: "a", cumple: "02-29" } });
assert.deepEqual(perfil.oficinaPara(gente, "2027-02-28", gente[7]).yo, { id: "h", cumple: null }, "Fede no lo ha puesto");
assert.deepEqual(perfil.oficinaPara(gente, "2027-02-28", gente[6]).yo, { id: "g", cumple: null }, "una fecha rara no cuenta");
assert.deepEqual(perfil.resumenOficina([], "2027-02-28"), { hoy: "2027-02-28", cumples: [], proximos: [], todos: [] });

// Hoy en la oficina: el día de Madrid, no el del servidor (que va en UTC)
const tardeUtc = new Date("2027-02-27T23:30:00Z");
assert.equal(perfil.diaEn("Europe/Madrid", tardeUtc), "2027-02-28", "23:30 UTC en invierno = 00:30 en Madrid");
assert.equal(perfil.diaEn("UTC", tardeUtc), "2027-02-27");
assert.equal(perfil.diaEn("Europe/Madrid", new Date("2026-09-30T22:30:00Z")), "2026-10-01", "en verano Madrid va 2 horas por delante");
assert.equal(perfil.diaEn("Europe/Madrid", new Date("2026-09-30T21:30:00Z")), "2026-09-30");
assert.equal(perfil.diaEn("America/New_York", new Date("2027-02-28T03:00:00Z")), "2027-02-27");
assert.equal(perfil.zonaValida("Europe/Madrid"), true);
assert.equal(perfil.zonaValida("Marte/Olimpo"), false);
assert.equal(perfil.hoyEnLaOficina("Europe/Madrid", { instante: tardeUtc }), "2027-02-28");
assert.equal(perfil.hoyEnLaOficina("UTC", { instante: tardeUtc }), "2027-02-27");
assert.equal(perfil.hoyEnLaOficina("Europe/Madrid", { dia: "2030-01-01" }), "2030-01-01");
assert.match(perfil.hoyEnLaOficina("Europe/Madrid"), /^\d{4}-\d{2}-\d{2}$/);

// TAREAS_HOY: solo un día o un instante con su zona
assert.equal(perfil.leerHoyFijo(undefined), null);
assert.equal(perfil.leerHoyFijo(""), null);
assert.deepEqual(perfil.leerHoyFijo("2027-02-28"), { dia: "2027-02-28" });
assert.equal(perfil.leerHoyFijo("2027-02-30"), undefined);
assert.equal(perfil.leerHoyFijo("2027-02-27T23:30:00Z").instante.toISOString(), "2027-02-27T23:30:00.000Z");
assert.equal(perfil.leerHoyFijo("2027-02-28T00:30:00+01:00").instante.toISOString(), "2027-02-27T23:30:00.000Z");
assert.equal(perfil.leerHoyFijo("2027-02-27T23:30:00"), undefined, "sin zona dependería del aparato");
assert.equal(perfil.leerHoyFijo("mañana"), undefined);

// Personaje: lo mismo que guarda WorkAdventure en el navegador
assert.deepEqual(perfil.validarPersonaje({ texturas: ["hs-w01", "color_22"], companero: "dog1", otro: 1 }), { texturas: ["hs-w01", "color_22"], companero: "dog1" });
assert.deepEqual(perfil.validarPersonaje({ texturas: ["male1"] }), { texturas: ["male1"], companero: null });
assert.deepEqual(perfil.validarPersonaje({ texturas: ["male1"], companero: "" }), { texturas: ["male1"], companero: null });
for (const malo of [
    {},
    { texturas: [] },
    { texturas: "male1" },
    { texturas: Array.from({ length: 11 }, (_, i) => `t${i}`) },
    { texturas: ["con espacio"] },
    { texturas: ["a/b"] },
    { texturas: ["x".repeat(65)] },
    { texturas: [7] },
    { texturas: ["male1"], companero: "<perro>" },
    { texturas: ["male1"], companero: 3 },
    null,
]) {
    assert.throws(() => perfil.validarPersonaje(malo), ErrorDeDatos, `debería rechazar ${JSON.stringify(malo)}`);
}
assert.deepEqual(perfil.personajeDe({}), { texturas: null, companero: null, actualizado: null });
console.log("Cuentas de fechas y personaje: bien");

// ---------- 2. la API ----------

function cliente() {
    let galleta = "";
    const llamar = async function (metodo, ruta, cuerpo, { crudo = false, cabeceras: extra = {} } = {}) {
        const cabeceras = { "x-tablon": "1", ...extra };
        if (galleta) cabeceras.cookie = galleta;
        let body;
        if (cuerpo !== undefined) {
            body = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
            cabeceras["content-type"] = "application/json";
        }
        const r = await fetch(`${base}/api/${ruta}`, { method: metodo, headers: cabeceras, body });
        const puesta = r.headers.get("set-cookie");
        if (puesta) galleta = puesta.split(";")[0];
        if (crudo) return r;
        const datos = await r.json().catch(() => null);
        return { estado: r.status, datos };
    };
    // Los avisos en directo (lo que recibe el tablón y el puente de la oficina con EventSource).
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
const ana = cliente();
const bea = cliente();
const anonimo = cliente();

// Sin sesión no se ve nada
for (const ruta of ["oficina", "yo/personaje"]) {
    const r = await anonimo("GET", ruta);
    assert.equal(r.estado, 401, `GET ${ruta} sin sesión`);
}
let r = await anonimo("PUT", "yo/personaje", { texturas: ["male1"] });
assert.equal(r.estado, 401);
r = await anonimo("PATCH", "yo", { cumple: "05-17" });
assert.equal(r.estado, 401);

// Cuentas: Diego (primera, admin) invita a los demás
r = await diego("POST", "alta", { codigo: codigoAlta, nombre: "Diego", clave: "una clave muy larga", color: "#e0562a" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
assert.equal(r.datos.yo.cumple, null, "sin cumpleaños todavía");
const idDiego = r.datos.yo.id;
async function invitar(quien, nombre, color) {
    const inv = await diego("POST", "invitar", { tipo: "alta" });
    assert.equal(inv.estado, 200);
    const alta = await quien("POST", "alta", { codigo: inv.datos.codigo, nombre, clave: `la clave de ${nombre}`, color });
    assert.equal(alta.estado, 200, JSON.stringify(alta.datos));
    return alta.datos.yo.id;
}
const idVictor = await invitar(victor, "Víctor", "#3b82c4");
const idAna = await invitar(ana, "Ana", "#3a9d5d");
const idBea = await invitar(bea, "Bea", "#8e5cc4");

// El servidor tiene que estar en el cambio de día (ver arriba)
r = await diego("GET", "oficina");
assert.equal(r.estado, 200, JSON.stringify(r.datos));
assert.equal(r.datos.hoy, "2027-02-28", `El servidor tiene que arrancar con TAREAS_HOY=2027-02-27T23:30:00Z (y la zona de Madrid); dice que hoy es ${r.datos.hoy}`);
assert.deepEqual(r.datos, { hoy: "2027-02-28", cumples: [], proximos: [], todos: [], yo: { id: idDiego, cumple: null } }, "nadie ha puesto su cumpleaños");

// Poner el cumpleaños (y verlo en los datos de la cuenta y en directo en los demás)
const oyente = await victor.escuchar();
r = await diego("PATCH", "yo", { cumple: "03-01" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
assert.equal(r.datos.yo.cumple, "03-01");
const aviso = await oyente.esperar((e) => e.tipo === "usuarios" && e.usuarios.some((u) => u.id === idDiego && u.cumple === "03-01"), "el cambio de cumpleaños en directo");
assert.ok(!("personaje" in aviso.usuarios[0]), "el personaje no se reparte a los demás");
oyente.cerrar();
r = await diego("GET", "datos");
assert.equal(r.datos.yo.cumple, "03-01", "va en los datos de la propia cuenta");
assert.equal(r.datos.usuarios.find((u) => u.id === idDiego).cumple, "03-01", "y el crew lo ve");

// Fechas que no valen: 400 y no se cambia nada (tampoco lo demás que venga en la petición)
for (const malo of ["02-30", "13-01", "00-10", "5-17", "17/05", 517, { dia: 1, mes: 3 }]) {
    r = await diego("PATCH", "yo", { cumple: malo });
    assert.equal(r.estado, 400, `debería rechazar ${JSON.stringify(malo)}`);
    assert.ok(r.datos.error, "con un mensaje");
}
r = await diego("PATCH", "yo", { cumple: "1990-03-01" });
assert.equal(r.estado, 400);
assert.match(r.datos.error, /año/, "sin año, y se dice por qué");
r = await diego("PATCH", "yo", { color: "#6b5f58", cumple: "02-31" });
assert.equal(r.estado, 400);
r = await diego("GET", "datos");
assert.equal(r.datos.yo.color, "#e0562a", "con un cumpleaños malo no se cambia nada más");
assert.equal(r.datos.yo.cumple, "03-01");
r = await diego("PATCH", "yo", { cumple: "03-01" }, { cabeceras: { "x-tablon": "0" } });
assert.equal(r.estado, 403, "sin la cabecera del tablón no se cambia nada");

// Quitarlo y volver a ponerlo; cambiar otra cosa no lo toca
r = await diego("PATCH", "yo", { cumple: null });
assert.equal(r.estado, 200);
assert.equal(r.datos.yo.cumple, null);
r = await diego("PATCH", "yo", { cumple: "03-01" });
r = await diego("PATCH", "yo", { cumple: "" });
assert.equal(r.datos.yo.cumple, null, "\"\" también lo quita");
r = await diego("PATCH", "yo", { cumple: "03-01" });
r = await diego("PATCH", "yo", { color: "#e0562a" });
assert.equal(r.datos.yo.cumple, "03-01", "sin «cumple» en la petición se queda como estaba");

// Hoy en la oficina: Víctor (29 de febrero, en 2027 lo celebra el 28) y Ana (28); pronto, Diego y Bea (1 de marzo)
assert.equal((await victor("PATCH", "yo", { cumple: "02-29" })).estado, 200);
assert.equal((await ana("PATCH", "yo", { cumple: "02-28" })).estado, 200);
assert.equal((await bea("PATCH", "yo", { cumple: "03-01" })).estado, 200);
r = await ana("GET", "oficina");
assert.deepEqual(r.datos, {
    hoy: "2027-02-28",
    cumples: [
        { id: idAna, nombre: "Ana" },
        { id: idVictor, nombre: "Víctor" },
    ],
    proximos: [
        { id: idBea, nombre: "Bea", dia: "03-01", fecha: "2027-03-01", enDias: 1 },
        { id: idDiego, nombre: "Diego", dia: "03-01", fecha: "2027-03-01", enDias: 1 },
    ],
    // el cartel de cumpleaños: todos, los que antes llegan primero, con el color de cada uno; y el de quien pregunta
    todos: [
        { id: idAna, nombre: "Ana", dia: "02-28", fecha: "2027-02-28", enDias: 0, color: "#3a9d5d" },
        { id: idVictor, nombre: "Víctor", dia: "02-29", fecha: "2027-02-28", enDias: 0, color: "#3b82c4" },
        { id: idBea, nombre: "Bea", dia: "03-01", fecha: "2027-03-01", enDias: 1, color: "#8e5cc4" },
        { id: idDiego, nombre: "Diego", dia: "03-01", fecha: "2027-03-01", enDias: 1, color: "#e0562a" },
    ],
    yo: { id: idAna, cumple: "02-28" },
});
// Lo mismo para todos, menos «yo»; y sin año de nacimiento en ningún sitio (el día es «MM-DD»; «fecha», la próxima vez)
const paraVictor = await victor("GET", "oficina");
assert.deepEqual(paraVictor.datos, { ...r.datos, yo: { id: idVictor, cumple: "02-29" } });
for (const c of r.datos.todos) {
    assert.deepEqual(Object.keys(c), ["id", "nombre", "dia", "fecha", "enDias", "color"]);
    assert.match(c.dia, /^\d{2}-\d{2}$/);
    assert.ok(c.fecha >= r.datos.hoy, "la próxima vez que cae, nunca una fecha pasada");
}
// Cambia el color o el nombre de alguien: el cartel lo enseña
assert.equal((await ana("PATCH", "yo", { color: "#1f9e98" })).estado, 200);
r = await victor("GET", "oficina");
assert.equal(r.datos.todos.find((c) => c.id === idAna).color, "#1f9e98");
assert.equal((await ana("PATCH", "yo", { color: "#3a9d5d" })).estado, 200);

// Quien sale del crew no cuenta (y su cumpleaños deja de enseñarse)
assert.equal((await diego("PATCH", `crew/${idBea}`, { baja: true })).estado, 200);
r = await ana("GET", "oficina");
assert.ok(!r.datos.proximos.some((p) => p.id === idBea), "Bea ya no está");
assert.deepEqual(r.datos.todos.map((c) => c.nombre), ["Ana", "Víctor", "Diego"], "ni en la lista de todos");
r = await ana("GET", "datos");
assert.equal(r.datos.usuarios.find((u) => u.id === idBea).cumple, null);
r = await bea("GET", "oficina");
assert.equal(r.estado, 401, "y ella ya no ve la oficina");
r = await diego("GET", "crew");
assert.equal(r.datos.crew.find((u) => u.id === idAna).cumple, "02-28", "el panel del crew lo enseña");

// Los próximos 30 días: el 30 de marzo entra (30 días), el 31 no
await diego("PATCH", "yo", { cumple: "03-30" });
r = await diego("GET", "oficina");
assert.deepEqual(r.datos.proximos, [{ id: idDiego, nombre: "Diego", dia: "03-30", fecha: "2027-03-30", enDias: 30 }]);
await diego("PATCH", "yo", { cumple: "03-31" });
r = await diego("GET", "oficina");
assert.deepEqual(r.datos.proximos, []);
assert.deepEqual(r.datos.todos.at(-1), { id: idDiego, nombre: "Diego", dia: "03-31", fecha: "2027-03-31", enDias: 31, color: "#e0562a" }, "pero en «todos» sigue, sin límite de días");
assert.deepEqual(r.datos.yo, { id: idDiego, cumple: "03-31" });
// El que ya ha pasado este año queda para el siguiente, al final de la lista
await diego("PATCH", "yo", { cumple: "02-27" });
r = await diego("GET", "oficina");
assert.deepEqual(r.datos.todos.at(-1), { id: idDiego, nombre: "Diego", dia: "02-27", fecha: "2028-02-27", enDias: 364, color: "#e0562a" });
// Quitarlo: sale de la lista y «yo» lo dice
await diego("PATCH", "yo", { cumple: null });
r = await diego("GET", "oficina");
assert.ok(!r.datos.todos.some((c) => c.id === idDiego));
assert.deepEqual(r.datos.yo, { id: idDiego, cumple: null });
await diego("PATCH", "yo", { cumple: "03-01" });

// Personaje de la oficina: lo de cada uno, para tenerlo igual en todos sus aparatos
r = await victor("GET", "yo/personaje");
assert.equal(r.estado, 200);
assert.deepEqual(r.datos, { texturas: null, companero: null, actualizado: null }, "sin guardar todavía");
r = await victor("PUT", "yo/personaje", { texturas: ["hs-cuerpo-1", "hs-bigote"], companero: "cat2", actualizado: "2000-01-01T00:00:00.000Z", otra: "cosa" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
assert.deepEqual(Object.keys(r.datos).sort(), ["actualizado", "companero", "texturas"], "lo que no se conoce se ignora");
assert.deepEqual(r.datos.texturas, ["hs-cuerpo-1", "hs-bigote"]);
assert.equal(r.datos.companero, "cat2");
assert.ok(Date.parse(r.datos.actualizado) > Date.parse("2020-01-01"), "la fecha la pone el servidor");
const guardado = r.datos;
r = await victor("GET", "yo/personaje");
assert.deepEqual(r.datos, guardado, "se lee lo mismo que se guardó");
r = await diego("GET", "yo/personaje");
assert.equal(r.datos.texturas, null, "cada uno tiene el suyo");

// Lo que no vale: 400 y se queda lo que había
for (const malo of [
    {},
    { texturas: [] },
    { texturas: "hs-cuerpo-1" },
    { texturas: Array.from({ length: 11 }, (_, i) => `pieza${i}`) },
    { texturas: ["con espacio"] },
    { texturas: ["../../etc"] },
    { texturas: ["x".repeat(65)] },
    { texturas: ["hs-cuerpo-1"], companero: "<script>" },
    { texturas: ["hs-cuerpo-1"], companero: 5 },
]) {
    r = await victor("PUT", "yo/personaje", malo);
    assert.equal(r.estado, 400, `debería rechazar ${JSON.stringify(malo)}`);
}
r = await victor("PUT", "yo/personaje", "{esto no es json");
assert.equal(r.estado, 400);
r = await victor("PUT", "yo/personaje", { texturas: ["male1"] }, { cabeceras: { "x-tablon": "0" } });
assert.equal(r.estado, 403, "sin la cabecera del tablón no se guarda");
r = await victor("GET", "yo/personaje");
assert.deepEqual(r.datos, guardado, "nada de eso ha cambiado lo guardado");
r = await victor("PUT", "yo/personaje", { texturas: Array.from({ length: 10 }, (_, i) => `pieza_${i}.v2`) });
assert.equal(r.estado, 200, "10 piezas sí");
assert.equal(r.datos.companero, null, "sin «companero» se queda sin compañero");
r = await victor("GET", "datos");
assert.ok(!("personaje" in r.datos.yo), "el personaje no viaja con los datos del tablón");

// ---------- 3. el puente de la oficina (/tareas/oficina/) ----------
// Lo abre el mapa sin enseñarlo; carga /iframe_api.js de la misma web, así que le vale la CSP de las demás páginas.
const puente = await fetch(`${base}/oficina/`);
assert.equal(puente.status, 200);
assert.match(puente.headers.get("content-type") || "", /^text\/html/);
const csp = puente.headers.get("content-security-policy") || "";
assert.match(csp, /script-src 'self'(;|$)/, "solo guiones de la misma web (también /iframe_api.js)");
assert.match(csp, /connect-src 'self'/, "habla con la API y los avisos en directo de la misma web");
assert.match(csp, /frame-ancestors 'self'/, "solo la oficina (la misma web) puede meterlo en un marco");
assert.equal(puente.headers.get("x-content-type-options"), "nosniff");
const html = await puente.text();
assert.match(html, /<script type="module" src="\.\.\/app\/oficina\.js"><\/script>/);
assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>/, "sin guiones en línea (la CSP no los deja)");
const modulo = await fetch(`${base}/app/oficina.js`);
assert.equal(modulo.status, 200);
assert.match(modulo.headers.get("content-type") || "", /^text\/javascript/);
const codigo = await modulo.text();
assert.ok(codigo.includes('"/iframe_api.js"'), "carga la API de la oficina de la misma web");
for (const variable of ["hsSesion", "hsTareas", "hsCumples", "hsMusica"]) assert.ok(codigo.includes(`"${variable}"`), `escribe ${variable}`);
for (const dependencia of ["api.js", "util.js", "cumple.js"]) {
    const r = await fetch(`${base}/app/${dependencia}`);
    assert.equal(r.status, 200, dependencia);
    assert.match(r.headers.get("content-type") || "", /^text\/javascript/);
}
const sinBarra = await fetch(`${base}/oficina`, { redirect: "manual" });
assert.equal(sinBarra.status, 301);
assert.equal(new URL(sinBarra.headers.get("location"), base).pathname, new URL(`${base}/oficina/`).pathname);

// ---------- 4. el texto del aviso (el mismo en el tablón y en el puente de la oficina) ----------
const { textoCumples } = await import("../publico/app/cumple.js");
const cDiego = { id: "d", nombre: "Diego" };
const cVictor = { id: "v", nombre: "Víctor" };
const cAna = { id: "a", nombre: "Ana" };
assert.equal(textoCumples([], "d"), "", "sin cumples, sin aviso");
assert.equal(textoCumples([cDiego], "v"), "¡Hoy es el cumple de Diego!");
assert.equal(textoCumples([cDiego, cVictor], "a"), "¡Hoy es el cumple de Diego y Víctor!");
assert.equal(textoCumples([cDiego, cVictor, cAna], "x"), "¡Hoy es el cumple de Diego, Víctor y Ana!");
assert.equal(textoCumples([cDiego], "d"), "¡Feliz cumpleaños, Diego!", "a quien cumple se le felicita");
assert.equal(textoCumples([cDiego, cVictor], "d"), "¡Feliz cumpleaños, Diego! Hoy también es el cumple de Víctor.");

// ---------- 5. el cartel de cumpleaños (/tareas/cumples/) ----------
// Lo abre el mapa en un panel (el calendario de la pared del hall). Aquí, lo que sirve el servidor y las cuentas y
// textos del cartel; en pantalla se mira con un navegador.
const cartel = await fetch(`${base}/cumples/`);
assert.equal(cartel.status, 200);
assert.match(cartel.headers.get("content-type") || "", /^text\/html/);
const cspCartel = cartel.headers.get("content-security-policy") || "";
assert.equal(cspCartel, csp, "la misma CSP que las demás pantallas");
assert.match(cspCartel, /script-src 'self'(;|$)/);
assert.match(cspCartel, /frame-ancestors 'self'/, "solo la oficina (la misma web) puede meterlo en un panel");
assert.equal(cartel.headers.get("x-content-type-options"), "nosniff");
const htmlCartel = await cartel.text();
assert.match(htmlCartel, /<script type="module" src="\.\.\/app\/cumples\.js"><\/script>/);
assert.doesNotMatch(htmlCartel, /<script(?![^>]*src=)[^>]*>/, "sin guiones en línea (la CSP no los deja)");
assert.doesNotMatch(htmlCartel, /<style|\sstyle=|\son\w+=/, "ni estilos ni manejadores en línea");
assert.match(htmlCartel, /<link rel="stylesheet" href="\.\.\/estilo\.css">/, "el estilo común (letras y colores)");
assert.match(htmlCartel, /<link rel="stylesheet" href="cumples\.css">/);
assert.doesNotMatch(htmlCartel, /<a\s/, "es un cartel: sin enlaces a las otras pantallas");
const servido = async (ruta, tipo) => {
    const r = await fetch(`${base}/${ruta}`);
    assert.equal(r.status, 200, ruta);
    assert.match(r.headers.get("content-type") || "", tipo, ruta);
    return r.text();
};
const cssCartel = await servido("cumples/cumples.css", /^text\/css/);
assert.match(cssCartel, /prefers-reduced-motion/);
assert.doesNotMatch(cssCartel, /font-size:\s*(\d|1[01])px/, "ninguna letra de menos de 12 px");
const codigoCartel = await servido("app/cumples.js", /^text\/javascript/);
for (const dependencia of ["util.js", "api.js", "conexion.js", "acceso.js", "solo.js", "cumple.js", "confeti.js"]) await servido(`app/${dependencia}`, /^text\/javascript/);
for (const m of codigoCartel.matchAll(/from "\.\/([\w-]+\.js)"/g)) await servido(`app/${m[1]}`, /^text\/javascript/);
for (const letra of ["pixelify-sans.woff", "silkscreen-regular.woff", "silkscreen-bold.woff", "hs-retoques-texto.woff", "hs-retoques-texto-negra.woff", "hs-retoques-titulo.woff", "hs-retoques-titulo-negra.woff"]) await servido(`fuentes/${letra}`, /^font\/woff/);
await servido("tarta.svg", /^image\/svg/);
// Reutiliza lo que ya había: la entrada de siempre, los textos y cuentas de los cumpleaños y el confeti
assert.match(codigoCartel, /import \{[^}]*pantallaEntrar[^}]*\} from "\.\/acceso\.js"/);
assert.match(codigoCartel, /import \{[^}]*textoCumples[^}]*\} from "\.\/cumple\.js"/);
assert.match(codigoCartel, /import \{[^}]*lanzarConfeti[^}]*\} from "\.\/confeti\.js"/);
assert.match(codigoCartel, /api\.oficina\(\)/);
assert.match(codigoCartel, /api\.cambiarYo\(\{ cumple \}\)/, "pone y quita el cumpleaños con PATCH /api/yo");
assert.match(codigoCartel, /escuchar\(alRecibir, recargar\)/, "se pone al día con los avisos en directo");
assert.match(codigoCartel, /ev\.tipo === "usuarios"/);
assert.match(codigoCartel, /setInterval\(alVolver, MINUTO\)/, "y pregunta cada minuto (la medianoche de la oficina)");
// Es un cartel: ni enlaza las otras pantallas ni las otras lo enlazan (se abre desde el mapa, como el puente)
assert.doesNotMatch(codigoCartel, /["'`](\.\.\/)+(libro|pizarra|archivo|musica)?\/?["'`]|otra-pantalla/, "sin enlaces a las otras pantallas");
const { readdirSync, readFileSync } = await import("node:fs");
const carpetaApp = new URL("../publico/app/", import.meta.url);
for (const f of readdirSync(carpetaApp).filter((f) => f.endsWith(".js") && f !== "cumples.js")) {
    // (una dirección entre comillas; los comentarios que lo nombran no cuentan)
    assert.doesNotMatch(readFileSync(new URL(f, carpetaApp), "utf8"), /["'`][^"'`\n]*cumples\/[^"'`\n]*["'`]/, `${f} enlaza el cartel de cumpleaños`);
}
// Sin la barra, se redirige a la carpeta sin perder lo que venga detrás
const cartelSinBarra = await fetch(`${base}/cumples?solo=1`, { redirect: "manual" });
assert.equal(cartelSinBarra.status, 301);
assert.equal(new URL(cartelSinBarra.headers.get("location"), base).pathname + new URL(cartelSinBarra.headers.get("location"), base).search, `${new URL(`${base}/cumples/`).pathname}?solo=1`);
// Sin sesión el cartel se sirve igual (enseña la pantalla de entrada); lo que no se ve es la API
assert.equal((await anonimo("GET", "oficina")).estado, 401);
// Al entrar se vuelve aquí: la entrada de siempre (acceso.js) manda como vuelta la dirección en la que está
assert.match(await servido("app/acceso.js", /^text\/javascript/), /const vuelta = location\.pathname \+ location\.search;/);

// Las cuentas y los textos del cartel (publico/app/cumple.js), con «todos» de /api/oficina
const { cuantoFalta, elSiguiente, porMeses, fechaCumple } = await import("../publico/app/cumple.js");
assert.equal(cuantoFalta(1), "mañana");
assert.equal(cuantoFalta(2), "en 2 días");
assert.equal(cuantoFalta(5), "en 5 días");
assert.equal(cuantoFalta(365), "en 365 días");
const todos = resumen.todos; // Ana y Víctor hoy; Alba y Diego mañana; Carla y Dani a finales de marzo
assert.deepEqual(elSiguiente(todos), { fecha: "2027-03-01", enDias: 1, personas: [todos[2], todos[3]] }, "el siguiente no cuenta los de hoy, y trae a todos los de ese día");
assert.equal(elSiguiente(todos.slice(0, 2)), null, "si solo quedan los de hoy, no hay siguiente");
assert.equal(elSiguiente([]), null);
assert.equal(elSiguiente(despues.todos).fecha, "2027-03-30");
assert.equal(fechaCumple(elSiguiente(perfil.resumenOficina(gente, "2027-02-27").todos).fecha.slice(5)), "28 de febrero", "en 2027 el del 29 se celebra (y se anuncia) el 28");
const meses = porMeses(todos, 2);
assert.deepEqual(meses.map((m) => m.mes), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1], "doce meses seguidos, empezando por el de ahora");
assert.deepEqual(meses[0].cumples.map((c) => `${c.dia} ${c.nombre}`), ["02-28 Ana", "02-29 Víctor"], "cada uno en su mes y con su día de verdad (el 29 de febrero también)");
assert.deepEqual(meses[1].cumples.map((c) => `${c.dia} ${c.nombre}`), ["03-01 Alba", "03-01 Diego", "03-30 Carla", "03-31 Dani"], "por día y, el mismo día, por nombre");
assert.equal(meses.slice(2).reduce((n, m) => n + m.cumples.length, 0), 0);
const desdeMarzo = porMeses(despues.todos, 3);
assert.deepEqual([desdeMarzo[0].mes, desdeMarzo[0].cumples.length], [3, 4]);
assert.deepEqual([desdeMarzo.at(-1).mes, desdeMarzo.at(-1).cumples.length], [2, 2], "el mes que acaba de pasar queda el último");
assert.deepEqual(porMeses([]).map((m) => m.mes), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

console.log("Cumpleaños, personaje, puente de la oficina y cartel de cumpleaños: bien");
