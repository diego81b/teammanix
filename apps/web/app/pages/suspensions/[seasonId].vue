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
        <NuxtLink :to="`/calendar/${seasonId}`" class="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-default">
          <UIcon name="i-tm-chevron-left" class="size-4" aria-hidden="true" />
          {{ $t('suspensions.toCalendar') }}
        </NuxtLink>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold">{{ $t('suspensions.title') }}</h1>
            <p class="text-sm text-muted">{{ data.context.teamName }} · {{ data.context.seasonName }}</p>
          </div>
          <UButton v-if="data.context.canManage" size="lg" class="min-h-11" icon="i-tm-plus" :label="$t('suspensions.add')" @click="openForm(null)" />
        </div>
        <p class="text-sm text-muted">{{ $t('suspensions.teamIntro') }}</p>
        <UAlert v-if="data.context.status === 'closed'" color="neutral" variant="subtle" icon="i-tm-lock" :title="$t('suspensions.closed')" />
        <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />
      </div>

      <p v-if="data.list.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('suspensions.none') }}</p>
      <template v-else>
        <div class="flex gap-1" role="group" :aria-label="$t('calendar.viewLabel')">
          <UButton
            v-for="v in VIEWS"
            :key="v"
            size="lg"
            class="min-h-11"
            :color="view === v ? 'primary' : 'neutral'"
            :variant="view === v ? 'soft' : 'outline'"
            :aria-pressed="view === v"
            :label="$t(v === 'list' ? 'suspensions.viewList' : 'suspensions.viewCalendar')"
            @click="view = v"
          />
        </div>
        <SuspensionCalendar v-if="view === 'calendar'" :suspensions="data.list" :match-days="data.matchDays" />
        <template v-for="g in view === 'list' ? groups : []" :key="g.key">
          <section v-if="g.items.length" class="space-y-2" :aria-label="$t(`suspensions.${g.key}`)">
            <h2 class="text-sm font-semibold text-muted">{{ $t(`suspensions.${g.key}`) }} ({{ g.items.length }})</h2>
            <ul class="space-y-2">
              <SuspensionCard
                v-for="s in g.items"
                :key="s.id"
                :suspension="s"
                :who="personName(s)"
                :can-manage="data.context.canManage"
                @edit="openForm(s)"
                @cancel="askCancel(s)"
              />
            </ul>
          </section>
        </template>
      </template>

      <SuspensionForm
        v-model:open="open.form"
        :season="data.context"
        :people="data.context.people"
        :suspension="editing"
        :used="used"
        @saved="load"
      />

      <UModal v-model:open="open.cancel" :title="$t('suspensions.removeTitle')" :description="$t('suspensions.removeText')">
        <template #footer>
          <UButton color="neutral" variant="outline" size="lg" :label="$t('common.back')" @click="open.cancel = false" />
          <UButton color="error" size="lg" :loading="cancelling" :label="$t('suspensions.cancel')" @click="cancel" />
        </template>
      </UModal>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { SeasonSuspension } from '~/types/api'
import { matchDays } from '~/utils/suspension-calendar'
import { splitSuspensions } from '~/utils/suspension'

const { t } = useI18n()
const route = useRoute()
const toast = useToast()
const suspensions = useSuspensions()
const events = useEvents()
const seasonId = computed(() => String(route.params.seasonId))
useHead({ title: () => `${t('suspensions.title')} · TeamManix` })

const VIEWS = ['list', 'calendar'] as const
const view = ref<(typeof VIEWS)[number]>('list')

const { data, loading, error, reload: load } = useLoad(async () => {
  // The match days only underline the calendar: without them the view still works.
  const [context, list, days] = await Promise.all([
    suspensions.context(seasonId.value),
    suspensions.ofSeason(seasonId.value),
    events.list(seasonId.value).then(matchDays).catch(() => new Set<string>()),
  ])
  return { context, list, matchDays: days }
})

const groups = computed(() => {
  const s = splitSuspensions(data.value?.list ?? [])
  return [
    { key: 'open', items: s.open },
    { key: 'completed', items: s.completed },
  ] as const
})
const personName = (p: { name: string, surname: string | null }) => [p.name, p.surname].filter(Boolean).join(' ')

const open = reactive({ form: false, cancel: false })
const editing = ref<SeasonSuspension | null>(null)
const used = ref<string[]>([])
const errorAction = ref('')

async function openForm(s: SeasonSuspension | null) {
  editing.value = s
  open.form = true
  // Names already used for events are a help: without them the form still works.
  used.value = await events.competitions(seasonId.value).catch(() => [])
}

const toCancel = ref<SeasonSuspension | null>(null)
const cancelling = ref(false)
function askCancel(s: SeasonSuspension) {
  toCancel.value = s
  open.cancel = true
}

async function cancel() {
  if (!toCancel.value) return
  cancelling.value = true
  errorAction.value = ''
  try {
    await suspensions.cancel(toCancel.value.id)
    open.cancel = false
    toast.add({ title: t('suspensions.removed'), color: 'success' })
    await load()
  }
  catch (e) {
    open.cancel = false
    errorAction.value = errorText(e)
  }
  finally {
    cancelling.value = false
  }
}

onMounted(load)
</script>
