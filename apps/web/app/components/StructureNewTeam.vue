<template>
  <UModal v-model:open="open" :title="$t(`structure.unit.${shown}.newTeam`)" :description="$t(`structure.unit.${shown}.newTeamText`)">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <UForm id="form-team" :state="status" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="send">
        <UFormField name="sportProfile" :label="$t('structure.sport')" required>
          <USelect v-model="status.sportProfile" :items="sports" size="xl" class="w-full" :placeholder="$t('structure.chooseSport')" />
        </UFormField>
        <UFormField name="name" :label="$t('structure.teamName')" required>
          <UInput v-model="status.name" size="xl" class="w-full" autofocus :placeholder="$t('structure.teamNameExample')" />
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
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
      <UButton type="submit" form="form-team" size="lg" :loading="submit" :label="$t('common.create')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { SectionDto, SportProfileDto, TeamGender, UnitTerm } from '~/types/api'
import { sortProfiles } from '~/utils/sport'
import { NONE, teamCreateBody, unitTermOf, validateTeam, type TeamFields } from '~/utils/structure'

const props = defineProps<{ term: UnitTerm, profiles: SportProfileDto[], sections: SectionDto[] }>()
const emit = defineEmits<{ created: [sportProfile: string] }>()
const open = defineModel<boolean>('open', { default: false })
const { t, locale } = useI18n()
const structure = useStructure()

const empty = (): TeamFields => ({
  name: '', sportProfile: props.profiles.length === 1 ? props.profiles[0]!.code : '', category: '', gender: NONE, sectionId: NONE, modulesActive: [],
})
const status = reactive<TeamFields>(empty())
const submit = ref(false)
const error = ref('')
/** Once the sport is chosen the dialog speaks its word (squadra or gruppo), before that the club's. */
const shown = computed(() => (status.sportProfile ? unitTermOf(props.profiles, status.sportProfile) : props.term))
const sports = computed(() => sortProfiles(props.profiles, t, locale.value).map(p => ({ label: t(`sport.${p.code}`), value: p.code })))
const genders = computed(() => [
  { label: t('common.none'), value: NONE },
  ...(['male', 'female', 'mixed'] as TeamGender[]).map(g => ({ label: t(`gender.${g}`), value: g })),
])
const sectionItems = computed(() => [{ label: t('structure.noSection'), value: NONE }, ...props.sections.map(s => ({ label: s.name, value: s.id }))])

watch(open, (v) => {
  if (v) Object.assign(status, empty())
  error.value = ''
})

const validate = (s: TeamFields): FormError[] => validateTeam(s, 'create').map(e => ({ name: e.field, message: t(e.key, e.params ?? {}) }))

async function send() {
  submit.value = true
  error.value = ''
  try {
    await structure.createTeam(teamCreateBody(status))
    open.value = false
    emit('created', status.sportProfile)
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
