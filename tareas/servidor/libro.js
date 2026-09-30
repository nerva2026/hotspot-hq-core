// Libro de cuentas de Don Balance: gastos, ingresos y pagos del crew, y cómo va cada persona.
//
// Sigue el modelo de la hoja «HOT-SPOT HQ - Libro de cuentas.xlsx» que había en Drive: cada gasto lo paga
// alguien y se reparte según la parte de cada persona (Diego 50 %, Víctor 50 %…). El balance de cada uno es lo
// que ha puesto menos lo que le toca: positivo, se le debe dinero; negativo, debe dinero. Además:
//   - ingresos: dinero que cobra una persona para todos (entradas, un bolo…); se reparte con las mismas partes;
//   - pagos: cuando alguien le da dinero a otra persona para saldar lo que le debe.
// Los importes van en céntimos (números enteros) para que las sumas cuadren siempre.

import { ErrorDeDatos, fechaValida, nuevoId } from "./tareas.js";

export const TIPOS = ["gasto", "ingreso", "pago"];
export const NOMBRES_TIPO = { gasto: "Gasto", ingreso: "Ingreso", pago: "Pago" };
export const CATEGORIAS_INICIALES = [
    "Oficina y software",
    "Eventos",
    "Producción",
    "Material",
    "Viajes",
    "Comida y bebida",
    "Publicidad",
    "Gestoría e impuestos",
    "Otros",
];
const LIMITES = { concepto: 200, notas: 4000, categoria: 40, categorias: 40, importe: 10_000_000_000 }; // cien millones de euros

const texto = (v, max) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").slice(0, max) : "");
const unaLinea = (v, max) => texto(v, max).replace(/\s+/g, " ").trim();

// Mientras nadie las fije: a partes iguales entre quienes administran (los socios; si no hay, todo el crew).
function partesIguales(usuarios) {
    const crew = usuarios.filter((u) => !u.baja);
    const activos = crew.some((u) => u.admin) ? crew.filter((u) => u.admin) : crew;
    if (!activos.length) return {};
    const base = Math.floor(10000 / activos.length) / 100;
    const partes = Object.fromEntries(activos.map((u) => [u.id, base]));
    partes[activos[0].id] = Math.round((100 - base * (activos.length - 1)) * 100) / 100;
    return partes;
}

// El libro dentro de los datos del tablón; se crea la primera vez que se usa. Las partes se quedan sin fijar
// (null) hasta el primer movimiento: así, si alguien entra en el crew antes de empezar, también cuenta.
export function libroDe(datos) {
    if (!datos.libro || typeof datos.libro !== "object") datos.libro = {};
    const l = datos.libro;
    if (!l.partes || typeof l.partes !== "object" || Array.isArray(l.partes)) l.partes = null;
    if (!Array.isArray(l.categorias) || !l.categorias.length) l.categorias = [...CATEGORIAS_INICIALES];
    if (!Array.isArray(l.movimientos)) l.movimientos = [];
    return l;
}

// Las partes que valen ahora (sin tocar los datos).
export const partesDe = (datos) => datos.libro?.partes || partesIguales(datos.usuarios);

// Al apuntar el primer movimiento, el reparto se queda fijo (luego solo lo cambia quien administra).
export function fijarPartes(datos) {
    const l = libroDe(datos);
    if (!l.partes) l.partes = partesIguales(datos.usuarios);
    return l.partes;
}

function idDePersona(v, usuarios, que) {
    if (typeof v !== "string" || !usuarios.some((u) => u.id === v)) throw new ErrorDeDatos(`Falta ${que}.`);
    return v;
}

// Importe en céntimos: un entero positivo (el formulario ya convierte «12,50 €» en 1250).
export function importeValido(v) {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new ErrorDeDatos("El importe tiene que ser mayor que cero.");
    if (n > LIMITES.importe) throw new ErrorDeDatos("Ese importe es demasiado grande.");
    return n;
}

// Aplica sobre «m» los campos de «cambios» que sean válidos y devuelve la lista de los que han cambiado.
export function aplicarCambios(m, cambios, datos) {
    const usuarios = datos.usuarios;
    const cambiados = [];
    const poner = (campo, valor) => {
        if (JSON.stringify(m[campo]) === JSON.stringify(valor)) return;
        m[campo] = valor;
        cambiados.push(campo);
    };
    if ("tipo" in cambios) {
        if (!TIPOS.includes(cambios.tipo)) throw new ErrorDeDatos("Tipo de movimiento desconocido.");
        poner("tipo", cambios.tipo);
    }
    if ("fecha" in cambios) poner("fecha", fechaValida(cambios.fecha) || m.fecha);
    if ("concepto" in cambios) poner("concepto", unaLinea(cambios.concepto, LIMITES.concepto));
    if ("categoria" in cambios) poner("categoria", unaLinea(cambios.categoria, LIMITES.categoria));
    if ("importe" in cambios) poner("importe", importeValido(cambios.importe));
    if ("persona" in cambios) poner("persona", idDePersona(cambios.persona, usuarios, m.tipo === "ingreso" ? "quién lo ha cobrado" : "quién lo ha pagado"));
    if ("para" in cambios) poner("para", cambios.para ? idDePersona(cambios.para, usuarios, "a quién se le paga") : null);
    if ("notas" in cambios) poner("notas", texto(cambios.notas, LIMITES.notas));
    // Reglas de cada tipo
    if (m.tipo === "pago") {
        if (!m.para) throw new ErrorDeDatos("Falta a quién se le paga.");
        if (m.para === m.persona) throw new ErrorDeDatos("Un pago tiene que ser entre dos personas distintas.");
        if (m.categoria) poner("categoria", "");
    } else {
        if (m.para) poner("para", null);
        if (!m.concepto) throw new ErrorDeDatos(m.tipo === "gasto" ? "Pon en qué se ha gastado." : "Pon de dónde viene el dinero.");
    }
    if (!m.persona) throw new ErrorDeDatos("Falta quién lo ha pagado.");
    return cambiados;
}

export function crearMovimiento(entrada, usuario, datos) {
    const ahora = new Date().toISOString();
    const hoy = ahora.slice(0, 10);
    const m = {
        id: nuevoId(),
        tipo: "gasto",
        fecha: hoy,
        concepto: "",
        categoria: "",
        persona: null,
        para: null,
        importe: 0,
        notas: "",
        tique: null,
        creado: ahora,
        creadoPor: usuario.id,
        actualizado: ahora,
        actualizadoPor: usuario.id,
        borrado: null,
    };
    if (!("importe" in entrada)) throw new ErrorDeDatos("Falta el importe.");
    aplicarCambios(m, { tipo: entrada.tipo || "gasto", ...entrada }, datos);
    return m;
}

export const publico = (m) => ({ ...m });

// Partes: porcentajes por persona que suman 100.
export function partesValidas(v, usuarios) {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new ErrorDeDatos("Las partes no son válidas.");
    const partes = {};
    let suma = 0;
    for (const [id, valor] of Object.entries(v)) {
        if (!usuarios.some((u) => u.id === id)) continue;
        const n = Math.round(Number(valor) * 100) / 100;
        if (!Number.isFinite(n) || n < 0 || n > 100) throw new ErrorDeDatos("Cada parte tiene que estar entre 0 y 100.");
        if (n > 0) partes[id] = n;
        suma += n;
    }
    if (Math.abs(suma - 100) > 0.001) throw new ErrorDeDatos(`Las partes tienen que sumar 100 % (ahora suman ${String(Math.round(suma * 100) / 100).replace(".", ",")} %).`);
    return partes;
}

export function categoriasValidas(v) {
    if (!Array.isArray(v)) throw new ErrorDeDatos("Las categorías deben ser una lista.");
    const vistas = new Set();
    const salida = [];
    for (const c of v) {
        const limpia = unaLinea(c, LIMITES.categoria);
        const clave = limpia.toLowerCase();
        if (!limpia || vistas.has(clave)) continue;
        vistas.add(clave);
        salida.push(limpia);
        if (salida.length >= LIMITES.categorias) break;
    }
    if (!salida.length) throw new ErrorDeDatos("Tiene que haber al menos una categoría.");
    return salida;
}

// Reparte «total» céntimos según las partes (porcentajes), sin perder ni un céntimo por el redondeo: los que
// sobran van a quien tenía la parte más grande en los decimales.
export function repartir(total, partes) {
    const ids = Object.keys(partes).filter((id) => partes[id] > 0);
    const suma = ids.reduce((s, id) => s + partes[id], 0);
    const salida = {};
    if (!ids.length || !suma || !total) {
        for (const id of ids) salida[id] = 0;
        return salida;
    }
    const exactos = ids.map((id) => ({ id, exacto: (total * partes[id]) / suma }));
    let repartido = 0;
    for (const e of exactos) {
        salida[e.id] = Math.floor(e.exacto);
        repartido += salida[e.id];
    }
    exactos.sort((a, b) => b.exacto - Math.floor(b.exacto) - (a.exacto - Math.floor(a.exacto)) || (partes[b.id] - partes[a.id]));
    for (let i = 0; repartido < total; i = (i + 1) % exactos.length, repartido++) salida[exactos[i].id] += 1;
    return salida;
}

// Quién le tiene que pagar a quién para quedar en paz, con el menor número de pagos.
export function saldar(balances) {
    const deben = balances.filter((b) => b.balance < 0).map((b) => ({ id: b.id, falta: -b.balance })).sort((a, b) => b.falta - a.falta);
    const cobran = balances.filter((b) => b.balance > 0).map((b) => ({ id: b.id, falta: b.balance })).sort((a, b) => b.falta - a.falta);
    const pagos = [];
    let i = 0;
    let j = 0;
    while (i < deben.length && j < cobran.length) {
        const importe = Math.min(deben[i].falta, cobran[j].falta);
        if (importe > 0) pagos.push({ de: deben[i].id, a: cobran[j].id, importe });
        deben[i].falta -= importe;
        cobran[j].falta -= importe;
        if (!deben[i].falta) i++;
        if (!cobran[j].falta) j++;
    }
    return pagos;
}

// Todo lo que se calcula: lo de cada persona, quién debe a quién, por categoría y por mes.
export function resumen(libro, usuarios) {
    const partes = libro.partes || partesIguales(usuarios);
    const activos = libro.movimientos.filter((m) => !m.borrado);
    const suma = (lista) => lista.reduce((s, m) => s + m.importe, 0);
    const gastos = activos.filter((m) => m.tipo === "gasto");
    const ingresos = activos.filter((m) => m.tipo === "ingreso");
    const pagos = activos.filter((m) => m.tipo === "pago");
    const totalGastos = suma(gastos);
    const totalIngresos = suma(ingresos);
    const toca = repartir(totalGastos, partes);
    const recibe = repartir(totalIngresos, partes);
    const ids = new Set([...Object.keys(partes), ...activos.flatMap((m) => [m.persona, m.para]).filter(Boolean)]);
    const personas = usuarios
        .filter((u) => ids.has(u.id))
        .map((u) => {
            const de = (lista, campo = "persona") => suma(lista.filter((m) => m[campo] === u.id));
            const p = {
                id: u.id,
                parte: partes[u.id] || 0,
                haPagado: de(gastos),
                leToca: toca[u.id] || 0,
                haCobrado: de(ingresos),
                leCorresponde: recibe[u.id] || 0,
                pagosHechos: de(pagos),
                pagosRecibidos: de(pagos, "para"),
            };
            p.balance = p.haPagado - p.leToca - (p.haCobrado - p.leCorresponde) + p.pagosHechos - p.pagosRecibidos;
            return p;
        });
    const porCategoria = {};
    for (const g of gastos) {
        const c = g.categoria || "Sin categoría";
        porCategoria[c] = (porCategoria[c] || 0) + g.importe;
    }
    const meses = {};
    for (const m of [...gastos, ...ingresos]) {
        const mes = m.fecha.slice(0, 7);
        meses[mes] ||= { mes, gastos: 0, ingresos: 0 };
        meses[mes][m.tipo === "gasto" ? "gastos" : "ingresos"] += m.importe;
    }
    const sumaPartes = Object.values(partes).reduce((s, v) => s + v, 0);
    return {
        totalGastos,
        totalIngresos,
        resultado: totalIngresos - totalGastos,
        personas,
        deudas: saldar(personas),
        porCategoria: Object.entries(porCategoria)
            .map(([categoria, total]) => ({ categoria, total }))
            .sort((a, b) => b.total - a.total),
        porMes: Object.values(meses).sort((a, b) => (a.mes < b.mes ? -1 : 1)),
        partesCompletas: Math.abs(sumaPartes - 100) < 0.001,
        movimientos: activos.length,
    };
}

// ---------- exportar e importar ----------

const euros = (c) => (c / 100).toFixed(2).replace(".", ",");
const fechaEs = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

export function ordenar(movimientos) {
    return [...movimientos].sort((a, b) => (a.fecha === b.fecha ? (a.creado < b.creado ? -1 : 1) : a.fecha < b.fecha ? -1 : 1));
}

// CSV para abrirlo en Excel en español: separado por «;», coma decimal y con BOM para que respete los acentos.
export function csv(libro, usuarios) {
    const nombre = (id) => usuarios.find((u) => u.id === id)?.nombre || "";
    const celda = (v) => {
        const s = String(v ?? "");
        return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const filas = [["Fecha", "Tipo", "Concepto", "Categoría", "Quién", "Para quién", "Importe (€)", "Notas", "Tique"]];
    for (const m of ordenar(libro.movimientos.filter((x) => !x.borrado))) {
        filas.push([
            fechaEs(m.fecha),
            NOMBRES_TIPO[m.tipo],
            m.tipo === "pago" ? m.concepto || "Pago" : m.concepto,
            m.categoria,
            nombre(m.persona),
            nombre(m.para),
            euros(m.importe),
            m.notas,
            m.tique ? "Sí" : "",
        ]);
    }
    return "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n") + "\r\n";
}

// Lee un Excel con una hoja de gastos: la «Gastos» de la hoja de Drive (Fecha, Concepto, Categoría, Pagado por,
// Importe (€), Notas / tique) o la «Movimientos» de una descarga del propio libro. Se saltan las filas que
// empiezan por «EJEMPLO» y las que ya estaban (misma fecha, concepto, importe y persona).
export function importar(hojas, usuario, datos, normalizar, fechaDeCelda) {
    const libro = libroDe(datos);
    fijarPartes(datos);
    const n = (v) => normalizar(typeof v === "string" ? v.replace(/\(.*?\)|[¿?:€]/g, "") : "");
    const CAMPOS = {
        fecha: "fecha",
        tipo: "tipo",
        concepto: "concepto",
        categoria: "categoria",
        "pagado por": "persona",
        quien: "persona",
        persona: "persona",
        "cobrado por": "persona",
        "para quien": "para",
        importe: "importe",
        notas: "notas",
        "notas / tique": "notas",
        "notas tique": "notas",
    };
    let hoja = null;
    let filaCabecera = -1;
    let mapa = null;
    const candidatas = [...hojas].sort((a, b) => (["gastos", "movimientos"].includes(n(b.nombre)) ? 1 : 0) - (["gastos", "movimientos"].includes(n(a.nombre)) ? 1 : 0));
    for (const h of candidatas) {
        for (let r = 0; r < Math.min(12, h.filas.length); r++) {
            const cab = h.filas[r].map((c) => CAMPOS[n(c)] || null);
            if (cab.includes("concepto") && cab.includes("importe")) {
                hoja = h;
                filaCabecera = r;
                mapa = cab;
                break;
            }
        }
        if (hoja) break;
    }
    if (!hoja) throw new ErrorDeDatos("No encuentro ninguna hoja con las columnas «Concepto» e «Importe».");
    const usuarios = datos.usuarios;
    const persona = (v) => {
        const t = n(v);
        if (!t) return null;
        return (usuarios.find((u) => n(u.nombre) === t) || usuarios.find((u) => n(u.nombre).startsWith(t) || t.startsWith(n(u.nombre))))?.id || null;
    };
    const tipoDe = (v) => {
        const t = n(v);
        if (t.startsWith("ingres") || t.startsWith("cobr")) return "ingreso";
        if (t.startsWith("pago")) return "pago";
        return "gasto";
    };
    const importeDe = (v) => {
        if (typeof v === "number") return Math.round(v * 100);
        const s = String(v ?? "").replace(/[€\s]/g, "");
        if (!s || s === "-") return 0;
        // «1.234,56», «1234,56» o «1234.56»
        const limpio = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
        const x = Number(limpio);
        return Number.isFinite(x) ? Math.round(x * 100) : 0;
    };
    const clave = (m) => [m.fecha, n(m.concepto), m.importe, m.persona].join("|");
    const existentes = new Set(libro.movimientos.filter((m) => !m.borrado).map(clave));
    const nuevos = [];
    let repetidos = 0;
    let sinPersona = 0;
    for (const fila of hoja.filas.slice(filaCabecera + 1)) {
        const campo = {};
        mapa.forEach((c, i) => {
            if (c && fila[i] !== null && fila[i] !== undefined && fila[i] !== "") campo[c] = fila[i];
        });
        const concepto = String(campo.concepto ?? "").trim();
        if (!concepto || /^ejemplo\b/i.test(concepto)) continue;
        const importe = importeDe(campo.importe);
        if (importe <= 0) continue;
        const entrada = {
            tipo: tipoDe(campo.tipo),
            fecha: fechaDeCelda(campo.fecha) || new Date().toISOString().slice(0, 10),
            concepto,
            categoria: String(campo.categoria ?? "").trim(),
            persona: persona(campo.persona),
            para: persona(campo.para),
            importe,
            notas: String(campo.notas ?? "").trim(),
        };
        if (!entrada.persona) {
            sinPersona += 1;
            continue;
        }
        if (existentes.has(clave(entrada))) {
            repetidos += 1;
            continue;
        }
        try {
            const m = crearMovimiento(entrada, usuario, datos);
            libro.movimientos.push(m);
            nuevos.push(m);
            existentes.add(clave(m));
            if (m.categoria && !libro.categorias.some((c) => c.toLowerCase() === m.categoria.toLowerCase())) libro.categorias.push(m.categoria);
        } catch (error) {
            if (!(error instanceof ErrorDeDatos)) throw error;
        }
    }
    return { importados: nuevos.length, repetidos, sinPersona, hoja: hoja.nombre, nuevos };
}
