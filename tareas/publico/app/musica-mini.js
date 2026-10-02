// El reproductor pequeño de la oficina (/tareas/musica/mini/). Lo abre el botón «Música» de la barra de la oficina,
// abajo a la izquierda (360 × 128), y sigue sonando mientras se anda por la oficina: qué suena en la cabina, quién
// pincha, y escucharlo con el reproductor compacto de Spotify (80 px). No puede usar la API de la oficina; los
// enlaces se abren en una pestaña nueva.
//
// Abrirlo ya es querer oír: si la persona nunca ha dicho nada, arranca solo (si pulsó «Silenciar», se respeta; y quien
// pincha no se oye a sí mismo). Y lo que pasa con el sonido se dice en una línea a la vista, con lo que hay que hacer:
// pulsar ▶ si el navegador no le deja empezar solo, entrar en Spotify si solo suena la muestra de 30 s…

import { h, $ } from "./util.js";
import { cuandoSePierdaLaSesion } from "./api.js";
import { apiMusica, avisadorDeEscucha, canalMusica, conLlegada, coordinar, direccionEntrar, disco, iconoPixel, iconoSpotify, portada, posicionAhora, preferencia, Reproductor, tiempo, vigiaDeSerie } from "./musica-comun.js";

const CABINA = new URL("../", location.href).pathname; // /tareas/musica/
const SPOTIFY_WEB = "https://open.spotify.com/";

const E = {
    vista: "cargando", // cargando · sin-sesion · sin-configurar · sin-conexion · musica
    yo: null,
    usuarios: [],
    cabina: null,
    sonando: null,
    anuncio: false,
    escuchando: [],
    oyentes: [], // [{ id, estado }]: a quién le suena de verdad
    info: { estado: "apagado", muestra: false },
    cedido: false,
    calladoPorPinchar: false, // sonaba aquí y se calló solo al pasar a pinchar: al dejar la cabina, vuelve
    fuiASpotify: false, // ha pulsado «Entra en Spotify»: al volver se pone otra vez el reproductor
};

let canal = null;
let caidoDesde = 0;
let vigiaSesion = null;
const soyDj = () => Boolean(E.yo && E.cabina?.dj.id === E.yo.id);

// ---------- el esqueleto (siempre el mismo: el reproductor de Spotify no se mueve de sitio) ----------

const hueco = h("div", { class: "mini-embed", id: "reproductor" });
const raiz = document.getElementById("app");
raiz.replaceChildren(
    h(
        "div",
        { class: "mini", id: "mini", "data-vista": "cargando" },
        h("h1", { class: "oculto" }, "Música"),
        h(
            "div",
            { class: "mini-cabeza" },
            h("span", { class: "mini-rotulo", id: "rotulo" }),
            h("span", { class: "mini-botones" }, h("span", { id: "zona-escuchar" }), h("a", { class: "mini-abrir", id: "abrir", href: CABINA, target: "_blank", rel: "noopener", title: "Abrir la cabina (pestaña nueva)", "aria-label": "Abrir la cabina en una pestaña nueva" }, iconoPixel("abrir"))),
        ),
        h("div", { class: "mini-cuerpo", id: "cuerpo" }),
        h("div", { class: "mini-caja", id: "caja" }, hueco, h("div", { class: "mini-sin-embed", id: "sin-embed" })),
        h("div", { class: "mini-pie", id: "pie" }),
    ),
);

const reproductor = new Reproductor(hueco, {
    alto: 80,
    alCambiar: (info) => {
        E.info = info;
        avisador.luego();
        pintar();
    },
});
// Cuenta al servidor si aquí se escucha y cómo va (lo ve quien pincha, junto a cada nombre).
const avisador = avisadorDeEscucha(reproductor);

// ---------- una sola ventana sonando ----------

const coordinador = coordinar({
    alCeder() {
        if (!reproductor.encendido) return;
        reproductor.apagar();
        E.cedido = true;
        avisador.ya();
        pintar();
    },
    alRecuperar() {
        if (!E.cedido || preferencia.leer() === "no" || E.vista !== "musica") return;
        escuchar(true, { auto: true });
    },
    alSilencio() {
        E.cedido = false;
        pintar();
    },
});
addEventListener("pagehide", () => {
    if (reproductor.encendido) coordinador.suelta();
});

function escuchar(si, { auto = false } = {}) {
    E.cedido = false;
    E.calladoPorPinchar = false;
    if (si) {
        reproductor.encender();
        reproductor.seguir(E.sonando);
        coordinador.suena();
        if (!auto) preferencia.guardar(true);
    } else {
        reproductor.apagar();
        coordinador.calla();
        preferencia.guardar(false);
    }
    avisador.ya();
    pintar();
}

// Abrir el reproductor pequeño ya es querer oír: arranca solo salvo que la persona pulsara «Silenciar» (se respeta) o
// sea quien pincha (ya lo oye en su Spotify: aquí lo oiría dos veces).
const quiereOir = () => preferencia.leer() !== "no" && !soyDj();

function reintentarReproductor() {
    if (!reproductor.encendido) return;
    reproductor.reintentar();
    reproductor.seguir(E.sonando);
}

// «Entra en Spotify»: se abre en otra pestaña y, al volver, se pone otra vez el reproductor para que reconozca la sesión.
function enlaceSpotify(texto, clase = "mini-enlace") {
    return h("a", { class: clase, href: SPOTIFY_WEB, target: "_blank", rel: "noopener", onclick: () => (E.fuiASpotify = true) }, texto);
}

// ---------- pintar ----------

function boton(clase, icono, texto, onclick, extra = {}) {
    return h("button", { type: "button", class: ["btn pequeno", clase], onclick, ...extra }, icono ? iconoPixel(icono) : null, h("span", { class: "texto-boton" }, texto));
}

function mensaje(titulo, texto, accion = null) {
    return h(
        "div",
        { class: "mini-mensaje" },
        disco("mini-disco"),
        h("div", { class: "mini-textos" }, h("p", { class: "mini-titulo-mensaje" }, titulo), texto ? h("p", { class: "mini-linea" }, texto) : null),
        accion,
    );
}

function enlace(href, texto, clase = "btn pequeno") {
    return h("a", { class: clase, href, target: "_blank", rel: "noopener" }, texto);
}

function pintar() {
    const mini = $("#mini");
    const cuerpo = $("#cuerpo");
    const rotulo = $("#rotulo");
    const zonaEscuchar = $("#zona-escuchar");
    const pie = $("#pie");
    const sinEmbed = $("#sin-embed");
    const s = E.sonando;
    const dj = E.cabina?.dj || null;
    const encendido = reproductor.encendido;
    let vista = "mensaje";
    let contenido = null;
    let aviso = "no"; // "grande" o "linea": la cabeza es para lo que hay que hacer (y «Silenciar» se queda en su icono)
    zonaEscuchar.replaceChildren();
    pie.replaceChildren();
    rotulo.replaceChildren();
    mini.dataset.dj = dj ? "si" : "no";

    if (E.vista === "cargando") contenido = mensaje("Música", "Cargando…");
    else if (E.vista === "sin-sesion") {
        contenido = mensaje(
            "Música del estudio",
            "Entra con tu cuenta del crew para oírla.",
            h(
                "a",
                {
                    class: "btn pequeno primario",
                    href: direccionEntrar(CABINA),
                    target: "_blank",
                    rel: "noopener",
                    onclick: () => vigilarSesion(4000),
                },
                "Entrar ↗",
            ),
        );
    } else if (E.vista === "sin-configurar") {
        // «Ver cómo» lleva a los pasos de la cabina, que solo ve quien administra: el resto ve solo que aún no está conectada.
        contenido = mensaje("Música del estudio", "Aún no está conectada con Spotify.", E.yo?.admin ? enlace(CABINA, "Ver cómo ↗") : null);
    } else if (E.vista === "sin-conexion") {
        contenido = mensaje("Sin conexión", "No llego a la oficina.", boton("primario", null, "Reintentar", reintentar));
    } else if (!dj) {
        contenido = mensaje("Cabina vacía", "Ahora no pincha nadie.", enlace(CABINA, "Pinchar ↗"));
    } else if (!s) {
        if (soyDj() && !E.anuncio) contenido = mensaje("Pinchas tú", "Pon música en tu Spotify."); // PROVISIONAL-v0.3.1 (los dos: lo que ve quien pincha)
        else contenido = mensaje(`Pincha ${dj.nombre}`, E.anuncio ? "En su Spotify suena un anuncio…" : "Ahora mismo no suena nada.");
    } else if (encendido) {
        vista = "escuchando";
    } else {
        vista = "info";
    }

    // Lo de escuchar (en la cabeza, salvo cuando se ve la canción sin escuchar: entonces va abajo).
    const puedeEscuchar = E.vista === "musica";
    if (puedeEscuchar && (encendido || vista === "escuchando")) {
        zonaEscuchar.append(boton("", "parar", "Silenciar", () => escuchar(false), { id: "boton-escuchar", "aria-pressed": "true", title: "Dejar de escuchar", "aria-label": "Silenciar" }));
    }

    if (vista === "mensaje") {
        cuerpo.replaceChildren(contenido);
        if (encendido && E.vista === "musica") {
            // Está puesto (al abrirlo, o porque lo dejó así) y sonará en cuanto haya algo: la línea entera, sin cortar.
            aviso = "linea";
            rotulo.append(h("span", { class: "mini-estado" }, "Escuchando: esperando a que suene algo"));
        }
    } else if (vista === "info") {
        cuerpo.replaceChildren(
            h(
                "div",
                { class: "mini-info" },
                s.enlace ? h("a", { href: s.enlace, target: "_blank", rel: "noopener", class: "mini-portada-enlace", title: "Abrir en Spotify" }, portada(s.portada, { clase: "portada mini-portada" })) : portada(s.portada, { clase: "portada mini-portada" }),
                h(
                    "div",
                    { class: "mini-textos" },
                    // PROVISIONAL-v0.3.1 («Pinchas tú», para quien pincha)
                    h("p", { class: "mini-dj" }, h("span", { class: ["led", s.reproduciendo && "encendido"] }), soyDj() ? "Pinchas tú" : `Pincha ${dj.nombre}`, s.reproduciendo ? null : h("span", { class: "mini-pausa" }, " · en pausa")),
                    // El título entero sale al pasar el ratón y, si no cabe y está sonando, se desplaza solo (ver «marquesina»).
                    tituloQueCorre(s.titulo, s.enlace ? h("a", { href: s.enlace, target: "_blank", rel: "noopener", title: s.titulo }, s.titulo) : s.titulo, s.reproduciendo),
                    h("p", { class: "mini-artistas" }, s.enlace ? h("a", { class: "mini-spotify", href: s.enlace, target: "_blank", rel: "noopener", title: "Abrir en Spotify", "aria-label": "Abrir en Spotify" }, iconoSpotify()) : iconoSpotify(), h("span", { title: s.artistas.map((a) => a.nombre).join(", ") }, s.artistas.map((a) => a.nombre).join(", "))),
                ),
            ),
        );
        pie.append(
            E.cedido
                ? boton("primario", "tocar", "Aquí", () => escuchar(true), { id: "boton-escuchar", "aria-pressed": "false", title: "Suena en otra ventana: escuchar aquí" })
                : boton("primario", "tocar", "Escuchar", () => escuchar(true), {
                      id: "boton-escuchar",
                      "aria-pressed": "false",
                      // PROVISIONAL-v0.3.1 (la ayuda del botón para quien pincha: la frase que ya usa la cabina)
                      title: s.local ? "Es un archivo local del DJ: no está en Spotify" : soyDj() ? "Tú ya lo oyes en tu Spotify: aquí sonará dos veces" : "Escuchar a la vez que la cabina",
                  }),
            h("span", { class: "mini-progreso" }, h("span", { class: "mini-relleno", id: "relleno" })),
            h("span", { class: "mini-tiempo", id: "tiempo" }, tiempo(posicionAhora(s))),
        );
    } else {
        // Escuchando: arriba quién pincha, o qué pasa con el sonido y qué hay que hacer; debajo, el reproductor de Spotify.
        cuerpo.replaceChildren();
        const estado = E.info.estado;
        const meSuena = (o) => o.estado === "suena" || o.estado === "muestra";
        const otros = E.oyentes.filter((o) => o.id !== E.yo?.id && meSuena(o)).length; // a cuántos más les suena de verdad
        const quienPincha = h("span", { class: "mini-dj" }, h("span", { class: ["led", s.reproduciendo && "encendido"] }), `Pincha ${dj.nombre}`, otros ? h("span", { class: "mini-oyentes" }, ` · +${otros}`) : null);
        if (estado === "bloqueado") {
            // El navegador no le deja empezar solo: lo que hay que pulsar, claro y grande (el ▶ está justo debajo).
            aviso = "grande";
            rotulo.append(h("span", { class: "mini-pulsa", role: "status" }, h("span", { class: "mini-flecha", "aria-hidden": "true" }, "▼"), "Pulsa ▶ aquí abajo")); // PROVISIONAL-v0.3.1 (antes: «Pulsa ▶ en Spotify para empezar»)
        } else if (estado === "muestra") {
            // Solo suena la muestra: se dice a la vista (no en un chip con la explicación escondida) y con qué hacer.
            aviso = "linea";
            // (antes: un chip «30 s» con la explicación solo al pasar el ratón; esa explicación, la de la cabina, sigue de ayuda)
            rotulo.append(
                h(
                    "span",
                    { class: "mini-estado", role: "status", title: "Es la muestra de 30 segundos: entra en Spotify en este navegador (open.spotify.com) para oír las canciones enteras." },
                    "Solo suenan 30 s · ", // PROVISIONAL-v0.3.1
                    enlaceSpotify("Entra en Spotify ↗", "mini-enlace-linea"), // PROVISIONAL-v0.3.1
                ),
            );
        } else if (estado === "a-mano") {
            rotulo.append(h("span", { class: "mini-estado" }, "Lo has pausado tú"));
        } else if (estado === "pausa") {
            rotulo.append(h("span", { class: "mini-estado" }, "La cabina está en pausa"));
        } else rotulo.append(quienPincha);
        const sinReproductor = !reproductor.control || ["fallo", "local", "cargando", "muestra-acabada"].includes(estado);
        sinEmbed.hidden = !sinReproductor;
        // (mientras carga, y con la muestra acabada, el reproductor sigue ahí debajo del aviso: tiene que poder cargar y
        // arrancar con la canción siguiente)
        hueco.hidden = sinReproductor && !["cargando", "muestra-acabada"].includes(estado);
        if (sinReproductor) {
            let partes;
            if (estado === "muestra-acabada") {
                // La muestra ha terminado y no suena nada hasta la canción siguiente: se dice, y qué hacer para oírlas enteras.
                partes = [
                    h("p", { class: "mini-linea" }, "Se acabó la muestra de 30 s. Sonará con la próxima canción."), // PROVISIONAL-v0.3.1
                    enlaceSpotify("Óyelas enteras: entra en Spotify ↗"), // PROVISIONAL-v0.3.1
                ];
            } else {
                const textos = {
                    cargando: "Poniendo el reproductor de Spotify…",
                    fallo: "No carga el reproductor de Spotify.",
                    local: "Es un archivo local del DJ: aquí no se oye.",
                };
                partes = [
                    tituloQueCorre(s.titulo, s.titulo, s.reproduciendo),
                    h("p", { class: "mini-linea" }, textos[estado] || textos.cargando),
                    estado === "fallo"
                        ? h(
                              "p",
                              { class: "mini-salidas" },
                              h("button", { type: "button", class: "mini-enlace", id: "boton-reintentar", onclick: reintentarReproductor }, "Reintentar"), // (el texto de siempre, en un botón nuevo)
                              s.enlace ? h("a", { class: "mini-enlace", href: s.enlace, target: "_blank", rel: "noopener" }, iconoSpotify(), "Abrir en Spotify ↗") : null,
                          )
                        : null,
                ];
            }
            sinEmbed.replaceChildren(portada(s.portada, { clase: "portada mini-portada" }), h("div", { class: "mini-textos" }, partes));
        }
    }
    mini.dataset.vista = vista;
    mini.dataset.aviso = aviso;
    mini.dataset.estado = vista === "escuchando" ? E.info.estado : "";
    // Con algo que decir en la cabeza (quién pincha, silenciar) ocupa su fila; si no, solo queda el botón de abrir, en la esquina.
    mini.dataset.cabeza = rotulo.childElementCount || zonaEscuchar.childElementCount ? "si" : "no";
    pintarProgreso();
    correrTitulos();
}

// ---------- marquesina: un título que no cabe se desplaza solo, despacio, mientras suena ----------

// Va y vuelve a 20 px por segundo, de píxel en píxel, con una pausa larga en cada extremo: se lee entero sin marear.
// Parado (en pausa, o con «menos movimiento» en el sistema) se queda con sus «…» de siempre; entero sale siempre al
// pasar el ratón (title).
const MARQUESINA = { velocidad: 20, pausa: 2500 };
let relojMarquesina = { texto: null, desde: 0 }; // para que un repintado no la devuelva al principio

function tituloQueCorre(texto, contenido, suena) {
    return h("p", { class: "mini-titulo", title: texto }, h("span", { class: "mini-corre", dataset: { corre: suena ? "si" : "no" } }, contenido));
}

function correrTitulos() {
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const tira of document.querySelectorAll('.mini-corre[data-corre="si"]')) {
        const caja = tira.parentElement;
        if (!caja.clientWidth || typeof tira.animate !== "function") continue; // escondido (o un navegador sin animaciones)
        const sobra = Math.ceil(caja.scrollWidth - caja.clientWidth);
        if (sobra < 3) continue; // cabe: no hay nada que mover
        caja.classList.add("corre"); // sin «…» mientras se mueve
        const ida = (sobra / MARQUESINA.velocidad) * 1000;
        const total = ida + MARQUESINA.pausa * 2;
        const quieto = MARQUESINA.pausa / total;
        const animacion = tira.animate(
            [
                { transform: "translateX(0)", offset: 0 },
                { transform: "translateX(0)", offset: quieto, easing: `steps(${sobra}, end)` },
                { transform: `translateX(${-sobra}px)`, offset: 1 - quieto },
                { transform: `translateX(${-sobra}px)`, offset: 1 },
            ],
            { duration: total, iterations: Infinity, direction: "alternate" },
        );
        // El mismo título sigue por donde iba aunque la barra se repinte (llega un aviso cada pocos segundos).
        const texto = caja.title;
        if (relojMarquesina.texto !== texto) relojMarquesina = { texto, desde: performance.now() };
        animacion.currentTime = performance.now() - relojMarquesina.desde;
    }
}
// Las letras llegan después de pintar y cambian lo que mide el título: se mira otra vez.
document.fonts?.ready?.then(() => {
    for (const tira of document.querySelectorAll(".mini-corre")) tira.getAnimations?.().forEach((a) => a.cancel());
    correrTitulos();
});

function pintarProgreso() {
    const s = E.sonando;
    const relleno = document.getElementById("relleno");
    if (!s || !relleno) return;
    const va = posicionAhora(s);
    relleno.style.width = `${s.duracion ? Math.min(100, (va / s.duracion) * 100) : 0}%`;
    const t = document.getElementById("tiempo");
    if (t) t.textContent = tiempo(va);
}
setInterval(pintarProgreso, 1000);

// ---------- datos y tiempo real ----------

function ponerOyentes(datos) {
    E.escuchando = datos.escuchando || [];
    E.oyentes = datos.oyentes || E.escuchando.map((id) => ({ id, estado: null }));
}

// Lo que llega del servidor (lo pedido o un aviso) ¿está al día, o es más viejo que lo último que se ha visto?
const alDia = vigiaDeSerie();

function cargar(datos) {
    const pinchaba = soyDj();
    if (datos.yo) E.yo = datos.yo;
    if (datos.usuarios) E.usuarios = datos.usuarios;
    E.vista = datos.configurado ? "musica" : "sin-configurar";
    // La cabina, lo que suena y quién escucha: solo si no es más viejo que lo último visto (una respuesta pedida
    // antes puede llegar después de un aviso en directo más nuevo, y dejaría puesta una canción que ya no suena).
    if (!alDia(datos)) return;
    E.cabina = datos.cabina;
    E.sonando = conLlegada(datos.sonando);
    E.anuncio = Boolean(datos.anuncio);
    ponerOyentes(datos);
    reproductor.seguir(E.sonando);
    if (!pinchaba && soyDj() && reproductor.encendido) {
        // Pasa a pinchar: ya lo oye en su Spotify, así que aquí se calla solo (sin tocar lo que tenía dicho).
        reproductor.apagar();
        coordinador.calla();
        avisador.ya();
        E.calladoPorPinchar = true;
    } else if (pinchaba && !soyDj() && E.calladoPorPinchar && E.vista === "musica" && quiereOir()) {
        escuchar(true, { auto: true }); // deja la cabina: vuelve a oír lo que pinche otra persona
    }
}

async function recargar() {
    try {
        cargar(await apiMusica.estado());
        pintar();
        return true;
    } catch (err) {
        if (err.estado === 401) ponerSinSesion();
        return false;
    }
}

function alEvento(ev) {
    if (ev.tipo === "musica") {
        cargar(ev);
        pintar();
    } else if (ev.tipo === "musica-oyentes") {
        if (!alDia(ev)) return;
        ponerOyentes(ev);
        pintar();
    } else if (ev.tipo === "usuarios") {
        E.usuarios = ev.usuarios;
    }
}

function abrirCanal() {
    canal?.cerrar();
    canal = canalMusica({
        alEvento,
        alAbrir: () => {
            caidoDesde = 0;
            recargar();
            avisador.repetir();
        },
        alCaer: async (cerrado) => {
            if (!caidoDesde) caidoDesde = Date.now();
            setTimeout(() => {
                if (caidoDesde && Date.now() - caidoDesde >= 8000 && E.vista !== "sin-sesion") {
                    E.vista = "sin-conexion";
                    pintar();
                }
            }, 8100);
            if (cerrado) await recargar(); // ¿sesión caducada?
        },
    });
}

function ponerSinSesion() {
    canal?.cerrar();
    canal = null;
    if (reproductor.encendido) reproductor.apagar();
    E.vista = "sin-sesion";
    pintar();
    vigilarSesion(30000);
}
cuandoSePierdaLaSesion(() => {
    if (E.vista !== "sin-sesion") ponerSinSesion();
});

// Sin sesión: se mira de vez en cuando si ya ha entrado (en la pestaña que abre «Entrar»).
function vigilarSesion(cada) {
    clearInterval(vigiaSesion);
    const hasta = Date.now() + 10 * 60 * 1000;
    vigiaSesion = setInterval(async () => {
        if (E.vista !== "sin-sesion") return clearInterval(vigiaSesion);
        if (cada < 30000 && Date.now() > hasta) return vigilarSesion(30000);
        try {
            const datos = await apiMusica.estado();
            clearInterval(vigiaSesion);
            empezar(datos);
        } catch {
            /* todavía no */
        }
    }, cada);
}

async function reintentar() {
    E.vista = "cargando";
    pintar();
    try {
        empezar(await apiMusica.estado());
    } catch (err) {
        if (err.estado === 401) ponerSinSesion();
        else {
            E.vista = "sin-conexion";
            pintar();
        }
    }
}

function empezar(datos) {
    cargar(datos);
    pintar();
    abrirCanal();
    // Abrirlo ya es querer oír: arranca solo (si el navegador no le deja, se dice bien claro qué hay que pulsar).
    if (E.vista === "musica" && !reproductor.encendido && !E.cedido && quiereOir()) escuchar(true, { auto: true });
}

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (E.vista === "sin-sesion" || E.vista === "sin-conexion") reintentar();
    // Vuelve de entrar en Spotify: con el reproductor puesto de nuevo, Spotify ya reconoce la sesión.
    if (E.fuiASpotify) {
        E.fuiASpotify = false;
        reintentarReproductor();
    }
});

pintar();
reintentar();
