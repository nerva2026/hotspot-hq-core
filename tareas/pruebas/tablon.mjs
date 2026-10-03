// Prueba del tablón de tareas contra un servidor en marcha sin Google (como el paso «Probar el servidor»):
//   node pruebas/tablon.mjs http://127.0.0.1:3993/tareas <código de alta del registro>
// Crea dos cuentas (Diego y Víctor) y comprueba que las notas de una tarea no se pisan: quien guarda sobre una versión
// que ya no es la que hay recibe un 409 con lo que hay ahora, y con la versión buena se guarda. Sin «antes» pasa lo
// mismo si la tarea ya tiene notas, y el cliente de ahora (publico/app/) siempre lo manda. Y la lógica de las pantallas
// que no necesita navegador: la franja «Sin conexión…» (app/conexion.js) y las capas (app/capas.js): el tabulador que da
// la vuelta dentro de una ventana y el «atrás» que la cierra sin ensuciar el historial.

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

// ---------- las capas (app/capas.js): ventanas, ficha y menús ----------
// El tabulador da la vuelta dentro de la capa y «atrás» la cierra sin ensuciar el historial. La lógica, con un
// historial de mentira (en pantalla se mira con un navegador).
{
    const { vueltaDeTab, crearAtras, MARCA } = await import(new URL("capas.js", carpetaApp).href);

    // El tabulador: en los extremos da la vuelta; en medio, lo deja pasar; desde fuera, entra.
    assert.equal(vueltaDeTab({ total: 4, indice: 3 }), 0, "del último, al primero");
    assert.equal(vueltaDeTab({ total: 4, indice: 0, atras: true }), 3, "Mayús+Tab en el primero: al último");
    assert.equal(vueltaDeTab({ total: 4, indice: 1 }), null, "en medio, el navegador sigue");
    assert.equal(vueltaDeTab({ total: 4, indice: 2, atras: true }), null);
    assert.equal(vueltaDeTab({ total: 4, indice: -1, dentro: false }), 0, "con el foco detrás, entra por el principio");
    assert.equal(vueltaDeTab({ total: 4, indice: -1, dentro: false, atras: true }), 3, "…o por el final");
    assert.equal(vueltaDeTab({ total: 4, indice: -1, dentro: true }), null);
    assert.equal(vueltaDeTab({ total: 1, indice: 0 }), 0, "con una sola parada, se queda en ella");
    assert.equal(vueltaDeTab({ total: 1, indice: 0, atras: true }), 0);
    assert.equal(vueltaDeTab({ total: 0, indice: -1 }), -1, "sin paradas, el foco se queda en la capa");

    // Un historial de mentira: «back()» no se mueve al momento; «llegar()» hace lo que haría el navegador un instante
    // después (moverse y avisar con «popstate»). «persona(±1)» es el botón de atrás o de adelante.
    function historialFalso(direccion = "/tareas/?solo=1", estado = null) {
        const entradas = [{ estado: null, direccion: "/antes/" }, { estado, direccion }];
        let i = 1;
        const pendientes = [];
        const h = {
            atrases: 0,
            get state() {
                return entradas[i].estado;
            },
            get length() {
                return entradas.length;
            },
            direccion: () => entradas[i].direccion,
            pushState(e, _titulo, d) {
                entradas.splice(i + 1);
                entradas.push({ estado: e, direccion: d ?? entradas[i].direccion });
                i++;
            },
            replaceState(e, _titulo, d) {
                entradas[i] = { estado: e, direccion: d ?? entradas[i].direccion };
            },
            back() {
                h.atrases++;
                pendientes.push(-1);
            },
            persona: (paso) => pendientes.push(paso),
            llegar(alVolver) {
                while (pendientes.length) {
                    const paso = pendientes.shift();
                    if (i + paso < 0 || i + paso >= entradas.length) continue;
                    i += paso;
                    alVolver(entradas[i].estado);
                }
            },
            direcciones: () => entradas.map((e, n) => (n === i ? `[${e.direccion}]` : e.direccion)).join(" "),
        };
        return h;
    }
    function montaje(direccion, estado) {
        const h = historialFalso(direccion, estado);
        const capas = [];
        const cierres = [];
        const atras = crearAtras({
            historial: h,
            capas: () => capas,
            cerrarArriba: () => {
                const capa = capas[capas.length - 1];
                cierres.push(capa.nombre);
                if (capa.terca) return; // no se deja cerrar (unas notas en conflicto)
                capas.pop();
                atras.alCambiar();
            },
        });
        const abrir = (nombre, mas = {}) => {
            const capa = { nombre, ...mas };
            capas.push(capa);
            atras.alCambiar();
            return capa;
        };
        const cerrar = (capa) => {
            capas.splice(capas.indexOf(capa), 1);
            atras.alCambiar();
        };
        return { h, capas, cierres, atras, abrir, cerrar, llegar: () => h.llegar(atras.alVolver) };
    }

    // Abrir una ventana apunta UNA entrada (con la misma dirección) y cerrarla con el botón la retira.
    let m = montaje();
    let v = m.abrir("nueva tarea");
    assert.equal(m.h.length, 3);
    assert.equal(m.h.state[MARCA], true);
    assert.equal(m.h.direcciones(), "/antes/ /tareas/?solo=1 [/tareas/?solo=1]", "la ventana no cambia la dirección (ni pierde ?solo=1)");
    m.cerrar(v);
    assert.equal(m.h.atrases, 1, "cerrar con el botón vuelve atrás una vez");
    m.llegar();
    assert.equal(m.h.direcciones(), "/antes/ [/tareas/?solo=1] /tareas/?solo=1");
    assert.equal(m.h.state, null);
    assert.deepEqual(m.cierres, [], "nuestro propio «atrás» no cierra nada");
    assert.deepEqual(m.atras.estado(), { enCentinela: false, retirando: false });
    // …y diez veces seguidas no llenan el historial: «atrás» sigue llevando a lo de antes.
    for (let n = 0; n < 10; n++) {
        v = m.abrir("nueva tarea");
        m.cerrar(v);
        m.llegar();
    }
    assert.equal(m.h.length, 3, "como mucho queda la entrada de «adelante»");
    assert.equal(m.h.direcciones().startsWith("/antes/ [/tareas/?solo=1]"), true);

    // «Atrás» con la ficha abierta la cierra (una vez) y no sale del tablón; la ficha pone su dirección.
    m = montaje();
    m.abrir("ficha", { direccion: "/tareas/?tarea=abc&solo=1" });
    assert.equal(m.h.direcciones(), "/antes/ /tareas/?solo=1 [/tareas/?tarea=abc&solo=1]");
    m.h.persona(-1);
    m.llegar();
    assert.deepEqual(m.cierres, ["ficha"]);
    assert.equal(m.capas.length, 0);
    assert.equal(m.h.atrases, 0, "no hace falta volver atrás otra vez");
    assert.equal(m.h.direcciones(), "/antes/ [/tareas/?solo=1] /tareas/?tarea=abc&solo=1");
    // «adelante» lleva a un centinela viejo sin nada que enseñar: se vuelve solo
    m.h.persona(1);
    m.llegar();
    assert.equal(m.h.atrases, 1);
    assert.equal(m.h.direcciones(), "/antes/ [/tareas/?solo=1] /tareas/?tarea=abc&solo=1");
    assert.deepEqual(m.cierres, ["ficha"]);

    // Una capa que no se deja cerrar (notas en conflicto): «atrás» no saca de la pantalla; se queda con su centinela.
    m = montaje();
    const terca = m.abrir("ficha", { direccion: "/tareas/?tarea=abc", terca: true });
    m.h.persona(-1);
    m.llegar();
    assert.deepEqual(m.cierres, ["ficha"]);
    assert.equal(m.capas.length, 1);
    assert.equal(m.h.state[MARCA], true, "vuelve a haber centinela");
    assert.equal(m.h.direccion(), "/tareas/?tarea=abc");
    terca.terca = false;
    m.h.persona(-1);
    m.llegar();
    assert.equal(m.capas.length, 0);
    assert.equal(m.h.direccion(), "/tareas/?solo=1");

    // Dos capas (la ficha y, encima, una ventana): un solo centinela; cada «atrás» cierra una.
    m = montaje();
    m.abrir("ficha", { direccion: "/tareas/?tarea=abc" });
    m.abrir("ventana");
    assert.equal(m.h.length, 3, "un centinela para las dos");
    assert.equal(m.h.direccion(), "/tareas/?tarea=abc");
    m.h.persona(-1);
    m.llegar();
    assert.deepEqual(m.cierres, ["ventana"]);
    assert.equal(m.h.state[MARCA], true, "queda la ficha, con su centinela");
    assert.equal(m.h.direccion(), "/tareas/?tarea=abc");
    m.h.persona(-1);
    m.llegar();
    assert.deepEqual(m.cierres, ["ventana", "ficha"]);
    assert.equal(m.h.direccion(), "/tareas/?solo=1");
    // …y si se cierra la de abajo con la otra abierta («Crear y abrir» cierra la ventana y deja la ficha), sigue el centinela
    m = montaje();
    v = m.abrir("ventana");
    m.abrir("ficha", { direccion: "/tareas/?tarea=abc" });
    m.cerrar(v);
    assert.equal(m.h.atrases, 0);
    assert.equal(m.h.direccion(), "/tareas/?tarea=abc");

    // Cerrar una y abrir otra en el mismo momento (pulsar otra tarea con la ficha abierta): cuando llega nuestro
    // «atrás», se pone el centinela de la nueva, con su dirección.
    m = montaje();
    let f = m.abrir("ficha", { direccion: "/tareas/?tarea=abc" });
    m.cerrar(f);
    f = m.abrir("ficha", { direccion: "/tareas/?tarea=xyz" });
    assert.equal(m.h.atrases, 1);
    m.llegar();
    assert.equal(m.h.direcciones(), "/antes/ /tareas/?solo=1 [/tareas/?tarea=xyz]");
    assert.deepEqual(m.cierres, []);
    m.cerrar(f);
    m.llegar();
    assert.equal(m.h.direcciones(), "/antes/ [/tareas/?solo=1] /tareas/?tarea=xyz");

    // Lo que ya dijera la entrada se conserva en el centinela (el archivo guarda ahí qué documento está abierto).
    m = montaje("/tareas/archivo/?doc=d1", { doc: "d1" });
    v = m.abrir("editar documento");
    assert.deepEqual(m.h.state, { doc: "d1", [MARCA]: true });
    m.cerrar(v);
    m.llegar();
    assert.deepEqual(m.h.state, { doc: "d1" });

    // Si alguien ha apuntado otra cosa en el historial después (la oficina, que comparte el de la pestaña), cerrar con
    // el botón NO vuelve atrás: saldría de esa otra cosa. Se queda una entrada sin marca.
    m = montaje();
    v = m.abrir("ventana");
    m.h.pushState({ deOtro: true }, "", "/otra-sala");
    m.cerrar(v);
    assert.equal(m.h.atrases, 0, "la entrada de ahora no es la nuestra");
    m = montaje();
    v = m.abrir("ventana");
    const marcada = m.h.state;
    m.h.pushState({ deOtro: true }, "", "/otra-sala"); // el marco no lo ve: su entrada sigue siendo la suya…
    m.h.replaceState(marcada, "", "/tareas/?solo=1"); // …pero el historial mide uno más
    m.cerrar(v);
    assert.equal(m.h.atrases, 0, "el historial ha crecido por encima");
    assert.equal(m.h.state, null, "y la entrada se queda sin marca");

    // La página recargada sobre un centinela (se recargó con la ficha abierta): se retira al cargar.
    m = montaje("/tareas/?tarea=abc", { [MARCA]: true });
    m.atras.alCargar();
    assert.equal(m.h.atrases, 1);
    m.llegar();
    assert.deepEqual(m.atras.estado(), { enCentinela: false, retirando: false });
    m = montaje();
    m.atras.alCargar();
    assert.equal(m.h.atrases, 0, "sin centinela, al cargar no se toca el historial");

    // Un «atrás» que no es de las capas (el del visor del archivo) no se toca.
    m = montaje();
    assert.equal(m.atras.alVolver(null), false);
    assert.equal(m.atras.alVolver({ doc: "d1" }), false);

    // Y las pantallas lo usan: toda ventana es una capa modal; la ficha, una capa con su dirección (por conSolo);
    // los menús, capas sin «atrás». Y capas.js no construye direcciones: usa la que hay o la que le da la capa.
    const fuente = (f) => readFileSync(new URL(f, carpetaApp), "utf8");
    assert.match(fuente("menus.js"), /capa = abrirCapa\(\{ el: fondo, cerrar, modal: true \}\)/, "las ventanas son capas modales");
    assert.match(fuente("menus.js"), /abrirCapa\(\{ el, cerrar: cerrarMenu, conAtras: false \}\)/, "los menús son capas");
    assert.match(fuente("ficha.js"), /abrirCapa\(\{ el: panel, cerrar: \(\) => cerrarFicha\(\), direccion: direccionDeTarea\(id\) \}\)/, "la ficha es una capa con su dirección");
    assert.match(fuente("ficha.js"), /const direccionDeTarea = \(id\) => conSolo\(/, "la dirección de la ficha conserva el modo solo");
    assert.ok(!/conSolo|solo=|\?tarea|new URL\(/.test(fuente("capas.js").replace(/^\s*\/\/.*$/gm, "")), "capas.js no construye direcciones");
    for (const f of readdirSync(carpetaApp).filter((f) => f.endsWith(".js") && f !== "menus.js")) {
        assert.ok(!/class: "fondo-ventana"|aria-modal/.test(fuente(f)), `${f} hace una ventana por su cuenta: tiene que usar ventana() de menus.js`);
    }
}

// ---------- el buscador del tablón (app/tablon-buscar.js) ----------
// Encuentra lo que el tablón enseña, como lo enseña: la etiqueta con y sin «#», la persona (para quién y quién la pidió)
// con y sin «@» y sin tildes, la prioridad y el estado; todas las palabras, en cualquier orden.
{
    const { coincide, prepararBusqueda, loBuscable } = await import(new URL("tablon-buscar.js", carpetaApp).href);
    const nombres = { d: "Diego", v: "Víctor", a: "Ana", m: "Maximiliano Fernández-Et" };
    const ayudas = { nombre: (id) => nombres[id] || "" };
    const tarea = (titulo, mas = {}) => ({ titulo, notas: "", estado: "por-hacer", prioridad: null, responsables: [], pedidoPor: null, etiquetas: [], subtareas: [], ...mas });
    const lista = [
        tarea("Cerrar el bolo de Zaragoza", { etiquetas: ["bolos", "fiesta"], responsables: ["v"], pedidoPor: "d", prioridad: "urgente", estado: "en-marcha" }),
        tarea("Pagar la factura del local", { etiquetas: ["dinero"], responsables: ["d"], prioridad: "alta", notas: "Hablar con Víctor antes" }),
        tarea("Comprar bolos para el futbolín", { responsables: ["a", "v"], prioridad: "media", estado: "esperando", subtareas: [{ texto: "Pedir precio", hecha: false }] }),
        tarea("Grabar cuña de radio", { responsables: ["m"], pedidoPor: "a", estado: "hecho", prioridad: "baja" }),
        tarea("Fotos"),
    ];
    const buscar = (texto) => lista.filter((t) => coincide(t, texto, ayudas)).map((t) => t.titulo.split(" ")[0]);
    // etiquetas: con y sin almohadilla; con ella, solo la etiqueta (no un título que lo diga)
    assert.deepEqual(buscar("#bolos"), ["Cerrar"], "«#bolos» encuentra la etiqueta");
    assert.deepEqual(buscar("bolos"), ["Cerrar", "Comprar"], "«bolos» encuentra la etiqueta y el título");
    assert.deepEqual(buscar("#BOLOS"), ["Cerrar"]);
    assert.deepEqual(buscar("#bol"), ["Cerrar"], "vale el principio, como mientras se escribe");
    assert.deepEqual(buscar("#dinero #bolos"), [], "todas las palabras");
    assert.deepEqual(buscar("#fiesta #bolos"), ["Cerrar"]);
    // personas: para quién y pedido por; con y sin arroba; sin tildes ni mayúsculas
    assert.deepEqual(buscar("víctor"), ["Cerrar", "Pagar", "Comprar"], "por persona (y lo que diga el texto)");
    assert.deepEqual(buscar("victor"), ["Cerrar", "Pagar", "Comprar"]);
    assert.deepEqual(buscar("@víctor"), ["Cerrar", "Comprar"], "«@víctor»: solo las suyas, no las que lo nombran en las notas");
    assert.deepEqual(buscar("@VICTOR"), ["Cerrar", "Comprar"]);
    assert.deepEqual(buscar("@diego"), ["Cerrar", "Pagar"], "para quién y pedido por");
    assert.deepEqual(buscar("ana"), ["Comprar", "Grabar"]);
    assert.deepEqual(buscar("@maximiliano"), ["Grabar"], "también quien ha salido del crew y sigue en la tarea");
    assert.deepEqual(buscar("fernández-et"), ["Grabar"]);
    assert.deepEqual(buscar("sin asignar"), ["Fotos"]);
    // prioridad y estado
    assert.deepEqual(buscar("urgente"), ["Cerrar"]);
    assert.deepEqual(buscar("!urgente"), ["Cerrar"], "como se escribe al crear una tarea");
    assert.deepEqual(buscar("!alta"), ["Pagar"]);
    assert.deepEqual(buscar("prioridad media"), ["Comprar"]);
    assert.deepEqual(buscar("sin prioridad"), ["Fotos"]);
    assert.deepEqual(buscar("esperando"), ["Comprar"]);
    assert.deepEqual(buscar("en marcha"), ["Cerrar"]);
    assert.deepEqual(buscar("hecho"), ["Grabar"]);
    assert.deepEqual(buscar("hecha"), ["Grabar"]);
    assert.deepEqual(buscar("por hacer"), ["Pagar", "Fotos"]);
    // varias palabras, en cualquier orden y de cosas distintas
    assert.deepEqual(buscar("@víctor #bolos urgente"), ["Cerrar"]);
    assert.deepEqual(buscar("urgente   zaragoza @victor"), ["Cerrar"]);
    assert.deepEqual(buscar("@ana esperando bolos"), ["Comprar"]);
    assert.deepEqual(buscar("@ana urgente"), []);
    // lo de siempre: título, notas y subtareas
    assert.deepEqual(buscar("factura"), ["Pagar"]);
    assert.deepEqual(buscar("hablar antes"), ["Pagar"]);
    assert.deepEqual(buscar("pedir precio"), ["Comprar"]);
    assert.equal(buscar("").length, lista.length, "con el buscador vacío salen todas");
    assert.equal(buscar("   ").length, lista.length);
    assert.deepEqual(buscar("no-hay-nada-asi"), []);
    assert.deepEqual(prepararBusqueda("  #Bolos   @Víctor "), ["#bolos", "@victor"]);
    assert.equal(typeof loBuscable(lista[0], ayudas), "string");
    // textos raros no rompen nada
    assert.deepEqual(lista.filter((t) => coincide(tarea("<script>alert(1)</script> 🎉 \"comillas\"", { etiquetas: ["🎉"] }), "<script>", ayudas)).length, lista.length);
    // y el tablón lo usa (con los nombres de todo el crew, también de quien ha salido)
    const principal = readFileSync(new URL("principal.js", carpetaApp), "utf8");
    assert.match(principal, /import \{ coincide, prepararBusqueda \} from "\.\/tablon-buscar\.js"/);
    assert.match(principal, /return coincide\(t, palabras, ayudas\);/, "el buscador del tablón busca también por etiqueta, persona, prioridad y estado");
}

// ---------- quien ha salido del crew se puede quitar de sus tareas (app/personas.js) ----------
{
    const { paraElegir, conTareas, botonTodos } = await import(new URL("personas.js", carpetaApp).href);
    const crew = [{ id: "d", nombre: "Diego" }, { id: "x", nombre: "Xavi", baja: true }, { id: "v", nombre: "Víctor" }, { id: "z", nombre: "Zoe", baja: true }];
    const ids = (lista) => lista.map((u) => u.id);
    assert.deepEqual(ids(paraElegir(crew, ["d"])), ["d", "v"], "sin nadie de fuera en la tarea, solo el crew de ahora");
    assert.deepEqual(ids(paraElegir(crew, ["d", "x"])), ["d", "v", "x"], "quien ha salido y está en la tarea sale en la lista, al final");
    assert.deepEqual(ids(paraElegir(crew, "z")), ["d", "v", "z"], "también para «Pedido por» (una sola persona)");
    assert.deepEqual(ids(paraElegir(crew, null)), ["d", "v"]);
    assert.deepEqual(ids(paraElegir(crew, [])), ["d", "v"]);
    assert.equal(paraElegir(crew, ["x"]).at(-1).baja, true, "y va marcada, para que el menú diga «fuera del crew»");
    assert.deepEqual(ids(conTareas(crew, [{ responsables: ["z", "d"] }, { responsables: [] }])), ["d", "v", "z"], "al agrupar por persona, su tarea tiene grupo");
    assert.deepEqual(ids(conTareas(crew, [])), ["d", "v"]);
    // «Todos» son los de ahora; a quien ha salido no lo pone, pero tampoco lo quita. «Nadie» quita a todos.
    let b = botonTodos(paraElegir(crew, ["x"]), new Set(["x"]));
    assert.equal(b.texto, "Los dos");
    assert.deepEqual(b.alPulsar().sort(), ["d", "v", "x"]);
    b = botonTodos(paraElegir(crew, ["x"]), new Set(["x", "d", "v"]));
    assert.equal(b.texto, "Nadie");
    assert.deepEqual(b.alPulsar(), []);
    b = botonTodos(paraElegir(crew, []), new Set(["d"]));
    assert.deepEqual([b.texto, b.alPulsar().sort()], ["Los dos", ["d", "v"]]);
    assert.equal(botonTodos([...crew, { id: "a", nombre: "Ana" }], new Set()).texto, "Todos");
    assert.equal(botonTodos([{ id: "d", nombre: "Diego" }, { id: "x", nombre: "Xavi", baja: true }], new Set(["x"])), null, "con una sola persona en el crew no hay botón");
    // las pantallas lo usan: los menús de la ficha y de la lista, y los grupos por persona
    const fuente = (f) => readFileSync(new URL(f, carpetaApp), "utf8");
    for (const f of ["ficha.js", "lista.js"]) {
        assert.match(fuente(f), /menuPersonas\(a, ctx\.paraElegir\(t\.responsables\), t\.responsables,/, `${f}: «Para quién» lista también a quien ha salido y sigue en la tarea`);
        assert.match(fuente(f), /menuPersona\(a, ctx\.paraElegir\(t\.pedidoPor\), t\.pedidoPor,/, `${f}: y «Pedido por»`);
        assert.ok(!/menuPersonas?\(a, ctx\.activos\(\)/.test(fuente(f)), `${f}: ningún menú de personas de una tarea con solo los activos`);
    }
    assert.match(fuente("menus.js"), /u\.baja \? h\("span", \{ class: "fuera-del-crew" \}, "fuera del crew"\) : null/, "el menú marca a quien ha salido");
    assert.match(fuente("lista.js"), /ctx\.conTareas\(tareas\)/);
    assert.match(fuente("cronograma.js"), /ctx\.conTareas\(conFechas\)/);
    // Con el servidor: Víctor sale del crew con una tarea puesta; sigue en ella y en la lista de personas (marcado
    // «baja»), y se le puede quitar.
    r = await diego("GET", "datos");
    const victorId = r.datos.usuarios.find((u) => u.nombre === "Víctor").id;
    r = await diego("POST", "tareas", { titulo: "Tarea de quien se va", responsables: [victorId, idDiego], pedidoPor: victorId });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    const suya = r.datos.id;
    r = await diego("PATCH", `crew/${victorId}`, { baja: true });
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    r = await diego("GET", "datos");
    const tareaSuya = r.datos.tareas.find((x) => x.id === suya);
    assert.deepEqual(tareaSuya.responsables, [victorId, idDiego], "sus tareas se quedan");
    assert.equal(r.datos.usuarios.find((u) => u.id === victorId).baja, true);
    assert.deepEqual(ids(paraElegir(r.datos.usuarios, tareaSuya.responsables)), [idDiego, victorId], "y sale en el menú de esa tarea");
    assert.deepEqual(ids(paraElegir(r.datos.usuarios, tareaSuya.pedidoPor)), [idDiego, victorId]);
    r = await diego("PATCH", `tareas/${suya}`, { responsables: tareaSuya.responsables.filter((id) => id !== victorId), pedidoPor: null });
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    assert.deepEqual(r.datos.responsables, [idDiego]);
    assert.equal(r.datos.pedidoPor, null);
    r = await diego("GET", "datos");
    assert.deepEqual(ids(paraElegir(r.datos.usuarios, r.datos.tareas.find((x) => x.id === suya).responsables)), [idDiego], "una vez quitado, ya no sale");
    r = await diego("PATCH", `crew/${victorId}`, { baja: false });
    assert.equal(r.estado, 200);
}

// ---------- guardar al cerrar o recargar la página (app/guardado.js) ----------
// Las notas de una tarea y el texto de una nota de la pizarra se guardan un rato después de la última letra. Si la
// página se cierra o se recarga antes, lo pendiente sale en ese momento (con «alSalir», que en api.js es «keepalive»),
// una sola vez, y después no se repite.
{
    const { guardadoRetrasado, guardarAlSalir } = await import(new URL("guardado.js", carpetaApp).href);
    // un reloj de mentira: los temporizadores solo saltan cuando se le dice
    function relojFalso() {
        let ahora = 0;
        let n = 0;
        const citas = new Map();
        return {
            poner: (fn, ms) => (citas.set(++n, { fn, cuando: ahora + ms }), n),
            quitar: (id) => citas.delete(id),
            pasar(ms) {
                ahora += ms;
                for (const [id, c] of [...citas]) if (c.cuando <= ahora && citas.delete(id)) c.fn();
            },
            pendientes: () => citas.size,
        };
    }
    const tic = () => new Promise((resolver) => setImmediate(resolver));
    function montaje({ contesta = async () => "ok", parado } = {}) {
        const reloj = relojFalso();
        const m = { texto: "inicio", envios: [], reloj };
        m.g = guardadoRetrasado({
            leer: () => m.texto,
            espera: 800,
            reloj,
            parado,
            enviar: (texto, antes, opciones) => {
                m.envios.push({ texto, antes, alSalir: opciones.alSalir });
                return contesta(texto, antes, opciones);
            },
        });
        m.escribir = (texto) => {
            m.texto = texto;
            m.g.tocar();
        };
        return m;
    }

    // Lo normal: se guarda 0,8 s después de la última letra, una vez, basado en lo que había.
    let m = montaje();
    m.escribir("inicio a");
    m.reloj.pasar(500);
    m.escribir("inicio ab");
    m.reloj.pasar(500);
    assert.equal(m.envios.length, 0, "cada letra vuelve a empezar la cuenta");
    assert.equal(m.g.pendiente(), true);
    m.reloj.pasar(300);
    await tic();
    assert.deepEqual(m.envios, [{ texto: "inicio ab", antes: "inicio", alSalir: false }]);
    assert.equal(m.g.limpio(), true);
    assert.equal(m.g.base(), "inicio ab");

    // La página se cierra en menos de un segundo: lo pendiente sale AL MOMENTO, con «alSalir», y solo una vez.
    m = montaje();
    m.escribir("inicio y la última frase");
    m.reloj.pasar(100);
    m.g.ya({ alSalir: true, forzar: true }); // pagehide
    assert.deepEqual(m.envios, [{ texto: "inicio y la última frase", antes: "inicio", alSalir: true }], "sin esperar a los 0,8 s");
    assert.equal(m.g.pendiente(), false, "y la espera se quita: no se guarda otra vez al cumplirse");
    m.g.ya({ alSalir: true, forzar: false }); // visibilitychange justo después: ya va de camino
    m.reloj.pasar(2000);
    await tic();
    m.g.ya(); // y el «blur» de después tampoco lo repite
    assert.equal(m.envios.length, 1, "sin duplicar guardados");
    assert.equal(m.g.limpio(), true);

    // Sin nada escrito, salir no manda nada.
    m = montaje();
    m.g.ya({ alSalir: true, forzar: true });
    m.reloj.pasar(2000);
    assert.equal(m.envios.length, 0);

    // Con un guardado de camino y más texto escrito: al irse la página sale lo nuevo sin esperar, basado en lo que va
    // de camino (así el servidor no lo toma por un choque).
    let soltar = [];
    m = montaje({ contesta: () => new Promise((resolver) => soltar.push(resolver)) });
    m.escribir("inicio uno");
    m.reloj.pasar(800);
    assert.equal(m.envios.length, 1);
    assert.equal(m.g.enVuelo(), true);
    m.escribir("inicio uno dos");
    m.g.ya(); // salir del campo: no se manda a la vez que el otro
    assert.equal(m.envios.length, 1, "con uno de camino, lo nuevo espera a que vuelva");
    m.g.ya({ alSalir: true, forzar: true }); // …salvo que la página se vaya
    assert.deepEqual(m.envios[1], { texto: "inicio uno dos", antes: "inicio uno", alSalir: true });
    soltar[0]("ok");
    soltar[1]("ok");
    await tic();
    m.reloj.pasar(2000);
    await tic();
    assert.equal(m.envios.length, 2, "y al volver los dos no se manda nada más");
    assert.equal(m.g.base(), "inicio uno dos");
    assert.equal(m.g.limpio(), true);

    // Con un guardado de camino y nada nuevo: al irse la página se repite ese mismo texto (el de camino puede no llegar
    // a salir), basado en lo confirmado; el servidor lo toma como lo que ya hay.
    soltar = [];
    m = montaje({ contesta: () => new Promise((resolver) => soltar.push(resolver)) });
    m.escribir("inicio x");
    m.reloj.pasar(800);
    m.g.ya({ alSalir: true, forzar: false }); // esconderse: no repite
    assert.equal(m.envios.length, 1);
    m.g.ya({ alSalir: true, forzar: true }); // irse: sí
    assert.deepEqual(m.envios[1], { texto: "inicio x", antes: "inicio", alSalir: true });

    // Se sigue escribiendo mientras uno va de camino: al volver, sale lo que falta (después de su espera).
    soltar = [];
    m = montaje({ contesta: () => new Promise((resolver) => soltar.push(resolver)) });
    m.escribir("inicio 1");
    m.reloj.pasar(800);
    m.texto = "inicio 12"; // sin tocar(): como si la espera ya hubiera pasado con el otro de camino
    m.g.ya();
    soltar[0]("ok");
    await tic();
    assert.equal(m.envios.length, 1);
    m.reloj.pasar(800);
    assert.deepEqual(m.envios[1], { texto: "inicio 12", antes: "inicio 1", alSalir: false });
    // …y si la página se había escondido mientras tanto, sin esperar y con «alSalir»
    soltar = [];
    m = montaje({ contesta: () => new Promise((resolver) => soltar.push(resolver)) });
    m.escribir("inicio 1");
    m.reloj.pasar(800);
    m.escribir("inicio 12");
    m.g.ya({ alSalir: true }); // visibilitychange con uno de camino
    assert.equal(m.envios.length, 1);
    soltar[0]("ok");
    await tic();
    assert.deepEqual(m.envios[1], { texto: "inicio 12", antes: "inicio 1", alSalir: true });

    // Un fallo (sin conexión): lo escrito no se da por guardado ni se reintenta solo sin parar; se reintenta cuando
    // llega algo del servidor (reintentar) o al cerrar (ya), y basado en lo último que se confirmó.
    let resultado = "error";
    m = montaje({ contesta: async () => resultado });
    m.escribir("inicio sin red");
    m.reloj.pasar(800);
    await tic();
    assert.equal(m.g.limpio(), false, "lo escrito sigue sin guardar: no se puede cambiar por lo que llegue de fuera");
    assert.equal(m.g.colgado(), true);
    m.reloj.pasar(5000);
    assert.equal(m.envios.length, 1, "no se reintenta solo");
    resultado = "ok";
    m.g.reintentar();
    m.reloj.pasar(800);
    await tic();
    assert.deepEqual(m.envios[1], { texto: "inicio sin red", antes: "inicio", alSalir: false });
    assert.equal(m.g.limpio(), true);
    // …y un envío que revienta cuenta como fallo
    m = montaje({ contesta: async () => { throw new Error("sin red"); } });
    m.escribir("inicio z");
    assert.equal(await m.g.ya(), "error");
    assert.equal(m.g.colgado(), true);

    // Parado (unas notas en conflicto): no se manda nada, tampoco al salir, hasta que se elija.
    let enConflicto = true;
    m = montaje({ parado: () => enConflicto });
    m.escribir("inicio en conflicto");
    m.reloj.pasar(800);
    m.g.ya({ alSalir: true, forzar: true });
    assert.equal(m.envios.length, 0);
    enConflicto = false;
    m.g.poner("lo del servidor"); // «Dejar las mías»: se guarda encima de lo que hay ahora
    m.g.ya();
    assert.deepEqual(m.envios, [{ texto: "inicio en conflicto", antes: "lo del servidor", alSalir: false }]);

    // «base»: lo que tiene el servidor al empezar, cuando no es lo que hay escrito (el título de la ficha lo dice así)
    {
        const envios = [];
        const g = guardadoRetrasado({ leer: () => "lo escrito", base: "lo del servidor", reloj: relojFalso(), enviar: async (texto, antes) => (envios.push([texto, antes]), "ok") });
        assert.equal(g.limpio(), false);
        assert.equal(await g.ya(), "ok");
        assert.deepEqual(envios, [["lo escrito", "lo del servidor"]]);
        assert.equal(g.limpio(), true);
    }

    // guardarAlSalir: al esconderse la página manda lo pendiente; al irse, además, sin esperar a lo de camino.
    const oyentes = { documento: {}, ventana: {} };
    const documento = { visibilityState: "visible", addEventListener: (t, fn) => (oyentes.documento[t] = fn), removeEventListener: (t) => delete oyentes.documento[t] };
    const ventana = { addEventListener: (t, fn) => (oyentes.ventana[t] = fn), removeEventListener: (t) => delete oyentes.ventana[t] };
    const llamadas = [];
    const dejar = guardarAlSalir(() => [{ ya: (o) => llamadas.push(o) }, null], { ventana, documento });
    oyentes.documento.visibilitychange();
    assert.equal(llamadas.length, 0, "al volver a verse no se manda nada");
    documento.visibilityState = "hidden";
    oyentes.documento.visibilitychange();
    assert.deepEqual(llamadas, [{ alSalir: true, forzar: false }]);
    oyentes.ventana.pagehide();
    assert.deepEqual(llamadas[1], { alSalir: true, forzar: true });
    dejar();
    assert.deepEqual([Object.keys(oyentes.documento), Object.keys(oyentes.ventana)], [[], []]);

    // api.js: con «alSalir» el envío es de los que sobreviven a la página («keepalive»), si cabe (hasta 60 KB)
    const opcionesDe = [];
    globalThis.fetch = async (url, opciones) => {
        opcionesDe.push(opciones);
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
        await api.cambiar("t1", { notas: "x" }, { notas: "" }, { alSalir: true });
        await api.cambiar("t1", { notas: "x" }, { notas: "" });
        await api.cambiar("t1", { notas: "ñ".repeat(40000) }, { notas: "" }, { alSalir: true });
        await api.cambiarEnPizarra("reuniones", "n1", { texto: "hola" }, { alSalir: true });
        assert.deepEqual(opcionesDe.map((o) => Boolean(o.keepalive)), [true, false, false, true]);
        assert.deepEqual(JSON.parse(opcionesDe[0].body), { notas: "x", antes: { notas: "" } }, "y lo que se manda es lo mismo");
    } finally {
        globalThis.fetch = fetchReal;
    }

    // Contra el servidor: lo escrito en el último segundo queda guardado al «cerrar», una sola vez, y el guardado
    // repetido del mismo texto (el de camino más el de la salida) no es un choque ni cambia nada.
    r = await diego("POST", "tareas", { titulo: "Notas al cerrar", notas: "Lo que había" });
    const idNotas = r.datos.id;
    let peticiones = 0;
    const notasDe = async () => (await diego("GET", "datos")).datos.tareas.find((t) => t.id === idNotas);
    const pagina = { texto: "Lo que había" };
    const g = guardadoRetrasado({
        leer: () => pagina.texto,
        espera: 800,
        enviar: async (texto, antes) => {
            peticiones += 1;
            const x = await diego("PATCH", `tareas/${idNotas}`, { notas: texto, antes: { notas: antes } });
            return x.estado === 200 ? "ok" : x.estado === 409 ? "conflicto" : "error";
        },
    });
    pagina.texto = "Lo que había\ny la última frase, escrita justo antes de recargar";
    g.tocar();
    assert.equal((await notasDe()).notas, "Lo que había", "todavía no se ha guardado (no han pasado los 0,8 s)");
    assert.equal(await g.ya({ alSalir: true, forzar: true }), "ok"); // pagehide
    assert.equal((await notasDe()).notas, pagina.texto, "al cerrar la página queda guardado");
    const guardadaEl = (await notasDe()).actualizada;
    await new Promise((resolver) => setTimeout(resolver, 1000));
    assert.equal(peticiones, 1, "y pasados los 0,8 s no se guarda otra vez");
    r = await diego("PATCH", `tareas/${idNotas}`, { notas: pagina.texto, antes: { notas: "Lo que había" } });
    assert.equal(r.estado, 200, "el mismo texto otra vez (basado en lo de antes) no es un choque");
    assert.equal((await notasDe()).actualizada, guardadaEl, "ni toca la tarea");

    // Las pantallas lo usan: las notas de la ficha y el texto de las notas de la pizarra
    const fuente = (f) => readFileSync(new URL(f, carpetaApp), "utf8");
    assert.match(fuente("ficha.js"), /guardarAlSalir\(\(\) => \(panel \? \[/, "la ficha guarda lo pendiente al esconderse o irse la página");
    assert.match(fuente("ficha.js"), /const guardado = guardadoRetrasado\(\{/);
    assert.match(fuente("ficha.js"), /const guardadoTitulo = guardadoRetrasado\(\{/, "y el título, igual");
    assert.match(fuente("ficha.js"), /enviar: \(texto, _antes, \{ alSalir \}\) => cambiar\(\{ titulo: texto \}, \{ alSalir \}\)/);
    assert.match(fuente("ficha.js"), /cambiar\(\{ notas: texto \}, \{ antes: \{ notas: antes \}, alSalir \}\)/);
    assert.match(fuente("pizarra.js"), /guardarAlSalir\(\(\) => \[\.\.\.textos\.values\(\)\]/, "la pizarra, el texto de sus notas");
    assert.match(fuente("pizarra.js"), /const guardarTexto = guardadoRetrasado\(\{/);
    assert.match(fuente("principal.js"), /api\.cambiar\(id, c, opciones\.antes, \{ alSalir: opciones\.alSalir \}\)/);
    assert.match(fuente("guardado.js"), /addEventListener\("visibilitychange"/);
    assert.match(fuente("guardado.js"), /addEventListener\("pagehide"/);
}

console.log("Tablón (notas que no se pisan, y ventanas que no dejan salir el foco y se cierran con «atrás»): bien");
