<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="space-y-1">
        <h1 class="text-2xl font-bold">{{ $t('structure.title') }}</h1>
        <p class="text-sm text-muted">{{ $t(`structure.unit.${clubTerm}.text`) }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton color="neutral" variant="outline" icon="i-tm-plus" size="lg" class="min-h-11" :label="$t('structure.newSection')" @click="openSection(null)" />
        <UButton icon="i-tm-plus" size="lg" class="min-h-11" :label="$t(`structure.unit.${clubTerm}.newTeam`)" @click="open.team = true" />
      </div>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>

    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <div v-else-if="data && data.teams.length === 0 && data.sections.length === 0" class="rounded-lg border border-dashed border-default p-8 text-center">
      <UIcon name="i-tm-building" class="mx-auto mb-3 size-8 text-muted" />
      <p class="font-semibold">{{ $t(`structure.unit.${clubTerm}.emptyTitle`) }}</p>
      <p class="mt-1 text-sm text-muted">{{ $t(`structure.unit.${clubTerm}.emptyText`) }}</p>
    </div>

    <section v-for="g in groups" :key="g.section?.id ?? 'none'" class="space-y-3" :aria-labelledby="grouped ? `sec${g.section?.id ?? 'none'}` : undefined">
      <div v-if="grouped" class="flex flex-wrap items-center justify-between gap-2">
        <h2 :id="`sec${g.section?.id ?? 'none'}`" class="text-lg font-semibold">{{ g.section?.name ?? $t('structure.noSection') }}</h2>
        <UDropdownMenu v-if="g.section" :items="sectionMenu(g.section)" :content="{ align: 'end' }">
          <UButton color="neutral" variant="ghost" icon="i-tm-dots-v" class="min-h-11 min-w-11" :aria-label="$t('structure.sectionActions', { name: g.section.name })" />
        </UDropdownMenu>
      </div>

      <p v-if="g.teams.length === 0" class="rounded-lg border border-dashed border-default p-4 text-sm text-muted">{{ $t(`structure.unit.${clubTerm}.noTeam`) }}</p>

      <article v-for="s in g.teams" :key="s.id" class="rounded-lg border border-default bg-elevated">
        <header class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-4 py-3">
          <div class="min-w-0">
            <h3 class="font-semibold">{{ s.name }}</h3>
            <p class="text-sm text-muted">
              {{ [sportName(s.sportProfile), s.category, s.gender ? $t(`gender.${s.gender}`) : null].filter(Boolean).join(' · ') }}
            </p>
          </div>
          <div class="flex items-center gap-1">
            <UButton
              v-if="!hasDraft(s)"
              color="neutral"
              variant="ghost"
              icon="i-tm-plus"
              class="min-h-11"
              :label="$t('structure.newSeason')"
              @click="openSeason(s)"
            />
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-tm-edit"
              class="min-h-11 min-w-11"
              :aria-label="$t(`structure.unit.${unitTermOf(profiles, s.sportProfile)}.editTeamAria`, { name: s.name })"
              @click="openEditTeam(s)"
            />
          </div>
        </header>
        <ul v-if="s.seasons.length" class="divide-y divide-default">
          <li v-for="st in s.seasons" :key="st.id">
            <NuxtLink :to="`/seasons/${st.id}`" class="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-muted">
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ st.name }}</span>
                <span class="block text-sm text-muted">{{ formatDate(st.startDate, locale) }} - {{ formatDate(st.endDate, locale) }}</span>
              </span>
              <UBadge :color="seasonStatusItem(st.status)" variant="subtle" :label="$t(`status.season.${st.status}`)" />
              <UIcon name="i-tm-chevron-right" class="size-5 text-muted" aria-hidden="true" />
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="px-4 py-3 text-sm text-muted">{{ $t('structure.noSeason') }}</p>
      </article>
    </section>

    <StructureNewTeam v-model:open="open.team" :term="clubTerm" :profiles="profiles" :sections="sections" @created="onTeamCreated" />
    <StructureSuggestedRoles v-model:open="open.suggested" :sport="sportName(suggestion.sportProfile)" :sport-profile="suggestion.sportProfile" :choices="suggestion.choices" />
    <StructureEditTeam v-model:open="open.editTeam" :term="choiceTerm" :team="choiceTeam" :sections="sections" :profiles="profiles" @saved="load" />
    <StructureSection v-model:open="open.section" :term="clubTerm" :section="choiceSection" @saved="load" />
    <StructureDeleteSection v-model:open="open.deleteSection" :term="clubTerm" :section="choiceSection" @done="load" />
    <StructureNewSeason v-model:open="open.season" :term="choiceTerm" :team="choiceTeam" @created="(id: string) => navigateTo(`/seasons/${id}`)" />
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { SectionDto, SportProfileDto, TeamTree } from '~/types/api'
import { formatDate } from '~/utils/date'
import { seasonStatusItem } from '~/utils/season'
import { pendingSuggestions, type SuggestedChoice } from '~/utils/staff-role'
import { clubUnitTerm, groupTeams, unitTermOf } from '~/utils/structure'

const { t, te, locale } = useI18n()
useHead({ title: () => `${t('structure.title')} · TeamManix` })

const structure = useStructure()
const { data, loading, error, reload: load } = useLoad(() => structure.tree())
const profiles = ref<SportProfileDto[]>([])
const open = reactive({ team: false, editTeam: false, section: false, deleteSection: false, season: false, suggested: false })
const staffRoles = useStaffRoles()
const suggestion = reactive<{ sportProfile: string, choices: SuggestedChoice[] }>({ sportProfile: '', choices: [] })
const choiceTeam = ref<TeamTree | null>(null)
const choiceSection = ref<SectionDto | null>(null)

const sections = computed(() => data.value?.sections ?? [])
const view = computed(() => groupTeams(sections.value, data.value?.teams ?? []))
const grouped = computed(() => view.value.grouped)
// Without any team or section the empty message replaces the (single, empty) group.
const groups = computed(() => (data.value && (data.value.teams.length || data.value.sections.length) ? view.value.groups : []))

// The club says "gruppo" only when all its teams are groups; the dialog of one team follows that team's discipline.
const clubTerm = computed(() => clubUnitTerm(profiles.value, data.value?.teams ?? []))
const choiceTerm = computed(() => unitTermOf(profiles.value, choiceTeam.value?.sportProfile))

const hasDraft = (s: TeamTree) => s.seasons.some(x => x.status === 'draft')
const sportName = (code: string) => (te(`sport.${code}`) ? t(`sport.${code}`) : code)

function onTeamCreated(sportProfile: string) {
  load()
  offerSuggestedRoles(sportProfile)
}
/** After a team is created: the roles its sport suggests that the club does not have yet, only if there are any. Nothing is added unless the admin chooses. */
async function offerSuggestedRoles(sportProfile: string) {
  const profile = profiles.value.find(p => p.code === sportProfile)
  if (!profile?.suggestedStaffRoles.length) return
  try {
    const pending = pendingSuggestions(profile.suggestedStaffRoles, await staffRoles.list(), code => t(`staffRole.${code}`))
    if (!pending.length) return
    suggestion.sportProfile = sportProfile
    suggestion.choices = pending
    open.suggested = true
  }
  catch {
    // The offer is optional and the roles are always in the settings: a failed read must not get in the way.
  }
}
function openSection(s: SectionDto | null) {
  choiceSection.value = s
  open.section = true
}
function openEditTeam(s: TeamTree) {
  choiceTeam.value = s
  open.editTeam = true
}
function openSeason(s: TeamTree) {
  choiceTeam.value = s
  open.season = true
}
function sectionMenu(s: SectionDto): DropdownMenuItem[][] {
  return [[
    { label: t('structure.renameSection'), icon: 'i-tm-edit', onSelect: () => openSection(s) },
    { label: t('common.delete'), icon: 'i-tm-trash', color: 'error', onSelect: () => {
      choiceSection.value = s
      open.deleteSection = true
    } },
  ]]
}

onMounted(async () => {
  await load()
  try {
    profiles.value = await structure.profiles()
  }
  catch { /* without profiles the sport code is shown */ }
})
</script>
