// Pantallas de entrada: iniciar sesión y crear cuenta (o poner contraseña nueva) desde un enlace.

import { h, vaciar } from "./util.js";
import { api } from "./api.js";

function marco(...contenido) {
    return h(
        "main",
        { class: "acceso" },
        h(
            "div",
            { class: "acceso-caja" },
            h("div", { class: "acceso-marca" }, h("span", { class: "logo" }, "HS"), h("div", null, h("strong", null, "TAREAS"), h("small", null, "HOT SPOT S.L."))),
            ...contenido,
        ),
    );
}

function campo(etiqueta, props) {
    const input = h("input", { class: "campo", ...props });
    return { el: h("label", { class: "etiqueta-campo" }, h("span", null, etiqueta), input), input };
}

export function pantallaEntrar(raiz, alEntrar) {
    const nombre = campo("Nombre", { autocomplete: "username", required: true, autocapitalize: "words" });
    const clave = campo("Contraseña", { type: "password", autocomplete: "current-password", required: true });
    const error = h("p", { class: "error", role: "alert" });
    const boton = h("button", { class: "btn primario ancho", type: "submit" }, "Entrar");
    const form = h(
        "form",
        {
            class: "acceso-form",
            onsubmit: async (e) => {
                e.preventDefault();
                error.textContent = "";
                boton.disabled = true;
                try {
                    alEntrar(await api.entrar(nombre.input.value, clave.input.value));
                } catch (err) {
                    error.textContent = err.message;
                    clave.input.select();
                } finally {
                    boton.disabled = false;
                }
            },
        },
        nombre.el,
        clave.el,
        error,
        boton,
        h("p", { class: "nota" }, "¿No tienes cuenta o has olvidado la contraseña? Pide un enlace a quien administra el tablón."),
    );
    vaciar(raiz).appendChild(marco(form));
    nombre.input.focus();
}

export async function pantallaAlta(raiz, codigo, alEntrar) {
    vaciar(raiz).appendChild(marco(h("p", { class: "nota" }, "Comprobando el enlace…")));
    let info;
    try {
        info = await api.invitacion(codigo);
    } catch (err) {
        vaciar(raiz).appendChild(
            marco(
                h("h1", null, "Enlace caducado"),
                h("p", null, err.message),
                h(
                    "button",
                    {
                        class: "btn ancho",
                        type: "button",
                        onclick: () => {
                            history.replaceState(null, "", location.pathname);
                            location.reload();
                        },
                    },
                    "Ir a la entrada",
                ),
            ),
        );
        return;
    }
    const cambiarClave = info.tipo === "clave";
    const nombre = campo("Tu nombre", { autocomplete: "username", maxlength: 24, required: true, autocapitalize: "words", placeholder: "Como te llaman en la oficina" });
    if (cambiarClave) {
        nombre.input.value = info.nombre;
        nombre.input.readOnly = true;
    }
    const clave = campo(cambiarClave ? "Contraseña nueva" : "Contraseña", { type: "password", autocomplete: "new-password", minlength: 8, required: true });
    const repetir = campo("Repite la contraseña", { type: "password", autocomplete: "new-password", required: true });
    let color = info.colores.find((c) => !info.ocupados.includes(c)) || info.colores[0];
    const muestras = h("div", { class: "muestras", role: "radiogroup", "aria-label": "Tu color" });
    const pintarMuestras = () =>
        muestras.replaceChildren(
            ...info.colores.map((c) =>
                h("button", {
                    type: "button",
                    class: ["muestra", c === color && "elegida"],
                    style: { background: c },
                    role: "radio",
                    "aria-checked": String(c === color),
                    title: info.ocupados.includes(c) ? "Ya lo usa alguien" : "Elegir este color",
                    onclick: () => {
                        color = c;
                        pintarMuestras();
                    },
                }),
            ),
        );
    pintarMuestras();
    const error = h("p", { class: "error", role: "alert" });
    const boton = h("button", { class: "btn primario ancho", type: "submit" }, cambiarClave ? "Guardar y entrar" : "Crear mi cuenta");
    const form = h(
        "form",
        {
            class: "acceso-form",
            onsubmit: async (e) => {
                e.preventDefault();
                error.textContent = "";
                if (clave.input.value !== repetir.input.value) {
                    error.textContent = "Las contraseñas no coinciden.";
                    return;
                }
                boton.disabled = true;
                try {
                    const datos = await api.alta({ codigo, nombre: nombre.input.value, clave: clave.input.value, color });
                    history.replaceState(null, "", location.pathname);
                    alEntrar(datos);
                } catch (err) {
                    error.textContent = err.message;
                } finally {
                    boton.disabled = false;
                }
            },
        },
        h("h1", null, cambiarClave ? `Contraseña nueva` : info.primera ? "Primera cuenta del tablón" : "Crea tu cuenta"),
        h(
            "p",
            { class: "nota" },
            cambiarClave
                ? "Elige una contraseña nueva. Se cerrarán las sesiones que tuvieras abiertas en otros sitios."
                : "Con esta cuenta entrarás al tablón desde la oficina o desde cualquier navegador.",
        ),
        nombre.el,
        clave.el,
        repetir.el,
        cambiarClave ? null : h("div", { class: "etiqueta-campo" }, h("span", null, "Tu color"), muestras),
        error,
        boton,
    );
    vaciar(raiz).appendChild(marco(form));
    (cambiarClave ? clave : nombre).input.focus();
}
