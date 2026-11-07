<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-bold">{{ $t('newClub.heading') }}</h1>
      <p class="text-sm text-muted">{{ $t('newClub.text') }}</p>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" />

    <UForm :state="status" :validate="validate" :validate-on="['change']" class="space-y-5" @submit="send">
      <UFormField name="name" :label="$t('newClub.name')" required>
        <UInput v-model="status.name" size="xl" class="w-full" autofocus :placeholder="$t('newClub.placeholderName')" />
      </UFormField>
      <UFormField name="acceptDpa">
        <UCheckbox v-model="status.acceptDpa" size="lg">
          <template #label>
            <span class="text-sm">
              {{ $t('newClub.acceptDpa') }}
              <NuxtLink to="/dpa" target="_blank" class="text-primary underline underline-offset-2" @click.stop>{{ $t('newClub.dpaLink') }}</NuxtLink>.
              {{ $t('newClub.dpaRest') }}
            </span>
          </template>
        </UCheckbox>
      </UFormField>
      <UButton type="submit" block size="xl" :loading="submit" :label="$t('newClub.create')" />
    </UForm>

    <p class="text-center text-sm">
      <NuxtLink :to="back" class="text-muted underline underline-offset-2">{{ $t('common.back') }}</NuxtLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { SessionDto } from '~/types/api'

definePageMeta({ layout: 'auth' })
const { t } = useI18n()
useHead({ title: () => `${t('newClub.title')} · TeamManix` })

const api = useApi()
const session = useSessionStore()
const status = reactive({ name: '', acceptDpa: false })
const submit = ref(false)
const error = ref('')
const back = computed(() => (session.memberships.length ? '/select-club' : '/welcome'))

function validate(s: typeof status): FormError[] {
  const err: FormError[] = []
  const n = s.name.trim().length
  if (n < 2 || n > 200) err.push({ name: 'name', message: t('newClub.nameLength') })
  if (!s.acceptDpa) err.push({ name: 'acceptDpa', message: t('newClub.dpaObligation') })
  return err
}

async function send() {
  submit.value = true
  error.value = ''
  try {
    session.set(await api<SessionDto>('/club', { body: { name: status.name.trim(), acceptDpa: true } }))
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
