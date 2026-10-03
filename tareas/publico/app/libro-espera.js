// La pantalla «Solo para los socios» del libro de cuentas, en directo.
//
// A quien no tiene parte en el reparto (ni administra) el libro le contesta 403 y ve «Solo para los socios». Esa
// pantalla no se queda sorda: sigue en el canal en directo y, cuando cambia el libro (el reparto es un cambio del
// libro) o el crew (quién administra), vuelve a pedirlo; en cuanto se lo dan, lo abre sin cerrar ni recargar. Al
// revés ya iba: quien pierde su parte recibe el mismo aviso, pide el libro, le contestan 403 y pasa a esta pantalla.
//
// Lógica sola, sin página (lo que toca la pantalla se le pasa), para poder probarla en Node: pruebas/libro.mjs.

// Los avisos del canal general que pueden dar acceso: el libro (reparto y movimientos) y el crew (administradores).
export const AVISOS_QUE_ABREN = ["libro", "usuarios"];

// escuchar(alRecibir, alReconectar) → función para dejar de escuchar (la de api.js);
// pedir() → promesa con el libro, o un error con «estado» (403: sigue sin parte; 401: ya no hay sesión);
// alEntrar(libro): le han dado acceso; alPerderSesion(): se le ha acabado la sesión mientras esperaba.
// Devuelve { probar, parar }: «probar» pide el libro ya (al volver a la pestaña, por ejemplo) y «parar» lo deja todo.
export function esperarAcceso({ escuchar, pedir, alEntrar, alPerderSesion = () => {}, calma = 250 }) {
    let parado = false;
    let pidiendo = false;
    let pendiente = false; // llegó otro aviso mientras se pedía: se vuelve a pedir al acabar
    let reloj = null;
    let dejar = null;

    function parar() {
        parado = true;
        clearTimeout(reloj);
        dejar?.();
        dejar = null;
    }

    async function probar() {
        if (parado) return;
        if (pidiendo) {
            pendiente = true;
            return;
        }
        pidiendo = true;
        try {
            const libro = await pedir();
            if (parado) return;
            parar();
            alEntrar(libro);
        } catch (err) {
            // 403: sigue sin parte. Sin conexión u otro fallo: se volverá a probar con el aviso siguiente o al reconectar.
            if (!parado && err?.estado === 401) {
                parar();
                alPerderSesion();
            }
        } finally {
            pidiendo = false;
            if (pendiente && !parado) pronto();
            pendiente = false;
        }
    }

    // Varios avisos seguidos (un reparto y sus movimientos) piden el libro una sola vez.
    function pronto() {
        if (parado) return;
        clearTimeout(reloj);
        reloj = setTimeout(probar, calma);
    }

    dejar = escuchar((ev) => {
        if (AVISOS_QUE_ABREN.includes(ev?.tipo)) pronto();
    }, probar);
    if (parado) parar(); // por si «escuchar» ya ha dado acceso antes de volver

    return { probar, parar };
}
