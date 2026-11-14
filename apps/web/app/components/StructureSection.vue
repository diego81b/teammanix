<template>
  <UModal
    v-model:open="open"
    :title="section ? $t('structure.renameSection') : $t('structure.newSection')"
    :description="$t(`structure.unit.${term}.newSectionText`)"
  >
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <UForm id="form-section" :state="status" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="send">
        <UFormField name="name" :label="$t('structure.sectionName')" required>
          <UInput v-model="status.name" size="xl" class="w-full" autofocus :placeholder="$t('structure.sectionNameExample')" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
      <UButton type="submit" form="form-section" size="lg" :loading="submit" :label="section ? $t('common.save') : $t('common.create')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { SectionDto, UnitTerm } from '~/types/api'

/** Creates a section, or renames the one passed in. */
const props = defineProps<{ term: UnitTerm, section: SectionDto | null }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const structure = useStructure()

const status = reactive({ name: '' })
const submit = ref(false)
const error = ref('')

watch(open, (v) => {
  if (v) status.name = props.section?.name ?? ''
  error.value = ''
})

function validate(s: typeof status): FormError[] {
  const n = s.name.trim().length
  return n < 1 || n > 100 ? [{ name: 'name', message: t('validation.length', { min: 1, max: 100 }) }] : []
}

async function send() {
  submit.value = true
  error.value = ''
  try {
    const name = status.name.trim()
    if (props.section) await structure.editSection(props.section.id, { name })
    else await structure.createSection({ name })
    open.value = false
    emit('saved')
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
