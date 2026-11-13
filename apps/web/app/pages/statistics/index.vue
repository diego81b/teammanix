<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <h1 class="text-2xl font-bold">{{ $t('statistics.mineTitle') }}</h1>
      <p class="text-sm text-muted">{{ $t('statistics.mineIntro') }}</p>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="data">
      <p v-if="data.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('statistics.noEnrollment') }}</p>

      <section v-for="s in data" :key="s.seasonId" class="space-y-3" :aria-label="`${s.teamName} · ${s.seasonName}`">
        <div class="min-w-0">
          <h2 class="truncate font-semibold">{{ s.teamName }}</h2>
          <p class="text-sm text-muted">{{ s.seasonName }}</p>
        </div>
        <div class="rounded-lg border border-default bg-elevated p-4">
          <StatisticsFigures :stats="s.mine" />
        </div>
      </section>

      <p v-if="data.length > 0" class="text-xs text-muted">{{ $t('statistics.rateHint') }} {{ $t('statistics.injuredHint') }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
useHead({ title: () => `${t('statistics.mineTitle')} · TeamManix` })
const statistics = useStatistics()
const { data, loading, error, reload: load } = useLoad(() => statistics.mine())
onMounted(load)
</script>
