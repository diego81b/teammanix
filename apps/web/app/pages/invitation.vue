<template>
  <div class="space-y-6">
    <template v-if="!token">
      <div class="flex size-14 items-center justify-center rounded-full bg-error/10 text-error">
        <UIcon name="i-tm-error" class="size-7" />
      </div>
      <div class="space-y-2">
        <h1 class="text-2xl font-bold">{{ $t('invitation.linkNotValidTitle') }}</h1>
        <p class="text-muted">{{ $t('invitation.linkNotValidText') }}</p>
      </div>
      <UButton to="/" block size="xl" color="neutral" variant="outline" :label="$t('common.goToHome')" />
    </template>

    <div v-else-if="loading" class="flex justify-center py-10" role="status" :aria-label="$t('common.loading')">
      <UIcon name="i-tm-loader" class="size-8 animate-spin text-muted" />
    </div>

    <template v-else-if="notValid">
      <div class="flex size-14 items-center justify-center rounded-full bg-error/10 text-error">
        <UIcon name="i-tm-error" class="size-7" />
      </div>
      <div class="space-y-2">
        <h1 class="text-2xl font-bold">{{ $t('invitation.notValidTitle') }}</h1>
        <p class="text-muted">
          {{ $t('invitation.notValidText') }}
        </p>
      </div>
      <UButton to="/" block size="xl" color="neutral" variant="outline" :label="$t('common.goToHome')" @click="discard" />
    </template>

    <template v-else-if="!session.authenticated">
      <div class="space-y-2">
        <h1 class="text-2xl font-bold">{{ title }}</h1>
        <p class="text-muted">
          {{ $t('invitation.signInOrCreate') }}
        </p>
      </div>
      <div class="space-y-3">
        <UButton to="/login" block size="xl" :label="$t('common.login')" />
        <UButton to="/registration" block size="xl" color="neutral" variant="outline" :label="$t('invitation.createAccount')" />
      </div>
    </template>

    <template v-else>
      <div class="space-y-2">
        <h1 class="text-2xl font-bold">{{ title }}</h1>
        <p class="text-muted">
          <i18n-t keypath="invitation.loginComeText" tag="span">
            <template #email><strong class="break-all">{{ session.user?.email }}</strong></template>
          </i18n-t>
          {{ $t('invitation.onlyThisAddress') }}
        </p>
      </div>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
        <template v-if="errorCode === 'INVALID_INVITATION'" #description>
          {{ $t('invitation.errorDescription') }}
        </template>
      </UAlert>
      <UButton block size="xl" :loading="submit" :label="$t('invitation.accept')" @click="accept" />
      <p class="text-center text-sm">
        <button type="button" class="text-muted underline underline-offset-2" @click="changeAccount">{{ $t('invitation.otherAccount') }}</button>
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { PreviewInvitation, SessionDto } from '~/types/api'

definePageMeta({ layout: 'auth' })
const { t } = useI18n()
useHead({ title: () => `${t('invitation.title')} · TeamManix` })
const { apply } = useLanguage()

const api = useApi()
const session = useSessionStore()
const route = useRoute()

const token = ref('')
const preview = ref<PreviewInvitation | null>(null)
const loading = ref(true)
const notValid = ref(false)
const submit = ref(false)
const error = ref('')
/** API `codice` behind the error, to choose the help text without comparing sentences. */
const errorCode = ref('')

const title = computed(() => {
  const a = preview.value
  if (!a) return t('invitation.generic')
  const p = { club: a.club, role: t(`roles.${a.role}`), destination: a.destination ?? '' }
  return a.destination ? t('invitation.withDestination', p) : t('invitation.withClub', p)
})

// The token comes from the URL (link in the email) or from localStorage (after registration and login).
onMounted(async () => {
  const fromLink = typeof route.query.token === 'string' ? route.query.token : ''
  if (fromLink) pendingInvitation.save(fromLink)
  token.value = fromLink || pendingInvitation.read() || ''
  if (!token.value) {
    loading.value = false
    return
  }
  try {
    preview.value = await api<PreviewInvitation>(`/invitations/preview?token=${encodeURIComponent(token.value)}`)
    // Whoever has not yet chosen a language sees the invitation in the one chosen by the sender, without fixing it as their preference.
    if (!session.authenticated && !languageSaved()) await apply(preview.value.language, false)
  }
  catch (e) {
    // Only the 404 says the invitation is dead. Network or rate limit do not delete anything:
    // the page stays usable with the generic title and the acceptance gives the real error.
    if (e instanceof ApiError && e.status === 404) {
      notValid.value = true
      pendingInvitation.remove()
    }
  }
  finally {
    loading.value = false
  }
})

/** Dead invitation: the saved token must not bring back here at every access. */
function discard() {
  pendingInvitation.remove()
}

async function accept() {
  submit.value = true
  error.value = ''
  errorCode.value = ''
  try {
    const dto = await api<SessionDto>('/invitations/accept', { body: { token: token.value } })
    pendingInvitation.remove()
    session.set(dto)
    await navigateTo('/')
  }
  catch (e) {
    error.value = errorText(e)
    errorCode.value = e instanceof ApiError ? (e.code ?? '') : ''
  }
  finally {
    submit.value = false
  }
}

async function changeAccount() {
  // The token stays saved: after the new login we resume from here.
  session.clear()
  await navigateTo('/login')
}
</script>
