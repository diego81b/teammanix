<template>
  <div class="space-y-6">
    <template v-if="done">
      <div class="flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
        <UIcon name="i-tm-check-circle" class="size-7" />
      </div>
      <div class="space-y-2">
        <h1 class="text-2xl font-bold">{{ $t('reset.okTitle') }}</h1>
        <p class="text-muted">{{ $t('reset.okText') }}</p>
      </div>
      <UButton to="/login" block size="xl" :label="$t('common.login')" />
    </template>

    <template v-else-if="!token || expired">
      <div class="flex size-14 items-center justify-center rounded-full bg-error/10 text-error">
        <UIcon name="i-tm-error" class="size-7" />
      </div>
      <div class="space-y-2">
        <h1 class="text-2xl font-bold">{{ $t('reset.errorTitle') }}</h1>
        <p class="text-muted">{{ $t('reset.textError') }}</p>
      </div>
      <UButton to="/password-forgotten" block size="xl" :label="$t('common.requestNewLink')" />
    </template>

    <template v-else>
      <h1 class="text-2xl font-bold">{{ $t('reset.choose') }}</h1>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" />
      <UForm :state="status" :validate="validate" :validate-on="['change']" class="space-y-5" @submit="send">
        <UFormField name="password" :label="$t('reset.new')" :hint="$t('registration.passwordHint')" required>
          <PasswordInput v-model="status.password" autocomplete="new-password" />
        </UFormField>
        <UFormField name="confirm" :label="$t('reset.repeat')" required>
          <PasswordInput v-model="status.confirm" autocomplete="new-password" />
        </UFormField>
        <UButton type="submit" block size="xl" :loading="submit" :label="$t('reset.save')" />
      </UForm>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
const { t } = useI18n()
useHead({ title: () => `${t('reset.title')} · TeamManix` })

const api = useApi()
const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const status = reactive({ password: '', confirm: '' })
const submit = ref(false)
const done = ref(false)
const expired = ref(false)
const error = ref('')

function validate(s: typeof status): FormError[] {
  const err: FormError[] = []
  if (s.password.length < 10) err.push({ name: 'password', message: t('validation.passwordLong') })
  if (s.confirm !== s.password) err.push({ name: 'confirm', message: t('validation.passwordDifferent') })
  return err
}

async function send() {
  submit.value = true
  error.value = ''
  try {
    await api('/auth/reset-password', { body: { token: token.value, password: status.password } })
    done.value = true
  }
  catch (e) {
    // 400 = invalid or already used link: the dedicated error page explains what to do.
    if (e instanceof ApiError && e.code === 'INVALID_LINK') expired.value = true
    else error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
