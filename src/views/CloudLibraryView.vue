<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCloudStore, type ServerCharacter } from '@/stores/cloud'
import type { CharacterData } from '@/stores/character'
const cloud = useCloudStore()
const router = useRouter()
const message = ref('')
const busy = ref(false)
const legacy = ref<CharacterData[]>([])
const shareFor = ref<ServerCharacter | null>(null)
const recipients = ref<string[]>([])
const username = ref('')
const owned = computed(() => cloud.library.filter(c => c.editable))
const shared = computed(() => cloud.library.filter(c => !c.editable))
const pending = computed(() => Object.entries(cloud.drafts).filter(([,d]) => d.dirty))
async function perform(action: () => Promise<unknown>) {
  busy.value = true; message.value = ''
  try { await action() } catch (e) { message.value = (e as Error).message }
  finally { busy.value = false }
}
onMounted(() => {
  if (cloud.user) void perform(() => cloud.refreshLibrary())
  try {
    const raw = JSON.parse(localStorage.getItem('character') || '{}')
    const rows = Array.isArray(raw.savedCharacters) ? raw.savedCharacters : []
    if (raw.character && (raw.character.name || raw.character.race || raw.character.className) && !rows.some((c: CharacterData) => c.id === raw.character.id)) rows.push(raw.character)
    legacy.value = rows
  } catch { message.value = 'Could not read old browser characters. Use JSON import instead.' }
})
async function edit(c: ServerCharacter) { await cloud.open(c.id); await router.push('/builder') }
async function remove(c: ServerCharacter) {
  if (!window.confirm(`Delete “${c.name}” from your server library and revoke all access? This cannot be undone.`)) return
  await cloud.request('/characters/' + c.id + '?revision=' + c.revision, 'DELETE')
  cloud.forgetDeleted(c.client_id)
  await cloud.refreshLibrary()
}
async function sharing(c: ServerCharacter) {
  shareFor.value = c
  recipients.value = await cloud.request<string[]>('/characters/' + c.id + '/shares')
}
async function addShare() {
  await cloud.request('/characters/' + shareFor.value!.id + '/shares', 'POST', { username: username.value })
  username.value = ''
  await sharing(shareFor.value!)
}
async function revoke(name: string) {
  await cloud.request('/characters/' + shareFor.value!.id + '/shares/' + encodeURIComponent(name), 'DELETE')
  await sharing(shareFor.value!)
}
</script>
<template>
  <section class="cloud-panel" aria-labelledby="library-title">
    <h2 id="library-title">Character library</h2>
    <p v-if="!cloud.user"><router-link to="/account">Sign in or register</router-link> to load your private library.</p>
    <template v-else>
      <p>Server libraries require a connection. Owners can edit and share; recipients can only view and export.</p>
      <router-link class="action" to="/">New character / Import JSON</router-link>
      <button :disabled="busy" @click="perform(() => cloud.refreshLibrary())">Refresh library</button>
      <p role="alert">{{ message }}</p>
      <h3>My characters</h3>
      <p v-if="!owned.length">No server characters yet. Start any of the four builders; unfinished work saves automatically.</p>
      <article v-for="c in owned" :key="c.id">
        <strong>{{ c.name }}</strong> · {{ c.variant }} · revision {{ c.revision }}
        <div>
          <button :disabled="busy" @click="perform(() => edit(c))">Edit</button>
          <router-link class="action" :to="'/character/' + c.id">View / Export</router-link>
          <button :disabled="busy" @click="perform(() => sharing(c))">Manage sharing</button>
          <button :disabled="busy" @click="perform(() => remove(c))">Delete</button>
        </div>
      </article>
      <h3>Shared with me</h3>
      <p v-if="!shared.length">No characters shared with this account.</p>
      <article v-for="c in shared" :key="c.id">
        <strong>{{ c.name }}</strong> · {{ c.variant }} · shared by {{ c.owner }}
        <router-link class="action" :to="'/character/' + c.id">View / Export</router-link>
      </article>
      <section v-if="shareFor" aria-label="Manage sharing">
        <h3>Share {{ shareFor.name }}</h3>
        <p>Only accounts listed here can view this link: <a :href="'/character/' + shareFor.id">{{ '/character/' + shareFor.id }}</a></p>
        <form @submit.prevent="perform(addShare)"><label>Existing username<input v-model="username" required pattern="[A-Za-z0-9_-]+" minlength="3" maxlength="32"></label><button :disabled="busy">Grant view access</button></form>
        <p v-for="name in recipients" :key="name">{{ name }} <button :disabled="busy" @click="perform(() => revoke(name))">Revoke access</button></p>
        <p>Revocation blocks future server access immediately. Exported files and copies already downloaded cannot be revoked.</p>
        <button @click="shareFor = null">Close sharing</button>
      </section>
      <section v-if="pending.length" aria-label="Recovery drafts">
        <h3>Unsaved recovery drafts</h3>
        <article v-for="[id, draft] in pending" :key="id">
          {{ draft.data.name || 'Unfinished character' }} · {{ draft.state }}
          <button @click="cloud.exportData(draft.data)">Export recovery draft</button>
          <button v-if="draft.serverId" @click="perform(async () => { await cloud.open(draft.serverId!); await router.push('/builder') })">Resume draft</button>
        </article>
        <button @click="perform(() => cloud.flush())" :disabled="busy">Retry pending saves</button>
      </section>
      <section v-if="legacy.length" aria-label="Browser character migration">
        <h3>Import existing browser characters</h3>
        <p>Each import creates a new server character. Originals stay in this browser. Characters on other website addresses must be exported there and imported here as JSON.</p>
        <article v-for="(c, i) in legacy" :key="i">{{ c.name || 'Unfinished character' }} <button :disabled="busy" @click="perform(() => cloud.importLegacy(c))">Import a new copy</button></article>
      </section>
    </template>
  </section>
</template>
