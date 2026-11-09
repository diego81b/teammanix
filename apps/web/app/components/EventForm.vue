<template>
  <UModal v-model:open="open" :title="event ? $t('events.editEvent') : $t('events.newEvent')">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <p v-if="loadingSeries" class="mb-4 text-sm text-muted" role="status">{{ $t('events.scope.loading') }}</p>
      <UForm id="form-event" :state="form" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="send">
        <UFormField v-if="inSeries" name="scope" :label="$t('events.scope.label')">
          <URadioGroup v-model="scope" :items="scopes" />
        </UFormField>
        <UFormField name="type" :label="$t('events.typeLabel')" required>
          <USelect v-model="form.type" :items="types" size="xl" class="w-full" :disabled="future" />
        </UFormField>
        <UFormField name="title" :label="$t('events.field.title')" :hint="$t('common.optional')">
          <UInput v-model="form.title" size="xl" class="w-full" maxlength="120" />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField v-if="!future" name="date" :label="repeat.on ? $t('events.repeat.date') : $t('events.field.date')" required class="sm:col-span-1">
            <UInput v-model="form.date" type="date" size="xl" class="w-full" />
          </UFormField>
          <UFormField name="startTime" :label="$t('events.field.start')" required>
            <UInput v-model="form.startTime" type="time" size="xl" class="w-full" />
          </UFormField>
          <UFormField name="endTime" :label="$t('events.field.end')" required>
            <UInput v-model="form.endTime" type="time" size="xl" class="w-full" />
          </UFormField>
        </div>

        <template v-if="canRepeat">
          <USwitch v-if="!future" v-model="repeat.on" :label="$t('events.repeat.label')" class="min-h-11" />
          <div v-if="repeat.on" class="space-y-4 rounded-lg border border-default p-3">
            <UFormField name="weekdays" :label="$t('events.repeat.weekdays')" required>
              <div class="flex flex-wrap gap-2" role="group" :aria-label="$t('events.repeat.weekdays')">
                <UButton
                  v-for="d in WEEKDAYS"
                  :key="d"
                  size="lg"
                  class="min-h-11 min-w-12 justify-center"
                  :color="repeat.weekdays.includes(d) ? 'primary' : 'neutral'"
                  :variant="repeat.weekdays.includes(d) ? 'solid' : 'outline'"
                  :aria-pressed="repeat.weekdays.includes(d)"
                  :label="$t(`events.weekday.${d}`)"
                  @click="toggleDay(d)"
                />
              </div>
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField name="intervalWeeks" :label="$t('events.repeat.interval')" required>
                <UInput v-model.number="repeat.intervalWeeks" type="number" size="xl" class="w-full" min="1" max="52" inputmode="numeric" />
              </UFormField>
              <UFormField name="endDate" :label="$t('events.repeat.endDate')" :hint="$t('events.repeat.endDateHint')">
                <UInput v-model="repeat.endDate" type="date" size="xl" class="w-full" />
              </UFormField>
            </div>
          </div>
        </template>

        <template v-if="form.type === 'match'">
          <UFormField name="opponent" :label="$t('events.field.opponent')" :hint="$t('events.field.opponentHint')" required>
            <UInput v-model="form.opponent" size="xl" class="w-full" list="event-opponents" maxlength="100" autocomplete="off" />
            <datalist id="event-opponents">
              <option v-for="o in opponents" :key="o.id" :value="o.name" />
            </datalist>
          </UFormField>
          <UFormField name="homeAway" :label="$t('events.homeAwayLabel')" required>
            <USelect v-model="homeAwayChoice" :items="homeAwayItems" size="xl" class="w-full" />
          </UFormField>
          <UFormField name="competition" :label="$t('events.field.competition')" :hint="$t('common.optional')">
            <UInput v-model="form.competition" size="xl" class="w-full" list="event-competitions" maxlength="100" autocomplete="off" />
            <datalist id="event-competitions">
              <option v-for="c in competitions" :key="c" :value="c" />
            </datalist>
          </UFormField>
        </template>

        <UFormField name="venueId" :label="$t('events.field.venue')" :hint="$t('common.optional')">
          <div class="flex gap-2">
            <USelect v-model="venueChoice" :items="venueItems" size="xl" class="min-w-0 flex-1" />
            <UButton color="neutral" variant="outline" size="xl" class="min-h-11" icon="i-tm-plus" :aria-label="$t('events.newVenue')" @click="newVenue.open = !newVenue.open" />
          </div>
        </UFormField>
        <div v-if="newVenue.open" class="space-y-3 rounded-lg border border-default p-3">
          <UAlert v-if="newVenue.error" color="error" variant="subtle" icon="i-tm-error" :title="newVenue.error" />
          <UInput v-model="newVenue.name" size="xl" class="w-full" maxlength="120" :placeholder="$t('events.venueName')" :aria-label="$t('events.venueName')" />
          <UInput v-model="newVenue.address" size="xl" class="w-full" maxlength="200" :placeholder="$t('events.venueAddress')" :aria-label="$t('events.venueAddress')" />
          <UButton color="neutral" size="lg" :loading="newVenue.sending" :disabled="!newVenue.name.trim()" :label="$t('events.venueCreate')" @click="createVenue" />
        </div>

        <UFormField v-if="!repeat.on" name="note" :label="$t('events.field.note')" :hint="$t('common.optional')">
          <UTextarea v-model="form.note" size="xl" class="w-full" :rows="3" maxlength="500" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
      <UButton type="submit" form="form-event" size="lg" :loading="submit" :label="event ? $t('common.save') : $t('common.create')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { EventDto, EventType, HomeAway, OpponentDto, SeriesDto, VenueDto, Weekday } from '~/types/api'
import { emptyEventForm, eventFormIssue, eventPayload, formFromEvent, type EventForm } from '~/utils/event'
import {
  emptyRepeat,
  formFromSeries,
  repeatIssue,
  seriesCreatePayload,
  seriesEditPayload,
  weekdayOf,
  WEEKDAYS,
  type EditScope,
  type RepeatForm,
} from '~/utils/series'

const props = defineProps<{ teamId: string, seasonId: string, event: EventDto | null, date?: string }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const events = useEvents()

const form = reactive<EventForm>(emptyEventForm())
const repeat = reactive<RepeatForm>(emptyRepeat())
const scope = ref<EditScope>('one')
const series = ref<SeriesDto | null>(null)
const loadingSeries = ref(false)
const submit = ref(false)
const error = ref('')
const venues = ref<VenueDto[]>([])
const opponents = ref<OpponentDto[]>([])
const competitions = ref<string[]>([])
const newVenue = reactive({ open: false, name: '', address: '', sending: false, error: '' })

/** A session of a series offers "only this one" or "all future ones". */
const inSeries = computed(() => !!props.event?.seriesId)
const future = computed(() => inSeries.value && scope.value === 'future')
/** A match is never repeated: it needs its own opponent. */
const canRepeat = computed(() => form.type !== 'match' && (!props.event || future.value))
const scopes = computed(() => [
  { label: t('events.scope.one'), value: 'one' },
  { label: t('events.scope.future'), description: t('events.scope.futureHint'), value: 'future' },
])

const NONE = 'none'
const types = computed(() => (['training', 'match', 'other'] as EventType[]).map(v => ({ label: t(`events.type.${v}`), value: v })))
const homeAwayItems = computed(() => (['home', 'away', 'neutral'] as HomeAway[]).map(v => ({ label: t(`events.homeAway.${v}`), value: v })))
const venueItems = computed(() => [
  { label: t('events.field.noVenue'), value: NONE },
  ...venues.value.map(v => ({ label: v.name, value: v.id })),
])
/** The select cannot hold an empty value, so "no venue" travels as a marker. */
const venueChoice = computed({
  get: () => form.venueId || NONE,
  set: (v: string) => { form.venueId = v === NONE ? '' : v },
})

/** The form keeps '' for "not chosen"; the select wants undefined. */
const homeAwayChoice = computed({
  get: () => form.homeAway || undefined,
  set: (v: HomeAway | undefined) => { form.homeAway = v ?? '' },
})

watch(open, async (isOpen) => {
  if (!isOpen) return
  Object.assign(form, props.event ? formFromEvent(props.event) : emptyEventForm(props.date ?? ''))
  Object.assign(repeat, emptyRepeat(form.date))
  scope.value = 'one'
  series.value = null
  Object.assign(newVenue, { open: false, name: '', address: '', sending: false, error: '' })
  error.value = ''
  // Suggestions are a help: if they fail to load the form still works.
  const [v, o, c] = await Promise.allSettled([events.venues(), events.opponents(props.teamId), events.competitions(props.seasonId)])
  venues.value = v.status === 'fulfilled' ? v.value : []
  opponents.value = o.status === 'fulfilled' ? o.value : []
  competitions.value = c.status === 'fulfilled' ? c.value : []
})

/** The series is read when "all future ones" is chosen, then the form shows its values. */
watch(scope, async (choice) => {
  const e = props.event
  if (!e?.seriesId) return
  error.value = ''
  if (choice === 'one') {
    Object.assign(form, formFromEvent(e))
    Object.assign(repeat, emptyRepeat(form.date))
    return
  }
  loadingSeries.value = true
  try {
    series.value ??= await events.series(e.seriesId)
    const filled = formFromSeries(series.value, e)
    Object.assign(form, filled.form)
    Object.assign(repeat, filled.repeat)
  }
  catch (err) {
    error.value = errorText(err)
    scope.value = 'one'
  }
  finally {
    loadingSeries.value = false
  }
})

/** Turning the repeat on starts from the weekday of the chosen day. */
watch(() => repeat.on, (on) => {
  if (on && repeat.weekdays.length === 0) {
    const d = weekdayOf(form.date)
    if (d) repeat.weekdays = [d]
  }
})
watch(() => form.type, (type) => {
  if (type === 'match') repeat.on = false
})

function toggleDay(d: Weekday) {
  repeat.weekdays = repeat.weekdays.includes(d) ? repeat.weekdays.filter(x => x !== d) : [...repeat.weekdays, d]
}

const REPEAT_FIELD = { weekdays_missing: 'weekdays', interval: 'intervalWeeks', end_before_start: 'endDate' } as const

function validate(f: EventForm): FormError[] {
  const repeatProblem = repeatIssue(f, repeat)
  if (repeatProblem) return [{ name: REPEAT_FIELD[repeatProblem], message: t(`events.issue.${repeatProblem}`) }]
  // "All future ones" has no day of its own: the series keeps its first day.
  const issue = eventFormIssue(future.value ? { ...f, date: '2000-01-01' } : f)
  if (!issue) return []
  const field = issue === 'match_incomplete' ? (f.opponent.trim() ? 'homeAway' : 'opponent') : issue === 'period' ? 'endTime' : 'date'
  return [{ name: field, message: t(`events.issue.${issue}`) }]
}

async function createVenue() {
  newVenue.sending = true
  newVenue.error = ''
  try {
    const v = await events.createVenue({ name: newVenue.name.trim(), ...(newVenue.address.trim() ? { address: newVenue.address.trim() } : {}) })
    venues.value = [...venues.value, v].sort((a, b) => a.name.localeCompare(b.name))
    form.venueId = v.id
    Object.assign(newVenue, { open: false, name: '', address: '' })
  }
  catch (e) {
    newVenue.error = errorText(e)
  }
  finally {
    newVenue.sending = false
  }
}

async function send() {
  const event = props.event
  const seriesId = event?.seriesId
  const payload = repeat.on ? null : eventPayload(form)
  const seriesCreate = repeat.on && !event ? seriesCreatePayload(form, repeat) : null
  const seriesEdit = repeat.on && future.value ? seriesEditPayload(form, repeat) : null
  if (!payload && !seriesCreate && !seriesEdit) return
  submit.value = true
  error.value = ''
  try {
    if (seriesCreate) await events.createSeries(props.teamId, seriesCreate)
    else if (seriesEdit && seriesId) await events.editSeries(seriesId, seriesEdit)
    else if (payload && event) await events.edit(event.id, payload)
    else if (payload) await events.create(props.teamId, payload)
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
