<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <h1 class="text-2xl font-bold">{{ $t('absences.title') }}</h1>
      <p class="text-sm text-muted">{{ $t('absences.intro') }}</p>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="data">
      <p v-if="data.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('absences.noEnrollment') }}</p>

      <section v-for="e in data" :key="e.enrollmentId" class="space-y-3" :aria-label="`${e.teamName} · ${e.seasonName}`">
        <div class="flex items-center gap-3">
          <div class="min-w-0 flex-1">
            <h2 class="truncate font-semibold">{{ e.teamName }}</h2>
            <p class="text-sm text-muted">{{ e.seasonName }}</p>
          </div>
          <UButton size="lg" class="min-h-11" icon="i-tm-plus" :label="$t('absences.add')" @click="openForm(e)" />
        </div>

        <p v-if="e.absences.length === 0" class="rounded-lg border border-dashed border-default p-4 text-center text-sm text-muted">{{ $t('absences.none') }}</p>
        <template v-else>
          <template v-for="g in groups(e)" :key="g.key">
            <template v-if="g.items.length">
              <h3 class="text-sm font-semibold text-muted">{{ $t(`absences.${g.key}`) }}</h3>
              <ul class="space-y-2">
                <li v-for="a in g.items" :key="a.id" class="flex items-center gap-3 rounded-lg border border-default bg-elevated p-3">
                  <UIcon name="i-tm-calendar" class="size-5 shrink-0 text-muted" aria-hidden="true" />
                  <span class="min-w-0 flex-1 text-sm font-medium">{{ periodText(a) }}</span>
                  <UButton
                    color="neutral"
                    variant="outline"
                    class="min-h-11"
                    :label="$t('absences.edit')"
                    :aria-label="$t('absences.editAria', { period: periodText(a) })"
                    @click="openForm(e, a)"
                  />
                  <UButton
                    color="error"
                    variant="outline"
                    class="min-h-11"
                    :label="$t('absences.remove')"
                    :aria-label="$t('absences.removeAria', { period: periodText(a) })"
                    @click="askRemove(a)"
                  />
                </li>
              </ul>
            </template>
          </template>
        </template>
      </section>
    </template>

    <!-- Create or change an absence: dates only, never a reason. -->
    <UModal v-model:open="open.form" :title="editing ? $t('absences.editTitle') : $t('absences.newTitle')" :description="target ? `${target.teamName} · ${target.seasonName}` : ''">
      <template #body>
        <UAlert v-if="errorForm" color="error" variant="subtle" icon="i-tm-error" :title="errorForm" class="mb-4" />
        <UForm id="form-absence" :state="form" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="save">
          <UFormField name="startDate" :label="$t('absences.from')" required>
            <UInput v-model="form.startDate" type="date" size="xl" class="w-full" :min="target?.seasonStart" :max="target?.seasonEnd" />
          </UFormField>
          <UFormField v-if="!form.untilFurtherNotice" name="endDate" :label="$t('absences.to')" required>
            <UInput v-model="form.endDate" type="date" size="xl" class="w-full" :min="form.startDate || target?.seasonStart" :max="target?.seasonEnd" />
          </UFormField>
          <USwitch v-model="form.untilFurtherNotice" :label="$t('absences.untilFurtherNotice')" />
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open.form = false" />
        <UButton type="submit" form="form-absence" size="lg" :loading="saving" :label="$t('common.save')" />
      </template>
    </UModal>

    <!-- Events already answered inside the period: untick the ones you will attend, decline the rest in one tap. -->
    <UModal v-model:open="open.decline" :title="$t('absences.decline.title')" :description="$t('absences.decline.text')">
      <template #body>
        <UAlert v-if="errorDecline" color="error" variant="subtle" icon="i-tm-error" :title="errorDecline" class="mb-4" />
        <ul class="space-y-2">
          <li v-for="ev in affected" :key="ev.eventId" class="rounded-lg border border-default p-3">
            <UCheckbox
              :model-value="chosen.includes(ev.eventId)"
              size="lg"
              :label="eventHeading({ title: ev.title, opponent: null, type: ev.type }, key => t(key))"
              :description="`${formatDate(splitInstant(ev.start).date, locale)} · ${splitInstant(ev.start).time}`"
              @update:model-value="chosen = toggleEvent(chosen, ev.eventId)"
            />
          </li>
        </ul>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" size="lg" :label="$t('absences.decline.keep')" @click="open.decline = false" />
        <UButton size="lg" :disabled="chosen.length === 0" :loading="declining" :label="$t('absences.decline.action', { count: chosen.length })" @click="declineChosen" />
      </template>
    </UModal>

    <UModal v-model:open="open.remove" :title="$t('absences.removeTitle')" :description="$t('absences.removeText')">
      <template #footer>
        <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open.remove = false" />
        <UButton color="error" size="lg" :loading="removing" :label="$t('absences.remove')" @click="remove" />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { AbsenceOut, AffectedEvent, MyEnrollmentAbsences } from '~/types/api'
import { formPayload, periodError, splitAbsences, toggleEvent, pickAll, type AbsenceForm } from '~/utils/absence'
import { eventHeading, todayDay } from '~/utils/calendar'
import { formatDate } from '~/utils/date'
import { splitInstant } from '~/utils/event'

const { t, locale } = useI18n()
useHead({ title: () => `${t('absences.title')} · TeamManix` })
const absences = useAbsences()
const toast = useToast()

const { data, loading, error, reload: load } = useLoad(() => absences.mine())
onMounted(load)

const open = reactive({ form: false, decline: false, remove: false })
const errorAction = ref('')

const periodText = (a: AbsenceOut) =>
  a.endDate
    ? t('absences.period', { from: formatDate(a.startDate, locale.value), to: formatDate(a.endDate, locale.value) })
    : t('absences.periodOpen', { from: formatDate(a.startDate, locale.value) })

function groups(e: MyEnrollmentAbsences) {
  const s = splitAbsences(e.absences, todayDay())
  return [
    { key: 'current', items: s.current },
    { key: 'past', items: s.past },
  ] as const
}

// Create or change.
const target = ref<MyEnrollmentAbsences | null>(null)
const editing = ref<AbsenceOut | null>(null)
const form = reactive<AbsenceForm>({ startDate: '', endDate: '', untilFurtherNotice: false })
const errorForm = ref('')
const saving = ref(false)

function openForm(e: MyEnrollmentAbsences, a: AbsenceOut | null = null) {
  target.value = e
  editing.value = a
  form.startDate = a?.startDate ?? ''
  form.endDate = a?.endDate ?? ''
  form.untilFurtherNotice = a ? a.endDate === null : false
  errorForm.value = ''
  open.form = true
}

function validate(): FormError[] {
  if (!target.value) return []
  const code = periodError(form, target.value)
  if (!code) return []
  const message = t(`absences.error.${code}`, { from: formatDate(target.value.seasonStart, locale.value), to: formatDate(target.value.seasonEnd, locale.value) })
  return [{ name: code === 'startRequired' || (code === 'outsideSeason' && form.startDate < target.value.seasonStart) ? 'startDate' : 'endDate', message }]
}

// Events the saved period covers, already answered by the person.
const affected = ref<AffectedEvent[]>([])
const chosen = ref<string[]>([])
const lastId = ref('')
const errorDecline = ref('')
const declining = ref(false)

async function save() {
  if (!target.value) return
  saving.value = true
  errorForm.value = ''
  try {
    const period = formPayload(form)
    const result = editing.value ? await absences.update(editing.value.id, period) : await absences.create(target.value.enrollmentId, period)
    open.form = false
    toast.add({ title: t('absences.saved'), color: 'success' })
    await load()
    if (result.affected.length) {
      affected.value = result.affected
      chosen.value = pickAll(result.affected)
      lastId.value = result.absence.id
      errorDecline.value = ''
      open.decline = true
    }
  }
  catch (e) {
    errorForm.value = errorText(e)
  }
  finally {
    saving.value = false
  }
}

async function declineChosen() {
  declining.value = true
  errorDecline.value = ''
  try {
    await absences.decline(lastId.value, chosen.value)
    open.decline = false
    toast.add({ title: t('absences.decline.done'), color: 'success' })
  }
  catch (e) {
    errorDecline.value = errorText(e)
  }
  finally {
    declining.value = false
  }
}

// Delete.
const toRemove = ref<AbsenceOut | null>(null)
const removing = ref(false)
function askRemove(a: AbsenceOut) {
  toRemove.value = a
  open.remove = true
}

async function remove() {
  if (!toRemove.value) return
  removing.value = true
  errorAction.value = ''
  try {
    await absences.remove(toRemove.value.id)
    open.remove = false
    toast.add({ title: t('absences.removed'), color: 'success' })
    await load()
  }
  catch (e) {
    open.remove = false
    errorAction.value = errorText(e)
  }
  finally {
    removing.value = false
  }
}
</script>
