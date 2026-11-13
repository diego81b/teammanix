<template>
  <UModal v-model:open="open" :title="$t('teamRoster.expected.title')" :description="row ? fullName(row) : ''">
    <template #body>
      <p class="mb-4 text-sm text-muted">{{ $t('teamRoster.expected.intro') }}</p>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <UForm id="form-expected-injury" :state="form" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="save">
        <UFormField name="startDate" :label="$t('teamRoster.expected.start')" required>
          <UInput v-model="form.startDate" type="date" size="xl" class="w-full" />
        </UFormField>
        <UFormField name="returnDate" :label="$t('teamRoster.expected.return')" :hint="$t('teamRoster.expected.returnHint')" required>
          <UInput v-model="form.returnDate" type="date" size="xl" class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        v-if="current"
        color="error"
        variant="ghost"
        size="lg"
        class="mr-auto"
        :loading="busy === 'end'"
        :label="$t('teamRoster.expected.end')"
        @click="end"
      />
      <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
      <UButton type="submit" form="form-expected-injury" size="lg" :loading="busy === 'save'" :label="$t('common.save')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { ExpectedPeriod, RosterRow } from '~/types/api'
import { todayDay } from '~/utils/calendar'
import { checkExpected, fullName } from '~/utils/roster'

const props = defineProps<{ row: (RosterRow & { expectedInjury: ExpectedPeriod | null }) | null }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const people = usePeople()

const form = reactive<ExpectedPeriod>({ startDate: '', returnDate: '' })
const busy = ref<'' | 'save' | 'end'>('')
const error = ref('')
const current = computed(() => props.row?.expectedInjury ?? null)

watch(open, (v) => {
  error.value = ''
  if (v) Object.assign(form, current.value ?? { startDate: todayDay(), returnDate: '' })
})

function validate(s: ExpectedPeriod): FormError[] {
  const v = checkExpected(s)
  if (v === 'required') return [{ name: s.startDate ? 'returnDate' : 'startDate', message: t('validation.data') }]
  if (v === 'returnAfterStart') return [{ name: 'returnDate', message: t('teamRoster.expected.returnAfterStart') }]
  return []
}

async function run(kind: 'save' | 'end', call: () => Promise<unknown>) {
  if (!props.row) return
  busy.value = kind
  error.value = ''
  try {
    await call()
    open.value = false
    emit('saved')
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    busy.value = ''
  }
}

const save = () => run('save', () => people.setExpectedInjury(props.row!.id, { ...form }))
const end = () => run('end', () => people.endExpectedInjury(props.row!.id))
</script>
