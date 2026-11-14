<template>
  <UModal v-model:open="open" :title="role ? $t('settings.staffRoles.editTitle') : $t('settings.staffRoles.newTitle')" :description="$t('settings.staffRoles.formText')">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <UForm id="form-staff-role" :state="status" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="send">
        <UFormField name="name" :label="$t('staffRoles.name')" required>
          <UInput v-model="status.name" size="xl" class="w-full" :maxlength="NAME_MAX" autofocus />
        </UFormField>
        <UFormField name="policyModel" :label="$t('staffRoles.model.label')" :description="$t(`staffRoles.modelText.${status.policyModel}`)" required>
          <USelect v-model="status.policyModel" :items="models" size="xl" class="w-full" />
        </UFormField>
        <USwitch v-model="status.mustBeAvailable" :label="$t('staffRoles.mustBeAvailable')" :description="$t('staffRoles.mustBeAvailableText')" />
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
      <UButton type="submit" form="form-staff-role" size="lg" :loading="submit" :label="$t('common.save')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { StaffRoleItem } from '~/types/api'
import { NAME_MAX, POLICY_MODELS, roleCreateBody, roleEditBody, validRoleName, type RoleFields } from '~/utils/staff-role'

const props = defineProps<{ role: StaffRoleItem | null }>()
const emit = defineEmits<{ saved: [role: StaffRoleItem | null] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const catalog = useStaffRoles()

const status = reactive<RoleFields>({ name: '', policyModel: 'none', mustBeAvailable: false })
const submit = ref(false)
const error = ref('')

const models = computed(() => POLICY_MODELS.map(m => ({ label: t(`staffRoles.model.${m}`), value: m })))

watch(open, (v) => {
  error.value = ''
  if (!v) return
  const r = props.role
  Object.assign(status, r
    ? { name: r.name, policyModel: r.policyModel, mustBeAvailable: r.mustBeAvailable }
    : { name: '', policyModel: 'none', mustBeAvailable: false })
})

const validate = (s: RoleFields): FormError[] => (validRoleName(s.name) ? [] : [{ name: 'name', message: t('staffRoles.nameInvalid', { max: NAME_MAX }) }])

async function send() {
  submit.value = true
  error.value = ''
  try {
    if (!props.role) {
      const created = await catalog.create(roleCreateBody(status))
      open.value = false
      emit('saved', created)
      return
    }
    const body = roleEditBody(status, props.role)
    const changed = Object.keys(body).length > 0
    const saved = changed ? await catalog.edit(props.role.id, body) : null
    open.value = false
    if (changed) emit('saved', saved)
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
