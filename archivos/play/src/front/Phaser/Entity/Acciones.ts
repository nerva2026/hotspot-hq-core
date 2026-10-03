import * as Phaser from "phaser";
import { PositionMessage_Direction } from "@workadventure/messages";
import { PlayerAnimationTypes } from "../Player/Animation";
import type { Character } from "./Character";

/**
 * Acciones de los muñecos (parche 08 de hotspot-hq-core; este archivo va en «archivos/», el parche solo lo engancha).
 *
 * El script del mapa (src/hq.js del repositorio de mapas) guarda en dos variables públicas del jugador lo que hace:
 *
 * - «accion»: una postura y, si se quiere, un efecto, unidos con «+».
 *     posturas: "bailar", "sentado:arriba" | "sentado:abajo" | "sentado:izquierda" | "sentado:derecha",
 *               "saludar", "aplaudir", "beber" y "quieto" (de pie sin más: sirve para llevar solo un efecto)
 *     efectos:  "notas", "gotas", "nube", "burbujas", "zetas", "corazones" y "chispas" (dibujitos que suben sobre la
 *               cabeza) y dos gestos, que valen con cualquier postura: "mano" (la mano que saluda, junto a la cabeza)
 *               y "palmas" (dos manos que se juntan y se separan delante del pecho, con un destello a cada lado
 *               cuando chocan)
 *   Ejemplos: "bailar" (lleva las notas de serie), "sentado:abajo", "sentado:abajo+zetas", "quieto+burbujas",
 *   "sentado:abajo+mano" (saluda sin levantarse), "bailar+palmas". "saludar" es de pie, de frente y con la mano de
 *   serie; "aplaudir", de pie, de frente, con un botecito y las palmas de serie.
 * - «lleva»: lo que tiene en la mano ("lata", "cafe", "agua", "cana", "snack" o "disco"), o nada.
 *
 * Sentado no es el muñeco de pie un poco más bajo: a sus dibujos se les recortan las piernas (setCrop: se ven la
 * cabeza, el tronco y el arranque del pantalón), bajan lo recortado para quedar apoyados donde estaban los pies y
 * delante se les ponen unas piernas de sentado (de frente, abiertas hacia delante; de lado, estiradas hacia ese lado;
 * de espaldas, solo la base), del color de su pantalón. Al dejar de estar sentado (andar, otra postura, nada) el
 * recorte se quita siempre.
 *
 * Quien deja de estar sentado SIN andar (se levanta con la X, o pasa a otra postura) se queda de pie mirando hacia
 * donde miraba el asiento, hasta que ande o gire: sin esto, quien había llegado al sofá andando hacia arriba se
 * levantaba de espaldas. El script del mapa no puede girar al jugador; el cambio de la variable les llega a todos, así
 * que todos lo dibujan igual. Es solo el dibujo: el muñeco es el de siempre, quieto, mirando hacia ese lado (el que se
 * levanta de un asiento que mira hacia abajo queda exactamente igual que uno que no ha hecho nada y mira hacia abajo).
 *
 * Qué significa cada cosa (y con qué palabras se ofrece) lo decide el mapa: aquí solo se dibuja. Las variables llegan
 * a todos (a quien entra después también, en la lista inicial de jugadores). Un valor que no se entiende se toma
 * por «nada»: así un mapa más nuevo que esta oficina, o al revés, no rompe nada.
 *
 * Las posturas solo se ven mientras el muñeco está quieto: en cuanto anda, dibujar() lo deja todo en su sitio y
 * Character.playAnimation dibuja lo de siempre (lo que lleva en la mano sí se ve al andar). No se toca la posición del
 * muñeco (ni su cuerpo, ni las colisiones, ni el nombre, la burbuja o el compañero): solo se mueven sus dibujos dentro
 * de él y se le añaden dibujos pequeños. El ritmo sale del reloj (Date.now), no de un contador propio, así que todos
 * los que bailan van a la vez.
 */

// Hacia dónde mira un asiento (nombre del script del mapa) → nombre en las animaciones del muñeco
const MIRADAS = new Map([
    ["arriba", "up"],
    ["abajo", "down"],
    ["izquierda", "left"],
    ["derecha", "right"],
]);
const POSTURAS = new Set(["bailar", "saludar", "aplaudir", "beber", "quieto"]);
// Hacia dónde anda el muñeco → nombre en sus animaciones
const CARAS = new Map([
    [PositionMessage_Direction.UP, "up"],
    [PositionMessage_Direction.DOWN, "down"],
    [PositionMessage_Direction.LEFT, "left"],
    [PositionMessage_Direction.RIGHT, "right"],
]);

const TIEMPO = 500; // ms por tiempo (120 pulsos por minuto)
const TIEMPOS_POR_LADO = 2; // cada cuántos tiempos cambia de lado al bailar
const REBOTE = 4; // píxeles del dibujo que sube en cada bote al bailar (se amplían con la escala del muñeco)
const PALMADA = 2; // lo que sube en cada palmada al aplaudir
// Sentado: del fotograma de 32×32 solo se ven las filas de arriba (la cabeza, el tronco y el arranque del pantalón);
// lo demás se recorta y el cuerpo baja lo recortado, para que quede apoyado donde estaban los pies. Delante van las
// piernas (PIERNAS). En todos los muñecos de la casa el tronco llega hasta la fila 25, el pantalón son las filas 26 a 28
// y los zapatos, la 29 y la 30 (todos del mismo color), con el contorno en la 31.
const LADO_FOTOGRAMA = 32;
const FILAS_SENTADO = 28; // filas del fotograma que se ven sentado (de la 0 a la 27)
const SENTADO = 4; // píxeles del dibujo que baja al sentarse: las filas recortadas (de la 28 a la 31)
const SUBEN = 3; // dibujitos a la vez sobre la cabeza: sale uno por tiempo y cada uno dura SUBEN tiempos
const SUBIDA = 36; // píxeles que sube un dibujito mientras vive
const LADOS = [-14, 14, -8, 18, -18, 8]; // por dónde sale cada dibujito, a un lado y a otro (se van alternando)

const TINTA = "#1c1715";
const PIXEL = 2; // cada punto de un dibujo es un cuadrado de 2×2, como los del muñeco

type Dibujo = { forma: string[]; colores: Record<string, string> };

// Dibujos en pixel art: cada letra es un color de «colores» y el punto es hueco. El contorno de tinta se calcula solo.
const NARANJA = "#e0562a";
const AMARILLO = "#ffd84a";
const CREMA = "#f3e6d8";
const CORCHEA = ["..XX.", "..X.X", "..X..", "..X..", "XXX..", "XXX..", ".X..."];
const DOS_CORCHEAS = ["..XXXXX", "..XXXXX", "..X...X", "..X...X", "XXX.XXX", "XXX.XXX", ".X...X."];
const GOTA = ["..X..", ".XXX.", "XXhXX", "XXXXX", ".XXX."];
const NUBE = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX."];
const BURBUJA = [".XX.", "XhhX", "XhhX", ".XX."];
const ZETA = ["XXXX", "..X.", ".X..", "XXXX"];
const CORAZON = [".X.X.", "XXXXX", "XXXXX", ".XXX.", "..X.."];
const CHISPA = ["..X..", "..X..", "XXhXX", "..X..", "..X.."];

/** Lo que sube sobre la cabeza con cada efecto: una lista de dibujos que se van alternando. */
const EFECTOS: Record<string, Dibujo[]> = {
    notas: [
        { forma: CORCHEA, colores: { X: NARANJA } },
        { forma: CORCHEA, colores: { X: AMARILLO } },
        { forma: DOS_CORCHEAS, colores: { X: NARANJA } },
        { forma: DOS_CORCHEAS, colores: { X: AMARILLO } },
    ],
    gotas: [{ forma: GOTA, colores: { X: "#6fc3f5", h: "#d9f1ff" } }],
    nube: [
        { forma: NUBE, colores: { X: "#b89a7a" } },
        { forma: NUBE, colores: { X: "#d2bda3" } },
    ],
    burbujas: [
        { forma: BURBUJA, colores: { X: "#8fd4ff", h: "#eaf8ff" } },
        { forma: BURBUJA, colores: { X: "#bfe9ff", h: "#ffffff" } },
    ],
    zetas: [{ forma: ZETA, colores: { X: "#8fb8d8" } }],
    corazones: [
        { forma: CORAZON, colores: { X: "#e8467c" } },
        { forma: CORAZON, colores: { X: NARANJA } },
    ],
    chispas: [
        { forma: CHISPA, colores: { X: AMARILLO, h: "#ffffff" } },
        { forma: CHISPA, colores: { X: NARANJA, h: AMARILLO } },
    ],
};

/** La mano que saluda (se balancea junto a la cabeza). */
const MANO: Dibujo = {
    forma: ["..X.X.X.", "..X.X.X.", "X.X.X.X.", "X.XXXXX.", "XXXXXXX.", ".XXXXXX.", "..XXXX..", "..XXXX.."],
    colores: { X: AMARILLO },
};

/** Las palmas del aplauso: dos manos pequeñas delante del pecho, que se juntan y se separan, y el destello al chocar. */
const PALMA: Dibujo = { forma: [".XX.", "XXXX", "XXXX", ".XX."], colores: { X: AMARILLO } };
const DESTELLO: Dibujo = { forma: [".X.", "XXX", ".X."], colores: { X: "#ffffff" } };
const PALMAS_Y = 4; // la altura de las manos (su borde de abajo), en píxeles desde el centro del muñeco: en el pecho
const PALMAS_JUNTAS = 4; // lo que se aparta cada mano del centro cuando están juntas, en píxeles
const PALMAS_ABREN = 5; // y lo que se separa cada una de más al abrirse
const DESTELLO_X = 14; // dónde saltan los destellos: a los lados, a la altura de los hombros
const DESTELLO_Y = -6;

type Piernas = { forma: string[]; x: number; y: number };

/**
 * Las piernas de quien está sentado, que se pintan delante del cuerpo recortado. «P» es el color del pantalón del
 * muñeco (se lee de su dibujo) y «Z», el de los zapatos. «x» e «y» dicen dónde va el dibujo (su borde de abajo, por
 * el centro), en píxeles desde el centro del muñeco.
 *   de frente:   las dos piernas abiertas hacia delante, con los zapatos en la punta;
 *   de lado:     una banda desde la espalda hasta el pie, que asoma hacia ese lado con la punta hacia arriba;
 *   de espaldas: solo la base (las piernas quedan detrás del cuerpo).
 */
const ZAPATO = "#15100d"; // el color de los zapatos de todos los muñecos de la casa
const PANTALON = "#2a2420"; // el del pantalón, si no se puede leer el del muñeco
const PANTALON_X = 15; // el punto del fotograma «quieto, de frente» (el número 1) del que se lee el color del pantalón
const PANTALON_Y = 27;
const FOTOGRAMA_DE_FRENTE = 1;
const PIERNAS: Record<string, Piernas> = {
    down: { forma: ["PPPP..PPPP", "ZZZ....ZZZ"], x: 0, y: 20 },
    left: { forma: ["Z........", "ZPPPPPPPP", "ZPPPPPPPP"], x: -5, y: 18 },
    right: { forma: ["........Z", "PPPPPPPPZ", "PPPPPPPPZ"], x: 5, y: 18 },
    up: { forma: ["PPPPPPPP"], x: 0, y: 18 },
};

/**
 * Lo que se le pide al gestor de texturas para leer un punto de una textura. Se pide así, sin dar por hecho que esta
 * versión de Phaser lo tenga: si no lo tiene, las piernas salen con el color de pantalón por defecto.
 */
type LectorDePuntos = {
    getPixel?: (
        x: number,
        y: number,
        key: string,
        frame?: string | number,
    ) => { red: number; green: number; blue: number; alpha: number } | null;
};

/** Lo que se puede llevar en la mano. */
const OBJETOS: Record<string, Dibujo> = {
    lata: { forma: ["gggg", "oooo", "occo", "occo", "oooo", "oooo"], colores: { g: "#bdb7ae", o: NARANJA, c: CREMA } },
    cafe: { forma: ["wwww.", "wmmww", "wwwww", "wwww.", ".ww.."], colores: { w: "#ffffff", m: "#6b3f24" } },
    agua: { forma: [".gg.", "bbbb", "bhbb", "bhbb", "bbbb", "bbbb"], colores: { g: "#e2ddd6", b: "#8fd4ff", h: "#d9f1ff" } },
    cana: { forma: ["wwww", "yyyy", "yhyy", "yhyy", ".yy."], colores: { w: "#ffffff", y: "#ffb03c", h: AMARILLO } },
    snack: { forma: ["yyyyy", "yrrry", "yrcry", "yrrry", "yyyyy"], colores: { y: AMARILLO, r: NARANJA, c: CREMA } },
    disco: { forma: [".kkk.", "kkkkk", "kkokk", "kkkkk", ".kkk."], colores: { k: "#2a2530", o: NARANJA } },
};

/** Dibuja (una sola vez por juego) un dibujo como textura y devuelve su clave. */
function textura(escena: Phaser.Scene, clave: string, dibujo: Dibujo): string {
    if (escena.textures.exists(clave)) return clave;
    const forma = dibujo.forma;
    const ancho = Math.max(...forma.map((fila) => fila.length)) + 2; // un punto de margen para el contorno
    const alto = forma.length + 2;
    const lienzo = escena.textures.createCanvas(clave, ancho * PIXEL, alto * PIXEL);
    if (!lienzo) return clave;
    const punto = (x: number, y: number): string => {
        if (y < 1 || y > forma.length) return ".";
        const c = forma[y - 1].charAt(x - 1);
        return c === "" ? "." : c;
    };
    const pincel = lienzo.getContext();
    for (let y = 0; y < alto; y++) {
        for (let x = 0; x < ancho; x++) {
            const propio = punto(x, y);
            const tocaForma = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => punto(x + dx, y + dy) !== "."));
            if (!tocaForma) continue;
            pincel.fillStyle = propio === "." ? TINTA : (dibujo.colores[propio] ?? TINTA);
            pincel.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
        }
    }
    lienzo.refresh();
    lienzo.setFilter(Phaser.Textures.FilterMode.NEAREST);
    return clave;
}

/** Un valor de color (de 0 a 255) con dos cifras hexadecimales. */
function dosCifras(valor: number): string {
    return Math.max(0, Math.min(255, Math.round(valor)))
        .toString(16)
        .padStart(2, "0");
}

const GESTOS = new Set(["mano", "palmas"]); // los efectos que son un gesto (no suben sobre la cabeza)

type Postura = { nombre: string; mira?: string; efecto?: string; gesto?: string };

/**
 * Lee el valor de «accion» ("sentado:abajo+zetas"…). Lo que no se entiende es «nada».
 * Detrás del «+» va un efecto (dibujitos que suben) o un gesto (la mano, las palmas). De serie, bailar lleva las notas,
 * saludar la mano y aplaudir las palmas.
 */
function leerAccion(valor: unknown): Postura | null {
    if (typeof valor !== "string" || valor.length > 60) return null;
    const [postura, pedido, sobra] = valor.split("+");
    if (sobra !== undefined) return null;
    const gestoPedido = pedido !== undefined && GESTOS.has(pedido) ? pedido : undefined;
    const efectoPedido = gestoPedido === undefined ? pedido : undefined;
    if (efectoPedido !== undefined && !Object.prototype.hasOwnProperty.call(EFECTOS, efectoPedido)) return null;
    if (postura.startsWith("sentado:")) {
        const mira = MIRADAS.get(postura.slice(8));
        return mira ? { nombre: "sentado", mira, efecto: efectoPedido, gesto: gestoPedido } : null;
    }
    if (!POSTURAS.has(postura)) return null;
    // «quieto» sin efecto ni gesto no es nada
    if (postura === "quieto" && pedido === undefined) return null;
    return {
        nombre: postura,
        efecto: efectoPedido ?? (postura === "bailar" ? "notas" : undefined),
        gesto: gestoPedido ?? (postura === "saludar" ? "mano" : postura === "aplaudir" ? "palmas" : undefined),
    };
}

export class Acciones {
    private valor: string | null = null; // el texto de «accion» ya comprobado, o nada
    private postura: Postura | null = null;
    private objeto: string | null = null; // lo que lleva en la mano («lleva»), ya comprobado
    private ultimaDireccion = PositionMessage_Direction.DOWN;
    private ultimoMoviendo = false;
    private desplazado = false; // si los dibujos están ahora movidos de su sitio (sentado o botando)
    private bajado = 0; // lo que están bajados ahora (píxeles del dibujo; negativo, subidos): los gestos van con ellos
    private recortado = false; // si los dibujos tienen ahora las piernas recortadas (sentado)
    private cara = "down"; // hacia dónde mira ahora el dibujo ("up", "down", "left" o "right")
    // Hacia dónde miraba el asiento del que se ha levantado sin andar ("up", "down", "left" o "right"): mientras no ande
    // ni gire, de pie mira hacia ahí. Si no viene de estar sentado (o ya ha andado), nada.
    private dePie: string | null = null;
    private animando = false; // si hay algo que se mueve solo (baile, saludo, efecto…) y por tanto se escucha cada fotograma
    private lado = ""; // hacia dónde mira ahora al bailar
    private inicio = 0; // cuándo empezó lo de ahora (ms): los dibujitos que habrían salido antes no se enseñan
    private cabeza = 0; // altura (dentro del muñeco) de la que salen los dibujitos: justo encima de su nombre
    private suben: Phaser.GameObjects.Image[] = [];
    private mano: Phaser.GameObjects.Image | null = null; // la mano que saluda
    private palmas: Phaser.GameObjects.Image[] = []; // las dos manos del aplauso
    private destellos: Phaser.GameObjects.Image[] = []; // y los dos destellos de cuando chocan
    private piernas: Phaser.GameObjects.Image | null = null; // las piernas de sentado (desde la primera vez que se sienta)
    private pantalon: string | null = null; // el color del pantalón del muñeco (se lee la primera vez que se sienta)
    private enLaMano: Phaser.GameObjects.Image | null = null;

    constructor(private readonly personaje: Character) {}

    /** Lo último que se le pidió dibujar al muñeco (para redibujarlo cuando cambia la acción). */
    public get ultima(): { direccion: PositionMessage_Direction; moviendo: boolean } {
        return { direccion: this.ultimaDireccion, moviendo: this.ultimoMoviendo };
    }

    /** Guarda lo que hace el muñeco (el valor de la variable «accion»). Devuelve si ha cambiado algo. */
    public poner(valor: unknown): boolean {
        const postura = leerAccion(valor);
        const nuevo = postura ? (valor as string) : null;
        if (nuevo === this.valor) return false;
        // Deja de estar sentado sin andar: de pie se queda mirando hacia donde miraba el asiento (ver dibujar())
        const anterior = this.postura;
        const sigueSentado = postura !== null && postura.nombre === "sentado";
        if (
            anterior !== null &&
            anterior.nombre === "sentado" &&
            anterior.mira !== undefined &&
            !sigueSentado &&
            !this.ultimoMoviendo
        ) {
            this.dePie = anterior.mira;
        }
        this.valor = nuevo;
        this.postura = postura;
        // Se empieza de cero: fuera lo que se movía solo (dibujar() pone lo nuevo)
        this.parar();
        return true;
    }

    /** Guarda lo que lleva en la mano (el valor de la variable «lleva»). Devuelve si ha cambiado algo. */
    public ponerObjeto(valor: unknown): boolean {
        const nuevo = typeof valor === "string" && Object.prototype.hasOwnProperty.call(OBJETOS, valor) ? valor : null;
        if (nuevo === this.objeto) return false;
        this.objeto = nuevo;
        return true;
    }

    /**
     * Lo llama Character.playAnimation. Devuelve true si el muñeco está quieto y hace algo, y entonces lo dibuja
     * esta clase; si no, deja todo como estaba y devuelve false para que se dibuje lo de siempre (andar o estar quieto).
     */
    public dibujar(direccion: PositionMessage_Direction, moviendo: boolean): boolean {
        // En cuanto anda o gira (cambia de dirección sin andar), deja de mirar «como el asiento»
        if (moviendo || direccion !== this.ultimaDireccion) this.dePie = null;
        this.ultimaDireccion = direccion;
        this.ultimoMoviendo = moviendo;
        const postura = moviendo ? null : this.postura;
        const sentado = postura !== null && postura.nombre === "sentado" && postura.mira !== undefined;
        let propia = false; // si la postura la dibuja esta clase (y no Character)

        // Hacia dónde mira el dibujo ahora: el asiento, de frente al saludar o aplaudir, o hacia donde iba (recién
        // levantado de un asiento sin haber andado, hacia donde miraba el asiento)
        const miraDePie: string = this.dePie ?? CARAS.get(direccion) ?? "down";
        const cara =
            sentado && postura?.mira
                ? postura.mira
                : postura?.nombre === "saludar" || postura?.nombre === "aplaudir"
                  ? "down"
                  : miraDePie;
        this.cara = cara;

        // Lo primero, siempre: las piernas recortadas y las de sentado solo se quedan si AHORA está sentado. De pie,
        // andando, bailando o sin hacer nada, el dibujo va entero (venga de la postura que venga).
        this.recortar(sentado);
        this.ponerPiernas(sentado ? cara : null);

        if (!postura) {
            this.parar();
            this.mover(0);
            // Recién levantado de un asiento, sin haber andado: quieto, mirando hacia donde miraba el asiento (lo
            // dibuja esta clase, porque Character lo pondría mirando hacia donde andaba al llegar)
            if (!moviendo && this.dePie !== null) {
                this.mirar(cara);
                propia = true;
            }
        } else {
            if (sentado) {
                this.mirar(cara);
                this.mover(SENTADO);
                propia = true;
            } else {
                // De pie. Si venía de estar sentado, los dibujos seguían bajados (saludaba «agachado»): a su sitio.
                // El baile y el aplauso los vuelven a mover en cada fotograma (alActualizar), solo mientras no se
                // estén moviendo ya, para no cortar un bote a medias.
                if (!this.animando) this.mover(0);
                if (postura.nombre === "saludar" || postura.nombre === "aplaudir") {
                    this.mirar("down");
                    propia = true;
                } else if (postura.nombre === "bailar") {
                    propia = true;
                } else if (this.dePie !== null) {
                    // Las demás posturas de pie (beber, quieto con un efecto), recién levantado de un asiento
                    this.mirar(cara);
                    propia = true;
                }
            }
            const seMueve = !sentado || postura.efecto !== undefined || postura.gesto !== undefined;
            if (seMueve) this.empezar();
            else this.parar();
        }
        this.colocarObjeto(cara, postura?.nombre === "beber", sentado ? SENTADO : 0);
        this.personaje.scene.markDirty();
        return propia;
    }

    /** Lo llama Character.destroy: deja de escuchar, deja los dibujos enteros y quita los que ha añadido. */
    public destruir(): void {
        this.parar();
        this.recortar(false);
        this.piernas?.destroy();
        this.piernas = null;
        this.enLaMano?.destroy();
        this.enLaMano = null;
    }

    /** Pone a los dibujos del muñeco quietos, mirando hacia ahí ("up", "down", "left" o "right"). */
    private mirar(direccion: string): void {
        for (const [nombreTextura, sprite] of this.personaje.sprites) {
            sprite.anims.play(`${nombreTextura}-${direccion}-${PlayerAnimationTypes.Idle}`, true);
        }
    }

    /** Baja (o sube, si es negativo) los dibujos del muñeco; 0 los deja en su sitio. */
    private mover(pixeles: number): void {
        if (pixeles === 0 && !this.desplazado) return;
        this.desplazado = pixeles !== 0;
        this.bajado = pixeles;
        for (const sprite of this.personaje.sprites.values()) {
            sprite.y = Math.round(pixeles * sprite.scaleY);
        }
    }

    /**
     * Recorta las piernas de los dibujos del muñeco (sentado: solo se ven las filas de arriba de cada fotograma) o los
     * deja enteros. El recorte se mantiene aunque cambie el fotograma (al girarse) y no cambia ni el tamaño ni el
     * sitio del dibujo.
     */
    private recortar(si: boolean): void {
        if (si === this.recortado) return;
        this.recortado = si;
        for (const sprite of this.personaje.sprites.values()) {
            if (si) sprite.setCrop(0, 0, LADO_FOTOGRAMA, FILAS_SENTADO);
            else sprite.setCrop();
        }
    }

    /**
     * Las piernas de sentado, mirando hacia «cara» ("up", "down", "left" o "right"); con null, se esconden.
     * Van encima de los dibujos del muñeco y debajo de todo lo demás que añade esta clase.
     */
    private ponerPiernas(cara: string | null): void {
        const piernas = cara === null ? undefined : PIERNAS[cara];
        if (cara === null || piernas === undefined) {
            this.piernas?.setVisible(false);
            return;
        }
        const escena = this.personaje.scene;
        const pantalon = this.colorDelPantalon();
        const clave = textura(escena, `hs-piernas-${cara}-${pantalon}`, {
            forma: piernas.forma,
            colores: { P: pantalon, Z: ZAPATO },
        });
        if (!this.piernas) {
            // Lo que lleva en la mano tiene que quedar por encima de las piernas: si ya estaba puesto, se quita y
            // colocarObjeto() lo vuelve a poner después (dentro del muñeco, lo último que se añade queda encima)
            this.enLaMano?.destroy();
            this.enLaMano = null;
            this.piernas = new Phaser.GameObjects.Image(escena, 0, 0, clave).setOrigin(0.5, 1);
            this.personaje.add(this.piernas);
        } else if (this.piernas.texture.key !== clave) {
            this.piernas.setTexture(clave);
        }
        this.piernas.setPosition(piernas.x, piernas.y);
        this.piernas.setVisible(true);
    }

    /**
     * El color del pantalón del muñeco ("#rrggbb"): el del punto (PANTALON_X, PANTALON_Y) de su fotograma «quieto, de
     * frente», en el dibujo de más arriba que tenga algo ahí (un muñeco hecho de piezas lleva el pantalón en la ropa).
     * Se lee una vez. Si no se puede leer, el de por defecto.
     */
    private colorDelPantalon(): string {
        if (this.pantalon !== null) return this.pantalon;
        let color = PANTALON;
        try {
            const lector = this.personaje.scene.textures as unknown as LectorDePuntos;
            if (typeof lector.getPixel === "function") {
                for (const nombreTextura of this.personaje.sprites.keys()) {
                    const punto = lector.getPixel(PANTALON_X, PANTALON_Y, nombreTextura, FOTOGRAMA_DE_FRENTE);
                    if (punto && punto.alpha > 0) color = `#${dosCifras(punto.red)}${dosCifras(punto.green)}${dosCifras(punto.blue)}`;
                }
            }
        } catch (e) {
            console.warn("No se ha podido leer el color del pantalón del muñeco", e);
        }
        this.pantalon = color;
        return color;
    }

    /**
     * Lo que lleva en la mano: a un lado del cuerpo, según hacia dónde mira; de espaldas no se ve.
     * «cara» es hacia dónde mira el dibujo ahora ("up", "down", "left" o "right").
     */
    private colocarObjeto(cara: string, bebiendo: boolean, baja: number): void {
        if (!this.objeto) {
            this.enLaMano?.setVisible(false);
            return;
        }
        const escena = this.personaje.scene;
        const clave = textura(escena, `hs-objeto-${this.objeto}`, OBJETOS[this.objeto]);
        if (!this.enLaMano) {
            this.enLaMano = new Phaser.GameObjects.Image(escena, 0, 0, clave).setOrigin(0.5, 1);
            this.personaje.add(this.enLaMano);
        } else if (this.enLaMano.texture.key !== clave) {
            this.enLaMano.setTexture(clave);
        }
        const x = bebiendo ? 3 : cara === "left" ? -11 : 11;
        const y = (bebiendo ? -8 : 4) + baja * 2;
        this.enLaMano.setPosition(x, y);
        this.enLaMano.setVisible(cara !== "up");
    }

    /** Empieza lo que se mueve solo (baile, saludo, aplauso, los gestos y los dibujitos que suben). */
    private empezar(): void {
        if (this.animando) return;
        this.animando = true;
        this.lado = "";
        this.inicio = Date.now();
        const escena = this.personaje.scene;
        this.cabeza = this.personaje.playerNameOffsetY - 12;
        const efecto = this.postura?.efecto ? EFECTOS[this.postura.efecto] : undefined;
        if (efecto) {
            const primera = textura(escena, this.claveEfecto(0), efecto[0]);
            for (let i = 0; i < SUBEN; i++) {
                const dibujito = new Phaser.GameObjects.Image(escena, 0, 0, primera).setOrigin(0.5, 1).setVisible(false);
                this.personaje.add(dibujito);
                this.suben.push(dibujito);
            }
        }
        if (this.postura?.gesto === "mano") {
            this.mano = new Phaser.GameObjects.Image(escena, 0, 0, textura(escena, "hs-mano", MANO)).setOrigin(0.5, 1);
            this.personaje.add(this.mano);
        } else if (this.postura?.gesto === "palmas") {
            const palma = textura(escena, "hs-palma", PALMA);
            const destello = textura(escena, "hs-destello", DESTELLO);
            for (let i = 0; i < 2; i++) {
                const mano = new Phaser.GameObjects.Image(escena, 0, 0, palma).setOrigin(0.5, 1).setVisible(false);
                this.personaje.add(mano);
                this.palmas.push(mano);
            }
            for (let i = 0; i < 2; i++) {
                const chispa = new Phaser.GameObjects.Image(escena, 0, 0, destello).setOrigin(0.5, 1).setVisible(false);
                this.personaje.add(chispa);
                this.destellos.push(chispa);
            }
        }
        escena.events.on(Phaser.Scenes.Events.POST_UPDATE, this.alActualizar);
        this.alActualizar();
    }

    /** Para lo que se mueve solo y quita sus dibujos (lo que lleva en la mano se queda). */
    private parar(): void {
        if (!this.animando) return;
        this.animando = false;
        this.personaje.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.alActualizar);
        this.suben.forEach((dibujito) => dibujito.destroy());
        this.suben = [];
        this.mano?.destroy();
        this.mano = null;
        this.palmas.forEach((mano) => mano.destroy());
        this.palmas = [];
        this.destellos.forEach((chispa) => chispa.destroy());
        this.destellos = [];
        if (this.postura?.nombre !== "sentado") this.mover(0);
        this.personaje.scene.markDirty();
    }

    /** La textura número m del efecto de ahora (se van alternando). */
    private claveEfecto(m: number): string {
        const nombre = this.postura?.efecto ?? "";
        const n = EFECTOS[nombre]?.length ?? 1;
        return `hs-efecto-${nombre}-${((m % n) + n) % n}`;
    }

    /** Cada fotograma mientras algo se mueve solo (en POST_UPDATE: GameScene.update borra la marca de «sucio» antes). */
    private readonly alActualizar = (): void => {
        const postura = this.postura;
        if (!postura) return;
        const escena = this.personaje.scene;
        const ahora = Date.now();
        const tiempos = ahora / TIEMPO;
        const n = Math.floor(tiempos);

        if (postura.nombre === "bailar") {
            // De un lado al otro cada pocos tiempos, y un bote por tiempo: llega al suelo justo en el tiempo
            const lado = Math.floor(n / TIEMPOS_POR_LADO) % 2 === 0 ? "left" : "right";
            if (lado !== this.lado) {
                this.lado = lado;
                this.mirar(lado);
            }
            this.mover(-REBOTE * Math.abs(Math.sin(Math.PI * (tiempos - n))));
        } else if (postura.nombre === "aplaudir") {
            // Dos palmadas por tiempo
            this.mover(-PALMADA * Math.abs(Math.sin(Math.PI * 2 * (tiempos - n))));
        } else if (postura.nombre === "beber" && this.enLaMano && this.objeto) {
            // Un trago por cada dos tiempos: sube el vaso y lo baja
            const sube = Math.max(0, Math.sin(Math.PI * (tiempos - n + (n % 2)) * 1));
            this.enLaMano.setPosition(3, -8 - Math.round(3 * sube));
        }

        // Los gestos van con el cuerpo: bajan con él al sentarse y botan con él al bailar o al aplaudir
        const baja = Math.round(this.bajado * PIXEL);
        if (this.mano) {
            // La mano va y viene junto a la cabeza, dos veces por tiempo
            this.mano.setPosition(15 + Math.round(3 * Math.sin(Math.PI * 4 * (tiempos - n))), this.cabeza + 26 + baja);
        }
        if (this.palmas.length === 2 && this.destellos.length === 2) {
            // Las palmas se juntan y se separan delante del pecho dos veces por tiempo; al chocar salta un destello
            // a cada lado. De espaldas las manos no se ven: solo los destellos.
            const abre = Math.abs(Math.sin(Math.PI * 2 * (tiempos - n))); // 0: juntas; 1: separadas del todo
            const aparte = PALMAS_JUNTAS + Math.round(PALMAS_ABREN * abre);
            const deEspaldas = postura.nombre !== "bailar" && this.cara === "up";
            this.palmas[0].setPosition(-aparte, PALMAS_Y + baja);
            this.palmas[1].setPosition(aparte, PALMAS_Y + baja);
            this.palmas[0].setVisible(!deEspaldas);
            this.palmas[1].setVisible(!deEspaldas);
            this.destellos[0].setPosition(-DESTELLO_X, DESTELLO_Y + baja);
            this.destellos[1].setPosition(DESTELLO_X, DESTELLO_Y + baja);
            this.destellos[0].setVisible(abre < 0.5);
            this.destellos[1].setVisible(abre < 0.5);
        }

        // Dibujitos: el número m sale en el tiempo m y sube mientras vive; cada hueco enseña el último que le toca
        const efecto = postura.efecto ? EFECTOS[postura.efecto] : undefined;
        if (efecto) {
            this.suben.forEach((dibujito, hueco) => {
                const m = n - ((n - hueco) % SUBEN);
                const edad = (tiempos - m) / SUBEN; // de 0 (acaba de salir) a 1 (se va)
                const indice = ((m % efecto.length) + efecto.length) % efecto.length;
                const clave = textura(escena, this.claveEfecto(m), efecto[indice]);
                if (dibujito.texture.key !== clave) dibujito.setTexture(clave);
                dibujito.setPosition(
                    LADOS[m % LADOS.length] + Math.round(2 * Math.sin(edad * 9)),
                    Math.round(this.cabeza - SUBIDA * edad),
                );
                dibujito.setAlpha(Math.min(1, edad * 10, (1 - edad) * 2.5));
                dibujito.setVisible(m * TIEMPO >= this.inicio);
            });
        }
        escena.markDirty();
    };
}
