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
          {{ $t('teamRoster.toCalendar') }}
        </NuxtLink>
        <div>
          <h1 class="text-2xl font-bold">{{ $t('teamRoster.title') }}</h1>
          <p class="text-sm text-muted">{{ data.teamName }} · {{ data.seasonName }}</p>
        </div>
        <p class="text-sm text-muted">{{ $t('teamRoster.intro') }}</p>
        <p class="text-sm text-muted" role="status">{{ $t('season.count', { players: count.players, staff: count.staff }) }}</p>
        <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />
      </div>

      <p v-if="data.rows.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('teamRoster.none') }}</p>
      <ul v-else class="space-y-2">
        <li v-for="r in data.rows" :key="r.id" class="rounded-lg border border-default bg-elevated p-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-semibold">{{ fullName(r) }}<span v-if="r.jerseyNumber !== null" class="ml-2 text-sm font-normal text-muted">#{{ r.jerseyNumber }}</span></p>
              <p class="text-sm text-muted">{{ roleRow(r) }}</p>
              <div v-if="r.type === 'player'" class="mt-2 flex flex-wrap gap-2">
                <UBadge :color="r.status === 'available' ? 'success' : 'warning'" variant="subtle" :label="$t(`status.enrollment.${r.status}`)" />
                <UBadge v-if="r.certificate" :color="variantCertificate(r.certificate.status)" variant="subtle" :label="$t(`status.certificate.${r.certificate.status}`)" />
              </div>
            </div>
            <div v-if="statusAction(r, data.canSetStatus)" class="flex shrink-0 flex-col items-end gap-2 sm:flex-row">
              <UButton
                v-if="r.status !== 'injured'"
                color="neutral"
                variant="ghost"
                size="lg"
                class="min-h-11"
                icon="i-tm-calendar"
                :label="$t('teamRoster.expectedAction')"
                @click="openExpected(r)"
              />
              <UButton
                color="neutral"
                variant="outline"
                size="lg"
                class="min-h-11"
                :loading="busy === r.id"
                :label="$t(statusLabel(r))"
                @click="change(r)"
              />
            </div>
          </div>
          <p v-if="probablyInjured(r)" class="mt-2 flex items-start gap-1 text-sm text-warning">
            <UIcon name="i-tm-warning" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{{ $t('teamRoster.probablyInjured', { date: formatDate(probablyInjured(r)!.returnDate, locale) }) }}</span>
          </p>
        </li>
      </ul>
    </template>
    <ExpectedInjury v-model:open="expectedOpen" :row="expectedRow" @saved="load" />
  </div>
</template>

<script setup lang="ts">
import type { ExpectedPeriod, RosterRow } from '~/types/api'
import { variantCertificate } from '~/utils/certificate'
import { formatDate } from '~/utils/date'
import { countRoster, fullName, probablyInjured, statusAction } from '~/utils/roster'
import { labelPosition } from '~/utils/sport'

const { t, te, locale } = useI18n()
const route = useRoute()
const seasonId = computed(() => String(route.params.seasonId))
const people = usePeople()

const { data, loading, error, reload: load } = useLoad(() => people.teamRoster(seasonId.value))
useHead({ title: () => `${t('teamRoster.title')} · TeamManix` })

const count = computed(() => countRoster(data.value?.rows ?? []))
const roleRow = (r: RosterRow) => (r.type === 'staff' ? t(`staffRole.${r.staffRole ?? 'other'}`) : (labelPosition(r.position, te, t) ?? t('enrollmentType.player')))

type Row = RosterRow & { expectedInjury: ExpectedPeriod | null }

/** Marking injured a probably injured player is confirming the injury (#21): same action, clearer words. */
const statusLabel = (r: Row) =>
  statusAction(r, true) === 'available' ? 'teamRoster.markAvailable' : probablyInjured(r) ? 'teamRoster.confirmInjury' : 'teamRoster.markInjured'

const expectedOpen = ref(false)
const expectedRow = ref<Row | null>(null)
function openExpected(r: Row) {
  expectedRow.value = r
  expectedOpen.value = true
}

const busy = ref('')
const errorAction = ref('')
/** The API shares the state with the person's other teams: reloading shows the result as it is stored. */
async function change(r: RosterRow) {
  const next = statusAction(r, true)
  if (!next) return
  busy.value = r.id
  errorAction.value = ''
  try {
    await people.setStatus(r.id, next)
    await load()
  }
  catch (e) {
    errorAction.value = errorText(e)
  }
  finally {
    busy.value = ''
  }
}

onMounted(load)
</script>
