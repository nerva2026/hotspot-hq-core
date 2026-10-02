// El cartel de cumpleaños: /tareas/cumples/
//
// El sitio de la oficina donde se ven los cumpleaños del crew. Lo abre el mapa (el calendario de la pared del hall) en
// un panel; también vale en una pestaña o en el móvil. Es un cartel: no tiene pestañas ni menú, ni enlaces a las otras
// pantallas (y las otras no lo enlazan), como el puente /tareas/oficina/.
//
// Enseña, con lo que da GET /api/oficina (servidor/perfil.js):
//   - arriba, si hoy cumple alguien: el aviso de siempre (el mismo texto que el tablón y la oficina) y confeti;
//   - el siguiente cumpleaños, con los días que faltan;
//   - todos, por meses, cada uno con su día y el color de la persona;
//   - «Mi cumpleaños»: quien mira pone, cambia o quita el suyo (PATCH /api/yo), igual que en «Mi cuenta…» del tablón.
//
// Se pone al día sola: con los avisos en directo (/api/eventos avisa de los cambios de «usuarios»), al volver a la
// pestaña y preguntando cada minuto, que es como se entera de que ha pasado la medianoche de la oficina (el día de
// la oficina solo lo sabe el servidor). Solo se repinta si ha cambiado algo.

import { h, rellenar, vaciar, retrasar, MESES, DIAS, diaSemana } from "./util.js";
import { api, escuchar, cuandoSePierdaLaSesion } from "./api.js";
import { pantallaEntrar, aplicacion } from "./acceso.js";
import { textoCumples, fechaCumple, cumpleValido, maximoDelMes, cuantoFalta, elSiguiente, porMeses } from "./cumple.js";
import { lanzarConfeti } from "./confeti.js";

// PROVISIONAL-v0.3.1 (los dos textos de la pantalla de entrada: el nombre de la caja y la frase)
aplicacion("CUMPLEAÑOS", "Los cumpleaños son del crew de HOT SPOT S.L. Entra con tu cuenta de Google.");

const MINUTO = 60 * 1000;
const raiz = document.getElementById("app");
const dos = (n) => String(n).padStart(2, "0");

let oficina = null; // lo último de /api/oficina: { hoy, cumples, proximos, todos, yo }; null sin sesión
let pintado = ""; // lo que hay pintado (el JSON de arriba), para no repintar si no cambia nada
let piezas = null; // las partes de la pantalla que se rellenan
let dejarDeEscuchar = null;
let reloj = null;
let turno = 0; // para quedarse con la última respuesta si se cruzan dos
let confetiLanzado = null;

// ---------- la pantalla ----------

function montar() {
    piezas = {
        fecha: h("p", { class: "cartel-fecha" }),
        hoy: h("section", { class: "cartel-hoy", hidden: true }),
        siguiente: h("section", { class: "cartel-pieza cartel-siguiente", hidden: true }),
        meses: h("div", { class: "cartel-meses" }),
        mio: montarMio(),
    };
    rellenar(
        raiz,
        // PROVISIONAL-v0.3.1 (el título del cartel)
        h("header", { class: "cartel-cabecera" }, h("span", { class: "cartel-tarta", "aria-hidden": "true" }), h("h1", null, "Cumpleaños"), piezas.fecha),
        h("main", { class: "cartel" }, piezas.hoy, h("div", { class: "cartel-cuerpo" }, h("div", { class: "cartel-lado" }, piezas.siguiente, piezas.mio.el), piezas.meses)),
    );
}

// El color de la persona: un cuadrado al lado del nombre (el nombre va siempre en tinta, que se lee bien).
const muestra = (color) => h("span", { class: "cartel-color", style: { background: color || "transparent" }, "aria-hidden": "true" });
const persona = (c) => h("li", null, muestra(c.color), h("span", { class: "cartel-nombre" }, c.nombre));

function pintar() {
    const { hoy, cumples, todos, yo } = oficina;
    // El día de la oficina, sin año: «viernes 2 de octubre».
    piezas.fecha.textContent = `${DIAS[diaSemana(hoy)]} ${fechaCumple(hoy.slice(5))}`;

    // Hoy: el aviso de siempre, con su tarta (que da más confeti).
    const texto = textoCumples(cumples, yo.id);
    piezas.hoy.hidden = !texto;
    if (!texto) vaciar(piezas.hoy);
    else if (piezas.hoy.dataset.texto !== texto) {
        rellenar(
            piezas.hoy,
            h("button", { type: "button", class: "cartel-hoy-tarta", title: "¡Más confeti!", "aria-label": "Más confeti", onclick: confeti }),
            h("p", { class: "cartel-hoy-texto", role: "status" }, texto),
        );
    }
    piezas.hoy.dataset.texto = texto;

    // El siguiente: la hoja del calendario con su día, quién cumple y cuánto falta.
    const siguiente = elSiguiente(todos);
    piezas.siguiente.hidden = !siguiente;
    if (!siguiente) vaciar(piezas.siguiente);
    else {
        const mes = Number(siguiente.fecha.slice(5, 7));
        rellenar(
            piezas.siguiente,
            h("h2", null, "El siguiente"), // PROVISIONAL-v0.3.1
            h(
                "div",
                { class: "cartel-siguiente-cuerpo" },
                h("p", { class: "cartel-hoja" }, h("span", { class: "cartel-hoja-dia" }, String(Number(siguiente.fecha.slice(8)))), " ", h("span", { class: "cartel-hoja-mes" }, MESES[mes - 1])),
                h("div", { class: "cartel-siguiente-quien" }, h("ul", { class: "cartel-personas" }, siguiente.personas.map(persona)), h("p", { class: "cartel-falta" }, cuantoFalta(siguiente.enDias))),
            ),
        );
    }

    // Todos, por meses: los doce seguidos, empezando por el de ahora (marcado), que es donde están los que antes llegan.
    const mesDeHoy = Number(hoy.slice(5, 7));
    piezas.meses.classList.toggle("ninguno", !todos.length);
    rellenar(
        piezas.meses,
        porMeses(todos, mesDeHoy).map(({ mes, cumples: lista }) =>
            h(
                "section",
                { class: ["cartel-mes", mes === mesDeHoy && "actual", !lista.length && "vacio"] },
                h("h2", null, MESES[mes - 1]),
                lista.length
                    ? h(
                          "ul",
                          null,
                          lista.map((c) =>
                              h(
                                  "li",
                                  { class: [c.enDias === 0 && "hoy", c.id === yo.id && "yo"] },
                                  h("span", { class: "cartel-dia" }, String(Number(c.dia.slice(3)))),
                                  muestra(c.color),
                                  h("span", { class: "cartel-nombre" }, c.nombre),
                                  c.enDias === 0 ? h("span", { class: "cartel-tarta mini", "aria-hidden": "true" }) : null,
                              ),
                          ),
                      )
                    : null,
            ),
        ),
    );

    piezas.mio.poner(yo.cumple);

    // Confeti: una vez por aviso (si cambia el día o quién cumple, otra vez). Con «menos movimiento» no sale.
    const clave = `${hoy} ${texto}`;
    if (texto && confetiLanzado !== clave) {
        confetiLanzado = clave;
        requestAnimationFrame(confeti);
    }
}

function confeti() {
    if (piezas && !piezas.hoy.hidden) lanzarConfeti({ desde: piezas.hoy.getBoundingClientRect() });
}

// ---------- mi cumpleaños: día y mes; se guarda en cuanto están los dos, y «Quitar» lo borra ----------
// Los mismos textos y la misma manera que en «Mi cuenta…» del tablón (app/principal.js).

function montarMio() {
    let guardado; // lo que hay en el servidor, que se sepa (undefined hasta la primera vez)
    const selMes = h("select", { class: "campo selector-cumple mes", "aria-label": "Mes de tu cumpleaños" }, h("option", { value: "" }, "Mes"), MESES.map((m, i) => h("option", { value: dos(i + 1) }, m)));
    const selDia = h("select", { class: "campo selector-cumple dia", "aria-label": "Día de tu cumpleaños" });
    const estado = h("p", { class: "nota estado-cumple", role: "status" });
    const quitar = h("button", { type: "button", class: "btn pequeno quitar-cumple", title: "Quitar mi cumpleaños", onclick: () => guardar(null) }, "Quitar");
    const el = h(
        "section",
        { class: "cartel-pieza cartel-mio", role: "group", "aria-labelledby": "mi-cumple" },
        h("h2", { id: "mi-cumple" }, "Mi cumpleaños"),
        h("div", { class: "fila-cumple" }, selDia, selMes, quitar),
        estado,
        h("p", { class: "nota" }, "Solo el día y el mes, sin el año. Lo ve el crew: sale en el tablón y en la oficina."),
    );
    const pintarDias = () => {
        const maximo = selMes.value ? maximoDelMes(Number(selMes.value)) : 31;
        const elegido = selDia.value;
        selDia.replaceChildren(h("option", { value: "" }, "Día"), ...Array.from({ length: maximo }, (_, i) => h("option", { value: dos(i + 1) }, String(i + 1))));
        selDia.value = elegido && Number(elegido) <= maximo ? elegido : "";
    };
    const mostrar = (cumple) => {
        const [mes, dia] = cumpleValido(cumple) ? cumple.split("-") : ["", ""];
        selMes.value = mes;
        pintarDias();
        selDia.value = dia;
        quitar.hidden = !cumple;
        el.classList.toggle("falta", !cumple); // sin poner: el cartel lo destaca (y en el móvil lo sube)
    };
    const decir = (texto, malo = false) => {
        estado.className = `${malo ? "error" : "nota"} estado-cumple`;
        estado.textContent = texto;
    };
    async function guardar(cumple) {
        try {
            const { yo } = await api.cambiarYo({ cumple });
            guardado = yo.cumple;
            mostrar(guardado);
            decir(guardado ? `Guardado: ${fechaCumple(guardado)}.` : "Quitado.");
            recargar(); // lo mío no me llega por los avisos en directo: se vuelve a leer el cartel
        } catch (err) {
            mostrar(guardado ?? null); // no se ha guardado: los selectores vuelven a enseñar lo que hay de verdad
            decir(err.message, true);
        }
    }
    const alElegir = () => {
        pintarDias();
        if (!selDia.value || !selMes.value) return decir(selMes.value ? "Elige el día." : "Elige el mes.");
        const cumple = `${selMes.value}-${selDia.value}`;
        if (cumple !== guardado) guardar(cumple);
    };
    selMes.addEventListener("change", alElegir);
    selDia.addEventListener("change", alElegir);
    mostrar(null);
    return {
        el,
        // Lo que dice el servidor. Solo se tocan los selectores si ha cambiado (por ejemplo, desde el tablón en otro
        // aparato): si no, se deja lo que la persona tenga a medio elegir.
        poner(cumple) {
            if (cumple === guardado) return;
            guardado = cumple;
            mostrar(cumple);
            decir("");
        },
    };
}

// ---------- al día ----------

function aplicar(datos) {
    oficina = datos;
    const texto = JSON.stringify(datos);
    if (texto === pintado && piezas) return;
    pintado = texto;
    if (!piezas) montar();
    pintar();
}

async function recargar() {
    if (!oficina) return; // sin sesión: ya se encarga la pantalla de entrada
    const mio = ++turno;
    let datos;
    try {
        datos = await api.oficina();
    } catch {
        return; // sin sesión (se pasa a la pantalla de entrada) o sin conexión (lo dice la franja y se reintenta)
    }
    if (oficina && mio === turno) aplicar(datos);
}
const recargarLuego = retrasar(recargar, 600);

function alRecibir(ev) {
    if (ev.tipo === "usuarios") recargarLuego(); // alguien ha puesto o cambiado su cumpleaños, su nombre o su color
}

function alVolver() {
    if (!document.hidden) recargar();
}

function empezar(datos) {
    piezas = null;
    pintado = "";
    aplicar(datos);
    dejarDeEscuchar?.();
    dejarDeEscuchar = escuchar(alRecibir, recargar);
    clearInterval(reloj);
    reloj = setInterval(alVolver, MINUTO);
}

// Al cargar y al terminar de entrar: sin sesión, la pantalla de entrada de siempre (y al entrar se vuelve aquí).
async function arrancar() {
    try {
        empezar(await api.oficina());
    } catch (err) {
        if (err.estado === 401) pantallaEntrar(raiz, arrancar);
        else sinConexion(err.message);
    }
}

function sinSesion() {
    dejarDeEscuchar?.();
    dejarDeEscuchar = null;
    clearInterval(reloj);
    reloj = null;
    oficina = null;
    piezas = null;
    pintado = "";
    turno++;
    pantallaEntrar(raiz, arrancar);
}
cuandoSePierdaLaSesion(() => {
    if (oficina) sinSesion();
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

document.addEventListener("visibilitychange", alVolver);

arrancar();
