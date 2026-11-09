<template>
  <UModal v-model:open="open" :title="event ? $t('events.editEvent') : $t('events.newEvent')">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <UForm id="form-event" :state="form" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="send">
        <UFormField name="type" :label="$t('events.typeLabel')" required>
          <USelect v-model="form.type" :items="types" size="xl" class="w-full" />
        </UFormField>
        <UFormField name="title" :label="$t('events.field.title')" :hint="$t('common.optional')">
          <UInput v-model="form.title" size="xl" class="w-full" maxlength="120" />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField name="date" :label="$t('events.field.date')" required class="sm:col-span-1">
            <UInput v-model="form.date" type="date" size="xl" class="w-full" />
          </UFormField>
          <UFormField name="startTime" :label="$t('events.field.start')" required>
            <UInput v-model="form.startTime" type="time" size="xl" class="w-full" />
          </UFormField>
          <UFormField name="endTime" :label="$t('events.field.end')" required>
            <UInput v-model="form.endTime" type="time" size="xl" class="w-full" />
          </UFormField>
        </div>

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

        <UFormField name="note" :label="$t('events.field.note')" :hint="$t('common.optional')">
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
import type { EventDto, EventType, HomeAway, OpponentDto, VenueDto } from '~/types/api'
import { emptyEventForm, eventFormIssue, eventPayload, formFromEvent, type EventForm } from '~/utils/event'

const props = defineProps<{ teamId: string, seasonId: string, event: EventDto | null, date?: string }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const events = useEvents()

const form = reactive<EventForm>(emptyEventForm())
const submit = ref(false)
const error = ref('')
const venues = ref<VenueDto[]>([])
const opponents = ref<OpponentDto[]>([])
const competitions = ref<string[]>([])
const newVenue = reactive({ open: false, name: '', address: '', sending: false, error: '' })

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
  Object.assign(newVenue, { open: false, name: '', address: '', sending: false, error: '' })
  error.value = ''
  // Suggestions are a help: if they fail to load the form still works.
  const [v, o, c] = await Promise.allSettled([events.venues(), events.opponents(props.teamId), events.competitions(props.seasonId)])
  venues.value = v.status === 'fulfilled' ? v.value : []
  opponents.value = o.status === 'fulfilled' ? o.value : []
  competitions.value = c.status === 'fulfilled' ? c.value : []
})

function validate(f: EventForm): FormError[] {
  const issue = eventFormIssue(f)
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
  const payload = eventPayload(form)
  if (!payload) return
  submit.value = true
  error.value = ''
  try {
    if (props.event) await events.edit(props.event.id, payload)
    else await events.create(props.teamId, payload)
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
