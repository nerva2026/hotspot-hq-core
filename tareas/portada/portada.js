// Portada: elegir entre CREW (entrar con Google) e INVITADO (solo la calle).
(async function () {
    const $ = (id) => document.getElementById(id);
    const q = new URLSearchParams(location.search);

    const avisos = {
        adios: "Has salido. ¡Hasta pronto!",
        cancelado: "Has cancelado la entrada con Google.",
        "solo-crew": "La oficina y la terraza son solo para el crew. Entra con tu cuenta o sigue como invitado.",
    };
    for (const [clave, texto] of Object.entries(avisos)) {
        if (q.has(clave)) {
            $("aviso").textContent = texto;
            $("aviso").hidden = false;
        }
    }
    if (location.search) history.replaceState(null, "", "/");

    // La oficina guarda su token en este mismo navegador; si es de alguien del crew, se entra directo.
    let oficina = null;
    let tokenOficina = null;
    try {
        tokenOficina = localStorage.getItem("authToken");
        if (tokenOficina) {
            const carga = JSON.parse(atob(tokenOficina.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
            if (carga.accessToken && (!carga.exp || carga.exp * 1000 > Date.now())) oficina = carga;
        }
    } catch {
        /* sin almacenamiento o token raro: como si no hubiera */
    }

    let yo = null;
    try {
        const r = await fetch("/cuentas/yo", { cache: "no-store", credentials: "same-origin" });
        if (r.ok) yo = await r.json();
    } catch {
        /* sin conexión: se queda la portada normal */
    }

    const crew = $("crew");
    if (oficina && !q.has("adios")) {
        crew.href = "/oficina";
        $("crew-accion").textContent = "Entrar a la oficina ▸";
    } else {
        // La oficina pide la sesión a /cuentas; con la marca «directo» se salta la pantalla intermedia.
        crew.href = `/login-screen?playUri=${encodeURIComponent(`${location.origin}/~/hotspot/hq.wam`)}`;
        crew.addEventListener("click", () => {
            document.cookie = `hs_directo=1; Path=/cuentas/; Max-Age=300; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
        });
        $("crew-accion").textContent = yo ? "Entrar a la oficina ▸" : "Entrar con Google ▸";
    }

    const nombre = yo?.nombre || oficina?.username;
    if (nombre) {
        $("saludo").textContent = `¡Hola, ${nombre}! Bienvenido a HOT SPOT S.L.`;
        $("crew-texto").textContent = "Eres del crew: pasa directamente a la oficina.";
        const pie = $("pie");
        const tablon = document.createElement("a");
        tablon.href = "/tareas/";
        tablon.textContent = "Tablón de tareas";
        const salir = document.createElement("a");
        salir.href = `/cuentas/salir${tokenOficina ? `?token=${encodeURIComponent(tokenOficina)}` : ""}`;
        salir.textContent = "Salir";
        salir.addEventListener("click", () => {
            try {
                localStorage.removeItem("authToken");
            } catch {
                /* nada que borrar */
            }
        });
        pie.append(tablon, salir);
    }
})();
