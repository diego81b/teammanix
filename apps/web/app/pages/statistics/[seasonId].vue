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
          {{ $t('statistics.toCalendar') }}
        </NuxtLink>
        <div>
          <h1 class="text-2xl font-bold">{{ $t('statistics.title') }}</h1>
          <p class="text-sm text-muted">{{ data.teamName }} · {{ data.seasonName }}</p>
        </div>
        <p class="text-sm text-muted">{{ $t(`statistics.intro${data.view === 'full' ? 'Full' : data.view === 'totals' ? 'Totals' : 'Own'}`) }}</p>
      </div>

      <section v-if="data.totals" class="space-y-3" :aria-label="$t('statistics.teamTotals')">
        <h2 class="font-semibold">{{ $t('statistics.teamTotals') }}</h2>
        <div class="rounded-lg border border-default bg-elevated p-4">
          <StatisticsFigures :stats="data.totals" />
        </div>
      </section>

      <section v-if="data.mine" class="space-y-3" :aria-label="$t('statistics.yourFigures')">
        <h2 class="font-semibold">{{ $t('statistics.yourFigures') }}</h2>
        <div class="rounded-lg border border-default bg-elevated p-4">
          <StatisticsFigures :stats="data.mine" />
        </div>
      </section>

      <section v-if="data.view === 'full'" class="space-y-3" :aria-label="$t('statistics.players')">
        <h2 class="font-semibold">{{ $t('statistics.players') }}</h2>
        <p v-if="data.rows.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('statistics.none') }}</p>
        <ul v-else class="space-y-2">
          <li v-for="r in data.rows" :key="r.enrollmentId" class="space-y-3 rounded-lg border border-default bg-elevated p-4" :aria-label="$t('statistics.rowAria', { name: rowName(r, t) })">
            <p class="font-semibold">{{ rowName(r, t) }}</p>
            <StatisticsFigures :stats="r" />
          </li>
        </ul>
      </section>

      <p v-if="data.view !== 'totals'" class="text-xs text-muted">{{ $t('statistics.rateHint') }} {{ $t('statistics.injuredHint') }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { rowName } from '~/utils/attendance'

const { t } = useI18n()
const route = useRoute()
const seasonId = computed(() => String(route.params.seasonId))
const statistics = useStatistics()

const { data, loading, error, reload: load } = useLoad(() => statistics.ofSeason(seasonId.value))
useHead({ title: () => `${t('statistics.title')} · TeamManix` })
onMounted(load)
</script>
