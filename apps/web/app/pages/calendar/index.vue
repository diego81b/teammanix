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
        <h1 class="text-2xl font-bold">{{ $t('calendar.mine') }}</h1>
        <CalendarSwitch current="me" :seasons="data.seasons" :has-mine="data.mine.length > 0" />
        <UAlert color="neutral" variant="subtle" icon="i-tm-lock" :title="$t('events.readOnly')" />
      </div>
      <p v-if="data.mine.length === 0 && data.seasons.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        {{ $t('calendar.none') }}
      </p>
      <CalendarView v-else :events="data.mine" show-team />
    </template>
  </div>
</template>

<script setup lang="ts">
import { defaultCalendarPath } from '~/utils/calendar'

const { t } = useI18n()
const calendar = useCalendar()
useHead({ title: () => `${t('calendar.title')} · TeamManix` })

const { data, loading, error, reload } = useLoad(async () => {
  const [mine, seasons] = await Promise.all([calendar.mine(), calendar.seasons()])
  return { mine, seasons }
})

/** Without events of their own (an admin who is not enrolled, a team with nothing planned yet) the person lands on the first team calendar. */
async function load() {
  await reload()
  if (!data.value || data.value.mine.length > 0) return
  const path = defaultCalendarPath(false, data.value.seasons)
  if (path) await navigateTo(path, { replace: true })
}

onMounted(load)
</script>
