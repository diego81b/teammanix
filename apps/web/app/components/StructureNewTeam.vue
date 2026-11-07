<template>
  <UModal v-model:open="open" :title="$t('structure.newTeam')" :description="$t('structure.newTeamText', { activity: activity?.name ?? '' })">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <UForm id="form-team" :state="status" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="send">
        <UFormField name="name" :label="$t('structure.teamName')" required>
          <UInput v-model="status.name" size="xl" class="w-full" autofocus :placeholder="$t('structure.teamNameExample')" />
        </UFormField>
        <UFormField name="category" :label="$t('structure.category')" :hint="$t('common.optional')">
          <UInput v-model="status.category" size="xl" class="w-full" :placeholder="$t('structure.categoryExample')" />
        </UFormField>
        <UFormField name="gender" :label="$t('structure.gender')" :hint="$t('common.optional')">
          <USelect v-model="status.gender" :items="genders" size="xl" class="w-full" />
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
import type { ActivityDto, TeamGender } from '~/types/api'

const props = defineProps<{ activity: ActivityDto | null }>()
const emit = defineEmits<{ created: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const structure = useStructure()

const NONE = 'none'
const status = reactive({ name: '', category: '', gender: NONE })
const submit = ref(false)
const error = ref('')
const genders = computed(() => [
  { label: t('common.none'), value: NONE },
  ...(['male', 'female', 'mixed'] as TeamGender[]).map(g => ({ label: t(`gender.${g}`), value: g })),
])

watch(open, (v) => {
  if (v) Object.assign(status, { name: '', category: '', gender: NONE })
  error.value = ''
})

function validate(s: typeof status): FormError[] {
  const err: FormError[] = []
  if (s.name.trim().length < 1 || s.name.trim().length > 100) err.push({ name: 'name', message: t('validation.length', { min: 1, max: 100 }) })
  if (s.category.trim().length > 60) err.push({ name: 'category', message: t('validation.length', { min: 1, max: 60 }) })
  return err
}

async function send() {
  if (!props.activity) return
  submit.value = true
  error.value = ''
  try {
    await structure.createTeam(props.activity.id, {
      name: status.name.trim(),
      ...(status.category.trim() ? { category: status.category.trim() } : {}),
      ...(status.gender !== NONE ? { gender: status.gender as TeamGender } : {}),
    })
    open.value = false
    emit('created')
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
