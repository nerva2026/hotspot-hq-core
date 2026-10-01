// HOT SPOT S.L. · servidor propio de la oficina: portada, cuentas del crew y tablón de tareas.
//
//   /            portada (CREW o INVITADO)                          → carpeta portada/
//   /cuentas/    entrar con Google y proveedor de identidad         → servidor/crew.js
//   /tareas/     tablón de tareas (aplicación y API)                → carpeta publico/
//   /tareas/libro/   libro de cuentas de Don Balance (misma API)    → publico/libro/, servidor/libro.js
//   /tareas/pizarra/ pizarras compartidas (reuniones…)              → publico/pizarra/, servidor/pizarra.js
//   /tareas/oficina/ puente invisible de la oficina (para el mapa)  → publico/oficina/, publico/app/oficina.js
//                    tareas y cumpleaños de quien juega               (y /api/oficina: servidor/perfil.js)
//
// Sin dependencias: solo Node.
//
// Variables de entorno:
//   TAREAS_PUERTO   puerto (3000)
//   TAREAS_DATOS    carpeta de datos (/datos)
//   TAREAS_URL      dirección pública del tablón (https://oficina.hot-spot.es/tareas/)
//   TAREAS_BASE     ruta bajo la que se sirve el tablón (/tareas)
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET     cliente OAuth de Google (entrar con Google)
//   OIDC_SECRETO, OIDC_CLIENTE, OIDC_EMISOR    acceso de la oficina (WorkAdventure) a /cuentas
//   CREW_ADMIN      correo de Google del primer administrador
//   TAREAS_ZONA     zona horaria de la oficina, para saber qué día es hoy (Europe/Madrid)
//   TAREAS_HOY      SOLO PARA PRUEBAS: fija el día de hoy («2027-02-28») o el instante («2027-02-27T23:30:00Z»);
//                   con NODE_ENV=production (la imagen de Docker) se ignora
//
// Órdenes (dentro del contenedor):
//   node servidor/principal.js enlace   → imprime un enlace nuevo para dar de alta a alguien (con permisos
//                                          de administración); útil si se ha perdido el primero.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { abrirAlmacen } from "./almacen.js";
import * as cuentas from "./cuentas.js";
import { aplicarCambios, camposEnConflicto, crearTarea, publica, ErrorDeDatos, ESTADOS, NOMBRES_ESTADO, NOMBRES_PRIORIDAD, PRIORIDADES } from "./tareas.js";
import { crearExcel, leerExcel, fechaDeCelda } from "./excel.js";
import { crearCrew, correoValido, limpiarCorreo } from "./crew.js";
import * as libro from "./libro.js";
import { abrirPizarras, idValido as pizarraValida, COLORES_TRAZO, GROSORES, ANCHO as ANCHO_PIZARRA, ALTO as ALTO_PIZARRA } from "./pizarra.js";
import * as perfil from "./perfil.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLICO = path.join(RAIZ, "publico");
const PORTADA = path.join(RAIZ, "portada");
const PUERTO = Number(process.env.TAREAS_PUERTO || 3000);
const CARPETA_DATOS = process.env.TAREAS_DATOS || "/datos";
const BASE = (process.env.TAREAS_BASE || "/tareas").replace(/\/$/, "");
const URL_PUBLICA = process.env.TAREAS_URL || `http://localhost:${PUERTO}${BASE}/`;
const ARCHIVO_INTERNO = path.join(CARPETA_DATOS, ".interno");
const CARPETA_TIQUES = path.join(CARPETA_DATOS, "tiques");

// ---------- orden «enlace» (se ejecuta junto al servidor que ya está en marcha) ----------

if (process.argv[2] === "enlace") {
    const clave = fs.readFileSync(ARCHIVO_INTERNO, "utf8").trim();
    const r = await fetch(`http://127.0.0.1:${PUERTO}${BASE}/api/interno/enlace`, { method: "POST", headers: { "x-interno": clave } });
    const cuerpo = await r.json();
    if (!r.ok) {
        console.error(cuerpo.error || r.statusText);
        process.exit(1);
    }
    console.log(`\nEnlace para dar de alta a alguien en el tablón (sirve una vez, 7 días):\n\n  ${cuerpo.enlace}\n`);
    process.exit(0);
}

// ---------- arranque ----------

const almacen = abrirAlmacen(CARPETA_DATOS);
const datos = () => almacen.datos;
const pizarras = abrirPizarras(CARPETA_DATOS);
const crew = crearCrew({
    almacen,
    cuentas,
    carpetaDatos: CARPETA_DATOS,
    carpetaPortada: PORTADA,
    urlPublica: URL_PUBLICA,
    alCambiarUsuarios: () => emitir({ tipo: "usuarios", usuarios: datos().usuarios.map(cuentas.usuarioPublico) }),
});

// Qué día es hoy en la oficina (el servidor va en UTC). TAREAS_HOY es solo para las pruebas.
let ZONA = process.env.TAREAS_ZONA || perfil.ZONA_POR_DEFECTO;
if (!perfil.zonaValida(ZONA)) {
    console.error(`[tablón] TAREAS_ZONA=${ZONA} no es una zona horaria válida: se usa ${perfil.ZONA_POR_DEFECTO}.`);
    ZONA = perfil.ZONA_POR_DEFECTO;
}
// En la imagen de Docker (NODE_ENV=production) se ignora: así no se puede quedar la oficina parada en un día.
let HOY_FIJO = perfil.leerHoyFijo(process.env.TAREAS_HOY);
if (HOY_FIJO && process.env.NODE_ENV === "production") {
    console.error(`[tablón] TAREAS_HOY=${process.env.TAREAS_HOY} es solo para pruebas: con NODE_ENV=production no se usa.`);
    HOY_FIJO = null;
}
if (HOY_FIJO === undefined) console.error(`[tablón] TAREAS_HOY=${process.env.TAREAS_HOY} no se entiende (AAAA-MM-DD o AAAA-MM-DDTHH:MM:SSZ): no se usa.`);
const hoyOficina = () => perfil.hoyEnLaOficina(ZONA, HOY_FIJO || null);
if (HOY_FIJO) console.warn(`[tablón] OJO: TAREAS_HOY=${process.env.TAREAS_HOY} es solo para pruebas. Para la oficina, hoy es ${hoyOficina()} (${ZONA}).`);

const claveInterna = crypto.randomBytes(24).toString("hex");
const CLAVE_FALSA = await cuentas.cifrarClave(crypto.randomBytes(12).toString("hex"));
fs.writeFileSync(ARCHIVO_INTERNO, claveInterna, { mode: 0o600 });

function enlaceAlta(codigo) {
    return `${URL_PUBLICA}#alta=${codigo}`;
}

if (datos().usuarios.length === 0 && !crew.googleListo) {
    const codigo = cuentas.crearInvitacion(datos(), { tipo: "alta", admin: true });
    almacen.guardarYa();
    console.log("\n=============================================================");
    console.log(" Tablón de tareas de HOT SPOT S.L.: todavía no hay cuentas.");
    console.log(" Abre este enlace para crear la primera (sirve una vez, 7 días):");
    console.log(`\n   ${enlaceAlta(codigo)}\n`);
    console.log("=============================================================\n");
}

// ---------- tiempo real (Server-Sent Events) ----------

const oyentes = new Set(); // { res, usuario, sesion }

// Escribe a todos los que escuchan; si alguna conexión ya se cerró, se quita sin tumbar el servidor.
function escribirATodos(linea) {
    for (const o of [...oyentes]) {
        if (o.res.writableEnded || o.res.destroyed) {
            oyentes.delete(o);
            continue;
        }
        try {
            o.res.write(linea);
        } catch {
            oyentes.delete(o);
        }
    }
}

function emitir(evento, origen = null) {
    escribirATodos(`data: ${JSON.stringify({ ...evento, origen })}\n\n`);
}

// Lo de una pizarra (trazos, fotos, dónde está el lápiz de cada uno) solo a quien la tiene abierta.
function emitirPizarra(id, evento, origen = null) {
    const linea = `data: ${JSON.stringify({ ...evento, pizarra: id, origen })}\n\n`;
    for (const o of [...oyentes]) {
        if (o.pizarra !== id) continue;
        try {
            o.res.write(linea);
        } catch {
            oyentes.delete(o);
        }
    }
}

function avisarPresentes(id) {
    if (!id) return;
    const usuarios = [...new Set([...oyentes].filter((o) => o.pizarra === id).map((o) => o.usuario.id))];
    emitirPizarra(id, { tipo: "pizarra-presentes", usuarios });
}

function cerrarOyentes(condicion) {
    for (const o of [...oyentes]) {
        if (!condicion(o)) continue;
        oyentes.delete(o);
        try {
            o.res.end();
        } catch {
            /* ya estaba cerrada */
        }
    }
}

setInterval(() => escribirATodos(": sigo aquí\n\n"), 25000).unref();

setInterval(() => {
    if (cuentas.limpiarCaducadas(datos())) almacen.guardar();
    // Las tareas borradas se quedan 30 días en la papelera por si hay que recuperarlas.
    const limite = Date.now() - 30 * 24 * 3600 * 1000;
    const antes = datos().tareas.length;
    datos().tareas = datos().tareas.filter((t) => !t.borrada || Date.parse(t.borrada) > limite);
    if (datos().tareas.length !== antes) almacen.guardar();
    // Las pizarras: papelera y lo vaciado, 30 días; las fotos que ya no usa nadie, fuera.
    pizarras.limpiarViejo(limite);
    for (const archivo of pizarras.fotosHuerfanas()) fs.rm(path.join(pizarras.carpetaImagenes, archivo), { force: true }, () => {});
    // Lo mismo con los movimientos del libro de cuentas (y la foto de su tique).
    if (datos().libro) {
        const l = libro.libroDe(datos());
        const caducados = l.movimientos.filter((m) => m.borrado && Date.parse(m.borrado) <= limite);
        if (caducados.length) {
            for (const m of caducados) if (m.tique) borrarTique(m.tique.archivo);
            l.movimientos = l.movimientos.filter((m) => !caducados.includes(m));
            almacen.guardar();
        }
    }
}, 3600 * 1000).unref();

// ---------- utilidades HTTP ----------

const TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".json": "application/json; charset=utf-8",
};

const CSP =
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; " +
    "font-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'";

function cabecerasComunes(res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
}

function json(res, estado, cuerpo, extra = {}) {
    const texto = JSON.stringify(cuerpo);
    res.writeHead(estado, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra });
    res.end(texto);
}

const fallo = (res, estado, error) => json(res, estado, { error });

function leerCuerpo(req, limite) {
    return new Promise((resolver, rechazar) => {
        const trozos = [];
        let total = 0;
        req.on("data", (t) => {
            total += t.length;
            if (total > limite) {
                rechazar(Object.assign(new Error("Demasiado grande"), { estado: 413 }));
                req.destroy();
                return;
            }
            trozos.push(t);
        });
        req.on("end", () => resolver(Buffer.concat(trozos)));
        req.on("error", rechazar);
    });
}

async function leerJson(req) {
    const buf = await leerCuerpo(req, 1024 * 1024);
    if (!buf.length) return {};
    try {
        const v = JSON.parse(buf.toString("utf8"));
        return v && typeof v === "object" ? v : {};
    } catch {
        throw new ErrorDeDatos("Petición mal formada");
    }
}




const ipDe = (req) => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

// ---------- archivos de la aplicación ----------

function servirArchivo(req, res, ruta) {
    // Cada aplicación es una carpeta con su index.html: /tareas/ (el tablón), /tareas/libro/…
    const relativa = ruta.endsWith("/") ? `${ruta}index.html` : ruta;
    const archivo = path.normalize(path.join(PUBLICO, relativa));
    if (!archivo.startsWith(PUBLICO + path.sep)) return fallo(res, 404, "No existe");
    let info;
    try {
        info = fs.statSync(archivo);
    } catch {
        return fallo(res, 404, "No existe");
    }
    if (info.isDirectory() && fs.existsSync(path.join(archivo, "index.html"))) {
        res.writeHead(301, { Location: `${BASE}${ruta}/` });
        return res.end();
    }
    if (!info.isFile()) return fallo(res, 404, "No existe");
    const etag = `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
    const cabeceras = {
        "Content-Type": TIPOS[path.extname(archivo)] || "application/octet-stream",
        "Cache-Control": "no-cache",
        ETag: etag,
    };
    if (archivo.endsWith(".html")) cabeceras["Content-Security-Policy"] = CSP;
    if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, cabeceras);
        return res.end();
    }
    res.writeHead(200, { ...cabeceras, "Content-Length": info.size });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(archivo).pipe(res);
}

function servirPortada(req, res) {
    const archivo = path.join(PORTADA, "index.html");
    const contenido = fs.readFileSync(archivo);
    res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
        "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'self'; base-uri 'none'",
        "Content-Length": contenido.length,
    });
    if (req.method === "HEAD") return res.end();
    res.end(contenido);
}

// ---------- API ----------

function datosPara(usuario) {
    return {
        yo: { ...cuentas.usuarioPublico(usuario), tieneClave: Boolean(usuario.clave), email: usuario.email || null, libro: puedeVerLibro(usuario) },
        usuarios: datos().usuarios.map(cuentas.usuarioPublico),
        tareas: datos().tareas.filter((t) => !t.borrada).map(publica),
    };
}

function tocar(tarea, usuario) {
    tarea.actualizada = new Date().toISOString();
    tarea.actualizadaPor = usuario.id;
}

function exportar() {
    const nombre = (id) => datos().usuarios.find((u) => u.id === id)?.nombre || "";
    const orden = (t) => [ESTADOS.indexOf(t.estado), t.fin || "9999", PRIORIDADES.indexOf(t.prioridad ?? "") + 10, t.orden];
    const tareas = datos()
        .tareas.filter((t) => !t.borrada)
        .sort((a, b) => {
            const oa = orden(a);
            const ob = orden(b);
            for (let i = 0; i < oa.length; i++) if (oa[i] !== ob[i]) return oa[i] < ob[i] ? -1 : 1;
            return 0;
        });
    return crearExcel({
        hoja: "Tareas",
        columnas: [
            { titulo: "Tarea", ancho: 46, tipo: "largo" },
            { titulo: "Estado", ancho: 12 },
            { titulo: "Prioridad", ancho: 11 },
            { titulo: "Para quién", ancho: 18 },
            { titulo: "Pedido por", ancho: 13 },
            { titulo: "Inicio", ancho: 12, tipo: "fecha" },
            { titulo: "Para cuándo", ancho: 13, tipo: "fecha" },
            { titulo: "Etiquetas", ancho: 18 },
            { titulo: "Subtareas", ancho: 34, tipo: "largo" },
            { titulo: "Notas", ancho: 50, tipo: "largo" },
            { titulo: "Creada", ancho: 12, tipo: "fecha" },
            { titulo: "Hecha el", ancho: 12, tipo: "fecha" },
        ],
        filas: tareas.map((t) => [
            t.titulo,
            NOMBRES_ESTADO[t.estado],
            t.prioridad ? NOMBRES_PRIORIDAD[t.prioridad] : "",
            t.responsables.map(nombre).filter(Boolean).join(", "),
            nombre(t.pedidoPor),
            t.inicio,
            t.fin,
            t.etiquetas.map((e) => `#${e}`).join(" "),
            t.subtareas.map((s) => `${s.hecha ? "[x]" : "[ ]"} ${s.texto}`).join("\n"),
            t.notas,
            t.creada,
            t.hechaEl,
        ]),
    });
}

// Importa tareas desde un Excel: la hoja de Pendiente de Drive o una exportación del propio tablón.
function importar(buf, usuario) {
    const hojas = leerExcel(buf);
    const CAMPOS = {
        tarea: "titulo",
        titulo: "titulo",
        "para quien": "responsables",
        responsable: "responsables",
        responsables: "responsables",
        "pedido por": "pedidoPor",
        "para cuando": "fin",
        "fecha limite": "fin",
        fecha: "fin",
        fin: "fin",
        inicio: "inicio",
        estado: "estado",
        prioridad: "prioridad",
        importancia: "prioridad",
        notas: "notas",
        etiquetas: "etiquetas",
        subtareas: "subtareas",
    };
    const n = (v) => cuentas.normalizar(typeof v === "string" ? v.replace(/[¿?:]/g, "") : "");
    // Se elige la hoja «Pendiente» si existe; si no, la primera que tenga una columna «Tarea».
    const candidatas = [...hojas].sort((a, b) => (n(b.nombre) === "pendiente") - (n(a.nombre) === "pendiente"));
    let hoja = null;
    let filaCabecera = -1;
    let mapa = null;
    for (const h of candidatas) {
        for (let r = 0; r < Math.min(10, h.filas.length); r++) {
            const cab = h.filas[r].map((c) => CAMPOS[n(c)] || null);
            if (cab.includes("titulo")) {
                hoja = h;
                filaCabecera = r;
                mapa = cab;
                break;
            }
        }
        if (hoja) break;
    }
    if (!hoja) throw new ErrorDeDatos("No encuentro ninguna hoja con una columna «Tarea».");

    const usuarios = datos().usuarios;
    const porNombre = (texto) => {
        const t = n(texto);
        if (!t) return [];
        if (["los dos", "todos", "ambos", "los 2"].includes(t)) return usuarios.map((u) => u.id);
        return t
            .split(/\s*(?:,|;|\by\b|\/|&)\s*/)
            .map((trozo) => usuarios.find((u) => n(u.nombre) === trozo || n(u.nombre).startsWith(trozo))?.id)
            .filter(Boolean);
    };
    const estadoDe = (v) => {
        const t = n(v);
        if (!t) return "por-hacer";
        if (t.startsWith("hech") || t === "terminada" || t === "si") return "hecho";
        if (t.startsWith("en marcha") || t.startsWith("en curso") || t.startsWith("empezad")) return "en-marcha";
        if (t.startsWith("esper") || t.startsWith("bloque")) return "esperando";
        return "por-hacer";
    };
    const prioridadDe = (v) => {
        const t = n(v);
        return PRIORIDADES.find((p) => t.startsWith(p)) || null;
    };
    const existentes = new Set(datos().tareas.filter((t) => !t.borrada).map((t) => n(t.titulo)));
    let importadas = 0;
    let repetidas = 0;
    const nuevas = [];
    for (const fila of hoja.filas.slice(filaCabecera + 1)) {
        const campo = {};
        mapa.forEach((c, i) => {
            if (c && fila[i] !== null && fila[i] !== undefined && fila[i] !== "") campo[c] = fila[i];
        });
        const titulo = String(campo.titulo ?? "").trim();
        if (!titulo || /^ejemplo\b/i.test(titulo)) continue;
        if (existentes.has(n(titulo))) {
            repetidas += 1;
            continue;
        }
        const notas = [];
        if (campo.notas) notas.push(String(campo.notas));
        const responsables = porNombre(campo.responsables);
        if (campo.responsables && !responsables.length) notas.push(`Para: ${campo.responsables}`);
        const entrada = {
            titulo,
            estado: estadoDe(campo.estado),
            prioridad: prioridadDe(campo.prioridad),
            responsables,
            pedidoPor: porNombre(campo.pedidoPor)[0] || null,
            inicio: fechaDeCelda(campo.inicio),
            fin: fechaDeCelda(campo.fin),
            etiquetas: String(campo.etiquetas ?? "")
                .split(/[\s,]+/)
                .map((e) => e.replace(/^#/, ""))
                .filter(Boolean),
            subtareas: String(campo.subtareas ?? "")
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l) => ({ texto: l.replace(/^\[[ xX]\]\s*/, ""), hecha: /^\[[xX]\]/.test(l) })),
            notas: notas.join("\n\n"),
        };
        try {
            const tarea = crearTarea(entrada, usuario, datos());
            if (!campo.pedidoPor) tarea.pedidoPor = null;
            if (tarea.estado === "hecho") tarea.hechaEl = new Date().toISOString();
            datos().tareas.push(tarea);
            nuevas.push(tarea);
            existentes.add(n(titulo));
            importadas += 1;
        } catch (error) {
            if (!(error instanceof ErrorDeDatos)) throw error;
        }
    }
    return { importadas, repetidas, hoja: hoja.nombre, nuevas };
}

// ---------- libro de cuentas ----------

// Fotos o PDF del tique de un gasto: se guardan en datos/tiques/ y solo se sirven al crew.
const TIPOS_TIQUE = [
    { tipo: "image/jpeg", ext: "jpg", firma: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { tipo: "image/png", ext: "png", firma: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    { tipo: "image/webp", ext: "webp", firma: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
    { tipo: "application/pdf", ext: "pdf", firma: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
];
const MAXIMO_TIQUE = 12 * 1024 * 1024;

const TIPOS_FOTO_PIZARRA = [
    ...TIPOS_TIQUE.filter((t) => t.tipo !== "application/pdf"),
    { tipo: "image/gif", ext: "gif", firma: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
];
const MAXIMO_FOTO_PIZARRA = 10 * 1024 * 1024;
const vivoPorUsuario = new Map();

function borrarTique(archivo) {
    if (!/^[\w-]+\.(jpg|png|webp|pdf)$/.test(archivo || "")) return;
    fs.rm(path.join(CARPETA_TIQUES, archivo), { force: true }, () => {});
}

function puedeVerLibro(usuario) {
    if (!usuario || usuario.baja) return false;
    return Boolean(usuario.admin) || (libro.partesDe(datos())[usuario.id] || 0) > 0;
}

function datosLibro(usuario) {
    const l = libro.libroDe(datos());
    return {
        yo: { ...cuentas.usuarioPublico(usuario), tieneClave: Boolean(usuario.clave), email: usuario.email || null },
        usuarios: datos().usuarios.map(cuentas.usuarioPublico),
        partes: libro.partesDe(datos()),
        partesFijas: Boolean(l.partes),
        categorias: l.categorias,
        movimientos: libro.ordenar(l.movimientos.filter((m) => !m.borrado)).map(libro.publico),
        resumen: libro.resumen(l, datos().usuarios),
    };
}

function excelLibro() {
    const l = libro.libroDe(datos());
    const nombre = (id) => datos().usuarios.find((u) => u.id === id)?.nombre || "";
    const r = libro.resumen(l, datos().usuarios);
    const e = (c) => c / 100;
    return crearExcel({
        hojas: [
            {
                nombre: "Movimientos",
                columnas: [
                    { titulo: "Fecha", ancho: 12, tipo: "fecha" },
                    { titulo: "Tipo", ancho: 10 },
                    { titulo: "Concepto", ancho: 40, tipo: "largo" },
                    { titulo: "Categoría", ancho: 20 },
                    { titulo: "Quién", ancho: 14 },
                    { titulo: "Para quién", ancho: 14 },
                    { titulo: "Importe (€)", ancho: 14, tipo: "euros" },
                    { titulo: "Notas", ancho: 40, tipo: "largo" },
                    { titulo: "Tique", ancho: 8 },
                ],
                filas: libro.ordenar(l.movimientos.filter((m) => !m.borrado)).map((m) => [
                    m.fecha,
                    libro.NOMBRES_TIPO[m.tipo],
                    m.tipo === "pago" ? m.concepto || "Pago" : m.concepto,
                    m.categoria,
                    nombre(m.persona),
                    nombre(m.para),
                    e(m.importe),
                    m.notas,
                    m.tique ? "Sí" : "",
                ]),
            },
            {
                nombre: "Balance",
                columnas: [
                    { titulo: "Persona", ancho: 16 },
                    { titulo: "Parte", ancho: 9, tipo: "porcentaje" },
                    { titulo: "Ha pagado", ancho: 13, tipo: "euros" },
                    { titulo: "Le toca pagar", ancho: 14, tipo: "euros" },
                    { titulo: "Ha cobrado", ancho: 13, tipo: "euros" },
                    { titulo: "Le corresponde", ancho: 15, tipo: "euros" },
                    { titulo: "Pagos hechos", ancho: 13, tipo: "euros" },
                    { titulo: "Pagos recibidos", ancho: 15, tipo: "euros" },
                    { titulo: "Balance", ancho: 13, tipo: "euros" },
                ],
                filas: [
                    ...r.personas.map((p) => [nombre(p.id), p.parte, e(p.haPagado), e(p.leToca), e(p.haCobrado), e(p.leCorresponde), e(p.pagosHechos), e(p.pagosRecibidos), e(p.balance)]),
                    [],
                    ["Total gastado", null, e(r.totalGastos)],
                    ["Total ingresado", null, e(r.totalIngresos)],
                    ["Balance: positivo = se le debe dinero; negativo = debe dinero."],
                    ...r.deudas.map((d) => [`${nombre(d.de)} le debe ${(d.importe / 100).toFixed(2).replace(".", ",")} € a ${nombre(d.a)}.`]),
                ],
            },
            {
                nombre: "Por categoría",
                columnas: [
                    { titulo: "Categoría", ancho: 24 },
                    { titulo: "Gastado", ancho: 14, tipo: "euros" },
                ],
                filas: r.porCategoria.map((c) => [c.categoria, e(c.total)]),
            },
        ],
    });
}

async function api(req, res, ruta) {
    const metodo = req.method;
    const encontrada = crew.sesionDe(req);
    const usuario = encontrada?.usuario || null;
    const origen = typeof req.headers["x-cliente"] === "string" ? req.headers["x-cliente"].slice(0, 40) : null;

    // Toda petición que cambia algo debe llevar la cabecera propia del tablón: un formulario de otra web
    // no puede ponerla, así que nadie puede hacer cambios «en tu nombre» desde fuera.
    if (metodo !== "GET" && metodo !== "HEAD" && ruta !== "/api/interno/enlace" && req.headers["x-tablon"] !== "1") {
        return fallo(res, 403, "Petición no permitida");
    }

    // --- sin sesión ---
    if (ruta === "/api/interno/enlace" && metodo === "POST") {
        const ip = req.socket.remoteAddress || "";
        if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip) || req.headers["x-interno"] !== claveInterna) {
            return fallo(res, 403, "Petición no permitida");
        }
        const codigo = cuentas.crearInvitacion(datos(), { tipo: "alta", admin: true });
        almacen.guardar();
        return json(res, 200, { enlace: enlaceAlta(codigo) });
    }

    if (ruta === "/api/acceso" && metodo === "GET") return json(res, 200, { google: crew.googleListo });

    if (ruta === "/api/entrar" && metodo === "POST") {
        const ip = ipDe(req);
        if (cuentas.demasiadosFallos(ip)) return fallo(res, 429, "Demasiados intentos. Prueba otra vez dentro de un rato.");
        const { nombre, clave } = await leerJson(req);
        const quien = datos().usuarios.find((u) => cuentas.normalizar(u.nombre) === cuentas.normalizar(nombre));
        // Si el nombre no existe se hace la misma cuenta igualmente, para no dar pistas por el tiempo de respuesta.
        const bien = (await cuentas.comprobarClave(String(clave || ""), quien ? quien.clave : CLAVE_FALSA)) && Boolean(quien);
        if (!bien) {
            cuentas.apuntarFallo(ip);
            return fallo(res, 401, "Nombre o contraseña incorrectos.");
        }
        cuentas.olvidarFallos(ip);
        crew.abrirSesion(res, quien);
        almacen.guardar();
        return json(res, 200, datosPara(quien));
    }

    if (ruta === "/api/invitacion" && metodo === "GET") {
        const codigo = new URL(req.url, "http://x").searchParams.get("codigo");
        const inv = cuentas.buscarInvitacion(datos(), codigo);
        if (!inv) return fallo(res, 404, "Este enlace ya no sirve: se ha usado o ha caducado. Pide uno nuevo.");
        const persona = inv.tipo === "clave" ? datos().usuarios.find((u) => u.id === inv.usuario) : null;
        return json(res, 200, {
            tipo: inv.tipo,
            nombre: persona?.nombre || null,
            colores: cuentas.COLORES,
            ocupados: datos().usuarios.map((u) => u.color),
            primera: datos().usuarios.length === 0,
        });
    }

    if (ruta === "/api/alta" && metodo === "POST") {
        const ip = ipDe(req);
        if (cuentas.demasiadosFallos(ip)) return fallo(res, 429, "Demasiados intentos. Prueba otra vez dentro de un rato.");
        const { codigo, nombre, clave, color } = await leerJson(req);
        const inv = cuentas.buscarInvitacion(datos(), codigo);
        if (!inv) {
            cuentas.apuntarFallo(ip);
            return fallo(res, 404, "Este enlace ya no sirve: se ha usado o ha caducado. Pide uno nuevo.");
        }
        const errorClave = cuentas.validarClave(clave);
        if (errorClave) return fallo(res, 400, errorClave);
        let persona;
        if (inv.tipo === "clave") {
            persona = datos().usuarios.find((u) => u.id === inv.usuario);
            persona.clave = await cuentas.cifrarClave(clave);
            // Una contraseña nueva cierra las sesiones abiertas en otros sitios.
            datos().sesiones = datos().sesiones.filter((s) => s.usuario !== persona.id);
        } else {
            const v = cuentas.validarNombre(nombre, datos().usuarios);
            if (v.error) return fallo(res, 400, v.error);
            persona = cuentas.nuevoUsuario(datos(), {
                nombre: v.nombre,
                color,
                admin: inv.admin || datos().usuarios.length === 0,
                clave: await cuentas.cifrarClave(clave),
            });
            emitir({ tipo: "usuarios", usuarios: datos().usuarios.map(cuentas.usuarioPublico) });
        }
        cuentas.gastarInvitacion(datos(), inv);
        crew.abrirSesion(res, persona);
        almacen.guardar();
        return json(res, 200, datosPara(persona));
    }

    // --- con sesión ---
    if (!usuario) return fallo(res, 401, "Tienes que entrar con tu cuenta.");

    if (ruta === "/api/salir" && metodo === "POST") {
        crew.cerrarSesion(req, res);
        almacen.guardar();
        cerrarOyentes((o) => o.sesion === encontrada.sesion);
        return json(res, 200, { ok: true });
    }

    // --- el crew: quién puede entrar con Google (solo administración) ---
    if (ruta === "/api/crew" && metodo === "GET") {
        if (!usuario.admin) return fallo(res, 403, "Solo quien administra puede ver el crew.");
        return json(res, 200, {
            google: crew.googleListo,
            crew: datos().usuarios.map((u) => ({
                ...cuentas.usuarioPublico(u),
                email: u.email || null,
                entradoEl: u.entradoEl || null,
                tieneClave: Boolean(u.clave),
            })),
        });
    }
    if (ruta === "/api/crew" && metodo === "POST") {
        if (!usuario.admin) return fallo(res, 403, "Solo quien administra puede añadir gente al crew.");
        const { nombre, email, admin } = await leerJson(req);
        const correo = limpiarCorreo(email);
        if (!correoValido(correo)) return fallo(res, 400, "Ese correo no parece válido.");
        const existente = datos().usuarios.find((u) => u.email === correo);
        if (existente && !existente.baja) return fallo(res, 400, `Ese correo ya es de ${existente.nombre}.`);
        let persona = existente;
        if (persona) {
            persona.baja = false; // vuelve al crew
        } else {
            const provisional = !String(nombre || "").trim();
            const base = provisional ? correo.split("@")[0].replace(/[._-]+/g, " ").replace(/^./, (c) => c.toUpperCase()) : nombre;
            const v = cuentas.validarNombre(base, datos().usuarios);
            if (v.error) return fallo(res, 400, provisional ? "Ponle un nombre (el que sale del correo ya existe)." : v.error);
            persona = cuentas.nuevoUsuario(datos(), { nombre: v.nombre, admin: Boolean(admin), clave: null });
            persona.email = correo;
            persona.nombreProvisional = provisional;
        }
        if (admin !== undefined) persona.admin = Boolean(admin);
        almacen.guardar();
        emitir({ tipo: "usuarios", usuarios: datos().usuarios.map(cuentas.usuarioPublico) });
        return json(res, 201, { id: persona.id });
    }
    const mc = /^\/api\/crew\/([\w-]+)$/.exec(ruta);
    if (mc && metodo === "PATCH") {
        if (!usuario.admin) return fallo(res, 403, "Solo quien administra puede cambiar el crew.");
        const persona = datos().usuarios.find((u) => u.id === mc[1]);
        if (!persona) return fallo(res, 404, "No existe esa persona.");
        const cambios = await leerJson(req);
        const adminsActivos = datos().usuarios.filter((u) => u.admin && !u.baja && u.id !== persona.id).length;
        if ("email" in cambios) {
            const correo = limpiarCorreo(cambios.email);
            if (correo && !correoValido(correo)) return fallo(res, 400, "Ese correo no parece válido.");
            const otro = correo && datos().usuarios.find((u) => u.email === correo && u.id !== persona.id);
            if (otro) return fallo(res, 400, `Ese correo ya es de ${otro.nombre}.`);
            persona.email = correo || null;
        }
        if ("nombre" in cambios) {
            const v = cuentas.validarNombre(cambios.nombre, datos().usuarios, persona.id);
            if (v.error) return fallo(res, 400, v.error);
            persona.nombre = v.nombre;
            persona.nombreProvisional = false;
        }
        if ("admin" in cambios) {
            if (!cambios.admin && !adminsActivos) return fallo(res, 400, "Tiene que quedar al menos una persona que administre.");
            persona.admin = Boolean(cambios.admin);
        }
        if ("baja" in cambios) {
            if (cambios.baja && persona.id === usuario.id) return fallo(res, 400, "No puedes sacarte a ti del crew.");
            if (cambios.baja && persona.admin && !adminsActivos) return fallo(res, 400, "Tiene que quedar al menos una persona que administre.");
            persona.baja = Boolean(cambios.baja);
            if (persona.baja) {
                // Fuera del crew: se le cierran la oficina y el tablón al momento.
                crew.revocarTodo(persona.id);
                cerrarOyentes((o) => o.usuario.id === persona.id);
            }
        }
        almacen.guardar();
        emitir({ tipo: "usuarios", usuarios: datos().usuarios.map(cuentas.usuarioPublico) });
        return json(res, 200, { ok: true });
    }

    if (ruta === "/api/datos" && metodo === "GET") return json(res, 200, datosPara(usuario));

    if (ruta === "/api/eventos" && metodo === "GET") {
        res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        });
        res.write("retry: 3000\n\n");
        const pizarra = new URL(req.url, "http://x").searchParams.get("pizarra");
        const oyente = { res, usuario, sesion: encontrada.sesion, pizarra: pizarraValida(pizarra) ? pizarra : null };
        oyentes.add(oyente);
        let fuera = false;
        const quitar = () => {
            if (fuera) return;
            fuera = true;
            oyentes.delete(oyente);
            avisarPresentes(oyente.pizarra);
        };
        req.on("close", quitar);
        res.on("close", quitar);
        res.on("error", quitar);
        avisarPresentes(oyente.pizarra);
        return;
    }

    if (ruta === "/api/yo" && metodo === "PATCH") {
        const { color, clave, claveActual, nombre, cumple } = await leerJson(req);
        // El cumpleaños se comprueba antes de cambiar nada: «MM-DD», o null para quitarlo.
        const cumpleNuevo = cumple === undefined ? undefined : perfil.validarCumple(cumple);
        if (color !== undefined) {
            if (!cuentas.COLORES.includes(color)) return fallo(res, 400, "Color no válido");
            usuario.color = color;
        }
        if (nombre !== undefined) {
            const v = cuentas.validarNombre(nombre, datos().usuarios, usuario.id);
            if (v.error) return fallo(res, 400, v.error);
            usuario.nombre = v.nombre;
        }
        if (clave !== undefined) {
            if (!(await cuentas.comprobarClave(String(claveActual || ""), usuario.clave))) return fallo(res, 400, "La contraseña actual no es correcta.");
            const e = cuentas.validarClave(clave);
            if (e) return fallo(res, 400, e);
            usuario.clave = await cuentas.cifrarClave(clave);
        }
        if (cumpleNuevo) usuario.cumple = cumpleNuevo;
        else if (cumpleNuevo === null) delete usuario.cumple;
        almacen.guardar();
        emitir({ tipo: "usuarios", usuarios: datos().usuarios.map(cuentas.usuarioPublico) });
        return json(res, 200, { yo: cuentas.usuarioPublico(usuario) });
    }

    // --- la oficina: cumpleaños de hoy y de los próximos 30 días (para el mapa, los paneles y el tablón) ---
    if (ruta === "/api/oficina" && metodo === "GET") return json(res, 200, perfil.resumenOficina(datos().usuarios, hoyOficina()));

    // --- el personaje de cada uno en la oficina (WorkAdventure lo guarda aquí para tenerlo en todos sus aparatos) ---
    if (ruta === "/api/yo/personaje" && metodo === "GET") return json(res, 200, perfil.personajeDe(usuario));
    if (ruta === "/api/yo/personaje" && metodo === "PUT") {
        const { texturas, companero } = perfil.validarPersonaje(await leerJson(req));
        usuario.personaje = { texturas, companero, actualizado: new Date().toISOString() };
        almacen.guardar();
        return json(res, 200, perfil.personajeDe(usuario));
    }

    if (ruta === "/api/invitar" && metodo === "POST") {
        if (!usuario.admin) return fallo(res, 403, "Solo quien administra el tablón puede invitar.");
        const { tipo = "alta", persona } = await leerJson(req);
        if (tipo === "clave") {
            if (!datos().usuarios.some((u) => u.id === persona)) return fallo(res, 404, "No existe esa persona.");
            const codigo = cuentas.crearInvitacion(datos(), { tipo: "clave", usuario: persona, creadaPor: usuario.id });
            almacen.guardar();
            return json(res, 200, { codigo });
        }
        const codigo = cuentas.crearInvitacion(datos(), { tipo: "alta", admin: true, creadaPor: usuario.id });
        almacen.guardar();
        return json(res, 200, { codigo });
    }

    if (ruta === "/api/excel" && metodo === "GET") {
        const hoy = new Date().toISOString().slice(0, 10);
        const buf = exportar();
        res.writeHead(200, {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="Tareas HOT SPOT ${hoy}.xlsx"; filename*=UTF-8''Tareas%20HOT%20SPOT%20${hoy}.xlsx`,
            "Content-Length": buf.length,
            "Cache-Control": "no-store",
        });
        return res.end(buf);
    }

    if (ruta === "/api/importar" && metodo === "POST") {
        const buf = await leerCuerpo(req, 15 * 1024 * 1024);
        let resultado;
        try {
            resultado = importar(buf, usuario);
        } catch (error) {
            if (error instanceof ErrorDeDatos) throw error;
            throw new ErrorDeDatos(`No he podido leer ese Excel (${error.message}).`);
        }
        almacen.guardar();
        for (const t of resultado.nuevas) emitir({ tipo: "tarea", tarea: publica(t), autor: usuario.id }, origen);
        return json(res, 200, { importadas: resultado.importadas, repetidas: resultado.repetidas, hoja: resultado.hoja, tareas: resultado.nuevas.map(publica) });
    }

    if (ruta === "/api/tareas" && metodo === "POST") {
        const tarea = crearTarea(await leerJson(req), usuario, datos());
        datos().tareas.push(tarea);
        almacen.guardar();
        emitir({ tipo: "tarea", tarea: publica(tarea), autor: usuario.id }, origen);
        return json(res, 201, publica(tarea));
    }

    const m = /^\/api\/tareas\/([\w-]+)(\/restaurar)?$/.exec(ruta);
    if (m) {
        const tarea = datos().tareas.find((t) => t.id === m[1]);
        if (!tarea) return fallo(res, 404, "Esa tarea no existe.");
        if (m[2] && metodo === "POST") {
            tarea.borrada = null;
            tocar(tarea, usuario);
            almacen.guardar();
            emitir({ tipo: "tarea", tarea: publica(tarea), autor: usuario.id }, origen);
            return json(res, 200, publica(tarea));
        }
        if (tarea.borrada) return fallo(res, 404, "Esa tarea está borrada.");
        if (metodo === "PATCH") {
            const cambios = await leerJson(req);
            // Sin ningún «await» entre comprobar y aplicar: de dos guardados a la vez, el primero se guarda y el segundo recibe esto.
            const choque = camposEnConflicto(tarea, cambios);
            if (choque.length) return json(res, 409, { error: "Otra persona cambió las notas antes.", conflicto: choque, tarea: publica(tarea) });
            const cambiados = aplicarCambios(tarea, cambios, datos().usuarios);
            if (!tarea.titulo) throw new ErrorDeDatos("La tarea necesita un título");
            if (cambiados.length) {
                tocar(tarea, usuario);
                almacen.guardar();
                emitir({ tipo: "tarea", tarea: publica(tarea), autor: usuario.id, cambiados }, origen);
            }
            return json(res, 200, publica(tarea));
        }
        if (metodo === "DELETE") {
            tarea.borrada = new Date().toISOString();
            tocar(tarea, usuario);
            almacen.guardar();
            emitir({ tipo: "borrada", id: tarea.id, autor: usuario.id }, origen);
            return json(res, 200, { ok: true });
        }
    }

    // --- libro de cuentas (Don Balance) ---
    // Son las cuentas de los socios: solo las ven quienes tienen parte en el reparto y quien administra.
    if (ruta.startsWith("/api/libro") && !puedeVerLibro(usuario)) {
        return fallo(res, 403, "El libro de cuentas solo lo ven quienes tienen parte en el reparto. Si te hace falta, pídeselo a quien administra el tablón.");
    }
    if (ruta === "/api/libro" && metodo === "GET") return json(res, 200, datosLibro(usuario));

    if (ruta === "/api/libro/movimientos" && metodo === "POST") {
        const m = libro.crearMovimiento(await leerJson(req), usuario, datos());
        libro.fijarPartes(datos());
        libro.libroDe(datos()).movimientos.push(m);
        almacen.guardar();
        emitir({ tipo: "libro", autor: usuario.id }, origen);
        return json(res, 201, libro.publico(m));
    }

    const ml = /^\/api\/libro\/movimientos\/([\w-]+)(\/restaurar|\/tique)?$/.exec(ruta);
    if (ml) {
        const m = libro.libroDe(datos()).movimientos.find((x) => x.id === ml[1]);
        if (!m) return fallo(res, 404, "Ese movimiento no existe.");
        const tocarMovimiento = () => {
            m.actualizado = new Date().toISOString();
            m.actualizadoPor = usuario.id;
            almacen.guardar();
            emitir({ tipo: "libro", autor: usuario.id }, origen);
        };
        if (ml[2] === "/restaurar" && metodo === "POST") {
            m.borrado = null;
            tocarMovimiento();
            return json(res, 200, libro.publico(m));
        }
        if (m.borrado) return fallo(res, 404, "Ese movimiento está borrado.");
        if (ml[2] === "/tique" && metodo === "POST") {
            const buf = await leerCuerpo(req, MAXIMO_TIQUE);
            const tipo = TIPOS_TIQUE.find((t) => buf.length > 12 && t.firma(buf));
            if (!tipo) throw new ErrorDeDatos("El tique tiene que ser una foto (JPG, PNG o WebP) o un PDF.");
            fs.mkdirSync(CARPETA_TIQUES, { recursive: true });
            const archivo = `${m.id}-${crypto.randomBytes(4).toString("hex")}.${tipo.ext}`;
            fs.writeFileSync(path.join(CARPETA_TIQUES, archivo), buf);
            if (m.tique) borrarTique(m.tique.archivo);
            let nombreOriginal = "";
            try {
                nombreOriginal = decodeURIComponent(String(req.headers["x-nombre"] || "")).slice(0, 120);
            } catch {
                /* nombre mal escrito: se queda sin nombre */
            }
            m.tique = { archivo, tipo: tipo.tipo, tamano: buf.length, nombre: nombreOriginal };
            tocarMovimiento();
            return json(res, 200, libro.publico(m));
        }
        if (ml[2] === "/tique" && metodo === "DELETE") {
            if (m.tique) borrarTique(m.tique.archivo);
            m.tique = null;
            tocarMovimiento();
            return json(res, 200, libro.publico(m));
        }
        if (!ml[2] && metodo === "PATCH") {
            const cambiados = libro.aplicarCambios(m, await leerJson(req), datos());
            if (cambiados.length) tocarMovimiento();
            return json(res, 200, libro.publico(m));
        }
        if (!ml[2] && metodo === "DELETE") {
            m.borrado = new Date().toISOString();
            tocarMovimiento();
            return json(res, 200, { ok: true });
        }
    }

    const mt = /^\/api\/libro\/tiques\/([\w-]+\.(jpg|png|webp|pdf))$/.exec(ruta);
    if (mt && (metodo === "GET" || metodo === "HEAD")) {
        const m = libro.libroDe(datos()).movimientos.find((x) => x.tique?.archivo === mt[1]);
        if (!m) return fallo(res, 404, "Ese tique no existe.");
        let info;
        try {
            info = fs.statSync(path.join(CARPETA_TIQUES, mt[1]));
        } catch {
            return fallo(res, 404, "Ese tique no existe.");
        }
        const cabeceras = { "Content-Type": m.tique.tipo, "Content-Length": info.size, "Cache-Control": "private, max-age=3600", "Content-Disposition": "inline" };
        // Una foto no necesita ejecutar nada: si alguien sube algo raro, el navegador no lo ejecuta en nuestra web.
        if (m.tique.tipo !== "application/pdf") cabeceras["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src 'self'";
        res.writeHead(200, cabeceras);
        if (metodo === "HEAD") return res.end();
        return fs.createReadStream(path.join(CARPETA_TIQUES, mt[1])).pipe(res);
    }

    if (ruta === "/api/libro/ajustes" && metodo === "PATCH") {
        if (!usuario.admin) return fallo(res, 403, "Solo quien administra puede cambiar las partes y las categorías.");
        const { partes, categorias } = await leerJson(req);
        const l = libro.libroDe(datos());
        if (partes !== undefined) l.partes = libro.partesValidas(partes, datos().usuarios);
        if (categorias !== undefined) l.categorias = libro.categoriasValidas(categorias);
        almacen.guardar();
        emitir({ tipo: "libro", autor: usuario.id }, origen);
        return json(res, 200, datosLibro(usuario));
    }

    if (ruta === "/api/libro/csv" && metodo === "GET") {
        const hoy = new Date().toISOString().slice(0, 10);
        const texto = Buffer.from(libro.csv(libro.libroDe(datos()), datos().usuarios), "utf8");
        res.writeHead(200, {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="Cuentas HOT SPOT ${hoy}.csv"; filename*=UTF-8''Cuentas%20HOT%20SPOT%20${hoy}.csv`,
            "Content-Length": texto.length,
            "Cache-Control": "no-store",
        });
        return res.end(texto);
    }

    if (ruta === "/api/libro/excel" && metodo === "GET") {
        const hoy = new Date().toISOString().slice(0, 10);
        const buf = excelLibro();
        res.writeHead(200, {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="Cuentas HOT SPOT ${hoy}.xlsx"; filename*=UTF-8''Cuentas%20HOT%20SPOT%20${hoy}.xlsx`,
            "Content-Length": buf.length,
            "Cache-Control": "no-store",
        });
        return res.end(buf);
    }

    if (ruta === "/api/libro/importar" && metodo === "POST") {
        const buf = await leerCuerpo(req, 15 * 1024 * 1024);
        let hojas;
        try {
            hojas = leerExcel(buf);
        } catch (error) {
            throw new ErrorDeDatos(`No he podido leer ese Excel (${error.message}).`);
        }
        const r = libro.importar(hojas, usuario, datos(), cuentas.normalizar, fechaDeCelda);
        almacen.guardar();
        if (r.importados) emitir({ tipo: "libro", autor: usuario.id }, origen);
        return json(res, 200, { importados: r.importados, repetidos: r.repetidos, sinPersona: r.sinPersona, hoja: r.hoja });
    }

    // --- pizarras ---
    if (ruta === "/api/pizarras" && metodo === "GET") return json(res, 200, { pizarras: pizarras.lista() });

    const mf = /^\/api\/pizarras\/imagenes\/([\w-]+\.(jpg|png|webp|gif))$/.exec(ruta);
    if (mf && (metodo === "GET" || metodo === "HEAD")) {
        if (!pizarras.tieneImagen(mf[1])) return fallo(res, 404, "Esa foto no está en ninguna pizarra.");
        const archivo = path.join(pizarras.carpetaImagenes, mf[1]);
        let info;
        try {
            info = fs.statSync(archivo);
        } catch {
            return fallo(res, 404, "Esa foto no existe.");
        }
        const tipo = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[mf[2]];
        res.writeHead(200, { "Content-Type": tipo, "Content-Length": info.size, "Cache-Control": "private, max-age=86400, immutable", "Content-Security-Policy": "sandbox; default-src 'none'" });
        if (metodo === "HEAD") return res.end();
        return fs.createReadStream(archivo).pipe(res);
    }

    const mp = /^\/api\/pizarras\/([a-z0-9-]{1,30})(?:\/(elementos|quitar|restaurar|vaciar|recuperar|imagenes|vivo)(?:\/([\w-]{8,24}))?)?$/.exec(ruta);
    if (mp) {
        const [, id, accion, idElemento] = mp;
        const avisar = (evento) => emitirPizarra(id, { ...evento, autor: usuario.id }, origen);
        if (!accion && metodo === "GET") {
            return json(res, 200, {
                pizarra: pizarras.ver(id),
                yo: { ...cuentas.usuarioPublico(usuario), libro: puedeVerLibro(usuario) },
                usuarios: datos().usuarios.map(cuentas.usuarioPublico),
                presentes: [...new Set([...oyentes].filter((o) => o.pizarra === id).map((o) => o.usuario.id))],
            });
        }
        if (accion === "elementos" && !idElemento && metodo === "POST") {
            const e = pizarras.anadir(id, await leerJson(req), usuario);
            avisar({ tipo: "pizarra", accion: "poner", elementos: [e] });
            return json(res, 201, e);
        }
        if (accion === "elementos" && idElemento && metodo === "PATCH") {
            const e = pizarras.cambiar(id, idElemento, await leerJson(req), usuario);
            avisar({ tipo: "pizarra", accion: "cambiar", elementos: [e] });
            return json(res, 200, e);
        }
        if (accion === "quitar" && metodo === "POST") {
            const { ids } = await leerJson(req);
            const quitados = pizarras.quitar(id, Array.isArray(ids) ? ids.slice(0, 500) : [], usuario);
            if (quitados.length) avisar({ tipo: "pizarra", accion: "quitar", ids: quitados });
            return json(res, 200, { ids: quitados });
        }
        if (accion === "restaurar" && metodo === "POST") {
            const { ids } = await leerJson(req);
            const vueltos = pizarras.restaurar(id, Array.isArray(ids) ? ids.slice(0, 500) : [], usuario);
            if (vueltos.length) avisar({ tipo: "pizarra", accion: "poner", elementos: vueltos });
            return json(res, 200, { elementos: vueltos });
        }
        if (accion === "vaciar" && metodo === "POST") {
            if (pizarras.vaciar(id, usuario)) avisar({ tipo: "pizarra", accion: "vaciar" });
            return json(res, 200, { ok: true });
        }
        if (accion === "recuperar" && metodo === "POST") {
            const elementos = pizarras.recuperar(id, usuario);
            avisar({ tipo: "pizarra", accion: "todo", elementos });
            return json(res, 200, { elementos });
        }
        if (accion === "imagenes" && metodo === "POST") {
            const buf = await leerCuerpo(req, MAXIMO_FOTO_PIZARRA);
            const tipo = TIPOS_FOTO_PIZARRA.find((t) => buf.length > 12 && t.firma(buf));
            if (!tipo) throw new ErrorDeDatos("Solo se pueden pegar fotos (JPG, PNG, WebP o GIF).");
            const cabecera = (n) => req.headers[`x-${n}`];
            const idNuevo = String(cabecera("id") || "");
            fs.mkdirSync(pizarras.carpetaImagenes, { recursive: true });
            const archivo = `${/^[\w-]{8,24}$/.test(idNuevo) ? idNuevo : crypto.randomBytes(6).toString("hex")}-${crypto.randomBytes(4).toString("hex")}.${tipo.ext}`;
            fs.writeFileSync(path.join(pizarras.carpetaImagenes, archivo), buf);
            let e;
            try {
                e = pizarras.anadirImagen(id, { archivo, x: cabecera("x"), y: cabecera("y"), ancho: cabecera("ancho"), alto: cabecera("alto"), idElemento: idNuevo }, usuario);
            } catch (error) {
                fs.rm(path.join(pizarras.carpetaImagenes, archivo), { force: true }, () => {});
                throw error;
            }
            avisar({ tipo: "pizarra", accion: "poner", elementos: [e] });
            return json(res, 201, e);
        }
        if (accion === "vivo" && metodo === "POST") {
            // Lo que se está pintando ahora mismo y dónde está el lápiz: no se guarda, solo se reparte.
            const ahora = Date.now();
            const cuenta = vivoPorUsuario.get(usuario.id) || { desde: ahora, n: 0 };
            if (ahora - cuenta.desde > 1000) Object.assign(cuenta, { desde: ahora, n: 0 });
            cuenta.n += 1;
            vivoPorUsuario.set(usuario.id, cuenta);
            if (cuenta.n > 30) return json(res, 200, { ok: false });
            const { cursor, trazo } = await leerJson(req);
            const evento = { tipo: "pizarra-vivo" };
            const dentro = (v, i) => Math.min((i % 2 ? ALTO_PIZARRA : ANCHO_PIZARRA) + 100, Math.max(-100, Math.round(Number(v)) || 0));
            if (Array.isArray(cursor) && cursor.length === 2 && cursor.every(Number.isFinite)) evento.cursor = cursor.map(dentro);
            if (cursor === null) evento.cursor = null; // ha sacado el ratón de la pizarra
            if (trazo && typeof trazo === "object" && typeof trazo.id === "string" && Array.isArray(trazo.puntos)) {
                evento.trazo = {
                    id: trazo.id.slice(0, 24),
                    color: COLORES_TRAZO.includes(trazo.color) ? trazo.color : COLORES_TRAZO[0],
                    grosor: GROSORES.includes(Number(trazo.grosor)) ? Number(trazo.grosor) : GROSORES[1],
                    puntos: trazo.puntos.slice(0, Math.min(400, trazo.puntos.length) & ~1).map(dentro),
                    desde: Math.max(0, Math.round(Number(trazo.desde)) || 0),
                };
            }
            if (trazo === null) evento.trazo = null;
            avisar(evento);
            return json(res, 200, { ok: true });
        }
    }

    return fallo(res, 404, "No existe");
}

// ---------- servidor ----------

const servidor = http.createServer(async (req, res) => {
    cabecerasComunes(res);
    let ruta;
    try {
        ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
    } catch {
        return fallo(res, 400, "Dirección no válida");
    }
    if (ruta === BASE) {
        res.writeHead(301, { Location: `${BASE}/` });
        return res.end();
    }
    try {
        // Portada
        if (ruta === "/" && (req.method === "GET" || req.method === "HEAD")) return servirPortada(req, res);
        // Cuentas del crew
        if (ruta.startsWith("/cuentas/")) return await crew.manejar(req, res, ruta.slice("/cuentas".length));
    } catch (error) {
        console.error("[cuentas]", error);
        if (!res.headersSent) return fallo(res, 500, "Algo ha fallado en el servidor.");
        return res.end();
    }
    if (!ruta.startsWith(`${BASE}/`)) return fallo(res, 404, "No existe");
    ruta = ruta.slice(BASE.length);
    try {
        if (ruta === "/salud") return json(res, 200, { ok: true });
        if (ruta.startsWith("/api/")) return await api(req, res, ruta);
        if (req.method !== "GET" && req.method !== "HEAD") return fallo(res, 405, "Método no permitido");
        return servirArchivo(req, res, ruta);
    } catch (error) {
        if (error instanceof ErrorDeDatos || error.estado) return fallo(res, error.estado || 400, error.message);
        console.error("[tablón]", error);
        if (!res.headersSent) return fallo(res, 500, "Algo ha fallado en el servidor.");
        res.end();
    }
});

servidor.keepAliveTimeout = 65000;
servidor.listen(PUERTO, () => console.log(`[tablón] En marcha en el puerto ${PUERTO} (${BASE}/).`));

function apagar() {
    try {
        if (almacen.pendiente()) almacen.guardarYa();
        if (pizarras.pendiente()) pizarras.guardarYa();
    } catch (error) {
        console.error("[tablón] Error al guardar antes de salir:", error);
    }
    cerrarOyentes(() => true);
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", apagar);
process.on("SIGINT", apagar);
// Si algo inesperado revienta, al menos se guarda lo último antes de que Docker lo vuelva a arrancar.
process.on("uncaughtException", (error) => {
    console.error("[tablón] Error inesperado:", error);
    try {
        if (almacen.pendiente()) almacen.guardarYa();
        if (pizarras.pendiente()) pizarras.guardarYa();
    } finally {
        process.exit(1);
    }
});
