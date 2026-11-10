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
        <NuxtLink :to="`/calendar/${seasonId}`" class="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-default">
          <UIcon name="i-tm-chevron-left" class="size-4" aria-hidden="true" />
          {{ $t('teamAbsences.toCalendar') }}
        </NuxtLink>
        <div>
          <h1 class="text-2xl font-bold">{{ $t('teamAbsences.title') }}</h1>
          <p v-if="season" class="text-sm text-muted">{{ season.teamName }} · {{ season.seasonName }}</p>
        </div>
        <p class="text-sm text-muted">{{ $t('teamAbsences.intro') }}</p>
      </div>

      <p v-if="data.rows.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('teamAbsences.none') }}</p>
      <template v-else>
        <p v-if="groups.current.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('teamAbsences.noneCurrent') }}</p>
        <ul v-else class="space-y-2">
          <li v-for="r in groups.current" :key="r.enrollmentId" class="rounded-lg border border-default bg-elevated p-3">
            <p class="font-semibold">{{ fullName(r) }}</p>
            <p class="text-sm text-muted">{{ role(r) }}</p>
            <ul class="mt-2 space-y-1 text-sm">
              <li v-for="a in r.absences" :key="a.startDate">{{ period(a) }}</li>
            </ul>
          </li>
        </ul>

        <UCollapsible v-if="groups.past.length" class="space-y-2">
          <UButton color="neutral" variant="ghost" size="lg" class="min-h-11" trailing-icon="i-tm-chevron-down" :label="$t('teamAbsences.past', { count: groups.past.length })" />
          <template #content>
            <ul class="space-y-2">
              <li v-for="r in groups.past" :key="r.enrollmentId" class="rounded-lg border border-default p-3">
                <p class="font-semibold">{{ fullName(r) }}</p>
                <p class="text-sm text-muted">{{ role(r) }}</p>
                <ul class="mt-2 space-y-1 text-sm text-muted">
                  <li v-for="a in r.absences" :key="a.startDate">{{ period(a) }}</li>
                </ul>
              </li>
            </ul>
          </template>
        </UCollapsible>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { SeasonAbsences } from '~/types/api'
import { splitTeamAbsences } from '~/utils/absence'
import { todayDay } from '~/utils/calendar'
import { formatDate } from '~/utils/date'
import { fullName } from '~/utils/roster'

const { t, locale } = useI18n()
const route = useRoute()
const seasonId = computed(() => String(route.params.seasonId))
const absences = useAbsences()
const calendar = useCalendar()

const { data, loading, error, reload: load } = useLoad(async () => {
  const [rows, seasons] = await Promise.all([absences.ofSeason(seasonId.value), calendar.seasons()])
  return { rows, seasons }
})
useHead({ title: () => `${t('teamAbsences.title')} · TeamManix` })

const season = computed(() => data.value?.seasons.find(s => s.seasonId === seasonId.value) ?? null)
const groups = computed(() => splitTeamAbsences(data.value?.rows ?? [], todayDay()))

const role = (r: SeasonAbsences) => (r.type === 'staff' ? t(`staffRole.${r.staffRole ?? 'other'}`) : t('enrollmentType.player'))
const period = (a: { startDate: string, endDate: string | null }) => a.endDate
  ? t('absences.period', { from: formatDate(a.startDate, locale.value), to: formatDate(a.endDate, locale.value) })
  : t('absences.periodOpen', { from: formatDate(a.startDate, locale.value) })

onMounted(load)
</script>
