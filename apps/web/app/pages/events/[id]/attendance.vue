<template>
  <div class="space-y-6">
    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="data">
      <div class="space-y-3">
        <NuxtLink :to="`/calendar/${data.event.seasonId}`" class="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-default">
          <UIcon name="i-tm-chevron-left" class="size-4" aria-hidden="true" />
          {{ $t('attendance.back') }}
        </NuxtLink>
        <h1 class="text-2xl font-bold">{{ $t('attendance.title') }}</h1>
        <p class="text-sm text-muted">
          <span class="font-semibold text-default">{{ eventHeading(data.event, key => t(key)) }}</span>
          · {{ formatDate(splitInstant(data.event.start).date, locale) }} · {{ splitInstant(data.event.start).time }} - {{ splitInstant(data.event.end).time }}
          <template v-if="data.event.venue"> · {{ data.event.venue.name }}</template>
        </p>
        <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />
      </div>

      <!-- Player: the own result and the staff present, never the other players. -->
      <section v-if="data.view === 'player'" class="space-y-3" :aria-label="$t('attendance.yourResult')">
        <div class="space-y-2 rounded-lg border border-default bg-elevated p-3">
          <p class="text-sm font-semibold">{{ $t('attendance.yourResult') }}</p>
          <UBadge v-if="data.mine?.outcome" :color="OUTCOME_COLOR[data.mine.outcome]" variant="subtle" size="lg" :label="$t(`attendance.outcome.${data.mine.outcome}`)" />
          <p v-else class="text-sm text-muted">{{ $t('attendance.noResult') }}</p>
        </div>
        <h2 class="pt-2 font-semibold">{{ $t('attendance.staffPresentTitle') }} ({{ data.staffPresent.length }})</h2>
        <p v-if="data.staffPresent.length === 0" class="rounded-lg border border-dashed border-default p-4 text-center text-sm text-muted">{{ $t('attendance.staffPresentEmpty') }}</p>
        <ul v-else class="space-y-2">
          <li v-for="s in data.staffPresent" :key="s.enrollmentId" class="flex items-center gap-3 rounded-lg border border-default bg-elevated p-3">
            <span class="min-w-0 flex-1 truncate font-medium">{{ rowName({ name: s.name, surname: s.surname, disabled: false }, key => t(key)) }}</span>
            <span v-if="s.staffRole" class="text-sm text-muted">{{ $t(`staffRole.${s.staffRole}`) }}</span>
          </li>
        </ul>
      </section>

      <template v-else>
        <!-- Totals of the event: what a manager sees, and the head of the list for the others. -->
        <section class="space-y-2 rounded-lg border border-default bg-elevated p-3" :aria-label="$t('attendance.totals')">
          <p class="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
            {{ $t('attendance.totals') }}
            <span class="font-normal text-muted">{{ rate === null ? $t('attendance.noRate') : $t('attendance.rate', { percent: rate }) }}</span>
          </p>
          <p class="flex flex-wrap gap-1.5">
            <UBadge color="success" variant="subtle" :label="`${$t('attendance.present')}: ${data.summary.present}`" />
            <UBadge color="warning" variant="subtle" :label="`${$t('attendance.late')}: ${data.summary.late}`" />
            <UBadge color="neutral" variant="subtle" :label="`${$t('attendance.absentExcused')}: ${data.summary.absentExcused}`" />
            <UBadge color="error" variant="subtle" :label="`${$t('attendance.absent')}: ${data.summary.absent}`" />
            <UBadge color="info" variant="subtle" :label="`${$t('attendance.injured')}: ${data.summary.injured}`" />
            <UBadge color="neutral" variant="outline" :label="`${$t('attendance.notRecorded')}: ${data.summary.notRecorded}`" />
          </p>
        </section>

        <UAlert v-if="data.view === 'stats'" color="neutral" variant="subtle" icon="i-tm-info" :title="$t('attendance.statsOnly')" />

        <template v-else>
          <UAlert v-if="!data.canRecord" color="neutral" variant="subtle" icon="i-tm-lock" :title="$t('attendance.readOnly')" />
          <p v-if="data.rows.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('attendance.empty') }}</p>

          <section v-for="g in groups" :key="g.key" class="space-y-2" :aria-label="$t(`attendance.${g.key}`)">
            <h2 class="font-semibold">{{ $t(`attendance.${g.key}`) }} ({{ g.rows.length }})</h2>
            <ul class="space-y-2">
              <li v-for="r in g.rows" :key="r.enrollmentId" class="space-y-2 rounded-lg border border-default bg-elevated p-3">
                <div class="flex items-center gap-3">
                  <p class="min-w-0 flex-1 truncate font-medium">
                    {{ rowName(r, key => t(key)) }}
                    <span v-if="r.jerseyNumber !== null" class="text-sm font-normal text-muted">#{{ r.jerseyNumber }}</span>
                    <UBadge v-if="r.disabled && r.name" color="neutral" variant="outline" class="ml-1" :label="$t('attendance.disabledPerson')" />
                  </p>
                  <span v-if="r.staffRole" class="text-sm text-muted">{{ $t(`staffRole.${r.staffRole}`) }}</span>
                  <UBadge v-if="!data.canRecord && r.outcome" :color="OUTCOME_COLOR[r.outcome]" variant="subtle" :label="$t(`attendance.outcome.${r.outcome}`)" />
                </div>
                <!-- Five buttons from a closed list, one tap each. Tapping the one already set clears it. -->
                <div v-if="data.canRecord && !r.disabled" class="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" :aria-label="$t('attendance.markAria', { name: rowName(r, key => t(key)) })">
                  <UButton
                    v-for="o in OUTCOMES"
                    :key="o"
                    size="lg"
                    class="min-h-11 justify-center"
                    :variant="r.outcome === o ? 'solid' : 'outline'"
                    :color="r.outcome === o ? OUTCOME_COLOR[o] : 'neutral'"
                    :aria-pressed="r.outcome === o"
                    :loading="busy === r.enrollmentId"
                    :disabled="busy !== '' && busy !== r.enrollmentId"
                    :label="$t(`attendance.outcome.${o}`)"
                    @click="set(r, o)"
                  />
                </div>
              </li>
            </ul>
          </section>
        </template>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AttendanceOutcome, AttendanceRow } from '~/types/api'
import { OUTCOMES, groupRows, percent, rowName, toggleOutcome } from '~/utils/attendance'
import { eventHeading } from '~/utils/calendar'
import { formatDate } from '~/utils/date'
import { splitInstant } from '~/utils/event'

const { t, locale } = useI18n()
const route = useRoute()
const attendance = useAttendance()
const eventId = computed(() => String(route.params.id))

const { data, loading, error, reload: load } = useLoad(() => attendance.view(eventId.value))
useHead({ title: () => `${t('attendance.title')} · TeamManix` })

const OUTCOME_COLOR = { present: 'success', late: 'warning', absent_excused: 'neutral', absent: 'error', injured: 'info' } as const

const rows = computed<AttendanceRow[]>(() => (data.value && (data.value.view === 'manage' || data.value.view === 'read') ? data.value.rows : []))
const groups = computed(() => {
  const g = groupRows(rows.value)
  return [{ key: 'staff', rows: g.staff }, { key: 'players', rows: g.players }].filter(x => x.rows.length > 0)
})
const rate = computed(() => (data.value && data.value.view !== 'player' ? percent(data.value.summary.rate) : null))

const busy = ref('')
const errorAction = ref('')

/** One tap, then the page is read again: the API recomputes the totals. A refused write shows its translated error. */
async function set(r: AttendanceRow, picked: AttendanceOutcome) {
  busy.value = r.enrollmentId
  errorAction.value = ''
  try {
    const next = toggleOutcome(r.outcome, picked)
    if (next === null) await attendance.clear(eventId.value, r.enrollmentId)
    else await attendance.record(eventId.value, r.enrollmentId, next)
  }
  catch (e) {
    errorAction.value = errorText(e)
  }
  finally {
    await load()
    busy.value = ''
  }
}

onMounted(load)
</script>
