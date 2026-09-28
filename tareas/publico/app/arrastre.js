// Arrastrar con ratón o con el dedo (manteniendo pulsado un momento, para no confundirlo con desplazar).

let arrastrando = false;
export const hayArrastre = () => arrastrando;

// Mientras se arrastra con el dedo, la página no debe desplazarse.
document.addEventListener(
    "touchmove",
    (e) => {
        if (arrastrando) e.preventDefault();
    },
    { passive: false },
);

// opciones: { alEmpezar(e) → contexto | false, alMover(e, ctx), alSoltar(e, ctx), alCancelar(ctx), alClic(e), umbral }
export function arrastrable(el, opciones) {
    const umbral = opciones.umbral ?? 5;
    el.addEventListener("pointerdown", (inicio) => {
        if (inicio.button !== 0 || arrastrando) return;
        if (inicio.target.closest("input, textarea, select, button:not(.arrastrable), a, [contenteditable=true]")) return;
        const tactil = inicio.pointerType === "touch";
        const x0 = inicio.clientX;
        const y0 = inicio.clientY;
        let ctx = null;
        let activo = false;
        let cancelado = false;
        let espera = null;

        const empezar = (e) => {
            ctx = opciones.alEmpezar(e, inicio);
            if (ctx === false) {
                cancelado = true;
                return;
            }
            activo = true;
            arrastrando = true;
            document.body.classList.add("arrastrando");
            try {
                el.setPointerCapture(inicio.pointerId);
            } catch {
                /* el elemento puede haber desaparecido */
            }
            if (tactil && navigator.vibrate) navigator.vibrate(15);
        };

        if (tactil) {
            espera = setTimeout(() => {
                espera = null;
                if (!cancelado) empezar(inicio);
            }, 280);
        }

        const mover = (e) => {
            if (e.pointerId !== inicio.pointerId || cancelado) return;
            const lejos = Math.hypot(e.clientX - x0, e.clientY - y0) > umbral;
            if (!activo) {
                if (tactil) {
                    // Si el dedo se mueve antes de tiempo, es que quiere desplazar la página.
                    if (Math.hypot(e.clientX - x0, e.clientY - y0) > 8) {
                        cancelado = true;
                        clearTimeout(espera);
                    }
                    return;
                }
                if (!lejos) return;
                empezar(e);
                if (!activo) return;
            }
            e.preventDefault();
            opciones.alMover?.(e, ctx);
        };

        const terminar = (e, cancelar = false) => {
            if (e.pointerId !== inicio.pointerId) return;
            clearTimeout(espera);
            window.removeEventListener("pointermove", mover, true);
            window.removeEventListener("pointerup", soltar, true);
            window.removeEventListener("pointercancel", anular, true);
            if (activo) {
                arrastrando = false;
                document.body.classList.remove("arrastrando");
                if (cancelar) opciones.alCancelar?.(ctx);
                else opciones.alSoltar?.(e, ctx);
                // Evita que el «click» que viene justo después abra la tarea.
                const tragar = (c) => {
                    c.stopPropagation();
                    c.preventDefault();
                };
                window.addEventListener("click", tragar, { capture: true, once: true });
                setTimeout(() => window.removeEventListener("click", tragar, { capture: true }), 50);
            } else if (!cancelar && !cancelado && Math.hypot(e.clientX - x0, e.clientY - y0) <= 8) {
                opciones.alClic?.(e);
            }
        };
        const soltar = (e) => terminar(e);
        const anular = (e) => terminar(e, true);
        window.addEventListener("pointermove", mover, true);
        window.addEventListener("pointerup", soltar, true);
        window.addEventListener("pointercancel", anular, true);
    });
    el.addEventListener("contextmenu", (e) => {
        if (arrastrando) e.preventDefault();
    });
}

// Desplaza un contenedor cuando el puntero se acerca a sus bordes mientras se arrastra.
export function autoDesplazamiento(contenedor, { horizontal = true, vertical = true } = {}) {
    let x = 0;
    let y = 0;
    let bucle = null;
    const paso = () => {
        const r = contenedor.getBoundingClientRect();
        const zona = 48;
        let dx = 0;
        let dy = 0;
        if (horizontal) {
            if (x < r.left + zona) dx = -Math.ceil((r.left + zona - x) / 4);
            else if (x > r.right - zona) dx = Math.ceil((x - (r.right - zona)) / 4);
        }
        if (vertical) {
            if (y < r.top + zona) dy = -Math.ceil((r.top + zona - y) / 4);
            else if (y > r.bottom - zona) dy = Math.ceil((y - (r.bottom - zona)) / 4);
        }
        if (dx || dy) contenedor.scrollBy(dx, dy);
        bucle = requestAnimationFrame(paso);
    };
    return {
        mover(nx, ny) {
            x = nx;
            y = ny;
            if (!bucle) bucle = requestAnimationFrame(paso);
        },
        parar() {
            cancelAnimationFrame(bucle);
            bucle = null;
        },
    };
}
