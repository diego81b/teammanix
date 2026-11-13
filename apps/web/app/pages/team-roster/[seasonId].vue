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
        <li v-for="r in data.rows" :key="r.id" class="flex items-start justify-between gap-3 rounded-lg border border-default bg-elevated p-3">
          <div class="min-w-0">
            <p class="font-semibold">{{ fullName(r) }}<span v-if="r.jerseyNumber !== null" class="ml-2 text-sm font-normal text-muted">#{{ r.jerseyNumber }}</span></p>
            <p class="text-sm text-muted">{{ roleRow(r) }}</p>
            <div v-if="r.type === 'player'" class="mt-2 flex flex-wrap gap-2">
              <UBadge :color="r.status === 'available' ? 'success' : 'warning'" variant="subtle" :label="$t(`status.enrollment.${r.status}`)" />
              <UBadge v-if="r.certificate" :color="variantCertificate(r.certificate.status)" variant="subtle" :label="$t(`status.certificate.${r.certificate.status}`)" />
            </div>
          </div>
          <UButton
            v-if="statusAction(r, data.canSetStatus)"
            color="neutral"
            variant="outline"
            size="lg"
            class="min-h-11"
            :loading="busy === r.id"
            :label="$t(statusAction(r, data.canSetStatus) === 'injured' ? 'teamRoster.markInjured' : 'teamRoster.markAvailable')"
            @click="change(r)"
          />
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { RosterRow } from '~/types/api'
import { variantCertificate } from '~/utils/certificate'
import { countRoster, fullName, statusAction } from '~/utils/roster'
import { labelPosition } from '~/utils/sport'

const { t, te } = useI18n()
const route = useRoute()
const seasonId = computed(() => String(route.params.seasonId))
const people = usePeople()

const { data, loading, error, reload: load } = useLoad(() => people.teamRoster(seasonId.value))
useHead({ title: () => `${t('teamRoster.title')} · TeamManix` })

const count = computed(() => countRoster(data.value?.rows ?? []))
const roleRow = (r: RosterRow) => (r.type === 'staff' ? t(`staffRole.${r.staffRole ?? 'other'}`) : (labelPosition(r.position, te, t) ?? t('enrollmentType.player')))

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
