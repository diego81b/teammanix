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
        <CalendarSwitch :current="seasonId" :seasons="data.seasons" :has-mine="data.mine.length > 0" />
        <UAlert v-if="!data.access.canManage" color="neutral" variant="subtle" icon="i-tm-lock" :title="$t('events.readOnly')" />
        <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />
      </div>

      <CalendarView :events="data.list">
        <template #actions="{ event }">
          <UDropdownMenu v-if="data.access.canManage && menu(event as EventDto).length" :items="menu(event as EventDto)" :content="{ align: 'end' }">
            <UButton color="neutral" variant="ghost" icon="i-tm-dots-v" class="min-h-11 min-w-11" :aria-label="$t('events.actionsFor', { name: eventHeading(event, key => t(key)) })" />
          </UDropdownMenu>
        </template>
      </CalendarView>

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
import type { EventDto } from '~/types/api'
import { eventHeading } from '~/utils/calendar'
import { eventActions } from '~/utils/event'

const { t } = useI18n()
const route = useRoute()
const session = useSessionStore()
const events = useEvents()
const calendar = useCalendar()
const seasonId = computed(() => String(route.params.seasonId))
const back = computed(() => (session.isAdmin ? `/seasons/${seasonId.value}` : '/'))

const { data, loading, error, reload: load } = useLoad(async () => {
  const [list, access, mine, seasons] = await Promise.all([
    events.list(seasonId.value),
    events.access(seasonId.value),
    calendar.mine(),
    calendar.seasons(),
  ])
  return { list, access, mine, seasons }
})
useHead({ title: () => `${t('events.title')} · TeamManix` })

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
