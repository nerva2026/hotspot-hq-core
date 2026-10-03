<script lang="ts">
    /*
     * HOT SPOT S.L. · el texto de un aviso, con la palabra ESPACIO dibujada como una tecla.
     *
     * Lo usan los avisos de abajo de WorkAdventure (parche 14) en lugar de escribir `{message}` a secas. El texto no se
     * convierte en HTML: se parte en trozos (teclas.ts) y cada uno se escribe como texto. El estilo de la tecla
     * (`.hs-tecla`) está en hotspot-retro.css.
     *
     * La plantilla va en una sola línea a propósito: entre trozo y trozo no puede colarse ni un espacio de más.
     */
    import { trozosConTeclas } from "./teclas";

    interface Props {
        texto: string;
    }

    let { texto }: Props = $props();

    const trozos = $derived(trozosConTeclas(texto));
</script>

{#each trozos as trozo}{#if trozo.tecla}<span class="hs-tecla">{trozo.texto}</span>{:else}{trozo.texto}{/if}{/each}
