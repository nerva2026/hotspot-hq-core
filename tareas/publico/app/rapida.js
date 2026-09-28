// Alta rápida: entiende atajos escritos en el propio título.
//
//   Llamar a la sala para el viernes @víctor !alta #bolos
//   → título «Llamar a la sala», para el viernes, responsable Víctor, prioridad alta, etiqueta «bolos»
//
// Atajos: @persona (o @todos), !urgente !alta !media !baja (o !!! y !!), #etiqueta,
// «para hoy / mañana / pasado mañana / el lunes… / el 15/10 / el 15 de octubre», o una fecha suelta 15/10.

import { normalizar, hoy, sumarDias, diaSemana, MESES } from "./util.js";

const DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

function fechaDe(texto, h0) {
    const t = normalizar(texto).replace(/^(el|la)\s+/, "");
    if (t === "hoy") return h0;
    if (t === "manana") return sumarDias(h0, 1);
    if (t === "pasado manana") return sumarDias(h0, 2);
    const d = DIAS.indexOf(t);
    if (d >= 0) {
        let n = (d - diaSemana(h0) + 7) % 7;
        if (n === 0) n = 7;
        return sumarDias(h0, n);
    }
    let m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(t);
    let dia;
    let mes;
    let anio;
    if (m) {
        dia = Number(m[1]);
        mes = Number(m[2]);
        anio = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : null;
    } else {
        m = /^(\d{1,2}) de ([a-z]+)(?: de (\d{4}))?$/.exec(t);
        if (!m) return null;
        const i = MESES.findIndex((x) => normalizar(x) === m[2] || normalizar(x).slice(0, 3) === m[2]);
        if (i < 0) return null;
        dia = Number(m[1]);
        mes = i + 1;
        anio = m[3] ? Number(m[3]) : null;
    }
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    const dos = (n) => String(n).padStart(2, "0");
    if (!anio) {
        anio = Number(h0.slice(0, 4));
        // Una fecha que ya pasó hace más de una semana se entiende del año que viene.
        if (`${anio}-${dos(mes)}-${dos(dia)}` < sumarDias(h0, -7)) anio += 1;
    }
    const iso = `${anio}-${dos(mes)}-${dos(dia)}`;
    const f = new Date(Date.UTC(anio, mes - 1, dia));
    return f.getUTCDate() === dia ? iso : null;
}

const PALABRA_FECHA =
    "(?:hoy|mañana|manana|pasado mañana|pasado manana|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|\\d{1,2}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?|\\d{1,2} de [a-záéíóú]+(?: de \\d{4})?)";

export function interpretar(texto, usuarios, h0 = hoy()) {
    let resto = ` ${texto} `;
    const r = { titulo: "", responsables: [], prioridad: null, etiquetas: [], fin: null, piezas: [] };

    // Fecha: «para (el) …» o una fecha suelta dd/mm
    const reFecha = new RegExp(`\\s(?:para\\s+(?:el\\s+|la\\s+)?)(${PALABRA_FECHA})(?=[\\s.,;!?]|$)`, "iu");
    let m = reFecha.exec(resto);
    if (m) {
        const f = fechaDe(m[1], h0);
        if (f) {
            r.fin = f;
            r.piezas.push({ tipo: "fecha", valor: f });
            resto = resto.slice(0, m.index) + " " + resto.slice(m.index + m[0].length);
        }
    }
    if (!r.fin) {
        m = /\s(\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?)(?=[\s.,;!?]|$)/.exec(resto);
        if (m) {
            const f = fechaDe(m[1], h0);
            if (f) {
                r.fin = f;
                r.piezas.push({ tipo: "fecha", valor: f });
                resto = resto.slice(0, m.index) + " " + resto.slice(m.index + m[0].length);
            }
        }
    }

    // Personas
    resto = resto.replace(/\s@([\p{L}\d_.-]+)/gu, (todo, nombre) => {
        const n = normalizar(nombre);
        if (["todos", "losdos", "ambos", "todas"].includes(n)) {
            for (const u of usuarios) if (!r.responsables.includes(u.id)) r.responsables.push(u.id);
            r.piezas.push({ tipo: "persona", valor: "todos" });
            return " ";
        }
        const u = usuarios.find((x) => normalizar(x.nombre) === n) || usuarios.find((x) => normalizar(x.nombre).startsWith(n));
        if (!u) return todo;
        if (!r.responsables.includes(u.id)) r.responsables.push(u.id);
        r.piezas.push({ tipo: "persona", valor: u.id });
        return " ";
    });

    // Prioridad
    resto = resto.replace(/\s(!!!|!!|!(?:urgente|alta|media|baja))(?=\s)/giu, (todo, p) => {
        const v = p === "!!!" ? "urgente" : p === "!!" ? "alta" : normalizar(p.slice(1));
        r.prioridad = v;
        r.piezas.push({ tipo: "prioridad", valor: v });
        return " ";
    });

    // Etiquetas
    resto = resto.replace(/\s#(\p{L}[\p{L}\d_-]*)/gu, (todo, e) => {
        const v = normalizar(e).slice(0, 30);
        if (v && !r.etiquetas.includes(v)) {
            r.etiquetas.push(v);
            r.piezas.push({ tipo: "etiqueta", valor: v });
        }
        return " ";
    });

    r.titulo = resto.replace(/\s+/g, " ").trim();
    return r;
}
