<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <UButton color="neutral" variant="ghost" size="lg" class="min-h-11 min-w-11" icon="i-tm-chevron-left" :aria-label="$t('calendar.prevMonth')" @click="go(-1)" />
      <div class="flex items-center gap-2">
        <h2 class="font-semibold first-letter:uppercase" aria-live="polite">{{ formatMonth(month, locale) }}</h2>
        <UButton color="neutral" variant="outline" size="sm" class="min-h-11" :label="$t('calendar.today')" @click="goToday" />
      </div>
      <UButton color="neutral" variant="ghost" size="lg" class="min-h-11 min-w-11" icon="i-tm-chevron-right" :aria-label="$t('calendar.nextMonth')" @click="go(1)" />
    </div>

    <div>
      <div class="grid grid-cols-7 gap-1 pb-1" aria-hidden="true">
        <span v-for="d in weekdays" :key="d" class="text-center text-xs font-medium text-muted first-letter:uppercase">{{ d }}</span>
      </div>
      <div class="space-y-1">
        <div
          v-for="w in rows"
          :key="w.first"
          class="grid grid-cols-7 gap-x-1 gap-y-0.5 rounded-lg py-1"
          role="group"
          :aria-label="formatDay(w.first, locale)"
        >
          <span
            v-for="(cell, i) in w.cells"
            :key="cell.day"
            class="row-start-1 flex min-h-8 items-start justify-center pt-1 text-sm"
            :style="{ gridColumn: i + 1 }"
            :class="[cell.inMonth ? '' : 'text-dimmed', cell.day === today ? 'font-bold text-primary' : '']"
            :aria-current="cell.day === today ? 'date' : undefined"
            :aria-label="matchOn.has(cell.day) ? $t('suspensions.dayLabel', { day: formatDay(cell.day, locale) }) : undefined"
          >
            <span :class="matchOn.has(cell.day) ? 'underline decoration-2 underline-offset-4' : ''">{{ Number(cell.day.slice(8)) }}</span>
          </span>

          <span
            v-for="b in w.marks.bars"
            :key="`${b.id}-${w.first}`"
            class="flex min-h-6 items-center truncate rounded bg-error/15 px-1.5 text-xs font-medium text-error"
            :style="{ gridColumn: `${b.col} / span ${b.span}` }"
            role="img"
            :aria-label="$t('suspensions.barLabel', { name: b.name, from: formatDay(b.from, locale), to: formatDay(b.to, locale) })"
            :title="b.name"
          >
            <span class="truncate">{{ b.name }}</span>
          </span>

          <span
            v-for="m in w.marks.initials"
            :key="`${m.id}-${m.day}`"
            class="flex min-h-6 items-center justify-center truncate rounded px-1 text-xs font-semibold"
            :class="m.served ? 'bg-elevated text-muted' : 'bg-error/15 text-error'"
            :style="{ gridColumn: m.col }"
            role="img"
            :aria-label="$t(m.served ? 'suspensions.initialsServedLabel' : 'suspensions.initialsLabel', { name: m.name, day: formatDay(m.day, locale) })"
            :title="m.name"
          >
            {{ m.initials }}
          </span>
        </div>
      </div>
    </div>

    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <li>{{ $t('suspensions.legendBar') }}</li>
      <li>{{ $t('suspensions.legendInitials') }}</li>
      <li>{{ $t('suspensions.legendServed') }}</li>
      <li>{{ $t('suspensions.legendMatch') }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { SeasonSuspension } from '~/types/api'
import { monthGrid, monthOf, shiftMonth, todayDay, type Month } from '~/utils/calendar'
import { formatDay, formatMonth, weekdayLabels } from '~/utils/date'
import { weekMarks } from '~/utils/suspension-calendar'

/** Month view of the team suspensions: bars for a period, initials on the covered match days. Read only. */
const props = defineProps<{ suspensions: readonly SeasonSuspension[], matchDays: ReadonlySet<string> }>()

const { locale } = useI18n()
const today = computed(() => todayDay())
const month = ref<Month>(monthOf(today.value))
const weekdays = computed(() => weekdayLabels(locale.value))
const matchOn = computed(() => props.matchDays)

const rows = computed(() => monthGrid(month.value).map(cells => ({
  first: cells[0]!.day,
  cells,
  marks: weekMarks(cells, props.suspensions, locale.value),
})))

const go = (delta: number) => { month.value = shiftMonth(month.value, delta) }
const goToday = () => { month.value = monthOf(today.value) }
</script>
