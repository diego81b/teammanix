<template>
  <UModal v-model:open="open" :title="$t('person.disableTitle', { name: person?.name ?? '' })">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <div class="space-y-3 text-sm">
        <p>{{ $t('person.disableText') }}</p>
        <ul class="list-disc space-y-1 pl-5 text-muted">
          <li>{{ $t('person.disableEffect1') }}</li>
          <li>{{ $t('person.disableEffect2') }}</li>
          <li>{{ $t('person.disableEffect3') }}</li>
        </ul>
        <p v-if="enrollment" class="rounded-md bg-muted p-3">
          {{ $t('person.alternative', { team: enrollment.team }) }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
        <UButton
          v-if="enrollment"
          color="neutral"
          variant="soft"
          size="lg"
          :loading="submit === 'close'"
          :disabled="submit !== null"
          :label="$t('person.closeOnlyEnrollment')"
          @click="closeEnrollment"
        />
        <UButton
          color="error"
          size="lg"
          :loading="submit === 'disable'"
          :disabled="submit !== null"
          :label="$t('person.disable')"
          @click="disable"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  person: { id: string, name: string } | null
  /** If the modal opens from the roster: the alternative is to close only that enrollment. */
  enrollment?: { id: string, team: string } | null
}>()
const emit = defineEmits<{ done: [] }>()
const open = defineModel<boolean>('open', { default: false })
const people = usePeople()
const toast = useToast()
const { t } = useI18n()

const submit = ref<null | 'disable' | 'close'>(null)
const error = ref('')
watch(open, () => (error.value = ''))

async function run(type: 'disable' | 'close', action: () => Promise<unknown>, message: string) {
  submit.value = type
  error.value = ''
  try {
    await action()
    toast.add({ title: message, color: 'success' })
    open.value = false
    emit('done')
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = null
  }
}

const disable = () => props.person && run('disable', () => people.disable(props.person!.id), t('person.disabled'))
const closeEnrollment = () => props.enrollment && run('close', () => people.closeEnrollment(props.enrollment!.id), t('person.closedEnrollment'))
</script>
