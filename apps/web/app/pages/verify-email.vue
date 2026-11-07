<template>
  <div class="space-y-6">
    <div v-if="phase === 'waiting'" class="flex flex-col items-center gap-4 py-6" role="status">
      <UIcon name="i-tm-loader" class="size-8 animate-spin text-primary" />
      <p class="text-muted">{{ $t('verifyEmail.ongoing') }}</p>
    </div>

    <template v-else-if="phase === 'ok'">
      <div class="flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
        <UIcon name="i-tm-check-circle" class="size-7" />
      </div>
      <div class="space-y-2">
        <h1 class="text-2xl font-bold">{{ $t('verifyEmail.okTitle') }}</h1>
        <p class="text-muted">{{ $t('verifyEmail.okText') }}</p>
      </div>
      <UButton to="/login" block size="xl" :label="$t('common.login')" />
    </template>

    <template v-else>
      <div class="flex size-14 items-center justify-center rounded-full bg-error/10 text-error">
        <UIcon name="i-tm-error" class="size-7" />
      </div>
      <div class="space-y-2">
        <h1 class="text-2xl font-bold">{{ $t('verifyEmail.errorTitle') }}</h1>
        <p class="text-muted">{{ error || $t('verifyEmail.textError') }}</p>
      </div>
      <UButton to="/check-email" block size="xl" :label="$t('common.requestNewLink')" />
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const { t } = useI18n()
useHead({ title: () => `${t('verifyEmail.title')} · TeamManix` })

const api = useApi()
const route = useRoute()
const phase = ref<'waiting' | 'ok' | 'error'>('waiting')
/** Empty = standard invalid-link text; otherwise the error (network, limit) already translated. */
const error = ref('')

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  if (!token) {
    phase.value = 'error'
    return
  }
  try {
    await api('/auth/verify-email', { body: { token } })
    phase.value = 'ok'
  }
  catch (e) {
    if (!(e instanceof ApiError) || e.status !== 400) error.value = errorText(e)
    phase.value = 'error'
  }
})
</script>
