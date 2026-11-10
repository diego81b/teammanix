<template>
  <li class="space-y-2 rounded-lg border border-default bg-elevated p-3">
    <div class="flex flex-wrap items-center gap-3">
      <div class="min-w-0 flex-1">
        <p v-if="who" class="truncate font-medium">{{ who }}</p>
        <p class="text-sm" :class="who ? 'text-muted' : 'font-medium'">{{ summary }}</p>
      </div>
      <UBadge :color="suspension.completed ? 'neutral' : 'error'" variant="subtle" icon="i-tm-ban" :label="suspension.completed ? $t('suspensions.done') : $t('suspensions.progress', { served: done.served, total: done.total })" />
    </div>
    <p v-if="next !== null" class="text-sm text-muted">{{ $t('suspensions.next', { number: next }) }}</p>

    <!-- The matches the suspension covers now, in calendar order. -->
    <details class="group">
      <summary class="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
        <UIcon name="i-tm-chevron-right" class="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
        {{ $t('suspensions.covered') }} ({{ suspension.covered.length }})
      </summary>
      <p v-if="suspension.covered.length === 0" class="pb-2 text-sm text-muted">{{ $t('suspensions.coveredNone') }}</p>
      <ol v-else class="space-y-1 pb-2">
        <li v-for="c in suspension.covered" :key="c.eventId" class="flex flex-wrap items-center gap-2 text-sm">
          <span class="min-w-0 flex-1">{{ $t('suspensions.matchLine', { number: c.number, of: c.of, date: when(c.start) }) }}</span>
          <UBadge :color="c.served ? 'neutral' : 'warning'" variant="subtle" :label="c.served ? $t('suspensions.played') : $t('suspensions.ahead')" />
        </li>
      </ol>
    </details>

    <div v-if="canManage" class="flex flex-wrap gap-2">
      <UButton color="neutral" variant="outline" size="lg" class="min-h-11" :label="$t('suspensions.edit')" :aria-label="$t('suspensions.editAria', { name: who })" @click="emit('edit')" />
      <UButton color="error" variant="outline" size="lg" class="min-h-11" :label="$t('suspensions.cancel')" :aria-label="$t('suspensions.cancelAria', { name: who })" @click="emit('cancel')" />
    </div>
  </li>
</template>

<script setup lang="ts">
import type { SuspensionOut } from '~/types/api'
import { formatDate } from '~/utils/date'
import { splitInstant } from '~/utils/event'
import { nextMatchNumber, progress } from '~/utils/suspension'

const props = defineProps<{ suspension: SuspensionOut, who?: string, canManage?: boolean }>()
const emit = defineEmits<{ edit: [], cancel: [] }>()
const { t, locale } = useI18n()

const done = computed(() => progress(props.suspension))
const next = computed(() => nextMatchNumber(props.suspension.covered))
const when = (iso: string) => `${formatDate(splitInstant(iso).date, locale.value)} · ${splitInstant(iso).time}`

const summary = computed(() => {
  const s = props.suspension
  const day = (d: string) => formatDate(d, locale.value)
  if (s.form === 'period') return t('suspensions.periodText', { from: day(s.startDate), to: day(s.endDate as string) })
  const base = t('suspensions.matchesText', { count: s.matchCount as number, from: day(s.startDate) })
  return s.competitions.length ? `${base} · ${t('suspensions.matchesIn', { competitions: s.competitions.join(', ') })}` : base
})
</script>
