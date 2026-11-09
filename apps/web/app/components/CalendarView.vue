<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex gap-1" role="group" :aria-label="$t('calendar.viewLabel')">
        <UButton
          v-for="v in VIEWS"
          :key="v"
          size="lg"
          class="min-h-11"
          :color="view === v ? 'primary' : 'neutral'"
          :variant="view === v ? 'soft' : 'outline'"
          :aria-pressed="view === v"
          :label="$t(`calendar.view${v === 'list' ? 'List' : 'Month'}`)"
          @click="view = v"
        />
      </div>
      <div v-if="view === 'list'" class="flex gap-1" role="group" :aria-label="$t('calendar.title')">
        <UButton
          v-for="p in PARTS"
          :key="p"
          size="lg"
          class="min-h-11"
          :color="part === p ? 'primary' : 'neutral'"
          :variant="part === p ? 'soft' : 'outline'"
          :aria-pressed="part === p"
          :label="$t(`calendar.${p}`)"
          @click="part = p"
        />
      </div>
    </div>

    <template v-if="view === 'list'">
      <p v-if="groups.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        {{ part === 'upcoming' ? $t('calendar.emptyUpcoming') : $t('calendar.emptyHistory') }}
      </p>
      <section v-for="g in groups" :key="g.day" class="space-y-2" :aria-label="formatDay(g.day, locale)">
        <h2 class="text-sm font-semibold text-muted first-letter:uppercase">{{ formatDay(g.day, locale) }}</h2>
        <ul class="space-y-2">
          <EventRow v-for="e in g.events" :key="e.id" :event="e" :show-team="showTeam">
            <template #actions><slot name="actions" :event="e" /></template>
          </EventRow>
        </ul>
      </section>
    </template>

    <template v-else>
      <div class="flex items-center justify-between gap-2">
        <UButton color="neutral" variant="ghost" size="lg" class="min-h-11 min-w-11" icon="i-tm-chevron-left" :aria-label="$t('calendar.prevMonth')" @click="go(-1)" />
        <div class="flex items-center gap-2">
          <h2 class="font-semibold first-letter:uppercase" aria-live="polite">{{ formatMonth(month, locale) }}</h2>
          <UButton color="neutral" variant="outline" size="sm" class="min-h-11" :label="$t('calendar.today')" @click="goToday" />
        </div>
        <UButton color="neutral" variant="ghost" size="lg" class="min-h-11 min-w-11" icon="i-tm-chevron-right" :aria-label="$t('calendar.nextMonth')" @click="go(1)" />
      </div>

      <table class="w-full table-fixed border-separate border-spacing-1">
        <thead>
          <tr>
            <th v-for="d in weekdays" :key="d" scope="col" class="pb-1 text-xs font-medium text-muted first-letter:uppercase">{{ d }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(week, i) in weeks" :key="i">
            <td v-for="cell in week" :key="cell.day" class="p-0">
              <button
                type="button"
                class="flex min-h-14 w-full flex-col items-center gap-1 rounded-lg border p-1 text-sm focus-visible:outline-2 focus-visible:outline-primary"
                :class="[
                  selected === cell.day ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-elevated',
                  cell.inMonth ? '' : 'text-dimmed',
                  cell.day === today ? 'font-bold' : '',
                ]"
                :aria-pressed="selected === cell.day"
                :aria-current="cell.day === today ? 'date' : undefined"
                :aria-label="$t('calendar.dayEvents', { day: formatDay(cell.day, locale), n: (byDay.get(cell.day) ?? []).length })"
                @click="selected = cell.day"
              >
                <span>{{ Number(cell.day.slice(8)) }}</span>
                <span class="flex gap-0.5" aria-hidden="true">
                  <span v-for="e in (byDay.get(cell.day) ?? []).slice(0, 3)" :key="e.id" class="size-1.5 rounded-full" :class="DOT[e.status] ?? 'bg-primary'" />
                </span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <section class="space-y-2" :aria-label="$t('calendar.dayTitle', { day: formatDay(selected, locale) })">
        <h3 class="text-sm font-semibold text-muted first-letter:uppercase">{{ formatDay(selected, locale) }}</h3>
        <p v-if="dayEvents.length === 0" class="rounded-lg border border-dashed border-default p-4 text-center text-sm text-muted">{{ $t('calendar.dayEmpty') }}</p>
        <ul v-else class="space-y-2">
          <EventRow v-for="e in dayEvents" :key="e.id" :event="e" :show-team="showTeam">
            <template #actions><slot name="actions" :event="e" /></template>
          </EventRow>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { CalendarEntryDto, EventDto } from '~/types/api'
import { eventsByDay, initialMonth, monthGrid, monthOf, shiftMonth, splitHistory, todayDay, type Month } from '~/utils/calendar'
import { formatDay, formatMonth, weekdayLabels } from '~/utils/date'
import { groupByDay } from '~/utils/event'

/**
 * List (upcoming or history) and month views of a set of events. Read only: the page adds management actions through the `actions` slot.
 * Cancelled and postponed events are shown, marked, in both views.
 */
const props = defineProps<{ events: readonly (EventDto | CalendarEntryDto)[], showTeam?: boolean }>()
defineSlots<{ actions?: (props: { event: EventDto | CalendarEntryDto }) => unknown }>()

const { locale } = useI18n()
const VIEWS = ['list', 'month'] as const
const PARTS = ['upcoming', 'history'] as const
const DOT: Record<string, string> = { scheduled: 'bg-primary', cancelled: 'bg-error', postponed: 'bg-warning' }

const view = ref<(typeof VIEWS)[number]>('list')
const part = ref<(typeof PARTS)[number]>('upcoming')
const today = computed(() => todayDay())

const split = computed(() => splitHistory(props.events, new Date()))
const groups = computed(() => groupByDay(part.value === 'upcoming' ? split.value.upcoming : split.value.history))

const month = ref<Month>(initialMonth(props.events))
const weeks = computed(() => monthGrid(month.value))
const weekdays = computed(() => weekdayLabels(locale.value))
const byDay = computed(() => eventsByDay(props.events))
const selected = ref(pickDay(month.value))
const dayEvents = computed(() => byDay.value.get(selected.value) ?? [])

/** Today if the month is the current one, else its first day with events, else its first day. */
function pickDay(m: Month): string {
  if (monthOf(today.value).year === m.year && monthOf(today.value).month === m.month) return today.value
  const prefix = `${m.year}-${String(m.month).padStart(2, '0')}`
  return [...byDay.value.keys()].filter(d => d.startsWith(prefix)).sort()[0] ?? `${prefix}-01`
}

function go(delta: number) {
  month.value = shiftMonth(month.value, delta)
  selected.value = pickDay(month.value)
}

function goToday() {
  month.value = monthOf(today.value)
  selected.value = today.value
}

</script>
