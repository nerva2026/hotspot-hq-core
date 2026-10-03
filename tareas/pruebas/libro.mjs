// Prueba del libro de cuentas contra un servidor en marcha sin Google (el que arranca el paso «Probar el libro de
// cuentas», con su propia carpeta de datos, en el puerto 3991):
//   node pruebas/libro.mjs http://127.0.0.1:3991/tareas <código de alta del registro>
// Crea dos cuentas (Diego y Víctor), apunta gastos, ingresos y pagos, y comprueba el balance, el CSV, el Excel,
// la importación de la hoja de Drive y los tiques. Y que la pantalla «Solo para los socios» se entera en directo cuando
// a esa persona le dan acceso (publico/app/libro-espera.js, contra el canal de verdad del servidor), que la pestaña
// «Cuentas» de las otras pantallas aparece y desaparece en directo (publico/app/libro-pestana.js, también con el canal
// de verdad), y el buscador de la pantalla (publico/app/libro-buscar.js): por importe, por fecha, por tipo y por persona.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crearExcel, leerExcel } from "../servidor/excel.js";
import { esperarAcceso, AVISOS_QUE_ABREN } from "../publico/app/libro-espera.js";
import { coincide, prepararConsulta, formasDeImporte, formasDeFecha } from "../publico/app/libro-buscar.js";
import { seguirAccesoAlLibro, AVISOS_QUE_CAMBIAN } from "../publico/app/libro-pestana.js";

const [base, codigoAlta] = process.argv.slice(2);
if (!base || !codigoAlta) {
    console.error("Uso: node pruebas/libro.mjs <url del tablón> <código de alta>");
    process.exit(2);
}

function cliente() {
    let galleta = "";
    return async function llamar(metodo, ruta, cuerpo, { tipo, crudo = false, senal } = {}) {
        const cabeceras = { "x-tablon": "1" };
        if (galleta) cabeceras.cookie = galleta;
        let body;
        if (cuerpo instanceof Uint8Array) {
            body = cuerpo;
            cabeceras["content-type"] = tipo || "application/octet-stream";
        } else if (cuerpo !== undefined) {
            body = JSON.stringify(cuerpo);
            cabeceras["content-type"] = "application/json";
        }
        const r = await fetch(`${base}/api/${ruta}`, { method: metodo, headers: cabeceras, body, signal: senal });
        const puesta = r.headers.get("set-cookie");
        if (puesta) galleta = puesta.split(";")[0];
        if (crudo) return r;
        const datos = await r.json().catch(() => null);
        return { estado: r.status, datos };
    };
}

const diego = cliente();
const victor = cliente();

// Cuentas
let r = await diego("POST", "alta", { codigo: codigoAlta, nombre: "Diego", clave: "una clave muy larga", color: "#e0562a" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
r = await diego("POST", "invitar", { tipo: "alta" });
assert.equal(r.estado, 200);
r = await victor("POST", "alta", { codigo: r.datos.codigo, nombre: "Víctor", clave: "otra clave muy larga", color: "#3b82c4" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
const idVictor = r.datos.yo.id;
const idDiego = r.datos.usuarios.find((u) => u.nombre === "Diego").id;

// Sin cabecera propia no se puede cambiar nada
const sinCabecera = await fetch(`${base}/api/libro/movimientos`, { method: "POST", body: "{}" });
assert.equal(sinCabecera.status, 403);

// Primera vez: partes a medias
r = await diego("GET", "libro");
assert.equal(r.estado, 200);
assert.deepEqual(r.datos.partes, { [idDiego]: 50, [idVictor]: 50 });
assert.equal(r.datos.categorias[0], "Oficina y software");

// Un gasto de Diego: Víctor le debe la mitad
r = await diego("POST", "libro/movimientos", { tipo: "gasto", fecha: "2026-09-28", concepto: "Dominio hot-spot.es", categoria: "Oficina y software", persona: idDiego, importe: 1200 });
assert.equal(r.estado, 201, JSON.stringify(r.datos));
const gasto = r.datos;
r = await victor("GET", "libro");
assert.deepEqual(r.datos.resumen.deudas, [{ de: idVictor, a: idDiego, importe: 600 }]);
assert.equal(r.datos.resumen.totalGastos, 1200);

// Errores de formulario
r = await diego("POST", "libro/movimientos", { tipo: "gasto", concepto: "Nada", persona: idDiego, importe: 0 });
assert.equal(r.estado, 400);
r = await diego("POST", "libro/movimientos", { tipo: "pago", persona: idDiego, para: idDiego, importe: 100 });
assert.equal(r.estado, 400);
r = await diego("POST", "libro/movimientos", { tipo: "gasto", concepto: "", persona: idDiego, importe: 100 });
assert.equal(r.estado, 400);

// Víctor salda: en paz
r = await victor("POST", "libro/movimientos", { tipo: "pago", fecha: "2026-09-29", persona: idVictor, para: idDiego, importe: 600 });
assert.equal(r.estado, 201, JSON.stringify(r.datos));
r = await diego("GET", "libro");
assert.deepEqual(r.datos.resumen.deudas, []);
assert.ok(r.datos.resumen.personas.every((p) => p.balance === 0));

// Un ingreso que cobra Diego: le debe la mitad a Víctor
r = await diego("POST", "libro/movimientos", { tipo: "ingreso", fecha: "2026-10-02", concepto: "Entradas", categoria: "Eventos", persona: idDiego, importe: 10001 });
assert.equal(r.estado, 201);
r = await diego("GET", "libro");
assert.deepEqual(r.datos.resumen.deudas, [{ de: idDiego, a: idVictor, importe: 5000 }]);
assert.equal(r.datos.resumen.personas.reduce((s, p) => s + p.balance, 0), 0, "los balances suman cero");

// Partes: solo administración, y tienen que sumar 100
r = await victor("PATCH", "libro/ajustes", { partes: { [idDiego]: 60, [idVictor]: 40 } });
assert.equal(r.estado, 200, "Víctor también es admin (entró con enlace de admin)");
r = await diego("PATCH", "libro/ajustes", { partes: { [idDiego]: 60, [idVictor]: 30 } });
assert.equal(r.estado, 400);
r = await diego("PATCH", "libro/ajustes", { partes: { [idDiego]: 50, [idVictor]: 50 }, categorias: ["Eventos", "Otros", "eventos", ""] });
assert.equal(r.estado, 200);
assert.deepEqual(r.datos.categorias, ["Eventos", "Otros"]);

// Solo lo ven quienes tienen parte en el reparto y quien administra
r = await diego("PATCH", `crew/${idVictor}`, { admin: false });
assert.equal(r.estado, 200);
r = await diego("PATCH", "libro/ajustes", { partes: { [idDiego]: 100 } });
assert.equal(r.estado, 200);
r = await victor("GET", "libro");
assert.equal(r.estado, 403, "sin parte y sin administrar no se ven las cuentas");
r = await victor("GET", "libro/csv");
assert.equal(r.estado, 403);
r = await victor("GET", "datos");
assert.equal(r.datos.yo.libro, false, "el tablón no le ofrece el libro");

// «Solo para los socios», en directo: quien no tiene acceso sigue en el canal y, cuando se lo dan, la espera de esa
// pantalla (publico/app/libro-espera.js, la que usa libro.js) recibe el aviso, pide el libro y lo abre sin recargar.
const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
async function hasta(condicion, queEs, plazo = 3000) {
    for (const fin = Date.now() + plazo; Date.now() < fin; ) {
        if (condicion()) return;
        await pausa(20);
    }
    assert.fail(`No ha pasado a tiempo: ${queEs}`);
}
// Como el «escuchar» de api.js, pero con fetch (aquí no hay EventSource): el canal en directo de esa persona.
function canalDe(persona) {
    const canal = { abierto: false, cerrado: false, avisos: [] };
    canal.escuchar = (alRecibir) => {
        const corte = new AbortController();
        (async () => {
            const respuesta = await persona("GET", "eventos", undefined, { crudo: true, senal: corte.signal });
            assert.equal(respuesta.status, 200, "quien no tiene parte en el reparto también está en el canal");
            let resto = "";
            for await (const trozo of respuesta.body) {
                canal.abierto = true; // lo primero que manda el servidor es «retry: …», ya con el oyente apuntado
                resto += Buffer.from(trozo).toString("utf8");
                for (let fin = resto.indexOf("\n\n"); fin >= 0; fin = resto.indexOf("\n\n")) {
                    const bloque = resto.slice(0, fin);
                    resto = resto.slice(fin + 2);
                    for (const linea of bloque.split("\n")) {
                        if (!linea.startsWith("data: ")) continue;
                        const aviso = JSON.parse(linea.slice(6));
                        canal.avisos.push(aviso.tipo);
                        alRecibir(aviso);
                    }
                }
            }
        })().catch((error) => {
            if (!corte.signal.aborted) throw error;
        });
        return () => {
            canal.cerrado = true;
            corte.abort();
        };
    };
    return canal;
}
// Una «pantalla» de Víctor esperando: cuenta las veces que pide el libro y guarda el libro con el que entra.
function pantallaDeVictor() {
    const pantalla = { canal: canalDe(victor), pedidos: 0, libro: null, sinSesion: 0 };
    pantalla.espera = esperarAcceso({
        escuchar: pantalla.canal.escuchar,
        pedir: async () => {
            pantalla.pedidos++;
            const respuesta = await victor("GET", "libro");
            if (respuesta.estado !== 200) throw Object.assign(new Error(respuesta.datos?.error || "sin acceso"), { estado: respuesta.estado });
            return respuesta.datos;
        },
        alEntrar: (libro) => (pantalla.libro = libro),
        alPerderSesion: () => pantalla.sinSesion++,
        calma: 20,
    });
    return pantalla;
}

// 1) Le hacen administrador (un cambio del crew: aviso «usuarios»)
let pantalla = pantallaDeVictor();
await hasta(() => pantalla.canal.abierto, "abrir el canal de Víctor");
r = await diego("PATCH", "libro/ajustes", { partes: { [idDiego]: 100 } }); // un cambio del libro que no le da nada
assert.equal(r.estado, 200);
await hasta(() => pantalla.pedidos === 1, "pedir el libro al llegar un aviso «libro»");
await pausa(150);
assert.equal(pantalla.libro, null, "sin parte sigue esperando (el servidor le contesta 403)");
assert.equal(pantalla.canal.cerrado, false, "y sigue escuchando");
r = await diego("PATCH", `crew/${idVictor}`, { admin: true });
assert.equal(r.estado, 200);
await hasta(() => pantalla.libro, "abrir el libro al pasar a administrar, sin recargar");
assert.ok(pantalla.canal.avisos.includes("usuarios"), "el cambio del crew llega por el canal");
assert.equal(pantalla.libro.yo.id, idVictor);
assert.equal(pantalla.canal.cerrado, true, "al entrar deja de escuchar (el libro abre su propio canal)");

// 2) Le dan parte en el reparto (un cambio del libro: aviso «libro»), que es lo que hacía falta cerrar y volver a abrir
r = await diego("PATCH", `crew/${idVictor}`, { admin: false });
assert.equal(r.estado, 200);
assert.equal((await victor("GET", "libro")).estado, 403, "otra vez sin acceso");
pantalla = pantallaDeVictor();
await hasta(() => pantalla.canal.abierto, "abrir otra vez el canal de Víctor");
r = await diego("PATCH", "libro/ajustes", { partes: { [idDiego]: 50, [idVictor]: 50 } });
assert.equal(r.estado, 200);
await hasta(() => pantalla.libro, "abrir el libro al recibir parte en el reparto, sin recargar");
assert.deepEqual(pantalla.canal.avisos, ["libro"]);
assert.deepEqual(pantalla.libro.partes, { [idDiego]: 50, [idVictor]: 50 });
assert.equal(pantalla.libro.yo.id, idVictor);
assert.equal(pantalla.pedidos, 1, "un aviso, una petición");
assert.equal(pantalla.canal.cerrado, true);
assert.equal(pantalla.sinSesion, 0);

// 3) Lo demás de la espera, con un canal de mentira: varios avisos seguidos, avisos que no tocan, reconectar, la sesión
// que se acaba y parar.
function canalFalso() {
    const canal = { dejado: 0 };
    canal.escuchar = (alRecibir, alReconectar) => {
        canal.avisar = (tipo) => alRecibir({ tipo });
        canal.reconectar = alReconectar;
        return () => canal.dejado++;
    };
    return canal;
}
function esperaFalsa(respuestas) {
    const e = { canal: canalFalso(), pedidos: 0, entradas: [], sinSesion: 0 };
    e.espera = esperarAcceso({
        escuchar: e.canal.escuchar,
        pedir: async () => {
            const estado = respuestas[Math.min(e.pedidos++, respuestas.length - 1)];
            await pausa(15);
            if (estado !== 200) throw Object.assign(new Error("no"), { estado });
            return { libro: e.pedidos };
        },
        alEntrar: (libro) => e.entradas.push(libro),
        alPerderSesion: () => e.sinSesion++,
        calma: 20,
    });
    return e;
}
assert.deepEqual(AVISOS_QUE_ABREN, ["libro", "usuarios"]);
let e = esperaFalsa([403, 403, 200]);
for (const tipo of ["tarea", "borrada", "musica-cabina", "pizarra"]) e.canal.avisar(tipo);
await pausa(80);
assert.equal(e.pedidos, 0, "los avisos de otras cosas no piden el libro");
for (let i = 0; i < 5; i++) e.canal.avisar("libro");
await pausa(120);
assert.equal(e.pedidos, 1, "cinco avisos seguidos, una sola petición");
assert.deepEqual(e.entradas, [], "con un 403 sigue esperando");
e.canal.avisar("usuarios");
await pausa(25); // la petición ya ha salido…
e.canal.avisar("libro"); // …y llega otro aviso mientras tanto: se vuelve a pedir al acabar
await pausa(150);
assert.equal(e.pedidos, 3, "un aviso que llega a media petición no se pierde");
assert.deepEqual(e.entradas, [{ libro: 3 }], "entra una sola vez, con el libro que le han dado");
assert.equal(e.canal.dejado, 1, "y deja de escuchar");
e.canal.avisar("libro");
await e.canal.reconectar();
await pausa(80);
assert.equal(e.pedidos, 3, "después de entrar ya no pide nada");

e = esperaFalsa([0, 200]); // sin conexión (el servidor se está actualizando) y, al reconectar, ya con acceso
e.canal.avisar("libro");
await pausa(80);
assert.deepEqual([e.pedidos, e.entradas.length, e.canal.dejado], [1, 0, 0], "sin conexión sigue esperando");
await e.canal.reconectar();
assert.deepEqual([e.pedidos, e.entradas.length, e.canal.dejado], [2, 1, 1], "al reconectar prueba en el momento, sin esperar un aviso");

e = esperaFalsa([401]);
e.canal.avisar("libro");
await pausa(80);
assert.deepEqual([e.sinSesion, e.entradas.length, e.canal.dejado], [1, 0, 1], "con la sesión acabada, a la pantalla de entrar y sin escuchar más");
e.canal.avisar("libro");
await pausa(80);
assert.equal(e.pedidos, 1);

e = esperaFalsa([200]);
e.espera.parar();
e.canal.avisar("libro");
await e.espera.probar();
await pausa(80);
assert.deepEqual([e.pedidos, e.entradas.length, e.canal.dejado], [0, 0, 1], "parada, no hace nada");

// Y la pantalla la usa: «Solo para los socios» se queda escuchando con el canal y el libro de verdad.
const codigoLibro = readFileSync(new URL("../publico/app/libro.js", import.meta.url), "utf8");
assert.match(codigoLibro, /import \{ esperarAcceso \} from "\.\/libro-espera\.js"/);
const sinAcceso = /function sinAcceso\(mensaje\) \{[\s\S]*?\n\}/.exec(codigoLibro)?.[0] || "";
assert.match(sinAcceso, /Solo para los socios/);
assert.match(sinAcceso, /esperarAcceso\(\{ escuchar, pedir: api\.libro, alEntrar: empezar, alPerderSesion: sinSesion \}\)/, "la pantalla «Solo para los socios» tiene que seguir escuchando");

r = await victor("GET", "libro");
assert.equal(r.estado, 200, "con parte sí");

// ---------- la pestaña «Cuentas» de las otras cuatro pantallas, en directo (publico/app/libro-pestana.js) ----------
// A quien le dan o le quitan el libro con el tablón, la pizarra, el archivo o la música abiertos le aparece o le
// desaparece la pestaña (y «Libro de cuentas» en el menú) sin recargar: con el aviso del canal, pregunta por lo suyo.
{
    // GET api/yo: lo propio de quien pregunta, con «libro»
    assert.equal((await fetch(`${base}/api/yo`)).status, 401, "sin sesión no dice nada");
    r = await victor("GET", "yo");
    assert.equal(r.estado, 200);
    assert.deepEqual([r.datos.yo.id, r.datos.yo.libro], [idVictor, true]);
    assert.equal(r.datos.yo.clave, undefined, "sin nada que no deba salir");
    r = await diego("GET", "yo");
    assert.equal(r.datos.yo.libro, true);

    // Una «pantalla» de Víctor (el tablón, por ejemplo) con el canal de verdad: lo que cree y lo que pinta
    const otra = { canal: canalDe(victor), yo: { id: idVictor, libro: true }, pintadas: [], pedidos: 0 };
    const seguidor = seguirAccesoAlLibro({
        pedir: async () => {
            otra.pedidos++;
            return (await victor("GET", "yo")).datos.yo.libro;
        },
        tiene: () => otra.yo.libro,
        alCambiar: (puede) => {
            otra.yo.libro = puede;
            otra.pintadas.push(puede);
        },
        calma: 20,
    });
    const dejar = otra.canal.escuchar(seguidor.alRecibir);
    await hasta(() => otra.canal.abierto, "abrir el canal de Víctor en la otra pantalla");
    // un movimiento del libro no le cambia nada: pregunta y no pinta
    r = await diego("POST", "libro/movimientos", { tipo: "gasto", fecha: "2026-10-02", concepto: "Pegatinas", persona: idDiego, importe: 500 });
    assert.equal(r.estado, 201);
    const pegatinas = r.datos.id;
    await hasta(() => otra.pedidos === 1, "preguntar al llegar un aviso «libro»");
    await pausa(120);
    assert.deepEqual(otra.pintadas, [], "si no cambia, no se pinta nada");
    // le quitan la parte: la pestaña desaparece
    r = await diego("PATCH", "libro/ajustes", { partes: { [idDiego]: 100 } });
    assert.equal(r.estado, 200);
    await hasta(() => otra.pintadas.length === 1, "quitar la pestaña al perder la parte, sin recargar");
    assert.deepEqual(otra.pintadas, [false]);
    // se la devuelven: aparece
    r = await diego("PATCH", "libro/ajustes", { partes: { [idDiego]: 50, [idVictor]: 50 } });
    assert.equal(r.estado, 200);
    await hasta(() => otra.pintadas.length === 2, "poner la pestaña al recibir parte, sin recargar");
    assert.deepEqual(otra.pintadas, [false, true]);
    // y por administrar (aviso «usuarios»), con el reparto solo para Diego
    r = await diego("PATCH", "libro/ajustes", { partes: { [idDiego]: 100 } });
    await hasta(() => otra.pintadas.length === 3, "quitarla otra vez");
    r = await diego("PATCH", `crew/${idVictor}`, { admin: true });
    assert.equal(r.estado, 200);
    await hasta(() => otra.pintadas.length === 4, "ponerla al pasar a administrar");
    assert.deepEqual(otra.pintadas, [false, true, false, true]);
    assert.ok(otra.canal.avisos.includes("usuarios") && otra.canal.avisos.includes("libro"));
    assert.deepEqual(AVISOS_QUE_CAMBIAN, ["libro", "usuarios"]);
    // parado, ya no pregunta
    const pedidos = otra.pedidos;
    seguidor.parar();
    r = await diego("PATCH", "libro/ajustes", { partes: { [idDiego]: 50, [idVictor]: 50 } });
    await pausa(150);
    assert.equal(otra.pedidos, pedidos, "parado, no pregunta más");
    dejar();
    r = await diego("DELETE", `libro/movimientos/${pegatinas}`);
    assert.equal(r.estado, 200);

    // varios avisos seguidos preguntan una vez; un fallo (sin conexión) no pinta nada y se reintenta con el siguiente
    let preguntas = 0;
    let respuesta = true;
    const pintadas = [];
    const yo = { libro: false };
    const s2 = seguirAccesoAlLibro({ pedir: async () => (preguntas++, respuesta instanceof Error ? Promise.reject(respuesta) : respuesta), tiene: () => yo.libro, alCambiar: (p) => ((yo.libro = p), pintadas.push(p)), calma: 20 });
    for (const tipo of ["libro", "libro", "usuarios", "tarea", "archivo"]) s2.alRecibir({ tipo });
    await pausa(80);
    assert.deepEqual([preguntas, pintadas], [1, [true]], "varios avisos seguidos, una pregunta");
    s2.alRecibir({ tipo: "tarea" });
    await pausa(60);
    assert.equal(preguntas, 1, "los avisos que no son del libro ni del crew no preguntan");
    respuesta = Object.assign(new Error("No hay conexión"), { estado: 0 });
    s2.alRecibir({ tipo: "libro" });
    await pausa(60);
    assert.deepEqual([preguntas, pintadas], [2, [true]], "si falla la pregunta, se queda como estaba");
    respuesta = false;
    await s2.comprobar();
    assert.deepEqual([preguntas, pintadas], [3, [true, false]], "«comprobar» pregunta en el momento (al reconectar)");

    // Y las cuatro pantallas lo usan (el libro no: su pestaña es la suya y se cierra sola con libro-espera.js).
    const fuente = (f) => readFileSync(new URL(`../publico/app/${f}`, import.meta.url), "utf8");
    for (const [f, href, recibe] of [
        ["principal.js", "libro/", "function alRecibir(ev) {"],
        ["pizarra.js", "../libro/", "function alRecibir(ev) {"],
        ["archivo.js", "../libro/", "function alRecibir(ev) {"],
        ["musica.js", "../libro/", "function alEvento(ev) {"],
    ]) {
        const codigo = fuente(f);
        assert.ok(codigo.includes(`const pestanaCuentas = pestanaEnDirecto({ pedir: api.yo, estado: E, href: "${href}" });`), `${f} sigue el acceso al libro en directo`);
        const cuerpo = codigo.slice(codigo.indexOf(recibe), codigo.indexOf(recibe) + 160);
        assert.ok(cuerpo.includes("pestanaCuentas.alRecibir(ev);"), `${f} le pasa los avisos del canal`);
        assert.ok(codigo.includes("pestanaCuentas.repintar();"), `${f} la repinta al volver a pedir los datos`);
        assert.ok(codigo.includes(`E.yo.libro ? h("a", { class: "pestana otra-pantalla", href: "${href}" }, "Cuentas") : null`), `${f}: la pestaña «Cuentas», con la dirección que busca libro-pestana.js`);
    }
    assert.match(fuente("libro-pestana.js"), /pestana\.className = "pestana otra-pantalla";/, "la pestaña que se pone en directo es igual que las demás (con ?solo=1 no sale)");
    assert.match(fuente("api.js"), /yo: \(\) => llamar\("GET", "yo"\)/);
}

r = await diego("PATCH", `crew/${idVictor}`, { admin: true });
assert.equal(r.estado, 200);

// Borrar y recuperar
r = await diego("DELETE", `libro/movimientos/${gasto.id}`);
assert.equal(r.estado, 200);
r = await diego("GET", "libro");
assert.ok(!r.datos.movimientos.some((m) => m.id === gasto.id));
r = await diego("POST", `libro/movimientos/${gasto.id}/restaurar`);
assert.equal(r.estado, 200);

// Tique: una foto PNG sí, un texto no
const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
r = await diego("POST", `libro/movimientos/${gasto.id}/tique`, png, { tipo: "image/png" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
const archivo = r.datos.tique.archivo;
const foto = await victor("GET", `libro/tiques/${archivo}`, undefined, { crudo: true });
assert.equal(foto.status, 200);
assert.equal(foto.headers.get("content-type"), "image/png");
assert.match(foto.headers.get("content-security-policy") || "", /sandbox/);
r = await diego("POST", `libro/movimientos/${gasto.id}/tique`, new Uint8Array(Buffer.from("<script>alert(1)</script> no es una foto")), { tipo: "image/png" });
assert.equal(r.estado, 400);
const anonimo = await fetch(`${base}/api/libro/tiques/${archivo}`);
assert.equal(anonimo.status, 401);

// CSV (para Excel en español) y Excel
const bytesCsv = Buffer.from(await (await diego("GET", "libro/csv", undefined, { crudo: true })).arrayBuffer());
assert.deepEqual([...bytesCsv.subarray(0, 3)], [0xef, 0xbb, 0xbf], "el CSV empieza con BOM para que Excel lea los acentos");
const csv = bytesCsv.subarray(3).toString("utf8");
assert.ok(csv.startsWith("Fecha;Tipo;Concepto;Categoría;Quién;Para quién;Importe (€);Notas;Tique"), csv.slice(0, 80));
assert.ok(csv.includes("28/09/2026;Gasto;Dominio hot-spot.es;Oficina y software;Diego;;12,00;;Sí"), csv);
assert.ok(csv.includes("02/10/2026;Ingreso;Entradas;Eventos;Diego;;100,01;;"), csv);
const xlsx = Buffer.from(await (await diego("GET", "libro/excel", undefined, { crudo: true })).arrayBuffer());
const hojas = leerExcel(xlsx);
assert.deepEqual(hojas.map((h) => h.nombre), ["Movimientos", "Balance", "Por categoría"]);
assert.equal(hojas[0].filas[1][6], 12);

// Importar la hoja de Drive (con su fila de EJEMPLO) y no repetir lo que ya está
const drive = crearExcel({
    hojas: [
        {
            nombre: "Gastos",
            columnas: ["Fecha", "Concepto", "Categoría", "Pagado por", "Importe (€)", "Notas / tique"].map((titulo) => ({ titulo })),
            filas: [
                ["28/09/2026", "EJEMPLO · bórrame: dominio hot-spot.es", "Oficina y software", "Diego", "12,00 €", "Esta fila es solo un ejemplo"],
                ["01/10/2026", "Altavoces", "Material", "Víctor", "1.234,50 €", ""],
                ["28/09/2026", "Dominio hot-spot.es", "Oficina y software", "Diego", "12,00 €", ""],
                ["01/10/2026", "Sin dueño", "Otros", "Alguien", "5,00 €", ""],
            ],
        },
    ],
});
r = await diego("POST", "libro/importar", new Uint8Array(drive));
assert.equal(r.estado, 200, JSON.stringify(r.datos));
assert.deepEqual(r.datos, { importados: 1, repetidos: 1, sinPersona: 1, hoja: "Gastos" });
r = await diego("GET", "libro");
const altavoces = r.datos.movimientos.find((m) => m.concepto === "Altavoces");
assert.equal(altavoces.importe, 123450);
assert.equal(altavoces.persona, idVictor);
assert.ok(r.datos.categorias.includes("Material"), "la categoría importada se añade a la lista");

// ---------- el buscador (publico/app/libro-buscar.js): también por importe, por fecha y por tipo ----------
// Con unos movimientos hechos a mano para los casos difíciles y, al final, con los que sirve el servidor.
{
    const nombres = new Map(r.datos.usuarios.map((u) => [u.id, u.nombre]));
    const ayudas = { nombre: (id) => nombres.get(id) || "Alguien" };
    const mov = (tipo, fecha, concepto, importe, mas = {}) => ({ tipo, fecha, concepto, importe, persona: idDiego, para: null, categoria: "", notas: "", tique: null, ...mas });
    const lista = [
        mov("gasto", "2026-10-01", "Cartelería: 250 carteles A3", 34590),
        mov("ingreso", "2026-10-01", "Entradas anticipadas (48)", 57600, { persona: idVictor }),
        mov("gasto", "2026-10-21", "Señal de la sala", 1284550, { notas: "Transferencia del día 21.\nFalta la factura." }),
        mov("gasto", "2026-10-02", "Cable XLR (3 m)", 4000, { categoria: "Material", tique: { nombre: "tique-cable.png" } }),
        mov("gasto", "2026-11-11", "Hielo", 24000),
        mov("gasto", "2027-01-10", "Taxi", 184000),
        mov("pago", "2026-09-30", "", 100000, { persona: idVictor, para: idDiego }),
    ];
    const buscar = (texto) => lista.filter((m) => coincide(m, texto, ayudas)).map((m) => m.concepto || `pago de ${m.importe}`);
    const solo = (texto, ...conceptos) => assert.deepEqual(buscar(texto).sort(), conceptos.sort(), `buscar «${texto}»`);

    // por importe: como se ve y como se escribe
    for (const texto of ["345,90", "345.90", "345,9", "345", "345,90 €", "345,90€", "−345,90 €", "-345,90", "-345"]) solo(texto, "Cartelería: 250 carteles A3");
    for (const texto of ["576", "576,00", "576.00", "+576", "576 €"]) solo(texto, "Entradas anticipadas (48)");
    for (const texto of ["12.845,50", "12845,50", "12845.5", "12,845.50", "12845"]) solo(texto, "Señal de la sala");
    solo("40", "Cable XLR (3 m)"); // 40,00 €; ni 240,00 € ni 1840,00 €
    solo("-576"); // un ingreso no es un gasto
    solo("+345,90");
    solo("1000", "pago de 100000");
    solo("1.000,00", "pago de 100000");
    // por fecha
    solo("1/10", "Cartelería: 250 carteles A3", "Entradas anticipadas (48)"); // el 1, no el 21 ni el 11 de noviembre
    solo("01/10/2026", "Cartelería: 250 carteles A3", "Entradas anticipadas (48)");
    solo("2026-10-21", "Señal de la sala");
    solo("21/10", "Señal de la sala");
    solo("1 oct", "Cartelería: 250 carteles A3", "Entradas anticipadas (48)");
    solo("1 de octubre", "Cartelería: 250 carteles A3", "Entradas anticipadas (48)");
    solo("21 OCTUBRE", "Señal de la sala");
    solo("noviembre", "Hielo");
    solo("enero 2027", "Taxi");
    assert.ok(!buscar("10").includes("Señal de la sala"), "«10» no saca todo octubre");
    assert.ok(buscar("10").includes("Taxi"), "«10» sí encuentra el día 10");
    // por tipo, por persona y por lo que lleva
    solo("pago", "pago de 100000");
    solo("gasto", "Cartelería: 250 carteles A3", "Señal de la sala", "Cable XLR (3 m)", "Hielo", "Taxi");
    assert.ok(buscar("victor").includes("Entradas anticipadas (48)") && buscar("VÍCTOR").includes("pago de 100000"));
    solo("victor 576", "Entradas anticipadas (48)"); // todas las palabras, en cualquier orden
    solo("576 víctor", "Entradas anticipadas (48)");
    solo("tique", "Cable XLR (3 m)");
    // lo de siempre sigue: concepto, notas y categoría, sin tildes ni mayúsculas
    solo("carteleria", "Cartelería: 250 carteles A3");
    solo("250 carteles", "Cartelería: 250 carteles A3");
    solo("falta la factura", "Señal de la sala");
    solo("material", "Cable XLR (3 m)");
    assert.equal(buscar("").length, lista.length, "con el buscador vacío salen todos");
    assert.equal(buscar("  € ").length, lista.length);
    solo("no-hay-nada-asi");
    // los movimientos del servidor, tal como los sirve: por su importe como se ve, por su fecha y por quién
    assert.ok(r.datos.movimientos.length >= 4);
    for (const m of r.datos.movimientos) {
        assert.ok(coincide(m, m.fecha, ayudas) && coincide(m, ayudas.nombre(m.persona), ayudas) && coincide(m, m.tipo, ayudas), m.concepto);
        const visto = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m.importe / 100);
        assert.ok(coincide(m, visto, ayudas), `«${visto}» encuentra «${m.concepto}»`);
        assert.ok(coincide(m, `${visto} €`, ayudas));
    }
    assert.deepEqual(formasDeImporte(1284550), ["12845.50", "12845,50", "12.845,50", "12,845.50"]);
    assert.deepEqual(formasDeImporte(4000), ["40.00", "40,00"]);
    assert.ok(formasDeFecha("2026-10-01").includes("1/10/2026") && formasDeFecha("2026-10-01").includes("1·oct"));
    assert.deepEqual(prepararConsulta("  1 de Octubre  345,90 € "), ["1·oct", "345,90"]);
    assert.deepEqual(prepararConsulta("2 marcos"), ["2", "marcos"], "«2 marcos» no es el 2 de marzo");
    // y la pantalla lo usa
    assert.match(codigoLibro, /import \{ coincide, prepararConsulta \} from "\.\/libro-buscar\.js"/);
    assert.match(codigoLibro, /coincide\(m, palabras, \{ nombre \}\)/, "el buscador del libro tiene que buscar también por importe");
}

// La página del libro
const pagina = await fetch(`${base}/libro/`);
assert.equal(pagina.status, 200);
assert.match(await pagina.text(), /Cuentas · HOT SPOT S\.L\./);
assert.match(pagina.headers.get("content-security-policy") || "", /frame-ancestors 'self'/);
for (const modulo of ["app/libro.js", "app/libro-espera.js", "app/libro-buscar.js", "app/libro-pestana.js"]) {
    const servido = await fetch(`${base}/${modulo}`);
    assert.equal(servido.status, 200, modulo);
    assert.match(servido.headers.get("content-type") || "", /^text\/javascript/, modulo);
}
const sinBarra = await fetch(`${base}/libro`, { redirect: "manual" });
assert.equal(sinBarra.status, 301);
assert.equal(new URL(sinBarra.headers.get("location"), base).pathname, new URL(`${base}/libro/`).pathname);

console.log("Libro de cuentas: bien");
