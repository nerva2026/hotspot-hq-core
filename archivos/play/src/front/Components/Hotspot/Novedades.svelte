<script lang="ts">
    /*
     * HOT SPOT S.L. · número de versión (abajo a la izquierda, se puede pulsar) y aviso de novedades.
     *
     * - El aviso sale solo una vez por versión (se apunta en localStorage), cuando ya se ha entrado en el mapa:
     *   no encima de las pantallas de nombre, muñeco, compañero o cámara, ni del tutorial de WorkAdventure.
     * - Se cierra con el botón, con Esc o pulsando fuera. Se vuelve a abrir pulsando la etiqueta de la versión
     *   (que se esconde mientras el chat está abierto, para no tapar su campo de escribir).
     * - Qué versión es y qué novedades salen: novedades.ts (no hay que tocar este archivo).
     * - Las novedades con `requiere: "musica"` solo salen si el servidor tiene Spotify conectado: se le pregunta (con la
     *   cookie de la sesión del tablón, esperando como mucho 2 s) antes de abrir el aviso. Si no contesta, o la música no
     *   está conectada, esa línea no sale.
     */
    import { onDestroy, tick } from "svelte";
    import { gameSceneIsLoadedStore } from "../../Stores/GameSceneStore";
    import { loaderVisibleStore } from "../../Stores/LoaderStore";
    import { errorScreenStore } from "../../Stores/ErrorScreenStore";
    import { loginSceneVisibleStore } from "../../Stores/LoginSceneStore";
    import { selectCharacterSceneVisibleStore } from "../../Stores/SelectCharacterStore";
    import { selectCompanionSceneVisibleStore } from "../../Stores/SelectCompanionStore";
    import { enableCameraSceneVisibilityStore } from "../../Stores/MediaStore";
    import { pwaInstallSceneVisibleStore } from "../../Stores/PwaInstallStore";
    import { onboardingStore } from "../../Stores/OnboardingStore";
    import { inputFormFocusStore } from "../../Stores/UserInputStore";
    import { chatVisibilityStore } from "../../Stores/ChatStore";
    import { NOVEDADES, TITULO, VERSION, type Novedad } from "./novedades";

    /** En localStorage: la última versión cuyo aviso ya salió. */
    const CLAVE_VISTA = "hotspot-novedades-vistas";
    /** Se deja ver el mapa un momento antes de poner el aviso. */
    const ESPERA_MS = 1500;
    /** El estado de la música en el servidor del tablón (misma web que la oficina: lleva la cookie de la sesión). */
    const URL_MUSICA = "/tareas/api/musica";
    /** Lo máximo que se espera a que el servidor diga si la música está conectada. */
    const ESPERA_MUSICA_MS = 2000;

    let abierto = $state(false);
    let botonCerrar: HTMLButtonElement | undefined = $state();
    let origenDelFoco: HTMLElement | null = null;
    /** Aunque localStorage no funcione, el aviso no sale más de una vez por visita. */
    let yaSalio = false;
    /** ¿Está conectada la música? Solo es true si el servidor lo ha dicho a tiempo (sin sesión, sin respuesta o sin Spotify: false). */
    let musicaConectada = $state(false);
    let preguntando: Promise<void> | null = null;

    /** Pregunta al servidor si la música está conectada, con tope de ESPERA_MUSICA_MS. Nunca falla. */
    function preguntarPorLaMusica(): Promise<void> {
        if (preguntando) return preguntando;
        preguntando = (async () => {
            const control = new AbortController();
            const tope = setTimeout(() => control.abort(), ESPERA_MUSICA_MS);
            let conectada = false;
            try {
                const respuesta = await fetch(URL_MUSICA, { credentials: "same-origin", cache: "no-store", signal: control.signal });
                if (respuesta.ok) conectada = (await respuesta.json())?.configurado === true;
            } catch {
                // sin respuesta, sin sesión o respuesta rara: la línea de la música no sale
            } finally {
                clearTimeout(tope);
            }
            musicaConectada = conectada;
        })().finally(() => {
            preguntando = null;
        });
        return preguntando;
    }

    /** ¿Sale esta línea? Las que piden música solo salen si está conectada. */
    const sale = (novedad: Novedad): boolean => typeof novedad === "string" || novedad.requiere !== "musica" || musicaConectada;
    const textoDe = (novedad: Novedad): string => (typeof novedad === "string" ? novedad : novedad.texto);
    const novedades = $derived(NOVEDADES.filter(sale).map(textoDe));

    function versionVista(): string | null {
        try {
            return localStorage.getItem(CLAVE_VISTA);
        } catch {
            return null;
        }
    }

    function apuntarVista(): void {
        try {
            localStorage.setItem(CLAVE_VISTA, VERSION);
        } catch {
            // sin localStorage no se puede recordar: queda el aviso de «yaSalio»
        }
    }

    // ¿Ya se está dentro del mapa? Es la condición con la que GameOverlay enseña la interfaz del juego,
    // más que no haya ninguna pantalla de entrada ni el tutorial de WorkAdventure por delante.
    const enElMapa = $derived(
        $gameSceneIsLoadedStore &&
            !$loaderVisibleStore &&
            $errorScreenStore === undefined &&
            !$loginSceneVisibleStore &&
            !$selectCharacterSceneVisibleStore &&
            !$selectCompanionSceneVisibleStore &&
            !$enableCameraSceneVisibilityStore &&
            !$pwaInstallSceneVisibleStore &&
            $onboardingStore === null,
    );

    $effect(() => {
        if (!enElMapa || yaSalio || versionVista() === VERSION) return;
        const espera = setTimeout(async () => {
            yaSalio = true;
            await preguntarPorLaMusica(); // hasta 2 s: el aviso sale ya con sus líneas definitivas
            apuntarVista();
            void abrir();
        }, ESPERA_MS);
        return () => clearTimeout(espera);
    });

    async function abrir(): Promise<void> {
        if (abierto) return;
        origenDelFoco = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        abierto = true;
        inputFormFocusStore.set(true); // mientras está abierto, las flechas y el espacio no mueven al muñeco
        await tick();
        botonCerrar?.focus();
    }

    /** Al pulsar la etiqueta de la versión: sale ya, y la línea de la música aparece si el servidor contesta a tiempo. */
    function abrirAMano(): void {
        void preguntarPorLaMusica();
        void abrir();
    }

    function cerrar(): void {
        if (!abierto) return;
        abierto = false;
        inputFormFocusStore.set(false);
        if (origenDelFoco?.isConnected) origenDelFoco.focus();
        origenDelFoco = null;
    }

    function alPulsarFondo(evento: MouseEvent): void {
        if (evento.target === evento.currentTarget) cerrar();
    }

    function alPulsarTecla(evento: KeyboardEvent): void {
        if (!abierto) return;
        if (evento.key === "Escape") {
            evento.preventDefault();
            evento.stopPropagation();
            cerrar();
        } else if (evento.key === "Tab") {
            // Solo hay un botón: el foco no se escapa al mapa de detrás.
            evento.preventDefault();
            botonCerrar?.focus();
        }
    }

    onDestroy(() => {
        if (abierto) inputFormFocusStore.set(false);
    });
</script>

<svelte:window onkeydowncapture={alPulsarTecla} />

<!-- Con el chat abierto la etiqueta caería encima del campo de escribir: se quita mientras tanto. -->
{#if !$chatVisibilityStore}
    <button
        id="hotspot-version"
        class="hs-version"
        type="button"
        title="Novedades de esta versión"
        aria-haspopup="dialog"
        onclick={abrirAMano}
    >
        {VERSION}
    </button>
{/if}

{#if abierto}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="hs-velo" onclick={alPulsarFondo}>
        <div class="hs-ventana" role="dialog" aria-modal="true" aria-labelledby="hs-novedades-titulo">
            <div class="hs-barra"><span>Novedades</span><span>{VERSION}</span></div>
            <div class="hs-cuerpo">
                <h2 id="hs-novedades-titulo" class="hs-titulo">{TITULO}</h2>
                <ul class="hs-lista">
                    {#each novedades as novedad}
                        <li>{novedad}</li>
                    {/each}
                </ul>
            </div>
            <div class="hs-pie">
                <p>Para volver a verlo, pulsa el número de versión de abajo a la izquierda.</p>
                <button
                    bind:this={botonCerrar}
                    class="hs-cerrar"
                    type="button"
                    data-testid="hotspot-novedades-cerrar"
                    onclick={cerrar}>Cerrar</button
                >
            </div>
        </div>
    </div>
{/if}

<style>
    /* Paleta de la casa: tinta #1c1715, crema #f3e6d8, naranja #e0562a, acento #c4461f, amarillo #ffd84a.
       Letras: Silkscreen (títulos) y Pixelify Sans (texto), cargadas por hotspot-retro.css. Todas a un tamaño de su
       rejilla (Silkscreen: 16 y 24 px; Pixelify Sans: 11 y 16 px): fuera de ella los trazos salen de grosores
       distintos, y aquí hay cifras (el número de versión) en la barra, en el título y en la etiqueta. */

    /* ---------- etiqueta de la versión: discreta, abajo a la izquierda ---------- */
    .hs-version {
        position: fixed;
        left: 0;
        bottom: 0;
        z-index: 9999;
        margin: 0;
        padding: 6px 8px 4px 4px;
        border: 0;
        background: none;
        cursor: pointer;
        font-family: "Pixelify Sans", ui-monospace, monospace;
        font-size: 11px;
        line-height: 1;
        letter-spacing: 0.03em;
        color: rgba(243, 230, 216, 0.45);
        text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
        user-select: none;
    }
    .hs-version:hover,
    .hs-version:focus-visible {
        color: #ffd84a;
    }

    /* ---------- aviso ---------- */
    .hs-velo {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        background: rgba(11, 7, 6, 0.78);
    }
    .hs-ventana {
        display: flex;
        flex-direction: column;
        width: min(100%, 472px);
        max-height: 100%;
        background: #1c1715;
        color: #f3e6d8;
        font-family: "Pixelify Sans", ui-monospace, monospace;
        box-shadow:
            inset 2px 2px 0 hsl(var(--contrast-500, 17 14% 32%)),
            inset -2px -2px 0 #0b0706,
            0 0 0 3px #0b0706,
            8px 8px 0 rgba(0, 0, 0, 0.5);
        animation: hs-aparecer 0.24s steps(4, end);
    }
    .hs-barra {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 5px 14px 4px;
        background: #e0562a;
        color: #1c1715;
        border-bottom: 3px solid #0b0706;
        font-family: "Silkscreen", "Pixelify Sans", monospace;
        font-size: 16px;
        line-height: 20px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: uppercase;
    }
    .hs-cuerpo {
        padding: 16px 20px 6px;
        overflow-y: auto;
    }
    .hs-titulo {
        margin: 0 0 14px;
        font-family: "Silkscreen", "Pixelify Sans", monospace;
        font-size: 24px;
        font-weight: 700;
        line-height: 28px;
        letter-spacing: 0;
        color: #ffd84a;
        text-shadow: 2px 2px 0 #c4461f;
    }
    .hs-lista {
        margin: 0;
        padding: 0;
        list-style: none;
    }
    .hs-lista li {
        position: relative;
        margin: 0 0 9px;
        padding-left: 22px;
        font-size: 16px;
        line-height: 21px;
    }
    /* viñeta: cuadradito amarillo con sombra del acento */
    .hs-lista li::before {
        content: "";
        position: absolute;
        left: 2px;
        top: 6px;
        width: 8px;
        height: 8px;
        background: #ffd84a;
        box-shadow: 2px 2px 0 #c4461f;
    }
    .hs-pie {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px 16px;
        padding: 10px 20px 16px;
    }
    .hs-pie p {
        margin: 0;
        flex: 1 1 180px;
        font-size: 11px;
        line-height: 14px;
        color: rgba(243, 230, 216, 0.6);
    }
    .hs-cerrar {
        margin: 0;
        padding: 7px 16px 6px;
        border: 2px solid #0b0706;
        background: #e0562a;
        color: #1c1715;
        cursor: pointer;
        font-family: "Silkscreen", "Pixelify Sans", monospace;
        font-size: 16px;
        line-height: 20px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: uppercase;
        box-shadow:
            inset 2px 2px 0 rgba(255, 255, 255, 0.28),
            inset -2px -2px 0 #c4461f,
            3px 3px 0 rgba(0, 0, 0, 0.5);
    }
    .hs-cerrar:hover {
        background: #ffd84a;
    }
    .hs-cerrar:active {
        transform: translate(2px, 2px);
        box-shadow:
            inset 2px 2px 0 rgba(255, 255, 255, 0.28),
            inset -2px -2px 0 #c4461f,
            1px 1px 0 rgba(0, 0, 0, 0.5);
    }

    @keyframes hs-aparecer {
        from {
            opacity: 0;
            transform: translateY(12px);
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .hs-ventana {
            animation: none;
        }
    }
</style>
