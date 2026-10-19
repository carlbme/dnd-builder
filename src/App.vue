<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AccountBar from '@/components/shared/AccountBar.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import { useTheme } from '@/composables/useTheme'

const { t } = useI18n()
const showCookieBanner = ref(false)

// Initialize theme — applies data-theme attribute on <html>
useTheme()

onMounted(() => {
  if (!localStorage.getItem('gdpr-accepted')) {
    showCookieBanner.value = true
  }
})

function acceptGdpr() {
  localStorage.setItem('gdpr-accepted', '1')
  showCookieBanner.value = false
}
</script>

<template>
  <div class="min-h-screen bg-stone-900 text-stone-100 flex flex-col">
    <!-- Skip to content link for keyboard users -->
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-stone-900 focus:rounded focus:font-semibold"
    >
      Skip to content
    </a>
    <AppHeader />
    <AccountBar />
    <main id="main-content" class="container mx-auto px-4 py-6 flex-1" role="main">
      <router-view />
    </main>
    <footer class="border-t border-stone-800 py-6 text-center" role="contentinfo">
      <div class="container mx-auto px-4 flex flex-col items-center gap-3">
        <p class="font-gothic font-semibold text-stone-200">{{ t('footer.forkName') }}</p>
        <p class="text-sm text-stone-300">
          {{ t('footer.basedOn') }}
          <a href="https://www.brainstormclub.it/" target="_blank" rel="noopener noreferrer" class="underline hover:text-amber-400">{{ t('footer.upstreamName') }}</a>
        </p>
        <nav class="flex flex-wrap items-center justify-center gap-3 text-xs text-stone-300" aria-label="Footer links">
          <a href="https://github.com/carlbme/dnd-builder" target="_blank" rel="noopener noreferrer" class="hover:text-amber-400">{{ t('footer.source') }}</a>
          <span aria-hidden="true">·</span>
          <a href="https://github.com/Brainstorm-Club/dnd-character-builder" target="_blank" rel="noopener noreferrer" class="hover:text-amber-400">{{ t('footer.originalProject') }}</a>
          <span aria-hidden="true">·</span>
          <!-- Keep game-data attribution reachable from every page. -->
          <router-link to="/credits" class="hover:text-amber-400">{{ t('footer.credits') }}</router-link>
          <span aria-hidden="true">·</span>
          <router-link to="/privacy" class="hover:text-amber-400">{{ t('footer.privacy') }}</router-link>
        </nav>
      </div>
    </footer>

    <!--
      GDPR Cookie Banner.
      Valutato .bsc-alert e scartato: il componente del DS è un richiamo in
      linea con filetto rosso a sinistra su fondo neutro, mentre questa è una
      barra fissa a tutta larghezza con filetto in alto. Adottarlo sposterebbe
      il filetto e imporrebbe `display: flex` sull'involucro, che qui contiene
      un `container mx-auto` da centrare: cambierebbe la forma, non solo la
      pelle. Serve prima un .bsc-alert--bar a monte nel submodule.
    -->
    <div
      v-if="showCookieBanner"
      class="fixed bottom-0 left-0 right-0 bg-stone-800 border-t border-amber-700/30 p-4 z-50 shadow-lg"
      role="region"
      :aria-label="t('gdpr.label')"
      aria-describedby="gdpr-desc"
    >
      <div class="container mx-auto flex flex-col sm:flex-row items-center gap-4 max-w-4xl">
        <p id="gdpr-desc" class="text-sm text-stone-300 flex-1">
          {{ t('gdpr.banner') }}
        </p>
        <!-- Stesso .bsc-btn del pulsante del caffè: px-6/py-2 erano già i
             valori del DS, quindi spariscono; resta il colore dell'app. -->
        <button
          @click="acceptGdpr"
          class="bsc-btn bg-amber-600 hover:bg-amber-500 border-amber-600 hover:border-amber-500 text-stone-900 whitespace-nowrap text-sm"
        >
          {{ t('gdpr.accept') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* .bsc-btn solleva il pulsante di 1px al passaggio del mouse e il design
   system non protegge quella transform dietro prefers-reduced-motion. Il
   progetto lo fa ovunque (WSG 2.16), quindi qui è una toppa locale: va
   portata a monte nel submodule, non risolta file per file. */
@media (prefers-reduced-motion: reduce) {
  .bsc-btn,
  .bsc-btn:hover,
  .bsc-btn:active {
    transition: none;
    transform: none;
  }
}
</style>
