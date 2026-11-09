<template>
  <UFormField v-if="items.length > 1" :label="$t('calendar.switchLabel')">
    <USelect :model-value="current" :items="items" size="xl" class="w-full sm:w-80" @update:model-value="pick" />
  </UFormField>
</template>

<script setup lang="ts">
import type { CalendarSeasonDto } from '~/types/api'
import { calendarChoices, calendarPath } from '~/utils/calendar'

/** Picker between the personal calendar and the calendar of each team season the person can open. Hidden when there is nothing to pick. */
const props = defineProps<{
  /** `me` or a season id. */
  current: string
  seasons: readonly CalendarSeasonDto[]
  hasMine: boolean
}>()

const { t } = useI18n()
const items = computed(() =>
  calendarChoices(props.seasons, props.hasMine).map(c => ({
    value: c.value,
    label: c.season
      ? t(c.season.seasonStatus === 'closed' ? 'calendar.teamOptionClosed' : 'calendar.teamOption', { team: c.season.teamName, season: c.season.seasonName })
      : t('calendar.mine'),
  })),
)

function pick(value: unknown) {
  if (typeof value === 'string' && value !== props.current) navigateTo(calendarPath(value))
}
</script>
