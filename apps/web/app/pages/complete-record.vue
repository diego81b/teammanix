<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-bold">{{ $t('completeRecord.heading') }}</h1>
      <p class="text-sm text-muted">
        {{ $t('completeRecord.text', { club: session.active?.name ?? '' }) }}
      </p>
    </div>

    <div v-if="loading" class="flex justify-center py-6" role="status" :aria-label="$t('common.loading')">
      <UIcon name="i-tm-loader" class="size-8 animate-spin text-primary" />
    </div>

    <template v-else>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" />

      <UForm :state="status" :validate="validate" :validate-on="['change']" class="space-y-5" @submit="send">
        <UFormField name="name" :label="$t('completeRecord.name')">
          <UInput :model-value="name" size="xl" class="w-full" disabled />
        </UFormField>
        <UFormField name="surname" :label="$t('completeRecord.surname')" required>
          <UInput v-model="status.surname" autocomplete="family-name" size="xl" class="w-full" />
        </UFormField>
        <UFormField name="birthDate" :label="$t('completeRecord.birthDate')" required>
          <UInput v-model="status.birthDate" type="date" autocomplete="bday" :max="today" min="1900-01-01" size="xl" class="w-full" />
        </UFormField>
        <UFormField name="phone" :label="$t('completeRecord.phone')" :hint="$t('common.optional')">
          <UInput v-model="status.phone" type="tel" autocomplete="tel" size="xl" class="w-full" />
        </UFormField>
        <UButton type="submit" block size="xl" :loading="submit" :label="$t('completeRecord.save')" />
      </UForm>
    </template>

    <p class="text-center text-sm">
      <NuxtLink to="/select-club" class="text-muted underline underline-offset-2">{{ $t('common.changeClub') }}</NuxtLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { RecordDto } from '~/types/api'

definePageMeta({ layout: 'auth' })
const { t } = useI18n()
useHead({ title: () => `${t('completeRecord.title')} · TeamManix` })

const api = useApi()
const session = useSessionStore()

const status = reactive({ surname: '', birthDate: '', phone: '' })
const name = ref('')
const loading = ref(true)
const submit = ref(false)
const error = ref('')
const today = new Date().toISOString().slice(0, 10)

onMounted(async () => {
  try {
    const s = await api<RecordDto>('/people/me')
    name.value = s.name
    status.surname = s.surname ?? ''
    status.birthDate = s.birthDate ?? ''
    status.phone = s.phone ?? ''
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    loading.value = false
  }
})

function validate(s: typeof status): FormError[] {
  const err: FormError[] = []
  if (!s.surname.trim()) err.push({ name: 'surname', message: t('completeRecord.enterSurname') })
  if (!s.birthDate) err.push({ name: 'birthDate', message: t('completeRecord.enterData') })
  else if (s.birthDate > today) err.push({ name: 'birthDate', message: t('completeRecord.futureDate') })
  else if (s.birthDate < '1900-01-01') err.push({ name: 'birthDate', message: t('completeRecord.invalidDate') })
  const tel = s.phone.trim()
  if (tel && (tel.length < 5 || tel.length > 30)) err.push({ name: 'phone', message: t('completeRecord.phoneNotValid') })
  return err
}

async function send() {
  submit.value = true
  error.value = ''
  try {
    const tel = status.phone.trim()
    await api<RecordDto>('/people/me', {
      method: 'PATCH',
      body: { surname: status.surname.trim(), birthDate: status.birthDate, ...(tel ? { phone: tel } : {}) },
    })
    await session.refresh()
    await navigateTo('/')
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
