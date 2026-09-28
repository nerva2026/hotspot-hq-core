// Cuentas del tablón: personas, contraseñas, sesiones e invitaciones.
//
// - Las contraseñas se guardan con scrypt (nunca en claro).
// - La sesión es una cookie aleatoria; en el servidor solo se guarda su huella (sha256).
// - Las invitaciones son enlaces de un solo uso (#alta=…) que caducan a los 7 días. Sirven para dar de
//   alta a alguien o para que alguien ponga una contraseña nueva si la ha olvidado.

import crypto from "node:crypto";
import { nuevoId } from "./tareas.js";

export const DURACION_SESION = 180 * 24 * 3600 * 1000;
const DURACION_INVITACION = 7 * 24 * 3600 * 1000;
export const COLORES = ["#e0562a", "#3b82c4", "#3a9d5d", "#8e5cc4", "#d6457f", "#c79100", "#1f9e98", "#6b5f58"];

const huella = (codigo) => crypto.createHash("sha256").update(codigo).digest("hex");

// Para comparar nombres sin importar mayúsculas ni tildes: «Víctor» = «victor».
export const normalizar = (s) =>
    String(s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim();

function derivar(clave, sal) {
    return new Promise((resolver, rechazar) => {
        crypto.scrypt(clave, sal, 64, { N: 16384, r: 8, p: 1 }, (error, clave64) => (error ? rechazar(error) : resolver(clave64)));
    });
}

export async function cifrarClave(clave) {
    const sal = crypto.randomBytes(16);
    const hash = await derivar(clave, sal);
    return { sal: sal.toString("base64"), hash: hash.toString("base64") };
}

export async function comprobarClave(clave, guardada) {
    if (!guardada) return false;
    const hash = await derivar(clave, Buffer.from(guardada.sal, "base64"));
    const esperado = Buffer.from(guardada.hash, "base64");
    return esperado.length === hash.length && crypto.timingSafeEqual(esperado, hash);
}

export function validarClave(clave) {
    if (typeof clave !== "string" || clave.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
    if (clave.length > 200) return "La contraseña es demasiado larga.";
    return null;
}

export function validarNombre(nombre, usuarios, excepto = null) {
    const limpio = String(nombre || "").replace(/\s+/g, " ").trim();
    if (limpio.length < 2) return { error: "El nombre debe tener al menos 2 letras." };
    if (limpio.length > 24) return { error: "El nombre puede tener como mucho 24 caracteres." };
    if (usuarios.some((u) => u.id !== excepto && normalizar(u.nombre) === normalizar(limpio))) {
        return { error: "Ya hay alguien con ese nombre." };
    }
    return { nombre: limpio };
}

export const usuarioPublico = (u) => ({ id: u.id, nombre: u.nombre, color: u.color, admin: Boolean(u.admin), baja: Boolean(u.baja) });

export function crearSesion(datos, usuario) {
    const codigo = crypto.randomBytes(32).toString("base64url");
    const ahora = Date.now();
    datos.sesiones.push({ id: huella(codigo), usuario: usuario.id, creada: ahora, caduca: ahora + DURACION_SESION });
    return codigo;
}

export function buscarSesion(datos, codigo) {
    if (!codigo) return null;
    const id = huella(codigo);
    const sesion = datos.sesiones.find((s) => s.id === id);
    if (!sesion || sesion.caduca < Date.now()) return null;
    const usuario = datos.usuarios.find((u) => u.id === sesion.usuario);
    return usuario && !usuario.baja ? { sesion, usuario } : null;
}

export function cerrarSesion(datos, codigo) {
    const id = huella(codigo || "");
    datos.sesiones = datos.sesiones.filter((s) => s.id !== id);
}

export function crearInvitacion(datos, { tipo, admin = false, usuario = null, creadaPor = null }) {
    const codigo = crypto.randomBytes(18).toString("base64url");
    // Una sola invitación viva para cambiar la contraseña de cada persona.
    if (tipo === "clave") datos.invitaciones = datos.invitaciones.filter((i) => !(i.tipo === "clave" && i.usuario === usuario));
    datos.invitaciones.push({ id: huella(codigo), tipo, admin, usuario, creadaPor, caduca: Date.now() + DURACION_INVITACION });
    return codigo;
}

export function buscarInvitacion(datos, codigo) {
    if (!codigo || typeof codigo !== "string") return null;
    const id = huella(codigo);
    const inv = datos.invitaciones.find((i) => i.id === id);
    if (!inv || inv.caduca < Date.now()) return null;
    if (inv.tipo === "clave" && !datos.usuarios.some((u) => u.id === inv.usuario)) return null;
    return inv;
}

export function gastarInvitacion(datos, inv) {
    datos.invitaciones = datos.invitaciones.filter((i) => i !== inv);
}

export function limpiarCaducadas(datos) {
    const ahora = Date.now();
    const antes = datos.sesiones.length + datos.invitaciones.length;
    datos.sesiones = datos.sesiones.filter((s) => s.caduca > ahora);
    datos.invitaciones = datos.invitaciones.filter((i) => i.caduca > ahora);
    return antes !== datos.sesiones.length + datos.invitaciones.length;
}

export function nuevoUsuario(datos, { nombre, color, admin, clave }) {
    const usado = new Set(datos.usuarios.map((u) => u.color));
    const libre = COLORES.find((c) => !usado.has(c)) || COLORES[datos.usuarios.length % COLORES.length];
    const usuario = {
        id: nuevoId(6),
        nombre,
        color: COLORES.includes(color) ? color : libre,
        admin: Boolean(admin),
        clave,
        creado: new Date().toISOString(),
    };
    datos.usuarios.push(usuario);
    return usuario;
}

// Freno contra quien pruebe contraseñas a lo loco: 10 fallos cada 15 minutos por dirección.
const fallos = new Map();
export function demasiadosFallos(ip) {
    const f = fallos.get(ip);
    if (!f) return false;
    if (Date.now() - f.desde > 15 * 60 * 1000) {
        fallos.delete(ip);
        return false;
    }
    return f.n >= 10;
}
export function apuntarFallo(ip) {
    const f = fallos.get(ip);
    if (!f || Date.now() - f.desde > 15 * 60 * 1000) fallos.set(ip, { n: 1, desde: Date.now() });
    else f.n += 1;
}
export const olvidarFallos = (ip) => fallos.delete(ip);
