// Prueba de conformidad: la oficina (WorkAdventure) entra por /cuentas usando la misma librería que
// usa WorkAdventure (openid-client 5) y de la misma forma (PKCE, parámetros extra, userinfo, revocar).
// Uso: node pruebas/oficina-oidc.mjs   (con el servidor en :3999 y el Google falso en :8412)
import { Issuer, generators } from "openid-client";

const EMISOR = "http://127.0.0.1:3999/cuentas";
const RED = "http://localhost:9999/openid-callback";
const falla = (m) => {
    console.error("FALLO:", m);
    process.exit(1);
};

await fetch("http://localhost:8412/usar?correo=admin@example.com");
const issuer = await Issuer.discover(EMISOR);
const client = new issuer.Client({ client_id: "oficina", client_secret: "secreto-oficina", redirect_uris: [RED], response_types: ["code"] });

// Igual que OpenIDClient.authorizationUrl de WorkAdventure
const verifier = generators.codeVerifier();
const state = generators.state();
const url = client.authorizationUrl({
    scope: "openid email profile ",
    prompt: "login",
    state,
    playUri: "http://localhost/~/hotspot/hq.wam",
    manuallyTriggered: "true",
    code_challenge: generators.codeChallenge(verifier),
    code_challenge_method: "S256",
});

// Navegador de mentira: sigue redirecciones guardando cookies, y pulsa «Entrar con Google».
const galletas = new Map();
async function ir(destino) {
    for (let i = 0; i < 12; i++) {
        const r = await fetch(destino, { redirect: "manual", headers: { cookie: [...galletas].map(([k, v]) => `${k}=${v}`).join("; ") } });
        for (const c of r.headers.getSetCookie()) {
            const [par] = c.split(";");
            const [k, ...v] = par.split("=");
            galletas.set(k.trim(), v.join("="));
        }
        const loc = r.headers.get("location");
        if (loc) {
            if (loc.startsWith(RED)) return loc;
            destino = new URL(loc, destino).toString();
            continue;
        }
        const html = await r.text();
        const m = /href="(\/cuentas\/google\/ir\?p=[^"]+)"/.exec(html);
        if (!m) falla(`página inesperada (${r.status}): ${html.slice(0, 200)}`);
        destino = new URL(m[1].replace(/&amp;/g, "&"), destino).toString();
    }
    falla("demasiadas redirecciones");
}
const vuelta = await ir(url);
const params = client.callbackParams(vuelta);
const tokenSet = await client.callback(RED, params, { code_verifier: verifier, state });
console.log("id_token verificado por openid-client:", tokenSet.claims().sub, tokenSet.claims().email);

// Igual que getUserInfo de WorkAdventure (con playUri en los parámetros)
const info = await client.userinfo(tokenSet, { params: { playUri: "http://localhost/~/hotspot/hq.wam" } });
if (!info.username || !info.email) falla("userinfo sin username/email");
console.log("userinfo:", info.username, info.email, info.tags);

// Igual que checkTokenAuth de WorkAdventure (en cada visita)
const otra = await client.userinfo(tokenSet.access_token);
if (otra.sub !== info.sub) falla("userinfo distinto");

// Igual que logoutUser de WorkAdventure
await client.revoke(tokenSet.access_token);
try {
    await client.userinfo(tokenSet.access_token);
    falla("el token sigue valiendo tras revocarlo");
} catch (e) {
    console.log("tras revocar:", e.name || e.message);
}
console.log("OK: la oficina puede entrar por /cuentas");
