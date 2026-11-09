<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-bold md:text-3xl">{{ $t('home.greeting', { name: session.user?.name ?? '' }) }}</h1>
      <p class="text-muted">{{ session.active?.name }}</p>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <p v-if="loading && !loaded" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <UCard v-if="loaded" :ui="{ root: 'rounded-2xl' }">
      <div class="flex items-start gap-3">
        <UIcon :name="next ? 'i-tm-calendar' : 'i-tm-calendar-x'" class="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
        <div class="min-w-0 flex-1 space-y-2">
          <h2 class="font-semibold">{{ $t('home.nextTitle') }}</h2>
          <template v-if="next">
            <p class="text-lg font-semibold">{{ heading }}</p>
            <p class="text-sm text-muted">
              <span class="first-letter:uppercase">{{ formatDay(splitInstant(next.start).date, locale) }}</span>
              · {{ splitInstant(next.start).time }} - {{ splitInstant(next.end).time }}
              <template v-if="next.venue"> · {{ next.venue.name }}</template>
              <template v-if="next.homeAway"> · {{ $t(`events.homeAway.${next.homeAway}`) }}</template>
            </p>
            <p class="text-sm text-muted">{{ $t('calendar.team', { team: next.teamName }) }}</p>
          </template>
          <template v-else>
            <p class="text-sm">{{ $t('home.nextEmpty') }}</p>
            <p class="text-sm text-muted">{{ $t('home.nextEmptyHint') }}</p>
          </template>
          <UButton to="/calendar" color="neutral" variant="outline" size="lg" class="min-h-11" :label="$t('home.openCalendar')" />
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { CalendarEntryDto } from '~/types/api'
import { eventHeading } from '~/utils/calendar'
import { formatDay } from '~/utils/date'
import { splitInstant } from '~/utils/event'

const { t, locale } = useI18n()
useHead({ title: () => `${t('home.title')} · TeamManix` })
const session = useSessionStore()
const calendar = useCalendar()

const { data, loading, error, reload: load } = useLoad(async () => ({ next: await calendar.next() }))
const loaded = computed(() => data.value !== null)
const next = computed<CalendarEntryDto | null>(() => data.value?.next ?? null)
const heading = computed(() => (next.value ? eventHeading(next.value, key => t(key)) : ''))

onMounted(load)
</script>
