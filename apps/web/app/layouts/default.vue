<template>
  <div class="min-h-dvh">
    <a href="#content" class="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-default focus:px-3 focus:py-2">
      {{ $t('shell.goToContent') }}
    </a>

    <header
      class="sticky top-0 z-[100] flex items-center gap-3 border-b border-default bg-elevated px-4 pt-[var(--tm-safe-top)] md:px-6"
      style="height: calc(var(--tm-header-h) + var(--tm-safe-top))"
    >
      <NuxtLink to="/" :aria-label="$t('shell.homeAria')">
        <TmLogo :height="28" />
      </NuxtLink>
      <span v-if="session.active" class="ml-2 hidden truncate text-sm font-semibold sm:block" style="font-family: var(--font-heading)">
        {{ session.active.name }}
      </span>
      <div class="ml-auto">
        <UDropdownMenu :items="menu" :content="{ align: 'end' }">
          <UButton
            color="neutral"
            variant="ghost"
            size="lg"
            icon="i-tm-user"
            :label="session.user?.name"
            trailing-icon="i-tm-chevron-down"
            :aria-label="$t('shell.menuAccount')"
            class="min-h-11"
          />
        </UDropdownMenu>
      </div>
    </header>

    <div class="mx-auto flex" style="max-width: calc(var(--tm-content-max) + var(--tm-sidebar-w))">
      <nav
        class="sticky hidden shrink-0 flex-col gap-1 p-4 md:flex"
        style="width: var(--tm-sidebar-w); top: var(--tm-header-h); height: calc(100dvh - var(--tm-header-h))"
        :aria-label="$t('shell.navigation')"
      >
        <UButton
          v-for="v in items"
          :key="v.to"
          :to="v.to"
          :icon="v.icon"
          :label="v.label"
          :color="active(v.to) ? 'primary' : 'neutral'"
          :variant="active(v.to) ? 'soft' : 'ghost'"
          size="xl"
          class="justify-start"
          :aria-current="active(v.to) ? 'page' : undefined"
        />
      </nav>
      <main id="content" class="min-w-0 flex-1 px-4 py-6 pb-[calc(var(--tm-tabbar-h)+var(--tm-safe-bottom)+1.5rem)] md:px-6 md:pb-10">
        <slot />
      </main>
    </div>

    <nav
      class="fixed inset-x-0 bottom-0 z-[100] flex border-t border-default bg-elevated md:hidden"
      style="height: calc(var(--tm-tabbar-h) + var(--tm-safe-bottom)); padding-bottom: var(--tm-safe-bottom)"
      :aria-label="$t('shell.navigation')"
    >
      <NuxtLink
        v-for="v in items"
        :key="v.to"
        :to="v.to"
        class="flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium"
        :class="active(v.to) ? 'text-primary' : 'text-muted'"
        :aria-current="active(v.to) ? 'page' : undefined"
      >
        <UIcon :name="v.icon" class="size-6" />
        {{ v.label }}
      </NuxtLink>
    </nav>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const session = useSessionStore()
const route = useRoute()
const colorMode = useColorMode()
const { t } = useI18n()
const { locale, languages, set } = useLanguage()

// Administration items are for the admin only (the API rejects them for others anyway). Items for other roles arrive with later slices.
const items = computed(() => [
  { label: t('shell.home'), icon: 'i-tm-home', to: '/' },
  ...(session.isAdmin
    ? [
        { label: t('shell.structure'), icon: 'i-tm-building', to: '/structure' },
        { label: t('shell.people'), icon: 'i-tm-users', to: '/people' },
        { label: t('shell.access'), icon: 'i-tm-user-plus', to: '/invitations' },
      ]
    : []),
])
// /stagioni and /archivio are part of Struttura and Persone.
const ROOTS: Record<string, string[]> = { '/structure': ['/structure', '/seasons'], '/people': ['/people', '/archive'] }
const active = (to: string) => (to === '/' ? route.path === '/' : (ROOTS[to] ?? [to]).some(r => route.path === r || route.path.startsWith(`${r}/`)))

const themes = computed(() => [
  { value: 'system', label: t('shell.themeAutomatic'), icon: 'i-tm-monitor' },
  { value: 'light', label: t('shell.themeLight'), icon: 'i-tm-sun' },
  { value: 'dark', label: t('shell.themeDark'), icon: 'i-tm-moon' },
])

const menu = computed<DropdownMenuItem[][]>(() => [
  [{ label: session.user?.email ?? '', type: 'label' }],
  [{ label: t('common.changeClub'), icon: 'i-tm-building', to: '/select-club' }],
  [
    { label: t('shell.theme'), type: 'label' },
    ...themes.value.map(x => ({
      label: x.label,
      icon: x.icon,
      type: 'checkbox' as const,
      checked: colorMode.preference === x.value,
      onSelect: (e: Event) => {
        e.preventDefault()
        colorMode.preference = x.value
      },
    })),
  ],
  [
    { label: t('language.title'), type: 'label' },
    ...languages.map(l => ({
      label: LANGUAGE_NAMES[l],
      type: 'checkbox' as const,
      checked: locale.value === l,
      onSelect: (e: Event) => {
        e.preventDefault()
        void set(l)
      },
    })),
  ],
  [{
    label: t('common.logout'),
    icon: 'i-tm-logout',
    onSelect: async () => {
      session.clear()
      await navigateTo('/login')
    },
  }],
])
</script>
