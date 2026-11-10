<template>
  <div class="space-y-6">
    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="context">
      <div class="space-y-3">
        <NuxtLink to="/structure" class="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-default">
          <UIcon name="i-tm-chevron-left" class="size-4" aria-hidden="true" />
          {{ $t('structure.title') }}
        </NuxtLink>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1">
            <h1 class="text-2xl font-bold">{{ context.season.name }}</h1>
            <p class="text-sm text-muted">{{ context.activity.name }} · {{ context.team.name }}</p>
            <p class="flex flex-wrap items-center gap-2 text-sm">
              <UBadge :color="seasonStatusItem(context.season.status)" variant="subtle" :label="$t(`status.season.${context.season.status}`)" />
              <span class="text-muted">{{ formatDate(context.season.startDate, locale) }} - {{ formatDate(context.season.endDate, locale) }}</span>
              <span v-if="context.season.league" class="text-muted">· {{ context.season.league }}</span>
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              color="neutral"
              variant="outline"
              size="lg"
              class="min-h-11"
              icon="i-tm-calendar"
              :to="`/calendar/${context.season.id}`"
              :label="$t('events.calendar')"
            />
            <UButton
              color="neutral"
              variant="outline"
              size="lg"
              class="min-h-11"
              icon="i-tm-calendar-x"
              :to="`/team-absences/${context.season.id}`"
              :label="$t('teamAbsences.title')"
            />
            <UButton
              v-if="context.season.status === 'draft'"
              size="lg"
              class="min-h-11"
              icon="i-tm-play-circle"
              :loading="activating"
              :label="$t('season.active')"
              @click="active"
            />
            <UButton
              v-if="context.season.status === 'active'"
              color="neutral"
              variant="outline"
              size="lg"
              class="min-h-11"
              icon="i-tm-archive"
              :to="`/seasons/${context.season.id}/new`"
              :label="$t('season.closeAndCreate')"
            />
            <UButton
              v-if="context.season.status === 'active'"
              color="error"
              variant="outline"
              size="lg"
              class="min-h-11"
              icon="i-tm-lock"
              :label="$t('season.close')"
              @click="open.closeSeason = true"
            />
            <UButton
              v-if="context.season.status === 'closed' && !context.hasDraft"
              color="neutral"
              variant="outline"
              size="lg"
              class="min-h-11"
              icon="i-tm-plus"
              :to="`/seasons/${context.season.id}/new`"
              :label="$t('season.newFromThis')"
            />
          </div>
        </div>
        <UAlert v-if="context.season.status === 'closed'" color="neutral" variant="subtle" icon="i-tm-lock" :title="$t('season.closedOnlyReading')" />
        <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />
      </div>

      <section class="space-y-4" aria-labelledby="titolo-rosa">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="title-roster" class="text-lg font-semibold">{{ $t('season.roster') }}</h2>
            <p class="text-sm text-muted" role="status">{{ $t('season.count', { players: count.players, staff: count.staff }) }}</p>
          </div>
          <UButton
            v-if="editable"
            icon="i-tm-user-plus"
            size="lg"
            class="min-h-11"
            :label="$t('season.addPeople')"
            @click="open.enroll = true"
          />
        </div>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UInput v-model="filters.q" type="search" size="xl" icon="i-tm-search" class="w-full lg:col-span-2" :placeholder="$t('season.search')" :aria-label="$t('season.search')" />
          <USelect v-model="filters.status" :items="optionsStatus" size="xl" class="w-full" :aria-label="$t('season.status')" />
          <USelect v-model="filters.certificate" :items="certificateOptions" size="xl" class="w-full" :aria-label="$t('certificate.title')" />
        </div>

        <p v-if="visible.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
          {{ roster.length === 0 ? $t('season.emptyRoster') : $t('common.noResult') }}
        </p>

        <template v-else>
          <table class="hidden w-full text-left text-sm md:table">
            <caption class="sr-only">{{ $t('season.roster') }}</caption>
            <thead class="border-b border-default text-muted">
              <tr>
                <th scope="col" class="py-2 pr-3 font-medium">{{ $t('person.name') }}</th>
                <th scope="col" class="px-3 py-2 font-medium">{{ $t('season.role') }}</th>
                <th scope="col" class="px-3 py-2 font-medium">{{ $t('season.jersey') }}</th>
                <th scope="col" class="px-3 py-2 font-medium">{{ $t('season.status') }}</th>
                <th scope="col" class="px-3 py-2 font-medium">{{ $t('certificate.title') }}</th>
                <th scope="col" class="py-2 pl-3"><span class="sr-only">{{ $t('common.actions') }}</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="r in visible" :key="r.id">
                <th scope="row" class="py-3 pr-3 font-medium">
                  <NuxtLink :to="`/people/${r.personId}`" class="hover:underline">{{ fullName(r) }}</NuxtLink>
                </th>
                <td class="px-3 py-3">{{ roleRow(r) }}</td>
                <td class="px-3 py-3">{{ r.jerseyNumber ?? '-' }}</td>
                <td class="px-3 py-3"><UBadge :color="r.status === 'available' ? 'success' : 'warning'" variant="subtle" :label="$t(`status.enrollment.${r.status}`)" /></td>
                <td class="px-3 py-3"><CertificateBadge :summary="r.certificate" /></td>
                <td class="py-3 pl-3 text-right">
                  <UDropdownMenu :items="menuRow(r)" :content="{ align: 'end' }">
                    <UButton color="neutral" variant="ghost" icon="i-tm-dots-v" class="min-h-11 min-w-11" :aria-label="$t('season.actionsFor', { name: fullName(r) })" />
                  </UDropdownMenu>
                </td>
              </tr>
            </tbody>
          </table>

          <ul class="space-y-2 md:hidden">
            <li v-for="r in visible" :key="r.id" class="flex items-start gap-2 rounded-lg border border-default bg-elevated p-3">
              <div class="min-w-0 flex-1 space-y-1">
                <NuxtLink :to="`/people/${r.personId}`" class="block truncate font-semibold">{{ fullName(r) }}</NuxtLink>
                <p class="text-sm text-muted">{{ roleRow(r) }}<template v-if="r.jerseyNumber !== null"> · #{{ r.jerseyNumber }}</template></p>
                <p class="flex flex-wrap gap-2">
                  <UBadge :color="r.status === 'available' ? 'success' : 'warning'" variant="subtle" :label="$t(`status.enrollment.${r.status}`)" />
                  <CertificateBadge :summary="r.certificate" />
                </p>
              </div>
              <UDropdownMenu :items="menuRow(r)" :content="{ align: 'end' }">
                <UButton color="neutral" variant="ghost" icon="i-tm-dots-v" class="min-h-11 min-w-11" :aria-label="$t('season.actionsFor', { name: fullName(r) })" />
              </UDropdownMenu>
            </li>
          </ul>
        </template>
      </section>

      <EnrollPerson v-model:open="open.enroll" :season-id="context.season.id" :positions="positions" @enrolled="load" />
      <EditEnrollment v-model:open="open.edit" :row="choiceRow" :positions="positions" @saved="load" />
      <DisablePerson
        v-model:open="open.disable"
        :person="choiceRow ? { id: choiceRow.personId, name: fullName(choiceRow) } : null"
        :enrollment="choiceRow ? { id: choiceRow.id, team: context.team.name } : null"
        @done="load"
      />
      <UModal v-model:open="open.closeSeason" :title="$t('season.closeTitle', { name: context.season.name })" :description="$t('season.closeText')">
        <template #footer>
          <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open.closeSeason = false" />
          <UButton color="error" size="lg" :loading="closingSeason" :label="$t('season.close')" @click="closeSeason" />
        </template>
      </UModal>
      <UModal v-model:open="open.close" :title="$t('season.closeEnrollmentTitle', { name: choiceRow ? fullName(choiceRow) : '' })" :description="$t('season.closeEnrollmentText')">
        <template #footer>
          <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open.close = false" />
          <UButton color="error" size="lg" :loading="closing" :label="$t('season.closeEnrollment')" @click="closeEnrollment" />
        </template>
      </UModal>
    </template>

    <p v-else-if="data && !context" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
      {{ $t('errors.codes.SEASON_NOT_FOUND') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { RosterRow, CertificateStatus, EnrollmentStatus } from '~/types/api'
import { formatDate } from '~/utils/date'
import { countRoster, filterRoster, fullName } from '~/utils/roster'
import { labelPosition } from '~/utils/sport'
import { seasonStatusItem } from '~/utils/season'

const { t, te, locale } = useI18n()
const route = useRoute()
const id = computed(() => String(route.params.id))
const structure = useStructure()
const people = usePeople()

const { data, loading, error, reload: load } = useLoad(async () => {
  const [tree, roster, profiles] = await Promise.all([structure.tree(), people.roster(id.value), structure.profiles()])
  return { tree, roster, profiles }
})

const context = computed(() => {
  for (const a of data.value?.tree ?? []) {
    for (const team of a.teams) {
      const season = team.seasons.find(s => s.id === id.value)
      if (season) return { activity: a, team, season, hasDraft: team.seasons.some(s => s.status === 'draft') }
    }
  }
  return null
})
const roster = computed(() => data.value?.roster ?? [])
/** Positions of the sport profile of this season's activity. */
const positions = computed(() => data.value?.profiles.find(p => p.code === context.value?.activity.sportProfile)?.positions ?? [])
const editable = computed(() => context.value?.season.status !== 'closed')
useHead({ title: () => `${context.value?.season.name ?? t('season.title')} · TeamManix` })

const ALL = 'all'
const filters = reactive({ q: '', status: ALL, certificate: ALL })
const visible = computed(() => filterRoster(roster.value, {
  q: filters.q,
  ...(filters.status !== ALL ? { status: filters.status as EnrollmentStatus } : {}),
  ...(filters.certificate !== ALL ? { certificate: filters.certificate as CertificateStatus } : {}),
}))
const count = computed(() => countRoster(roster.value))
const optionsStatus = computed(() => [
  { label: t('season.allStates'), value: ALL },
  ...(['available', 'injured'] as EnrollmentStatus[]).map(s => ({ label: t(`status.enrollment.${s}`), value: s })),
])
const certificateOptions = computed(() => [
  { label: t('season.allCertificates'), value: ALL },
  ...(['valid', 'expiring', 'expired', 'missing'] as CertificateStatus[]).map(s => ({ label: t(`status.certificate.${s}`), value: s })),
])

const roleRow = (r: RosterRow) => (r.type === 'staff' ? t(`staffRole.${r.staffRole ?? 'other'}`) : (labelPosition(r.position, te, t) ?? t('enrollmentType.player')))

const open = reactive({ enroll: false, edit: false, disable: false, close: false, closeSeason: false })
const choiceRow = ref<RosterRow | null>(null)

function menuRow(r: RosterRow): DropdownMenuItem[][] {
  const openDialog = (key: keyof typeof open) => () => {
    choiceRow.value = r
    open[key] = true
  }
  return [
    [{ label: t('season.openRecord'), icon: 'i-tm-user', to: `/people/${r.personId}` }],
    ...(editable.value
      ? [[
          { label: t('season.editEnrollment'), icon: 'i-tm-edit', onSelect: openDialog('edit') },
          { label: t('season.closeEnrollment'), icon: 'i-tm-user-minus', onSelect: openDialog('close') },
        ]]
      : []),
    [{ label: t('person.disable'), icon: 'i-tm-user-x', color: 'error' as const, onSelect: openDialog('disable') }],
  ]
}

const errorAction = ref('')
const activating = ref(false)
async function active() {
  activating.value = true
  errorAction.value = ''
  try {
    await structure.active(id.value)
    await load()
  }
  catch (e) {
    errorAction.value = errorText(e)
  }
  finally {
    activating.value = false
  }
}

const closingSeason = ref(false)
async function closeSeason() {
  closingSeason.value = true
  errorAction.value = ''
  try {
    await structure.close(id.value)
    open.closeSeason = false
    await load()
  }
  catch (e) {
    open.closeSeason = false
    errorAction.value = errorText(e)
  }
  finally {
    closingSeason.value = false
  }
}

const closing = ref(false)
async function closeEnrollment() {
  if (!choiceRow.value) return
  closing.value = true
  errorAction.value = ''
  try {
    await people.closeEnrollment(choiceRow.value.id)
    open.close = false
    await load()
  }
  catch (e) {
    open.close = false
    errorAction.value = errorText(e)
  }
  finally {
    closing.value = false
  }
}

onMounted(load)
</script>
