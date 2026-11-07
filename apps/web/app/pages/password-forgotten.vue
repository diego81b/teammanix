<template>
  <div class="space-y-6">
    <template v-if="sent">
      <div class="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <UIcon name="i-tm-mail" class="size-7" />
      </div>
      <div class="space-y-2">
        <h1 class="text-2xl font-bold">{{ $t('checkEmail.title') }}</h1>
        <p class="text-muted">{{ $t('neutral') }}</p>
        <p class="text-sm text-muted">{{ $t('passwordForgotten.validity') }}</p>
      </div>
    </template>

    <template v-else>
      <div class="space-y-1">
        <h1 class="text-2xl font-bold">{{ $t('passwordForgotten.title') }}</h1>
        <p class="text-sm text-muted">{{ $t('passwordForgotten.text') }}</p>
      </div>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" />
      <UForm :state="status" :validate="validate" :validate-on="['change']" class="space-y-5" @submit="send">
        <UFormField name="email" :label="$t('login.email')" required>
          <UInput v-model="status.email" type="email" autocomplete="email" size="xl" class="w-full" autofocus />
        </UFormField>
        <UButton type="submit" block size="xl" :loading="submit" :label="$t('passwordForgotten.send')" />
      </UForm>
    </template>

    <p class="text-center text-sm">
      <NuxtLink to="/login" class="font-semibold text-primary underline underline-offset-2">{{ $t('common.backToLogin') }}</NuxtLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
const { t } = useI18n()
useHead({ title: () => `${t('passwordForgotten.title')} · TeamManix` })

const api = useApi()
const status = reactive({ email: '' })
const submit = ref(false)
const sent = ref(false)
const error = ref('')

function validate(s: typeof status): FormError[] {
  return /^\S+@\S+\.\S+$/.test(s.email.trim()) ? [] : [{ name: 'email', message: t('validation.email') }]
}

async function send() {
  submit.value = true
  error.value = ''
  try {
    await api('/auth/password-forgotten', { body: { email: status.email.trim().toLowerCase() } })
    sent.value = true
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
