<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <h1 class="text-2xl font-bold">{{ $t('suspensions.mineTitle') }}</h1>
      <p class="text-sm text-muted">{{ $t('suspensions.mineIntro') }}</p>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="data">
      <p v-if="data.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('suspensions.noEnrollment') }}</p>

      <section v-for="e in data" :key="e.enrollmentId" class="space-y-3" :aria-label="`${e.teamName} · ${e.seasonName}`">
        <div class="min-w-0">
          <h2 class="truncate font-semibold">{{ e.teamName }}</h2>
          <p class="text-sm text-muted">{{ e.seasonName }}</p>
        </div>
        <p v-if="e.suspensions.length === 0" class="rounded-lg border border-dashed border-default p-4 text-center text-sm text-muted">{{ $t('suspensions.none') }}</p>
        <ul v-else class="space-y-2">
          <SuspensionCard v-for="s in e.suspensions" :key="s.id" :suspension="s" />
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
useHead({ title: () => `${t('suspensions.mineTitle')} · TeamManix` })
const suspensions = useSuspensions()
const { data, loading, error, reload: load } = useLoad(() => suspensions.mine())
onMounted(load)
</script>
