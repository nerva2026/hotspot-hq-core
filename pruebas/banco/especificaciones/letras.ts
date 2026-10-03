/*
 * Banco de pruebas · medir las letras: lo que avanza cada una y el hueco que deja detrás.
 *
 * Por qué: las letras de la casa son de píxeles, y unas pocas (cifras, B, C, E, G, Z, a, c, e, f, j, t…) salen de otras
 * fuentes, los «retoques» (`hs-retoques-*.woff`, `herramientas/retoques.py`). Si un retoque no avanza lo mismo que una
 * letra normal de su ancho, entre letra y letra quedan huecos desiguales («¿B ailamos», «C af é»). Pasó: a los
 * retoques les faltaban las tablas de «sin ajuste» y FreeType (Chromium en Linux, con «hinting») les cambiaba el
 * avance; mirar solo el tamaño de la letra (la «nitidez» de 08-letras) no lo veía.
 *
 * Aquí hay dos medidas, las dos letra a letra en el DOM con `Range.getClientRects()`:
 *
 *  - `medirLetras()` + `juzgarHuecos()`: en un texto de verdad (una burbuja), el hueco que deja cada letra detrás, en
 *    puntos de la letra. Tiene que ser 1 en todas.
 *  - `sondaDeLetras()` + `juzgarSonda()`: una muestra aparte, sin nada del estilo de las burbujas, con cada retoque al
 *    lado de letras normales, a los tamaños de la rejilla y en los dos pesos. Cada retoque tiene que avanzar lo que
 *    dice su dibujo (o eso mismo redondeado a píxeles enteros, que es lo que hace el «hinting» con las letras
 *    normales), y lo mismo que una letra normal de su ancho.
 *
 * Este archivo no importa nada (solo tipos): así se puede ejecutar también fuera del banco, con Node y un Chromium
 * cualquiera, contra una página suelta con el mismo CSS y las mismas fuentes, con y sin «hinting» (así se probó: da
 * «mal» con los retoques de antes y «bien» con los de ahora). Lo que va dentro de la página (`...EnPagina`) son
 * funciones sueltas que no usan nada de fuera: Playwright las manda al navegador tal cual.
 */
import type { Page } from "@playwright/test";

// ---------- las medidas del dibujo (las de herramientas/retoques.py: si allí cambian, aquí también) ----------

/** Un punto de Pixelify Sans, en em (93 de 1000): a 10,75 px mide 1 px. */
export const PUNTO = 0.093;
/** Lo que deja Pixelify Sans a cada lado del dibujo, en em. */
const MARGEN = 0.06;
/** Cuánto ensanchan los retoques de la negrita (pesos 550-700) cada letra, en em. */
const GRUESO_NEGRA = 0.058;
/** Las letras retocadas de Pixelify Sans, por columnas de puntos de su dibujo. */
export const RETOCADAS: Record<number, string> = { 5: "23456789BCEGZaceÉàáèé€", 4: "0", 3: "1ft", 2: "()jí" };
/** Letras normales de Pixelify Sans (sin retocar), por columnas: las de 5 miden lo mismo que las retocadas de 5. */
export const NORMALES: Record<number, string> = { 7: "MWmw", 5: "ADFHJKLNOPQRSTUVXYbdghknopqrsuxyzóúñü¿?", 3: "I", 1: "il.:!¡" };
/** Lo que mide el dibujo de las letras normales, en em, a peso 400 y a peso 700 (la letra es variable: engorda con el peso). */
const TINTA_NORMAL: Record<number, [number, number]> = { 7: [0.646, 0.657], 5: [0.465, 0.481], 3: [0.283, 0.304], 1: [0.101, 0.127] };
/** Silkscreen: sus cifras retocadas tienen el ancho de diseño de su A (y el 1, el de su E): tienen que medir igual. */
const CIFRAS_DE_TITULO = "0123456789";
const MARGEN_DE_TITULO = 0.05;

function columnasEn(tabla: Record<number, string>, letra: string): number | null {
    for (const [columnas, letras] of Object.entries(tabla)) if (letras.includes(letra)) return Number(columnas);
    return null;
}
/** El avance que dice el dibujo de un retoque de Pixelify Sans, en em: margen, columnas y margen (más el grueso en negrita). */
export function avanceDeDiseno(letra: string, peso: number): number | null {
    const columnas = columnasEn(RETOCADAS, letra);
    return columnas === null ? null : 2 * MARGEN + columnas * PUNTO + (peso >= 550 ? GRUESO_NEGRA : 0);
}

const redondo = (n: number, cifras = 2): number => Math.round(n * 10 ** cifras) / 10 ** cifras;

// ---------- 1 · un texto de verdad: el hueco que deja cada letra ----------

export type LetraMedida = { letra: string; ancho: number; x: number; y: number };
export type MedidaDeLetras = {
    /** `font-size` del elemento, en px de CSS (sin la ampliación del juego). */
    tamano: number;
    peso: number;
    /** `letter-spacing`, en px de CSS. */
    espaciado: number;
    /** Cuántos px de la pantalla mide un px del elemento (las burbujas viven dentro del juego, que se amplía). */
    ampliacion: number;
    densidad: number;
    trazado: string;
    /** Cada letra (sin los espacios), con lo que avanza en px de la pantalla. */
    letras: LetraMedida[];
};

/** DENTRO DE LA PÁGINA. Mide lo que avanza cada letra del texto de un elemento. No usa nada de fuera. */
export function medirLetrasEnPagina(selector: string): MedidaDeLetras | null {
    const elemento = document.querySelector(selector) as HTMLElement | null;
    if (!elemento) return null;
    const estilo = getComputedStyle(elemento);
    // La ampliación, con una regla de 100 px puesta dentro (no ocupa sitio ni se ve) y quitada al momento
    const regla = document.createElement("span");
    regla.style.cssText = "position:absolute;left:0;top:0;width:100px;height:1px;visibility:hidden;pointer-events:none";
    elemento.appendChild(regla);
    const ampliacion = regla.getBoundingClientRect().width / 100 || 1;
    regla.remove();
    const letras: { letra: string; ancho: number; x: number; y: number }[] = [];
    const caminante = document.createTreeWalker(elemento, NodeFilter.SHOW_TEXT);
    const rango = document.createRange();
    for (let nodo = caminante.nextNode(); nodo; nodo = caminante.nextNode()) {
        const texto = nodo.textContent ?? "";
        let i = 0;
        for (const letra of texto) {
            rango.setStart(nodo, i);
            rango.setEnd(nodo, i + letra.length);
            i += letra.length;
            if (letra.trim() === "") continue;
            const cajas = rango.getClientRects();
            if (cajas.length === 0) continue;
            letras.push({ letra, ancho: cajas[0].width, x: cajas[0].left, y: cajas[0].top });
        }
    }
    return {
        tamano: parseFloat(estilo.fontSize),
        peso: Number(estilo.fontWeight) || 400,
        espaciado: parseFloat(estilo.letterSpacing) || 0,
        ampliacion,
        densidad: window.devicePixelRatio || 1,
        trazado: estilo.getPropertyValue("text-rendering"),
        letras,
    };
}

export async function medirLetras(pagina: Page, selector: string): Promise<MedidaDeLetras | null> {
    return pagina.evaluate(medirLetrasEnPagina, selector);
}

export type JuicioDeHuecos = {
    /** Cada letra retocada deja detrás un punto justo (±TOLERANCIA_DE_HUECO) y avanza como las normales de su ancho. */
    parejos: boolean;
    letraEnPantalla_px: number;
    unPuntoEnPantalla_px: number;
    /** El hueco más estrecho y el más ancho que dejan las retocadas, en puntos de la letra (lo bueno: 1 y 1). */
    huecoDeLasRetocadas_puntos: [number, number] | null;
    /** Lo mismo de las normales (no cuenta para el veredicto: entre algunas parejas, «de», «bo», la letra junta un poco). */
    huecoDeLasNormales_puntos: [number, number] | null;
    /** Lo que avanzan, en px de la pantalla, las letras de 5 columnas: la media de las retocadas y la mediana de las normales. */
    avanceRetocadasDe5_px: number | null;
    avanceNormalesDe5_px: number | null;
    /** Lo más que se aparta una retocada de 5 columnas de las normales de 5 columnas, en px de CSS del elemento. */
    diferenciaRetocadaNormal_px: number | null;
    /** Las retocadas cuyo hueco no es de un punto: «letra hueco». */
    desiguales: string[];
    letrasMedidas: number;
    retocadasMedidas: number;
    /** La tabla entera: «letra[*] avance_en_pantalla hueco_en_puntos», con * en las retocadas. */
    tabla: string;
};

/** Cuánto puede apartarse un hueco de un punto justo, en puntos (el fallo de los retoques sin ajuste daba 0,71 y 1,71). */
export const TOLERANCIA_DE_HUECO = 0.25;
/** Cuánto puede avanzar de más o de menos una retocada respecto de una normal de su ancho, en px de CSS (el fallo: 1 px). */
export const TOLERANCIA_DE_AVANCE = 0.25;

/**
 * ¿Deja cada letra el mismo hueco detrás? El hueco es lo que avanza la letra menos lo que mide su dibujo (sus
 * columnas de puntos), y se da en puntos de la letra: en las burbujas, que quitan 0,027 em entre letra y letra, tiene
 * que salir 1. Se juzgan las retocadas (su hueco, y que avancen como las normales de su ancho); de las normales se
 * deja el dato.
 */
export function juzgarHuecos(m: MedidaDeLetras): JuicioDeHuecos {
    const filas: string[] = [];
    const desiguales: string[] = [];
    const huecosRetocadas: number[] = [];
    const huecosNormales: number[] = [];
    const retocadasDe5: number[] = [];
    const normalesDe5: number[] = [];
    const cuantoDe700 = Math.min(1, Math.max(0, (m.peso - 400) / 300));
    for (const l of m.letras) {
        const deRetoque = columnasEn(RETOCADAS, l.letra);
        const columnas = deRetoque ?? columnasEn(NORMALES, l.letra);
        if (columnas === null) {
            filas.push(`${l.letra} ${redondo(l.ancho)} -`);
            continue;
        }
        const avance = l.ancho / m.ampliacion; // en px de CSS del elemento
        const dibujo = deRetoque !== null ? columnas * PUNTO + (m.peso >= 550 ? GRUESO_NEGRA : 0) : TINTA_NORMAL[columnas][0] + (TINTA_NORMAL[columnas][1] - TINTA_NORMAL[columnas][0]) * cuantoDe700;
        const hueco = (avance / m.tamano - dibujo) / PUNTO;
        if (deRetoque !== null) {
            huecosRetocadas.push(hueco);
            if (columnas === 5) retocadasDe5.push(avance);
            if (Math.abs(hueco - 1) > TOLERANCIA_DE_HUECO) desiguales.push(`${l.letra}* ${redondo(hueco)}`);
        } else {
            huecosNormales.push(hueco);
            if (columnas === 5) normalesDe5.push(avance);
        }
        filas.push(`${l.letra}${deRetoque !== null ? "*" : ""} ${redondo(l.ancho)} ${redondo(hueco)}`);
    }
    const extremos = (v: number[]): [number, number] | null => (v.length > 0 ? [redondo(Math.min(...v)), redondo(Math.max(...v))] : null);
    const ordenadas = [...normalesDe5].sort((a, b) => a - b);
    const mediana = ordenadas.length > 0 ? ordenadas[Math.floor(ordenadas.length / 2)] : null;
    const diferencia = mediana !== null && retocadasDe5.length > 0 ? Math.max(...retocadasDe5.map((a) => Math.abs(a - mediana))) : null;
    const mediaRetocadas = retocadasDe5.length > 0 ? retocadasDe5.reduce((a, b) => a + b, 0) / retocadasDe5.length : null;
    return {
        parejos: huecosRetocadas.length > 0 && desiguales.length === 0 && (diferencia === null || diferencia <= TOLERANCIA_DE_AVANCE),
        letraEnPantalla_px: redondo(m.tamano * m.ampliacion),
        unPuntoEnPantalla_px: redondo(m.tamano * m.ampliacion * PUNTO),
        huecoDeLasRetocadas_puntos: extremos(huecosRetocadas),
        huecoDeLasNormales_puntos: extremos(huecosNormales),
        avanceRetocadasDe5_px: mediaRetocadas === null ? null : redondo(mediaRetocadas * m.ampliacion),
        avanceNormalesDe5_px: mediana === null ? null : redondo(mediana * m.ampliacion),
        diferenciaRetocadaNormal_px: diferencia === null ? null : redondo(diferencia, 3),
        desiguales,
        letrasMedidas: huecosRetocadas.length + huecosNormales.length,
        retocadasMedidas: huecosRetocadas.length,
        tabla: filas.join(" | "),
    };
}

// ---------- 2 · la muestra aparte: cada retoque al lado de letras normales ----------

export type MuestraDeSonda = { familia: string; peso: number; tamano: number; avances: Record<string, number> };
export type MedidaDeSonda = { densidad: number; muestras: MuestraDeSonda[] };

/** Los tamaños de la muestra: los de la rejilla de cada letra y los 21,5 px de las burbujas sin ampliar. */
export const TAMANOS_DE_TEXTO = [10.75, 11, 16, 21.5, 22];
export const TAMANOS_DE_TITULO = [8, 16, 21.5, 24];

/**
 * DENTRO DE LA PÁGINA. Pone una muestra invisible con las dos letras de la casa en sus dos pesos y a varios tamaños,
 * sin separación entre letras ni nada del estilo de las burbujas, mide lo que avanza cada carácter y la quita.
 */
export async function sondaDeLetrasEnPagina(pedido: { texto: string; titulo: string; tamanosDeTexto: number[]; tamanosDeTitulo: number[] }): Promise<{ densidad: number; muestras: { familia: string; peso: number; tamano: number; avances: Record<string, number> }[] }> {
    const lineas: { familia: string; peso: number; tamano: number; texto: string }[] = [];
    for (const peso of [400, 700]) {
        for (const tamano of pedido.tamanosDeTexto) lineas.push({ familia: "Pixelify Sans", peso, tamano, texto: pedido.texto });
        for (const tamano of pedido.tamanosDeTitulo) lineas.push({ familia: "Silkscreen", peso, tamano, texto: pedido.titulo });
    }
    await Promise.all(lineas.map((l) => document.fonts.load(`${l.peso} ${l.tamano}px "${l.familia}"`, l.texto)));
    await document.fonts.ready;
    const caja = document.createElement("div");
    caja.style.cssText = "position:fixed;left:0;top:0;z-index:-1;opacity:0;pointer-events:none;white-space:nowrap;letter-spacing:0;word-spacing:0;font-kerning:none;font-variant-ligatures:none;text-transform:none;text-rendering:auto";
    const nodos: Text[] = [];
    for (const l of lineas) {
        const fila = document.createElement("div");
        fila.style.cssText = `font-family:"${l.familia}";font-weight:${l.peso};font-size:${l.tamano}px;line-height:1.5;font-style:normal`;
        const nodo = document.createTextNode(l.texto);
        fila.appendChild(nodo);
        caja.appendChild(fila);
        nodos.push(nodo);
    }
    document.body.appendChild(caja);
    const rango = document.createRange();
    const muestras = lineas.map((l, n) => {
        const avances: Record<string, number> = {};
        let i = 0;
        for (const letra of l.texto) {
            rango.setStart(nodos[n], i);
            rango.setEnd(nodos[n], i + letra.length);
            i += letra.length;
            const cajas = rango.getClientRects();
            if (cajas.length > 0) avances[letra] = cajas[0].width;
        }
        return { familia: l.familia, peso: l.peso, tamano: l.tamano, avances };
    });
    caja.remove();
    return { densidad: window.devicePixelRatio || 1, muestras };
}

/** El texto de la muestra de Pixelify Sans: todos los retoques y unas letras normales de 5, de 3 y de 1 columnas. */
export const TEXTO_DE_SONDA = Object.values(RETOCADAS).join("") + "onsuIil";
export const TITULO_DE_SONDA = CIFRAS_DE_TITULO + "AEOH";

export async function sondaDeLetras(pagina: Page): Promise<MedidaDeSonda> {
    return pagina.evaluate(sondaDeLetrasEnPagina, { texto: TEXTO_DE_SONDA, titulo: TITULO_DE_SONDA, tamanosDeTexto: TAMANOS_DE_TEXTO, tamanosDeTitulo: TAMANOS_DE_TITULO });
}

export type JuicioDeSonda = {
    /** Todos los retoques avanzan lo que dice su dibujo (exacto o redondeado a píxeles enteros) y como las letras normales de su ancho. */
    bien: boolean;
    /** Si el navegador ajusta las letras a la rejilla («hinting»): se ve en que una «o» normal a 10,75 px avanza 6 px justos y no 6,3. */
    conHinting: boolean;
    retoquesMedidos: number;
    /** Los retoques que no avanzan lo que deben: «letra, familia peso tamaño: mide X, su dibujo dice Y (redondeado, Z)». */
    desajustados: string[];
    /** Una línea por muestra: «Pixelify Sans 400 10.75px · o 6 · a* 6 · 0* 5 · f* 4 · j* 3 · I 4». */
    tabla: string[];
};

/**
 * ¿Es `medido` el avance `exacto` o ese mismo redondeado a píxeles enteros de la pantalla? Con un margen de 0,05 px: el
 * navegador da las cajas en 64.os de píxel, y el fallo que se busca es de medio píxel o más.
 */
function comoElDibujo(medido: number, exacto: number, densidad: number): boolean {
    const MARGEN_DE_MEDIDA = 0.05;
    if (Math.abs(medido - exacto) <= MARGEN_DE_MEDIDA) return true;
    const enPantalla = exacto * densidad;
    // justo en el medio píxel el redondeo puede caer a cualquiera de los dos lados
    return [Math.floor(enPantalla + 0.5 - 0.02), Math.floor(enPantalla + 0.5 + 0.02)].some((r) => Math.abs(medido - r / densidad) <= MARGEN_DE_MEDIDA);
}

export function juzgarSonda(m: MedidaDeSonda): JuicioDeSonda {
    const desajustados: string[] = [];
    const tabla: string[] = [];
    let retoques = 0;
    let conHinting = false;
    for (const s of m.muestras) {
        const donde = `${s.familia} ${s.peso} ${s.tamano}px`;
        const de = (letra: string): number | undefined => s.avances[letra];
        if (s.familia === "Pixelify Sans") {
            const o = de("o");
            if (s.peso === 400 && s.tamano === 10.75 && o !== undefined) conHinting = Math.abs(o * m.densidad - Math.round(o * m.densidad)) < 0.01;
            for (const letra of Object.values(RETOCADAS).join("")) {
                const medido = de(letra);
                const diseno = avanceDeDiseno(letra, s.peso);
                if (medido === undefined || diseno === null) continue;
                retoques++;
                const exacto = diseno * s.tamano;
                if (!comoElDibujo(medido, exacto, m.densidad)) {
                    desajustados.push(`${letra}, ${donde}: mide ${redondo(medido, 3)}, su dibujo dice ${redondo(exacto, 3)} (redondeado, ${Math.round(exacto * m.densidad) / m.densidad})`);
                    continue;
                }
                // Y como una letra normal de su ancho: a peso 400 las de 5 columnas miden como la «o» y las de 3, como la «I»
                // (586 y 404 milésimas frente a 585 y 399: con «hinting» redondean igual a estos tamaños).
                const columnas = columnasEn(RETOCADAS, letra);
                const normal = s.peso === 400 ? (columnas === 5 ? o : columnas === 3 ? de("I") : undefined) : undefined;
                if (normal !== undefined && Math.abs(medido - normal) > TOLERANCIA_DE_AVANCE) {
                    desajustados.push(`${letra}, ${donde}: mide ${redondo(medido, 3)} y la ${columnas === 5 ? "«o»" : "«I»"}, que es de su ancho, ${redondo(normal, 3)}`);
                }
            }
            tabla.push(`${donde} · ` + ["o", "a", "B", "5", "0", "f", "t", "1", "I", "j", "(", "i"].filter((l) => de(l) !== undefined).map((l) => `${l}${columnasEn(RETOCADAS, l) !== null ? "*" : ""} ${redondo(de(l) as number, 3)}`).join(" · "));
        } else {
            const A = de("A");
            const E = de("E");
            for (const cifra of CIFRAS_DE_TITULO) {
                const medido = de(cifra);
                const normal = cifra === "1" ? E : A;
                if (medido === undefined || normal === undefined) continue;
                retoques++;
                if (Math.abs(medido - normal) > MARGEN_DE_TITULO) desajustados.push(`${cifra}, ${donde}: mide ${redondo(medido, 3)} y la ${cifra === "1" ? "E" : "A"}, que es de su ancho, ${redondo(normal, 3)}`);
            }
            tabla.push(`${donde} · ` + ["A", "0", "4", "E", "1"].filter((l) => de(l) !== undefined).map((l) => `${l}${CIFRAS_DE_TITULO.includes(l) ? "*" : ""} ${redondo(de(l) as number, 3)}`).join(" · "));
        }
    }
    return { bien: retoques > 0 && desajustados.length === 0, conHinting, retoquesMedidos: retoques, desajustados, tabla };
}

// ---------- 3 · tamaños de la rejilla ----------

/** ¿Es un tamaño de la rejilla de Pixelify Sans? (11, 16 o 21–22 px; `tareas/README.md`, «Las cifras, en la rejilla de su letra») */
export function esDeLaRejillaDeTexto(tamano: string | undefined | null): boolean {
    const px = parseFloat(tamano ?? "");
    return px === 11 || px === 16 || (px >= 21 && px <= 22);
}
