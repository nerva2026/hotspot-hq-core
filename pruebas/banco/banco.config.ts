/*
 * Banco de pruebas · configuración de Playwright. El flujo la copia a `tests/banco.config.ts` dentro del clon de
 * WorkAdventure y las especificaciones, a `tests/tests/banco/`.
 *
 * Un solo navegador (Chromium, con cámara y micrófono de mentira y con «hinting» completo en las letras), de una en una
 * y sin reintentos: cada prueba apunta sus resultados en `apuntes.jsonl` y sigue aunque algo falle (ver
 * `especificaciones/util.ts`).
 */
import path from "path";
import { defineConfig, devices } from "@playwright/test";

const resultados = process.env.BANCO_RESULTADOS ?? path.join(process.cwd(), "banco-resultados");

export default defineConfig({
    testDir: "./tests/banco",
    timeout: 300_000,
    expect: { timeout: 15_000 },
    retries: 0,
    workers: 1,
    fullyParallel: false,
    forbidOnly: true,
    reporter: [["list"], ["json", { outputFile: path.join(resultados, "playwright.json") }]],
    outputDir: path.join(resultados, "playwright"),
    use: {
        baseURL: "https://play.workadventure.localhost/",
        ignoreHTTPSErrors: true,
        locale: "es-ES",
        timezoneId: "Europe/Madrid",
        actionTimeout: 20_000,
        navigationTimeout: 90_000,
        screenshot: "off",
        trace: "off",
        video: "off",
    },
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
                viewport: { width: 1280, height: 800 },
                permissions: ["microphone", "camera", "notifications"],
                launchOptions: {
                    // «--font-render-hinting=full»: las letras, ajustadas a la rejilla como en un Chromium de Linux. Es
                    // donde se ven los fallos de las letras de píxeles (un retoque que avanza distinto que la letra
                    // de al lado); dicho aquí, no depende de cómo venga el ejecutor. Solo lo entiende el Chromium sin
                    // ventana de Playwright (el «headless shell», el de siempre): 08-letras apunta si de verdad se
                    // aplica y repite sus medidas en otro navegador sin ajuste («--font-render-hinting=none»).
                    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--font-render-hinting=full"],
                },
            },
        },
    ],
});
