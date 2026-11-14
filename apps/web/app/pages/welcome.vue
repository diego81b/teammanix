<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-bold">{{ $t('welcome.greeting', { name: session.user?.name ?? '' }) }}</h1>
      <p class="text-muted">{{ $t('welcome.text') }}</p>
    </div>

    <UButton
      to="/club/new"
      block
      size="xl"
      icon="i-tm-building"
      :label="$t('welcome.createClub')"
    />

    <USeparator :label="$t('welcome.or')" />

    <section class="space-y-3" aria-labelledby="t-invitation">
      <h2 id="t-invitation" class="text-base font-semibold">{{ $t('welcome.hasInvitation') }}</h2>
      <p class="text-sm text-muted">
        {{ $t('welcome.hasInvitationText') }}
      </p>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" />
      <form class="flex gap-2" @submit.prevent="openInvitation">
        <UInput
          v-model="link"
          :placeholder="$t('welcome.linkInvitation')"
          :aria-label="$t('welcome.linkInvitation')"
          size="xl"
          class="min-w-0 flex-1"
        />
        <UButton type="submit" color="neutral" variant="outline" size="xl" :label="$t('welcome.open')" />
      </form>
    </section>

    <p class="text-center text-sm">
      <button type="button" class="text-muted underline underline-offset-2" @click="logout">{{ $t('common.logout') }}</button>
    </p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const { t } = useI18n()
useHead({ title: () => `${t('welcome.title')} · TeamManix` })

const session = useSessionStore()
const link = ref('')
const error = ref('')

/** Accepts the full link or just the token. */
function extractToken(text: string): string {
  const t = text.trim()
  if (!t) return ''
  try {
    return new URL(t).searchParams.get('token') ?? ''
  }
  catch {
    return /^[\w.~-]{16,}$/.test(t) ? t : ''
  }
}

async function openInvitation() {
  const token = extractToken(link.value)
  if (!token) {
    error.value = t('welcome.linkNotDetected')
    return
  }
  error.value = ''
  await navigateTo({ path: '/invitation', query: { token } })
}

async function logout() {
  session.clear()
  await navigateTo('/login')
}
</script>
