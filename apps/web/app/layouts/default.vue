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
      <div class="ml-auto flex items-center gap-1">
        <UChip :text="badge" :show="!!badge" size="2xl" color="error" inset>
          <UButton
            to="/notifications"
            color="neutral"
            variant="ghost"
            size="lg"
            icon="i-tm-bell"
            :aria-label="badge ? $t('shell.notificationsUnread', { count: notifications.unread }) : $t('shell.notifications')"
            class="min-h-11 min-w-11"
          />
        </UChip>
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

    <div class="flex">
      <nav
        class="sticky hidden shrink-0 flex-col gap-4 overflow-y-auto p-4 md:flex"
        style="width: var(--tm-sidebar-w); top: var(--tm-header-h); height: calc(100dvh - var(--tm-header-h))"
        :aria-label="$t('shell.navigation')"
      >
        <div
          v-for="g in groups"
          :key="g.id"
          class="flex flex-col gap-1"
          :role="groups.length > 1 ? 'group' : undefined"
          :aria-labelledby="groups.length > 1 ? `nav-${g.id}` : undefined"
        >
          <p v-if="groups.length > 1" :id="`nav-${g.id}`" class="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {{ $t(`shell.groups.${g.id}`) }}
          </p>
          <UButton
            v-for="e in g.entries"
            :key="e.to"
            :to="e.to"
            :icon="e.icon"
            :label="$t(tabLabelKey(e.key, unit.term))"
            :color="active(e.to) ? 'primary' : 'neutral'"
            :variant="active(e.to) ? 'soft' : 'ghost'"
            size="xl"
            class="justify-start"
            :aria-current="active(e.to) ? 'page' : undefined"
          />
        </div>
      </nav>
      <main id="content" class="min-w-0 flex-1 py-6 pb-[calc(var(--tm-tabbar-h)+var(--tm-safe-bottom)+1.5rem)] md:pb-10">
        <div class="tm-container" data-layout="content">
          <slot />
        </div>
      </main>
    </div>

    <nav
      class="fixed inset-x-0 bottom-0 z-[100] flex border-t border-default bg-elevated md:hidden"
      style="height: calc(var(--tm-tabbar-h) + var(--tm-safe-bottom)); padding-bottom: var(--tm-safe-bottom)"
      :aria-label="$t('shell.navigation')"
    >
      <NuxtLink
        v-for="e in mobile.tabs"
        :key="e.to"
        :to="e.to"
        class="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-xs font-medium"
        :class="active(e.to) ? 'text-primary' : 'text-muted'"
        :aria-current="active(e.to) ? 'page' : undefined"
      >
        <UIcon :name="e.icon" class="size-6" />
        <span class="max-w-full truncate">{{ $t(tabLabelKey(e.key, unit.term)) }}</span>
      </NuxtLink>

      <USlideover
        v-if="mobile.more.length > 0"
        v-model:open="moreOpen"
        side="bottom"
        :title="$t('shell.more')"
        :description="$t('shell.moreText')"
        :ui="{ description: 'sr-only', close: 'top-1.5' }"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-xs font-medium"
          :class="moreActive || moreOpen ? 'text-primary' : 'text-muted'"
        >
          <UIcon name="i-tm-more" class="size-6" />
          <span class="max-w-full truncate">{{ $t('shell.more') }}</span>
        </button>

        <template #body>
          <div
            v-for="g in mobile.more"
            :key="g.id"
            class="mb-4 flex flex-col gap-1 last:mb-0"
            role="group"
            :aria-labelledby="`more-${g.id}`"
          >
            <p :id="`more-${g.id}`" class="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {{ $t(`shell.groups.${g.id}`) }}
            </p>
            <UButton
              v-for="e in g.entries"
              :key="e.to"
              :to="e.to"
              :icon="e.icon"
              :label="$t(tabLabelKey(e.key, unit.term))"
              :color="active(e.to) ? 'primary' : 'neutral'"
              :variant="active(e.to) ? 'soft' : 'ghost'"
              size="xl"
              class="min-h-11 justify-start"
              :aria-current="active(e.to) ? 'page' : undefined"
              @click="moreOpen = false"
            />
          </div>
        </template>
      </USlideover>
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
const notifications = useNotificationsStore()
const unit = useUnitStore()
const push = usePush()
const badge = computed(() => unreadBadge(notifications.unread))

// The bell follows the server: on start, on every navigation, when the tab comes back and once a minute while it stays open.
const refresh = () => void notifications.refresh()
const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  refresh()
  document.addEventListener('visibilitychange', onVisible)
  timer = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 60_000)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
  clearInterval(timer)
})
watch(() => [route.path, session.activeClubId], refresh)

// The club unit term ("team" or "group") names the teams entry; it follows the club and the role, and the structure page refreshes it.
watch(() => [session.token, session.activeClubId, session.isAdmin], () => void unit.refresh(), { immediate: true })

// What each role sees, and how it splits between the tab bar and the sheet, is decided by utils/navigation.
const audience = computed(() => ({ admin: session.isAdmin, linked: !!session.active?.linkedToPerson, modules: session.active?.modules }))
const groups = computed(() => navGroups(audience.value))
const mobile = computed(() => mobileNav(audience.value))
const active = (to: string) => isNavActive(route.path, to)
const moreOpen = ref(false)
const moreActive = computed(() => mobile.value.more.some(g => g.entries.some(e => active(e.to))))
watch(() => route.path, () => { moreOpen.value = false })

const themes = computed(() => [
  { value: 'system', label: t('shell.themeAutomatic'), icon: 'i-tm-monitor' },
  { value: 'light', label: t('shell.themeLight'), icon: 'i-tm-sun' },
  { value: 'dark', label: t('shell.themeDark'), icon: 'i-tm-moon' },
])

const menu = computed<DropdownMenuItem[][]>(() => [
  [{ label: session.user?.email ?? '', type: 'label' }],
  [
    { label: t('shell.profile'), icon: 'i-tm-user', to: '/profile' },
    { label: t('common.changeClub'), icon: 'i-tm-building', to: '/select-club' },
  ],
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
      // This device must stop receiving the alerts of the account that leaves; needs the token, so before clearing.
      await push.release()
      notifications.set(0)
      session.clear()
      await navigateTo('/login')
    },
  }],
])
</script>
