// Prueba de «cada personaje enseña solo lo suyo» (?solo=1) contra un servidor en marcha sin Google:
//   node pruebas/solo.mjs http://127.0.0.1:3990/tareas <código de alta del registro>
// Sin navegador. Comprueba lo que sirve el servidor (las cinco pantallas con ?solo=1, el módulo app/solo.js, la regla
// de estilo.css, que la dirección sin barra final no pierde el parámetro y que la vuelta de entrar lo conserva), la
// lógica del módulo (cuándo es modo solo y cómo quedan las direcciones) y que el código de las pantallas marca todos
// sus enlaces a las demás y no construye direcciones propias que pierdan el modo.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const [base, codigoAlta] = process.argv.slice(2);
if (!base || !codigoAlta) {
    console.error("Uso: node pruebas/solo.mjs <url del tablón> <código de alta>");
    process.exit(2);
}
const origen = new URL(base).origin;
const ruta = new URL(base).pathname; // /tareas

// Las cinco pantallas: su carpeta, su módulo y los enlaces que tiene a las demás.
const PANTALLAS = [
    { nombre: "tablón", carpeta: "", modulo: "principal.js", otras: ["libro/", "pizarra/", "archivo/", "musica/"], enlaces: 4 },
    { nombre: "libro", carpeta: "libro/", modulo: "libro.js", otras: ["../", "../pizarra/", "../archivo/", "../musica/"], enlaces: 9 },
    { nombre: "pizarra", carpeta: "pizarra/", modulo: "pizarra.js", otras: ["../", "../libro/", "../archivo/", "../musica/"], enlaces: 8 },
    { nombre: "archivo", carpeta: "archivo/", modulo: "archivo.js", otras: ["../", "../libro/", "../pizarra/", "../musica/"], enlaces: 8 },
    { nombre: "música", carpeta: "musica/", modulo: "musica.js", otras: ["../", "../libro/", "../pizarra/", "../archivo/"], enlaces: 8 },
];

// ---------- lo que sirve el servidor ----------

for (const p of PANTALLAS) {
    const normal = await fetch(`${base}/${p.carpeta}`);
    const solo = await fetch(`${base}/${p.carpeta}?solo=1`);
    assert.equal(normal.status, 200, p.nombre);
    assert.equal(solo.status, 200, `${p.nombre} con ?solo=1`);
    const html = await solo.text();
    assert.equal(html, await normal.text(), `${p.nombre}: la página es la misma (el modo lo pone el navegador)`);
    assert.match(html, new RegExp(`<script type="module" src="(\\.\\./)?app/${p.modulo.replace(".", "\\.")}"></script>`), `${p.nombre}: carga su módulo`);
    assert.ok(!/<script(?![^>]*\bsrc=)/.test(html), `${p.nombre}: sin scripts en línea`);
    const scripts = /script-src ([^;]*)/.exec(solo.headers.get("content-security-policy"))[1];
    assert.ok(scripts.startsWith("'self'") && !scripts.includes("unsafe"), `${p.nombre}: la CSP de siempre, sin scripts en línea (${scripts})`);
    assert.equal(solo.headers.get("content-security-policy"), normal.headers.get("content-security-policy"));
    // Sin la barra final se redirige a la carpeta sin perder el parámetro (y sin él, como siempre).
    if (p.carpeta) {
        const sinBarra = `${base}/${p.carpeta.slice(0, -1)}`;
        let r = await fetch(`${sinBarra}?solo=1`, { redirect: "manual" });
        assert.equal(r.status, 301);
        assert.equal(r.headers.get("location"), `${ruta}/${p.carpeta}?solo=1`);
        r = await fetch(sinBarra, { redirect: "manual" });
        assert.equal(r.headers.get("location"), `${ruta}/${p.carpeta}`);
    }
}
let r = await fetch(`${origen}${ruta}?solo=1`, { redirect: "manual" });
assert.equal(r.status, 301);
assert.equal(r.headers.get("location"), `${ruta}/?solo=1`);
r = await fetch(`${origen}${ruta}?p=ideas&solo=1`, { redirect: "manual" });
assert.equal(r.headers.get("location"), `${ruta}/?p=ideas&solo=1`);
r = await fetch(`${origen}${ruta}`, { redirect: "manual" });
assert.equal(r.headers.get("location"), `${ruta}/`);

// El módulo y la regla de estilo, tal como llegan al navegador
r = await fetch(`${base}/app/solo.js`);
assert.equal(r.status, 200);
assert.match(r.headers.get("content-type"), /javascript/);
const servido = await r.text();
const carpetaApp = new URL("../publico/app/", import.meta.url);
assert.equal(servido, readFileSync(new URL("solo.js", carpetaApp), "utf8"));
assert.ok(!/sessionStorage|localStorage/.test(servido.replace(/^\s*\/\/.*$/gm, "")), "el modo no se guarda en el almacenamiento del navegador: solo en la dirección");
const estilo = await (await fetch(`${base}/estilo.css`)).text();
assert.match(estilo, /\.solo \.otra-pantalla \{\s*display: none !important;\s*\}/, "la regla que esconde lo que lleva a otra pantalla");

// La vuelta de entrar (/cuentas/entrar?vuelta=…) conserva el modo; y con sesión, las pantallas siguen igual
r = await fetch(`${base}/api/alta`, { method: "POST", headers: { "x-tablon": "1", "content-type": "application/json" }, body: JSON.stringify({ codigo: codigoAlta, nombre: "Diego", clave: "una clave muy larga", color: "#e0562a" }) });
assert.equal(r.status, 200, await r.clone().text());
const galleta = r.headers.get("set-cookie").split(";")[0];
for (const vuelta of [`${ruta}/libro/?solo=1`, `${ruta}/pizarra/?p=ideas&solo=1`, `${ruta}/archivo/?doc=abc_DEF-123&solo=1`, `${ruta}/?solo=1`, `${ruta}/musica/?solo=1`]) {
    r = await fetch(`${origen}/cuentas/entrar?vuelta=${encodeURIComponent(vuelta)}`, { headers: { cookie: galleta }, redirect: "manual" });
    assert.equal(r.status, 302, vuelta);
    assert.equal(r.headers.get("location"), vuelta);
}
r = await fetch(`${base}/api/datos?solo=1`, { headers: { cookie: galleta, "x-tablon": "1" } });
assert.equal(r.status, 200, "la API no se entera del parámetro");

// ---------- la lógica del módulo ----------

const direccionModulo = new URL("solo.js", carpetaApp).href;
const { pideSolo, ponerSolo, PARAMETRO, SOLO, conSolo, sinSolo } = await import(direccionModulo);
assert.equal(PARAMETRO, "solo");
// Sin página (aquí, en Node) no hay modo solo ni falla nada
assert.equal(SOLO, false);
assert.equal(conSolo("/tareas/libro/"), "/tareas/libro/");
assert.equal(sinSolo("/tareas/libro/?solo=1"), "/tareas/libro/");

// Solo vale «solo=1»
for (const si of ["?solo=1", "solo=1", "?p=reuniones&solo=1", "?solo=1&doc=abc", "?doc=abc&solo=1&x=2"]) assert.equal(pideSolo(si), true, si);
for (const no of ["", "?", undefined, null, "?solo", "?solo=", "?solo=0", "?solo=si", "?solo=true", "?solo=11", "?p=solo", "?otro=solo%3D1", "?SOLO=1", "?nosolo=1", "?solo=0&solo=1"]) assert.equal(pideSolo(no), false, String(no));

// Poner y quitar el parámetro sin tocar nada más
const CASOS = [
    // [dirección, con solo, sin solo]
    ["/tareas/", "/tareas/?solo=1", "/tareas/"],
    ["/tareas/libro/", "/tareas/libro/?solo=1", "/tareas/libro/"],
    ["/tareas/libro/?solo=1", "/tareas/libro/?solo=1", "/tareas/libro/"],
    ["/tareas/pizarra/?p=ideas", "/tareas/pizarra/?p=ideas&solo=1", "/tareas/pizarra/?p=ideas"],
    ["/tareas/pizarra/?solo=1&p=ideas", "/tareas/pizarra/?p=ideas&solo=1", "/tareas/pizarra/?p=ideas"],
    ["/tareas/archivo/?doc=a%20b%2Fc", "/tareas/archivo/?doc=a%20b%2Fc&solo=1", "/tareas/archivo/?doc=a%20b%2Fc"],
    ["/tareas/archivo/?doc=abc&solo=1#doc-título", "/tareas/archivo/?doc=abc&solo=1#doc-título", "/tareas/archivo/?doc=abc#doc-título"],
    ["/tareas/archivo/#ancla", "/tareas/archivo/?solo=1#ancla", "/tareas/archivo/#ancla"],
    ["/tareas/archivo/#ancla?solo=1", "/tareas/archivo/?solo=1#ancla?solo=1", "/tareas/archivo/#ancla?solo=1"],
    ["/tareas/?tarea=t1&solo=0", "/tareas/?tarea=t1&solo=1", "/tareas/?tarea=t1"],
    ["/tareas/?solo=1&solo=1", "/tareas/?solo=1", "/tareas/"],
    ["/tareas/?nosolo=1&solos=2", "/tareas/?nosolo=1&solos=2&solo=1", "/tareas/?nosolo=1&solos=2"],
    ["/tareas/?", "/tareas/?solo=1", "/tareas/"],
    ["https://oficina.hot-spot.es/tareas/pizarra/?p=reuniones&solo=1", "https://oficina.hot-spot.es/tareas/pizarra/?p=reuniones&solo=1", "https://oficina.hot-spot.es/tareas/pizarra/?p=reuniones"],
    ["http://127.0.0.1:3990/tareas/api/musica/conectar?volver=1", "http://127.0.0.1:3990/tareas/api/musica/conectar?volver=1&solo=1", "http://127.0.0.1:3990/tareas/api/musica/conectar?volver=1"],
];
for (const [direccion, con, sin] of CASOS) {
    assert.equal(ponerSolo(direccion, true), con, `con solo: ${direccion}`);
    assert.equal(ponerSolo(direccion, false), sin, `sin solo: ${direccion}`);
    assert.equal(pideSolo(new URL(con, "http://x").search), true, con);
    assert.equal(pideSolo(new URL(sin, "http://x").search), false, sin);
    // Repetirlo no cambia nada
    assert.equal(ponerSolo(con, true), con);
    assert.equal(ponerSolo(sin, false), sin);
}

// En una página: la clase «solo» en <html> y las direcciones propias, según la dirección con la que se abrió
async function enPagina(busqueda) {
    const clases = new Set();
    globalThis.location = { search: busqueda, pathname: "/tareas/archivo/" };
    globalThis.document = { documentElement: { classList: { toggle: (clase, si) => (si ? clases.add(clase) : clases.delete(clase)) } } };
    try {
        // Con otra «?…» Node lo carga como un módulo nuevo, igual que una página recién abierta.
        return { ...(await import(`${direccionModulo}?prueba=${encodeURIComponent(busqueda)}`)), clases: [...clases] };
    } finally {
        delete globalThis.location;
        delete globalThis.document;
    }
}
let pagina = await enPagina("?doc=abc&solo=1");
assert.equal(pagina.SOLO, true);
assert.deepEqual(pagina.clases, ["solo"]);
assert.equal(pagina.conSolo("/tareas/archivo/"), "/tareas/archivo/?solo=1", "cerrar el documento conserva el modo");
assert.equal(pagina.conSolo("/tareas/archivo/?doc=otro"), "/tareas/archivo/?doc=otro&solo=1", "abrir otro documento conserva el modo");
assert.equal(pagina.sinSolo("http://x/tareas/archivo/?doc=abc&solo=1"), "http://x/tareas/archivo/?doc=abc", "«Abrir en pestaña nueva» va sin el modo");
pagina = await enPagina("?doc=abc");
assert.equal(pagina.SOLO, false);
assert.deepEqual(pagina.clases, []);
assert.equal(pagina.conSolo("/tareas/archivo/"), "/tareas/archivo/", "sin el parámetro, las direcciones de siempre");
assert.equal(pagina.conSolo("/tareas/archivo/?doc=otro"), "/tareas/archivo/?doc=otro");
pagina = await enPagina("?solo=0");
assert.equal(pagina.SOLO, false);
assert.deepEqual(pagina.clases, []);

// ---------- el código de las pantallas ----------

const fuente = (f) => readFileSync(new URL(f, carpetaApp), "utf8");
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const MARCA = /otra-pantalla|\botra: true\b|, otra\)/g; // las tres maneras de marcar un enlace a otra pantalla

for (const p of PANTALLAS) {
    const codigo = fuente(p.modulo);
    // Todas importan solo.js (directamente o por acceso.js, que también lo usa): así se pone la clase en <html>.
    assert.match(codigo, /from "\.\/solo\.js"/, `${p.modulo} no usa solo.js`);
    // Cada enlace a otra pantalla (una cadena que es justo su dirección) lleva su marca en la misma línea.
    const otra = new RegExp(`["'](?:${p.otras.map(escapar).join("|")})["']`, "g");
    let marcados = 0;
    for (const [i, linea] of codigo.split("\n").entries()) {
        const enlaces = linea.match(otra)?.length || 0;
        if (!enlaces) continue;
        const marcas = linea.match(MARCA)?.length || 0;
        assert.ok(marcas >= enlaces, `${p.modulo}:${i + 1}: un enlace a otra pantalla sin marcar (otra-pantalla): ${linea.trim().slice(0, 160)}`);
        marcados += enlaces;
    }
    assert.equal(marcados, p.enlaces, `${p.modulo}: enlaces a otras pantallas (pestañas y menú de la cuenta)`);
    // «Abrir en pestaña nueva» sale de la oficina: sin el modo (la música ya iba sin parámetros)
    for (const linea of codigo.split("\n").filter((l) => l.includes("Abrir en pestaña nueva ↗") && l.includes("location.href"))) {
        assert.match(linea, /sinSolo\(location\.href|location\.href\.split\("#"\)\[0\]\.split\("\?"\)\[0\]/, `${p.modulo}: ${linea.trim().slice(0, 160)}`);
    }
}
assert.match(fuente("principal.js"), /o\.otra && "otra-pantalla"/, "el menú del tablón pone la marca");
assert.match(fuente("libro.js"), /o\.otra && "otra-pantalla"/, "el menú del libro pone la marca");
assert.match(fuente("acceso.js"), /from "\.\/solo\.js"/);

// Ninguna pantalla cambia su dirección (history.pushState y replaceState) sin conservar el modo: o pasa por conSolo()
// o deja la búsqueda como está (location.search).
assert.match(fuente("archivo.js"), /const enlaceDoc = \(id\) => conSolo\(/);
let cambios = 0;
for (const f of readdirSync(carpetaApp).filter((f) => f.endsWith(".js"))) {
    for (const [i, linea] of fuente(f).split("\n").entries()) {
        if (!/history\.(pushState|replaceState)\(/.test(linea)) continue;
        cambios++;
        assert.match(linea, /conSolo\(|enlaceDoc\(|location\.search/, `${f}:${i + 1}: cambia la dirección sin conservar ?solo=1: ${linea.trim()}`);
    }
}
assert.ok(cambios >= 6, `se han mirado los cambios de dirección (${cambios})`);

console.log("Modo solo (?solo=1, cada personaje enseña solo lo suyo): bien");
