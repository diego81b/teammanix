<template>
  <div class="min-h-dvh flex flex-col items-center px-4 pt-[max(2rem,var(--tm-safe-top))] pb-8">
    <NuxtLink to="/" class="mb-8 mt-4" aria-label="TeamManix">
      <TmLogo :height="40" />
    </NuxtLink>
    <main class="w-full max-w-3xl">
      <UCard :ui="{ root: 'rounded-2xl', body: 'p-6 sm:p-10' }">
        <slot />
      </UCard>
    </main>
    <footer class="mt-8 flex flex-col items-center gap-2 text-sm text-muted">
      <LanguageSelector />
      <div class="flex gap-4">
        <NuxtLink to="/terms" class="underline underline-offset-2">{{ $t('legal.terms') }}</NuxtLink>
        <NuxtLink to="/privacy" class="underline underline-offset-2">{{ $t('legal.privacy') }}</NuxtLink>
        <NuxtLink to="/dpa" class="underline underline-offset-2">{{ $t('legal.dpa') }}</NuxtLink>
      </div>
    </footer>
  </div>
</template>
