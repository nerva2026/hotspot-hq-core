// La cabina de música del estudio (/tareas/musica/): lo que suena, escucharlo a la vez, pinchar con tu Spotify y lo que
// ha sonado. Se abre en la oficina desde la cabina del DJ (pulsando ESPACIO) o en cualquier navegador.
//
// Quien pincha pone música en su Spotify de siempre; el servidor mira qué le suena y lo cuenta a todos; cada uno lo oye
// con el reproductor de Spotify (ver musica-comun.js y servidor/musica.js).

import { h, $, vaciar, haceCuanto } from "./util.js";
import { api, cuandoSePierdaLaSesion } from "./api.js";
import { vigilante } from "./conexion.js";
import { pantallaEntrar, aplicacion } from "./acceso.js";
import { conSolo } from "./solo.js";
import { abrirMenu, cerrarMenu, aviso, ventana, avatar } from "./menus.js";
import {
    apiMusica,
    avisadorDeEscucha,
    canalMusica,
    conLlegada,
    coordinar,
    dentroDeLaOficina,
    direccionConectar,
    horaCorta,
    iconoPixel,
    iconoSpotify,
    portada,
    posicionAhora,
    preferencia,
    Reproductor,
    tiempo,
    vigiaDeSerie,
} from "./musica-comun.js";

aplicacion("MÚSICA", "La música de la oficina es del crew de HOT SPOT S.L. Entra con tu cuenta de Google.");

const E = {
    yo: null,
    usuarios: [],
    configurado: true,
    cabina: null,
    sonando: null,
    anuncio: false,
    aviso: null,
    historial: [],
    escuchando: [],
    oyentes: [], // [{ id, estado }]: cómo le va a cada persona que escucha (lo ve quien pincha)
    spotify: { conectado: false },
    ajustes: null,
    conectando: false, // ha abierto Spotify en otra pestaña y estamos esperando a que vuelva
    cedido: false, // suena en otra ventana (el reproductor pequeño, otra pestaña…)
    infoReproductor: { estado: "apagado", muestra: false },
    fuiASpotify: false, // ha pulsado «Entrar en Spotify»: al volver a esta pestaña se vuelve a poner el reproductor
    calladoPorPinchar: false, // sonaba aquí y se calló solo al pasar a pinchar: al dejar la cabina, vuelve
    sinConexion: false,
};

const raiz = document.getElementById("app");
let canal = null;
let reproductor = null;
let avisador = null; // cuenta al servidor si esta pestaña escucha y cómo le va
let reloj = null;
const enOficina = dentroDeLaOficina();

const usuario = (id) => E.usuarios.find((u) => u.id === id) || null;
const soyDj = () => Boolean(E.yo && E.cabina?.dj.id === E.yo.id);

// ---------- una sola ventana sonando ----------

const coordinador = coordinar({
    alCeder() {
        if (!reproductor?.encendido) return;
        reproductor.apagar();
        E.cedido = true;
        avisador?.ya();
        pintarAhora();
    },
    alRecuperar() {
        if (!E.cedido || preferencia.leer() === "no") return;
        escuchar(true, { auto: true });
    },
    alSilencio() {
        E.cedido = false;
        pintarAhora();
    },
});
addEventListener("pagehide", () => {
    if (reproductor?.encendido) coordinador.suelta();
});

function escuchar(si, { auto = false } = {}) {
    if (!reproductor) return;
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
    pintarAhora();
}

// Quien pasa a pinchar ya lo oye en su Spotify: si aquí sonaba, se calla solo (sin tocar lo que tenía dicho), para
// que no lo oiga dos veces. Si quiere oírlo también aquí, sigue teniendo «Escuchar».
function callarPorPinchar() {
    if (!reproductor?.encendido) return;
    reproductor.apagar();
    coordinador.calla();
    avisador.ya();
    E.calladoPorPinchar = true;
}

// ---------- montar la página ----------

function montar() {
    vaciar(raiz);
    document.body.classList.toggle("en-oficina", enOficina);
    raiz.append(
        h(
            "header",
            { class: "barra" },
            h("div", { class: "marca" }, h("span", { class: "logo" }, "HS"), h("h1", { class: "nombre-app" }, "MÚSICA")),
            h(
                "nav",
                { class: "pestanas pantallas otra-pantalla", "aria-label": "Aplicaciones" },
                h("a", { class: "pestana otra-pantalla", href: "../" }, "Tareas"),
                E.yo.libro ? h("a", { class: "pestana otra-pantalla", href: "../libro/" }, "Cuentas") : null,
                h("a", { class: "pestana otra-pantalla", href: "../pizarra/" }, "Pizarra"),
                h("a", { class: "pestana otra-pantalla", href: "../archivo/" }, "Archivo"),
                h("span", { class: "pestana activa", "aria-current": "page" }, "Música"),
            ),
            h("div", { class: "barra-derecha" }, h("div", { class: "presentes", id: "oyentes" }), h("button", { type: "button", class: "boton-yo", id: "boton-yo", "aria-label": "Tu cuenta", onclick: (e) => menuYo(e.currentTarget) })),
        ),
        h(
            "main",
            { class: "musica", id: "musica" },
            h(
                "div",
                { class: "musica-contenido", id: "musica-contenido" },
                h(
                    "section",
                    { class: "tarjeta-musica ahora", id: "ahora", "aria-labelledby": "titulo-ahora" },
                    h("header", { class: "cabecera-ahora" }, h("h2", { id: "titulo-ahora" }, "Ahora suena"), h("span", { class: "chip-directo", id: "chip-directo" })),
                    h("div", { class: "ahora-cuerpo", id: "ahora-cuerpo" }),
                    h("div", { class: "aviso-musica", id: "aviso-musica", role: "status", hidden: true }),
                    h("div", { class: "ahora-controles", id: "ahora-controles" }),
                    // Qué pasa con el sonido y qué hay que hacer, justo encima del reproductor de Spotify.
                    h("div", { class: "ayuda-reproductor", id: "ayuda-reproductor" }, h("p", { class: "nota nota-reproductor", id: "nota-reproductor", "aria-live": "polite" }), h("span", { class: "accion-reproductor", id: "accion-reproductor" })),
                    h("div", { class: "reproductor", id: "reproductor" }),
                ),
                h("section", { class: "tarjeta-musica cabina", id: "cabina", "aria-label": "La cabina" }),
                h("section", { class: "tarjeta-musica tu-spotify", id: "cuenta", "aria-label": "Tu Spotify" }),
                h("section", { class: "tarjeta-musica historial", id: "historial", "aria-label": "Lo que ha sonado" }),
                h("section", { class: "tarjeta-musica sin-configurar", id: "sin-configurar", hidden: true }),
            ),
        ),
    );
    reproductor?.apagar();
    reproductor = new Reproductor($("#reproductor"), {
        alto: 152,
        alCambiar: (info) => {
            E.infoReproductor = info;
            avisador?.luego();
            pintarReproductor();
        },
    });
    avisador = avisadorDeEscucha(reproductor);
}

function pintar() {
    if (!E.yo) return;
    $("#sin-configurar").hidden = E.configurado;
    for (const id of ["ahora", "cabina", "cuenta", "historial"]) $(`#${id}`).hidden = !E.configurado;
    if (!E.configurado) {
        pintarSinConfigurar();
        pintarCabecera();
        return;
    }
    pintarCabecera();
    pintarAhora();
    pintarCabina();
    pintarCuenta();
    pintarHistorial();
}

function pintarCabecera() {
    $("#boton-yo")?.replaceChildren(avatar(E.yo), h("span", { class: "nombre-yo" }, E.yo.nombre), h("span", { class: "flecha" }, "▾"));
    const zona = $("#oyentes");
    if (!zona) return;
    const gente = E.escuchando.map(usuario).filter(Boolean);
    zona.replaceChildren(...(gente.length ? [h("span", { class: "nota" }, "Escuchan:"), h("span", { class: "avatares" }, gente.map((u) => avatar(u)))] : []));
    zona.title = gente.length ? `Escuchando ahora: ${gente.map((u) => u.nombre).join(", ")}` : "";
}

// ---------- ahora suena ----------

// La portada grande se reutiliza mientras no cambie (para que no parpadee con cada aviso del servidor).
let portadaGrande = { url: undefined, el: null };
function portadaDeAhora(s) {
    if (portadaGrande.url !== s.portada || !portadaGrande.el) {
        portadaGrande = { url: s.portada, el: portada(s.portada, { clase: "portada portada-grande", alt: s.album ? `Portada de «${s.album}»` : "" }) };
    }
    return portadaGrande.el;
}

function enlaceExterno(href, ...hijos) {
    return href ? h("a", { href, target: "_blank", rel: "noopener" }, ...hijos) : h("span", null, ...hijos);
}

function pintarAhora() {
    const s = E.sonando;
    const cuerpo = $("#ahora-cuerpo");
    if (!cuerpo) return;
    const chip = $("#chip-directo");
    const dj = E.cabina?.dj || null;
    chip.className = ["chip-directo", s?.reproduciendo ? "en-directo" : s ? "en-pausa" : "apagado"].join(" ");
    chip.replaceChildren(...(s?.reproduciendo ? [h("span", { class: "ecualizador", "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("i")), "En directo"] : [s ? "En pausa" : dj ? "Sin música" : "Cabina libre"]));

    if (s) {
        const cancion = s.tipo === "episodio" ? "Episodio" : "Canción";
        cuerpo.replaceChildren(
            enlaceExterno(s.enlace, portadaDeAhora(s)),
            h(
                "div",
                { class: "ahora-datos" },
                h("p", { class: "ahora-titulo" }, enlaceExterno(s.enlace, s.titulo)),
                h(
                    "p",
                    { class: "ahora-artistas" },
                    s.artistas.flatMap((a, i) => [i ? ", " : null, enlaceExterno(a.enlace, a.nombre)]),
                ),
                s.album ? h("p", { class: "ahora-album" }, enlaceExterno(s.enlaceAlbum, s.album)) : null,
                h(
                    "div",
                    { class: "progreso-musica", role: "progressbar", "aria-label": `Por dónde va la ${cancion.toLowerCase()}`, "aria-valuemin": "0", "aria-valuemax": String(Math.round(s.duracion / 1000)) },
                    h("span", { class: "progreso-relleno", id: "progreso-relleno" }),
                ),
                h("div", { class: "tiempos" }, h("span", { id: "tiempo-va" }, tiempo(posicionAhora(s))), h("span", null, tiempo(s.duracion))),
                h("p", { class: "ahora-dj" }, dj ? [avatar(usuario(dj.id) || dj, { tam: "mini" }), h("span", null, `Pincha ${dj.nombre}`)] : null),
                h(
                    "p",
                    { class: "atribucion" },
                    iconoSpotify(),
                    s.local ? h("span", null, "Archivo local del DJ (no está en Spotify)") : h("span", null, "Música de ", h("strong", null, "Spotify")),
                ),
            ),
        );
    } else {
        let titulo;
        let texto;
        if (!dj) {
            titulo = "La cabina está libre";
            texto = "Ahora no pincha nadie. Si quieres poner tú la música, mira «La cabina».";
        } else if (E.anuncio) {
            titulo = "Un momento…";
            texto = `En el Spotify de ${dj.nombre} está sonando un anuncio.`;
        } else {
            titulo = `Pincha ${dj.nombre}`;
            texto = soyDj()
                ? "Pon algo en tu Spotify (en el móvil o en el ordenador): en unos segundos sale aquí. Cada persona la oye cuando abre «Música»." // PROVISIONAL-v0.3.1
                : `Ahora mismo no suena nada en el Spotify de ${dj.nombre}.`;
        }
        cuerpo.replaceChildren(portada(null, { clase: "portada portada-grande apagada" }), h("div", { class: "ahora-datos vacio" }, h("p", { class: "ahora-titulo" }, titulo), h("p", { class: "nota" }, texto)));
    }

    const avisoMusica = $("#aviso-musica");
    avisoMusica.hidden = !E.aviso;
    avisoMusica.textContent = E.aviso || "";

    const encendido = Boolean(reproductor?.encendido);
    const controles = $("#ahora-controles");
    controles.replaceChildren(
        h(
            "button",
            {
                type: "button",
                class: ["btn", encendido ? "" : "primario", "boton-escuchar"],
                id: "boton-escuchar",
                "aria-pressed": String(encendido),
                onclick: () => escuchar(!encendido),
            },
            iconoPixel(encendido ? "parar" : "tocar"),
            encendido ? "Silenciar" : E.cedido ? "Escuchar aquí" : "Escuchar",
        ),
        ...(s?.enlace ? [h("a", { class: "btn boton-spotify", href: s.enlace, target: "_blank", rel: "noopener" }, iconoSpotify(), "Abrir en Spotify")] : []),
    );
    pintarReproductor();
    pintarProgreso();
}

const SPOTIFY_WEB = "https://open.spotify.com/";

function pintarReproductor() {
    const nota = $("#nota-reproductor");
    if (!nota) return;
    const info = E.infoReproductor;
    const encendido = Boolean(reproductor?.encendido);
    const zona = $("#reproductor");
    zona.hidden = !encendido || !reproductor.control || info.estado === "fallo"; // (si no carga, no se enseña un hueco vacío)
    let texto;
    let accion = null;
    if (E.cedido) texto = "Suena en otra ventana de la oficina (el reproductor pequeño u otra pestaña).";
    else {
        texto = {
            apagado: soyDj()
                ? "Tú ya lo oyes en tu Spotify. Si pulsas «Escuchar», sonará también aquí (lo oirás dos veces)." // PROVISIONAL-v0.3.1
                : "Suena en tu navegador con el reproductor de Spotify: entera si has entrado en Spotify en este navegador; si no, 30 segundos de muestra.",
            cargando: "Poniendo el reproductor de Spotify…",
            fallo: "El reproductor de Spotify no carga (¿sin conexión, o lo bloquea el navegador?). Puedes abrir la canción en Spotify.",
            esperando: "Esperando a que suene algo en la cabina…",
            local: "Ahora suena un archivo del ordenador del DJ: no está en Spotify y aquí no se puede oír.",
            arrancando: "Poniendo la canción…", // PROVISIONAL-v0.3.1
            sonando: "Sonando a la vez que la cabina.",
            pausa: "La cabina está en pausa.",
            bloqueado: "Tu navegador no deja que empiece sola: pulsa ▶ en el reproductor de Spotify, aquí debajo.", // PROVISIONAL-v0.3.1 (se añade «, aquí debajo»)
            "a-mano": "Lo has pausado en el reproductor. Pulsa ▶ en él para volver con la cabina.",
            muestra: "Es la muestra de 30 segundos: entra en Spotify en este navegador (open.spotify.com) para oír las canciones enteras.",
            // PROVISIONAL-v0.3.1
            "muestra-acabada": "Se ha acabado la muestra de 30 segundos: seguirá con la canción siguiente. Para oír las canciones enteras, entra en Spotify en este navegador (open.spotify.com).",
        }[info.estado];
        if (soyDj() && encendido && ["sonando", "muestra"].includes(info.estado)) texto += " Tú ya lo oyes en tu Spotify: aquí sonará dos veces.";
        if (info.estado === "muestra" || info.estado === "muestra-acabada") {
            // Al volver de Spotify a esta pestaña se pone otra vez el reproductor, para que reconozca la sesión.
            accion = h("a", { class: "btn pequeno", id: "boton-entrar-spotify", href: SPOTIFY_WEB, target: "_blank", rel: "noopener", onclick: () => (E.fuiASpotify = true) }, iconoSpotify(), "Entrar en Spotify ↗"); // PROVISIONAL-v0.3.1
        } else if (info.estado === "fallo") {
            accion = h("button", { type: "button", class: "btn pequeno", id: "boton-reintentar", onclick: reintentarReproductor }, "Reintentar"); // (el texto de siempre, en un botón nuevo)
        }
    }
    nota.textContent = texto || "";
    const estado = E.cedido ? "cedido" : info.estado;
    nota.dataset.estado = estado;
    // Lo que pide hacer algo (pulsar ▶, entrar en Spotify, reintentar) se ve grande; lo demás, como una nota.
    $("#ayuda-reproductor").dataset.estado = estado;
    zona.dataset.estado = estado;
    const hueco = $("#accion-reproductor");
    if (hueco.dataset.de !== estado) {
        hueco.dataset.de = estado;
        hueco.replaceChildren(...(accion ? [accion] : []));
    }
    const boton = $("#boton-escuchar");
    if (boton && encendido !== (boton.getAttribute("aria-pressed") === "true")) pintarAhora();
}

function reintentarReproductor() {
    if (!reproductor?.encendido) return;
    reproductor.reintentar();
    reproductor.seguir(E.sonando);
}

function pintarProgreso() {
    const s = E.sonando;
    const relleno = $("#progreso-relleno");
    if (!s || !relleno) return;
    const va = posicionAhora(s);
    relleno.style.width = `${s.duracion ? Math.min(100, (va / s.duracion) * 100) : 0}%`;
    const texto = $("#tiempo-va");
    if (texto) texto.textContent = tiempo(va);
    relleno.parentElement.setAttribute("aria-valuenow", String(Math.round(va / 1000)));
}

// ---------- la cabina ----------

function botonConectar(clase = "btn primario") {
    return h(
        "a",
        {
            class: clase,
            // Fuera de la oficina se va a Spotify y se vuelve en esta misma pestaña: que vuelva en el mismo modo (solo.js).
            href: enOficina ? direccionConectar(false) : conSolo(direccionConectar(true)),
            target: enOficina ? "_blank" : null,
            rel: enOficina ? "noopener" : null,
            onclick: () => {
                if (!enOficina) return;
                E.conectando = true;
                pintarCuenta();
                pintarCabina();
            },
        },
        iconoSpotify(),
        enOficina ? "Conectar mi Spotify ↗" : "Conectar mi Spotify",
    );
}

function pintarCabina() {
    const zona = $("#cabina");
    if (!zona || !E.configurado) return;
    const dj = E.cabina?.dj || null;
    const partes = [h("h2", null, "La cabina")];
    if (!dj) {
        partes.push(h("p", { class: "cabina-estado libre" }, h("strong", null, "Libre."), " Ahora no pincha nadie."));
        if (E.spotify.conectado) {
            partes.push(
                h("p", { class: "nota" }, "Entra y pon lo que quieras en tu Spotify (móvil u ordenador). Cada persona la oye cuando abre «Música»."), // PROVISIONAL-v0.3.1
                h("button", { type: "button", class: "btn primario", id: "boton-pinchar", onclick: pinchar }, "Pinchar yo"),
            );
        } else {
            // PROVISIONAL-v0.3.1
            partes.push(h("p", { class: "nota" }, "Para pinchar, conecta tu Spotify (solo se usa para ver qué te suena). Al terminar ya estás en la cabina."), botonConectar());
            if (E.conectando) partes.push(h("p", { class: "nota esperando" }, "Termina en la pestaña nueva; esto se actualizará solo."));
        }
    } else if (soyDj()) {
        partes.push(
            h("p", { class: "cabina-estado mia" }, avatar(E.yo), h("span", null, h("strong", null, "Estás pinchando tú"), h("small", null, `desde las ${horaCorta(E.cabina.desde)}`))),
            // PROVISIONAL-v0.3.1
            h("p", { class: "nota" }, "Pon música en tu Spotify (en el móvil o en el ordenador) como siempre: en unos segundos sale aquí. Cada persona la oye cuando abre «Música»: abajo ves a quién le suena. Si no aparece, mira que no tengas puesta la sesión privada."),
            h("button", { type: "button", class: "btn", id: "boton-dejar", onclick: () => dejarCabina() }, "Dejar la cabina"),
        );
    } else {
        partes.push(h("p", { class: "cabina-estado otro" }, avatar(usuario(dj.id) || dj), h("span", null, h("strong", null, `Pincha ${dj.nombre}`), h("small", null, `desde las ${horaCorta(E.cabina.desde)}`))));
        partes.push(h("p", { class: "nota" }, "Cuando deje la cabina, podrás pinchar tú."));
        if (E.yo.admin) partes.push(h("button", { type: "button", class: "btn peligro", id: "boton-sacar", onclick: () => dejarCabina(dj) }, "Dejar la cabina libre"));
    }
    // Quién escucha y cómo le va de verdad: «Ana · suena», «Víctor · solo 30 s», «Diego · le falta pulsar ▶»…
    const gente = E.oyentes.map((o) => ({ u: usuario(o.id), estado: o.estado })).filter((o) => o.u);
    partes.push(
        h(
            "div",
            { class: "escuchan" },
            h("span", { class: "etiqueta-pequena" }, "Escuchan ahora"),
            gente.length
                ? h(
                      "span",
                      { class: "personas-escuchan" },
                      gente.map(({ u, estado }) =>
                          h("span", { class: "persona", "data-estado": estado || null }, avatar(u, { tam: "mini" }), u.nombre, TEXTO_OYENTE[estado] ? h("span", { class: "como-le-va" }, ` · ${TEXTO_OYENTE[estado]}`) : null),
                      ),
                  )
                : h("span", { class: "nota" }, "Nadie, de momento."),
        ),
    );
    zona.replaceChildren(...partes);
}

// Cómo le va a cada oyente, junto a su nombre (los estados son los de ESTADOS_OYENTE).
const TEXTO_OYENTE = {
    suena: "suena", // PROVISIONAL-v0.3.1
    muestra: "solo 30 s", // PROVISIONAL-v0.3.1
    "falta-pulsar": "le falta pulsar ▶", // PROVISIONAL-v0.3.1
    pausado: "lo ha pausado", // PROVISIONAL-v0.3.1
    cargando: "cargando", // PROVISIONAL-v0.3.1
    espera: "esperando", // PROVISIONAL-v0.3.1
    fallo: "no le carga", // PROVISIONAL-v0.3.1
};

async function pinchar() {
    try {
        cargar(await apiMusica.tomar());
        pintar();
        aviso("Estás en la cabina: pon música en tu Spotify.");
    } catch (err) {
        aviso(err.message, { tipo: "malo" });
        recargar();
    }
}

function dejarCabina(dj = null) {
    const hacer = async () => {
        try {
            cargar(await apiMusica.dejar());
            pintar();
        } catch (err) {
            aviso(err.message, { tipo: "malo" });
            recargar();
        }
    };
    if (!dj) return hacer();
    const v = ventana(
        "Dejar la cabina libre",
        h(
            "div",
            { class: "pila" },
            h("p", null, `Ahora pincha ${dj.nombre}. Si la dejas libre, dejará de sonar su música para todos y cualquiera podrá pinchar.`),
            h(
                "div",
                { class: "acciones-ventana" },
                h("button", { type: "button", class: "btn", onclick: () => v.cerrar() }, "Cancelar"),
                h("button", { type: "button", class: "btn primario", onclick: () => (v.cerrar(), hacer()) }, "Dejarla libre"),
            ),
        ),
    );
}

// ---------- tu Spotify ----------

function pintarCuenta() {
    const zona = $("#cuenta");
    if (!zona || !E.configurado) return;
    const partes = [h("h2", null, "Tu Spotify")];
    if (E.spotify.conectado) {
        partes.push(
            h("p", { class: "cuenta-conectada" }, iconoSpotify(), h("span", null, "Conectado como ", h("strong", null, E.spotify.nombre || "tu cuenta"))),
            h("p", { class: "nota" }, "Solo se usa para ver qué te suena cuando pinchas tú: no se toca nada de tu cuenta."),
            h("button", { type: "button", class: "btn pequeno", id: "boton-desconectar", onclick: desconectar }, "Desconectar"),
        );
    } else {
        partes.push(h("p", null, "Para pinchar hace falta conectar tu cuenta de Spotify. Para escuchar no hace falta."), botonConectar("btn"));
        if (E.conectando) partes.push(h("p", { class: "nota esperando" }, "Termina en la pestaña nueva; esto se actualizará solo."));
    }
    zona.replaceChildren(...partes);
}

function desconectar() {
    const v = ventana(
        "Desconectar tu Spotify",
        h(
            "div",
            { class: "pila" },
            h("p", null, soyDj() ? "Se borra el permiso que guarda la oficina y dejas la cabina." : "Se borra el permiso que guarda la oficina para ver qué te suena."),
            h("p", { class: "nota" }, "Si quieres, también puedes quitárselo desde tu cuenta de Spotify (spotify.com/account/apps)."),
            h(
                "div",
                { class: "acciones-ventana" },
                h("button", { type: "button", class: "btn", onclick: () => v.cerrar() }, "Cancelar"),
                h(
                    "button",
                    {
                        type: "button",
                        class: "btn primario",
                        onclick: async () => {
                            v.cerrar();
                            try {
                                cargar(await apiMusica.desconectar());
                                pintar();
                                aviso("Tu Spotify está desconectado.");
                            } catch (err) {
                                aviso(err.message, { tipo: "malo" });
                            }
                        },
                    },
                    "Desconectar",
                ),
            ),
        ),
    );
}

// ---------- lo que ha sonado ----------

function pintarHistorial() {
    const zona = $("#historial");
    if (!zona || !E.configurado) return;
    zona.replaceChildren(
        h("h2", null, "Ha sonado"),
        E.historial.length
            ? h(
                  "ol",
                  { class: "lista-sonado" },
                  E.historial.map((c) =>
                      h(
                          "li",
                          null,
                          portada(c.portada, { clase: "portada portada-mini" }),
                          h(
                              "div",
                              { class: "sonado-datos" },
                              // Se cortan con «…» si no caben: enteros, al pasar el ratón.
                              h("span", { class: "sonado-titulo", title: c.titulo }, c.enlace ? h("a", { href: c.enlace, target: "_blank", rel: "noopener", title: c.titulo }, c.titulo) : c.titulo),
                              h("span", { class: "sonado-artistas", title: c.artistas.join(", ") }, c.artistas.join(", ")),
                          ),
                          h("span", { class: "sonado-quien", title: `Lo puso ${c.dj.nombre}` }, avatar(usuario(c.dj.id) || c.dj, { tam: "mini" }), h("span", { class: "sonado-cuando" }, haceCuanto(c.cuando))),
                          c.enlace ? h("a", { class: "sonado-spotify", href: c.enlace, target: "_blank", rel: "noopener", title: "Abrir en Spotify", "aria-label": `Abrir «${c.titulo}» en Spotify` }, iconoSpotify()) : h("span", { class: "sonado-spotify" }),
                      ),
                  ),
              )
            : h("p", { class: "nota" }, "Todavía no ha sonado nada."),
    );
}

// ---------- sin configurar ----------

function pintarSinConfigurar() {
    const zona = $("#sin-configurar");
    const partes = [h("h2", null, "Falta conectar Spotify"), h("p", null, "La música de la oficina todavía no está conectada con Spotify.")];
    if (!E.yo.admin || !E.ajustes) {
        partes.push(h("p", { class: "nota" }, "Pídeselo a quien administra la oficina: tiene los pasos aquí mismo."));
    } else {
        const copiable = (texto) =>
            h(
                "span",
                { class: "copiable" },
                h("input", { class: "campo", value: texto, readonly: true, onfocus: (e) => e.target.select(), "aria-label": "Para copiar" }),
                h(
                    "button",
                    {
                        type: "button",
                        class: "btn pequeno",
                        onclick: async (e) => {
                            try {
                                await navigator.clipboard.writeText(texto);
                                e.target.textContent = "Copiado";
                            } catch {
                                e.target.previousSibling.select();
                            }
                        },
                    },
                    "Copiar",
                ),
            );
        partes.push(
            h("h3", null, "Pasos (una sola vez)"),
            h(
                "ol",
                { class: "pasos" },
                h("li", null, "Entra en ", h("a", { href: "https://developer.spotify.com/dashboard", target: "_blank", rel: "noopener" }, "developer.spotify.com/dashboard ↗"), " y crea una aplicación («Create app»). Marca «Web API»."),
                h("li", null, "En «Redirect URIs» pon exactamente esta dirección:", copiable(E.ajustes.vuelta)),
                h("li", null, "En «User Management» añade el nombre y el correo de Spotify de cada persona del crew que vaya a pinchar (mientras la aplicación esté en modo de desarrollo, Spotify solo deja conectar esas cuentas). Para escuchar no hace falta."),
                h("li", null, "Copia el «Client ID» y el «Client secret» y ponlos en el servidor, en ", h("code", null, "/opt/hotspot-tareas/.env"), ":", h("pre", { class: "codigo" }, "SPOTIFY_CLIENT_ID=…\nSPOTIFY_CLIENT_SECRET=…")),
                h("li", null, "Reinicia el servicio: ", h("code", null, "cd /opt/hotspot-tareas && docker compose up -d"), ". Esta pantalla cambiará sola a la cabina."),
            ),
            h("p", { class: "nota" }, "Los detalles están en tareas/README.md («Música (Spotify)»)."),
        );
    }
    zona.replaceChildren(...partes);
}

// ---------- menú de la cuenta y ayuda ----------

function menuYo(ancla) {
    abrirMenu(ancla, () =>
        h(
            "div",
            null,
            h("div", { class: "menu-titulo" }, `Hola, ${E.yo.nombre}`),
            h(
                "div",
                { class: "opciones" },
                enOficina ? h("a", { class: "opcion", href: location.href.split("#")[0].split("?")[0], target: "_blank", rel: "noopener", onclick: cerrarMenu }, h("span", { class: "marca" }), "Abrir en pestaña nueva ↗") : null,
                h("button", { type: "button", class: "opcion", onclick: () => (cerrarMenu(), ayuda()) }, h("span", { class: "marca" }), "¿Cómo funciona?"),
                // «otra-pantalla»: lo que lleva a otra pantalla, con su raya (con ?solo=1 no sale, ver solo.js)
                h("hr", { class: "otra-pantalla" }),
                h("a", { class: "opcion otra-pantalla", href: "../" }, h("span", { class: "marca" }), "Tablón de tareas"),
                E.yo.libro ? h("a", { class: "opcion otra-pantalla", href: "../libro/" }, h("span", { class: "marca" }), "Libro de cuentas") : null,
                h("a", { class: "opcion otra-pantalla", href: "../pizarra/" }, h("span", { class: "marca" }), "Pizarra"),
                h("a", { class: "opcion otra-pantalla", href: "../archivo/" }, h("span", { class: "marca" }), "Archivo"),
                h("hr"),
                h("button", { type: "button", class: "opcion", onclick: () => (cerrarMenu(), salir()) }, h("span", { class: "marca" }), "Salir"),
            ),
        ),
    );
}

function ayuda() {
    ventana(
        "¿Cómo funciona?",
        h(
            "div",
            { class: "pila" },
            h("p", null, "Quien está en la cabina pone música en su Spotify (en el móvil o en el ordenador), como siempre. La oficina mira cada pocos segundos qué le suena."),
            h("p", null, "Quien pulsa «Escuchar» oye esa misma canción, por el mismo sitio, con el reproductor de Spotify. Si has entrado en Spotify en este navegador, suena entera; si no, Spotify solo deja oír 30 segundos de muestra."),
            h("p", null, "Por la oficina no pasa el audio: cada uno lo oye desde Spotify."),
            h(
                "ul",
                null,
                // PROVISIONAL-v0.3.1
                h("li", null, h("strong", null, "Pinchar: "), "conecta tu Spotify (solo se usa para ver qué te suena): si la cabina está libre, ya estás dentro. Pon música y, al terminar, «Dejar la cabina»."),
                // PROVISIONAL-v0.3.1
                h("li", null, h("strong", null, "Por la oficina: "), "el botón «Música» de la barra abre un reproductor pequeño que empieza a sonar solo y sigue mientras andas."),
                h("li", null, h("strong", null, "Ha sonado: "), "las últimas 20, con quién las puso. Cada una se abre en Spotify."),
            ),
        ),
        { ancho: 480 },
    );
}

async function salir() {
    try {
        await api.salir();
    } catch {
        /* da igual */
    }
    sinSesion();
}

// ---------- datos y tiempo real ----------

function ponerOyentes(datos) {
    E.escuchando = datos.escuchando || [];
    E.oyentes = datos.oyentes || E.escuchando.map((id) => ({ id, estado: null }));
}

// Lo que llega del servidor (lo pedido o un aviso) ¿está al día, o es más viejo que lo último que se ha visto?
const alDia = vigiaDeSerie();

function cargar(datos) {
    const pinchaba = soyDj();
    E.yo = datos.yo || E.yo;
    if (datos.usuarios) E.usuarios = datos.usuarios;
    E.configurado = datos.configurado;
    if (datos.spotify) {
        if (datos.spotify.conectado) E.conectando = false;
        E.spotify = datos.spotify;
    }
    if ("ajustes" in datos || datos.yo) E.ajustes = datos.ajustes || null;
    // La cabina, lo que suena y quién escucha: solo si no es más viejo que lo último visto (una respuesta pedida
    // antes puede llegar después de un aviso en directo más nuevo, y dejaría puesta una canción que ya no suena).
    if (!alDia(datos)) return;
    E.cabina = datos.cabina;
    E.sonando = conLlegada(datos.sonando);
    E.anuncio = Boolean(datos.anuncio);
    E.aviso = datos.aviso || null;
    E.historial = datos.historial || [];
    ponerOyentes(datos);
    if (!pinchaba && soyDj()) callarPorPinchar();
    // Deja la cabina: si antes de pinchar sonaba aquí, vuelve a oír lo que pinche otra persona.
    else if (pinchaba && !soyDj() && E.calladoPorPinchar && preferencia.leer() !== "no") escuchar(true, { auto: true });
    reproductor?.seguir(E.sonando);
}

async function recargar() {
    try {
        cargar(await apiMusica.estado());
        pintar();
    } catch {
        /* sin conexión: ya se avisará */
    }
}

function alEvento(ev) {
    if (!E.yo) return;
    if (ev.tipo === "musica") {
        const antes = E.cabina?.dj.id || null;
        cargar(ev);
        pintar();
        const ahora = E.cabina?.dj.id || null;
        if (ev.cambio === "cabina" && antes !== ahora && ev.autor !== E.yo.id) {
            if (ahora) aviso(`${E.cabina.dj.nombre} ha entrado en la cabina.`);
            else if (ev.autor && antes) aviso(`${usuario(ev.autor)?.nombre || "Alguien"} ha dejado libre la cabina.`);
            else if (antes) aviso("La cabina ha quedado libre.");
        }
    } else if (ev.tipo === "musica-oyentes") {
        if (!alDia(ev)) return;
        ponerOyentes(ev);
        pintarCabecera();
        pintarCabina();
    } else if (ev.tipo === "musica-yo") {
        const antes = E.spotify.conectado;
        E.spotify = ev.spotify;
        E.conectando = false;
        pintarCuenta();
        pintarCabina();
        if (!antes && E.spotify.conectado) aviso(textoConectado());
    } else if (ev.tipo === "usuarios") {
        E.usuarios = ev.usuarios;
        pintar();
    }
}

// El aviso al terminar de conectar Spotify: dice el paso siguiente de verdad (al conectar con la cabina libre, ya se
// está dentro; si pincha otra persona, hay que esperar a que la deje).
function textoConectado() {
    const dj = E.cabina?.dj || null;
    if (soyDj()) return "Spotify conectado. Estás en la cabina: pon música en tu Spotify."; // PROVISIONAL-v0.3.1
    if (dj) return `Spotify conectado. Ahora pincha ${dj.nombre}: cuando deje la cabina, pulsa «Pinchar yo».`; // PROVISIONAL-v0.3.1
    return `Spotify conectado (${E.spotify.nombre}).`;
}

const franja = vigilante(); // la franja «Sin conexión…», la misma de todas las pantallas (app/conexion.js)

function abrirCanal() {
    canal?.cerrar();
    franja.parar();
    canal = canalMusica({
        alEvento,
        alAbrir: () => {
            franja.volvio();
            recargar();
            avisador?.repetir();
        },
        alCaer: async (cerrado) => {
            franja.cayo(); // sale si sigue caído pasados unos segundos
            if (!cerrado) return;
            // El navegador se ha rendido: ¿se ha caído el servidor o ha caducado la sesión?
            try {
                await apiMusica.estado();
            } catch {
                /* 401 → cuandoSePierdaLaSesion; sin conexión → se reintenta solo */
            }
        },
    });
}

function empezar(datos) {
    cargar(datos);
    montar();
    cargar(datos); // ya con el reproductor puesto
    pintar();
    abrirCanal();
    clearInterval(reloj);
    reloj = setInterval(pintarProgreso, 500);
    if (new URLSearchParams(location.search).has("conectado")) {
        history.replaceState(null, "", conSolo(location.pathname));
        if (E.spotify.conectado) aviso(textoConectado());
    }
    // Si la última vez estaba escuchando, sigue (si el navegador no deja empezar solo, se avisa). Quien pincha, no:
    // ya lo oye en su Spotify.
    if (E.configurado && preferencia.leer() === "si" && !soyDj()) escuchar(true, { auto: true });
}

async function entrarYEmpezar() {
    try {
        empezar(await apiMusica.estado());
    } catch (err) {
        sinConexion(err.message);
    }
}

function sinSesion() {
    canal?.cerrar();
    canal = null;
    reproductor?.apagar();
    clearInterval(reloj);
    E.yo = null;
    cerrarMenu();
    pantallaEntrar(raiz, entrarYEmpezar);
}
cuandoSePierdaLaSesion(() => {
    if (E.yo) sinSesion();
});

function sinConexion(mensaje) {
    vaciar(raiz).appendChild(
        h(
            "main",
            { class: "acceso" },
            h("div", { class: "acceso-caja" }, h("h1", null, "No hay conexión"), h("p", null, mensaje), h("button", { class: "btn ancho", type: "button", onclick: () => location.reload() }, "Reintentar")),
        ),
    );
}

// Al volver a esta pestaña (p. ej. tras conectar Spotify en otra), se pone al día por si se ha perdido algo.
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !E.yo) return;
    recargar();
    // Vuelve de entrar en Spotify: con el reproductor puesto de nuevo, Spotify ya reconoce la sesión.
    if (E.fuiASpotify) {
        E.fuiASpotify = false;
        reintentarReproductor();
    }
});

(async function inicio() {
    try {
        empezar(await apiMusica.estado());
    } catch (err) {
        if (err.estado === 401) pantallaEntrar(raiz, entrarYEmpezar);
        else sinConexion(err.message);
    }
})();
