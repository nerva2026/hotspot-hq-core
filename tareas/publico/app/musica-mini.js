// El reproductor pequeño de la oficina (/tareas/musica/mini/). Lo abre el botón «Música» de la barra de la oficina,
// abajo a la izquierda (360 × 128), y sigue sonando mientras se anda por la oficina: qué suena en la cabina, quién
// pincha, y escucharlo con el reproductor compacto de Spotify (80 px). No puede usar la API de la oficina; los
// enlaces se abren en una pestaña nueva.

import { h, $ } from "./util.js";
import { cuandoSePierdaLaSesion } from "./api.js";
import { apiMusica, canalMusica, conLlegada, coordinar, direccionEntrar, disco, iconoPixel, iconoSpotify, portada, posicionAhora, preferencia, Reproductor, tiempo } from "./musica-comun.js";

const CABINA = new URL("../", location.href).pathname; // /tareas/musica/

const E = {
    vista: "cargando", // cargando · sin-sesion · sin-configurar · sin-conexion · musica
    yo: null,
    usuarios: [],
    cabina: null,
    sonando: null,
    anuncio: false,
    escuchando: [],
    info: { estado: "apagado", muestra: false },
    cedido: false,
};

let canal = null;
let caidoDesde = 0;
let vigiaSesion = null;
const usuario = (id) => E.usuarios.find((u) => u.id === id) || null;

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
        pintar();
    },
});

// ---------- una sola ventana sonando ----------

const coordinador = coordinar({
    alCeder() {
        if (!reproductor.encendido) return;
        reproductor.apagar();
        E.cedido = true;
        apiMusica.escucho(false).catch(() => {});
        pintar();
    },
    alRecuperar() {
        if (!E.cedido || !preferencia.leer() || E.vista !== "musica") return;
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
    apiMusica.escucho(si).catch(() => {});
    pintar();
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
        contenido = mensaje(`Pincha ${dj.nombre}`, E.anuncio ? "En su Spotify suena un anuncio…" : "Ahora mismo no suena nada.");
    } else if (encendido) {
        vista = "escuchando";
    } else {
        vista = "info";
    }

    // Lo de escuchar (en la cabeza, salvo cuando se ve la canción sin escuchar: entonces va abajo).
    const puedeEscuchar = E.vista === "musica";
    if (puedeEscuchar && (encendido || vista === "escuchando")) {
        zonaEscuchar.append(boton("", "parar", "Silenciar", () => escuchar(false), { id: "boton-escuchar", "aria-pressed": "true", title: "Dejar de escuchar" }));
    }

    if (vista === "mensaje") {
        cuerpo.replaceChildren(contenido);
        if (encendido && E.vista === "musica") rotulo.append(h("span", { class: "mini-estado" }, "Escuchando: esperando a que suene algo"));
    } else if (vista === "info") {
        cuerpo.replaceChildren(
            h(
                "div",
                { class: "mini-info" },
                s.enlace ? h("a", { href: s.enlace, target: "_blank", rel: "noopener", class: "mini-portada-enlace", title: "Abrir en Spotify" }, portada(s.portada, { clase: "portada mini-portada" })) : portada(s.portada, { clase: "portada mini-portada" }),
                h(
                    "div",
                    { class: "mini-textos" },
                    h("p", { class: "mini-dj" }, h("span", { class: ["led", s.reproduciendo && "encendido"] }), `Pincha ${dj.nombre}`, s.reproduciendo ? null : h("span", { class: "mini-pausa" }, " · en pausa")),
                    h("p", { class: "mini-titulo" }, s.enlace ? h("a", { href: s.enlace, target: "_blank", rel: "noopener", title: "Abrir en Spotify" }, s.titulo) : s.titulo),
                    h("p", { class: "mini-artistas" }, s.enlace ? h("a", { class: "mini-spotify", href: s.enlace, target: "_blank", rel: "noopener", title: "Abrir en Spotify", "aria-label": "Abrir en Spotify" }, iconoSpotify()) : iconoSpotify(), h("span", null, s.artistas.map((a) => a.nombre).join(", "))),
                ),
            ),
        );
        pie.append(
            E.cedido
                ? boton("primario", "tocar", "Aquí", () => escuchar(true), { id: "boton-escuchar", "aria-pressed": "false", title: "Suena en otra ventana: escuchar aquí" })
                : boton("primario", "tocar", "Escuchar", () => escuchar(true), { id: "boton-escuchar", "aria-pressed": "false", title: s.local ? "Es un archivo local del DJ: no está en Spotify" : "Escuchar a la vez que la cabina" }),
            h("span", { class: "mini-progreso" }, h("span", { class: "mini-relleno", id: "relleno" })),
            h("span", { class: "mini-tiempo", id: "tiempo" }, tiempo(posicionAhora(s))),
        );
    } else {
        // Escuchando: arriba quién pincha (o lo que haya que hacer) y debajo el reproductor de Spotify.
        cuerpo.replaceChildren();
        const otros = E.escuchando.filter((id) => id !== E.yo?.id).length;
        const avisos = {
            bloqueado: "Pulsa ▶ en Spotify para empezar",
            "a-mano": "Lo has pausado tú",
            pausa: "La cabina está en pausa",
        };
        rotulo.append(
            ...[
            avisos[E.info.estado]
                ? h("span", { class: "mini-estado" }, avisos[E.info.estado])
                : h("span", { class: "mini-dj" }, h("span", { class: ["led", s.reproduciendo && "encendido"] }), `Pincha ${dj.nombre}`, otros ? h("span", { class: "mini-oyentes" }, ` · +${otros}`) : null),
            E.info.muestra ? h("span", { class: "mini-chip", title: "Muestra de 30 s: entra en Spotify en este navegador para oírlas enteras" }, "30 s") : null,
            ].filter(Boolean), // append(null) escribiría «null»
        );
        const sinReproductor = !reproductor.control || ["fallo", "local", "cargando"].includes(E.info.estado);
        sinEmbed.hidden = !sinReproductor;
        hueco.hidden = sinReproductor && E.info.estado !== "cargando";
        if (sinReproductor) {
            const textos = {
                cargando: "Poniendo el reproductor de Spotify…",
                fallo: "No carga el reproductor de Spotify.",
                local: "Es un archivo local del DJ: aquí no se oye.",
            };
            sinEmbed.replaceChildren(
                portada(s.portada, { clase: "portada mini-portada" }),
                h(
                    "div",
                    { class: "mini-textos" },
                    h("p", { class: "mini-titulo" }, s.titulo),
                    h("p", { class: "mini-linea" }, textos[E.info.estado] || textos.cargando),
                    E.info.estado === "fallo" && s.enlace ? h("a", { class: "mini-enlace", href: s.enlace, target: "_blank", rel: "noopener" }, iconoSpotify(), "Abrir en Spotify ↗") : null,
                ),
            );
        }
    }
    mini.dataset.vista = vista;
    // Con algo que decir en la cabeza (quién pincha, silenciar) ocupa su fila; si no, solo queda el botón de abrir, en la esquina.
    mini.dataset.cabeza = rotulo.childElementCount || zonaEscuchar.childElementCount ? "si" : "no";
    pintarProgreso();
}

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

function cargar(datos) {
    if (datos.yo) E.yo = datos.yo;
    if (datos.usuarios) E.usuarios = datos.usuarios;
    E.vista = datos.configurado ? "musica" : "sin-configurar";
    E.cabina = datos.cabina;
    E.sonando = conLlegada(datos.sonando);
    E.anuncio = Boolean(datos.anuncio);
    E.escuchando = datos.escuchando || [];
    reproductor.seguir(E.sonando);
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
        E.escuchando = ev.escuchando;
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
            if (reproductor.encendido) apiMusica.escucho(true).catch(() => {});
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
    if (E.vista === "musica" && preferencia.leer() && !reproductor.encendido) escuchar(true, { auto: true });
}

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (E.vista === "sin-sesion" || E.vista === "sin-conexion") reintentar();
});

pintar();
reintentar();
