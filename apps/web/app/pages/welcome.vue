<template>
  <div class="tm-page">
    <div class="space-y-1">
      <h1>{{ $t('welcome.greeting', { name: session.user?.name ?? '' }) }}</h1>
      <p class="text-muted">{{ $t('welcome.text') }}</p>
    </div>

    <section class="space-y-3" aria-labelledby="t-invitations">
      <h2 id="t-invitations" class="tm-section-title">{{ $t('welcome.invitationsTitle') }}</h2>
      <div v-if="loading" class="flex justify-center py-4" role="status" :aria-label="$t('common.loading')">
        <UIcon name="i-tm-loader" class="size-6 animate-spin text-muted" />
      </div>
      <UAlert v-else-if="loadError" color="error" variant="subtle" icon="i-tm-error" :title="loadError" />
      <ul v-else-if="invitations.length" class="space-y-3">
        <li v-for="i in invitations" :key="i.id">
          <UCard>
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-semibold">{{ i.club }}</p>
                <p class="text-sm text-muted">{{ $t(`roles.${i.role}`) }}<template v-if="i.destination"> · {{ i.destination }}</template></p>
              </div>
              <UButton
                :loading="accepting === i.id"
                :disabled="!!accepting"
                :label="$t('welcome.accept')"
                :aria-label="`${$t('welcome.accept')} ${i.club}`"
                @click="acceptInvitation(i.id)"
              />
            </div>
          </UCard>
        </li>
      </ul>
      <p v-else class="text-muted">
        <i18n-t keypath="welcome.noInvitations" tag="span">
          <template #email><strong class="break-all">{{ session.user?.email }}</strong></template>
        </i18n-t>
      </p>
      <UAlert v-if="acceptError" color="error" variant="subtle" icon="i-tm-error" :title="acceptError" />
    </section>

    <UButton
      to="/club/new"
      block
      size="xl"
      icon="i-tm-building"
      :label="$t('welcome.createClub')"
    />

    <USeparator :label="$t('welcome.or')" />

    <section class="space-y-3" aria-labelledby="t-invitation">
      <h2 id="t-invitation" class="tm-section-title">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 text-left"
          :aria-expanded="linkOpen"
          aria-controls="link-invitation"
          @click="linkOpen = !linkOpen"
        >
          {{ $t('welcome.haveLink') }}
          <UIcon :name="linkOpen ? 'i-tm-chevron-up' : 'i-tm-chevron-down'" class="size-5 text-muted" />
        </button>
      </h2>
      <div v-show="linkOpen" id="link-invitation" class="space-y-3">
        <p class="text-muted">
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
      </div>
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
const linkOpen = ref(false)

const { mine, acceptMine } = useInvitations()
const { data, loading, error: loadError, reload } = useLoad(mine)
const invitations = computed(() => data.value ?? [])
const accepting = ref('')
const acceptError = ref('')
// Starts as loading so the list does not flash the "no invitations" text before the first read.
loading.value = true
onMounted(reload)

async function acceptInvitation(id: string) {
  accepting.value = id
  acceptError.value = ''
  try {
    await acceptMine(id)
    await navigateTo('/')
  }
  catch (e) {
    acceptError.value = errorText(e)
    // An invitation that died in the meantime must leave the list.
    if (e instanceof ApiError && e.status === 404) await reload()
  }
  finally {
    accepting.value = ''
  }
}

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
