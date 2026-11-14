<template>
  <UModal v-model:open="open" :title="$t(`structure.unit.${term}.editTeam`)" :description="$t('structure.editTeamText')">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <UForm id="form-edit-team" :state="status" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="send">
        <UFormField :label="$t('structure.sport')" :description="$t('structure.sportFixed')">
          <p class="min-h-11 content-center text-sm font-medium">{{ team ? sportName(team.sportProfile) : '' }}</p>
        </UFormField>
        <UFormField name="name" :label="$t('structure.teamName')" required>
          <UInput v-model="status.name" size="xl" class="w-full" autofocus />
        </UFormField>
        <UFormField name="category" :label="$t('structure.category')" :hint="$t('common.optional')">
          <UInput v-model="status.category" size="xl" class="w-full" :placeholder="$t('structure.categoryExample')" />
        </UFormField>
        <UFormField name="gender" :label="$t('structure.gender')" :hint="$t('common.optional')">
          <USelect v-model="status.gender" :items="genders" size="xl" class="w-full" />
        </UFormField>
        <UFormField v-if="sections.length" name="sectionId" :label="$t('structure.section')" :hint="$t('common.optional')">
          <USelect v-model="status.sectionId" :items="sectionItems" size="xl" class="w-full" />
        </UFormField>
        <UFormField v-if="available.length" name="modulesActive" :label="$t('structure.modules')" :description="$t('structure.modulesText')">
          <UCheckboxGroup v-model="status.modulesActive" :items="available" size="lg" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
      <UButton type="submit" form="form-edit-team" size="lg" :loading="submit" :label="$t('common.save')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { SectionDto, SportProfileDto, TeamGender, TeamTree, UnitTerm } from '~/types/api'
import { NONE, teamEditBody, validateTeam, type TeamFields } from '~/utils/structure'

const props = defineProps<{ term: UnitTerm, team: TeamTree | null, sections: SectionDto[], profiles: SportProfileDto[] }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t, te } = useI18n()
const structure = useStructure()

const status = reactive<TeamFields>({ name: '', sportProfile: '', category: '', gender: NONE, sectionId: NONE, modulesActive: [] })
const submit = ref(false)
const error = ref('')

const sportName = (code: string) => (te(`sport.${code}`) ? t(`sport.${code}`) : code)
const genders = computed(() => [
  { label: t('common.none'), value: NONE },
  ...(['male', 'female', 'mixed'] as TeamGender[]).map(g => ({ label: t(`gender.${g}`), value: g })),
])
const sectionItems = computed(() => [{ label: t('structure.noSection'), value: NONE }, ...props.sections.map(s => ({ label: s.name, value: s.id }))])
const available = computed(() => {
  const profile = props.profiles.find(p => p.code === props.team?.sportProfile)
  return (profile?.modulesAvailable ?? []).map(m => ({ label: te(`module.${m}`) ? t(`module.${m}`) : m, value: m }))
})

watch(open, (v) => {
  error.value = ''
  if (!v || !props.team) return
  const x = props.team
  Object.assign(status, {
    name: x.name,
    sportProfile: x.sportProfile,
    category: x.category ?? '',
    gender: x.gender ?? NONE,
    sectionId: x.sectionId ?? NONE,
    modulesActive: [...x.modulesActive],
  })
})

const validate = (s: TeamFields): FormError[] => validateTeam(s, 'edit').map(e => ({ name: e.field, message: t(e.key, e.params ?? {}) }))

async function send() {
  if (!props.team) return
  submit.value = true
  error.value = ''
  try {
    const body = teamEditBody(status, props.team)
    if (Object.keys(body).length) await structure.editTeam(props.team.id, body)
    open.value = false
    if (Object.keys(body).length) emit('saved')
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
