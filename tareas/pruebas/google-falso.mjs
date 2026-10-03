// Google de mentira para probar: /auth redirige al instante con un código; /token devuelve un id_token.
//   node pruebas/google-falso.mjs [puerto]        (8412 si no se dice)
import http from "node:http";
const PUERTO = Number(process.argv[2]) || 8412;
let correo = "diego@example.com";
const codigos = new Map();
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PUERTO}`);
  if (url.pathname === "/usar") { correo = url.searchParams.get("correo"); res.end("ok"); return; }
  if (url.pathname === "/auth") {
    const code = Math.random().toString(36).slice(2);
    codigos.set(code, { correo, nonce: url.searchParams.get("nonce"), aud: url.searchParams.get("client_id"), prompt: url.searchParams.get("prompt") });
    const d = new URL(url.searchParams.get("redirect_uri"));
    d.searchParams.set("code", code); d.searchParams.set("state", url.searchParams.get("state"));
    res.writeHead(302, { Location: d.toString() }); res.end(); return;
  }
  if (url.pathname === "/token" && req.method === "POST") {
    let b = ""; for await (const t of req) b += t;
    const f = new URLSearchParams(b);
    const c = codigos.get(f.get("code"));
    if (!c || f.get("client_secret") !== "secreto-google") { res.writeHead(400, {"content-type":"application/json"}); res.end(JSON.stringify({error:"invalid_grant"})); return; }
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now()/1000);
    const nombre = c.correo.split("@")[0]; 
    const idt = b64({alg:"RS256"}) + "." + b64({ iss: "https://accounts.google.com", aud: c.aud, sub: "g-" + nombre, email: c.correo, email_verified: true, given_name: nombre.charAt(0).toUpperCase() + nombre.slice(1), name: nombre, nonce: c.nonce, iat: now, exp: now + 3600 }) + ".firma";
    res.writeHead(200, {"content-type":"application/json"}); res.end(JSON.stringify({ access_token: "g", id_token: idt, token_type: "Bearer" })); return;
  }
  res.writeHead(404); res.end();
}).listen(PUERTO, () => console.log(`google falso en ${PUERTO}`));
