<script setup lang="ts">
// English license notices; upstream source notices remain in DATA-SOURCES.md.
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <section class="max-w-2xl mx-auto py-12" aria-labelledby="credits-heading">
    <h2 id="credits-heading" class="text-3xl font-bold text-amber-500 mb-8">{{ t('credits.title') }}</h2>

    <div class="space-y-6 text-stone-300">
      <p>{{ t('credits.intro') }}</p>

      <div class="bsc-card border border-stone-700 rounded-lg">
        <h3 class="font-gothic text-amber-400 mb-2">{{ t('credits.softwareTitle') }}</h3>
        <p class="text-sm text-stone-300 mb-2">{{ t('credits.softwareNotice') }}</p>
        <a href="https://github.com/carlbme/dnd-builder/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" class="text-sm text-amber-400 hover:text-amber-300">{{ t('credits.softwareLicense') }}</a>
      </div>

      <div class="bsc-card border border-stone-700 rounded-lg">
        <h3 class="font-gothic text-amber-400 mb-2">{{ t('credits.srd51Title') }}</h3>
        <blockquote lang="en" class="text-sm text-stone-400 border-l-2 border-stone-600 pl-4">
          {{ t('credits.srd51') }}
        </blockquote>
      </div>

      <div class="bsc-card border border-stone-700 rounded-lg">
        <h3 class="font-gothic text-amber-400 mb-2">{{ t('credits.srd521Title') }}</h3>
        <blockquote lang="en" class="text-sm text-stone-400 border-l-2 border-stone-600 pl-4">
          {{ t('credits.srd521') }}
        </blockquote>
      </div>

      <div class="bsc-card border border-stone-700 rounded-lg">
        <h3 class="font-gothic text-amber-400 mb-2">{{ t('credits.acheronTitle') }}</h3>
        <p class="text-sm text-stone-400 mb-4">{{ t('credits.acheron') }}</p>

        <h4 class="font-gothic text-stone-300 text-sm mb-1">{{ t('credits.brancaloniaTitle') }}</h4>
        <blockquote lang="en" class="text-sm text-stone-400 border-l-2 border-stone-600 pl-4 mb-4">
          {{ t('credits.brancalonia') }}
        </blockquote>

        <h4 class="font-gothic text-stone-300 text-sm mb-1">{{ t('credits.apocalisseTitle') }}</h4>
        <blockquote lang="en" class="text-sm text-stone-400 border-l-2 border-stone-600 pl-4 mb-4">
          {{ t('credits.apocalisse') }}
        </blockquote>

        <a
          href="https://www.acheron.it"
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-amber-400 hover:text-amber-300 transition-colors"
        >{{ t('credits.acheronLink') }}</a>
      </div>

      <div class="bsc-card border border-stone-700 rounded-lg">
        <h3 class="font-gothic text-amber-400 mb-2">{{ t('credits.missingTitle') }}</h3>
        <p class="text-sm text-stone-400">{{ t('credits.missing') }}</p>
      </div>

      <div class="bsc-card border border-stone-700 rounded-lg">
        <h3 class="font-gothic text-amber-400 mb-2">{{ t('credits.moreTitle') }}</h3>
        <p class="text-sm text-stone-400 mb-2">{{ t('credits.more') }}</p>
        <a
          href="https://github.com/carlbme/dnd-builder/blob/main/DATA-SOURCES.md"
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-amber-400 hover:text-amber-300 transition-colors"
        >{{ t('credits.moreLink') }}</a>
      </div>
    </div>

    <div class="mt-8">
      <router-link to="/" class="text-amber-400 hover:text-amber-300 transition-colors">
        &larr; {{ t('nav.home') }}
      </router-link>
    </div>
  </section>
</template>
