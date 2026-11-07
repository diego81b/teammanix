<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-bold md:text-3xl">{{ $t('home.greeting', { name: session.user?.name ?? '' }) }}</h1>
      <p class="text-muted">{{ session.active?.name }}</p>
    </div>

    <UCard :ui="{ root: 'rounded-2xl' }">
      <div class="flex items-start gap-3">
        <UIcon name="i-tm-calendar" class="mt-0.5 size-6 shrink-0 text-primary" />
        <div class="space-y-1">
          <h2 class="font-semibold">{{ $t('home.soon') }}</h2>
          <p class="text-sm text-muted">
            {{ $t('home.soonText') }}
          </p>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
useHead({ title: () => `${t('home.title')} · TeamManix` })
const session = useSessionStore()
</script>
