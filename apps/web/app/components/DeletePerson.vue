<template>
  <UModal v-model:open="open" :title="$t('archive.deleteTitle', { name: person?.name ?? '' })">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <div class="space-y-3 text-sm">
        <p>{{ $t('archive.deleteText') }}</p>
        <ul class="list-disc space-y-1 pl-5 text-muted">
          <li>{{ $t('archive.deleteEffect1') }}</li>
          <li>{{ $t('archive.deleteEffect2') }}</li>
          <li>{{ $t('archive.deleteEffect3') }}</li>
        </ul>
        <UCheckbox v-model="understood" size="lg" :label="$t('archive.deleteConfirm')" />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
        <UButton
          color="error"
          size="lg"
          :loading="submitting"
          :disabled="!understood || submitting"
          :label="$t('archive.deleteForGood')"
          @click="remove"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{ person: { id: string, name: string } | null }>()
const emit = defineEmits<{ done: [] }>()
const open = defineModel<boolean>('open', { default: false })
const people = usePeople()
const toast = useToast()
const { t } = useI18n()

const submitting = ref(false)
const understood = ref(false)
const error = ref('')
watch(open, () => {
  error.value = ''
  understood.value = false
})

async function remove() {
  if (!props.person) return
  submitting.value = true
  error.value = ''
  try {
    await people.remove(props.person.id)
    toast.add({ title: t('archive.deleted'), color: 'success' })
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
