<template>
  <UModal v-model:open="open" :title="$t('person.new')" :description="$t('person.newText')">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <UForm id="form-person" :state="status" :validate="validate" :validate-on="['change']" @submit="send">
        <PersonFields v-model="status" />
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
      <UButton type="submit" form="form-person" size="lg" :loading="submit" :label="$t('common.create')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { PersonDto } from '~/types/api'
import { personData, validatePerson, type PersonFields } from '~/utils/person'

const emit = defineEmits<{ created: [p: PersonDto] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const people = usePeople()

const empty = (): PersonFields => ({ name: '', surname: '', birthDate: '', email: '', phone: '' })
const status = ref<PersonFields>(empty())
const submit = ref(false)
const error = ref('')

watch(open, (v) => {
  error.value = ''
  if (v) status.value = empty()
})

const validate = (s: PersonFields): FormError[] =>
  validatePerson(s).map(e => ({ name: e.field, message: t(e.key, { min: 1, max: 100 }) }))

async function send() {
  submit.value = true
  error.value = ''
  try {
    const p = await people.create(personData(status.value))
    open.value = false
    emit('created', p)
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
