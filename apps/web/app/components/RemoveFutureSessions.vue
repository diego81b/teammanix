<template>
  <UModal v-model:open="open" :title="$t('events.removeFuture.title')">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <p v-if="loading" class="text-sm text-muted" role="status">{{ $t('events.removeFuture.loading') }}</p>
      <p v-else-if="removal" class="text-sm">{{ removalMessage(removal, (key, params) => t(key, params ?? {})) }}</p>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton color="neutral" variant="outline" size="lg" :label="$t('common.back')" @click="open = false" />
        <UButton
          color="error"
          size="lg"
          :loading="removing"
          :disabled="!canConfirmRemoval(removal) || removing"
          :label="$t('events.removeFuture.confirm')"
          @click="remove"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { SeriesRemovalDto } from '~/types/api'
import { canConfirmRemoval, removalMessage } from '~/utils/series'

const props = defineProps<{ seriesId: string | null }>()
const emit = defineEmits<{ removed: [] }>()
const open = defineModel<boolean>('open', { default: false })
const events = useEvents()
const toast = useToast()
const { t } = useI18n()

const removal = ref<SeriesRemovalDto | null>(null)
const loading = ref(false)
const removing = ref(false)
const error = ref('')

/** The numbers come from the API each time the modal opens: they change with the clock and with the attendance checks. */
watch(open, async (isOpen) => {
  removal.value = null
  error.value = ''
  if (!isOpen || !props.seriesId) return
  loading.value = true
  try {
    removal.value = await events.removalPreview(props.seriesId)
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    loading.value = false
  }
})

async function remove() {
  if (!props.seriesId || !canConfirmRemoval(removal.value)) return
  removing.value = true
  error.value = ''
  try {
    await events.removeFuture(props.seriesId)
    toast.add({ title: t('events.removeFuture.done'), color: 'success' })
    open.value = false
    emit('removed')
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    removing.value = false
  }
}
</script>
