/*
 * Banco de pruebas · script del mapa de prueba (pruebas/banco/mapa/banco.tmj).
 *
 * Es un script GENÉRICO, escrito para el banco: no es el de la oficina ni lleva nada suyo. Solo hace lo que las
 * pruebas no pueden hacer desde fuera: quedarse escuchando (teclas, llamada, movimiento, botones) y apuntarlo todo
 * en `window.banco`, que las pruebas leen con Playwright dentro de este mismo marco. Lo demás (guardar variables,
 * mover al jugador, abrir páginas…) lo hacen las pruebas llamando a `WA.…` directamente.
 */

/** Los cinco botones de icono de la barra (el último, con un número). Las imágenes van junto al mapa. */
const BOTONES = [
    { id: "banco-1", toolTip: "Botón 1 (círculo)", imageSrc: "iconos/circulo.png" },
    { id: "banco-2", toolTip: "Botón 2 (cuadrado)", imageSrc: "iconos/cuadrado.png" },
    { id: "banco-3", toolTip: "Botón 3 (triángulo)", imageSrc: "iconos/triangulo.png" },
    { id: "banco-4", toolTip: "Botón 4 (rombo)", imageSrc: "iconos/rombo.png" },
    { id: "banco-5", toolTip: "Botón 5 (estrella)", imageSrc: "iconos/estrella.png", label: "3" },
];

const banco = {
    listo: false,
    /** Lo que ha fallado al arrancar: [{ que, error }] */
    errores: [],
    /** Los eventos «hs:tecla» tal cual llegan: [{ name, data, senderId, conSenderId, t }] */
    teclas: [],
    /** La conversación (burbuja): si se está dentro y cada vez que se entra y se sale, con lo que trae el aviso. */
    llamada: { dentro: false, entradas: [], salidas: [] },
    /** Los avisos de movimiento: [{ x, y, moving, direction, t }] (solo los últimos 400) */
    movimientos: [],
    /** Los botones cuyo `callback` se ha llamado, por orden: [{ id, t }] */
    pulsados: [],
    botones: BOTONES.map((b) => b.id),
};
window.banco = banco;

function intentar(que, hacer) {
    try {
        const r = hacer();
        if (r && typeof r.catch === "function") {
            r.catch((e) => banco.errores.push({ que, error: String(e && e.message ? e.message : e) }));
        }
    } catch (e) {
        banco.errores.push({ que, error: String(e && e.message ? e.message : e) });
    }
}

/** Pone (o sustituye) un botón de la barra. Lo usa también la prueba que sustituye uno en su sitio. */
banco.ponerBoton = (boton) => {
    WA.ui.actionBar.addButton({
        ...boton,
        callback: () => banco.pulsados.push({ id: boton.id, t: Date.now() }),
    });
};

WA.onInit()
    .then(() => {
        intentar("quitar el botón de invitar", () => WA.controls.disableInviteButton());
        intentar("botones de la barra", () => BOTONES.forEach(banco.ponerBoton));

        intentar("teclas del mapa", () =>
            WA.event.on("hs:tecla").subscribe((evento) => {
                banco.teclas.push({
                    name: evento.name,
                    data: evento.data,
                    senderId: evento.senderId === undefined ? null : evento.senderId,
                    conSenderId: evento.senderId !== undefined && evento.senderId !== null,
                    t: Date.now(),
                });
            }),
        );

        intentar("conversación", () => {
            WA.player.proximityMeeting.onJoin().subscribe((jugadores) => {
                banco.llamada.dentro = true;
                let datos;
                try {
                    datos = (jugadores || []).map((j) => ({ playerId: j.playerId, name: j.name }));
                } catch (e) {
                    datos = "no se ha podido leer: " + e;
                }
                banco.llamada.entradas.push({ t: Date.now(), tipo: Object.prototype.toString.call(jugadores), jugadores: datos });
            });
            WA.player.proximityMeeting.onLeave().subscribe((...resto) => {
                banco.llamada.dentro = false;
                banco.llamada.salidas.push({ t: Date.now(), argumentos: resto.length });
            });
        });

        intentar("movimiento", () =>
            WA.player.onPlayerMove((m) => {
                banco.movimientos.push({ x: m.x, y: m.y, moving: m.moving, direction: m.direction, t: Date.now() });
                if (banco.movimientos.length > 400) banco.movimientos.shift();
            }),
        );

        banco.listo = true;
        console.info("[banco] script del mapa listo");
    })
    .catch((e) => {
        banco.errores.push({ que: "WA.onInit", error: String(e) });
        console.error("[banco] el script del mapa no ha arrancado", e);
    });
