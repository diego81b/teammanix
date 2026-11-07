<template>
  <UModal v-model:open="open" :title="$t('structure.newActivity')" :description="$t('structure.newActivityText')">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <UForm id="form-activity" :state="status" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="send">
        <UFormField name="name" :label="$t('structure.activityName')" required>
          <UInput v-model="status.name" size="xl" class="w-full" autofocus :placeholder="$t('structure.activityNameExample')" />
        </UFormField>
        <UFormField name="sportProfile" :label="$t('structure.sport')" required>
          <USelect v-model="status.sportProfile" :items="options" size="xl" class="w-full" :placeholder="$t('structure.chooseSport')" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
      <UButton type="submit" form="form-activity" size="lg" :loading="submit" :label="$t('common.create')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { SportProfileDto } from '~/types/api'
import { sortProfiles } from '~/utils/sport'

const props = defineProps<{ profiles: SportProfileDto[] }>()
const emit = defineEmits<{ created: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t, locale } = useI18n()
const structure = useStructure()

const status = reactive({ name: '', sportProfile: '' })
const submit = ref(false)
const error = ref('')
const options = computed(() => sortProfiles(props.profiles, t, locale.value).map(p => ({ label: t(`sport.${p.code}`), value: p.code })))

watch(open, (v) => {
  if (v) Object.assign(status, { name: '', sportProfile: props.profiles.length === 1 ? props.profiles[0]!.code : '' })
  error.value = ''
})

function validate(s: typeof status): FormError[] {
  const err: FormError[] = []
  if (s.name.trim().length < 1 || s.name.trim().length > 100) err.push({ name: 'name', message: t('validation.length', { min: 1, max: 100 }) })
  if (!s.sportProfile) err.push({ name: 'sportProfile', message: t('structure.sportRequired') })
  return err
}

async function send() {
  submit.value = true
  error.value = ''
  try {
    await structure.createActivity({ name: status.name.trim(), sportProfile: status.sportProfile })
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
