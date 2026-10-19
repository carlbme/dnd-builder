<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCloudStore, type User } from '@/stores/cloud'
const cloud = useCloudStore()
const router = useRouter()
const route = useRoute()
const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const current = ref('')
const message = ref('')
const busy = ref(false)
const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || ''
// Reset secrets arrive in a fragment, then leave the address bar immediately.
if (token) window.history.replaceState(null, '', window.location.pathname + window.location.search)
async function submit() {
  busy.value = true; message.value = ''
  try {
    if (route.path === '/account/reset') {
      const result = await cloud.request<{user: User; csrf: string}>('/reset-password', 'POST', { token, password: password.value })
      cloud.csrf = result.csrf
      // Adopt a clean account context through a fresh application bootstrap.
      window.location.assign('/characters')
    } else if (cloud.user) {
      await cloud.flush()
      const result = await cloud.request<{user: User; csrf: string}>('/password', 'POST', { current_password: current.value, password: password.value })
      cloud.csrf = result.csrf
      password.value = ''; current.value = ''; message.value = 'Password changed. Other sessions have been signed out.'
    } else {
      await cloud.authenticate(mode.value, username.value, password.value)
      password.value = ''
      const next = typeof route.query.next === 'string' && /^\/character\/[a-f0-9-]+$/.test(route.query.next) ? route.query.next : '/characters'
      await router.push(next)
    }
  } catch (e) { message.value = e instanceof Error ? e.message : 'Request failed' }
  finally { busy.value = false }
}
async function logout() {
  try { if (await cloud.logout()) await router.push('/account') }
  catch (e) { message.value = (e as Error).message }
}
</script>
<template>
  <section class="cloud-panel max-w-lg" aria-labelledby="account-title">
    <h2 id="account-title">{{ route.path === '/account/reset' ? 'Reset password' : cloud.user ? 'Account: ' + cloud.user.username : 'Welcome to D&D Builder' }}</h2>
    <p>Private character libraries, server autosave, and sharing with your DM.</p>
    <div v-if="!cloud.user && route.path !== '/account/reset'">
      <button @click="mode = 'login'" :aria-pressed="mode === 'login'">Sign in</button>
      <button @click="mode = 'register'" :aria-pressed="mode === 'register'">Register</button>
    </div>
    <form @submit.prevent="submit">
      <label v-if="!cloud.user && route.path !== '/account/reset'">Username (3–32 letters, numbers, underscores or hyphens)
        <input v-model="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_-]+" autocomplete="username">
      </label>
      <label v-if="cloud.user && route.path !== '/account/reset'">Current password
        <input v-model="current" required type="password" maxlength="128" autocomplete="current-password">
      </label>
      <label>{{ cloud.user || route.path === '/account/reset' ? 'New password' : 'Password' }} (8–128 characters)
        <input v-model="password" required type="password" minlength="8" maxlength="128" :autocomplete="cloud.user || mode === 'register' || route.path === '/account/reset' ? 'new-password' : 'current-password'">
      </label>
      <button :disabled="busy || !cloud.ready" type="submit">{{ busy ? 'Please wait…' : route.path === '/account/reset' ? 'Reset password' : cloud.user ? 'Change password' : mode === 'register' ? 'Create account' : 'Sign in' }}</button>
    </form>
    <button v-if="cloud.user" @click="logout" :disabled="busy">Log out and clear private cached data</button>
    <p role="status">{{ message }}</p>
    <p class="mt-4">Forgot your password? Ask the site operator for a single-use reset link. It expires after 30 minutes. No email service is used.</p>
  </section>
</template>
