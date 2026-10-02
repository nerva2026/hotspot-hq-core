// Piezas comunes de la música (la cabina, /tareas/musica/, y el reproductor pequeño de la oficina, /tareas/musica/mini/):
// hablar con el servidor, el canal en directo, el reproductor oficial de Spotify (Embed) y cómo seguir al DJ.
//
// Aquí no pasa audio por nuestro servidor: cada navegador pone la canción del DJ con el reproductor de Spotify y salta
// al mismo punto. Si esa persona ha entrado en Spotify en su navegador, suena entera; si no, 30 segundos de muestra.

import { h } from "./util.js";
import { llamar, BASE_API, CLIENTE } from "./api.js";

export const apiMusica = {
    estado: () => llamar("GET", "musica"),
    tomar: () => llamar("POST", "musica/cabina"),
    dejar: () => llamar("DELETE", "musica/cabina"),
    desconectar: () => llamar("POST", "musica/desconectar"),
    escucho: (si) => llamar("POST", "musica/escucho", { si }),
};

// Conectar Spotify: se abre en una pestaña (Spotify no deja entrar desde un marco); «volver» = en esta misma pestaña.
export const direccionConectar = (volver = false) => new URL(`musica/conectar${volver ? "?volver=1" : ""}`, BASE_API).href;
export const direccionEntrar = (vuelta) => `/cuentas/entrar?vuelta=${encodeURIComponent(vuelta)}`;

export function dentroDeLaOficina() {
    try {
        return window.top !== window;
    } catch {
        return true;
    }
}

// ---------- el canal en directo ----------

// Abre el canal de la música (?musica=1). «alAbrir» cada vez que se (re)abre: hay que volver a pedir el estado, por si
// se ha perdido algo. «alCaer(cerrado)»: cerrado = el navegador se ha rendido (servidor caído, sesión caducada…).
export function canalMusica({ alEvento, alAbrir, alCaer }) {
    let fuente = null;
    let parado = false;
    let reintento = null;
    function abrir() {
        if (parado) return;
        const direccion = new URL("eventos", BASE_API);
        direccion.searchParams.set("musica", "1");
        direccion.searchParams.set("cliente", CLIENTE);
        fuente = new EventSource(direccion);
        fuente.onopen = () => alAbrir();
        fuente.onmessage = (e) => {
            let ev;
            try {
                ev = JSON.parse(e.data);
            } catch {
                return; // mensaje raro: se ignora
            }
            alEvento(ev);
        };
        fuente.onerror = () => {
            const cerrado = fuente.readyState === EventSource.CLOSED;
            alCaer(cerrado);
            if (cerrado && !parado) {
                clearTimeout(reintento);
                reintento = setTimeout(abrir, 4000);
            }
        };
    }
    abrir();
    return {
        cerrar() {
            parado = true;
            clearTimeout(reintento);
            fuente?.close();
        },
        reabrir() {
            clearTimeout(reintento);
            fuente?.close();
            parado = false;
            abrir();
        },
    };
}

// ---------- tiempos ----------

export function tiempo(ms) {
    const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const horas = Math.floor(s / 3600);
    const minutos = Math.floor((s % 3600) / 60);
    const segundos = String(s % 60).padStart(2, "0");
    return horas ? `${horas}:${String(minutos).padStart(2, "0")}:${segundos}` : `${minutos}:${segundos}`;
}

// Lo que suena, con la hora de llegada (reloj de este navegador, para no depender de la hora del servidor).
export const conLlegada = (sonando) => (sonando ? { ...sonando, recibido: performance.now() } : null);

// Por dónde va ahora mismo la canción del DJ (avanza sola entre avisos del servidor).
export function posicionAhora(s) {
    if (!s) return 0;
    const avance = s.reproduciendo ? performance.now() - s.recibido : 0;
    return Math.min(s.duracion || Infinity, s.posicion + avance);
}

export function horaCorta(iso) {
    const d = new Date(iso);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---------- dibujos ----------

function deTexto(svg) {
    const t = document.createElement("template");
    t.innerHTML = svg.trim();
    return t.content.firstElementChild;
}

// El icono de Spotify (para atribuir el contenido a Spotify, como piden sus normas).
export function iconoSpotify(clase = "icono-spotify") {
    return deTexto(
        `<svg class="${clase}" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="#1ed760" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
    );
}

// Iconos de píxeles (8 × 8).
const PIXELES = {
    tocar: "M2 1h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1z",
    parar: "M2 2h4v4h-4z",
    abrir: "M3 1h4v4h-1v-2h-1v1h-1v1h-1v1h-1v-1h1v-1h1v-1h1v-1h-2z",
    nota: "M3 1h4v2h-3v4h-1v1h-2v-2h2z",
};
export function iconoPixel(nombre, clase = "icono-pixel") {
    return deTexto(`<svg class="${clase}" viewBox="0 0 8 8" width="12" height="12" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path fill="currentColor" d="${PIXELES[nombre]}"/></svg>`);
}

// Un disco de vinilo de píxeles, para cuando no hay portada.
let discoGuardado = null;
export function disco(clase = "disco") {
    if (!discoGuardado) {
        const filas = [];
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
                if (d > 7.6) continue;
                const color = d < 1.2 ? "#f3e6d8" : d < 3.4 ? "#e0562a" : d > 5.2 && d < 5.9 ? "#3a302c" : "#1c1715";
                filas.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`);
            }
        }
        discoGuardado = `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${filas.join("")}</svg>`;
    }
    const el = deTexto(discoGuardado);
    el.setAttribute("class", clase);
    return el;
}

// Portada de Spotify (o el disco si no hay, o si no carga).
export function portada(url, { clase = "portada", alt = "" } = {}) {
    const caja = h("span", { class: [clase, "sin-imagen"] }, disco());
    if (url) {
        // Sin loading="lazy": la imagen no está en la página hasta que carga, y una «lazy» suelta no carga nunca.
        const img = h("img", { src: url, alt, decoding: "async", referrerpolicy: "no-referrer" });
        img.addEventListener("load", () => {
            caja.classList.remove("sin-imagen");
            caja.replaceChildren(img);
        });
        img.addEventListener("error", () => caja.classList.add("sin-imagen"));
    }
    return caja;
}

// ---------- recordar si se quiere escuchar (en este navegador) ----------

const CLAVE_ESCUCHAR = "hs-tablon:musica-escuchar";
export const preferencia = {
    leer() {
        try {
            return localStorage.getItem(CLAVE_ESCUCHAR) === "1";
        } catch {
            return false;
        }
    },
    guardar(si) {
        try {
            localStorage.setItem(CLAVE_ESCUCHAR, si ? "1" : "0");
        } catch {
            /* sin almacenamiento: no pasa nada */
        }
    },
};

// ---------- una sola ventana sonando a la vez ----------

// La cabina y el reproductor pequeño pueden estar abiertos a la vez en la oficina: si una se pone a sonar, la otra se
// calla («cede»), y cuando la que sonaba se cierra, la que había cedido vuelve a sonar.
export function coordinar({ alCeder, alRecuperar, alSilencio }) {
    let canal = null;
    try {
        canal = new BroadcastChannel("hs-musica");
    } catch {
        return { suena() {}, calla() {}, suelta() {} };
    }
    canal.onmessage = (e) => {
        const m = e.data || {};
        if (m.de === CLIENTE) return;
        if (m.tipo === "suena") alCeder();
        else if (m.tipo === "suelta") alRecuperar();
        else if (m.tipo === "silencio") alSilencio();
    };
    return {
        suena: () => canal.postMessage({ tipo: "suena", de: CLIENTE }),
        calla: () => canal.postMessage({ tipo: "silencio", de: CLIENTE }),
        suelta: () => canal.postMessage({ tipo: "suelta", de: CLIENTE }),
    };
}

// ---------- el reproductor de Spotify ----------

const SCRIPT_SPOTIFY = "https://open.spotify.com/embed/iframe-api/v1";
let IFrameAPI = null;
let estadoApi = "sin-pedir"; // sin-pedir · cargando · lista · fallo
let scriptApi = null;
let esperaApi = null;
const avisosApi = new Set();

function avisarApi() {
    for (const f of [...avisosApi]) f();
}

// Spotify llama a esta función cuando su script está listo (una prueba puede llamarla con uno de mentira).
window.onSpotifyIframeApiReady = (api) => {
    IFrameAPI = api;
    estadoApi = "lista";
    clearTimeout(esperaApi);
    avisarApi();
};

function pedirApi() {
    if (estadoApi === "lista" || estadoApi === "cargando") return;
    scriptApi?.remove();
    estadoApi = "cargando";
    scriptApi = document.createElement("script");
    scriptApi.src = SCRIPT_SPOTIFY;
    scriptApi.async = true;
    scriptApi.addEventListener("error", () => {
        if (estadoApi === "lista") return;
        estadoApi = "fallo";
        clearTimeout(esperaApi);
        avisarApi();
    });
    document.head.append(scriptApi);
    clearTimeout(esperaApi);
    esperaApi = setTimeout(() => {
        if (estadoApi !== "cargando") return;
        estadoApi = "fallo";
        avisarApi();
    }, 15000);
}

const MARGEN_DERIVA = 4000; // ms de diferencia con el DJ a partir de los que se salta
const CALMA_SALTOS = 6000; // y no más de un salto cada tantos ms

// Sigue al DJ con el reproductor oficial de Spotify (Embed). «estado» para la pantalla:
//   apagado · cargando · fallo · esperando (no hay nada que poner) · local (archivo del DJ, no está en Spotify) ·
//   sonando · pausa (el DJ ha pausado) · bloqueado (el navegador no deja empezar solo) · a-mano (lo has pausado tú)
// «muestra»: suena la muestra de 30 s (no has entrado en Spotify en este navegador).
export class Reproductor {
    constructor(hueco, { alto = 152, alCambiar = () => {} } = {}) {
        this.hueco = hueco;
        this.alto = alto;
        this.alCambiar = alCambiar;
        this.encendido = false;
        this.control = null;
        this.listo = false;
        this.cargada = null;
        this.objetivo = null;
        this.esLocal = false;
        this.local = { pausado: true, buffer: false, posicion: 0, duracion: 0, actualizado: 0, uri: null };
        this.muestra = false;
        this.manual = false; // la persona lo ha pausado en el reproductor: no se le vuelve a poner en marcha
        this.bloqueado = false;
        this.buscarAlEmpezar = false;
        this.ultimoSalto = 0;
        this.pausaMia = 0;
        this.pedidoTocar = 0;
        this.vigiaTocar = null;
        this.alApi = () => this.conApi();
        this.estadoAnterior = "";
    }

    get estado() {
        if (!this.encendido) return "apagado";
        if (this.esLocal) return "local";
        if (!this.objetivo) return "esperando";
        if (!this.control || !this.listo) return estadoApi === "fallo" && !this.control ? "fallo" : "cargando";
        if (!this.objetivo.reproduciendo) return "pausa";
        if (this.manual) return "a-mano";
        if (this.bloqueado) return "bloqueado";
        return "sonando";
    }

    avisar() {
        const info = { estado: this.estado, muestra: this.muestra && this.encendido, local: this.local };
        this.alCambiar(info);
    }

    // La persona quiere escuchar.
    encender() {
        if (this.encendido) return;
        this.encendido = true;
        this.manual = false;
        this.bloqueado = false;
        avisosApi.add(this.alApi);
        if (estadoApi === "fallo") estadoApi = "sin-pedir"; // otro intento
        pedirApi();
        this.conApi();
        this.avisar();
    }

    // Se calla y quita el reproductor.
    apagar() {
        this.encendido = false;
        avisosApi.delete(this.alApi);
        clearTimeout(this.vigiaTocar);
        const control = this.control;
        this.control = null;
        this.listo = false;
        this.cargada = null;
        this.muestra = false;
        this.local = { pausado: true, buffer: false, posicion: 0, duracion: 0, actualizado: 0, uri: null };
        if (control) {
            try {
                control.pause();
            } catch {
                /* ya no está */
            }
            try {
                control.destroy();
            } catch {
                /* ya no está */
            }
        }
        this.hueco.replaceChildren();
        this.avisar();
    }

    // Lo que suena en la cabina (de conLlegada(); null si nada).
    seguir(sonando) {
        const antes = this.objetivo;
        this.esLocal = Boolean(sonando?.local);
        this.objetivo = sonando && !sonando.local && sonando.uri ? sonando : null;
        if (!this.encendido) return;
        const o = this.objetivo;
        if (!o) {
            if (this.control && this.listo && !this.local.pausado) this.pausar();
            return this.avisar();
        }
        if (!this.control) {
            this.conApi();
            return this.avisar();
        }
        if (!this.listo) return this.avisar();
        if (this.cargada !== o.uri) {
            this.cargar();
            return this.avisar();
        }
        if (antes && antes.uri === o.uri) {
            if (antes.reproduciendo !== o.reproduciendo) {
                if (o.reproduciendo) {
                    this.manual = false;
                    this.buscarAlEmpezar = !this.muestra;
                    this.reanudar();
                } else this.pausar();
            } else if (o.reproduciendo && !this.manual && !this.muestra && Math.abs(posicionAhora(antes) - posicionAhora(o)) > 2500) {
                this.saltar(); // el DJ ha saltado a otro punto
            }
        }
        this.avisar();
    }

    conApi() {
        if (!this.encendido) return;
        if (estadoApi !== "lista") return this.avisar();
        if (this.control || this.creando || !this.objetivo) return this.avisar();
        this.creando = true;
        const sitio = document.createElement("div");
        this.hueco.replaceChildren(sitio);
        const uri = this.objetivo.uri;
        try {
            IFrameAPI.createController(sitio, { uri, width: "100%", height: this.alto }, (control) => {
                this.creando = false;
                if (!this.encendido) {
                    try {
                        control.destroy();
                    } catch {
                        /* nada */
                    }
                    return;
                }
                this.control = control;
                this.cargada = uri;
                control.addListener("ready", () => this.alEstarListo());
                control.addListener("playback_update", (e) => this.alActualizar(e?.data || {}));
                this.avisar();
            });
        } catch (error) {
            this.creando = false;
            console.warn("No se ha podido poner el reproductor de Spotify:", error);
            estadoApi = "fallo";
            this.avisar();
        }
    }

    alEstarListo() {
        if (!this.control) return;
        const primeraVez = !this.listo;
        this.listo = true;
        if (primeraVez) {
            const o = this.objetivo;
            if (o && this.cargada !== o.uri) this.cargar();
            else if (o?.reproduciendo) {
                this.buscarAlEmpezar = true;
                this.tocar();
            }
        }
        this.avisar();
    }

    cargar() {
        const o = this.objetivo;
        this.cargada = o.uri;
        this.muestra = false;
        this.manual = false;
        this.local = { ...this.local, posicion: 0, duracion: 0, uri: o.uri };
        this.buscarAlEmpezar = true;
        try {
            this.control.loadUri(o.uri);
        } catch {
            /* el reproductor se ha ido */
        }
        if (o.reproduciendo) this.tocar();
    }

    tocar() {
        this.pedidoTocar = performance.now();
        try {
            this.control.play();
        } catch {
            /* el reproductor se ha ido */
        }
        this.vigilarTocar();
    }

    reanudar() {
        this.pedidoTocar = performance.now();
        try {
            this.control.resume();
        } catch {
            /* el reproductor se ha ido */
        }
        this.vigilarTocar();
    }

    // Si al poco de pedirle que suene sigue parado, el navegador no le deja empezar solo: hay que pulsar ▶.
    vigilarTocar() {
        clearTimeout(this.vigiaTocar);
        this.vigiaTocar = setTimeout(() => {
            if (!this.encendido || !this.control || !this.objetivo?.reproduciendo || this.manual) return;
            if (this.local.pausado && !this.local.buffer) {
                this.bloqueado = true;
                this.avisar();
            }
        }, 4500);
    }

    pausar() {
        this.pausaMia = performance.now();
        try {
            this.control.pause();
        } catch {
            /* el reproductor se ha ido */
        }
    }

    saltar() {
        if (!this.control || !this.objetivo || this.muestra) return;
        const destino = posicionAhora(this.objetivo);
        if (this.local.duracion && destino >= this.local.duracion - 1000) return;
        this.ultimoSalto = performance.now();
        try {
            this.control.seek(Math.max(0, destino / 1000));
        } catch {
            /* el reproductor se ha ido */
        }
    }

    alActualizar(d) {
        const antes = this.local;
        const ahora = performance.now();
        this.local = {
            pausado: Boolean(d.isPaused),
            buffer: Boolean(d.isBuffering),
            posicion: Number(d.position) || 0,
            duracion: Number(d.duration) || 0,
            actualizado: ahora,
            uri: this.cargada,
        };
        const o = this.objetivo;
        if (!o) return this.avisar();
        // Muestra de 30 s: el reproductor dice que dura mucho menos que la canción del DJ.
        this.muestra = this.local.duracion > 0 && o.duracion > 0 && this.local.duracion <= 31000 && this.local.duracion < o.duracion - 5000;
        if (!this.local.pausado) {
            this.bloqueado = false;
            this.manual = false;
            if (this.buscarAlEmpezar) {
                this.buscarAlEmpezar = false;
                if (!this.muestra && o.reproduciendo) this.saltar();
            } else if (o.reproduciendo && !this.muestra && ahora - this.ultimoSalto > CALMA_SALTOS && Math.abs(this.local.posicion - posicionAhora(o)) > MARGEN_DERIVA) {
                this.saltar(); // se ha quedado atrás (o adelantado)
            }
        } else if (!antes.pausado && o.reproduciendo && ahora - this.pausaMia > 1500 && !this.local.buffer) {
            // Estaba sonando y se ha parado sin que lo pidiéramos: o se ha acabado la muestra, o lo ha pausado la persona.
            const alFinal = this.local.duracion > 0 && this.local.posicion >= this.local.duracion - 1500;
            if (!alFinal) this.manual = true;
        }
        const estado = `${this.estado}·${this.muestra}`;
        if (estado !== this.estadoAnterior) {
            this.estadoAnterior = estado;
            this.avisar();
        }
    }
}
