#!/usr/bin/env node
/*
 * Banco de pruebas · junta lo apuntado por las pruebas (apuntes.jsonl) en informe.json e informe.md, y saca el
 * resumen como anotaciones de GitHub (que es lo que se puede leer desde fuera sin descargar nada).
 *
 *   node informe.mjs <carpeta de resultados> escribir            escribe informe.json e informe.md
 *   node informe.mjs <carpeta de resultados> anotar 0-8          anotaciones de los puntos 0 a 8 (una por punto)
 *   node informe.mjs <carpeta de resultados> anotar 9            anotaciones de los sondeos del punto 9 (una por sondeo)
 *   node informe.mjs <carpeta de resultados> veredicto           termina con error si algo está «mal»
 *
 * GitHub enseña como mucho 10 anotaciones de cada clase por paso: por eso se anota en dos pasos.
 */
import fs from "node:fs";
import path from "node:path";

const [carpeta = "resultados", orden = "escribir", cuales = ""] = process.argv.slice(2);

/** Los puntos del encargo, por orden, con las comprobaciones que tiene que haber en cada uno. */
const ACCIONES = ["bailar", "sentado-abajo", "sentado-izquierda", "sentado-derecha", "sentado-arriba", "saludar", "aplaudir", "sentado-abajo-mano", "sentado-abajo-palmas", "bailar-mano", "sentado-abajo-gotas", "sentado-abajo-nube", "quieto-burbujas", "sentado-abajo-zetas", "quieto-corazones", "quieto-chispas"];
const OBJETOS = ["lata", "cafe", "agua", "cana", "snack", "disco"];
const TAMANOS = ["1280x800", "1024x768", "1440x900"];
const PUNTOS = [
    { punto: "0", titulo: "SONDA (el banco monta una llamada)", claves: ["llamada"] },
    { punto: "1", titulo: "ARRANCA", claves: ["entra", "aviso", "historico", "aviso-cierra", "version", "aviso-vuelve", "medidas"] },
    { punto: "2", titulo: "TECLAS (parche 11)", claves: ["llegan", "e-no", "con-ctrl", "repeticion", "decir", "vuelven", "chat"] },
    {
        punto: "3",
        titulo: "ACCIONES (parche 08)",
        claves: [
            "referencia",
            ...ACCIONES.map((a) => "accion-" + a),
            ...OBJETOS.map((o) => "lleva-" + o),
            "beber",
            "no-existe-volar",
            "no-existe-sentado-abajo-nada",
            "no-existe-lleva",
            "saludar-tras-sentarse",
            "de-pie-tras-sentarse",
            "andando",
        ],
    },
    { punto: "4", titulo: "LO VEN LOS DEMÁS", claves: ["entra-despues", "saludar", "lata", "bailar-en-directo"] },
    { punto: "5", titulo: "LLAMADA Y ACCIONES", claves: ["se-forma", "bailar", "saludar", "lleva", "quitar", "tras-el-chat"] },
    {
        punto: "6",
        titulo: "BARRA DE BOTONES EN LLAMADA",
        claves: [
            "sin-invitar",
            ...TAMANOS.map((t) => "sin-llamada-" + t),
            "sin-llamada-anchos",
            "callback",
            "sustituir",
            "boton-con-icono-relativo",
            "boton-con-icono-imposible",
            "llamada",
            ...TAMANOS.map((t) => "en-llamada-" + t),
            "en-llamada-anchos",
            "en-llamada-con-chat-1280x800",
            "callback-en-llamada",
        ],
    },
    { punto: "7", titulo: "VOLVER A HABLAR (parche 12)", claves: ["se-forma", "proximidad-corta", "proximidad-vuelve", "no-molestar-corta", "no-molestar-vuelve"] },
    {
        punto: "8",
        titulo: "LETRAS",
        claves: [
            "decir",
            "decir-corto",
            "decir-largo",
            "pensar",
            "chat",
            "nombre",
            "aviso-de-zona",
            "aviso-del-mapa",
            "aviso-del-script",
            "aviso-junto-al-muneco",
            "tecla-espacio",
            "fuentes",
            "zoom",
            "franja",
            // los huecos entre letras, con el navegador del banco («hinting» completo) y con otro sin ajuste
            "retoques",
            "huecos-decir",
            "huecos-pensar",
            "retoques-sin-hinting",
            "huecos-decir-sin-hinting",
            "huecos-pensar-sin-hinting",
        ],
    },
    { punto: "9a", titulo: "SONDEO moveTo", claves: ["libre", "pared", "sin-camino"] },
    { punto: "9b", titulo: "SONDEO proximityMeeting", claves: ["avisos"] },
    { punto: "9c", titulo: "SONDEO ui.website", claves: ["abrir"] },
    { punto: "9d", titulo: "SONDEO banner", claves: ["banner"] },
    { punto: "9e", titulo: "SONDEO sonido", claves: ["sonido"] },
    { punto: "9f", titulo: "SONDEO capas (velo)", claves: ["velo"] },
    { punto: "9g", titulo: "SONDEO setTiles", claves: ["casillas"] },
    { punto: "9h", titulo: "SONDEO room.website", claves: ["cartel"] },
    { punto: "9i", titulo: "SONDEO zona con panel", claves: ["zona-panel"] },
    { punto: "9j", titulo: "SONDEO zona silenciosa", claves: ["silencio"] },
];

/** En una variante (hoy solo «sin-parche-12») solo se pasan la sonda y la prueba de volver a hablar. */
const VARIANTE = process.env.BANCO_VARIANTE ?? "";
if (VARIANTE !== "") PUNTOS.splice(0, PUNTOS.length, ...PUNTOS.filter((p) => p.punto === "0" || p.punto === "7"));

const ORDEN_ESTADOS = ["mal", "no se pudo", "bien", "dato"];

function leerApuntes() {
    const archivo = path.join(carpeta, "apuntes.jsonl");
    if (!fs.existsSync(archivo)) return [];
    const porClave = new Map();
    for (const linea of fs.readFileSync(archivo, "utf8").split("\n")) {
        if (!linea.trim()) continue;
        try {
            const a = JSON.parse(linea);
            porClave.set(`${a.punto}·${a.clave}`, a); // si una comprobación se repite, vale la última
        } catch {
            // una línea a medias (la prueba se cortó escribiendo): se ignora
        }
    }
    return [...porClave.values()];
}

/** Las pruebas de Playwright, con su resultado y su error (si lo hubo). */
function leerPlaywright() {
    const archivo = path.join(carpeta, "playwright.json");
    if (!fs.existsSync(archivo)) return { pruebas: [], falta: true };
    let datos;
    try {
        datos = JSON.parse(fs.readFileSync(archivo, "utf8"));
    } catch (e) {
        return { pruebas: [], falta: true, error: String(e) };
    }
    const pruebas = [];
    const recorrer = (suite) => {
        for (const spec of suite.specs ?? []) {
            for (const t of spec.tests ?? []) {
                const r = (t.results ?? []).at(-1) ?? {};
                pruebas.push({
                    archivo: spec.file ?? suite.file,
                    titulo: spec.title,
                    estado: r.status ?? t.status,
                    segundos: Math.round((r.duration ?? 0) / 100) / 10,
                    error: limpiar(r.error?.message ?? (r.errors ?? []).map((e) => e.message).join(" | ")),
                });
            }
        }
        for (const s of suite.suites ?? []) recorrer(s);
    };
    for (const s of datos.suites ?? []) recorrer(s);
    return { pruebas, segundos: Math.round((datos.stats?.duration ?? 0) / 1000), errores: (datos.errors ?? []).map((e) => limpiar(e.message)) };
}

function limpiar(texto) {
    // eslint-disable-next-line no-control-regex
    return String(texto ?? "").replace(/\u001b\[[0-9;]*m/g, "").trim();
}

function estadoDelPunto(comprobaciones) {
    if (comprobaciones.length === 0) return "no se pudo";
    for (const estado of ["mal", "no se pudo"]) if (comprobaciones.some((c) => c.estado === estado)) return estado;
    return comprobaciones.some((c) => c.estado === "bien") ? "bien" : "dato";
}

function corto(dato, tope = 260) {
    const texto = typeof dato === "string" ? dato : JSON.stringify(dato);
    const limpio = limpiar(texto ?? "").replace(/\s+/g, " ");
    return limpio.length > tope ? limpio.slice(0, tope - 1) + "…" : limpio;
}

function montar() {
    const apuntes = leerApuntes();
    const playwright = leerPlaywright();
    const puntos = PUNTOS.map((p) => {
        const comprobaciones = apuntes.filter((a) => a.punto === p.punto);
        // lo que tenía que haber y no está: la prueba no llegó
        for (const clave of p.claves) {
            if (!comprobaciones.some((c) => c.clave === clave)) {
                comprobaciones.push({ punto: p.punto, clave, titulo: clave, estado: "no se pudo", dato: "la prueba no llegó a esta comprobación", capturas: [] });
            }
        }
        // la prueba de Playwright de este punto (las del 9 son dos): si alguna acabó mal, esa
        const prefijo = (p.punto.startsWith("9") ? "9" : p.punto) + " ·";
        const suyas = playwright.pruebas.filter((t) => t.titulo.startsWith(prefijo));
        const prueba = suyas.find((t) => t.estado !== "passed") ?? suyas[0];
        // las comprobaciones, en el orden en que se pidieron
        comprobaciones.sort((x, y) => {
            const i = p.claves.indexOf(x.clave);
            const j = p.claves.indexOf(y.clave);
            return (i < 0 ? 999 : i) - (j < 0 ? 999 : j);
        });
        return { ...p, estado: estadoDelPunto(comprobaciones), comprobaciones, prueba: prueba ?? null };
    });
    const cuenta = { bien: 0, mal: 0, "no se pudo": 0, dato: 0 };
    for (const p of puntos) for (const c of p.comprobaciones) cuenta[c.estado] = (cuenta[c.estado] ?? 0) + 1;
    return {
        ejecucion: {
            id: process.env.GITHUB_RUN_ID ?? null,
            numero: process.env.GITHUB_RUN_NUMBER ?? null,
            intento: process.env.GITHUB_RUN_ATTEMPT ?? null,
            commit: process.env.GITHUB_SHA ?? null,
            rama: process.env.GITHUB_REF_NAME ?? null,
            fecha: new Date().toISOString(),
            workadventure: process.env.WA_VERSION ?? null,
            oficina: process.env.BANCO_VERSION ?? null,
            variante: VARIANTE === "" ? null : VARIANTE,
            segundosDePruebas: playwright.segundos ?? null,
        },
        cuenta,
        puntos,
        playwright,
    };
}

function escribir() {
    const informe = montar();
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(path.join(carpeta, "informe.json"), JSON.stringify(informe, null, 1) + "\n");

    const e = informe.ejecucion;
    const md = [];
    md.push("# Banco de pruebas · informe" + (e.variante ? ` (variante «${e.variante}»)` : ""), "");
    if (e.variante === "sin-parche-12") {
        md.push("> Esta ejecución lleva la imagen construida **sin el parche 12** y solo pasa la prueba de «volver a hablar»: sirve para", "> comparar con la ejecución normal. Aquí lo esperado es que la llamada NO vuelva sola.", "");
    }
    md.push(`- Ejecución: ${e.id ?? "(local)"} (n.º ${e.numero ?? "?"}, intento ${e.intento ?? "?"}) · rama \`${e.rama ?? "?"}\` · commit \`${(e.commit ?? "").slice(0, 7)}\``);
    md.push(`- Fecha: ${e.fecha} · WorkAdventure ${e.workadventure ?? "?"} · oficina ${e.oficina ?? "?"}`);
    md.push(`- Comprobaciones: ${informe.cuenta.bien} bien · ${informe.cuenta.mal} mal · ${informe.cuenta["no se pudo"]} no se pudo · ${informe.cuenta.dato} datos`);
    md.push(`- Las pruebas han tardado ${e.segundosDePruebas ?? "?"} s`, "");
    md.push("## Resumen", "", "| Punto | Qué | Resultado | Comprobaciones |", "| --- | --- | --- | --- |");
    for (const p of informe.puntos) {
        const n = (estado) => p.comprobaciones.filter((c) => c.estado === estado).length;
        const detalle = ORDEN_ESTADOS.filter((s) => n(s) > 0).map((s) => `${n(s)} ${s}`).join(", ");
        md.push(`| ${p.punto} | ${p.titulo} | **${p.estado}** | ${detalle || "ninguna"} |`);
    }
    md.push("");
    for (const p of informe.puntos) {
        md.push(`## ${p.punto} · ${p.titulo}: ${p.estado}`, "");
        if (p.prueba && p.prueba.estado !== "passed") md.push(`> La prueba de Playwright acabó «${p.prueba.estado}»: ${corto(p.prueba.error, 600)}`, "");
        if (p.comprobaciones.length === 0) {
            md.push("Sin comprobaciones apuntadas.", "");
            continue;
        }
        md.push("| Comprobación | Resultado | Dato | Capturas |", "| --- | --- | --- | --- |");
        for (const c of p.comprobaciones) {
            const capturas = (c.capturas ?? []).map((f) => `[${path.basename(f)}](${f})`).join(" ");
            md.push(`| \`${c.clave}\` ${c.titulo} | **${c.estado}** | ${corto(c.dato, 700).replace(/\|/g, "\\|")} | ${capturas} |`);
        }
        md.push("");
    }
    md.push("## Pruebas de Playwright", "", "| Prueba | Estado | Segundos | Error |", "| --- | --- | --- | --- |");
    for (const t of informe.playwright.pruebas) md.push(`| ${t.titulo} | ${t.estado} | ${t.segundos} | ${corto(t.error, 300).replace(/\|/g, "\\|")} |`);
    if (informe.playwright.falta) md.push("", "> No hay `playwright.json`: Playwright no llegó a terminar (o a arrancar).");
    for (const error of informe.playwright.errores ?? []) md.push("", `> Error de Playwright: ${corto(error, 600)}`);
    md.push("");
    fs.writeFileSync(path.join(carpeta, "informe.md"), md.join("\n"));
    console.log(md.slice(0, 40).join("\n"));
}

/** `::notice title=…::…` — los saltos de línea y los «::» se escapan como pide GitHub. */
function anotacion(clase, titulo, texto) {
    const t = String(titulo).replace(/%/g, "%25").replace(/\r?\n/g, " ").replace(/:/g, "%3A").replace(/,/g, "%2C");
    const m = String(texto).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
    console.log(`::${clase} title=${t}::${m}`);
}

function anotar() {
    const informe = JSON.parse(fs.readFileSync(path.join(carpeta, "informe.json"), "utf8"));
    const puntos = informe.puntos.filter((p) => (cuales === "9" ? p.punto.startsWith("9") : !p.punto.startsWith("9")));
    for (const p of puntos) {
        const clase = p.estado === "mal" ? "error" : p.estado === "no se pudo" ? "warning" : "notice";
        // Primero lo que ha ido mal y lo que no se pudo (con su dato), luego los datos de los sondeos y, al final, solo
        // los nombres de lo que ha ido bien (el detalle está en informe.md).
        const de = (estado) => p.comprobaciones.filter((c) => c.estado === estado);
        const partes = [];
        for (const c of de("mal")) partes.push(`[MAL] ${c.clave}: ${corto(c.dato, 420)}`);
        for (const c of de("no se pudo")) partes.push(`[NO SE PUDO] ${c.clave}: ${corto(c.dato, 320)}`);
        for (const c of de("dato")) partes.push(`[dato] ${c.clave}: ${corto(c.dato, cuales === "9" ? 1500 : 300)}`);
        const bien = de("bien");
        if (cuales === "9") for (const c of bien) partes.push(`[bien] ${c.clave}: ${corto(c.dato, 1500)}`);
        else if (bien.length > 0) partes.push(`[bien] ${bien.length}: ${bien.map((c) => c.clave).join(", ")}`);
        let texto = partes.join("\n");
        if (p.prueba && p.prueba.estado !== "passed") texto = `Playwright: ${p.prueba.estado} · ${corto(p.prueba.error, 300)}\n` + texto;
        if (texto.length > 3800) texto = texto.slice(0, 3800) + "…";
        anotacion(clase, `${p.punto} · ${p.titulo} · ${p.estado.toUpperCase()}`, texto || "sin comprobaciones");
    }
}

function veredicto() {
    const informe = JSON.parse(fs.readFileSync(path.join(carpeta, "informe.json"), "utf8"));
    const c = informe.cuenta;
    const rotas = informe.playwright.pruebas.filter((t) => t.estado !== "passed" && t.estado !== "skipped");
    console.log(`Comprobaciones: ${c.bien} bien, ${c.mal} mal, ${c["no se pudo"]} no se pudo, ${c.dato} datos. Pruebas rotas: ${rotas.length}.`);
    if (informe.playwright.falta) {
        anotacion("error", "Banco de pruebas", "Playwright no ha dejado resultados: el banco no ha llegado a probar nada.");
        process.exit(1);
    }
    if (c.mal > 0 || rotas.length > 0) {
        anotacion("error", "Banco de pruebas", `${c.mal} comprobaciones mal y ${rotas.length} pruebas rotas. Detalle en la rama banco-resultados (informe.md).`);
        process.exit(1);
    }
}

if (orden === "escribir") escribir();
else if (orden === "anotar") anotar();
else if (orden === "veredicto") veredicto();
else {
    console.error("Orden desconocida: " + orden);
    process.exit(2);
}
