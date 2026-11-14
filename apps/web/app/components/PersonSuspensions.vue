<template>
  <section class="space-y-4" aria-labelledby="title-suspensions">
    <div>
      <h2 id="title-suspensions" class="text-lg font-semibold">{{ $t('suspensions.title') }}</h2>
      <p class="mt-1 text-sm text-muted">{{ $t('suspensions.teamIntro') }}</p>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="$t('common.retry')" @click="load" />
      </template>
    </UAlert>
    <UAlert v-if="errorAction" color="error" variant="subtle" icon="i-tm-error" :title="errorAction" />
    <p v-if="loading && !data" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="data">
      <p v-if="data.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">{{ $t('person.noEnrollment') }}</p>

      <div v-for="g in data" :key="g.enrollment.id" class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="min-w-0 text-sm font-semibold">{{ g.enrollment.season }} · {{ teamLabel(g.enrollment.section, g.enrollment.team) }}</h3>
          <UButton
            v-if="g.canAdd"
            color="neutral"
            variant="outline"
            size="lg"
            class="min-h-11"
            icon="i-tm-plus"
            :label="$t('suspensions.add')"
            @click="openForm(g.enrollment, null)"
          />
        </div>
        <p v-if="g.list.length === 0" class="rounded-lg border border-dashed border-default p-4 text-center text-sm text-muted">{{ $t('suspensions.none') }}</p>
        <ul v-else class="space-y-2">
          <SuspensionCard
            v-for="s in g.list"
            :key="s.id"
            :suspension="s"
            :who="name"
            :can-manage="g.canAdd"
            @edit="openForm(g.enrollment, s)"
            @cancel="askCancel(s)"
          />
        </ul>
      </div>

      <SuspensionForm
        v-model:open="open.form"
        :season="seasonBounds"
        :suspension="editing"
        :fixed="fixed"
        :used="used"
        @saved="load"
      />

      <UModal v-model:open="open.cancel" :title="$t('suspensions.removeTitle')" :description="$t('suspensions.removeText')">
        <template #footer>
          <UButton color="neutral" variant="outline" size="lg" :label="$t('common.back')" @click="open.cancel = false" />
          <UButton color="error" size="lg" :loading="cancelling" :label="$t('suspensions.cancel')" @click="cancel" />
        </template>
      </UModal>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { EnrollmentPersonDto, PersonDetail, SeasonSuspension } from '~/types/api'
import { canSuspendOn, forPerson } from '~/utils/suspension'
import { fullName } from '~/utils/roster'
import { teamLabel } from '~/utils/structure'

const props = defineProps<{ person: PersonDetail }>()
const { t } = useI18n()
const toast = useToast()
const suspensions = useSuspensions()
const events = useEvents()
const name = computed(() => fullName(props.person))

const { data, loading, error, reload: load } = useLoad(async () => {
  const lists = await Promise.all(props.person.enrollments.map(i => suspensions.ofEnrollment(i.id)))
  return props.person.enrollments.map((enrollment, n) => ({
    enrollment,
    canAdd: canSuspendOn(enrollment, props.person.disabled),
    list: (lists[n] ?? []).map(s => forPerson(s, { id: props.person.id, name: props.person.name, surname: props.person.surname, type: enrollment.type })),
  }))
})
onMounted(load)

const open = reactive({ form: false, cancel: false })
const editing = ref<SeasonSuspension | null>(null)
const fixed = ref<{ enrollmentId: string, name: string } | null>(null)
const seasonBounds = ref<{ seasonStart: string, seasonEnd: string } | null>(null)
const used = ref<string[]>([])
const errorAction = ref('')

async function openForm(enrollment: EnrollmentPersonDto, s: SeasonSuspension | null) {
  editing.value = s
  fixed.value = { enrollmentId: enrollment.id, name: name.value }
  errorAction.value = ''
  // The bounds and the names already used are a help: without them the form still works and the API checks.
  const [context, names] = await Promise.all([
    suspensions.context(enrollment.seasonId).catch(() => null),
    events.competitions(enrollment.seasonId).catch(() => []),
  ])
  seasonBounds.value = context ? { seasonStart: context.seasonStart, seasonEnd: context.seasonEnd } : null
  used.value = names
  open.form = true
}

const toCancel = ref<SeasonSuspension | null>(null)
const cancelling = ref(false)
function askCancel(s: SeasonSuspension) {
  toCancel.value = s
  open.cancel = true
}

async function cancel() {
  if (!toCancel.value) return
  cancelling.value = true
  errorAction.value = ''
  try {
    await suspensions.cancel(toCancel.value.id)
    open.cancel = false
    toast.add({ title: t('suspensions.removed'), color: 'success' })
    await load()
  }
  catch (e) {
    open.cancel = false
    errorAction.value = errorText(e)
  }
  finally {
    cancelling.value = false
  }
}
</script>
