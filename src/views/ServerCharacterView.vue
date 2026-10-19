<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCloudStore, type ServerCharacter } from '@/stores/cloud'
import { usePdfExport } from '@/composables/usePdfExport'
import { preloadVariantData } from '@/data'
import { migrateCharacter } from '@/stores/character'
import CharacterSheet from '@/components/shared/CharacterSheet.vue'
const cloud = useCloudStore()
const route = useRoute()
const record = ref<ServerCharacter | null>(null)
const error = ref('')
const { exportPdfFor, exporting } = usePdfExport()
let poll: ReturnType<typeof setInterval>
async function load() {
  if (!cloud.user) { record.value = null; return }
  try {
    const next = await cloud.request<ServerCharacter>('/characters/' + route.params.id)
    await preloadVariantData(next.data.variant)
    migrateCharacter(next.data)
    record.value = next
    error.value = ''
  } catch (e) { record.value = null; error.value = (e as Error).message }
}
async function json() {
  await load()
  if (record.value) cloud.exportData(record.value.data)
}
async function pdf() {
  await load()
  if (record.value) {
    try { await exportPdfFor(record.value.data) } catch (e) { error.value = (e as Error).message }
  }
}
onMounted(() => { void load(); poll = setInterval(() => { void load() }, 15000) })
onBeforeUnmount(() => clearInterval(poll))
watch(() => [cloud.user?.id, route.params.id], () => { void load() })
</script>
<template>
  <section class="cloud-panel" aria-labelledby="sheet-title">
    <h2 id="sheet-title">Character sheet</h2>
    <p v-if="!cloud.user"><router-link :to="{path:'/account',query:{next:route.path}}">Sign in</router-link> with an account that has access to this character.</p>
    <p role="alert">{{ error }}</p>
    <template v-if="record && cloud.user">
      <p>{{ record.editable ? 'Your character' : 'View only · Shared by ' + record.owner }} · revision {{ record.revision }}</p>
      <button @click="json">Export JSON</button>
      <button @click="pdf" :disabled="exporting">{{ exporting ? 'Exporting…' : 'Export PDF' }}</button>
      <CharacterSheet :char="record.data" :titolo="record.data.name" />
    </template>
  </section>
</template>
