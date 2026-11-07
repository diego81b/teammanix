<template>
  <div class="space-y-6">
    <div class="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
      <UIcon name="i-tm-mail" class="size-7" />
    </div>

    <div class="space-y-2">
      <h1 class="text-2xl font-bold">{{ $t('checkEmail.title') }}</h1>
      <p class="text-muted">{{ $t('neutral') }}</p>
      <p v-if="email" class="text-sm">{{ $t('checkEmail.address') }}: <strong class="break-all">{{ email }}</strong></p>
      <p class="text-sm text-muted">{{ $t('checkEmail.instructions') }}</p>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" />
    <UAlert v-else-if="sent" color="success" variant="subtle" icon="i-tm-check-circle" :title="$t('neutral')" />

    <UForm v-if="!email" :state="status" :validate="validate" :validate-on="['change']" class="space-y-5" @submit="send">
      <UFormField name="email" :label="$t('checkEmail.email')">
        <UInput v-model="status.email" type="email" autocomplete="email" size="xl" class="w-full" />
      </UFormField>
      <UButton type="submit" block size="xl" :loading="submit" :disabled="waiting > 0" :label="label" />
    </UForm>
    <UButton
      v-else
      block
      size="xl"
      color="neutral"
      variant="outline"
      :loading="submit"
      :disabled="waiting > 0"
      :label="label"
      @click="send"
    />

    <p class="text-center text-sm">
      <NuxtLink to="/login" class="font-semibold text-primary underline underline-offset-2">{{ $t('common.backToLogin') }}</NuxtLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
const { t } = useI18n()
useHead({ title: () => `${t('checkEmail.title')} · TeamManix` })

const WAITING_S = 60

const api = useApi()
const route = useRoute()
const email = computed(() => (typeof route.query.email === 'string' ? route.query.email : ''))
const status = reactive({ email: '' })
const submit = ref(false)
const sent = ref(false)
const error = ref('')
const waiting = ref(0)
let timer: ReturnType<typeof setInterval> | undefined

const label = computed(() => (waiting.value > 0 ? t('checkEmail.resendBetween', { seconds: waiting.value }) : t('checkEmail.resend')))

function validate(s: typeof status): FormError[] {
  return /^\S+@\S+\.\S+$/.test(s.email.trim()) ? [] : [{ name: 'email', message: t('validation.email') }]
}

async function send() {
  const a = (email.value || status.email).trim().toLowerCase()
  submit.value = true
  error.value = ''
  sent.value = false
  try {
    await api('/auth/resend-verify', { body: { email: a } })
    sent.value = true
    waiting.value = WAITING_S
    clearInterval(timer)
    timer = setInterval(() => {
      waiting.value -= 1
      if (waiting.value <= 0) clearInterval(timer)
    }, 1000)
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}

onBeforeUnmount(() => clearInterval(timer))
</script>
