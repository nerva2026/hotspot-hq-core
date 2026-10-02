// Seguir al DJ: los estados del reproductor de la música, sin página ni Spotify de por medio.
//
// Aquí está solo la lógica (qué se le pide al reproductor oficial de Spotify, el Embed, y qué estado se enseña según lo
// que él cuenta): no toca el DOM ni carga nada, para poder probarla en Node con un Embed de mentira
// (pruebas/reproductor.mjs). La parte de página (cargar el script de Spotify, poner el marco) está en musica-comun.js.
//
// Estados (lo que hay que enseñar en pantalla):
//   apagado           la persona no escucha
//   esperando         escucha, pero en la cabina no hay nada que poner
//   local             el DJ pone un archivo de su ordenador: no está en Spotify y aquí no se puede oír
//   cargando          se está poniendo el reproductor de Spotify
//   fallo             el reproductor no carga (su script no llega, o no dice que está listo en PLAZO_LISTO)
//   pausa             el DJ ha pausado
//   arrancando        se le ha pedido que suene y todavía no ha dicho que suena
//   bloqueado         se le pidió que sonara y no ha arrancado en PLAZO_TOCAR: el navegador no le deja empezar solo
//                     y la persona tiene que pulsar ▶ en el reproductor
//   sonando           suena la canción entera, a la vez que la cabina
//   muestra           suena, pero solo la muestra de 30 s (Spotify no reconoce a esta persona en este navegador)
//   muestra-acabada   la muestra de 30 s ha terminado: silencio hasta la canción siguiente
//   a-mano            la persona lo ha pausado en el reproductor: no se le vuelve a poner en marcha
//
// «Suena» solo se dice cuando el reproductor lo confirma (un «playback_update» sin pausa): nunca por defecto.

export const PLAZO_LISTO = 12000; // ms que se espera a que el reproductor diga que está listo antes de darlo por fallido
export const PLAZO_TOCAR = 4500; // ms que se espera a que suene tras pedírselo antes de pedir que se pulse ▶
const MARGEN_DERIVA = 4000; // ms de diferencia con el DJ a partir de los que se salta
const CALMA_SALTOS = 6000; // y no más de un salto cada tantos ms
const MARGEN_SALTO_DJ = 2500; // ms: si la canción del DJ se aleja más que esto de donde iba, es que ha saltado
const MARGEN_ORDEN = 1500; // ms tras una orden nuestra (pausar, cargar, saltar) en los que una pausa no es cosa de la persona
const MARGEN_FINAL = 2500; // ms: si se para a menos de esto del final, es que la canción (o la muestra) ha acabado

// Lo que suena, con la hora de llegada (reloj de este navegador, para no depender de la hora del servidor).
export const conLlegada = (sonando, ahora = performance.now()) => (sonando ? { ...sonando, recibido: ahora } : null);

// Por dónde va la canción del DJ en el momento «t» (avanza sola entre avisos del servidor).
export function posicionEn(s, t) {
    if (!s) return 0;
    const avance = s.reproduciendo ? t - s.recibido : 0;
    return Math.min(s.duracion || Infinity, s.posicion + avance);
}
export const posicionAhora = (s) => posicionEn(s, performance.now());

// El estado de la música llega por dos caminos (lo que se pide al servidor y los avisos en directo) y puede llegar
// desordenado: una respuesta que salió antes puede llegar después de un aviso más nuevo. Cada estado lleva su número de
// «serie», que solo crece; esto dice si lo que llega está al día (y entonces se aplica) o es más viejo que lo último visto.
export function vigiaDeSerie() {
    let ultima = -Infinity;
    return (datos) => {
        if (typeof datos?.serie !== "number") return true; // sin serie no se puede saber: se aplica
        if (datos.serie < ultima) return false;
        ultima = datos.serie;
        return true;
    };
}

// Cómo le va a cada oyente, para que lo vea quien pincha (POST /api/musica/escucho, «estado»). La lista es cerrada y
// es la misma que comprueba el servidor (ESTADOS_OYENTE en servidor/musica.js; la prueba vigila que coincidan).
export const ESTADOS_OYENTE = ["suena", "muestra", "falta-pulsar", "pausado", "cargando", "espera", "fallo"];
const DE_ESTADO_A_OYENTE = {
    sonando: "suena",
    muestra: "muestra",
    "muestra-acabada": "muestra",
    bloqueado: "falta-pulsar",
    "a-mano": "pausado",
    cargando: "cargando",
    arrancando: "cargando",
    esperando: "espera",
    pausa: "espera",
    local: "espera",
    fallo: "fallo",
};
// De un estado del reproductor al estado del oyente (null si no escucha).
export const estadoDeOyente = (estado) => DE_ESTADO_A_OYENTE[estado] || null;

const sinNoticias = () => ({ pausado: true, buffer: false, posicion: 0, duracion: 0, actualizado: 0, uri: null });

// «fabrica» es quien sabe poner el reproductor de Spotify de verdad (en la página, musica-comun.js):
//   estado()            "cargando" · "lista" · "fallo"   (el script de Spotify)
//   pedir(alCambiar)    empieza a cargarlo (o lo reintenta) y avisa cuando cambie; devuelve cómo dejar de escuchar
//   crear(uri, alCrear) pone un reproductor con esa canción y llama a alCrear(control) (el «controller» del Embed:
//                       addListener("ready" | "playback_update"), loadUri, play, resume, pause, seek, destroy)
//   fallo(error)        crear() ha lanzado un error
//   vaciar()            quita el reproductor de la página
export class Seguidor {
    constructor(fabrica, { alCambiar = () => {}, reloj = () => performance.now(), esperar = (f, ms) => setTimeout(f, ms), cancelar = (t) => clearTimeout(t), plazoListo = PLAZO_LISTO, plazoTocar = PLAZO_TOCAR } = {}) {
        this.fabrica = fabrica;
        this.alCambiar = alCambiar;
        this.reloj = reloj;
        this.esperar = esperar;
        this.cancelar = cancelar;
        this.plazoListo = plazoListo;
        this.plazoTocar = plazoTocar;
        this.encendido = false;
        this.control = null;
        this.creando = false;
        this.turno = 0; // cada vez que se apaga cambia: un reproductor que llegue tarde, de un turno anterior, se tira
        this.listo = false;
        this.sinListo = false; // ha pasado el plazo y el reproductor no ha dicho que está listo
        this.cargada = null;
        this.objetivo = null;
        this.esLocal = false;
        this.local = sinNoticias(); // lo último que ha contado el reproductor
        this.muestra = false; // lo que suena es la muestra de 30 s
        this.acabada = false; // la canción (o la muestra) ha llegado aquí al final y se espera a la siguiente
        this.manual = false; // la persona lo ha pausado en el reproductor: no se le vuelve a poner en marcha
        this.bloqueado = false; // se le pidió sonar y no arrancó: hay que pulsar ▶
        this.confirmado = false; // el reproductor ha dicho que suena, después de la última vez que se le pidió
        this.maximo = 0; // lo más lejos que ha llegado sonando la canción cargada
        this.buscarAlEmpezar = false;
        this.ultimoSalto = 0;
        this.ordenMia = -Infinity; // cuándo se le mandó por última vez pausar, cargar o saltar
        this.vigiaTocar = null;
        this.vigiaListo = null;
        this.dejarDeMirar = null;
        this.estadoAnterior = "";
    }

    get estado() {
        if (!this.encendido) return "apagado";
        if (this.esLocal) return "local";
        if (!this.objetivo) return "esperando";
        if (!this.control || !this.listo) return this.sinListo || this.fabrica.estado() === "fallo" ? "fallo" : "cargando";
        if (!this.objetivo.reproduciendo) return "pausa";
        if (this.manual) return "a-mano";
        // Al final de una canción entera se sigue «sonando»: la siguiente llega en unos segundos, con el aviso del servidor.
        if (this.acabada) return this.muestra ? "muestra-acabada" : "sonando";
        if (this.bloqueado) return "bloqueado";
        if (!this.confirmado) return "arrancando";
        return this.muestra ? "muestra" : "sonando";
    }

    avisar() {
        this.estadoAnterior = `${this.estado}·${this.muestra}`;
        this.alCambiar({ estado: this.estado, muestra: this.muestra && this.encendido, local: this.local });
    }

    avisarSiCambia() {
        if (`${this.estado}·${this.muestra}` !== this.estadoAnterior) this.avisar();
    }

    // La persona quiere escuchar.
    encender() {
        if (this.encendido) return;
        this.encendido = true;
        this.manual = false;
        this.bloqueado = false;
        this.sinListo = false;
        this.dejarDeMirar = this.fabrica.pedir(() => this.conFabrica());
        this.conFabrica();
        this.avisar();
    }

    // Se calla y quita el reproductor.
    apagar() {
        this.encendido = false;
        this.turno += 1;
        this.creando = false;
        this.dejarDeMirar?.();
        this.dejarDeMirar = null;
        this.cancelar(this.vigiaTocar);
        this.cancelar(this.vigiaListo);
        this.vigiaTocar = null;
        this.vigiaListo = null;
        const control = this.control;
        this.control = null;
        this.listo = false;
        this.sinListo = false;
        this.cargada = null;
        this.muestra = false;
        this.acabada = false;
        this.confirmado = false;
        this.maximo = 0;
        this.local = sinNoticias();
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
        this.fabrica.vaciar();
        this.avisar();
    }

    // Otro intento desde el principio (tras un fallo de carga, o al volver de entrar en Spotify).
    reintentar() {
        if (!this.encendido) return;
        this.apagar();
        this.encender();
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
            this.conFabrica();
            return this.avisar();
        }
        if (!this.listo) return this.avisar();
        if (this.cargada !== o.uri) {
            this.cargar();
            return this.avisar();
        }
        if (antes && antes.uri === o.uri) {
            const ahora = this.reloj();
            if (antes.reproduciendo !== o.reproduciendo) {
                if (o.reproduciendo) {
                    this.manual = false;
                    this.buscarAlEmpezar = !this.muestra;
                    this.reanudar();
                } else this.pausar();
            } else if (o.reproduciendo && !this.manual && Math.abs(posicionEn(antes, ahora) - posicionEn(o, ahora)) > MARGEN_SALTO_DJ) {
                // El DJ ha saltado a otro punto. Si aquí ya había acabado (la tiene en bucle, o ha vuelto atrás), otra vez.
                if (this.acabada) {
                    this.buscarAlEmpezar = !this.muestra;
                    this.tocar();
                } else if (!this.muestra) this.saltar();
            }
        }
        this.avisar();
    }

    // Con el script de Spotify listo (o fallido): se pone el reproductor, si hay algo que poner.
    conFabrica() {
        if (!this.encendido) return;
        this.vigilarListo();
        if (this.fabrica.estado() !== "lista") return this.avisar();
        if (this.control || this.creando || !this.objetivo) return this.avisar();
        this.creando = true;
        const turno = this.turno;
        const uri = this.objetivo.uri;
        try {
            this.fabrica.crear(uri, (control) => {
                if (turno !== this.turno || !this.encendido) {
                    // Ha llegado tarde: ya se había apagado (o es de un intento anterior).
                    try {
                        control.destroy();
                    } catch {
                        /* nada */
                    }
                    return;
                }
                this.creando = false;
                this.control = control;
                this.cargada = uri;
                control.addListener("ready", () => this.alEstarListo(control));
                control.addListener("playback_update", (e) => this.alActualizar(e?.data || {}, control));
                this.avisar();
            });
        } catch (error) {
            this.creando = false;
            this.fabrica.fallo(error);
            this.avisar();
        }
    }

    // Si el reproductor no dice que está listo en un plazo razonable, no va a cargar: se dice, en vez de esperar siempre.
    vigilarListo() {
        if (this.vigiaListo || this.listo || this.sinListo || !this.objetivo) return;
        this.vigiaListo = this.esperar(() => {
            this.vigiaListo = null;
            if (!this.encendido || this.listo || !this.objetivo) return;
            this.sinListo = true;
            this.avisar();
        }, this.plazoListo);
    }

    alEstarListo(control = this.control) {
        if (!this.control || control !== this.control) return;
        const primeraVez = !this.listo;
        this.listo = true;
        this.sinListo = false;
        this.cancelar(this.vigiaListo);
        this.vigiaListo = null;
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
        this.acabada = false;
        this.confirmado = false;
        this.maximo = 0;
        this.local = { ...sinNoticias(), uri: o.uri };
        this.buscarAlEmpezar = true;
        this.ordenMia = this.reloj();
        try {
            this.control.loadUri(o.uri);
        } catch {
            /* el reproductor se ha ido */
        }
        if (o.reproduciendo) this.tocar();
    }

    tocar() {
        this.confirmado = false;
        this.acabada = false;
        try {
            this.control.play();
        } catch {
            /* el reproductor se ha ido */
        }
        this.vigilarTocar();
    }

    reanudar() {
        this.confirmado = false;
        this.acabada = false;
        try {
            this.control.resume();
        } catch {
            /* el reproductor se ha ido */
        }
        this.vigilarTocar();
    }

    // Si al poco de pedirle que suene no ha dicho que suena, el navegador no le deja empezar solo: hay que pulsar ▶.
    vigilarTocar(segundoPlazo = false) {
        this.cancelar(this.vigiaTocar);
        this.vigiaTocar = this.esperar(() => {
            this.vigiaTocar = null;
            if (this.estado !== "arrancando") return;
            // Si está cargando la canción (conexión lenta), se le da otro plazo antes de pedir que se pulse nada.
            if (!segundoPlazo && !this.local.pausado && this.local.buffer) return this.vigilarTocar(true);
            this.bloqueado = true;
            this.avisar();
        }, this.plazoTocar);
    }

    pausar() {
        this.ordenMia = this.reloj();
        try {
            this.control.pause();
        } catch {
            /* el reproductor se ha ido */
        }
    }

    saltar() {
        if (!this.control || !this.objetivo || this.muestra) return;
        const ahora = this.reloj();
        const destino = posicionEn(this.objetivo, ahora);
        if (this.local.duracion && destino >= this.local.duracion - 1000) return;
        this.ultimoSalto = ahora;
        this.ordenMia = ahora; // si al saltar se para un instante, no es que lo haya pausado la persona
        try {
            this.control.seek(Math.max(0, destino / 1000));
        } catch {
            /* el reproductor se ha ido */
        }
    }

    // Lo que cuenta el reproductor («playback_update»): si suena, por dónde va y cuánto dura.
    alActualizar(d, control = this.control) {
        if (!this.control || control !== this.control) return;
        const antes = this.local;
        const ahora = this.reloj();
        this.local = {
            pausado: Boolean(d.isPaused),
            buffer: Boolean(d.isBuffering),
            posicion: Number(d.position) || 0,
            duracion: Number(d.duration) || 0,
            actualizado: ahora,
            uri: this.cargada,
        };
        const o = this.objetivo;
        if (!o) return this.avisarSiCambia();
        // Muestra de 30 s: el reproductor dice que dura mucho menos que la canción del DJ. (Si no dice cuánto dura,
        // como justo al terminar, se sigue con lo que se sabía.)
        if (this.local.duracion > 0 && o.duracion > 0) this.muestra = this.local.duracion <= 31000 && this.local.duracion < o.duracion - 5000;
        if (!this.local.pausado) {
            this.bloqueado = false;
            this.manual = false;
            this.acabada = false;
            if (!this.local.buffer) {
                // Suena de verdad: es la única manera de llegar a «sonando» (o a «muestra»).
                this.confirmado = true;
                this.maximo = Math.max(this.maximo, this.local.posicion);
                this.cancelar(this.vigiaTocar);
                this.vigiaTocar = null;
            }
            if (this.buscarAlEmpezar) {
                this.buscarAlEmpezar = false;
                if (!this.muestra && o.reproduciendo) this.saltar();
            } else if (o.reproduciendo && !this.muestra && ahora - this.ultimoSalto > CALMA_SALTOS && Math.abs(this.local.posicion - posicionEn(o, ahora)) > MARGEN_DERIVA) {
                this.saltar(); // se ha quedado atrás (o adelantado)
            }
        } else {
            const sonaba = this.confirmado && !antes.pausado;
            this.confirmado = false;
            if (sonaba && o.reproduciendo && !this.local.buffer && ahora - this.ordenMia > MARGEN_ORDEN) {
                // Sonaba y se ha parado sin que se lo pidiéramos: o ha llegado al final (de la canción o de la muestra),
                // o lo ha pausado la persona. Al acabar, unos reproductores se quedan al final y otros vuelven al
                // principio: por eso cuenta también lo más lejos que había llegado sonando.
                const alFinal = this.local.duracion > 0 && Math.max(this.local.posicion, this.maximo) >= this.local.duracion - MARGEN_FINAL;
                if (alFinal) this.acabada = true;
                else this.manual = true;
            }
        }
        // «Arrancando» no se queda nunca sin vigilar: o acaba sonando, o se pide que se pulse ▶.
        if (this.estado === "arrancando" && !this.vigiaTocar) this.vigilarTocar();
        this.avisarSiCambia();
    }
}
