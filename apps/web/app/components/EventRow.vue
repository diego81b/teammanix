<template>
  <li class="flex items-start gap-3 rounded-lg border border-default bg-elevated p-3">
    <UIcon :name="ICONS[event.type]" class="mt-1 size-5 shrink-0 text-muted" aria-hidden="true" />
    <div class="min-w-0 flex-1 space-y-1">
      <p class="flex flex-wrap items-center gap-2">
        <span class="font-semibold" :class="event.status === 'cancelled' ? 'line-through' : ''">{{ title }}</span>
        <UBadge v-if="event.seriesId" color="neutral" variant="subtle" icon="i-tm-calendar" :label="$t('events.seriesBadge')" />
        <UBadge v-if="event.status !== 'scheduled'" :color="event.status === 'cancelled' ? 'error' : 'warning'" variant="subtle" :label="$t(`events.status.${event.status}`)" />
      </p>
      <p class="text-sm text-muted">
        {{ splitInstant(event.start).time }} - {{ splitInstant(event.end).time }}
        <template v-if="teamName"> · {{ teamName }}</template>
        <template v-if="event.title && event.opponent"> · {{ event.opponent.name }}</template>
        <template v-if="event.venue"> · {{ event.venue.name }}</template>
        <template v-if="event.homeAway"> · {{ $t(`events.homeAway.${event.homeAway}`) }}</template>
        <template v-if="event.competition"> · {{ event.competition }}</template>
      </p>
      <p v-if="event.note" class="text-sm">{{ event.note }}</p>
      <NuxtLink
        v-if="event.status !== 'cancelled'"
        :to="`/events/${event.id}/callup`"
        class="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
        :aria-label="$t('callup.openFor', { name: title })"
      >
        <UIcon name="i-tm-users" class="size-4" aria-hidden="true" />
        {{ $t('callup.open') }}
      </NuxtLink>
    </div>
    <slot name="actions" />
  </li>
</template>

<script setup lang="ts">
import type { CalendarEntryDto, EventDto, EventType } from '~/types/api'
import { eventHeading } from '~/utils/calendar'
import { splitInstant } from '~/utils/event'

const props = defineProps<{ event: EventDto | CalendarEntryDto, showTeam?: boolean }>()
const { t } = useI18n()

const ICONS: Record<EventType, string> = { training: 'i-tm-training', match: 'i-tm-match', other: 'i-tm-calendar' }
const title = computed(() => eventHeading(props.event, key => t(key)))
/** Team name, only in calendars that mix teams. */
const teamName = computed(() => (props.showTeam && 'teamName' in props.event ? props.event.teamName : ''))
</script>
