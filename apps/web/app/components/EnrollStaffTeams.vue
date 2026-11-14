<template>
  <UModal v-model:open="open" :title="$t(`structure.unit.${term}.staffTeams`)" :description="$t(`structure.unit.${term}.staffTeamsText`)">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <UForm id="form-staff-teams" :state="status" :validate="validate" :validate-on="['change']" class="space-y-5" @submit="send">
        <UFormField name="staffRole" :label="$t('season.staffRole')" required>
          <USelect v-model="status.staffRole" :items="staffRoles" size="xl" class="w-full" />
        </UFormField>
        <UFormField v-if="tree.sections.length" name="sectionId" :label="$t('structure.section')">
          <USelect v-model="status.sectionId" :items="sectionItems" size="xl" class="w-full" />
        </UFormField>
        <UFormField name="teamIds" :label="$t(`structure.unit.${term}.staffTeamsLegend`)" required>
          <p v-if="visible.length === 0" class="text-sm text-muted">{{ $t(`structure.unit.${term}.staffTeamsNone`) }}</p>
          <UCheckboxGroup v-else v-model="status.teamIds" :items="items" size="lg" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
      <UButton type="submit" form="form-staff-teams" size="lg" :loading="submit" :label="$t('season.enroll')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { EnrollmentPersonDto, StaffRole, StructureTree, UnitTerm } from '~/types/api'
import { filterChoices, NONE, staffTeamChoices } from '~/utils/structure'

const props = defineProps<{ personId: string, enrollments: EnrollmentPersonDto[], tree: StructureTree, term: UnitTerm }>()
const emit = defineEmits<{ enrolled: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const people = usePeople()
const toast = useToast()

const status = reactive({ staffRole: 'coach' as StaffRole, sectionId: NONE, teamIds: [] as string[] })
const submit = ref(false)
const error = ref('')

const staffRoles = computed(() => (['coach', 'assistant_coach', 'trainer', 'escort', 'other'] as StaffRole[]).map(r => ({ label: t(`staffRole.${r}`), value: r })))
const sectionItems = computed(() => [{ label: t('structure.allSections'), value: NONE }, ...props.tree.sections.map(s => ({ label: s.name, value: s.id }))])
const visible = computed(() => filterChoices(staffTeamChoices(props.tree, props.enrollments), status.sectionId))
const items = computed(() => visible.value.map(c => ({
  label: c.label,
  value: c.id,
  disabled: c.state !== 'free',
  description: c.state === 'taken' ? t('structure.choiceTaken') : c.state === 'noSeason' ? t('structure.choiceNoSeason') : undefined,
})))

watch(open, (v) => {
  error.value = ''
  if (v) Object.assign(status, { staffRole: 'coach', sectionId: NONE, teamIds: [] })
})
// A team that the filter hides is not part of the choice any more.
watch(() => status.sectionId, () => {
  const shown = new Set(visible.value.map(c => c.id))
  status.teamIds = status.teamIds.filter(id => shown.has(id))
})

const validate = (s: typeof status): FormError[] =>
  s.teamIds.length ? [] : [{ name: 'teamIds', message: t(`structure.unit.${props.term}.staffTeamsRequired`) }]

async function send() {
  submit.value = true
  error.value = ''
  try {
    const created = await people.enrollStaffInTeams(props.personId, status.teamIds, status.staffRole)
    toast.add({ title: t('structure.staffTeamsEnrolled', { count: created.length }), color: 'success' })
    open.value = false
    emit('enrolled')
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
