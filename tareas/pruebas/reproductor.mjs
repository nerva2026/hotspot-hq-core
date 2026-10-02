// Prueba de los estados del reproductor de la música (publico/app/musica-seguidor.js), sin navegador ni servidor:
//   node pruebas/reproductor.mjs
//
// La lógica que sigue al DJ con el reproductor de Spotify (Embed) no toca la página, así que aquí se le pone un Embed
// de mentira (emite «ready» y «playback_update» como el de verdad) y un reloj de mentira, y se comprueba lo que se
// enseñaría en pantalla en cada caso: que suena entera; la muestra de 30 s y su final; que no arranca solo (bloqueado:
// hay que pulsar ▶); que no carga (sin «ready»); el cambio de canción sin quedarse en «Lo has pausado tú»; y lo demás
// (pausa del DJ, pausa de la persona, la misma canción otra vez, apagar y volver a intentar).
// También, que la lista de estados de los oyentes es la misma aquí que en el servidor, y que un estado más viejo que
// el último visto no se aplica (el número de serie).

import assert from "node:assert/strict";
import { Seguidor, PLAZO_LISTO, PLAZO_TOCAR, ESTADOS_OYENTE, estadoDeOyente, conLlegada, posicionEn, vigiaDeSerie } from "../publico/app/musica-seguidor.js";
import { ESTADOS_OYENTE as ESTADOS_DEL_SERVIDOR } from "../servidor/musica.js";

// ---------- un reloj de mentira: el tiempo solo pasa cuando se le dice ----------

function relojDeMentira() {
    let ahora = 1000;
    let siguiente = 0;
    const pendientes = [];
    return {
        ahora: () => ahora,
        esperar(f, ms) {
            pendientes.push({ id: ++siguiente, cuando: ahora + ms, f });
            return siguiente;
        },
        cancelar(id) {
            const i = pendientes.findIndex((p) => p.id === id);
            if (i >= 0) pendientes.splice(i, 1);
        },
        avanzar(ms) {
            const hasta = ahora + ms;
            for (;;) {
                const p = pendientes.filter((x) => x.cuando <= hasta).sort((a, b) => a.cuando - b.cuando || a.id - b.id)[0];
                if (!p) break;
                pendientes.splice(pendientes.indexOf(p), 1);
                ahora = p.cuando;
                p.f();
            }
            ahora = hasta;
        },
    };
}

// ---------- un Embed de mentira (lo que da IFrameAPI.createController) ----------

// «ajustes»: duracion(uri) → ms que dice que dura (30000 = la muestra) · daListo · dejaEmpezar (false: el navegador no
// le deja arrancar solo hasta que la persona pulsa ▶) · tardaEnSonar (ms) · alAcabar ("final" o "principio": dónde se
// queda al terminar) · alCargar ("pausa": al cambiar de canción cuenta que está parado, como hace el de verdad) ·
// seAtasca (al pedirle que suene se queda «cargando la canción» y no llega a sonar).
class EmbedDeMentira {
    constructor(tiempo, uri, ajustes) {
        this.tiempo = tiempo;
        this.ajustes = ajustes;
        this.uri = uri;
        this.oyentes = { ready: [], playback_update: [] };
        this.llamadas = [];
        this.pausado = true;
        this.posicion = 0;
        this.duracion = 0;
        this.latido = null;
        this.destruido = false;
        this.atascado = false; // dice que está cargando la canción (isBuffering)
        this.gesto = false; // la persona ya ha pulsado dentro del reproductor: desde entonces puede arrancar solo
    }
    addListener(tipo, f) {
        this.oyentes[tipo].push(f);
    }
    emitir(tipo, data) {
        if (!this.destruido) for (const f of this.oyentes[tipo]) f({ data });
    }
    contar(extra = {}) {
        this.emitir("playback_update", { isPaused: this.pausado, isBuffering: this.atascado, duration: this.duracion, position: this.posicion, ...extra });
    }
    empezar() {
        this.tiempo.cancelar(this.latido);
        this.pausado = false;
        this.duracion = this.ajustes.duracion(this.uri);
        if (this.posicion >= this.duracion) this.posicion = 0;
        this.contar();
        const latir = () => {
            this.posicion += 500;
            if (this.posicion >= this.duracion) {
                this.pausado = true;
                this.posicion = this.ajustes.alAcabar === "principio" ? 0 : this.duracion;
                return this.contar();
            }
            this.contar();
            this.latido = this.tiempo.esperar(latir, 500);
        };
        this.latido = this.tiempo.esperar(latir, 500);
    }
    parar() {
        this.tiempo.cancelar(this.latido);
        this.pausado = true;
        this.contar();
    }
    pedirQueSuene() {
        if (!this.ajustes.dejaEmpezar && !this.gesto) return; // el navegador no le deja: no pasa nada (ni un aviso)
        if (this.ajustes.seAtasca) {
            this.pausado = false;
            this.atascado = true;
            return this.contar();
        }
        if (this.ajustes.tardaEnSonar) this.latido = this.tiempo.esperar(() => this.empezar(), this.ajustes.tardaEnSonar);
        else this.empezar();
    }
    // --- lo que le manda la página ---
    loadUri(uri) {
        this.llamadas.push(`loadUri ${uri}`);
        this.tiempo.cancelar(this.latido);
        this.uri = uri;
        this.pausado = true;
        this.posicion = 0;
        this.duracion = 0;
        if (this.ajustes.alCargar === "pausa") this.contar();
    }
    play() {
        this.llamadas.push("play");
        this.pedirQueSuene();
    }
    resume() {
        this.llamadas.push("resume");
        this.pedirQueSuene();
    }
    pause() {
        this.llamadas.push("pause");
        this.parar();
    }
    seek(segundos) {
        this.llamadas.push(`seek ${Math.round(segundos)}`);
        if (segundos * 1000 < this.duracion) this.posicion = segundos * 1000;
        this.contar();
    }
    destroy() {
        this.llamadas.push("destroy");
        this.tiempo.cancelar(this.latido);
        this.destruido = true;
    }
    // --- lo que hace la persona dentro del reproductor ---
    pulsar() {
        this.gesto = true;
        if (this.pausado) this.empezar();
        else this.parar();
    }
}

// Todo montado: reloj, fábrica de reproductores de mentira y el Seguidor, apuntando cada estado por el que pasa.
function montar(ajustes = {}) {
    const tiempo = relojDeMentira();
    const a = { duracion: () => 200000, daListo: true, dejaEmpezar: true, seAtasca: false, tardaEnSonar: 200, alAcabar: "final", alCargar: "pausa", api: "lista", crea: true, ...ajustes };
    const embeds = [];
    const estados = [];
    let vaciados = 0;
    const avisos = new Set();
    const fabrica = {
        estado: () => a.api,
        pedir(f) {
            avisos.add(f);
            return () => avisos.delete(f);
        },
        crear(uri, alCrear) {
            const embed = new EmbedDeMentira(tiempo, uri, a);
            embeds.push(embed);
            embed.entregar = () => {
                alCrear(embed);
                if (a.daListo) tiempo.esperar(() => embed.emitir("ready"), 300);
            };
            if (a.crea) embed.entregar();
        },
        fallo() {
            a.api = "fallo";
        },
        vaciar: () => (vaciados += 1),
    };
    const seguidor = new Seguidor(fabrica, {
        alCambiar: (info) => {
            if (estados.at(-1) !== info.estado) estados.push(info.estado);
            seguidor.info = info;
        },
        reloj: tiempo.ahora,
        esperar: tiempo.esperar,
        cancelar: tiempo.cancelar,
    });
    const cancion = (id, extra = {}) => conLlegada({ uri: `spotify:track:${id}`, duracion: 200000, posicion: 30000, reproduciendo: true, local: false, ...extra }, tiempo.ahora());
    return {
        tiempo,
        a,
        embeds,
        estados,
        seguidor,
        cancion,
        avisos,
        vaciados: () => vaciados,
        get embed() {
            return embeds.at(-1);
        },
    };
}

// ---------- los plazos y las cuentas sueltas ----------

assert.equal(PLAZO_LISTO, 12000, "unos 12 s para dar por fallida la carga");
assert.ok(PLAZO_TOCAR >= 3000 && PLAZO_TOCAR <= 6000);
assert.equal(posicionEn({ posicion: 1000, duracion: 5000, reproduciendo: true, recibido: 100 }, 600), 1500, "la canción del DJ avanza sola");
assert.equal(posicionEn({ posicion: 1000, duracion: 5000, reproduciendo: false, recibido: 100 }, 600), 1000, "en pausa no avanza");
assert.equal(posicionEn({ posicion: 4900, duracion: 5000, reproduciendo: true, recibido: 100 }, 9000), 5000, "y no pasa del final");
assert.equal(posicionEn(null, 5), 0);
assert.equal(conLlegada(null, 5), null);

// Lo que llega desordenado: una respuesta pedida antes que llega después de un aviso más nuevo no se aplica.
{
    const alDia = vigiaDeSerie();
    assert.equal(alDia({ serie: 10 }), true, "lo primero que llega vale");
    assert.equal(alDia({ serie: 11 }), true, "y lo más nuevo");
    assert.equal(alDia({ serie: 10 }), false, "lo que salió antes y llega después, no");
    assert.equal(alDia({ serie: 11 }), true, "lo mismo otra vez sí (el aviso y la respuesta de la misma cosa)");
    assert.equal(alDia({ serie: 12 }), true);
    assert.equal(alDia({}), true, "sin número de serie no se puede saber: se aplica");
    assert.equal(alDia(null), true);
    assert.equal(alDia({ serie: 11 }), false, "y no hace olvidar por dónde se iba");
    const otra = vigiaDeSerie();
    assert.equal(otra({ serie: 3 }), true, "cada página lleva su cuenta");
}

// ---------- 1. suena entera ----------
{
    const m = montar();
    assert.equal(m.seguidor.estado, "apagado");
    m.seguidor.seguir(m.cancion("a"));
    assert.equal(m.seguidor.estado, "apagado", "sin encender no se pone nada");
    assert.equal(m.embeds.length, 0);
    m.seguidor.encender();
    assert.equal(m.seguidor.estado, "cargando", "se está poniendo el reproductor");
    assert.equal(m.embeds.length, 1);
    assert.equal(m.embed.uri, "spotify:track:a");
    m.tiempo.avanzar(300); // «ready»
    assert.deepEqual(m.embed.llamadas, ["play"], "al estar listo se le pide que suene");
    assert.equal(m.seguidor.estado, "arrancando", "pedido, pero sin confirmar: todavía no «suena»");
    assert.equal(estadoDeOyente(m.seguidor.estado), "cargando");
    m.tiempo.avanzar(200); // el reproductor dice que suena
    assert.equal(m.seguidor.estado, "sonando");
    assert.equal(m.seguidor.info.muestra, false);
    assert.equal(estadoDeOyente(m.seguidor.estado), "suena");
    assert.deepEqual(m.embed.llamadas, ["play", "seek 31"], "y salta a donde va el DJ (30 s más el medio segundo que ha pasado)");
    m.tiempo.avanzar(20000);
    assert.equal(m.seguidor.estado, "sonando", "sigue sonando: nadie le pide que pulse nada");
    assert.deepEqual(m.estados, ["cargando", "arrancando", "sonando"], "nunca «sonando» antes de que el reproductor lo confirme");
    assert.ok(!m.embed.llamadas.includes("pause"));
    // Llega al final antes de que el servidor cuente la canción siguiente: no es que la persona lo haya pausado.
    m.tiempo.avanzar(200000);
    assert.equal(m.embed.pausado, true);
    assert.equal(m.seguidor.estado, "sonando", "entre canción y canción se sigue «sonando»");
    m.seguidor.seguir(m.cancion("b", { posicion: 0 }));
    assert.equal(m.seguidor.estado, "arrancando");
    m.tiempo.avanzar(200);
    assert.equal(m.seguidor.estado, "sonando");
    assert.equal(m.embed.uri, "spotify:track:b");
    // Apagar: se calla, se quita el reproductor y ya no cuenta nada.
    m.seguidor.apagar();
    assert.equal(m.seguidor.estado, "apagado");
    assert.ok(m.embed.destruido);
    assert.ok(m.vaciados() >= 1);
    assert.equal(m.avisos.size, 0, "y deja de esperar al script de Spotify");
    assert.equal(estadoDeOyente("apagado"), null);
}

// ---------- 2. la muestra de 30 s y su final ----------
for (const alAcabar of ["final", "principio"]) {
    const m = montar({ duracion: () => 30000, alAcabar });
    m.seguidor.encender();
    m.seguidor.seguir(m.cancion("a"));
    m.tiempo.avanzar(500);
    assert.equal(m.seguidor.estado, "muestra", "el reproductor dice que dura 30 s y la canción del DJ dura más: es la muestra");
    assert.equal(m.seguidor.info.muestra, true);
    assert.equal(estadoDeOyente(m.seguidor.estado), "muestra");
    assert.deepEqual(m.embed.llamadas, ["play"], "en la muestra no se salta a donde va el DJ (no llega)");
    m.tiempo.avanzar(29000);
    assert.equal(m.seguidor.estado, "muestra");
    m.tiempo.avanzar(1500);
    assert.equal(m.embed.pausado, true, "la muestra ha terminado");
    assert.equal(m.seguidor.estado, "muestra-acabada", `al acabar la muestra se dice (el reproductor se queda al ${alAcabar})`);
    assert.equal(estadoDeOyente(m.seguidor.estado), "muestra");
    m.tiempo.avanzar(60000);
    assert.equal(m.seguidor.estado, "muestra-acabada", "y así se queda hasta la canción siguiente: ni «sonando» ni «pulsa ▶»");
    assert.ok(!m.estados.includes("a-mano") && !m.estados.includes("bloqueado") && !m.estados.includes("sonando"), m.estados.join(" → "));
    // El DJ pausa y sigue con la misma canción: aquí la muestra ya se ha oído, no hay nada que retomar.
    const pausada = m.cancion("a", { reproduciendo: false, posicion: 100000 });
    m.seguidor.seguir(pausada);
    assert.equal(m.seguidor.estado, "pausa");
    // La canción siguiente: otra muestra.
    m.seguidor.seguir(m.cancion("b", { posicion: 0 }));
    assert.equal(m.seguidor.estado, "arrancando");
    m.tiempo.avanzar(200);
    assert.equal(m.seguidor.estado, "muestra");
    assert.equal(m.embed.llamadas.filter((l) => l.startsWith("seek")).length, 0);
}
// Una canción corta de verdad (30 s también para el DJ) no es una muestra.
{
    const m = montar({ duracion: () => 30000 });
    m.seguidor.encender();
    m.seguidor.seguir(m.cancion("corta", { duracion: 30000, posicion: 2000 }));
    m.tiempo.avanzar(500);
    assert.equal(m.seguidor.estado, "sonando");
}

// ---------- 3. sin eventos tras pedir reproducir: el navegador no le deja empezar solo ----------
{
    const m = montar({ dejaEmpezar: false });
    m.seguidor.encender();
    m.seguidor.seguir(m.cancion("a"));
    m.tiempo.avanzar(300);
    assert.deepEqual(m.embed.llamadas, ["play"]);
    assert.equal(m.seguidor.estado, "arrancando");
    m.tiempo.avanzar(PLAZO_TOCAR - 1);
    assert.equal(m.seguidor.estado, "arrancando", "se le da un plazo");
    m.tiempo.avanzar(1);
    assert.equal(m.seguidor.estado, "bloqueado", "no ha sonado: hay que pulsar ▶");
    assert.equal(estadoDeOyente(m.seguidor.estado), "falta-pulsar");
    assert.ok(!m.estados.includes("sonando"), "sin confirmación no se dice que suena");
    // Cambia la canción mientras tanto: sigue haciendo falta pulsar (y no parpadea a otra cosa).
    const marca = m.estados.length;
    m.seguidor.seguir(m.cancion("b"));
    m.tiempo.avanzar(PLAZO_TOCAR + 1000);
    assert.equal(m.seguidor.estado, "bloqueado");
    assert.deepEqual(m.estados.slice(marca), []);
    // La persona pulsa ▶ en el reproductor: suena, y se pone donde va el DJ.
    m.embed.pulsar();
    assert.equal(m.seguidor.estado, "sonando");
    assert.match(m.embed.llamadas.at(-1), /^seek /);
    // Desde entonces las siguientes arrancan solas.
    m.seguidor.seguir(m.cancion("c"));
    m.tiempo.avanzar(200);
    assert.equal(m.seguidor.estado, "sonando");
    assert.deepEqual(m.estados.slice(marca), ["sonando", "arrancando", "sonando"]);
}
// Si dice que está cargando la canción (conexión lenta), se le da otro plazo antes de pedir que se pulse nada.
{
    const m = montar({ seAtasca: true });
    m.seguidor.encender();
    m.seguidor.seguir(m.cancion("a"));
    m.tiempo.avanzar(300);
    assert.equal(m.embed.atascado, true);
    assert.equal(m.seguidor.estado, "arrancando", "cargando la canción no es sonar");
    m.tiempo.avanzar(PLAZO_TOCAR);
    assert.equal(m.seguidor.estado, "arrancando");
    m.tiempo.avanzar(PLAZO_TOCAR);
    assert.equal(m.seguidor.estado, "bloqueado", "pero no se espera para siempre");
}

// ---------- 4. sin «ready»: el reproductor no carga ----------
{
    const m = montar({ daListo: false });
    m.seguidor.encender();
    m.seguidor.seguir(m.cancion("a"));
    assert.equal(m.seguidor.estado, "cargando");
    m.tiempo.avanzar(PLAZO_LISTO - 1);
    assert.equal(m.seguidor.estado, "cargando");
    m.tiempo.avanzar(1);
    assert.equal(m.seguidor.estado, "fallo", "pasado el plazo se dice que no carga, en vez de «poniendo el reproductor…» para siempre");
    assert.equal(estadoDeOyente(m.seguidor.estado), "fallo");
    assert.deepEqual(m.embed.llamadas, [], "sin estar listo no se le pide nada");
    // Otro intento, y esta vez sí.
    m.a.daListo = true;
    const viejo = m.embed;
    m.seguidor.reintentar();
    assert.ok(viejo.destruido, "el reproductor que no cargaba se quita");
    assert.equal(m.seguidor.estado, "cargando");
    assert.equal(m.embeds.length, 2);
    m.tiempo.avanzar(500);
    assert.equal(m.seguidor.estado, "sonando");
    m.tiempo.avanzar(PLAZO_LISTO * 2);
    assert.equal(m.seguidor.estado, "sonando", "el plazo de carga ya no cuenta");
}
// Si llega tarde, vale igual.
{
    const m = montar({ daListo: false });
    m.seguidor.encender();
    m.seguidor.seguir(m.cancion("a"));
    m.tiempo.avanzar(PLAZO_LISTO + 5000);
    assert.equal(m.seguidor.estado, "fallo");
    m.embed.emitir("ready");
    assert.equal(m.seguidor.estado, "arrancando");
    m.tiempo.avanzar(200);
    assert.equal(m.seguidor.estado, "sonando");
}
// El script de Spotify no llega (sin conexión, o lo bloquea el navegador).
{
    const m = montar({ api: "cargando" });
    m.seguidor.encender();
    m.seguidor.seguir(m.cancion("a"));
    assert.equal(m.seguidor.estado, "cargando");
    assert.equal(m.embeds.length, 0);
    m.a.api = "fallo";
    for (const f of m.avisos) f();
    assert.equal(m.seguidor.estado, "fallo");
    // …y si ni falla ni llega, también se acaba diciendo.
    const n = montar({ api: "cargando" });
    n.seguidor.encender();
    n.seguidor.seguir(n.cancion("a"));
    n.tiempo.avanzar(PLAZO_LISTO);
    assert.equal(n.seguidor.estado, "fallo");
    // Llega por fin: se pone el reproductor.
    n.a.api = "lista";
    for (const f of n.avisos) f();
    n.tiempo.avanzar(500);
    assert.equal(n.seguidor.estado, "sonando");
}
// El reproductor que nunca llega a crearse, y el que llega cuando ya se ha apagado.
{
    const m = montar({ crea: false });
    m.seguidor.encender();
    m.seguidor.seguir(m.cancion("a"));
    m.tiempo.avanzar(PLAZO_LISTO);
    assert.equal(m.seguidor.estado, "fallo");
    const tardio = m.embed;
    m.a.crea = true;
    m.seguidor.reintentar();
    assert.equal(m.embeds.length, 2, "el intento nuevo no se queda esperando al anterior");
    tardio.entregar();
    assert.ok(tardio.destruido, "el reproductor de un intento anterior se tira");
    m.tiempo.avanzar(500);
    assert.equal(m.seguidor.estado, "sonando");
    assert.equal(m.seguidor.control, m.embeds[1]);
}

// ---------- 5. cambio de canción sin quedarse en «Lo has pausado tú» ----------
{
    const m = montar();
    m.seguidor.encender();
    m.seguidor.seguir(m.cancion("a"));
    m.tiempo.avanzar(3000);
    assert.equal(m.seguidor.estado, "sonando");
    const marca = m.estados.length;
    // El DJ cambia de canción: al cargarla, el reproductor cuenta que está parado (posición 0, sin duración).
    m.seguidor.seguir(m.cancion("b", { posicion: 0 }));
    assert.deepEqual(m.embed.llamadas.slice(-2), ["loadUri spotify:track:b", "play"]);
    assert.equal(m.seguidor.estado, "arrancando", "no es que la persona lo haya pausado");
    m.tiempo.avanzar(200);
    assert.equal(m.seguidor.estado, "sonando");
    assert.deepEqual(m.estados.slice(marca), ["arrancando", "sonando"]);
    // Y si tras el cambio el reproductor no arranca, lo que falta es pulsar ▶: tampoco es «lo has pausado tú».
    m.a.dejaEmpezar = false;
    m.seguidor.seguir(m.cancion("c", { posicion: 0 }));
    m.tiempo.avanzar(2000);
    assert.equal(m.seguidor.estado, "arrancando");
    m.tiempo.avanzar(PLAZO_TOCAR);
    assert.equal(m.seguidor.estado, "bloqueado");
    assert.ok(!m.estados.includes("a-mano"), m.estados.join(" → "));
}
// Lo mismo aunque el aviso de «parado» llegue tarde, pasado el margen de la orden.
{
    const m = montar({ alCargar: "nada", dejaEmpezar: true });
    m.seguidor.encender();
    m.seguidor.seguir(m.cancion("a"));
    m.tiempo.avanzar(3000);
    m.a.dejaEmpezar = false;
    m.seguidor.seguir(m.cancion("b", { posicion: 0 }));
    m.tiempo.avanzar(2000);
    m.embed.contar(); // parado, 2 s después de cargar
    assert.equal(m.seguidor.estado, "arrancando");
    m.tiempo.avanzar(PLAZO_TOCAR);
    assert.equal(m.seguidor.estado, "bloqueado");
    assert.ok(!m.estados.includes("a-mano"));
}

// ---------- lo demás ----------
{
    const m = montar();
    m.seguidor.encender();
    assert.equal(m.seguidor.estado, "esperando", "escucha, pero no hay nada que poner");
    assert.equal(estadoDeOyente(m.seguidor.estado), "espera");
    assert.equal(m.embeds.length, 0);
    m.tiempo.avanzar(PLAZO_LISTO * 2);
    assert.equal(m.seguidor.estado, "esperando", "sin nada que poner no hay plazo de carga que valga");
    m.seguidor.seguir(m.cancion("a"));
    m.tiempo.avanzar(3000);
    assert.equal(m.seguidor.estado, "sonando");

    // El DJ pausa y sigue.
    m.seguidor.seguir(m.cancion("a", { reproduciendo: false, posicion: 33000 }));
    assert.equal(m.seguidor.estado, "pausa");
    assert.equal(m.embed.llamadas.at(-1), "pause");
    assert.equal(estadoDeOyente("pausa"), "espera");
    m.tiempo.avanzar(5000);
    m.seguidor.seguir(m.cancion("a", { posicion: 33000 }));
    assert.equal(m.embed.llamadas.at(-1), "resume");
    assert.equal(m.seguidor.estado, "arrancando");
    m.tiempo.avanzar(200);
    assert.equal(m.seguidor.estado, "sonando");
    assert.match(m.embed.llamadas.at(-1), /^seek 33$/, "al seguir, otra vez donde va el DJ");

    // La persona lo pausa en el reproductor: se respeta (y se dice); si vuelve a pulsar, suena.
    m.tiempo.avanzar(4000);
    m.embed.pulsar();
    assert.equal(m.seguidor.estado, "a-mano");
    assert.equal(estadoDeOyente(m.seguidor.estado), "pausado");
    m.tiempo.avanzar(30000);
    assert.equal(m.seguidor.estado, "a-mano", "no se le vuelve a poner en marcha");
    m.embed.pulsar();
    assert.equal(m.seguidor.estado, "sonando");

    // El DJ salta a otro punto de la canción: aquí también.
    m.tiempo.avanzar(7000);
    const antes = m.embed.llamadas.length;
    m.seguidor.seguir(m.cancion("a", { posicion: 150000 }));
    assert.deepEqual(m.embed.llamadas.slice(antes), ["seek 150"]);
    assert.equal(m.seguidor.estado, "sonando");

    // Un archivo del ordenador del DJ: no está en Spotify.
    m.seguidor.seguir(m.cancion("x", { uri: "spotify:local:maqueta", local: true }));
    assert.equal(m.seguidor.estado, "local");
    assert.equal(m.embed.pausado, true, "lo que sonaba se para");
    assert.equal(estadoDeOyente("local"), "espera");
    // Nada sonando en la cabina.
    m.seguidor.seguir(null);
    assert.equal(m.seguidor.estado, "esperando");
}
// La misma canción otra vez (el DJ la tiene en bucle, o ha vuelto atrás) cuando aquí ya había acabado.
{
    const m = montar({ duracion: () => 30000 });
    m.seguidor.encender();
    m.seguidor.seguir(m.cancion("a", { posicion: 0 }));
    m.tiempo.avanzar(32000);
    assert.equal(m.seguidor.estado, "muestra-acabada");
    m.tiempo.avanzar(170000);
    m.seguidor.seguir(m.cancion("a", { posicion: 0 }));
    assert.equal(m.embed.llamadas.at(-1), "play");
    m.tiempo.avanzar(200);
    assert.equal(m.seguidor.estado, "muestra");
}

// ---------- los estados de los oyentes: la misma lista aquí y en el servidor ----------

assert.deepEqual([...ESTADOS_OYENTE].sort(), [...ESTADOS_DEL_SERVIDOR].sort(), "la lista de estados de los oyentes es la misma en la página y en el servidor");
for (const estado of ["esperando", "local", "cargando", "fallo", "pausa", "arrancando", "bloqueado", "sonando", "muestra", "muestra-acabada", "a-mano"]) {
    assert.ok(ESTADOS_OYENTE.includes(estadoDeOyente(estado)), `«${estado}» tiene su estado de oyente`);
}
assert.equal(estadoDeOyente("inventado"), null);

console.log("Reproductor de la música: bien");
