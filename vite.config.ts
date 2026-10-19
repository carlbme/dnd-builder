import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'
import { rmSync, readFileSync } from 'node:fs'

// Git hash for cache invalidation of localStorage game data
const buildHash = execSync('git rev-parse --short HEAD').toString().trim()

export default defineConfig({
  base: '/',
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash),
  },
  plugins: [
    {
      name: 'english-pdf-assets',
      generateBundle() {
        this.emitFile({
          type: 'asset', fileName: 'licenses/Atkinson-OFL.txt',
          source: readFileSync(resolve(__dirname, 'src/assets/fonts/Atkinson-OFL.txt'), 'utf8'),
        })
      },
      // These are generated copies; historical upstream templates stay in Git.
      closeBundle: { order: 'pre', handler() {
        for (const name of ['dnd-5e-sheet', 'brancalonia-sheet', 'apocalisse-sheet']) {
          rmSync(resolve(__dirname, `dist/pdf/${name}.pdf`), { force: true })
        }
      } },
    },
    vue(),
    tailwindcss(),
    VitePWA({
      // 'autoUpdate' e non 'prompt': con 'prompt' il service worker nuovo si
      // installa, va in attesa e ci resta, perche' nessuno chiamava mai la
      // funzione che lo attiva — non c'era nessuna interfaccia che lo
      // proponesse. Il risultato era che dopo una pubblicazione il visitatore
      // continuava a ricevere i file vecchi dal precache finche' non chiudeva
      // tutte le schede dell'app: su una PWA installata, in pratica mai.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.svg', 'pwa-512x512.svg'],
      manifest: {
        lang: 'en',
        name: 'D&D Character Builder',
        short_name: 'DnD Builder',
        description: 'Create and manage your D&D 5e, Brancalonia, and Apocalisse characters',
        theme_color: '#292524',
        background_color: '#1c1917',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        // Le tre righe che fanno arrivare davvero la versione nuova.
        // skipWaiting: il service worker appena installato non aspetta che le
        // schede aperte si chiudano; clientsClaim: prende subito in carico le
        // pagine gia' aperte; cleanupOutdatedCaches: cancella i precache dei
        // build precedenti, che altrimenti restano li' a occupare spazio per
        // sempre, uno per versione pubblicata.
        //
        // Nessuna delle tre tocca le schede dei personaggi: quelle stanno in
        // localStorage (chiavi `character` e `app`), che e' un deposito
        // separato dalla Cache API su cui lavora il service worker. Cancellare
        // una cache non puo' raggiungerle. Il dato di gioco tenuto in
        // localStorage ha gia' una sua pulizia per build, `sweepStaleCache()`,
        // che rimuove solo le chiavi `gamedata:` e lascia stare il resto.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,woff2,ttf}'],
        // WSG 3.3: il precache si scarica tutto al primo avvio, anche cio' che
        // nessuno chiedera' mai. Qui restano fuori i file che il browser non
        // richiede in nessun percorso dell'app:
        // - le due facce corsive (Atkinson e Courier Prime): style.css le
        //   dichiara, ma nessun componente usa italic/<em>, quindi il browser
        //   non le scarica mai da solo (~24 KB risparmiati);
        // - vite.svg: residuo dello scaffold, non referenziato da nulla;
        // - og-image.svg: serve solo ai crawler social, che leggono l'URL
        //   assoluto e non passano mai dal service worker;
        // - assets/favicon-*.svg: il marchio del design system, emesso solo
        //   perche' tokens.css dichiara --bsc-favicon-svg, variabile che
        //   nessuna regola CSS consuma (~6 KB).
        // Non e' una rimozione: se un giorno servissero, la rete li serve
        // comunque; qui evitiamo solo di pagarli in anticipo a ogni visitatore.
        globIgnores: [
          '**/node_modules/**/*',
          '**/*-italic-*.woff2',
          'vite.svg',
          'og-image.svg',
          'assets/favicon-*.svg',
        ],
        runtimeCaching: [
          { urlPattern: /\/api(?:\/|$)/, handler: 'NetworkOnly' },
          {
            urlPattern: /\.(?:pdf)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdf-templates',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: { proxy: { '/api': process.env.DND_DEV_BACKEND || 'http://127.0.0.1:8000' } },
  preview: { proxy: { '/api': process.env.DND_DEV_BACKEND || 'http://127.0.0.1:8000' } },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf-lib': ['pdf-lib'],
          // WSG 3.3 + 3.8: Game data split per module — loaded on demand per wizard step
          'game-dnd5e-races': ['./src/data/dnd5e/races.ts'],
          'game-dnd5e-classes': ['./src/data/dnd5e/classes.ts'],
          'game-dnd5e-backgrounds': ['./src/data/dnd5e/backgrounds.ts'],
          'game-dnd5e-spells': ['./src/data/dnd5e/spells.ts', './src/data/dnd5e/spells-4-9.ts'],
          'game-dnd5e-equipment': ['./src/data/dnd5e/equipment.ts'],
          'game-dnd5e-rules': ['./src/data/dnd5e/rules.ts'],
          'game-branca-races': ['./src/data/brancalonia/races.ts'],
          'game-branca-classes': ['./src/data/brancalonia/classes.ts', './src/data/brancalonia/burattinaio.ts'],
          'game-branca-backgrounds': ['./src/data/brancalonia/backgrounds.ts'],
          'game-branca-rules': ['./src/data/brancalonia/rules.ts'],
          'game-apo-races': ['./src/data/apocalisse/races.ts'],
          'game-apo-classes': ['./src/data/apocalisse/classes.ts'],
          'game-apo-backgrounds': ['./src/data/apocalisse/backgrounds.ts'],
          'game-apo-rules': ['./src/data/apocalisse/rules.ts'],
        },
      },
    },
  },
})
