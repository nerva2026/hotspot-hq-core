// Música de la oficina con Spotify: la cabina del estudio y «escuchar a la vez».
//
// Spotify no deja captar el audio de una cuenta y retransmitirlo, así que por aquí no pasa nada de audio:
//   1. Una persona del crew entra en la cabina (quien pincha, el DJ). Conecta su cuenta de Spotify (OAuth con
//      código, desde el servidor y con el secreto de la aplicación) y pone música en su Spotify de siempre.
//   2. Mientras alguien tenga la música abierta, el servidor mira cada pocos segundos qué le suena al DJ
//      (/v1/me/player/currently-playing) y se lo cuenta a todos por el canal en directo: canción, artistas,
//      portada, duración, por dónde va y si está en pausa.
//   3. Cada navegador pone esa misma canción con el reproductor oficial de Spotify (Embed) y salta al mismo punto:
//      entera si esa persona ha entrado en Spotify en su navegador; si no, 30 segundos de muestra.
//
// Se guarda en musica.json, en la carpeta de datos (permisos 600): quién está en la cabina, lo que ha sonado (las
// últimas 20) y, de cada persona que ha conectado Spotify, su token de refresco. Los tokens no salen de aquí: ni en
// la API (tampoco a su dueño), ni en el registro, ni en las descargas del tablón. El de acceso (dura una hora) solo
// vive en memoria.
//
// Variables de entorno:
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET   la aplicación creada en developer.spotify.com
//   SPOTIFY_REDIRECT_URI     dirección de vuelta (por defecto <TAREAS_URL>api/musica/vuelta)
//   SPOTIFY_AUTH_URL, SPOTIFY_TOKEN_URL, SPOTIFY_API_URL   otro Spotify (el de mentira de las pruebas)
//   MUSICA_INTERVALO_MS      cada cuánto se mira qué suena (5000)

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ErrorDeDatos } from "./tareas.js";

export const ALCANCE = "user-read-currently-playing user-read-playback-state";
const MAXIMO_HISTORIAL = 20;
const COOKIE_ESTADO = "hs_spotify";
const DURACION_ESTADO = 15 * 60 * 1000; // lo que se tiene para volver de Spotify
const MARGEN_SALTO = 2500; // ms: si la posición se aleja más que esto de la esperada, el DJ ha saltado
const ESPERA_MAXIMA = 60 * 60 * 1000; // aunque Spotify pida esperar más (429), como mucho una hora
const ESPERA_ERRORES = 60 * 1000;

const escapar = (s) =>
    String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

function iguales(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function leerCookies(req) {
    const salida = {};
    for (const trozo of (req.headers.cookie || "").split(";")) {
        const i = trozo.indexOf("=");
        if (i > 0) salida[trozo.slice(0, i).trim()] = decodeURIComponent(trozo.slice(i + 1).trim());
    }
    return salida;
}

const error = (estado, mensaje) => Object.assign(new ErrorDeDatos(mensaje), { estado });

// ---------- lo que cuenta Spotify, en limpio ----------

const texto = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const urlImagen = (u) => (typeof u === "string" && u.length < 500 && /^https:\/\/[^\s"'<>\\]+$/.test(u) ? u : null);
const enlaceSpotify = (u) => (typeof u === "string" && u.length < 300 && /^https:\/\/open\.spotify\.com\/[\w/-]+$/.test(u) ? u : null);

// Lo que suena, a partir de la respuesta de /me/player/currently-playing (null si no hay nada que mostrar).
export function leerSonando(j) {
    const item = j && typeof j === "object" ? j.item : null;
    if (!item || typeof item !== "object" || typeof item.uri !== "string" || !/^spotify:(track|episode|local):/.test(item.uri)) return null;
    const episodio = item.type === "episode";
    const local = Boolean(item.is_local) || item.uri.startsWith("spotify:local:");
    const imagenes = (episodio ? (item.images?.length ? item.images : item.show?.images) : item.album?.images) || [];
    const validas = (Array.isArray(imagenes) ? imagenes : []).filter((i) => urlImagen(i?.url)).sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0));
    const pequena = validas.filter((i) => (Number(i.width) || 0) >= 60).pop() || validas[validas.length - 1];
    const artistas = episodio
        ? [{ nombre: texto(item.show?.name), enlace: enlaceSpotify(item.show?.external_urls?.spotify) }]
        : (Array.isArray(item.artists) ? item.artists : []).slice(0, 8).map((a) => ({ nombre: texto(a?.name), enlace: enlaceSpotify(a?.external_urls?.spotify) }));
    const id = typeof item.id === "string" && /^[\w-]{1,64}$/.test(item.id) ? item.id : null;
    const duracion = Math.max(0, Math.round(Number(item.duration_ms) || 0));
    return {
        uri: item.uri.slice(0, 200),
        id,
        tipo: episodio ? "episodio" : "cancion",
        titulo: texto(item.name) || "Sin título",
        artistas: artistas.filter((a) => a.nombre),
        album: texto(episodio ? item.show?.name : item.album?.name),
        enlaceAlbum: enlaceSpotify(episodio ? item.show?.external_urls?.spotify : item.album?.external_urls?.spotify),
        portada: validas[0]?.url || null,
        portadaPequena: pequena?.url || null,
        enlace: enlaceSpotify(item.external_urls?.spotify) || (id && !local ? `https://open.spotify.com/${episodio ? "episode" : "track"}/${id}` : null),
        duracion,
        posicion: Math.min(duracion || Infinity, Math.max(0, Math.round(Number(j.progress_ms) || 0))),
        reproduciendo: Boolean(j.is_playing),
        local,
    };
}

// Por dónde va la canción en el momento «t», sabiendo por dónde iba cuando se midió.
function posicionEn(s, t) {
    if (!s.reproduciendo) return s.posicion;
    return Math.min(s.duracion || Infinity, s.posicion + Math.max(0, t - s.medido));
}

// ---------- el módulo ----------

export function crearMusica({ carpetaDatos, urlPublica, base, usuarioDe, emitir, emitirA, hayOyentes, escuchando }) {
    const raiz = urlPublica.replace(/\/?$/, "/");
    const cfg = {
        id: process.env.SPOTIFY_CLIENT_ID || "",
        secreto: process.env.SPOTIFY_CLIENT_SECRET || "",
        autorizar: process.env.SPOTIFY_AUTH_URL || "https://accounts.spotify.com/authorize",
        token: process.env.SPOTIFY_TOKEN_URL || "https://accounts.spotify.com/api/token",
        api: (process.env.SPOTIFY_API_URL || "https://api.spotify.com/v1").replace(/\/$/, ""),
        vuelta: process.env.SPOTIFY_REDIRECT_URI || new URL("api/musica/vuelta", raiz).href,
        intervalo: Math.min(60000, Math.max(100, Number(process.env.MUSICA_INTERVALO_MS) || 5000)),
    };
    const configurado = Boolean(cfg.id && cfg.secreto);
    const seguro = cfg.vuelta.startsWith("https:");
    const rutaCookie = new URL(cfg.vuelta).pathname;

    // --- datos (musica.json) ---
    const archivo = path.join(carpetaDatos, "musica.json");
    let datos = { version: 1, cabina: null, historial: [], cuentas: {} };
    if (fs.existsSync(archivo)) {
        try {
            const leido = JSON.parse(fs.readFileSync(archivo, "utf8"));
            datos = {
                version: 1,
                cabina: leido.cabina && typeof leido.cabina.dj === "string" ? leido.cabina : null,
                historial: Array.isArray(leido.historial) ? leido.historial.slice(0, MAXIMO_HISTORIAL) : [],
                cuentas: leido.cuentas && typeof leido.cuentas === "object" ? leido.cuentas : {},
            };
            fs.chmodSync(archivo, 0o600);
        } catch (e) {
            const apartado = `${archivo}.danado-${Date.now()}`;
            try {
                fs.renameSync(archivo, apartado);
            } catch {
                /* se sigue con datos vacíos */
            }
            console.error(`[música] musica.json no se puede leer (${e.message}). Apartado en ${path.basename(apartado)}.`);
        }
    }

    let temporizadorGuardar = null;
    function guardarYa() {
        clearTimeout(temporizadorGuardar);
        temporizadorGuardar = null;
        const temporal = `${archivo}.tmp`;
        fs.rmSync(temporal, { force: true });
        fs.writeFileSync(temporal, JSON.stringify(datos), { mode: 0o600 });
        fs.renameSync(temporal, archivo);
    }
    function guardar() {
        if (temporizadorGuardar) return;
        temporizadorGuardar = setTimeout(() => {
            try {
                guardarYa();
            } catch (e) {
                console.error("[música] Error al guardar:", e.message);
            }
        }, 300);
    }

    // --- lo que está pasando ahora (no se guarda) ---
    let actual = null; // lo que suena, con «medido» (cuándo se midió la posición)
    let anuncio = false; // el Spotify del DJ está poniendo un anuncio
    let aviso = null; // algo que conviene saber (Spotify no contesta, pide calma…)
    let avisoDeFallo = false; // el aviso es por un fallo y se quita cuando Spotify vuelve a contestar
    const accesos = new Map(); // persona → { token, caduca } (en memoria)
    const refrescando = new Map(); // persona → promesa del refresco en marcha
    const estados = new Map(); // state de OAuth → { usuario, sesion, volver, creado }

    function persona(id) {
        const u = usuarioDe(id);
        return u ? { id: u.id, nombre: u.nombre, color: u.color } : { id, nombre: "Alguien", color: "#8d857e" };
    }

    function publico() {
        const ahora = Date.now();
        let sonando = null;
        if (actual) {
            const { medido, ...resto } = actual;
            sonando = { ...resto, posicion: posicionEn(actual, ahora), cuando: ahora };
        }
        return {
            configurado,
            cabina: datos.cabina ? { dj: persona(datos.cabina.dj), desde: datos.cabina.desde } : null,
            sonando,
            anuncio: Boolean(datos.cabina && anuncio),
            aviso,
            historial: datos.historial.map((h) => ({ ...h, dj: persona(h.dj) })),
            escuchando: escuchando(),
        };
    }

    function emitirEstado(extra = {}) {
        emitir({ tipo: "musica", ...publico(), ...extra });
    }

    function ponerAviso(texto, deFallo = true) {
        if (aviso === texto) return false;
        aviso = texto;
        avisoDeFallo = deFallo;
        return true;
    }

    // --- Spotify ---

    async function pedirToken(parametros) {
        const r = await fetch(cfg.token, {
            method: "POST",
            headers: {
                authorization: `Basic ${Buffer.from(`${cfg.id}:${cfg.secreto}`).toString("base64")}`,
                "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams(parametros),
            signal: AbortSignal.timeout(10000),
        });
        let cuerpo = null;
        try {
            cuerpo = await r.json();
        } catch {
            /* sin cuerpo */
        }
        return { estado: r.status, cuerpo, reintentar: Number(r.headers.get("retry-after")) };
    }

    const motivo = (cuerpo) => texto(typeof cuerpo?.error === "string" ? cuerpo.error : cuerpo?.error?.message, 80);

    // Token de acceso de una persona; si ha caducado (o se pide «renovar»), se pide otro con el de refresco.
    async function tokenDe(usuarioId, { renovar = false } = {}) {
        const cuenta = datos.cuentas[usuarioId];
        if (!cuenta) throw Object.assign(new Error("sin cuenta"), { tipo: "revocado" });
        const a = accesos.get(usuarioId);
        if (!renovar && a && a.caduca > Date.now() + 60000) return a.token;
        if (refrescando.has(usuarioId)) return refrescando.get(usuarioId);
        const promesa = (async () => {
            const r = await pedirToken({ grant_type: "refresh_token", refresh_token: cuenta.refresh });
            if (r.estado === 400 && r.cuerpo?.error === "invalid_grant") throw Object.assign(new Error("permiso retirado"), { tipo: "revocado" });
            if (r.estado === 429) throw Object.assign(new Error("demasiadas peticiones"), { tipo: "calma", reintentar: r.reintentar });
            if (r.estado !== 200 || typeof r.cuerpo?.access_token !== "string") throw Object.assign(new Error(`refresco: HTTP ${r.estado} ${motivo(r.cuerpo)}`), { tipo: "fallo" });
            // Si mientras tanto ha desconectado su Spotify, no se resucita nada.
            if (datos.cuentas[usuarioId] !== cuenta) throw Object.assign(new Error("sin cuenta"), { tipo: "revocado" });
            accesos.set(usuarioId, { token: r.cuerpo.access_token, caduca: Date.now() + (Number(r.cuerpo.expires_in) || 3600) * 1000 });
            // Spotify puede cambiar el token de refresco: el viejo deja de valer, así que se guarda ya.
            if (typeof r.cuerpo.refresh_token === "string" && r.cuerpo.refresh_token && r.cuerpo.refresh_token !== cuenta.refresh) {
                cuenta.refresh = r.cuerpo.refresh_token;
                guardarYa();
            }
            return r.cuerpo.access_token;
        })().finally(() => refrescando.delete(usuarioId));
        refrescando.set(usuarioId, promesa);
        return promesa;
    }

    async function llamarApi(usuarioId, ruta) {
        for (let intento = 0; ; intento++) {
            const token = await tokenDe(usuarioId, { renovar: intento > 0 });
            const r = await fetch(`${cfg.api}${ruta}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
            // 401: el token de acceso ha caducado antes de tiempo; se pide otro y se repite una vez.
            if (r.status === 401 && intento === 0) {
                accesos.delete(usuarioId);
                await r.body?.cancel();
                continue;
            }
            return r;
        }
    }

    // --- mirar qué suena ---

    let temporizador = null;
    let mirando = false;
    let dormido = true; // nadie escucha o no hay DJ: no se pregunta a Spotify
    let noAntesDe = 0; // Spotify ha pedido calma (429) o ha fallado: no se pregunta antes de esto
    let fallosSeguidos = 0;

    function programar(ms) {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => {
            temporizador = null;
            mirar().catch((e) => console.error("[música] Error inesperado al mirar qué suena:", e.message));
        }, Math.max(0, ms));
        temporizador.unref?.();
    }

    // Se llama al abrir alguien la música, al entrar alguien en la cabina…: si estaba parado, se mira ya.
    function despertar() {
        if (!temporizador && !mirando) programar(0);
    }

    function apuntarEnHistorial(s, dj) {
        if (datos.historial[0]?.uri === s.uri) return; // la misma que antes (p. ej. tras una pausa larga)
        datos.historial.unshift({
            uri: s.uri,
            id: s.id,
            tipo: s.tipo,
            titulo: s.titulo,
            artistas: s.artistas.map((a) => a.nombre),
            portada: s.portadaPequena,
            enlace: s.enlace,
            dj,
            cuando: new Date().toISOString(),
        });
        datos.historial.length = Math.min(datos.historial.length, MAXIMO_HISTORIAL);
        guardar();
    }

    function actualizar(nuevo, { forzar = false, esAnuncio = false, dj }) {
        const ahora = Date.now();
        let cambio = forzar;
        if (anuncio !== esAnuncio) cambio = true;
        anuncio = esAnuncio;
        if (!nuevo) {
            if (actual) cambio = true;
            actual = null;
        } else {
            if (!actual || actual.uri !== nuevo.uri) {
                cambio = true;
                apuntarEnHistorial(nuevo, dj);
            } else if (actual.reproduciendo !== nuevo.reproduciendo) cambio = true;
            else if (Math.abs(posicionEn(actual, ahora) - nuevo.posicion) > MARGEN_SALTO) cambio = true; // el DJ ha saltado
            actual = { ...nuevo, medido: ahora };
        }
        if (aviso && avisoDeFallo) {
            aviso = null;
            cambio = true;
        }
        if (cambio) emitirEstado();
    }

    function liberar(extra = {}) {
        datos.cabina = null;
        actual = null;
        anuncio = false;
        guardarYa();
        emitirEstado({ cambio: "cabina", ...extra });
    }

    // Quita la cuenta de Spotify de alguien (desconectar, salir del crew o permiso retirado en Spotify).
    function quitarCuenta(usuarioId) {
        const habia = Boolean(datos.cuentas[usuarioId]);
        delete datos.cuentas[usuarioId];
        accesos.delete(usuarioId);
        return habia;
    }

    async function mirar() {
        if (mirando) return;
        const dj = datos.cabina?.dj;
        if (!configurado || !dj || !hayOyentes()) {
            dormido = true;
            return;
        }
        const ahora = Date.now();
        if (ahora < noAntesDe) return programar(noAntesDe - ahora);
        mirando = true;
        const despertando = dormido;
        dormido = false;
        let espera = cfg.intervalo;
        const nombreDj = persona(dj).nombre;
        try {
            const r = await llamarApi(dj, "/me/player/currently-playing?additional_types=track,episode");
            if (datos.cabina?.dj !== dj) {
                // La cabina ha cambiado mientras tanto: esta respuesta ya no vale; se vuelve a mirar ya.
                await r.body?.cancel();
                espera = 0;
            } else if (r.status === 200) {
                const j = await r.json();
                fallosSeguidos = 0;
                actualizar(leerSonando(j), { forzar: despertando, esAnuncio: j?.currently_playing_type === "ad", dj });
            } else if (r.status === 204) {
                fallosSeguidos = 0;
                await r.body?.cancel();
                actualizar(null, { forzar: despertando, dj });
            } else if (r.status === 429) {
                await r.body?.cancel();
                espera = esperaDe429(Number(r.headers.get("retry-after")));
            } else if (r.status === 401 || r.status === 403) {
                await r.body?.cancel();
                espera = ESPERA_ERRORES;
                if (ponerAviso(`Spotify no deja ver qué suena en la cuenta de ${nombreDj}: que vuelva a conectar su Spotify.`)) emitirEstado();
            } else {
                await r.body?.cancel();
                espera = falloPasajero(`HTTP ${r.status}`);
            }
        } catch (e) {
            if (e.tipo === "revocado") {
                // Ha quitado el permiso en Spotify (o ha desconectado): fuera de la cabina, que otro pueda pinchar.
                console.log(`[música] El Spotify de ${nombreDj} ya no da permiso: se deja la cabina libre.`);
                quitarCuenta(dj);
                ponerAviso(`Se ha perdido la conexión con el Spotify de ${nombreDj}: tiene que volver a conectarlo. La cabina queda libre.`, false);
                if (datos.cabina?.dj === dj) liberar();
                else guardarYa();
            } else if (e.tipo === "calma") {
                espera = esperaDe429(e.reintentar);
            } else {
                espera = falloPasajero(e.name === "TimeoutError" ? "no contesta" : e.message);
            }
        } finally {
            mirando = false;
        }
        noAntesDe = Math.max(noAntesDe, Date.now() + (espera > cfg.intervalo ? espera : 0));
        programar(espera);
    }

    // Spotify pide calma (429): se espera lo que diga «Retry-After» (o medio minuto si no lo dice).
    function esperaDe429(segundos) {
        const espera = Math.min(ESPERA_MAXIMA, Math.max(cfg.intervalo, (Number.isFinite(segundos) && segundos > 0 ? segundos : 30) * 1000));
        console.log(`[música] Spotify pide calma: se vuelve a mirar dentro de ${Math.ceil(espera / 1000)} s.`);
        if (espera >= 10000 && ponerAviso(`Spotify pide un respiro: lo que suena se actualizará dentro de ${Math.ceil(espera / 1000)} s.`)) emitirEstado();
        return espera;
    }

    function falloPasajero(detalle) {
        fallosSeguidos += 1;
        if (fallosSeguidos === 1 || fallosSeguidos % 20 === 0) console.error(`[música] No se ha podido mirar qué suena (${detalle}).`);
        if (fallosSeguidos >= 3 && ponerAviso("No llego a Spotify: lo sigo intentando.")) emitirEstado();
        return Math.min(ESPERA_ERRORES, cfg.intervalo * 2 ** fallosSeguidos);
    }

    // --- páginas de ida y vuelta a Spotify (se abren en una pestaña: Spotify no deja entrar desde un marco) ---

    function pagina(res, estado, titulo, parrafos, boton = { texto: "Ir a la cabina", href: `${base}/musica/` }) {
        res.writeHead(estado, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
            "Referrer-Policy": "no-referrer",
        });
        res.end(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapar(titulo)} · Música · HOT SPOT S.L.</title>
<link rel="icon" href="${base}/icono.svg" type="image/svg+xml">
<link rel="stylesheet" href="${base}/estilo.css">
</head>
<body>
<div id="app"><main class="acceso"><div class="acceso-caja">
  <div class="acceso-marca"><span class="logo">HS</span><div><strong>MÚSICA</strong><small>HOT SPOT S.L.</small></div></div>
  <h1>${escapar(titulo)}</h1>
  ${parrafos.map((p) => `<p>${escapar(p)}</p>`).join("\n  ")}
  ${boton ? `<a class="btn ancho" href="${escapar(boton.href)}">${escapar(boton.texto)}</a>` : ""}
</div></main></div>
</body>
</html>`);
    }

    function cookieEstado(valor, maxAge) {
        const partes = [`${COOKIE_ESTADO}=${valor}`, `Path=${rutaCookie}`, "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
        if (seguro) partes.push("Secure");
        return partes.join("; ");
    }

    // GET /api/musica/conectar → a Spotify, a pedir permiso para ver qué suena en tu cuenta.
    function conectar(req, res, sesion, url) {
        if (!configurado) return pagina(res, 503, "Falta conectar Spotify", ["La música de la oficina todavía no está conectada con Spotify. Quien administra tiene los pasos en la cabina."]);
        if (!sesion) {
            return pagina(res, 401, "Entra primero", ["Para conectar tu Spotify tienes que haber entrado con tu cuenta del crew."], {
                texto: "Entrar",
                href: `/cuentas/entrar?vuelta=${encodeURIComponent(`${base}/musica/`)}`,
            });
        }
        const ahora = Date.now();
        for (const [k, v] of estados) if (ahora - v.creado > DURACION_ESTADO) estados.delete(k);
        if (estados.size > 500) estados.delete(estados.keys().next().value);
        const estado = crypto.randomBytes(24).toString("base64url");
        // El «state» va atado a esta sesión (y a una cookie de este navegador): nadie puede colarte su cuenta.
        estados.set(estado, { usuario: sesion.usuario.id, sesion: sesion.sesion.id, volver: url.searchParams.get("volver") === "1", creado: ahora });
        const destino = new URL(cfg.autorizar);
        destino.searchParams.set("client_id", cfg.id);
        destino.searchParams.set("response_type", "code");
        destino.searchParams.set("redirect_uri", cfg.vuelta);
        destino.searchParams.set("scope", ALCANCE);
        destino.searchParams.set("state", estado);
        // Que Spotify enseñe siempre con qué cuenta se conecta (y deje cambiarla).
        destino.searchParams.set("show_dialog", "true");
        res.writeHead(302, { Location: destino.href, "Cache-Control": "no-store", "Set-Cookie": cookieEstado(estado, DURACION_ESTADO / 1000) });
        res.end();
    }

    // GET /api/musica/vuelta?code=…&state=… → Spotify vuelve aquí; se guarda el token de refresco.
    async function vuelta(req, res, sesion, url) {
        const estado = url.searchParams.get("state") || "";
        const guardado = estados.get(estado);
        estados.delete(estado);
        const galleta = leerCookies(req)[COOKIE_ESTADO];
        res.setHeader("Set-Cookie", cookieEstado("", 0));
        if (!configurado) return pagina(res, 503, "Falta conectar Spotify", ["La música de la oficina todavía no está conectada con Spotify."]);
        const valido =
            guardado &&
            Date.now() - guardado.creado <= DURACION_ESTADO &&
            galleta &&
            iguales(galleta, estado) &&
            sesion &&
            sesion.sesion.id === guardado.sesion &&
            sesion.usuario.id === guardado.usuario;
        if (!valido) {
            return pagina(res, 400, "Esta vuelta no vale", [
                "La vuelta de Spotify ha caducado o no es de esta sesión (¿se ha abierto en otro navegador?).",
                "Vuelve a pulsar «Conectar mi Spotify» en la cabina.",
            ]);
        }
        if (url.searchParams.get("error")) {
            return pagina(res, 200, "No se ha conectado", ["Has dicho que no en Spotify, así que no se ha conectado nada. Ya puedes cerrar esta pestaña."]);
        }
        const code = url.searchParams.get("code");
        if (!code) return pagina(res, 400, "Esta vuelta no vale", ["Spotify no ha devuelto ningún código. Vuelve a intentarlo desde la cabina."]);
        const usuario = sesion.usuario;
        let tokens;
        let perfil;
        try {
            const r = await pedirToken({ grant_type: "authorization_code", code, redirect_uri: cfg.vuelta });
            if (r.estado !== 200 || typeof r.cuerpo?.access_token !== "string" || typeof r.cuerpo?.refresh_token !== "string") {
                throw new Error(`token: HTTP ${r.estado} ${motivo(r.cuerpo)}`);
            }
            tokens = r.cuerpo;
            const yo = await fetch(`${cfg.api}/me`, { headers: { authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10000) });
            if (yo.status === 403) {
                await yo.body?.cancel();
                console.log(`[música] El Spotify de ${usuario.nombre} no está dado de alta en la aplicación (403).`);
                return pagina(res, 403, "Tu cuenta de Spotify no está dada de alta", [
                    "Mientras la aplicación de Spotify de la oficina esté en modo de desarrollo, solo se pueden conectar las cuentas que estén en su lista («User Management», en developer.spotify.com).",
                    "Pide a quien administra que añada tu nombre y el correo de tu cuenta de Spotify, y vuelve a intentarlo.",
                ]);
            }
            if (!yo.ok) throw new Error(`perfil: HTTP ${yo.status}`);
            perfil = await yo.json();
        } catch (e) {
            console.error(`[música] No se ha podido conectar el Spotify de ${usuario.nombre} (${e.name === "TimeoutError" ? "no contesta" : e.message}).`);
            return pagina(res, 502, "Spotify no ha contestado bien", ["No se ha podido terminar de conectar tu Spotify. Vuelve a intentarlo dentro de un momento desde la cabina."]);
        }
        datos.cuentas[usuario.id] = {
            refresh: tokens.refresh_token,
            spotifyId: texto(perfil?.id, 100),
            nombre: texto(perfil?.display_name, 100) || texto(perfil?.id, 100) || "Spotify",
            conectada: new Date().toISOString(),
        };
        accesos.set(usuario.id, { token: tokens.access_token, caduca: Date.now() + (Number(tokens.expires_in) || 3600) * 1000 });
        guardarYa();
        console.log(`[música] ${usuario.nombre} ha conectado su Spotify.`);
        emitirA(usuario.id, { tipo: "musica-yo", spotify: miSpotify(usuario.id) });
        if (datos.cabina?.dj === usuario.id) {
            // Estaba pinchando y ha vuelto a conectar: fuera el aviso y a mirar ya.
            aviso = null;
            emitirEstado();
            despertar();
        }
        if (guardado.volver) {
            res.writeHead(302, { Location: `${base}/musica/?conectado=1`, "Cache-Control": "no-store" });
            return res.end();
        }
        return pagina(res, 200, "¡Listo!", [`Tu Spotify (${datos.cuentas[usuario.id].nombre}) ya está conectado.`, "Ya puedes cerrar esta pestaña: la cabina se ha actualizado sola."]);
    }

    function miSpotify(usuarioId) {
        const c = datos.cuentas[usuarioId];
        return c ? { conectado: true, nombre: c.nombre, desde: c.conectada } : { conectado: false, nombre: null, desde: null };
    }

    // --- lo que se puede hacer desde la cabina ---

    function tomar(usuario) {
        if (!configurado) throw error(503, "La música todavía no está conectada con Spotify.");
        if (!datos.cuentas[usuario.id]) throw error(400, "Para pinchar, conecta antes tu Spotify.");
        const c = datos.cabina;
        if (c && c.dj !== usuario.id) throw error(409, `La cabina está ocupada: está pinchando ${persona(c.dj).nombre}.`);
        if (c) return;
        datos.cabina = { dj: usuario.id, desde: new Date().toISOString() };
        actual = null;
        anuncio = false;
        aviso = null;
        guardarYa();
        console.log(`[música] ${usuario.nombre} entra en la cabina.`);
        emitirEstado({ cambio: "cabina", autor: usuario.id });
        despertar();
    }

    function dejar(usuario) {
        const c = datos.cabina;
        if (!c) return;
        if (c.dj !== usuario.id && !usuario.admin) throw error(403, "Solo quien está pinchando (o quien administra) puede dejar la cabina libre.");
        console.log(`[música] ${c.dj === usuario.id ? `${usuario.nombre} deja la cabina` : `${usuario.nombre} deja libre la cabina de ${persona(c.dj).nombre}`}.`);
        aviso = null;
        liberar({ autor: usuario.id });
    }

    function desconectar(usuario) {
        const habia = quitarCuenta(usuario.id);
        if (datos.cabina?.dj === usuario.id) {
            aviso = null;
            liberar({ autor: usuario.id });
        } else guardarYa();
        if (habia) console.log(`[música] ${usuario.nombre} ha desconectado su Spotify.`);
        emitirA(usuario.id, { tipo: "musica-yo", spotify: miSpotify(usuario.id) });
    }

    // Alguien sale del crew: se olvida su Spotify y, si pinchaba, la cabina queda libre.
    function olvidar(usuarioId) {
        const habia = quitarCuenta(usuarioId);
        if (datos.cabina?.dj === usuarioId) liberar();
        else if (habia) guardarYa();
    }

    return {
        configurado,
        direccionVuelta: cfg.vuelta,
        conectar,
        vuelta,
        estadoPara(usuario) {
            return { ...publico(), spotify: miSpotify(usuario.id), ...(usuario.admin ? { ajustes: { vuelta: cfg.vuelta, alcance: ALCANCE } } : {}) };
        },
        publico,
        tomar,
        dejar,
        desconectar,
        olvidar,
        despertar,
        emitirEstado,
        guardarYa,
        pendiente: () => temporizadorGuardar !== null,
    };
}
