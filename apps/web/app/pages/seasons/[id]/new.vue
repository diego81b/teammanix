<template>
  <div class="space-y-6">
    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="context">
      <div class="space-y-2">
        <NuxtLink :to="`/seasons/${context.season.id}`" class="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-default">
          <UIcon name="i-tm-chevron-left" class="size-4" aria-hidden="true" />
          {{ context.season.name }}
        </NuxtLink>
        <h1 class="text-2xl font-bold">{{ $t('season.newTitle') }}</h1>
        <p class="text-sm text-muted">{{ [context.section?.name, context.team.name].filter(Boolean).join(' · ') }}</p>
      </div>

      <UAlert
        v-if="!possible"
        color="warning"
        variant="subtle"
        icon="i-tm-warning"
        :title="context.season.status === 'draft' ? $t('season.wizardDraft') : $t('errors.codes.DRAFT_EXISTS')"
      >
        <template #actions>
          <UButton color="neutral" variant="outline" :to="`/seasons/${context.season.id}`" :label="$t('common.back')" />
        </template>
      </UAlert>

      <template v-else>
        <ol class="flex gap-2" :aria-label="$t('season.steps')">
          <li
            v-for="(label, i) in steps"
            :key="i"
            class="flex min-h-11 flex-1 items-center justify-center rounded-md border px-2 text-center text-sm"
            :class="i === step ? 'border-primary bg-primary/10 font-semibold' : 'border-default text-muted'"
            :aria-current="i === step ? 'step' : undefined"
          >
            {{ i + 1 }}. {{ label }}
          </li>
        </ol>

        <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />

        <section v-if="step === 0" class="space-y-4" aria-labelledby="titolo-passo">
          <div>
            <h2 id="title-step" class="text-lg font-semibold">{{ $t('season.stepPeople') }}</h2>
            <p class="text-sm text-muted">{{ $t('season.stepPeopleText') }}</p>
          </div>
          <p v-if="roster.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
            {{ $t('season.emptyRoster') }}
          </p>
          <template v-else>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm text-muted" role="status">{{ $t('season.selected', { n: choices.length, tot: roster.length }) }}</p>
              <div class="flex gap-2">
                <UButton color="neutral" variant="outline" class="min-h-11" :label="$t('season.selectAll')" @click="choices = selectionInitial(roster)" />
                <UButton color="neutral" variant="outline" class="min-h-11" :label="$t('season.deselectAll')" @click="choices = []" />
              </div>
            </div>
            <ul class="divide-y divide-default rounded-lg border border-default">
              <li v-for="r in roster" :key="r.id">
                <label class="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
                  <UCheckbox :model-value="choices.includes(r.id)" :aria-label="fullName(r)" @update:model-value="choices = toggleSelection(choices, r.id)" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium">{{ fullName(r) }}</span>
                    <span class="block text-sm text-muted">{{ roleRow(r) }}<template v-if="r.jerseyNumber !== null"> · #{{ r.jerseyNumber }}</template></span>
                  </span>
                </label>
              </li>
            </ul>
          </template>
        </section>

        <section v-else-if="step === 1" class="space-y-4" aria-labelledby="titolo-passo">
          <div>
            <h2 id="title-step" class="text-lg font-semibold">{{ $t('season.stepData') }}</h2>
            <p class="text-sm text-muted">{{ $t('season.stepDataText') }}</p>
          </div>
          <UForm id="form-new" :state="formData" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="step = 2">
            <UFormField name="name" :label="$t('season.name')" required>
              <UInput v-model="formData.name" size="xl" class="w-full" :placeholder="$t('season.nameExample')" />
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField name="startDate" :label="$t('season.start')" required>
                <UInput v-model="formData.startDate" type="date" size="xl" class="w-full" />
              </UFormField>
              <UFormField name="endDate" :label="$t('season.end')" required>
                <UInput v-model="formData.endDate" type="date" size="xl" class="w-full" />
              </UFormField>
            </div>
            <UFormField name="league" :label="$t('season.league')" :hint="$t('common.optional')">
              <UInput v-model="formData.league" size="xl" class="w-full" />
            </UFormField>
          </UForm>
        </section>

        <section v-else class="space-y-4" aria-labelledby="titolo-passo">
          <div>
            <h2 id="title-step" class="text-lg font-semibold">{{ $t('season.stepSummary') }}</h2>
            <p class="text-sm text-muted">{{ $t('season.stepSummaryText') }}</p>
          </div>
          <dl class="grid gap-3 rounded-lg border border-default bg-elevated p-4 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-muted">{{ $t('season.name') }}</dt>
              <dd class="font-medium">{{ formData.name }}</dd>
            </div>
            <div>
              <dt class="text-muted">{{ $t('season.period') }}</dt>
              <dd class="font-medium">{{ formatDate(formData.startDate, locale) }} - {{ formatDate(formData.endDate, locale) }}</dd>
            </div>
            <div v-if="formData.league.trim()">
              <dt class="text-muted">{{ $t('season.league') }}</dt>
              <dd class="font-medium">{{ formData.league }}</dd>
            </div>
            <div>
              <dt class="text-muted">{{ $t('season.roster') }}</dt>
              <dd class="font-medium">{{ $t('season.copied', { n: choices.length }) }}</dd>
            </div>
          </dl>
          <p class="text-sm text-muted">{{ $t('season.statusReset') }}</p>

          <UCheckbox v-model="carrySuspensions" :label="$t('season.carrySuspensions')" :description="$t('season.carrySuspensionsText')" />
          <UCheckbox v-model="activeImmediately" :label="$t('season.activeImmediately')" :description="$t('season.activeImmediatelyText')" />

          <UAlert
            v-if="context.season.status === 'active'"
            color="warning"
            variant="subtle"
            icon="i-tm-warning"
            :title="$t('season.closesTitle', { name: context.season.name })"
            :description="$t('season.closesText')"
          />
        </section>

        <div class="flex flex-wrap justify-between gap-2">
          <UButton v-if="step > 0 && !newId" color="neutral" variant="outline" size="lg" class="min-h-11" :label="$t('common.back')" @click="step--" />
          <span v-else />
          <UButton v-if="step === 0" size="lg" class="min-h-11" :disabled="choices.length === 0" :label="$t('common.next')" @click="step = 1" />
          <UButton v-else-if="step === 1" type="submit" form="form-new" size="lg" class="min-h-11" :label="$t('common.next')" />
          <UButton
            v-else
            :color="context.season.status === 'active' ? 'error' : 'primary'"
            size="lg"
            class="min-h-11"
            :loading="submit"
            :label="context.season.status === 'active' ? $t('season.closeAndCreate') : $t('season.createDraft')"
            @click="confirm"
          />
        </div>
      </template>
    </template>

    <p v-else-if="data && !context" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
      {{ $t('errors.codes.SEASON_NOT_FOUND') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { RosterRow } from '~/types/api'
import { formatDate } from '~/utils/date'
import { fullName } from '~/utils/roster'
import { labelPosition } from '~/utils/sport'
import { toggleSelection, proposeNewSeason, selectionInitial, validatePeriod } from '~/utils/season'
import { seasonContext } from '~/utils/structure'

const { t, te, locale } = useI18n()
const route = useRoute()
const id = computed(() => String(route.params.id))
const structure = useStructure()
const people = usePeople()
useHead({ title: () => `${t('season.newTitle')} · TeamManix` })

const { data, loading, error, reload: load } = useLoad(async () => {
  const [tree, roster] = await Promise.all([structure.tree(), people.roster(id.value)])
  return { tree, roster }
})

const context = computed(() => (data.value ? seasonContext(data.value.tree, id.value) : null))
const roster = computed<RosterRow[]>(() => data.value?.roster ?? [])
// A draft cannot be cloned; with a draft already present the team does not accept another.
const possible = computed(() => !!context.value && context.value.season.status !== 'draft' && !context.value.hasDraft)

const steps = computed(() => [t('season.stepPeople'), t('season.stepData'), t('season.stepSummary')])
const step = ref(0)
const choices = ref<string[]>([])
const formData = reactive({ name: '', startDate: '', endDate: '', league: '' })
const activeImmediately = ref(false)
const carrySuspensions = ref(true)

// Initial values only once, as soon as the data arrives.
let initialized = false
watch([context, roster], () => {
  if (initialized || !context.value) return
  initialized = true
  choices.value = selectionInitial(roster.value)
  Object.assign(formData, proposeNewSeason(context.value.season))
}, { immediate: true })

const roleRow = (r: RosterRow) => (r.type === 'staff' ? (r.staffRole?.name ?? '') : (labelPosition(r.position, te, t) ?? t('enrollmentType.player')))

function validate(s: typeof formData): FormError[] {
  const err: FormError[] = []
  if (s.name.trim().length < 1 || s.name.trim().length > 60) err.push({ name: 'name', message: t('validation.length', { min: 1, max: 60 }) })
  if (!s.startDate) err.push({ name: 'startDate', message: t('validation.data') })
  if (!s.endDate) err.push({ name: 'endDate', message: t('validation.data') })
  else if (s.startDate && !validatePeriod(s.startDate, s.endDate)) err.push({ name: 'endDate', message: t('season.endAfterStart') })
  return err
}

// Non-atomic sequence: clone, close the origin, activate. Each successful step is remembered, so a new attempt restarts from the failed one.
const newId = ref<string | null>(null)
const sourceClosed = ref(false)
const submit = ref(false)
const errorAction = ref('')

async function confirm() {
  if (!context.value) return
  submit.value = true
  errorAction.value = ''
  try {
    if (!newId.value) {
      const r = await structure.clone(id.value, {
        name: formData.name.trim(),
        startDate: formData.startDate,
        endDate: formData.endDate,
        ...(formData.league.trim() ? { league: formData.league.trim() } : {}),
        enrollments: choices.value,
        ...(carrySuspensions.value ? { carrySuspensions: true } : {}),
      })
      newId.value = r.season.id
    }
    if (context.value.season.status === 'active' && !sourceClosed.value) {
      await structure.close(id.value)
      sourceClosed.value = true
    }
    if (activeImmediately.value) await structure.active(newId.value)
    await navigateTo(`/seasons/${newId.value}`)
  }
  catch (e) {
    errorAction.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}

onMounted(load)
</script>
