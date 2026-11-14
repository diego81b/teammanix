<template>
  <div class="space-y-8">
    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <p v-if="loading && !person" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="person">
      <div class="space-y-3">
        <NuxtLink to="/people" class="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-default">
          <UIcon name="i-tm-chevron-left" class="size-4" aria-hidden="true" />
          {{ $t('person.title') }}
        </NuxtLink>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1">
            <h1 class="text-2xl font-bold">{{ fullName(person) }}</h1>
            <p class="flex flex-wrap items-center gap-2">
              <UBadge v-if="person.disabled" color="neutral" variant="subtle" :label="$t('person.disabled')" />
              <UBadge v-if="person.toComplete" color="warning" variant="subtle" :label="$t('person.toComplete')" />
            </p>
          </div>
          <UButton
            v-if="person.disabled"
            color="neutral"
            variant="outline"
            size="lg"
            class="min-h-11"
            icon="i-tm-user-check"
            :loading="reenabling"
            :label="$t('person.reenable')"
            @click="reenable"
          />
          <UButton v-else color="error" variant="outline" size="lg" class="min-h-11" icon="i-tm-user-x" :label="$t('person.disable')" @click="open.disable = true" />
        </div>
        <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />
      </div>

      <section class="space-y-3" aria-labelledby="titolo-anagrafica">
        <h2 id="title-registry" class="text-lg font-semibold">{{ $t('person.registry') }}</h2>
        <dl class="grid gap-3 rounded-lg border border-default bg-elevated p-4 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-muted">{{ $t('person.email') }}</dt>
            <dd class="font-medium">{{ person.email ?? '-' }}</dd>
          </div>
          <div>
            <dt class="text-muted">{{ $t('person.phone') }}</dt>
            <dd class="font-medium">{{ person.phone ?? '-' }}</dd>
          </div>
          <div>
            <dt class="text-muted">{{ $t('person.birthDate') }}</dt>
            <dd class="font-medium">{{ person.birthDate ? formatDate(person.birthDate, locale) : '-' }}</dd>
          </div>
        </dl>
      </section>

      <section class="space-y-3" aria-labelledby="titolo-iscrizioni">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 id="title-enrollments" class="text-lg font-semibold">{{ $t('person.enrollments') }}</h2>
          <UButton
            v-if="tree && tree.teams.length && !person.disabled"
            color="neutral"
            variant="outline"
            icon="i-tm-plus"
            class="min-h-11"
            :label="$t(`structure.unit.${term}.staffTeams`)"
            @click="open.staffTeams = true"
          />
        </div>
        <p v-if="person.enrollments.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
          {{ $t('person.noEnrollment') }}
        </p>
        <template v-else>
          <table class="hidden w-full text-left text-sm md:table">
            <caption class="sr-only">{{ $t('person.enrollments') }}</caption>
            <thead class="border-b border-default text-muted">
              <tr>
                <th scope="col" class="py-2 pr-3 font-medium">{{ $t('season.title') }}</th>
                <th scope="col" class="px-3 py-2 font-medium">{{ $t('person.team') }}</th>
                <th scope="col" class="px-3 py-2 font-medium">{{ $t('season.role') }}</th>
                <th scope="col" class="px-3 py-2 font-medium">{{ $t('season.status') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="i in person.enrollments" :key="i.id">
                <th scope="row" class="py-3 pr-3 font-medium">
                  <NuxtLink :to="`/seasons/${i.seasonId}`" class="hover:underline">{{ i.season }}</NuxtLink>
                </th>
                <td class="px-3 py-3">{{ teamLabel(i.section, i.team) }}</td>
                <td class="px-3 py-3">{{ enrollmentRole(i) }}</td>
                <td class="px-3 py-3">
                  <UBadge v-if="i.endedAt" color="neutral" variant="subtle" :label="$t('person.closedEnrollment')" />
                  <UBadge v-else :color="i.status === 'available' ? 'success' : 'warning'" variant="subtle" :label="$t(`status.enrollment.${i.status}`)" />
                </td>
              </tr>
            </tbody>
          </table>

          <ul class="space-y-2 md:hidden">
            <li v-for="i in person.enrollments" :key="i.id" class="space-y-1 rounded-lg border border-default bg-elevated p-3">
              <NuxtLink :to="`/seasons/${i.seasonId}`" class="block font-semibold">{{ i.season }}</NuxtLink>
              <p class="text-sm text-muted">{{ teamLabel(i.section, i.team) }}</p>
              <p class="flex flex-wrap items-center gap-2 text-sm">
                {{ enrollmentRole(i) }}
                <UBadge v-if="i.endedAt" color="neutral" variant="subtle" :label="$t('person.closedEnrollment')" />
                <UBadge v-else :color="i.status === 'available' ? 'success' : 'warning'" variant="subtle" :label="$t(`status.enrollment.${i.status}`)" />
              </p>
            </li>
          </ul>
        </template>
      </section>

      <PersonCertificates v-if="!person.disabled" :person-id="person.id" />

      <PersonSuspensions :person="person" />

      <EnrollStaffTeams
        v-if="tree"
        v-model:open="open.staffTeams"
        :person-id="person.id"
        :enrollments="person.enrollments"
        :tree="tree"
        :term="term"
        @enrolled="load"
      />

      <DisablePerson v-model:open="open.disable" :person="{ id: person.id, name: fullName(person) }" @done="load" />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { EnrollmentPersonDto, SportProfileDto, StructureTree } from '~/types/api'
import { formatDate } from '~/utils/date'
import { fullName } from '~/utils/roster'
import { labelPosition } from '~/utils/sport'
import { clubUnitTerm, teamLabel } from '~/utils/structure'

const { t, te, locale } = useI18n()
const route = useRoute()
const id = computed(() => String(route.params.id))
const people = usePeople()
const toast = useToast()

const { data: person, loading, error, reload: load } = useLoad(() => people.detail(id.value))
useHead({ title: () => `${person.value ? fullName(person.value) : t('person.title')} · TeamManix` })

const open = reactive({ disable: false, staffTeams: false })

// Structure and profiles only serve the multi-team action: without them the action is hidden.
const structure = useStructure()
const tree = ref<StructureTree | null>(null)
const profiles = ref<SportProfileDto[]>([])
const term = computed(() => clubUnitTerm(profiles.value, tree.value?.teams ?? []))
const errorAction = ref('')
const reenabling = ref(false)

const enrollmentRole = (i: EnrollmentPersonDto) =>
  i.type === 'staff' ? t(`staffRole.${i.staffRole ?? 'other'}`) : [labelPosition(i.position, te, t) ?? t('enrollmentType.player'), i.jerseyNumber !== null ? `#${i.jerseyNumber}` : ''].filter(Boolean).join(' ')

async function reenable() {
  reenabling.value = true
  errorAction.value = ''
  try {
    await people.reenable(id.value)
    toast.add({ title: t('person.reenabled'), color: 'success' })
    await load()
  }
  catch (e) {
    errorAction.value = errorText(e)
  }
  finally {
    reenabling.value = false
  }
}

onMounted(async () => {
  await load()
  try {
    const [t, p] = await Promise.all([structure.tree(), structure.profiles()])
    tree.value = t
    profiles.value = p
  }
  catch { /* the action stays hidden */ }
})
</script>
