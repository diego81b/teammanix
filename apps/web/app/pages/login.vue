<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">{{ $t('login.title') }}</h1>

    <UAlert
      v-if="verifyRequest"
      color="warning"
      variant="subtle"
      icon="i-tm-warning"
      :title="$t('login.verifyTitle')"
    >
      <template #actions>
        <UButton
          :to="{ path: '/check-email', query: { email: status.email } }"
          color="warning"
          variant="outline"
          size="sm"
          :label="$t('common.requestNewLink')"
        />
      </template>
    </UAlert>
    <UAlert v-else-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" />

    <UForm :state="status" :validate="validate" :validate-on="['change']" class="space-y-5" @submit="send">
      <UFormField name="email" :label="$t('login.email')" required>
        <UInput v-model="status.email" type="email" autocomplete="email" size="xl" class="w-full" autofocus />
      </UFormField>
      <UFormField name="password" :label="$t('login.password')" required>
        <PasswordInput v-model="status.password" autocomplete="current-password" />
      </UFormField>
      <div class="text-right text-sm">
        <NuxtLink to="/password-forgotten" class="text-primary underline underline-offset-2">{{ $t('login.forgotten') }}</NuxtLink>
      </div>
      <UButton type="submit" block size="xl" :loading="submit" :label="$t('common.login')" />
    </UForm>

    <p class="text-center text-sm text-muted">
      {{ $t('login.withoutAccount') }}
      <NuxtLink to="/registration" class="font-semibold text-primary underline underline-offset-2">{{ $t('login.registered') }}</NuxtLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { SessionDto } from '~/types/api'

definePageMeta({ layout: 'auth' })
const { t } = useI18n()
useHead({ title: () => `${t('login.title')} · TeamManix` })

const api = useApi()
const session = useSessionStore()
const route = useRoute()

const status = reactive({ email: '', password: '' })
const submit = ref(false)
const error = ref('')
const verifyRequest = ref(false)

function validate(s: typeof status): FormError[] {
  const err: FormError[] = []
  if (!s.email.trim()) err.push({ name: 'email', message: t('validation.personalEmail') })
  if (!s.password) err.push({ name: 'password', message: t('validation.password') })
  return err
}

async function send() {
  submit.value = true
  error.value = ''
  verifyRequest.value = false
  try {
    const dto = await api<SessionDto>('/auth/login', {
      body: { email: status.email.trim().toLowerCase(), password: status.password },
    })
    session.set(dto)
    // With a pending invitation we continue from there, otherwise where the user wanted to go.
    if (pendingInvitation.read()) return await navigateTo('/invitation')
    await navigateTo(internalPath(route.query.redirect) ?? '/')
  }
  catch (e) {
    if (e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED') verifyRequest.value = true
    // Same message for every cause (nonexistent account, wrong password, deactivated): no enumeration.
    else if (e instanceof ApiError && e.status === 401) error.value = t('errors.codes.INVALID_CREDENTIALS')
    else error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
