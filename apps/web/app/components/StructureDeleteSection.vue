<template>
  <UModal v-model:open="open" :title="$t('structure.deleteSectionTitle', { name: section?.name ?? '' })">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <p class="text-sm">{{ $t(`structure.unit.${term}.deleteSectionText`) }}</p>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
        <UButton color="error" size="lg" :loading="submitting" :disabled="submitting" :label="$t('common.delete')" @click="remove" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { SectionDto, UnitTerm } from '~/types/api'

const props = defineProps<{ term: UnitTerm, section: SectionDto | null }>()
const emit = defineEmits<{ done: [] }>()
const open = defineModel<boolean>('open', { default: false })
const structure = useStructure()

const submitting = ref(false)
const error = ref('')
watch(open, () => {
  error.value = ''
})

async function remove() {
  if (!props.section) return
  submitting.value = true
  error.value = ''
  try {
    await structure.removeSection(props.section.id)
    open.value = false
    emit('done')
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submitting.value = false
  }
}
</script>
