<template>
  <UApp :toaster="{ position: 'top-center' }" :locale="localeUi[locale]">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
import { en, fr, it } from '@nuxt/ui/locale'

const { locale } = useI18n()
const localeUi = { it, en, fr } as const

// <html lang> follows the chosen language (screen readers, spell checking, browser automatic translation).
useHead({ htmlAttrs: { lang: () => locale.value } })
</script>
