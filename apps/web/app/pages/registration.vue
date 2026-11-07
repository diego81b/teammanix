<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-bold">{{ $t('registration.title') }}</h1>
      <p v-if="hasInvitation" class="text-sm text-muted">
        {{ $t('registration.invitationInSuspended') }}
      </p>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" />

    <UForm :state="status" :validate="validate" :validate-on="['change']" class="space-y-5" @submit="send">
      <div class="grid gap-5 sm:grid-cols-2">
        <UFormField name="name" :label="$t('registration.name')" required>
          <UInput v-model="status.name" autocomplete="given-name" size="xl" class="w-full" />
        </UFormField>
        <UFormField name="surname" :label="$t('registration.surname')" required>
          <UInput v-model="status.surname" autocomplete="family-name" size="xl" class="w-full" />
        </UFormField>
      </div>
      <UFormField name="email" :label="$t('registration.email')" required>
        <UInput v-model="status.email" type="email" autocomplete="email" size="xl" class="w-full" />
      </UFormField>
      <UFormField name="password" :label="$t('registration.password')" :hint="$t('registration.passwordHint')" required>
        <PasswordInput v-model="status.password" autocomplete="new-password" />
      </UFormField>
      <UFormField name="acceptTerms">
        <UCheckbox v-model="status.acceptTerms" size="lg">
          <template #label>
            <span class="text-sm">
              {{ $t('registration.accept') }}
              <NuxtLink to="/terms" target="_blank" class="text-primary underline underline-offset-2" @click.stop>{{ $t('registration.terms') }}</NuxtLink>
              {{ $t('registration.e') }}
              <NuxtLink to="/privacy" target="_blank" class="text-primary underline underline-offset-2" @click.stop>{{ $t('registration.notice') }}</NuxtLink>
            </span>
          </template>
        </UCheckbox>
      </UFormField>
      <UButton type="submit" block size="xl" :loading="submit" :label="$t('registration.send')" />
    </UForm>

    <p class="text-center text-sm text-muted">
      {{ $t('registration.alreadyAccount') }}
      <NuxtLink to="/login" class="font-semibold text-primary underline underline-offset-2">{{ $t('common.login') }}</NuxtLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
const { t, locale } = useI18n()
useHead({ title: () => `${t('registration.title')} · TeamManix` })

const api = useApi()
const hasInvitation = ref(false)
onMounted(() => { hasInvitation.value = !!pendingInvitation.read() })

const status = reactive({ name: '', surname: '', email: '', password: '', acceptTerms: false })
const submit = ref(false)
const error = ref('')

function validate(s: typeof status): FormError[] {
  const err: FormError[] = []
  if (!s.name.trim()) err.push({ name: 'name', message: t('registration.enterName') })
  if (!s.surname.trim()) err.push({ name: 'surname', message: t('registration.enterSurname') })
  if (!/^\S+@\S+\.\S+$/.test(s.email.trim())) err.push({ name: 'email', message: t('validation.email') })
  if (s.password.length < 10) err.push({ name: 'password', message: t('validation.passwordLong') })
  if (!s.acceptTerms) err.push({ name: 'acceptTerms', message: t('registration.acceptObligation') })
  return err
}

async function send() {
  submit.value = true
  error.value = ''
  try {
    const email = status.email.trim().toLowerCase()
    await api('/auth/registration', {
      body: {
        email,
        password: status.password,
        name: status.name.trim(),
        surname: status.surname.trim(),
        acceptTerms: true,
        language: locale.value,
      },
    })
    // Neutral response: it also applies if the email was already registered. We do not reveal it.
    await navigateTo({ path: '/check-email', query: { email } })
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
