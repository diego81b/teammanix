<template>
  <article class="tm-legale space-y-4">
    <h1 class="text-2xl font-bold md:text-3xl">{{ title }}</h1>
    <UAlert
      v-if="locale !== 'it'"
      color="info"
      variant="subtle"
      icon="i-tm-info"
      :title="$t('legal.onlyItalian')"
    />
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-tm-warning"
      :title="$t('legal.draftTitle')"
      :description="$t('legal.draftText')"
    />
    <div class="tm-legale-corpo space-y-4 leading-relaxed">
      <slot />
    </div>
    <NuxtLink :to="back" class="inline-block text-sm text-primary underline underline-offset-2">{{ $t('common.back') }}</NuxtLink>
  </article>
</template>

<script setup lang="ts">
defineProps<{ title: string }>()
const { locale } = useI18n()
const back = useSessionStore().authenticated ? '/' : '/registration'
</script>

<style scoped>
.tm-legale-corpo :deep(h2) {
  margin-top: 1.75rem;
  font-size: 1.125rem;
  font-weight: 700;
}
.tm-legale-corpo :deep(ul),
.tm-legale-corpo :deep(ol) {
  margin-left: 1.25rem;
  list-style: disc;
}
.tm-legale-corpo :deep(ol) {
  list-style: decimal;
}
.tm-legale-corpo :deep(li) {
  margin-top: 0.25rem;
}
.tm-legale-corpo :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
