<template>
  <dl class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
    <div v-for="f in figures" :key="f.key" class="min-w-0">
      <dt class="text-xs text-muted">{{ $t(`statistics.figure.${f.key}`) }}</dt>
      <dd class="text-lg font-semibold tabular-nums">{{ f.value }}</dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
import type { StatisticsTotals } from '~/types/api'
import { statisticsFigures } from '~/utils/statistics'

/** The figures of one player or of the whole team (#20), always in the same order. */
const props = defineProps<{ stats: StatisticsTotals }>()
const figures = computed(() => statisticsFigures(props.stats))
</script>
