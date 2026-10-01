// Prueba de la música (Spotify) contra un servidor en marcha que habla con el Spotify de mentira:
//
//   node pruebas/spotify-falso.mjs 8614 &
//   TAREAS_DATOS=/tmp/m TAREAS_PUERTO=3995 TAREAS_URL=http://127.0.0.1:3995/tareas/ \
//   SPOTIFY_CLIENT_ID=cliente-spotify SPOTIFY_CLIENT_SECRET=secreto-spotify \
//   SPOTIFY_AUTH_URL=http://127.0.0.1:8614/authorize SPOTIFY_TOKEN_URL=http://127.0.0.1:8614/api/token \
//   SPOTIFY_API_URL=http://127.0.0.1:8614/v1 MUSICA_INTERVALO_MS=300 node servidor/principal.js &
//   TAREAS_DATOS=/tmp/m node pruebas/musica.mjs http://127.0.0.1:3995/tareas <código de alta> http://127.0.0.1:8614 [3996]
//
// Crea tres cuentas (Diego, Víctor y Ana) y comprueba: sin sesión no se ve; conectar Spotify (state atado a la sesión
// y a la cookie, vuelta, tokens guardados y nunca en la API); entrar y salir de la cabina; lo que suena en directo, el
// cambio de canción, la pausa, los saltos, nada sonando (204), anuncios, pódcast y archivos locales; el refresco del
// token con rotación; esperar si Spotify pide calma (429); quién escucha; que no se pregunta a Spotify si nadie
// escucha; permiso retirado en Spotify; desconectar; salir del crew; lo que ha sonado y las páginas.
// Con TAREAS_DATOS mira también el archivo (musica.json, permisos 600). Con el último número arranca en ese puerto
// otro servidor sin Spotify para ver la música «sin configurar».

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const [base, codigoAlta, spotify, puertoSinSpotify] = process.argv.slice(2);
if (!base || !codigoAlta || !spotify) {
    console.error("Uso: node pruebas/musica.mjs <url del tablón> <código de alta> <url del Spotify falso> [puerto libre]");
    process.exit(2);
}
const carpeta = process.env.TAREAS_DATOS || null;
const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));
const VUELTA = `${base}/api/musica/vuelta`;

// ---------- clientes (con sus galletas, como un navegador) ----------

const respuestas = []; // todo lo que contesta la API, para comprobar al final que no lleva ningún token

function cliente(nombre) {
    const galletas = new Map();
    const id = `prueba-${nombre}`;
    const guardarGalletas = (r) => {
        for (const linea of r.headers.getSetCookie()) {
            const [par, ...atributos] = linea.split(";");
            const i = par.indexOf("=");
            const [k, v] = [par.slice(0, i).trim(), par.slice(i + 1).trim()];
            if (atributos.some((a) => /^\s*max-age=0\s*$/i.test(a)) || !v) galletas.delete(k);
            else galletas.set(k, v);
        }
    };
    const galleta = () => [...galletas].map(([k, v]) => `${k}=${v}`).join("; ");
    const llamar = async function (metodo, ruta, cuerpo, { crudo = false, sinCabecera = false } = {}) {
        const cabeceras = sinCabecera ? {} : { "x-tablon": "1", "x-cliente": id };
        if (galletas.size) cabeceras.cookie = galleta();
        let body;
        if (cuerpo !== undefined) {
            body = JSON.stringify(cuerpo);
            cabeceras["content-type"] = "application/json";
        }
        const r = await fetch(`${base}/api/${ruta}`, { method: metodo, headers: cabeceras, body, redirect: "manual" });
        guardarGalletas(r);
        if (crudo) return r;
        const texto = await r.text();
        respuestas.push(texto);
        let datos = null;
        try {
            datos = JSON.parse(texto);
        } catch {
            /* sin cuerpo */
        }
        return { estado: r.status, datos };
    };
    // Abrir una dirección cualquiera como el navegador (sin seguir redirecciones, con las galletas de esta persona).
    llamar.ir = async (direccion, { conGalletas = true } = {}) => {
        const r = await fetch(direccion, { headers: conGalletas && galletas.size ? { cookie: galleta() } : {}, redirect: "manual" });
        if (direccion.startsWith(base)) guardarGalletas(r);
        return r;
    };
    llamar.galletas = galletas;
    llamar.id = id;
    // El canal en directo de la música, como lo abre la página (EventSource).
    llamar.escuchar = async () => {
        const control = new AbortController();
        const r = await fetch(`${base}/api/eventos?musica=1&cliente=${id}`, { headers: { cookie: galleta() }, signal: control.signal });
        assert.equal(r.status, 200);
        const eventos = [];
        let crudo = "";
        (async () => {
            const lector = r.body.getReader();
            const texto = new TextDecoder();
            let resto = "";
            try {
                for (;;) {
                    const { value, done } = await lector.read();
                    if (done) break;
                    const trozo = texto.decode(value, { stream: true });
                    crudo += trozo;
                    resto += trozo;
                    let fin;
                    while ((fin = resto.indexOf("\n\n")) >= 0) {
                        const bloque = resto.slice(0, fin);
                        resto = resto.slice(fin + 2);
                        for (const linea of bloque.split("\n")) if (linea.startsWith("data: ")) eventos.push({ ...JSON.parse(linea.slice(6)), llegada: Date.now() });
                    }
                }
            } catch {
                /* cerrado */
            }
        })();
        return {
            eventos,
            crudo: () => crudo,
            marca: () => eventos.length,
            cerrar: () => control.abort(),
            async esperar(condicion, que, desde = 0, ms = 6000) {
                const hasta = Date.now() + ms;
                while (Date.now() < hasta) {
                    const e = eventos.slice(desde).find(condicion);
                    if (e) return e;
                    await esperar(40);
                }
                throw new Error(`No ha llegado: ${que}`);
            },
        };
    };
    return llamar;
}

async function control(metodo, ruta, cuerpo) {
    const r = await fetch(`${spotify}/control/${ruta}`, { method: metodo, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    return r.json();
}
const sonar = (cuenta, estado) => control("POST", `sonando?cuenta=${cuenta}`, estado);
const pista = (id, extra = {}) => ({ id, nombre: `Canción ${id}`, artistas: ["Los de Prueba", "Invitada"], album: `Disco ${id}`, duracion: 200000, posicion: 30000, ...extra });

// Conectar el Spotify de alguien de principio a fin: cabina → Spotify (falso) → vuelta.
async function conectarSpotify(quien, cuenta) {
    await control("GET", `usar?cuenta=${cuenta}`);
    const ida = await quien("GET", "musica/conectar", undefined, { crudo: true });
    assert.equal(ida.status, 302, "conectar lleva a Spotify");
    const aSpotify = await quien.ir(ida.headers.get("location"));
    assert.equal(aSpotify.status, 302, "Spotify (falso) vuelve al momento");
    const vuelta = aSpotify.headers.get("location");
    return { ida, vuelta, abrirVuelta: () => quien.ir(vuelta) };
}

await control("POST", "reiniciar");
const diego = cliente("diego");
const victor = cliente("victor");
const ana = cliente("ana");

// ---------- sin sesión ----------

assert.equal((await fetch(`${base}/api/musica`)).status, 401, "sin sesión no se ve la música");
let pagina = await fetch(`${base}/api/musica/conectar`, { redirect: "manual" });
assert.equal(pagina.status, 401);
assert.match(pagina.headers.get("content-type"), /text\/html/, "conectar contesta con una página (se abre en una pestaña)");
assert.match(await pagina.text(), /Entra primero/);
assert.equal((await fetch(`${base}/api/musica/vuelta?code=x&state=y`, { redirect: "manual" })).status, 400, "una vuelta sin sesión no vale");

// ---------- cuentas: Diego (administra), Víctor y Ana (no) ----------

let r = await diego("POST", "alta", { codigo: codigoAlta, nombre: "Diego", clave: "una clave muy larga", color: "#e0562a" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
const idDiego = r.datos.yo.id;
r = await diego("POST", "invitar", { tipo: "alta" });
r = await victor("POST", "alta", { codigo: r.datos.codigo, nombre: "Víctor", clave: "otra clave muy larga", color: "#3b82c4" });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
const idVictor = r.datos.yo.id;
r = await diego("POST", "invitar", { tipo: "alta" });
r = await ana("POST", "alta", { codigo: r.datos.codigo, nombre: "Ana", clave: "la clave de ana larga", color: "#3a9d5d" });
const idAna = r.datos.yo.id;
assert.equal((await diego("PATCH", `crew/${idVictor}`, { admin: false })).estado, 200);
assert.equal((await diego("PATCH", `crew/${idAna}`, { admin: false })).estado, 200);

// Sin la cabecera propia no se cambia nada
assert.equal((await victor("POST", "musica/cabina", undefined, { sinCabecera: true })).estado, 403);

// ---------- cómo está al principio ----------

r = await diego("GET", "musica");
assert.equal(r.estado, 200);
assert.equal(r.datos.configurado, true);
assert.equal(r.datos.cabina, null);
assert.equal(r.datos.sonando, null);
assert.deepEqual(r.datos.historial, []);
assert.deepEqual(r.datos.spotify, { conectado: false, nombre: null, desde: null });
assert.equal(r.datos.yo.id, idDiego);
assert.equal(r.datos.ajustes.vuelta, VUELTA, "quien administra ve la dirección de vuelta para Spotify");
assert.equal(r.datos.usuarios.length, 3);
r = await victor("GET", "musica");
assert.equal(r.datos.ajustes, undefined, "los demás no ven los ajustes");
r = await victor("POST", "musica/cabina");
assert.equal(r.estado, 400, "sin Spotify conectado no se puede pinchar");
assert.match(r.datos.error, /conecta/i);

const ojosDiego = await diego.escuchar();
const ojosVictor = await victor.escuchar();

// ---------- conectar Spotify: ida, state y vuelta ----------

let flujo = await conectarSpotify(victor, "victor");
const ida = new URL(flujo.ida.headers.get("location"));
assert.equal(ida.origin + ida.pathname, `${spotify}/authorize`);
assert.equal(ida.searchParams.get("client_id"), "cliente-spotify");
assert.equal(ida.searchParams.get("response_type"), "code");
assert.equal(ida.searchParams.get("redirect_uri"), VUELTA);
assert.deepEqual(ida.searchParams.get("scope").split(" ").sort(), ["user-read-currently-playing", "user-read-playback-state"]);
assert.equal(ida.searchParams.get("show_dialog"), "true");
assert.ok(ida.searchParams.get("state").length >= 24);
const galletaEstado = flujo.ida.headers.getSetCookie().find((g) => g.startsWith("hs_spotify="));
assert.ok(galletaEstado, "el state también va en una cookie de este navegador");
assert.match(galletaEstado, /HttpOnly/);
assert.match(galletaEstado, /SameSite=Lax/);
assert.match(galletaEstado, /Path=\/tareas\/api\/musica\/vuelta/);

// Otra sesión (Diego) no puede usar la vuelta de Víctor, ni con su cookie: el state es de un solo uso y de esa sesión.
let vuelta = await fetch(flujo.vuelta, { headers: { cookie: `${[...diego.galletas].map(([k, v]) => `${k}=${v}`).join("; ")}; hs_spotify=${victor.galletas.get("hs_spotify")}` }, redirect: "manual" });
assert.equal(vuelta.status, 400, "la vuelta de otra sesión no vale");
assert.match(await vuelta.text(), /no vale/);
vuelta = await flujo.abrirVuelta();
assert.equal(vuelta.status, 400, "el state ya se ha gastado");
// Un state inventado tampoco
flujo = await conectarSpotify(victor, "victor");
const cambiada = new URL(flujo.vuelta);
cambiada.searchParams.set("state", "inventado-inventado-inventado");
assert.equal((await victor.ir(cambiada.href)).status, 400, "state inventado");
// Ni sin la cookie del navegador que empezó
flujo = await conectarSpotify(victor, "victor");
vuelta = await fetch(flujo.vuelta, { headers: { cookie: `hs_sesion=${victor.galletas.get("hs_sesion")}` }, redirect: "manual" });
assert.equal(vuelta.status, 400, "sin la cookie del state no vale");
r = await victor("GET", "musica");
assert.equal(r.datos.spotify.conectado, false, "nada de lo anterior conecta nada");
// Si dice que no en Spotify, no pasa nada
await control("POST", "denegar?si=1");
flujo = await conectarSpotify(victor, "victor");
assert.match(flujo.vuelta, /error=access_denied/);
vuelta = await flujo.abrirVuelta();
assert.equal(vuelta.status, 200);
assert.match(await vuelta.text(), /No se ha conectado/);

// Ahora sí
let marcaVictor = ojosVictor.marca();
let marcaDiego = ojosDiego.marca();
flujo = await conectarSpotify(victor, "victor");
vuelta = await flujo.abrirVuelta();
assert.equal(vuelta.status, 200);
let html = await vuelta.text();
assert.match(html, /¡Listo!/);
assert.match(html, /Victor en Spotify/);
assert.match(html, /cerrar esta pestaña/);
assert.ok(!victor.galletas.has("hs_spotify"), "la cookie del state se borra a la vuelta");
let ev = await ojosVictor.esperar((e) => e.tipo === "musica-yo", "aviso a la cabina de Víctor de que ya está conectado", marcaVictor);
assert.deepEqual([ev.spotify.conectado, ev.spotify.nombre], [true, "Victor en Spotify"]);
await esperar(200);
assert.ok(!ojosDiego.eventos.slice(marcaDiego).some((e) => e.tipo === "musica-yo"), "el aviso de la cuenta solo le llega a su dueño");
r = await victor("GET", "musica");
assert.equal(r.datos.spotify.conectado, true);
assert.equal(r.datos.spotify.nombre, "Victor en Spotify");
assert.ok(r.datos.spotify.desde);
let estadoFalso = await control("GET", "estado");
assert.equal(estadoFalso.llamadas.token.at(-1).redirect_uri, VUELTA, "el código se cambia con la misma vuelta");
const refrescoVictor1 = estadoFalso.dados.refrescos.at(-1);
if (carpeta) {
    const archivo = path.join(carpeta, "musica.json");
    assert.equal(fs.statSync(archivo).mode & 0o777, 0o600, "musica.json solo lo lee el servidor");
    assert.ok(fs.readFileSync(archivo, "utf8").includes(refrescoVictor1), "el token de refresco se guarda");
    assert.ok(!fs.readFileSync(path.join(carpeta, "tablon.json"), "utf8").includes(refrescoVictor1), "y no en tablon.json");
}

// Una cuenta de Spotify que no está dada de alta en la aplicación (modo de desarrollo): se explica y no se guarda
await control("POST", "no-registrada?cuenta=ana&si=1");
flujo = await conectarSpotify(ana, "ana");
vuelta = await flujo.abrirVuelta();
assert.equal(vuelta.status, 403);
assert.match(await vuelta.text(), /User Management/);
assert.equal((await ana("GET", "musica")).datos.spotify.conectado, false);
await control("POST", "no-registrada?cuenta=ana&si=0");

// ---------- la cabina ----------

marcaDiego = ojosDiego.marca();
r = await victor("POST", "musica/cabina");
assert.equal(r.estado, 200, JSON.stringify(r.datos));
assert.equal(r.datos.cabina.dj.id, idVictor);
assert.equal(r.datos.cabina.dj.nombre, "Víctor");
ev = await ojosDiego.esperar((e) => e.tipo === "musica" && e.cabina?.dj.id === idVictor, "Víctor entra en la cabina", marcaDiego);
assert.equal(ev.cambio, "cabina");
assert.equal((await victor("POST", "musica/cabina")).estado, 200, "volver a entrar no cambia nada");
assert.equal((await diego("POST", "musica/cabina")).estado, 400, "Diego aún no ha conectado su Spotify");
flujo = await conectarSpotify(diego, "diego");
assert.equal((await flujo.abrirVuelta()).status, 200);
r = await diego("POST", "musica/cabina");
assert.equal(r.estado, 409, "la cabina está ocupada");
assert.match(r.datos.error, /Víctor/);

// ---------- lo que suena, en directo ----------

marcaDiego = ojosDiego.marca();
await sonar("victor", pista("pista-a"));
ev = await ojosDiego.esperar((e) => e.tipo === "musica" && e.sonando?.id === "pista-a", "la canción A", marcaDiego);
assert.equal(ev.sonando.uri, "spotify:track:pista-a");
assert.equal(ev.sonando.titulo, "Canción pista-a");
assert.deepEqual(
    ev.sonando.artistas.map((a) => a.nombre),
    ["Los de Prueba", "Invitada"],
);
assert.equal(ev.sonando.album, "Disco pista-a");
assert.equal(ev.sonando.enlace, "https://open.spotify.com/track/pista-a", "cada canción se puede abrir en Spotify");
assert.equal(ev.sonando.portada, "https://i.scdn.co/image/pista-a-640");
assert.equal(ev.sonando.portadaPequena, "https://i.scdn.co/image/pista-a-64");
assert.equal(ev.sonando.duracion, 200000);
assert.equal(ev.sonando.reproduciendo, true);
assert.ok(ev.sonando.posicion >= 30000 && ev.sonando.posicion < 34000, `posición ${ev.sonando.posicion}`);
assert.ok(Math.abs(ev.sonando.cuando - Date.now()) < 5000, "con la hora del servidor");
assert.equal(ev.cabina.dj.id, idVictor);
assert.equal(ev.historial[0].uri, "spotify:track:pista-a");
estadoFalso = await control("GET", "estado");
assert.equal(estadoFalso.llamadas.sonando.at(-1).tipos, "track,episode", "también pódcast");

// Mientras no cambia nada, no se repite (aunque se siga mirando)
const llamadasAntes = (await control("GET", "estado")).llamadas.sonando.length;
marcaDiego = ojosDiego.marca();
await esperar(1200);
assert.ok((await control("GET", "estado")).llamadas.sonando.length >= llamadasAntes + 2, "se sigue mirando");
assert.ok(!ojosDiego.eventos.slice(marcaDiego).some((e) => e.tipo === "musica"), "sin cambios no se manda nada");

// Cambio de canción
marcaDiego = ojosDiego.marca();
await sonar("victor", pista("pista-b", { posicion: 0 }));
ev = await ojosDiego.esperar((e) => e.tipo === "musica" && e.sonando?.id === "pista-b", "la canción B", marcaDiego);
assert.ok(ev.sonando.posicion < 3000);
assert.deepEqual(
    ev.historial.slice(0, 2).map((h) => h.uri),
    ["spotify:track:pista-b", "spotify:track:pista-a"],
);
// Pausa
marcaDiego = ojosDiego.marca();
await sonar("victor", pista("pista-b", { posicion: 61000, sonando: false }));
ev = await ojosDiego.esperar((e) => e.tipo === "musica" && e.sonando?.reproduciendo === false, "la pausa", marcaDiego);
assert.equal(ev.sonando.posicion, 61000);
// Sigue, y salta a otro punto
marcaDiego = ojosDiego.marca();
await sonar("victor", pista("pista-b", { posicion: 120000 }));
ev = await ojosDiego.esperar((e) => e.tipo === "musica" && e.sonando?.reproduciendo && e.sonando.posicion >= 120000, "el salto", marcaDiego);
assert.ok(ev.sonando.posicion < 124000);
assert.equal(ev.historial[0].uri, "spotify:track:pista-b", "pausar o saltar no apunta otra vez la canción");
assert.equal(ev.historial[1].uri, "spotify:track:pista-a");

// Nada sonando (204)
marcaDiego = ojosDiego.marca();
await sonar("victor", null);
ev = await ojosDiego.esperar((e) => e.tipo === "musica" && e.sonando === null, "nada sonando", marcaDiego);
assert.equal(ev.cabina.dj.id, idVictor, "sigue en la cabina");
assert.equal(ev.anuncio, false);
// Un anuncio en su Spotify
marcaDiego = ojosDiego.marca();
await sonar("victor", { currently_playing_type: "ad", item: null, is_playing: true, progress_ms: 1000, timestamp: Date.now() });
ev = await ojosDiego.esperar((e) => e.tipo === "musica" && e.anuncio === true, "el anuncio", marcaDiego);
assert.equal(ev.sonando, null);
// Un pódcast
marcaDiego = ojosDiego.marca();
await sonar("victor", pista("capitulo1", { tipo: "episode", nombre: "Capítulo uno", album: "El pódcast" }));
ev = await ojosDiego.esperar((e) => e.tipo === "musica" && e.sonando?.id === "capitulo1", "el pódcast", marcaDiego);
assert.equal(ev.anuncio, false);
assert.equal(ev.sonando.tipo, "episodio");
assert.equal(ev.sonando.uri, "spotify:episode:capitulo1");
assert.deepEqual(
    ev.sonando.artistas.map((a) => a.nombre),
    ["El pódcast"],
);
assert.equal(ev.sonando.enlace, "https://open.spotify.com/episode/capitulo1");
// Un archivo local del DJ (no está en Spotify: no se puede poner en el reproductor)
marcaDiego = ojosDiego.marca();
await sonar("victor", pista("local1", { local: true, nombre: "Maqueta" }));
ev = await ojosDiego.esperar((e) => e.tipo === "musica" && e.sonando?.local === true, "el archivo local", marcaDiego);
assert.equal(ev.sonando.enlace, null);
assert.equal(ev.sonando.portada, null);
assert.match(ev.sonando.uri, /^spotify:local:/);

// ---------- el token caduca: se refresca (y Spotify cambia el de refresco) ----------

let antes = await control("GET", "estado");
await control("POST", "caducar?cuenta=victor");
marcaDiego = ojosDiego.marca();
await sonar("victor", pista("pista-c"));
await ojosDiego.esperar((e) => e.tipo === "musica" && e.sonando?.id === "pista-c", "la canción C tras refrescar el token", marcaDiego);
let despues = await control("GET", "estado");
assert.equal(despues.llamadas.refresco.length, antes.llamadas.refresco.length + 1, "se ha refrescado una vez");
assert.equal(despues.llamadas.refrescosRechazados, 0);
const refrescoVictor2 = despues.dados.refrescos.at(-1);
assert.notEqual(refrescoVictor2, refrescoVictor1);
assert.ok(!despues.refrescosVivos.includes(refrescoVictor1), "con la rotación, el de refresco viejo ya no vale");
if (carpeta) {
    const guardado = fs.readFileSync(path.join(carpeta, "musica.json"), "utf8");
    assert.ok(guardado.includes(refrescoVictor2) && !guardado.includes(refrescoVictor1), "se guarda el de refresco nuevo");
}
// Otra vez: si no hubiera guardado el nuevo, Spotify diría invalid_grant
await control("POST", "caducar?cuenta=victor");
marcaDiego = ojosDiego.marca();
await sonar("victor", pista("pista-d"));
await ojosDiego.esperar((e) => e.tipo === "musica" && e.sonando?.id === "pista-d", "la canción D tras otro refresco", marcaDiego);
despues = await control("GET", "estado");
assert.equal(despues.llamadas.refresco.length, antes.llamadas.refresco.length + 2);
assert.equal(despues.llamadas.refrescosRechazados, 0, "usa el token de refresco nuevo");

// ---------- Spotify pide calma (429): se espera lo que dice Retry-After ----------

await control("POST", "limite?veces=1&espera=2");
marcaDiego = ojosDiego.marca();
await sonar("victor", pista("pista-e"));
await ojosDiego.esperar((e) => e.tipo === "musica" && e.sonando?.id === "pista-e", "la canción E tras esperar", marcaDiego, 9000);
despues = await control("GET", "estado");
const llamadas = despues.llamadas.sonando;
const i429 = llamadas.findLastIndex((l) => l.respuesta === 429);
assert.ok(i429 >= 0 && llamadas[i429 + 1], "ha habido un 429 y luego otra consulta");
const hueco = llamadas[i429 + 1].cuando - llamadas[i429].cuando;
assert.ok(hueco >= 1900, `tras el 429 se esperan los 2 s que pide Spotify (ha esperado ${hueco} ms)`);
assert.ok(llamadas[i429].cuando - llamadas[i429 - 1].cuando < 1500, "antes del 429 se miraba a menudo");

// ---------- quién escucha ----------

marcaVictor = ojosVictor.marca();
r = await diego("POST", "musica/escucho", { si: true });
assert.equal(r.datos.ok, true);
ev = await ojosVictor.esperar((e) => e.tipo === "musica-oyentes" && e.escuchando.includes(idDiego), "Diego escucha", marcaVictor);
assert.deepEqual((await victor("GET", "musica")).datos.escuchando, [idDiego]);
marcaVictor = ojosVictor.marca();
ojosDiego.cerrar(); // cierra la pestaña: deja de escuchar
await ojosVictor.esperar((e) => e.tipo === "musica-oyentes" && e.escuchando.length === 0, "Diego ya no escucha", marcaVictor);

// ---------- si nadie tiene la música abierta, no se pregunta a Spotify ----------

ojosVictor.cerrar();
await esperar(700);
antes = (await control("GET", "estado")).llamadas.sonando.length;
await esperar(1200);
despues = (await control("GET", "estado")).llamadas.sonando.length;
assert.equal(despues, antes, "sin nadie escuchando no se llama a Spotify");
await sonar("victor", pista("pista-f", { posicion: 90000 }));
const ojosDiego2 = await diego.escuchar();
ev = await ojosDiego2.esperar((e) => e.tipo === "musica" && e.sonando?.id === "pista-f", "al volver alguien, se mira al momento");
assert.ok(ev.sonando.posicion >= 90000);

// ---------- dejar la cabina, sacar de la cabina (administración) ----------

let marca2 = ojosDiego2.marca();
r = await diego("DELETE", "musica/cabina");
assert.equal(r.estado, 200, "quien administra puede dejar libre la cabina");
assert.equal(r.datos.cabina, null);
assert.equal(r.datos.sonando, null);
ev = await ojosDiego2.esperar((e) => e.tipo === "musica" && e.cabina === null, "cabina libre", marca2);
assert.equal(ev.autor, idDiego);
await sonar("victor", null); // para que al volver a la cabina no siga sonando lo de antes
assert.equal((await diego("DELETE", "musica/cabina")).estado, 200, "dejar una cabina vacía no pasa nada");
r = await diego("POST", "musica/cabina");
assert.equal(r.estado, 200);
assert.equal(r.datos.cabina.dj.id, idDiego);
r = await victor("DELETE", "musica/cabina");
assert.equal(r.estado, 403, "quien no administra no puede sacar a otro de la cabina");
assert.equal((await victor("POST", "musica/cabina")).estado, 409);
marca2 = ojosDiego2.marca();
await sonar("diego", pista("pista-diego"));
ev = await ojosDiego2.esperar((e) => e.tipo === "musica" && e.sonando?.id === "pista-diego", "lo que pone Diego", marca2);
assert.equal(ev.historial[0].dj.id, idDiego);
r = await diego("DELETE", "musica/cabina");
assert.equal(r.datos.cabina, null, "el DJ deja la cabina");
await sonar("diego", null);
r = await victor("POST", "musica/cabina");
assert.equal(r.datos.cabina.dj.id, idVictor, "libre otra vez: Víctor entra");

// ---------- Víctor quita el permiso en Spotify: se olvida su cuenta y la cabina queda libre ----------

marca2 = ojosDiego2.marca();
await control("POST", "revocar?cuenta=victor");
ev = await ojosDiego2.esperar((e) => e.tipo === "musica" && e.cabina === null && /Víctor/.test(e.aviso || ""), "permiso retirado", marca2);
r = await victor("GET", "musica");
assert.equal(r.datos.spotify.conectado, false);
if (carpeta) assert.ok(!fs.readFileSync(path.join(carpeta, "musica.json"), "utf8").includes(refrescoVictor2), "se olvida su token");

// ---------- desconectar borra los tokens ----------

flujo = await conectarSpotify(victor, "victor");
assert.equal((await flujo.abrirVuelta()).status, 200);
const refrescoVictor3 = (await control("GET", "estado")).dados.refrescos.at(-1);
r = await victor("POST", "musica/cabina");
assert.equal(r.datos.aviso, null, "al entrar alguien en la cabina se quita el aviso");
marca2 = ojosDiego2.marca();
await sonar("victor", pista("pista-g"));
await ojosDiego2.esperar((e) => e.tipo === "musica" && e.sonando?.id === "pista-g", "la canción G", marca2);
marca2 = ojosDiego2.marca();
r = await victor("POST", "musica/desconectar");
assert.equal(r.estado, 200);
assert.equal(r.datos.spotify.conectado, false);
assert.equal(r.datos.cabina, null, "quien desconecta deja la cabina");
await ojosDiego2.esperar((e) => e.tipo === "musica" && e.cabina === null, "cabina libre al desconectar", marca2);
if (carpeta) assert.ok(!fs.readFileSync(path.join(carpeta, "musica.json"), "utf8").includes(refrescoVictor3), "desconectar borra el token");
await esperar(400);
antes = (await control("GET", "estado")).llamadas.sonando.filter((l) => l.cuenta === "victor").length;
await esperar(800);
despues = (await control("GET", "estado")).llamadas.sonando.filter((l) => l.cuenta === "victor").length;
assert.equal(despues, antes, "ya no se pregunta por su Spotify");

// ---------- quien sale del crew: se olvida su Spotify y deja la cabina ----------

flujo = await conectarSpotify(ana, "ana");
assert.equal((await flujo.abrirVuelta()).status, 200);
const refrescoAna = (await control("GET", "estado")).dados.refrescos.at(-1);
assert.equal((await ana("POST", "musica/cabina")).datos.cabina.dj.id, idAna);
marca2 = ojosDiego2.marca();
assert.equal((await diego("PATCH", `crew/${idAna}`, { baja: true })).estado, 200);
await ojosDiego2.esperar((e) => e.tipo === "musica" && e.cabina === null, "Ana sale del crew y deja la cabina", marca2);
if (carpeta) assert.ok(!fs.readFileSync(path.join(carpeta, "musica.json"), "utf8").includes(refrescoAna), "se olvida el Spotify de Ana");

// ---------- lo que ha sonado: lo último primero, con quién lo puso, como mucho 20 ----------

r = await diego("GET", "musica");
assert.deepEqual(
    r.datos.historial.slice(0, 9).map((h) => h.id),
    ["pista-g", "pista-diego", "pista-f", "pista-e", "pista-d", "pista-c", null, "capitulo1", "pista-b"],
);
assert.equal(r.datos.historial[0].dj.nombre, "Víctor");
assert.equal(r.datos.historial[1].dj.nombre, "Diego");
assert.deepEqual(r.datos.historial[0].artistas, ["Los de Prueba", "Invitada"]);
assert.equal(r.datos.historial[0].portada, "https://i.scdn.co/image/pista-g-64");
assert.equal(r.datos.historial[0].enlace, "https://open.spotify.com/track/pista-g");
assert.ok(Date.parse(r.datos.historial[0].cuando) > Date.now() - 60000);
assert.equal(r.datos.historial.at(-1).id, "pista-a");
assert.equal((await diego("POST", "musica/cabina")).datos.cabina.dj.id, idDiego);
for (let i = 1; i <= 14; i++) {
    marca2 = ojosDiego2.marca();
    await sonar("diego", pista(`relleno${i}`));
    await ojosDiego2.esperar((e) => e.tipo === "musica" && e.sonando?.id === `relleno${i}`, `relleno ${i}`, marca2);
}
r = await diego("GET", "musica");
assert.equal(r.datos.historial.length, 20, "se guardan las últimas 20");
assert.equal(r.datos.historial[0].id, "relleno14");
assert.ok(!r.datos.historial.some((h) => h.id === "pista-a"), "las más viejas se van");
await diego("DELETE", "musica/cabina");
ojosDiego2.cerrar();

// ---------- ningún token sale por la API (ni a su dueño) ----------

estadoFalso = await control("GET", "estado");
const tokens = [...estadoFalso.dados.accesos, ...estadoFalso.dados.refrescos];
assert.ok(tokens.length >= 8);
for (const quien of [diego, victor]) {
    respuestas.push(JSON.stringify((await quien("GET", "musica")).datos), JSON.stringify((await quien("GET", "datos")).datos));
}
respuestas.push(JSON.stringify((await diego("GET", "crew")).datos));
const excel = await diego("GET", "excel", undefined, { crudo: true });
respuestas.push(Buffer.from(await excel.arrayBuffer()).toString("latin1"));
respuestas.push(ojosDiego.crudo(), ojosVictor.crudo(), ojosDiego2.crudo());
for (const t of tokens) {
    for (const texto of respuestas) assert.ok(!texto.includes(t), "un token de Spotify ha salido por la API");
}
for (const texto of respuestas) assert.ok(!/"refresh|access_token|refresh_token/.test(texto), "ningún campo de tokens en la API");

// ---------- las páginas ----------

pagina = await fetch(`${base}/musica/`);
assert.equal(pagina.status, 200);
assert.match(await pagina.text(), /Música · HOT SPOT S\.L\./);
const csp = pagina.headers.get("content-security-policy") || "";
assert.match(csp, /script-src 'self' https:\/\/open\.spotify\.com/, "el script del reproductor de Spotify");
assert.match(csp, /frame-src https:\/\/open\.spotify\.com/, "el marco del reproductor de Spotify");
assert.match(csp, /img-src [^;]*https:\/\/i\.scdn\.co/, "las portadas");
assert.match(csp, /frame-ancestors 'self'/);
pagina = await fetch(`${base}/musica/mini/`);
assert.equal(pagina.status, 200);
assert.match(await pagina.text(), /Música · HOT SPOT S\.L\./);
assert.match(pagina.headers.get("content-security-policy") || "", /frame-src https:\/\/open\.spotify\.com/);
assert.doesNotMatch((await fetch(`${base}/`)).headers.get("content-security-policy") || "", /spotify/, "el tablón sigue sin Spotify");
const sinBarra = await fetch(`${base}/musica`, { redirect: "manual" });
assert.equal(sinBarra.status, 301);
assert.equal(new URL(sinBarra.headers.get("location"), base).pathname, new URL(`${base}/musica/`).pathname);
for (const archivo of ["app/musica.js", "app/musica-mini.js", "app/musica-comun.js", "musica/musica.css", "musica/mini/mini.css"]) {
    assert.equal((await fetch(`${base}/${archivo}`)).status, 200, archivo);
}

// ---------- un servidor sin Spotify: «sin configurar» ----------

if (puertoSinSpotify) {
    const datosSin = fs.mkdtempSync(path.join(os.tmpdir(), "musica-sin-"));
    const entorno = { ...process.env, TAREAS_DATOS: datosSin, TAREAS_PUERTO: puertoSinSpotify, TAREAS_URL: `http://127.0.0.1:${puertoSinSpotify}/tareas/` };
    for (const k of Object.keys(entorno)) if (k.startsWith("SPOTIFY_") || k.startsWith("GOOGLE_") || k === "CREW_ADMIN") delete entorno[k];
    const hijo = spawn(process.execPath, [fileURLToPath(new URL("../servidor/principal.js", import.meta.url))], { env: entorno, stdio: ["ignore", "pipe", "pipe"] });
    let salida = "";
    hijo.stdout.on("data", (t) => (salida += t));
    hijo.stderr.on("data", (t) => (salida += t));
    try {
        const baseSin = `http://127.0.0.1:${puertoSinSpotify}/tareas`;
        for (let i = 0; i < 40 && !/#alta=/.test(salida); i++) await esperar(150);
        const codigo = /#alta=([\w-]+)/.exec(salida)?.[1];
        assert.ok(codigo, `el servidor sin Spotify no ha arrancado:\n${salida}`);
        const admin = async (metodo, ruta, cuerpo, galleta) =>
            fetch(`${baseSin}/api/${ruta}`, { method: metodo, headers: { "x-tablon": "1", "content-type": "application/json", ...(galleta ? { cookie: galleta } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined, redirect: "manual" });
        const alta = await admin("POST", "alta", { codigo, nombre: "Diego", clave: "una clave muy larga" });
        const galleta = alta.headers.getSetCookie()[0].split(";")[0];
        const m = await (await admin("GET", "musica", undefined, galleta)).json();
        assert.equal(m.configurado, false);
        assert.equal(m.ajustes.vuelta, `${baseSin}/api/musica/vuelta`, "los pasos llevan la dirección de vuelta exacta");
        assert.equal(m.cabina, null);
        const sin = await admin("GET", "musica/conectar", undefined, galleta);
        assert.equal(sin.status, 503);
        assert.match(await sin.text(), /Falta conectar Spotify/);
        const tomar = await admin("POST", "musica/cabina", undefined, galleta);
        assert.equal(tomar.status, 503);
        assert.match((await tomar.json()).error, /todavía no está conectada/);
        assert.equal((await fetch(`${baseSin}/musica/`)).status, 200);
    } finally {
        hijo.kill();
        fs.rmSync(datosSin, { recursive: true, force: true });
    }
} else {
    console.log("(sin puerto libre: no se prueba la música sin configurar)");
}

console.log("Música: bien");
