<template>
  <nav :aria-label="$t('language.choose')" class="flex flex-wrap items-center justify-center gap-x-1">
    <button
      v-for="l in languages"
      :key="l"
      type="button"
      :lang="l"
      class="min-h-11 rounded-md px-3 text-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="l === locale ? 'font-semibold text-default' : 'text-muted'"
      :aria-current="l === locale ? 'true' : undefined"
      @click="set(l)"
    >
      {{ LANGUAGE_NAMES[l] }}
    </button>
  </nav>
</template>

<script setup lang="ts">
const { locale, languages, set } = useLanguage()
</script>
