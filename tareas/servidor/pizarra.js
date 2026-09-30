// Pizarras compartidas de la oficina (la de la sala de reuniones y las que hagan falta): se pinta a mano, se
// pegan fotos y notas, y todos lo ven a la vez.
//
// Viven en su propio archivo (pizarras.json, en la carpeta de datos) para no engordar el del tablón; las fotos, en
// la carpeta pizarra/. Cada pizarra es una lista de elementos en un lienzo fijo de 1920 × 1200:
//   trazo   { color, grosor, puntos: [x, y, x, y…] }
//   nota    { texto, color, x, y, ancho, alto }
//   imagen  { archivo, x, y, ancho, alto }
// Lo que se quita va a una papelera corta (para «Deshacer») y al vaciar se guarda lo que había.

import fs from "node:fs";
import path from "node:path";
import { ErrorDeDatos, nuevoId } from "./tareas.js";

export const ANCHO = 1920;
export const ALTO = 1200;
export const COLORES_TRAZO = ["#1c1715", "#e0303a", "#e0562a", "#ffd84a", "#3a9d5d", "#3b82c4", "#8e5cc4", "#ffffff"];
export const COLORES_NOTA = ["#ffd84a", "#f6c8b4", "#c9dff3", "#cfe8c9", "#e5d3f2"];
export const GROSORES = [3, 6, 12, 28];
const LIMITES = { pizarras: 20, elementos: 5000, puntos: 5000, puntosPizarra: 150000, texto: 1000, imagenes: 300, papelera: 300, nombre: 40 };
export const NOMBRES = { reuniones: "Pizarra de reuniones" };

export const idValido = (v) => typeof v === "string" && /^[a-z0-9-]{1,30}$/.test(v);
const idElementoValido = (v) => typeof v === "string" && /^[\w-]{8,24}$/.test(v);

const num = (v, min, max) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) throw new ErrorDeDatos("Posición no válida.");
    return Math.min(max, Math.max(min, n));
};

export function abrirPizarras(carpeta) {
    fs.mkdirSync(carpeta, { recursive: true });
    const archivo = path.join(carpeta, "pizarras.json");
    const carpetaImagenes = path.join(carpeta, "pizarra");
    let datos = { version: 1, pizarras: [] };
    for (const candidato of [archivo, `${archivo}.anterior`]) {
        if (!fs.existsSync(candidato)) continue;
        try {
            const leido = JSON.parse(fs.readFileSync(candidato, "utf8"));
            if (Array.isArray(leido.pizarras)) {
                datos = leido;
                break;
            }
        } catch (error) {
            console.error(`[pizarra] ${path.basename(candidato)} no se puede leer (${error.message}).`);
        }
    }

    let temporizador = null;
    let ultimaCopia = 0;
    function guardarYa() {
        clearTimeout(temporizador);
        temporizador = null;
        // Una copia de lo anterior cada hora, por si el archivo se estropea.
        if (fs.existsSync(archivo) && Date.now() - ultimaCopia > 3600 * 1000) {
            fs.copyFileSync(archivo, `${archivo}.anterior`);
            ultimaCopia = Date.now();
        }
        const temporal = `${archivo}.tmp`;
        fs.writeFileSync(temporal, JSON.stringify(datos));
        fs.renameSync(temporal, archivo);
    }
    function guardar() {
        if (temporizador) return;
        temporizador = setTimeout(() => {
            try {
                guardarYa();
            } catch (error) {
                console.error("[pizarra] Error al guardar:", error);
            }
        }, 600);
    }

    function obtener(id, { crear = false } = {}) {
        if (!idValido(id)) throw new ErrorDeDatos("Esa pizarra no existe.");
        let p = datos.pizarras.find((x) => x.id === id);
        if (!p && crear) {
            if (datos.pizarras.length >= LIMITES.pizarras) throw new ErrorDeDatos("No caben más pizarras.");
            p = { id, nombre: NOMBRES[id] || `Pizarra ${id}`, elementos: [], papelera: [], vaciada: null, actualizado: null, actualizadoPor: null };
            datos.pizarras.push(p);
        }
        if (!p) throw Object.assign(new ErrorDeDatos("Esa pizarra no existe."), { estado: 404 });
        return p;
    }

    function tocar(p, usuario) {
        p.actualizado = new Date().toISOString();
        p.actualizadoPor = usuario.id;
        guardar();
    }

    // Lo que manda el navegador, comprobado campo a campo (las imágenes solo se crean al subirlas).
    function limpiar(e, usuario) {
        if (!e || typeof e !== "object") throw new ErrorDeDatos("Elemento no válido.");
        const base = { id: idElementoValido(e.id) ? e.id : nuevoId(), autor: usuario.id, creado: new Date().toISOString() };
        if (e.tipo === "trazo") {
            const puntos = Array.isArray(e.puntos) ? e.puntos : [];
            if (puntos.length < 2 || puntos.length % 2) throw new ErrorDeDatos("Trazo vacío.");
            if (puntos.length > LIMITES.puntos * 2) throw new ErrorDeDatos("Ese trazo es demasiado largo.");
            return {
                ...base,
                tipo: "trazo",
                color: COLORES_TRAZO.includes(e.color) ? e.color : COLORES_TRAZO[0],
                grosor: GROSORES.includes(Number(e.grosor)) ? Number(e.grosor) : GROSORES[1],
                puntos: puntos.map((v, i) => num(v, -100, (i % 2 ? ALTO : ANCHO) + 100)),
            };
        }
        if (e.tipo === "nota") {
            return {
                ...base,
                tipo: "nota",
                texto: typeof e.texto === "string" ? e.texto.slice(0, LIMITES.texto) : "",
                color: COLORES_NOTA.includes(e.color) ? e.color : COLORES_NOTA[0],
                ...caja(e, { ancho: 220, alto: 160 }),
            };
        }
        throw new ErrorDeDatos("Tipo de elemento desconocido.");
    }

    function caja(e, porDefecto) {
        const ancho = num(e.ancho ?? porDefecto.ancho, 60, ANCHO);
        const alto = num(e.alto ?? porDefecto.alto, 40, ALTO);
        return { x: num(e.x ?? 40, -ancho + 40, ANCHO - 40), y: num(e.y ?? 40, -alto + 40, ALTO - 40), ancho, alto };
    }

    function poner(p, elemento) {
        if (p.elementos.length >= LIMITES.elementos) throw new ErrorDeDatos("La pizarra está llena: vacíala o borra algo.");
        if (elemento.tipo === "trazo") {
            // Para que la pizarra se siga abriendo rápido: como mucho unos cuantos cientos de trazos largos.
            const puntos = p.elementos.reduce((n, e) => n + (e.tipo === "trazo" ? e.puntos.length / 2 : 0), 0);
            if (puntos + elemento.puntos.length / 2 > LIMITES.puntosPizarra) throw new ErrorDeDatos("La pizarra está llena de trazos: vacíala o borra algo.");
        }
        if (p.elementos.some((x) => x.id === elemento.id)) throw new ErrorDeDatos("Ese elemento ya está en la pizarra.");
        p.elementos.push(elemento);
        return elemento;
    }

    return {
        ANCHO,
        ALTO,
        carpetaImagenes,
        guardarYa,
        pendiente: () => temporizador !== null,
        lista: () => datos.pizarras.map((p) => ({ id: p.id, nombre: p.nombre, elementos: p.elementos.length, actualizado: p.actualizado })),
        ver(id) {
            if (!idValido(id)) throw new ErrorDeDatos("Esa pizarra no existe.");
            const p = datos.pizarras.find((x) => x.id === id);
            if (!p) return { id, nombre: NOMBRES[id] || `Pizarra ${id}`, elementos: [], actualizado: null, actualizadoPor: null, puedeRecuperar: false };
            return { id: p.id, nombre: p.nombre, elementos: p.elementos, actualizado: p.actualizado, actualizadoPor: p.actualizadoPor, puedeRecuperar: Boolean(p.vaciada) };
        },
        anadir(id, entrada, usuario) {
            const p = obtener(id, { crear: true });
            const elemento = poner(p, limpiar(entrada, usuario));
            tocar(p, usuario);
            return elemento;
        },
        anadirImagen(id, { archivo, x, y, ancho, alto, idElemento }, usuario) {
            const p = obtener(id, { crear: true });
            if (p.elementos.filter((e) => e.tipo === "imagen").length >= LIMITES.imagenes) throw new ErrorDeDatos("Esta pizarra ya tiene demasiadas fotos.");
            const elemento = poner(p, {
                id: idElementoValido(idElemento) ? idElemento : nuevoId(),
                tipo: "imagen",
                archivo,
                ...caja({ x, y, ancho, alto }, { ancho: 480, alto: 320 }),
                autor: usuario.id,
                creado: new Date().toISOString(),
            });
            tocar(p, usuario);
            return elemento;
        },
        cambiar(id, idElemento, cambios, usuario) {
            const p = obtener(id);
            const e = p.elementos.find((x) => x.id === idElemento);
            if (!e) throw Object.assign(new ErrorDeDatos("Eso ya no está en la pizarra."), { estado: 404 });
            if (e.tipo === "trazo") throw new ErrorDeDatos("Los trazos no se mueven: bórralos y vuelve a pintar.");
            const nueva = caja({ ...e, ...cambios }, e);
            Object.assign(e, nueva);
            if (e.tipo === "nota") {
                if (typeof cambios.texto === "string") e.texto = cambios.texto.slice(0, LIMITES.texto);
                if (COLORES_NOTA.includes(cambios.color)) e.color = cambios.color;
            }
            e.cambiado = new Date().toISOString();
            e.cambiadoPor = usuario.id;
            tocar(p, usuario);
            return e;
        },
        quitar(id, ids, usuario) {
            const p = obtener(id);
            const quitar = new Set(ids.filter(idElementoValido));
            const quitados = p.elementos.filter((e) => quitar.has(e.id));
            if (!quitados.length) return [];
            p.elementos = p.elementos.filter((e) => !quitar.has(e.id));
            p.papelera.push(...quitados.map((e) => ({ ...e, quitado: new Date().toISOString() })));
            if (p.papelera.length > LIMITES.papelera) p.papelera = p.papelera.slice(-LIMITES.papelera);
            tocar(p, usuario);
            return quitados.map((e) => e.id);
        },
        restaurar(id, ids, usuario) {
            const p = obtener(id);
            const buscados = new Set(ids.filter(idElementoValido));
            const vueltos = [];
            for (const e of [...p.papelera].reverse()) {
                if (!buscados.has(e.id) || p.elementos.some((x) => x.id === e.id)) continue;
                const { quitado, ...limpio } = e;
                poner(p, limpio);
                vueltos.push(limpio);
                buscados.delete(e.id);
            }
            p.papelera = p.papelera.filter((e) => !vueltos.some((v) => v.id === e.id));
            if (vueltos.length) tocar(p, usuario);
            return vueltos;
        },
        vaciar(id, usuario) {
            const p = obtener(id);
            if (!p.elementos.length) return false;
            p.vaciada = { elementos: p.elementos, cuando: new Date().toISOString(), quien: usuario.id };
            p.elementos = [];
            tocar(p, usuario);
            return true;
        },
        recuperar(id, usuario) {
            const p = obtener(id);
            if (!p.vaciada) throw new ErrorDeDatos("No hay nada que recuperar.");
            const ids = new Set(p.elementos.map((e) => e.id));
            p.elementos = [...p.vaciada.elementos.filter((e) => !ids.has(e.id)), ...p.elementos];
            p.vaciada = null;
            tocar(p, usuario);
            return p.elementos;
        },
        // Las fotos que ya no están en ninguna parte (ni en la pizarra, ni en su papelera, ni en lo vaciado).
        fotosHuerfanas() {
            const usadas = new Set();
            for (const p of datos.pizarras) {
                for (const e of [...p.elementos, ...p.papelera, ...(p.vaciada?.elementos || [])]) if (e.tipo === "imagen") usadas.add(e.archivo);
            }
            let archivos = [];
            try {
                archivos = fs.readdirSync(carpetaImagenes);
            } catch {
                return [];
            }
            return archivos.filter((a) => !usadas.has(a));
        },
        // La papelera y lo vaciado se olvidan a los 30 días.
        limpiarViejo(limite) {
            let cambiado = false;
            for (const p of datos.pizarras) {
                const antes = p.papelera.length;
                p.papelera = p.papelera.filter((e) => Date.parse(e.quitado) > limite);
                if (p.papelera.length !== antes) cambiado = true;
                if (p.vaciada && Date.parse(p.vaciada.cuando) <= limite) {
                    p.vaciada = null;
                    cambiado = true;
                }
            }
            if (cambiado) guardar();
        },
        tieneImagen(archivo) {
            return datos.pizarras.some((p) => [...p.elementos, ...p.papelera, ...(p.vaciada?.elementos || [])].some((e) => e.tipo === "imagen" && e.archivo === archivo));
        },
    };
}
