// Spotify de mentira para probar la música (como google-falso.mjs, pero con más mandos):
//   node pruebas/spotify-falso.mjs [puerto]        (8614 si no se dice)
//
// Imita lo que usa el servidor:
//   GET  /authorize                      vuelve al momento a redirect_uri con un código (o con error=access_denied)
//   POST /api/token                      código → tokens; refresco (con rotación del token de refresco)
//   GET  /v1/me                          perfil de la cuenta (403 si «no está dada de alta»)
//   GET  /v1/me/player/currently-playing lo que suena en esa cuenta (204 si nada; 429 si se pide)
// La aplicación es «cliente-spotify» con el secreto «secreto-spotify».
//
// Mandos para las pruebas:
//   GET  /control/usar?cuenta=victor              con qué cuenta «entra» el próximo /authorize
//   POST /control/sonando?cuenta=victor  {…}       lo que suena en esa cuenta (null = nada, 204). Formato corto:
//        { id, nombre, artistas: [...], album, duracion, posicion, sonando, tipo: "track"|"episode", local }
//        o una respuesta entera de Spotify (si trae «item» o «currently_playing_type»)
//   POST /control/limite?veces=1&espera=2          las próximas N consultas de lo que suena contestan 429
//   POST /control/caducar?cuenta=victor            sus tokens de acceso dejan de valer (401 → hay que refrescar)
//   POST /control/rotar?si=1                       el refresco devuelve un token de refresco nuevo (el viejo muere)
//   POST /control/revocar?cuenta=victor            sus tokens de refresco dejan de valer (invalid_grant)
//   POST /control/denegar?si=1                     el próximo /authorize vuelve con error=access_denied
//   POST /control/no-registrada?cuenta=victor&si=1 /v1/me contesta 403 (cuenta sin dar de alta en la aplicación)
//   GET  /control/estado                           llamadas recibidas y tokens dados (para comprobar cosas)
//   POST /control/reiniciar                        lo deja todo como al principio

import http from "node:http";
import crypto from "node:crypto";

const PUERTO = Number(process.argv[2] || process.env.SPOTIFY_FALSO_PUERTO || 8614);
const CLIENTE = "cliente-spotify";
const SECRETO = "secreto-spotify";

let E;
function reiniciar() {
    E = {
        cuentaSiguiente: "victor",
        denegar: false,
        rotar: true,
        noRegistradas: new Set(),
        limite: { veces: 0, espera: 1 },
        codigos: new Map(), // código → { cuenta, redirect_uri, scope }
        accesos: new Map(), // token → { cuenta, caduca }
        refrescos: new Map(), // token → cuenta
        sonando: new Map(), // cuenta → { estado, desde }
        llamadas: { authorize: [], token: [], refresco: [], me: 0, sonando: [], respuestas429: 0, refrescosRechazados: 0 },
        dados: { accesos: [], refrescos: [] },
    };
}
reiniciar();

const aleatorio = (prefijo, cuenta) => `${prefijo}-${cuenta}-${crypto.randomBytes(9).toString("base64url")}`;

function json(res, estado, cuerpo, cabeceras = {}) {
    res.writeHead(estado, { "content-type": "application/json", ...cabeceras });
    res.end(JSON.stringify(cuerpo));
}

async function leer(req) {
    let b = "";
    for await (const t of req) b += t;
    return b;
}

function darTokens(cuenta, conRefresco) {
    const access = aleatorio("acc", cuenta);
    E.accesos.set(access, { cuenta, caduca: Date.now() + 3600 * 1000 });
    E.dados.accesos.push(access);
    const salida = { access_token: access, token_type: "Bearer", expires_in: 3600, scope: "user-read-currently-playing user-read-playback-state" };
    if (conRefresco) {
        const refresh = aleatorio("ref", cuenta);
        E.refrescos.set(refresh, cuenta);
        E.dados.refrescos.push(refresh);
        salida.refresh_token = refresh;
    }
    return salida;
}

function cuentaDelToken(req) {
    const auth = String(req.headers.authorization || "");
    const t = auth.startsWith("Bearer ") ? E.accesos.get(auth.slice(7)) : null;
    return t && t.caduca > Date.now() ? t.cuenta : null;
}

// Lo que contesta Spotify en /me/player/currently-playing, a partir del formato corto de las pruebas.
function respuestaSonando(cuenta) {
    const s = E.sonando.get(cuenta);
    if (!s || !s.estado) return null;
    const e = s.estado;
    if (e.item !== undefined || e.currently_playing_type !== undefined) return e;
    const episodio = e.tipo === "episode";
    const duracion = Number(e.duracion) || 180000;
    const avance = e.sonando === false ? 0 : Date.now() - s.desde;
    const progreso = Math.min(duracion, (Number(e.posicion) || 0) + avance);
    const imagenes = [640, 300, 64].map((lado) => ({ url: `https://i.scdn.co/image/${e.id}-${lado}`, width: lado, height: lado }));
    const enlace = (tipo, id) => ({ spotify: `https://open.spotify.com/${tipo}/${id}` });
    const item = {
        id: e.local ? null : e.id,
        name: e.nombre || e.id,
        uri: e.local ? `spotify:local:${encodeURIComponent(e.nombre || "x")}::${Math.round(duracion / 1000)}` : `spotify:${episodio ? "episode" : "track"}:${e.id}`,
        type: episodio ? "episode" : "track",
        duration_ms: duracion,
        explicit: false,
        is_local: Boolean(e.local),
        external_urls: e.local ? {} : enlace(episodio ? "episode" : "track", e.id),
    };
    if (episodio) {
        item.images = imagenes;
        item.show = { name: e.album || "Un pódcast", external_urls: enlace("show", `show${e.id}`), images: imagenes };
    } else {
        item.artists = (e.artistas || ["Artista"]).map((n, i) => ({ name: n, id: `artista${i}`, uri: `spotify:artist:artista${i}`, external_urls: enlace("artist", `artista${i}`) }));
        item.album = { name: e.album || "Disco", images: e.local ? [] : imagenes, external_urls: enlace("album", `album${e.id}`) };
    }
    return {
        timestamp: s.desde,
        context: null,
        progress_ms: progreso,
        is_playing: e.sonando !== false,
        currently_playing_type: episodio ? "episode" : "track",
        actions: { disallows: { resuming: true } },
        item,
    };
}

http
    .createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${PUERTO}`);
        const q = url.searchParams;
        const ruta = url.pathname;
        try {
            // ---------- mandos ----------
            if (ruta === "/control/usar") {
                E.cuentaSiguiente = q.get("cuenta") || "victor";
                return json(res, 200, { ok: true });
            }
            if (ruta === "/control/sonando" && req.method === "POST") {
                const cuenta = q.get("cuenta") || "victor";
                const texto = await leer(req);
                E.sonando.set(cuenta, { estado: texto.trim() ? JSON.parse(texto) : null, desde: Date.now() });
                return json(res, 200, { ok: true });
            }
            if (ruta === "/control/limite" && req.method === "POST") {
                E.limite = { veces: Number(q.get("veces") || 1), espera: Number(q.get("espera") || 1) };
                return json(res, 200, { ok: true });
            }
            if (ruta === "/control/caducar" && req.method === "POST") {
                for (const [t, v] of E.accesos) if (v.cuenta === q.get("cuenta")) E.accesos.delete(t);
                return json(res, 200, { ok: true });
            }
            if (ruta === "/control/rotar" && req.method === "POST") {
                E.rotar = q.get("si") !== "0";
                return json(res, 200, { ok: true });
            }
            if (ruta === "/control/revocar" && req.method === "POST") {
                for (const [t, c] of E.refrescos) if (c === q.get("cuenta")) E.refrescos.delete(t);
                for (const [t, v] of E.accesos) if (v.cuenta === q.get("cuenta")) E.accesos.delete(t);
                return json(res, 200, { ok: true });
            }
            if (ruta === "/control/denegar" && req.method === "POST") {
                E.denegar = q.get("si") !== "0";
                return json(res, 200, { ok: true });
            }
            if (ruta === "/control/no-registrada" && req.method === "POST") {
                if (q.get("si") === "0") E.noRegistradas.delete(q.get("cuenta"));
                else E.noRegistradas.add(q.get("cuenta"));
                return json(res, 200, { ok: true });
            }
            if (ruta === "/control/estado") {
                return json(res, 200, { llamadas: E.llamadas, dados: E.dados, refrescosVivos: [...E.refrescos.keys()], rotar: E.rotar });
            }
            if (ruta === "/control/reiniciar" && req.method === "POST") {
                reiniciar();
                return json(res, 200, { ok: true });
            }

            // ---------- lo que imita a Spotify ----------
            if (ruta === "/authorize" && req.method === "GET") {
                const destino = new URL(q.get("redirect_uri"));
                E.llamadas.authorize.push({ client_id: q.get("client_id"), scope: q.get("scope"), redirect_uri: q.get("redirect_uri"), show_dialog: q.get("show_dialog"), response_type: q.get("response_type"), state: q.get("state") });
                if (q.get("client_id") !== CLIENTE) return json(res, 400, { error: "INVALID_CLIENT: Invalid client" });
                if (E.denegar) {
                    E.denegar = false;
                    destino.searchParams.set("error", "access_denied");
                } else {
                    const code = crypto.randomBytes(12).toString("base64url");
                    E.codigos.set(code, { cuenta: E.cuentaSiguiente, redirect_uri: q.get("redirect_uri"), scope: q.get("scope") });
                    destino.searchParams.set("code", code);
                }
                if (q.get("state")) destino.searchParams.set("state", q.get("state"));
                res.writeHead(302, { Location: destino.toString() });
                return res.end();
            }

            if (ruta === "/api/token" && req.method === "POST") {
                const f = new URLSearchParams(await leer(req));
                const auth = String(req.headers.authorization || "");
                const [id, secreto] = auth.startsWith("Basic ") ? Buffer.from(auth.slice(6), "base64").toString("utf8").split(":") : [f.get("client_id"), f.get("client_secret")];
                if (id !== CLIENTE || secreto !== SECRETO) return json(res, 401, { error: "invalid_client", error_description: "Invalid client" });
                if (f.get("grant_type") === "authorization_code") {
                    const c = E.codigos.get(f.get("code"));
                    E.codigos.delete(f.get("code"));
                    E.llamadas.token.push({ redirect_uri: f.get("redirect_uri"), valido: Boolean(c) });
                    if (!c || c.redirect_uri !== f.get("redirect_uri")) return json(res, 400, { error: "invalid_grant", error_description: "Invalid authorization code" });
                    return json(res, 200, darTokens(c.cuenta, true));
                }
                if (f.get("grant_type") === "refresh_token") {
                    const viejo = f.get("refresh_token");
                    const cuenta = E.refrescos.get(viejo);
                    E.llamadas.refresco.push({ cuenta: cuenta || null, cuando: Date.now() });
                    if (!cuenta) {
                        E.llamadas.refrescosRechazados += 1;
                        return json(res, 400, { error: "invalid_grant", error_description: "Refresh token revoked" });
                    }
                    const salida = darTokens(cuenta, E.rotar);
                    if (E.rotar) E.refrescos.delete(viejo); // con rotación, el viejo ya no vale
                    return json(res, 200, salida);
                }
                return json(res, 400, { error: "unsupported_grant_type" });
            }

            if (ruta === "/v1/me" && req.method === "GET") {
                E.llamadas.me += 1;
                const cuenta = cuentaDelToken(req);
                if (!cuenta) return json(res, 401, { error: { status: 401, message: "Invalid access token" } });
                if (E.noRegistradas.has(cuenta)) return json(res, 403, { error: { status: 403, message: "User not registered in the Developer Dashboard" } });
                const nombre = cuenta.charAt(0).toUpperCase() + cuenta.slice(1);
                return json(res, 200, { id: `${cuenta}-spotify`, display_name: `${nombre} en Spotify`, type: "user", uri: `spotify:user:${cuenta}-spotify`, external_urls: { spotify: `https://open.spotify.com/user/${cuenta}-spotify` } });
            }

            if (ruta === "/v1/me/player/currently-playing" && req.method === "GET") {
                const cuenta = cuentaDelToken(req);
                const llamada = { cuenta, cuando: Date.now(), tipos: q.get("additional_types"), respuesta: 200 };
                E.llamadas.sonando.push(llamada);
                if (E.limite.veces > 0) {
                    E.limite.veces -= 1;
                    E.llamadas.respuestas429 += 1;
                    llamada.respuesta = 429;
                    return json(res, 429, { error: { status: 429, message: "API rate limit exceeded" } }, { "Retry-After": String(E.limite.espera) });
                }
                if (!cuenta) {
                    llamada.respuesta = 401;
                    return json(res, 401, { error: { status: 401, message: "The access token expired" } });
                }
                const r = respuestaSonando(cuenta);
                if (!r) {
                    llamada.respuesta = 204;
                    res.writeHead(204);
                    return res.end();
                }
                return json(res, 200, r);
            }

            json(res, 404, { error: { status: 404, message: "Service not found" } });
        } catch (error) {
            json(res, 500, { error: { status: 500, message: error.message } });
        }
    })
    .listen(PUERTO, () => console.log(`Spotify falso en ${PUERTO}`));
