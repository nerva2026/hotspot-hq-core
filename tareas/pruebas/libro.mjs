// Prueba del libro de cuentas contra un servidor en marcha sin Google (como el paso «Probar el servidor»):
//   node pruebas/libro.mjs http://127.0.0.1:3999/tareas <código de alta del registro>
// Crea dos cuentas (Diego y Víctor), apunta gastos, ingresos y pagos, y comprueba el balance, el CSV, el Excel,
// la importación de la hoja de Drive y los tiques.

import assert from "node:assert/strict";
import { crearExcel, leerExcel } from "../servidor/excel.js";

const [base, codigoAlta] = process.argv.slice(2);
if (!base || !codigoAlta) {
    console.error("Uso: node pruebas/libro.mjs <url del tablón> <código de alta>");
    process.exit(2);
}

function cliente() {
    let galleta = "";
    return async function llamar(metodo, ruta, cuerpo, { tipo, crudo = false } = {}) {
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
        const r = await fetch(`${base}/api/${ruta}`, { method: metodo, headers: cabeceras, body });
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
r = await diego("PATCH", "libro/ajustes", { partes: { [idDiego]: 50, [idVictor]: 50 } });
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
const sinBarra = await fetch(`${base}/libro`, { redirect: "manual" });
assert.equal(sinBarra.status, 301);
assert.equal(new URL(sinBarra.headers.get("location"), base).pathname, new URL(`${base}/libro/`).pathname);

console.log("Libro de cuentas: bien");
