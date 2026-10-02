// Confeti de píxeles: una ráfaga corta (unos 2 segundos) con los colores de la oficina, por encima de todo y sin
// tapar nada (no recibe clics). Si el aparato pide menos movimiento (prefers-reduced-motion), no sale.

const COLORES = ["#e0562a", "#c4461f", "#ffd84a", "#ffd84a", "#f3e6d8", "#1c1715"];
const PIXEL = 3; // el confeti se dibuja en una rejilla de 3 px, como el resto de la oficina
const DURACION = 2400;
const FUNDIDO = 600;

let enMarcha = null;

export const menosMovimiento = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// «desde»: el rectángulo del que sale (por ejemplo, el aviso del cumpleaños); si no, el borde de arriba.
export function lanzarConfeti({ desde } = {}) {
    if (menosMovimiento()) return false;
    enMarcha?.parar();
    const lienzo = document.createElement("canvas");
    lienzo.className = "confeti";
    lienzo.setAttribute("aria-hidden", "true");
    document.body.appendChild(lienzo);
    const pincel = lienzo.getContext("2d");
    if (!pincel) {
        lienzo.remove();
        return false;
    }
    let ancho = 0;
    let alto = 0;
    let escala = 1;
    const medir = () => {
        ancho = innerWidth;
        alto = innerHeight;
        escala = Math.max(1, Math.round(window.devicePixelRatio || 1));
        lienzo.width = ancho * escala;
        lienzo.height = alto * escala;
        pincel.imageSmoothingEnabled = false;
    };
    medir();

    const origen = desde || { left: 0, top: 0, width: ancho, height: 0 };
    const rejilla = (v) => Math.round(v / PIXEL) * PIXEL;
    const azar = (a, b) => a + Math.random() * (b - a);
    const piezas = Array.from({ length: Math.max(40, Math.min(150, Math.round(ancho / 8))) }, () => ({
        x: origen.left + Math.random() * origen.width,
        y: origen.top + Math.random() * Math.max(1, origen.height),
        vx: azar(-3.2, 3.2),
        vy: azar(-7, -1.5),
        color: COLORES[Math.floor(Math.random() * COLORES.length)],
        lado: PIXEL * (Math.random() < 0.35 ? 3 : 2),
        giro: azar(0, Math.PI * 2),
        vgiro: azar(0.12, 0.35),
        fase: azar(0, Math.PI * 2),
    }));

    let inicio = null;
    let anterior = 0;
    let cuadro = 0;
    function paso(t) {
        if (inicio === null) inicio = anterior = t;
        const dt = Math.min(3, (t - anterior) / (1000 / 60)); // en «fotogramas» de 60 por segundo
        anterior = t;
        const pasado = t - inicio;
        pincel.setTransform(escala, 0, 0, escala, 0, 0);
        pincel.clearRect(0, 0, ancho, alto);
        // Se apaga a saltos (como un juego antiguo), no con un fundido suave.
        pincel.globalAlpha = pasado > DURACION - FUNDIDO ? Math.ceil(((DURACION - pasado) / FUNDIDO) * 4) / 4 : 1;
        for (const p of piezas) {
            p.vy = Math.min(p.vy + 0.22 * dt, 3.6); // gravedad, y cae despacio como el papel
            p.vx *= Math.pow(0.985, dt);
            p.x += (p.vx + Math.sin(p.fase + pasado / 180) * 0.7) * dt;
            p.y += p.vy * dt;
            p.giro += p.vgiro * dt;
            // Al «girar», el papelito se ve más estrecho: de lado entero a un solo píxel.
            const anchoVisto = Math.max(PIXEL, rejilla(Math.abs(Math.cos(p.giro)) * p.lado));
            pincel.fillStyle = p.color;
            pincel.fillRect(rejilla(p.x) - anchoVisto / 2, rejilla(p.y), anchoVisto, p.lado);
        }
        if (pasado < DURACION) cuadro = requestAnimationFrame(paso);
        else parar();
    }
    function parar() {
        cancelAnimationFrame(cuadro);
        removeEventListener("resize", medir);
        lienzo.remove();
        if (enMarcha === control) enMarcha = null;
    }
    const control = { parar };
    enMarcha = control;
    addEventListener("resize", medir);
    cuadro = requestAnimationFrame(paso);
    return true;
}
