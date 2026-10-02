// La franja «Sin conexión…» de las pantallas que viven del tiempo real: tablón, libro de cuentas, pizarra, archivo y
// música. Un solo código para todas: quien escucha el canal en directo avisa de que se ha caído («cayo») o ha vuelto
// («volvio»), y la franja sale sola (fija abajo, sin tapar ni mover nada) y se quita sola al volver.
// No sale por un corte corto, ni cuando el navegador cierra el canal al cambiar de página: el canal tiene que seguir
// caído un rato (ESPERA_MS). Sin dependencias, para poder probarlo desde Node.

// El texto es el que la música ya usaba para esto.
export const TEXTO_SIN_CONEXION = "Sin conexión con la oficina: reintentando…";
export const ESPERA_MS = 3000;

const caidos = new Set(); // los vigilantes que llevan caídos más de la espera (la franja se ve mientras haya alguno)
let franja = null;

function pintar() {
    try {
        if (caidos.size) {
            if (!franja) {
                franja = document.createElement("div");
                franja.className = "aviso-conexion";
                franja.id = "aviso-conexion";
                franja.setAttribute("role", "status");
                franja.textContent = TEXTO_SIN_CONEXION;
            }
            if (!franja.isConnected) document.body.append(franja);
        } else franja?.remove();
    } catch {
        /* sin página (o sin <body> todavía): no hay dónde pintarla */
    }
}

export function vigilante(espera = ESPERA_MS) {
    const yo = {};
    let reloj = 0;
    const quitar = () => {
        clearTimeout(reloj);
        reloj = 0;
        if (caidos.delete(yo)) pintar();
    };
    return {
        // El canal se ha caído (se avisa en cada intento fallido de reconectar: solo cuenta el primero).
        cayo() {
            if (reloj || caidos.has(yo)) return;
            reloj = setTimeout(() => {
                reloj = 0;
                caidos.add(yo);
                pintar();
            }, espera);
        },
        volvio: quitar, // el canal está abierto otra vez
        parar: quitar, // se deja de escuchar a propósito (sesión perdida, otra pantalla…)
    };
}
