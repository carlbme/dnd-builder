<script setup lang="ts">
import { useCloudStore } from '@/stores/cloud'
const cloud = useCloudStore()
</script>
<template>
  <aside class="account-bar" aria-label="Account and server saving">
    <div class="flex flex-wrap gap-4 items-center">
      <router-link to="/account">{{ cloud.user ? cloud.user.username + ' · Account' : 'Sign in / Register' }}</router-link>
      <router-link v-if="cloud.user" to="/characters">My library · Shared with me</router-link>
      <span role="status" aria-live="polite">{{ cloud.status }}</span>
      <button v-if="cloud.active?.dirty" @click="cloud.flush()">Retry save</button>
      <button v-if="cloud.active" @click="cloud.exportData(cloud.active.data)">Export current draft</button>
      <button v-if="cloud.active?.state === 'conflict'" @click="cloud.reloadActive().catch(e => cloud.error = e.message)">Reload server copy</button>
    </div>
    <p v-if="cloud.error" role="alert">{{ cloud.error }}</p>
  </aside>
</template>
<style>
.account-bar { padding: .8rem 1rem; background: var(--bsc-surface); color: var(--bsc-text); border-bottom: 1px solid #78716c; font-size: .9rem; }
.account-bar a, .account-bar button { text-decoration: underline; }
.cloud-panel { max-width: 64rem; margin: 1rem auto; }
.cloud-panel label { display: block; margin: .8rem 0; }
.cloud-panel input { display: block; padding: .6rem; background: var(--bsc-surface-2); color: var(--bsc-text); border: 1px solid #a8a29e; border-radius: .3rem; max-width: 100%; }
.cloud-panel button, .cloud-panel .action { display: inline-block; padding: .5rem .8rem; margin: .3rem; border: 1px solid #a8a29e; border-radius: .3rem; cursor: pointer; }
.cloud-panel button:disabled { opacity: .5; cursor: wait; }
.cloud-panel article { border: 1px solid #78716c; border-radius: .5rem; margin: 1rem 0; padding: 1rem; }
.cloud-panel h2 { font-size: 1.6rem; margin: 1rem 0; }
.cloud-panel h3 { font-size: 1.2rem; margin: .5rem 0; }
</style>
