<template>
  <div class="space-y-6">
    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="data">
      <div class="space-y-3">
        <NuxtLink :to="back" class="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-default">
          <UIcon name="i-tm-chevron-left" class="size-4" aria-hidden="true" />
          {{ session.isAdmin ? $t('events.backToSeason') : $t('shell.home') }}
        </NuxtLink>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-2xl font-bold">{{ $t('events.title') }}</h1>
          <UButton v-if="data.access.canManage" size="lg" class="min-h-11" icon="i-tm-plus" :label="$t('events.newEvent')" @click="openNew" />
        </div>
        <UAlert v-if="!data.access.canManage" color="neutral" variant="subtle" icon="i-tm-lock" :title="$t('events.readOnly')" />
        <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />
      </div>

      <p v-if="groups.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        {{ $t('events.empty') }}
      </p>

      <section v-for="g in groups" :key="g.day" class="space-y-2" :aria-label="formatDay(g.day, locale)">
        <h2 class="text-sm font-semibold text-muted first-letter:uppercase">{{ formatDay(g.day, locale) }}</h2>
        <ul class="space-y-2">
          <li v-for="e in g.events" :key="e.id" class="flex items-start gap-3 rounded-lg border border-default bg-elevated p-3">
            <UIcon :name="icon(e.type)" class="mt-1 size-5 shrink-0 text-muted" aria-hidden="true" />
            <div class="min-w-0 flex-1 space-y-1">
              <p class="flex flex-wrap items-center gap-2">
                <span class="font-semibold" :class="e.status === 'cancelled' ? 'line-through' : ''">{{ heading(e) }}</span>
                <UBadge v-if="e.status !== 'scheduled'" :color="e.status === 'cancelled' ? 'error' : 'warning'" variant="subtle" :label="$t(`events.status.${e.status}`)" />
              </p>
              <p class="text-sm text-muted">
                {{ splitInstant(e.start).time }} - {{ splitInstant(e.end).time }}
                <template v-if="e.title && e.opponent"> · {{ e.opponent.name }}</template>
                <template v-if="e.venue"> · {{ e.venue.name }}</template>
                <template v-if="e.homeAway"> · {{ $t(`events.homeAway.${e.homeAway}`) }}</template>
                <template v-if="e.competition"> · {{ e.competition }}</template>
              </p>
              <p v-if="e.note" class="text-sm">{{ e.note }}</p>
            </div>
            <UDropdownMenu v-if="data.access.canManage && menu(e).length" :items="menu(e)" :content="{ align: 'end' }">
              <UButton color="neutral" variant="ghost" icon="i-tm-dots-v" class="min-h-11 min-w-11" :aria-label="$t('events.actionsFor', { name: heading(e) })" />
            </UDropdownMenu>
          </li>
        </ul>
      </section>

      <EventForm v-model:open="open.form" :team-id="data.access.teamId" :season-id="seasonId" :event="choice" @saved="load" />
      <UModal
        v-model:open="open.confirm"
        :title="confirm === 'cancel' ? $t('events.cancelTitle') : $t('events.postponeTitle')"
        :description="confirm === 'cancel' ? $t('events.cancelText') : $t('events.postponeText')"
      >
        <template #footer>
          <UButton color="neutral" variant="outline" size="lg" :label="$t('common.back')" @click="open.confirm = false" />
          <UButton
            :color="confirm === 'cancel' ? 'error' : 'primary'"
            size="lg"
            :loading="changing"
            :label="confirm === 'cancel' ? $t('events.cancel') : $t('events.postpone')"
            @click="change"
          />
        </template>
      </UModal>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { EventDto, EventType } from '~/types/api'
import { formatDay } from '~/utils/date'
import { eventActions, groupByDay, splitInstant } from '~/utils/event'

const { t, locale } = useI18n()
const route = useRoute()
const session = useSessionStore()
const events = useEvents()
const seasonId = computed(() => String(route.params.seasonId))
const back = computed(() => (session.isAdmin ? `/seasons/${seasonId.value}` : '/'))

const { data, loading, error, reload: load } = useLoad(async () => {
  const [list, access] = await Promise.all([events.list(seasonId.value), events.access(seasonId.value)])
  return { list, access }
})
const groups = computed(() => groupByDay(data.value?.list ?? []))
useHead({ title: () => `${t('events.title')} · TeamManix` })

const ICONS: Record<EventType, string> = { training: 'i-tm-training', match: 'i-tm-match', other: 'i-tm-calendar' }
const icon = (type: EventType) => ICONS[type]
/** Title if there is one, else opponent for a match, else the type name. */
const heading = (e: EventDto) => e.title || (e.opponent ? `${t('events.type.match')}: ${e.opponent.name}` : t(`events.type.${e.type}`))

const open = reactive({ form: false, confirm: false })
const choice = ref<EventDto | null>(null)
const confirm = ref<'cancel' | 'postpone'>('cancel')

function openNew() {
  choice.value = null
  open.form = true
}

function menu(e: EventDto): DropdownMenuItem[][] {
  const can = eventActions(e.status)
  const ask = (what: 'cancel' | 'postpone') => () => {
    choice.value = e
    confirm.value = what
    open.confirm = true
  }
  const items: DropdownMenuItem[] = []
  if (can.edit) items.push({ label: t('common.edit'), icon: 'i-tm-edit', onSelect: () => { choice.value = e; open.form = true } })
  if (can.postpone) items.push({ label: t('events.postpone'), icon: 'i-tm-clock', onSelect: ask('postpone') })
  if (can.cancel) items.push({ label: t('events.cancel'), icon: 'i-tm-calendar-x', color: 'error' as const, onSelect: ask('cancel') })
  return items.length ? [items] : []
}

const errorAction = ref('')
const changing = ref(false)
async function change() {
  if (!choice.value) return
  changing.value = true
  errorAction.value = ''
  try {
    if (confirm.value === 'cancel') await events.cancel(choice.value.id)
    else await events.postpone(choice.value.id)
    open.confirm = false
    await load()
  }
  catch (e) {
    open.confirm = false
    errorAction.value = errorText(e)
  }
  finally {
    changing.value = false
  }
}

onMounted(load)
</script>
