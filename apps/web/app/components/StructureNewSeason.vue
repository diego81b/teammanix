<template>
  <UModal v-model:open="open" :title="$t('structure.newSeason')" :description="$t(`structure.unit.${term}.newSeasonText`, { team: team?.name ?? '' })">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <UForm id="form-season" :state="status" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="send">
        <UFormField name="name" :label="$t('season.name')" required>
          <UInput v-model="status.name" size="xl" class="w-full" autofocus :placeholder="$t('season.nameExample')" />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField name="startDate" :label="$t('season.start')" required>
            <UInput v-model="status.startDate" type="date" size="xl" class="w-full" />
          </UFormField>
          <UFormField name="endDate" :label="$t('season.end')" required>
            <UInput v-model="status.endDate" type="date" size="xl" class="w-full" />
          </UFormField>
        </div>
        <UFormField name="league" :label="$t('season.league')" :hint="$t('common.optional')">
          <UInput v-model="status.league" size="xl" class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
      <UButton type="submit" form="form-season" size="lg" :loading="submit" :label="$t('common.create')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { TeamTree, UnitTerm } from '~/types/api'
import { proposeNewSeason, validatePeriod } from '~/utils/season'

const props = defineProps<{ term: UnitTerm, team: TeamTree | null }>()
const emit = defineEmits<{ created: [id: string] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const structure = useStructure()

const status = reactive({ name: '', startDate: '', endDate: '', league: '' })
const submit = ref(false)
const error = ref('')

// With a previous season, the next one is proposed; the most recent is first (the API sorts by start date descending).
watch(open, (v) => {
  error.value = ''
  if (!v) return
  const last = props.team?.seasons[0]
  Object.assign(status, { league: '', ...(last ? proposeNewSeason(last) : { name: '', startDate: '', endDate: '' }) })
})

function validate(s: typeof status): FormError[] {
  const err: FormError[] = []
  if (s.name.trim().length < 1 || s.name.trim().length > 60) err.push({ name: 'name', message: t('validation.length', { min: 1, max: 60 }) })
  if (!s.startDate) err.push({ name: 'startDate', message: t('validation.data') })
  if (!s.endDate) err.push({ name: 'endDate', message: t('validation.data') })
  else if (s.startDate && !validatePeriod(s.startDate, s.endDate)) err.push({ name: 'endDate', message: t('season.endAfterStart') })
  return err
}

async function send() {
  if (!props.team) return
  submit.value = true
  error.value = ''
  try {
    const s = await structure.createSeason(props.team.id, {
      name: status.name.trim(),
      startDate: status.startDate,
      endDate: status.endDate,
      ...(status.league.trim() ? { league: status.league.trim() } : {}),
    })
    open.value = false
    emit('created', s.id)
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
