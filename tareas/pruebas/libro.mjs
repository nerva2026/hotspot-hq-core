// Prueba del libro de cuentas contra un servidor en marcha sin Google (el que arranca el paso «Probar el libro de
// cuentas», con su propia carpeta de datos, en el puerto 3991):
//   node pruebas/libro.mjs http://127.0.0.1:3991/tareas <código de alta del registro>
// Crea dos cuentas (Diego y Víctor), apunta gastos, ingresos y pagos, y comprueba el balance, el CSV, el Excel,
// la importación de la hoja de Drive y los tiques. Y que la pantalla «Solo para los socios» se entera en directo cuando
// a esa persona le dan acceso (publico/app/libro-espera.js, contra el canal de verdad del servidor).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crearExcel, leerExcel } from "../servidor/excel.js";
import { esperarAcceso, AVISOS_QUE_ABREN } from "../publico/app/libro-espera.js";

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

// La página del libro
const pagina = await fetch(`${base}/libro/`);
assert.equal(pagina.status, 200);
assert.match(await pagina.text(), /Cuentas · HOT SPOT S\.L\./);
assert.match(pagina.headers.get("content-security-policy") || "", /frame-ancestors 'self'/);
for (const modulo of ["app/libro.js", "app/libro-espera.js"]) {
    const servido = await fetch(`${base}/${modulo}`);
    assert.equal(servido.status, 200, modulo);
    assert.match(servido.headers.get("content-type") || "", /^text\/javascript/, modulo);
}
const sinBarra = await fetch(`${base}/libro`, { redirect: "manual" });
assert.equal(sinBarra.status, 301);
assert.equal(new URL(sinBarra.headers.get("location"), base).pathname, new URL(`${base}/libro/`).pathname);

console.log("Libro de cuentas: bien");
