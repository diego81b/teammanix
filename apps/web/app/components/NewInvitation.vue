<template>
  <UModal v-model:open="open" :title="$t('invitation.new')" :description="$t('invitation.newText')">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <UForm id="form-invitation" :state="status" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="send">
        <UFormField name="email" :label="$t('person.email')" required>
          <UInput v-model="status.email" type="email" size="xl" class="w-full" autocomplete="off" />
        </UFormField>

        <UFormField name="role" :label="$t('invitation.role')" required>
          <USelect v-model="status.role" :items="roles" size="xl" class="w-full" />
        </UFormField>

        <template v-if="status.role === 'manager'">
          <UFormField name="scope" :label="$t('invitation.scope')" required>
            <USelect v-model="status.scope" :items="scopes" size="xl" class="w-full" />
          </UFormField>
          <UFormField v-if="status.scope === 'section'" name="sectionId" :label="$t('invitation.section')" required>
            <USelect v-model="status.sectionId" :items="sectionOptions" size="xl" class="w-full" :placeholder="$t('invitation.choose')" />
          </UFormField>
          <UFormField v-if="status.scope === 'team'" name="teamId" :label="$t('invitation.team')" required>
            <USelect v-model="status.teamId" :items="teamsOptions" size="xl" class="w-full" :placeholder="$t('invitation.choose')" />
          </UFormField>
        </template>

        <template v-if="status.role === 'staff' || status.role === 'player'">
          <div class="flex gap-2" role="group" :aria-label="$t('invitation.record')">
            <UButton
              :color="status.record === 'new' ? 'primary' : 'neutral'"
              :variant="status.record === 'new' ? 'soft' : 'outline'"
              class="min-h-11 flex-1"
              :aria-pressed="status.record === 'new'"
              :label="$t('season.newRecord')"
              @click="status.record = 'new'"
            />
            <UButton
              :color="status.record === 'existing' ? 'primary' : 'neutral'"
              :variant="status.record === 'existing' ? 'soft' : 'outline'"
              class="min-h-11 flex-1"
              :aria-pressed="status.record === 'existing'"
              :label="$t('season.existingRecord')"
              @click="status.record = 'existing'"
            />
          </div>
          <UFormField v-if="status.record === 'new'" name="name" :label="$t('person.name')" :description="$t('invitation.nameHelp')" required>
            <UInput v-model="status.name" size="xl" class="w-full" autocomplete="off" />
          </UFormField>
          <UFormField v-else name="personId" :label="$t('invitation.person')" required>
            <USelect v-model="status.personId" :items="peopleOptions" size="xl" class="w-full" :placeholder="$t('invitation.choose')" />
          </UFormField>
        </template>

        <UFormField name="language" :label="$t('invitation.language')" :description="$t('invitation.languageHelp')">
          <USelect v-model="status.language" :items="languages" size="xl" class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
      <UButton type="submit" form="form-invitation" size="lg" :loading="submit" :label="$t('invitation.send')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { StructureTree, Language, PersonDto, InvitationRole, ScopeType } from '~/types/api'
import { invitationData, scopeOptions, validateInvitation, type InvitationFields } from '~/utils/invitation'
import { fullName } from '~/utils/roster'

const emit = defineEmits<{ sent: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t, locale } = useI18n()
const access = useAccess()
const structure = useStructure()
const people = usePeople()

const empty = (): InvitationFields => ({
  email: '', role: 'staff', scope: 'club', sectionId: '', teamId: '', record: 'new', personId: '', name: '',
  language: (['it', 'en', 'fr'].includes(locale.value) ? locale.value : 'it') as Language,
})
const status = reactive<InvitationFields>(empty())
const tree = ref<StructureTree>({ sections: [], teams: [] })
const peopleList = ref<PersonDto[]>([])
const submit = ref(false)
const error = ref('')

const roles = computed(() => (['admin', 'manager', 'staff', 'player'] as InvitationRole[]).map(r => ({ label: t(`roles.${r}`), value: r })))
// The section scope is offered only to a club that has sections.
const scopes = computed(() => scopeOptions(tree.value.sections.length > 0).map((a: ScopeType) => ({ label: t(`scope.${a}`), value: a })))
const languages = computed(() => (['it', 'en', 'fr'] as Language[]).map(l => ({ label: t(`language.${l}`), value: l })))
const sectionOptions = computed(() => tree.value.sections.map(a => ({ label: a.name, value: a.id })))
const teamsOptions = computed(() => tree.value.teams.map((s) => {
  const section = tree.value.sections.find(a => a.id === s.sectionId)
  return { label: section ? `${section.name} · ${s.name}` : s.name, value: s.id }
}))
// The API rejects records already linked to an account (PERSONA_NON_DISPONIBILE); disabled ones do not come from the list.
const peopleOptions = computed(() => peopleList.value.map(p => ({ label: fullName(p), value: p.id })))

watch(open, async (v) => {
  error.value = ''
  if (!v) return
  Object.assign(status, empty())
  try {
    const [a, p] = await Promise.all([structure.tree(), people.list()])
    tree.value = a
    peopleList.value = p
  }
  catch (e) {
    error.value = errorText(e)
  }
})

const validate = (s: InvitationFields): FormError[] =>
  validateInvitation(s).map(e => ({ name: e.field, message: t(e.key, { min: 1, max: 100 }) }))

async function send() {
  submit.value = true
  error.value = ''
  try {
    await access.invite(invitationData(status))
    open.value = false
    emit('sent')
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
