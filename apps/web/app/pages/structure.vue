<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="space-y-1">
        <h1 class="text-2xl font-bold">{{ $t('structure.title') }}</h1>
        <p class="text-sm text-muted">{{ $t('structure.text') }}</p>
      </div>
      <UButton icon="i-tm-plus" size="lg" class="min-h-11" :label="$t('structure.newActivity')" @click="open.activity = true" />
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>

    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <div v-else-if="data && data.length === 0" class="rounded-lg border border-dashed border-default p-8 text-center">
      <UIcon name="i-tm-building" class="mx-auto mb-3 size-8 text-muted" />
      <p class="font-semibold">{{ $t('structure.emptyTitle') }}</p>
      <p class="mt-1 text-sm text-muted">{{ $t('structure.emptyText') }}</p>
    </div>

    <section v-for="a in data ?? []" :key="a.id" class="space-y-3" :aria-labelledby="`act${a.id}`">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 :id="`act${a.id}`" class="text-lg font-semibold">{{ a.name }}</h2>
          <p class="text-sm text-muted">{{ sportName(a.sportProfile) }}</p>
        </div>
        <UButton color="neutral" variant="outline" icon="i-tm-plus" class="min-h-11" :label="$t('structure.newTeam')" @click="openTeam(a)" />
      </div>

      <p v-if="a.teams.length === 0" class="rounded-lg border border-dashed border-default p-4 text-sm text-muted">{{ $t('structure.noTeam') }}</p>

      <article v-for="s in a.teams" :key="s.id" class="rounded-lg border border-default bg-elevated">
        <header class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-4 py-3">
          <div>
            <h3 class="font-semibold">{{ s.name }}</h3>
            <p v-if="s.category || s.gender" class="text-sm text-muted">
              {{ [s.category, s.gender ? $t(`gender.${s.gender}`) : null].filter(Boolean).join(' · ') }}
            </p>
          </div>
          <UButton
            v-if="!hasDraft(s)"
            color="neutral"
            variant="ghost"
            icon="i-tm-plus"
            class="min-h-11"
            :label="$t('structure.newSeason')"
            @click="openSeason(s)"
          />
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

    <StructureNewActivity v-model:open="open.activity" :profiles="profiles" @created="load" />
    <StructureNewTeam v-model:open="open.team" :activity="choiceActivity" @created="load" />
    <StructureNewSeason v-model:open="open.season" :team="choiceTeam" @created="(id: string) => navigateTo(`/seasons/${id}`)" />
  </div>
</template>

<script setup lang="ts">
import type { ActivityTree, SportProfileDto, TeamTree } from '~/types/api'
import { formatDate } from '~/utils/date'
import { seasonStatusItem } from '~/utils/season'

const { t, te, locale } = useI18n()
useHead({ title: () => `${t('structure.title')} · TeamManix` })

const structure = useStructure()
const { data, loading, error, reload: load } = useLoad(() => structure.tree())
const profiles = ref<SportProfileDto[]>([])
const open = reactive({ activity: false, team: false, season: false })
const choiceActivity = ref<ActivityTree | null>(null)
const choiceTeam = ref<TeamTree | null>(null)

const hasDraft = (s: TeamTree) => s.seasons.some(x => x.status === 'draft')
const sportName = (code: string) => (te(`sport.${code}`) ? t(`sport.${code}`) : code)

function openTeam(a: ActivityTree) {
  choiceActivity.value = a
  open.team = true
}
function openSeason(s: TeamTree) {
  choiceTeam.value = s
  open.season = true
}

onMounted(async () => {
  await load()
  try {
    profiles.value = await structure.profiles()
  }
  catch { /* without profiles the sport code is shown */ }
})
</script>
