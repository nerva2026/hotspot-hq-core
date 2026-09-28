// Cuentas del crew de HOT SPOT S.L.
//
// Este módulo hace dos cosas:
//
// 1. Entrar con Google. Solo pueden entrar los correos que estén en la lista del crew (las personas
//    del tablón con correo). Al entrar se abre una sesión común (cookie «hs_sesion») que sirve para la
//    oficina, el tablón y la portada.
//
// 2. Hace de «proveedor de identidad» (OpenID Connect) para WorkAdventure. La oficina (el contenedor
//    «play») está configurada para iniciar sesión aquí; nosotros comprobamos que eres del crew (con
//    Google) y le devolvemos quién eres. Así la oficina no necesita saber nada de Google ni de la lista.
//
// Rutas (bajo /cuentas):
//   /.well-known/openid-configuration, /jwks       descubrimiento y clave pública
//   /autorizar, /token, /userinfo, /revocar        OpenID Connect (flujo con código y PKCE)
//   /salir                                         cerrar sesión (la oficina manda aquí al salir)
//   /entrar?vuelta=/tareas/                        entrar con Google y volver a una página nuestra
//   /google/ir, /google                            ida y vuelta a Google
//   /yo                                            quién soy (para la portada)
//   /estado                                        si el acceso del crew está activado (para los mapas)
//   /r/<archivo>                                   imágenes y estilos de la portada

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DIA = 24 * 3600 * 1000;
const DURACION_TOKEN = 30 * DIA;
const DURACION_ID_TOKEN = 3600;
const COOKIE_SESION = "hs_sesion";
const COOKIE_GOOGLE = "hs_google";
const COOKIE_DIRECTO = "hs_directo";
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const huella = (texto) => crypto.createHash("sha256").update(texto).digest("hex");
const aleatorio = (n = 32) => crypto.randomBytes(n).toString("base64url");
const escapar = (s) =>
    String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

export const correoValido = (c) => typeof c === "string" && c.length <= 120 && CORREO.test(c.trim());
export const limpiarCorreo = (c) => String(c || "").trim().toLowerCase();

function iguales(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Mapa en memoria con caducidad (peticiones a medias, códigos de un solo uso…).
function mapaTemporal(ms) {
    const m = new Map();
    setInterval(() => {
        const limite = Date.now() - ms;
        for (const [k, v] of m) if (v.creado < limite) m.delete(k);
    }, 60000).unref();
    return {
        poner: (k, v) => m.set(k, { ...v, creado: Date.now() }),
        sacar(k) {
            const v = m.get(k);
            m.delete(k);
            return v && v.creado >= Date.now() - ms ? v : null;
        },
        ver(k) {
            const v = m.get(k);
            return v && v.creado >= Date.now() - ms ? v : null;
        },
    };
}

export function crearCrew({ almacen, cuentas, carpetaDatos, carpetaPortada, urlPublica, alCambiarUsuarios }) {
    const datos = () => almacen.datos;
    const origen = (process.env.HOTSPOT_ORIGEN || new URL(urlPublica).origin).replace(/\/$/, "");
    const seguro = origen.startsWith("https:");
    const cfg = {
        google: {
            id: process.env.GOOGLE_CLIENT_ID || "",
            secreto: process.env.GOOGLE_CLIENT_SECRET || "",
            autorizar: process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
            token: process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
            vuelta: `${origen}/cuentas/google`,
        },
        oidc: {
            cliente: process.env.OIDC_CLIENTE || "oficina",
            secreto: process.env.OIDC_SECRETO || "",
            // Dirección con la que la oficina habla con nosotros (por dentro de Docker, sin pasar por internet).
            emisor: (process.env.OIDC_EMISOR || `${origen}/cuentas`).replace(/\/$/, ""),
            redirecciones: (process.env.OIDC_REDIRECCIONES || `${origen}/openid-callback`).split(",").map((s) => s.trim()),
        },
        admin: limpiarCorreo(process.env.CREW_ADMIN),
    };
    const googleListo = Boolean(cfg.google.id && cfg.google.secreto);
    const oidcListo = Boolean(cfg.oidc.secreto);

    if (!Array.isArray(datos().tokensOidc)) datos().tokensOidc = [];

    // --- clave para firmar los id_token (RS256), creada la primera vez ---
    const archivoClave = path.join(carpetaDatos, "clave-oidc.pem");
    if (!fs.existsSync(archivoClave)) {
        const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
        fs.writeFileSync(archivoClave, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    }
    const clavePrivada = crypto.createPrivateKey(fs.readFileSync(archivoClave));
    const jwkPublica = crypto.createPublicKey(clavePrivada).export({ format: "jwk" });
    const kid = huella(jwkPublica.n).slice(0, 16);

    function firmarJwt(carga) {
        const cabecera = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
        const cuerpo = b64url(JSON.stringify(carga));
        const firma = crypto.sign("sha256", Buffer.from(`${cabecera}.${cuerpo}`), clavePrivada);
        return `${cabecera}.${cuerpo}.${b64url(firma)}`;
    }

    // --- primer administrador (CREW_ADMIN) ---
    if (cfg.admin && !datos().usuarios.some((u) => u.email === cfg.admin)) {
        // Si ya había cuentas del tablón sin correo, la más antigua es la de quien lo instaló.
        const sinCorreo = datos()
            .usuarios.filter((u) => !u.email && !u.baja)
            .sort((a, b) => String(a.creado).localeCompare(String(b.creado)));
        if (sinCorreo.length) {
            sinCorreo[0].email = cfg.admin;
            sinCorreo[0].admin = true;
        } else {
            const base = cfg.admin.split("@")[0].replace(/[._-]+/g, " ");
            const u = cuentas.nuevoUsuario(datos(), { nombre: base.charAt(0).toUpperCase() + base.slice(1), admin: true, clave: null });
            u.email = cfg.admin;
            u.nombreProvisional = true;
        }
        almacen.guardarYa();
    }

    const peticiones = mapaTemporal(20 * 60 * 1000); // a dónde volver después de Google
    const estadosGoogle = mapaTemporal(15 * 60 * 1000);
    const codigos = mapaTemporal(2 * 60 * 1000);

    setInterval(() => {
        const ahora = Date.now();
        const antes = datos().tokensOidc.length;
        datos().tokensOidc = datos().tokensOidc.filter((t) => t.caduca > ahora);
        if (antes !== datos().tokensOidc.length) almacen.guardar();
    }, 3600 * 1000).unref();

    // --- utilidades ---
    const activo = (u) => Boolean(u && !u.baja);
    const deCorreo = (correo) => datos().usuarios.find((u) => u.email === correo && !u.baja) || null;

    function leerCookies(req) {
        const salida = {};
        for (const trozo of (req.headers.cookie || "").split(";")) {
            const i = trozo.indexOf("=");
            if (i > 0) salida[trozo.slice(0, i).trim()] = decodeURIComponent(trozo.slice(i + 1).trim());
        }
        return salida;
    }
    function cookie(nombre, valor, { ruta = "/", maxAge } = {}) {
        const partes = [`${nombre}=${valor}`, `Path=${ruta}`, "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
        if (seguro) partes.push("Secure");
        return partes.join("; ");
    }
    function anadirCookie(res, texto) {
        const previas = res.getHeader("Set-Cookie");
        res.setHeader("Set-Cookie", [...(Array.isArray(previas) ? previas : previas ? [previas] : []), texto]);
    }

    // Sesión común (oficina, tablón, portada). Acepta también la cookie antigua del tablón.
    function sesionDe(req) {
        const c = leerCookies(req);
        for (const codigo of [c[COOKIE_SESION], c.hs_tablon]) {
            const s = cuentas.buscarSesion(datos(), codigo);
            if (s && activo(s.usuario)) return { ...s, codigo };
        }
        return null;
    }
    function abrirSesion(res, usuario) {
        const codigo = cuentas.crearSesion(datos(), usuario);
        anadirCookie(res, cookie(COOKIE_SESION, codigo, { maxAge: cuentas.DURACION_SESION / 1000 }));
        return codigo;
    }
    function cerrarSesion(req, res) {
        const c = leerCookies(req);
        for (const codigo of [c[COOKIE_SESION], c.hs_tablon]) if (codigo) cuentas.cerrarSesion(datos(), codigo);
        anadirCookie(res, cookie(COOKIE_SESION, "", { maxAge: 0 }));
        anadirCookie(res, cookie("hs_tablon", "", { ruta: "/tareas/", maxAge: 0 }));
    }

    const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'";
    function html(res, estado, titulo, cuerpo) {
        res.writeHead(estado, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": CSP });
        res.end(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapar(titulo)} · HOT SPOT S.L.</title>
<link rel="icon" href="/tareas/icono.svg" type="image/svg+xml">
<link rel="stylesheet" href="/cuentas/r/portada.css">
</head>
<body>
<main class="escena">
  <div class="panel">
    <img class="marca" src="/cuentas/r/marca.png" alt="HOT SPOT S.L." width="390" height="120">
    ${cuerpo}
  </div>
</main>
</body>
</html>`);
    }
    const boton = (href, texto, clase = "") => `<a class="boton ${clase}" href="${escapar(href)}">${escapar(texto)}</a>`;

    function redirigir(res, destino) {
        res.writeHead(302, { Location: destino, "Cache-Control": "no-store" });
        res.end();
    }
    function json(res, estado, cuerpo, extra = {}) {
        res.writeHead(estado, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Pragma: "no-cache", ...extra });
        res.end(JSON.stringify(cuerpo));
    }
    function leerCuerpo(req) {
        return new Promise((resolver, rechazar) => {
            const trozos = [];
            let total = 0;
            req.on("data", (t) => {
                total += t.length;
                if (total > 64 * 1024) {
                    req.destroy();
                    rechazar(new Error("Demasiado grande"));
                    return;
                }
                trozos.push(t);
            });
            req.on("end", () => resolver(Buffer.concat(trozos).toString("utf8")));
            req.on("error", rechazar);
        });
    }
    async function leerFormulario(req) {
        const texto = await leerCuerpo(req);
        const tipo = String(req.headers["content-type"] || "");
        if (tipo.includes("application/json")) {
            try {
                return JSON.parse(texto);
            } catch {
                return {};
            }
        }
        return Object.fromEntries(new URLSearchParams(texto));
    }
    const rutaSegura = (r) => (typeof r === "string" && /^\/(?!\/)[\w\-./?=&%#~]*$/.test(r) ? r : "/");

    // --- páginas ---
    function paginaAcceso(res, idPeticion) {
        if (!googleListo) return paginaSinGoogle(res);
        html(
            res,
            200,
            "Acceso crew",
            `<h1>Acceso crew</h1>
    <p>La oficina y el tablón son solo para el crew de HOT SPOT S.L. Entra con tu cuenta de Google.</p>
    <div class="botones">
      ${boton(`/cuentas/google/ir?p=${encodeURIComponent(idPeticion)}`, "Entrar con Google", "principal")}
      ${boton("/calle", "Seguir como invitado", "claro")}
    </div>`,
        );
    }
    function paginaSinGoogle(res) {
        html(res, 503, "Acceso crew", `<h1>Acceso crew</h1><p>El acceso con Google todavía no está configurado en el servidor.</p><div class="botones">${boton("/", "Volver a la portada", "claro")}</div>`);
    }
    function paginaNoCrew(res, correo, idPeticion) {
        html(
            res,
            403,
            "No estás en el crew",
            `<h1>No estás en el crew</h1>
    <p>La cuenta <strong>${escapar(correo)}</strong> no está en la lista del crew de HOT SPOT S.L.</p>
    <p class="nota">Si deberías estar, pide que te añadan al crew y vuelve a intentarlo.</p>
    <div class="botones">
      ${boton(`/cuentas/google/ir?otra=1${idPeticion ? `&p=${encodeURIComponent(idPeticion)}` : ""}`, "Probar con otra cuenta", "principal")}
      ${boton("/calle", "Entrar como invitado", "claro")}
    </div>`,
        );
    }
    function paginaError(res, estado, texto) {
        html(res, estado, "Algo ha fallado", `<h1>Algo ha fallado</h1><p>${escapar(texto)}</p><div class="botones">${boton("/", "Volver a la portada", "claro")}</div>`);
    }

    // --- OpenID Connect: quién es cada uno ---
    function datosDe(u, alcance = "openid email profile") {
        const claims = { sub: u.id };
        if (alcance.includes("email")) Object.assign(claims, { email: u.email || `${u.id}@crew.hot-spot.es`, email_verified: true });
        if (alcance.includes("profile")) Object.assign(claims, { name: u.nombre, given_name: u.nombre, preferred_username: u.nombre, username: u.nombre, locale: "es" });
        claims.tags = u.admin ? ["crew", "admin"] : ["crew"];
        return claims;
    }

    function emitirCodigo(res, peticion, usuario) {
        const code = aleatorio();
        codigos.poner(code, {
            usuario: usuario.id,
            cliente: peticion.client_id,
            redirect_uri: peticion.redirect_uri,
            reto: peticion.code_challenge || null,
            metodo: peticion.code_challenge_method || (peticion.code_challenge ? "plain" : null),
            nonce: peticion.nonce || null,
            alcance: peticion.scope || "openid",
        });
        const destino = new URL(peticion.redirect_uri);
        destino.searchParams.set("code", code);
        if (peticion.state) destino.searchParams.set("state", peticion.state);
        redirigir(res, destino.toString());
    }

    function autenticarCliente(req, form) {
        let id = form.client_id;
        let secreto = form.client_secret;
        const auth = String(req.headers.authorization || "");
        if (auth.startsWith("Basic ")) {
            const [a, b] = Buffer.from(auth.slice(6), "base64").toString("utf8").split(":");
            id = decodeURIComponent(a || "");
            secreto = decodeURIComponent(b || "");
        }
        return Boolean(oidcListo && id === cfg.oidc.cliente && secreto && iguales(secreto, cfg.oidc.secreto));
    }

    function usuarioDelToken(req) {
        const auth = String(req.headers.authorization || "");
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
        if (!token) return null;
        const t = datos().tokensOidc.find((x) => x.id === huella(token));
        if (!t || t.caduca < Date.now()) return null;
        const u = datos().usuarios.find((x) => x.id === t.usuario);
        return activo(u) ? { usuario: u, alcance: t.alcance } : null;
    }

    // Tras volver de Google con alguien del crew: seguir con lo que se estaba haciendo.
    function continuar(res, peticion, usuario) {
        if (peticion?.tipo === "oidc") return emitirCodigo(res, peticion.q, usuario);
        return redirigir(res, rutaSegura(peticion?.ruta || "/"));
    }

    // Nombre visible del crew la primera vez que alguien entra (si se le añadió solo con el correo).
    function ponerNombreDeGoogle(u, perfil) {
        if (!u.nombreProvisional) return;
        const candidatos = [perfil.given_name, perfil.name, u.nombre].filter(Boolean);
        for (const c of candidatos) {
            const v = cuentas.validarNombre(c, datos().usuarios, u.id);
            if (!v.error) {
                u.nombre = v.nombre;
                break;
            }
        }
        u.nombreProvisional = false;
    }

    async function vueltaDeGoogle(req, res, url) {
        const estado = url.searchParams.get("state") || "";
        const galletas = leerCookies(req);
        const guardado = estadosGoogle.sacar(estado);
        anadirCookie(res, cookie(COOKIE_GOOGLE, "", { ruta: "/cuentas/", maxAge: 0 }));
        if (!guardado || !galletas[COOKIE_GOOGLE] || !iguales(galletas[COOKIE_GOOGLE], estado)) {
            return paginaError(res, 400, "La vuelta de Google ha caducado o no es válida. Vuelve a intentarlo desde la portada.");
        }
        if (url.searchParams.get("error")) return redirigir(res, "/?cancelado");
        const code = url.searchParams.get("code");
        if (!code) return paginaError(res, 400, "Google no ha devuelto ningún código.");
        let perfil;
        try {
            const r = await fetch(cfg.google.token, {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ code, client_id: cfg.google.id, client_secret: cfg.google.secreto, redirect_uri: cfg.google.vuelta, grant_type: "authorization_code" }),
            });
            const tokens = await r.json();
            if (!r.ok || !tokens.id_token) throw new Error(tokens.error_description || tokens.error || `HTTP ${r.status}`);
            // El id_token llega directamente de Google por HTTPS: basta con comprobar sus datos.
            perfil = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8"));
            const emisorBien = ["https://accounts.google.com", "accounts.google.com"].includes(perfil.iss) || process.env.GOOGLE_EMISOR === perfil.iss;
            const audiencia = Array.isArray(perfil.aud) ? perfil.aud.includes(cfg.google.id) : perfil.aud === cfg.google.id;
            if (!emisorBien || !audiencia) throw new Error("respuesta de Google no válida");
            if (perfil.exp * 1000 < Date.now() - 60000) throw new Error("respuesta de Google caducada");
            if (guardado.nonce && perfil.nonce !== guardado.nonce) throw new Error("respuesta de Google no válida (nonce)");
            if (perfil.email_verified === false || perfil.email_verified === "false") throw new Error("ese correo no está verificado en Google");
        } catch (error) {
            console.error("[crew] Error al entrar con Google:", error.message);
            return paginaError(res, 502, `No se ha podido completar la entrada con Google (${error.message}).`);
        }
        const correo = limpiarCorreo(perfil.email);
        const usuario = deCorreo(correo);
        if (!usuario) {
            console.log(`[crew] Intento de entrada de alguien que no está en el crew: ${correo}`);
            return paginaNoCrew(res, correo, guardado.peticion);
        }
        ponerNombreDeGoogle(usuario, perfil);
        usuario.entradoEl = new Date().toISOString();
        abrirSesion(res, usuario);
        almacen.guardar();
        alCambiarUsuarios();
        return continuar(res, peticiones.sacar(guardado.peticion), usuario);
    }

    function irAGoogle(req, res, url) {
        if (!googleListo) return paginaSinGoogle(res);
        const estado = aleatorio(24);
        const nonce = aleatorio(16);
        estadosGoogle.poner(estado, { peticion: url.searchParams.get("p") || null, nonce });
        anadirCookie(res, cookie(COOKIE_GOOGLE, estado, { ruta: "/cuentas/", maxAge: 900 }));
        const destino = new URL(cfg.google.autorizar);
        destino.searchParams.set("client_id", cfg.google.id);
        destino.searchParams.set("redirect_uri", cfg.google.vuelta);
        destino.searchParams.set("response_type", "code");
        destino.searchParams.set("scope", "openid email profile");
        destino.searchParams.set("state", estado);
        destino.searchParams.set("nonce", nonce);
        // Que Google pregunte siempre con qué cuenta (mucha gente tiene varias).
        destino.searchParams.set("prompt", "select_account");
        return redirigir(res, destino.toString());
    }

    function descubrimiento() {
        return {
            issuer: cfg.oidc.emisor,
            // El navegador va a la dirección pública; la oficina habla con el resto por dentro.
            authorization_endpoint: `${origen}/cuentas/autorizar`,
            token_endpoint: `${cfg.oidc.emisor}/token`,
            userinfo_endpoint: `${cfg.oidc.emisor}/userinfo`,
            jwks_uri: `${cfg.oidc.emisor}/jwks`,
            revocation_endpoint: `${cfg.oidc.emisor}/revocar`,
            end_session_endpoint: `${origen}/cuentas/salir`,
            response_types_supported: ["code"],
            response_modes_supported: ["query"],
            grant_types_supported: ["authorization_code"],
            subject_types_supported: ["public"],
            id_token_signing_alg_values_supported: ["RS256"],
            scopes_supported: ["openid", "email", "profile"],
            token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
            revocation_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
            code_challenge_methods_supported: ["S256", "plain"],
            claims_supported: ["sub", "iss", "aud", "exp", "iat", "nonce", "email", "email_verified", "name", "given_name", "preferred_username", "username", "locale", "tags"],
        };
    }

    // ---------- rutas ----------
    async function manejar(req, res, ruta) {
        const url = new URL(req.url, origen);
        const metodo = req.method;

        if (ruta === "/.well-known/openid-configuration" || ruta === "/.well-known/oauth-authorization-server") return json(res, 200, descubrimiento());
        if (ruta === "/jwks") return json(res, 200, { keys: [{ ...jwkPublica, kid, use: "sig", alg: "RS256" }] });

        if (ruta === "/autorizar" && metodo === "GET") {
            const q = Object.fromEntries(url.searchParams);
            if (!oidcListo || q.client_id !== cfg.oidc.cliente) return paginaError(res, 400, "Esta aplicación no está autorizada a pedir acceso.");
            if (!cfg.oidc.redirecciones.includes(q.redirect_uri)) return paginaError(res, 400, "Dirección de vuelta no permitida.");
            const volverConError = (error) => {
                const d = new URL(q.redirect_uri);
                d.searchParams.set("error", error);
                if (q.state) d.searchParams.set("state", q.state);
                return redirigir(res, d.toString());
            };
            if (q.response_type !== "code") return volverConError("unsupported_response_type");
            if (!String(q.scope || "").split(" ").includes("openid")) return volverConError("invalid_scope");
            if (q.code_challenge_method && !["S256", "plain"].includes(q.code_challenge_method)) return volverConError("invalid_request");
            const sesion = sesionDe(req);
            if (sesion) return emitirCodigo(res, q, sesion.usuario);
            if (q.prompt === "none") return volverConError("login_required");
            const id = aleatorio(18);
            peticiones.poner(id, { tipo: "oidc", q });
            // Desde el botón CREW de la portada se va directo a Google, sin la pantalla intermedia.
            if (leerCookies(req)[COOKIE_DIRECTO] && googleListo) {
                anadirCookie(res, cookie(COOKIE_DIRECTO, "", { ruta: "/cuentas/", maxAge: 0 }));
                return irAGoogle(req, res, new URL(`/cuentas/google/ir?p=${encodeURIComponent(id)}`, origen));
            }
            return paginaAcceso(res, id);
        }

        if (ruta === "/token" && metodo === "POST") {
            const form = await leerFormulario(req);
            if (!autenticarCliente(req, form)) return json(res, 401, { error: "invalid_client" }, { "WWW-Authenticate": 'Basic realm="cuentas"' });
            if (form.grant_type !== "authorization_code") return json(res, 400, { error: "unsupported_grant_type" });
            const c = codigos.sacar(form.code || "");
            if (!c || c.cliente !== cfg.oidc.cliente || c.redirect_uri !== form.redirect_uri) return json(res, 400, { error: "invalid_grant" });
            if (c.reto) {
                const verificador = String(form.code_verifier || "");
                const calculado = c.metodo === "S256" ? b64url(crypto.createHash("sha256").update(verificador).digest()) : verificador;
                if (!verificador || !iguales(calculado, c.reto)) return json(res, 400, { error: "invalid_grant", error_description: "PKCE" });
            }
            const usuario = datos().usuarios.find((u) => u.id === c.usuario);
            if (!activo(usuario)) return json(res, 400, { error: "invalid_grant" });
            const accessToken = aleatorio(32);
            datos().tokensOidc.push({ id: huella(accessToken), usuario: usuario.id, alcance: c.alcance, caduca: Date.now() + DURACION_TOKEN });
            almacen.guardar();
            const ahora = Math.floor(Date.now() / 1000);
            const idToken = firmarJwt({
                iss: cfg.oidc.emisor,
                sub: usuario.id,
                aud: cfg.oidc.cliente,
                iat: ahora,
                exp: ahora + DURACION_ID_TOKEN,
                auth_time: ahora,
                ...(c.nonce ? { nonce: c.nonce } : {}),
                ...datosDe(usuario, c.alcance),
            });
            return json(res, 200, { access_token: accessToken, token_type: "Bearer", expires_in: DURACION_TOKEN / 1000, id_token: idToken, scope: c.alcance });
        }

        if (ruta === "/userinfo" && (metodo === "GET" || metodo === "POST")) {
            const t = usuarioDelToken(req);
            if (!t) return json(res, 401, { error: "invalid_token" }, { "WWW-Authenticate": 'Bearer error="invalid_token"' });
            return json(res, 200, datosDe(t.usuario, t.alcance));
        }

        if (ruta === "/revocar" && metodo === "POST") {
            const form = await leerFormulario(req);
            if (!autenticarCliente(req, form)) return json(res, 401, { error: "invalid_client" });
            const id = huella(String(form.token || ""));
            datos().tokensOidc = datos().tokensOidc.filter((t) => t.id !== id);
            almacen.guardar();
            res.writeHead(200, { "Cache-Control": "no-store" });
            return res.end();
        }

        if (ruta === "/salir" && metodo === "GET") {
            // La oficina manda aquí al cerrar sesión, con su propio token: se anula también el nuestro.
            const tokenOficina = url.searchParams.get("token");
            if (tokenOficina) {
                try {
                    const carga = JSON.parse(Buffer.from(tokenOficina.split(".")[1], "base64url").toString("utf8"));
                    if (carga.accessToken) {
                        const id = huella(String(carga.accessToken));
                        datos().tokensOidc = datos().tokensOidc.filter((t) => t.id !== id);
                    }
                } catch {
                    /* token raro: se sigue igualmente */
                }
            }
            cerrarSesion(req, res);
            almacen.guardar();
            return redirigir(res, "/?adios");
        }

        if (ruta === "/entrar" && metodo === "GET") {
            const vuelta = rutaSegura(url.searchParams.get("vuelta") || "/tareas/");
            if (sesionDe(req)) return redirigir(res, vuelta);
            const id = aleatorio(18);
            peticiones.poner(id, { tipo: "ruta", ruta: vuelta });
            return irAGoogle(req, res, new URL(`/cuentas/google/ir?p=${encodeURIComponent(id)}`, origen));
        }

        if (ruta === "/google/ir" && metodo === "GET") return irAGoogle(req, res, url);
        if (ruta === "/google" && metodo === "GET") return vueltaDeGoogle(req, res, url);

        // Para los scripts de los mapas (que van en un marco sin origen): ¿está activado el acceso del crew?
        if (ruta === "/estado" && metodo === "GET") {
            return json(res, 200, { soloCrew: googleListo && oidcListo }, { "Access-Control-Allow-Origin": "*" });
        }

        if (ruta === "/yo" && metodo === "GET") {
            const s = sesionDe(req);
            if (!s) return json(res, 401, { error: "Sin sesión", google: googleListo });
            return json(res, 200, { nombre: s.usuario.nombre, color: s.usuario.color, admin: Boolean(s.usuario.admin) });
        }

        const archivo = /^\/r\/([\w.-]+)$/.exec(ruta);
        if (archivo && (metodo === "GET" || metodo === "HEAD")) {
            const destino = path.join(carpetaPortada, archivo[1]);
            if (!fs.existsSync(destino)) return json(res, 404, { error: "No existe" });
            const tipos = { ".png": "image/png", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
            res.writeHead(200, { "Content-Type": tipos[path.extname(destino)] || "application/octet-stream", "Cache-Control": "public, max-age=3600" });
            if (metodo === "HEAD") return res.end();
            return fs.createReadStream(destino).pipe(res);
        }

        return json(res, 404, { error: "No existe" });
    }

    return {
        manejar,
        sesionDe,
        abrirSesion,
        cerrarSesion,
        googleListo,
        oidcListo,
        activo,
        deCorreo,
        // Al quitar a alguien del crew se le cierran sesiones y accesos al momento.
        revocarTodo(usuarioId) {
            datos().sesiones = datos().sesiones.filter((s) => s.usuario !== usuarioId);
            datos().tokensOidc = datos().tokensOidc.filter((t) => t.usuario !== usuarioId);
        },
    };
}
