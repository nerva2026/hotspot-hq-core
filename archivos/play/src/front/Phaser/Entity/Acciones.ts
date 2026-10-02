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
 *     efectos:  "notas", "gotas", "nube", "burbujas", "zetas", "corazones" y "chispas" (dibujitos que suben sobre la cabeza)
 *   Ejemplos: "bailar" (lleva las notas de serie), "sentado:abajo", "sentado:abajo+zetas", "quieto+burbujas".
 * - «lleva»: lo que tiene en la mano ("lata", "cafe", "agua", "cana", "snack" o "disco"), o nada.
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
const SENTADO = 4; // píxeles del dibujo que baja al sentarse
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

type Postura = { nombre: string; mira?: string; efecto?: string };

/** Lee el valor de «accion» ("sentado:abajo+zetas"…). Lo que no se entiende es «nada». */
function leerAccion(valor: unknown): Postura | null {
    if (typeof valor !== "string" || valor.length > 60) return null;
    const [postura, efectoPedido, sobra] = valor.split("+");
    if (sobra !== undefined) return null;
    if (efectoPedido !== undefined && !Object.prototype.hasOwnProperty.call(EFECTOS, efectoPedido)) return null;
    if (postura.startsWith("sentado:")) {
        const mira = MIRADAS.get(postura.slice(8));
        return mira ? { nombre: "sentado", mira, efecto: efectoPedido } : null;
    }
    if (!POSTURAS.has(postura)) return null;
    // bailar lleva sus notas de serie; «quieto» sin efecto no es nada
    if (postura === "quieto" && efectoPedido === undefined) return null;
    return { nombre: postura, efecto: efectoPedido ?? (postura === "bailar" ? "notas" : undefined) };
}

export class Acciones {
    private valor: string | null = null; // el texto de «accion» ya comprobado, o nada
    private postura: Postura | null = null;
    private objeto: string | null = null; // lo que lleva en la mano («lleva»), ya comprobado
    private ultimaDireccion = PositionMessage_Direction.DOWN;
    private ultimoMoviendo = false;
    private desplazado = false; // si los dibujos están ahora movidos de su sitio (sentado o botando)
    private animando = false; // si hay algo que se mueve solo (baile, saludo, efecto…) y por tanto se escucha cada fotograma
    private lado = ""; // hacia dónde mira ahora al bailar
    private inicio = 0; // cuándo empezó lo de ahora (ms): los dibujitos que habrían salido antes no se enseñan
    private cabeza = 0; // altura (dentro del muñeco) de la que salen los dibujitos: justo encima de su nombre
    private suben: Phaser.GameObjects.Image[] = [];
    private mano: Phaser.GameObjects.Image | null = null;
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
        this.ultimaDireccion = direccion;
        this.ultimoMoviendo = moviendo;
        const postura = moviendo ? null : this.postura;
        let propia = false; // si la postura la dibuja esta clase (y no Character)

        if (!postura) {
            this.parar();
            this.mover(0);
        } else {
            if (postura.nombre === "sentado" && postura.mira) {
                this.mirar(postura.mira);
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
                }
            }
            const seMueve = postura.nombre !== "sentado" || postura.efecto !== undefined;
            if (seMueve) this.empezar();
            else this.parar();
        }
        // Hacia dónde mira el dibujo ahora: el asiento, de frente al saludar o aplaudir, o hacia donde iba
        const cara =
            postura?.nombre === "sentado" && postura.mira
                ? postura.mira
                : postura?.nombre === "saludar" || postura?.nombre === "aplaudir"
                  ? "down"
                  : (CARAS.get(direccion) ?? "down");
        this.colocarObjeto(cara, postura?.nombre === "beber", postura?.nombre === "sentado" ? SENTADO : 0);
        this.personaje.scene.markDirty();
        return propia;
    }

    /** Lo llama Character.destroy: deja de escuchar y quita los dibujos. */
    public destruir(): void {
        this.parar();
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
        for (const sprite of this.personaje.sprites.values()) {
            sprite.y = Math.round(pixeles * sprite.scaleY);
        }
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

    /** Empieza lo que se mueve solo (baile, saludo, aplauso y los dibujitos que suben). */
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
        if (this.postura?.nombre === "saludar") {
            this.mano = new Phaser.GameObjects.Image(escena, 0, 0, textura(escena, "hs-mano", MANO)).setOrigin(0.5, 1);
            this.personaje.add(this.mano);
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
        } else if (postura.nombre === "saludar" && this.mano) {
            // La mano va y viene junto a la cabeza, dos veces por tiempo
            this.mano.setPosition(15 + Math.round(3 * Math.sin(Math.PI * 4 * (tiempos - n))), this.cabeza + 26);
        } else if (postura.nombre === "beber" && this.enLaMano && this.objeto) {
            // Un trago por cada dos tiempos: sube el vaso y lo baja
            const sube = Math.max(0, Math.sin(Math.PI * (tiempos - n + (n % 2)) * 1));
            this.enLaMano.setPosition(3, -8 - Math.round(3 * sube));
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
