// Almacén del tablón: un único archivo JSON en la carpeta de datos (tablon.json).
//
// Todo vive en memoria y se escribe a disco poco después de cada cambio (primero a un archivo
// temporal y luego se renombra, para que nunca quede a medias). Una vez al día se guarda una copia
// en copias/ y se conservan las últimas 30.

import fs from "node:fs";
import path from "node:path";

const VERSION = 1;
const COPIAS_MAXIMAS = 30;

function vacio() {
    return { version: VERSION, usuarios: [], sesiones: [], invitaciones: [], tareas: [] };
}

function completar(datos) {
    const base = vacio();
    for (const clave of Object.keys(base)) {
        if (!Array.isArray(base[clave])) continue;
        if (!Array.isArray(datos[clave])) datos[clave] = [];
    }
    datos.version = VERSION;
    return datos;
}

function leer(archivo) {
    return completar(JSON.parse(fs.readFileSync(archivo, "utf8")));
}

export function abrirAlmacen(carpeta) {
    fs.mkdirSync(carpeta, { recursive: true });
    const carpetaCopias = path.join(carpeta, "copias");
    fs.mkdirSync(carpetaCopias, { recursive: true });
    const archivo = path.join(carpeta, "tablon.json");

    let datos;
    if (fs.existsSync(archivo)) {
        try {
            datos = leer(archivo);
        } catch (error) {
            // Archivo dañado: se aparta y se recupera la copia más reciente.
            const apartado = `${archivo}.danado-${Date.now()}`;
            fs.renameSync(archivo, apartado);
            console.error(`[tablón] tablon.json no se puede leer (${error.message}). Apartado en ${apartado}.`);
            const copias = fs.readdirSync(carpetaCopias).filter((n) => n.endsWith(".json")).sort().reverse();
            for (const nombre of copias) {
                try {
                    datos = leer(path.join(carpetaCopias, nombre));
                    console.error(`[tablón] Recuperada la copia ${nombre}.`);
                    break;
                } catch {
                    /* se prueba la siguiente */
                }
            }
        }
    }
    if (!datos) datos = vacio();

    let temporizador = null;

    function copiaDelDia() {
        if (!fs.existsSync(archivo)) return;
        const hoy = new Date().toISOString().slice(0, 10);
        const destino = path.join(carpetaCopias, `tablon-${hoy}.json`);
        if (fs.existsSync(destino)) return;
        fs.copyFileSync(archivo, destino);
        const viejas = fs.readdirSync(carpetaCopias).filter((n) => /^tablon-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
        for (const nombre of viejas.slice(0, Math.max(0, viejas.length - COPIAS_MAXIMAS))) {
            fs.rmSync(path.join(carpetaCopias, nombre), { force: true });
        }
    }

    function guardarYa() {
        clearTimeout(temporizador);
        temporizador = null;
        try {
            copiaDelDia();
        } catch (error) {
            console.error("[tablón] No se ha podido hacer la copia del día:", error.message);
        }
        const temporal = `${archivo}.tmp`;
        const fd = fs.openSync(temporal, "w");
        try {
            fs.writeSync(fd, JSON.stringify(datos));
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
        fs.renameSync(temporal, archivo);
    }

    function guardar() {
        if (temporizador) return;
        temporizador = setTimeout(() => {
            try {
                guardarYa();
            } catch (error) {
                console.error("[tablón] Error al guardar:", error);
            }
        }, 150);
    }

    if (!fs.existsSync(archivo)) guardarYa();

    return {
        get datos() {
            return datos;
        },
        guardar,
        guardarYa,
        pendiente: () => temporizador !== null,
    };
}
