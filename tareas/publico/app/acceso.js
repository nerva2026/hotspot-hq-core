// Pantallas de entrada: iniciar sesión y crear cuenta (o poner contraseña nueva) desde un enlace.

import { h, vaciar } from "./util.js";
import { api } from "./api.js";

// Nombre de la aplicación en la cabecera de la caja: «TAREAS» en el tablón, «CUENTAS» en el libro…
let nombreApp = "TAREAS";
let presentacion = "El tablón es del crew de HOT SPOT S.L. Entra con tu cuenta de Google.";
export function aplicacion(nombre, texto) {
    nombreApp = nombre;
    presentacion = texto;
}

function marco(...contenido) {
    return h(
        "main",
        { class: "acceso" },
        h(
            "div",
            { class: "acceso-caja" },
            h("div", { class: "acceso-marca" }, h("span", { class: "logo" }, "HS"), h("div", null, h("strong", null, nombreApp), h("small", null, "HOT SPOT S.L."))),
            ...contenido,
        ),
    );
}

function campo(etiqueta, props) {
    const input = h("input", { class: "campo", ...props });
    return { el: h("label", { class: "etiqueta-campo" }, h("span", null, etiqueta), input), input };
}

export async function pantallaEntrar(raiz, alEntrar) {
    let google = false;
    try {
        google = (await api.acceso()).google;
    } catch {
        /* sin conexión: se ofrece la contraseña */
    }
    const nombre = campo("Nombre", { autocomplete: "username", required: true, autocapitalize: "words" });
    const clave = campo("Contraseña", { type: "password", autocomplete: "current-password", required: true });
    const error = h("p", { class: "error", role: "alert" });
    const boton = h("button", { class: "btn primario ancho", type: "submit" }, "Entrar");
    const form = h(
        "form",
        {
            class: "acceso-form",
            hidden: google,
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
        google ? null : h("p", { class: "nota" }, "¿No tienes cuenta o has olvidado la contraseña? Pide un enlace a quien administra el tablón."),
    );
    if (!google) {
        vaciar(raiz).appendChild(marco(form));
        nombre.input.focus();
        return;
    }
    // Con Google. Dentro de la oficina el tablón va en un marco, y Google no deja entrar desde un marco:
    // se abre una pestaña y, cuando termina, el tablón se recarga solo.
    let enMarco = false;
    try {
        enMarco = window.top !== window;
    } catch {
        enMarco = true;
    }
    const vuelta = location.pathname + location.search;
    const esperando = h("p", { class: "nota", hidden: true }, "Termina de entrar en la pestaña nueva; esto se actualizará solo.");
    const entrarGoogle = h(
        "a",
        {
            class: "btn primario ancho",
            href: `/cuentas/entrar?vuelta=${encodeURIComponent(enMarco ? location.pathname : vuelta)}`,
            target: enMarco ? "_blank" : null,
            rel: enMarco ? "noopener" : null,
            onclick: () => {
                if (!enMarco) return;
                esperando.hidden = false;
                const vigilar = setInterval(async () => {
                    try {
                        const r = await fetch("/cuentas/yo", { cache: "no-store", credentials: "same-origin" });
                        if (r.ok) {
                            clearInterval(vigilar);
                            location.reload();
                        }
                    } catch {
                        /* se sigue esperando */
                    }
                }, 2000);
                setTimeout(() => clearInterval(vigilar), 10 * 60 * 1000);
            },
        },
        "Entrar con Google",
    );
    const conClave = h(
        "button",
        {
            type: "button",
            class: "enlace",
            onclick: () => {
                form.hidden = !form.hidden;
                if (!form.hidden) nombre.input.focus();
            },
        },
        "Entrar con contraseña",
    );
    vaciar(raiz).appendChild(
        marco(
            h("p", null, presentacion),
            entrarGoogle,
            esperando,
            h("p", { class: "nota" }, "Solo pueden entrar los correos que estén en el crew. ", conClave),
            form,
        ),
    );
    entrarGoogle.focus();
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
