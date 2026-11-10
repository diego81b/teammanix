<template>
  <UModal v-model:open="open" :title="suspension ? $t('suspensions.editTitle') : $t('suspensions.newTitle')" :description="subtitle">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <UForm id="form-suspension" :state="form" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="send">
        <UFormField v-if="!suspension && !fixed" name="enrollmentId" :label="$t('suspensions.person')" required>
          <USelect v-model="enrollmentId" :items="peopleItems" :placeholder="$t('suspensions.choosePerson')" size="xl" class="w-full" />
        </UFormField>

        <UFormField name="form" :label="$t('suspensions.form')" required>
          <div class="grid gap-2 sm:grid-cols-2" role="radiogroup" :aria-label="$t('suspensions.form')">
            <UButton
              v-for="f in FORMS"
              :key="f"
              size="lg"
              class="min-h-11 justify-start"
              :variant="form.form === f ? 'solid' : 'outline'"
              :color="form.form === f ? 'primary' : 'neutral'"
              role="radio"
              :aria-checked="form.form === f"
              :disabled="!!origin && f === 'period'"
              :label="$t(`suspensions.form${capital(f)}`)"
              @click="form.form = f"
            />
          </div>
          <p class="pt-1 text-sm text-muted">{{ $t(`suspensions.form${capital(form.form)}Hint`) }}</p>
        </UFormField>

        <p v-if="origin" class="text-sm text-muted">{{ $t('suspensions.fromMatch', { match: origin.label }) }}</p>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField v-if="!origin" name="startDate" :label="$t('suspensions.from')" required>
            <UInput v-model="form.startDate" type="date" size="xl" class="w-full" :min="season?.seasonStart" :max="season?.seasonEnd" />
          </UFormField>
          <UFormField v-if="form.form === 'period'" name="endDate" :label="$t('suspensions.to')" required>
            <UInput v-model="form.endDate" type="date" size="xl" class="w-full" :min="form.startDate || season?.seasonStart" :max="season?.seasonEnd" />
          </UFormField>
          <UFormField v-else name="matchCount" :label="$t('suspensions.count')" required>
            <UInput v-model.number="form.matchCount" type="number" size="xl" class="w-full" min="1" :max="MAX_MATCHES" inputmode="numeric" />
          </UFormField>
        </div>

        <UFormField v-if="form.form === 'matches'" name="competitions" :label="$t('suspensions.competitions')" :hint="$t('common.optional')">
          <div class="space-y-2">
            <p class="text-sm text-muted">{{ $t('suspensions.competitionsHint') }}</p>
            <ul v-if="form.competitions.length" class="flex flex-wrap gap-2">
              <li v-for="c in form.competitions" :key="c">
                <UButton
                  color="neutral"
                  variant="outline"
                  size="lg"
                  class="min-h-11"
                  trailing-icon="i-tm-x"
                  :label="c"
                  :aria-label="$t('suspensions.competitionRemove', { name: c })"
                  @click="form.competitions = removeCompetition(form.competitions, c)"
                />
              </li>
            </ul>
            <div class="flex gap-2">
              <UInput
                v-model="competitionInput"
                size="xl"
                class="min-w-0 flex-1"
                maxlength="150"
                autocomplete="off"
                :placeholder="$t('suspensions.competitionsPlaceholder')"
                :aria-label="$t('suspensions.competitions')"
                @keydown.enter.prevent="addTyped"
              />
              <UButton color="neutral" variant="outline" size="xl" class="min-h-11" :disabled="!competitionInput.trim()" :label="$t('suspensions.competitionsAdd')" @click="addTyped" />
            </div>
            <ul v-if="offered.length" class="flex flex-wrap gap-2">
              <li v-for="c in offered" :key="c">
                <UButton color="neutral" variant="soft" size="lg" class="min-h-11" icon="i-tm-plus" :label="c" @click="form.competitions = addCompetition(form.competitions, c)" />
              </li>
            </ul>
          </div>
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
      <UButton type="submit" form="form-suspension" size="lg" :loading="submit" :label="$t('common.save')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { EnrollmentType, SeasonSuspension, SuspensionFormKind } from '~/types/api'
import { MAX_MATCHES, addCompetition, removeCompetition, suggestions, suspensionError, suspensionPayload, type SuspensionDraft } from '~/utils/suspension'

interface Person { enrollmentId: string, name: string, surname: string | null, type: EnrollmentType }

const props = defineProps<{
  /** Season bounds, when known: the form checks them before sending. */
  season?: { seasonStart: string, seasonEnd: string } | null
  /** Who can be chosen. Not needed when `fixed` or `suspension` is given. */
  people?: Person[]
  /** Editing: the suspension as it is now. */
  suspension?: SeasonSuspension | null
  /** Born from a person or a match: the enrollment is already known. */
  fixed?: { enrollmentId: string, name: string } | null
  /** Born from a match: the count starts from the next match. `label` names the match for the person reading. */
  origin?: { eventId: string, label: string } | null
  /** Competition names already used in the season. */
  used?: string[]
}>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const toast = useToast()
const suspensions = useSuspensions()

const FORMS: SuspensionFormKind[] = ['period', 'matches']
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const personName = (p: { name: string, surname: string | null }) => [p.name, p.surname].filter(Boolean).join(' ')

const form = reactive<SuspensionDraft>({ form: 'matches', startDate: '', matchCount: 1, endDate: '', competitions: [] })
const enrollmentId = ref('')
const competitionInput = ref('')
const submit = ref(false)
const error = ref('')

const peopleItems = computed(() => (props.people ?? []).map(p => ({ label: `${personName(p)} · ${t(`enrollmentType.${p.type}`)}`, value: p.enrollmentId })))
const subtitle = computed(() => (props.suspension ? personName(props.suspension) : (props.fixed?.name ?? '')))
const offered = computed(() => suggestions(props.used ?? [], form.competitions))

watch(open, (isOpen) => {
  if (!isOpen) return
  error.value = ''
  competitionInput.value = ''
  enrollmentId.value = props.fixed?.enrollmentId ?? ''
  const s = props.suspension
  if (s) {
    Object.assign(form, { form: s.form, startDate: s.startDate, matchCount: s.matchCount, endDate: s.endDate ?? '', competitions: [...s.competitions] })
  }
  else {
    // From a match the start is the match itself: the API takes it from there, any value keeps the form valid.
    Object.assign(form, { form: 'matches', startDate: props.origin ? (props.season?.seasonStart ?? '') : '', matchCount: 1, endDate: '', competitions: [] })
  }
})

function addTyped() {
  form.competitions = addCompetition(form.competitions, competitionInput.value)
  competitionInput.value = ''
}

const BOUNDS = { seasonStart: '0000-01-01', seasonEnd: '9999-12-31' }

function validate(): FormError[] {
  const err: FormError[] = []
  if (!props.suspension && !props.fixed && !enrollmentId.value) err.push({ name: 'enrollmentId', message: t('suspensions.choosePerson') })
  // From a match the start day comes from the match, so only the count is checked here.
  const draft = props.origin && !form.startDate ? { ...form, startDate: (props.season?.seasonStart ?? BOUNDS.seasonStart) } : form
  const issue = suspensionError(draft, props.season ?? BOUNDS)
  if (issue) {
    const field = issue === 'countInvalid' ? 'matchCount' : issue === 'endRequired' || issue === 'endBeforeStart' ? 'endDate' : 'startDate'
    err.push({ name: field, message: t(`suspensions.error.${issue}`) })
  }
  return err
}

async function send() {
  submit.value = true
  error.value = ''
  try {
    if (props.suspension) {
      const { originEventId: _ignored, ...body } = suspensionPayload(form)
      await suspensions.update(props.suspension.id, body)
    }
    else {
      await suspensions.create(props.fixed?.enrollmentId ?? enrollmentId.value, suspensionPayload(form, props.origin?.eventId))
    }
    open.value = false
    toast.add({ title: t('suspensions.saved'), color: 'success' })
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
