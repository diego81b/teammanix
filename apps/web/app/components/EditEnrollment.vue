<template>
  <UModal v-model:open="open" :title="$t('season.editEnrollment')" :description="row ? fullName(row) : ''">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <UForm id="form-enrollment" :state="status" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="send">
        <UFormField v-if="row?.type === 'staff'" name="staffRole" :label="$t('season.staffRole')" required>
          <USelect v-model="status.staffRole" :items="staffRoles" size="xl" class="w-full" />
        </UFormField>
        <template v-else>
          <UFormField v-if="positions.length" name="position" :label="$t('season.position')" :hint="$t('common.optional')">
            <USelect v-model="status.position" :items="positionsOptions" size="xl" class="w-full" />
          </UFormField>
          <UFormField name="jerseyNumber" :label="$t('season.jersey')" :hint="$t('common.optional')">
            <UInput v-model="status.jerseyNumber" type="number" inputmode="numeric" min="0" max="999" size="xl" class="w-full" />
          </UFormField>
          <UFormField name="status" :label="$t('season.status')">
            <USelect v-model="status.status" :items="states" size="xl" class="w-full" />
          </UFormField>
        </template>
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
      <UButton type="submit" form="form-enrollment" size="lg" :loading="submit" :label="$t('common.save')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { RosterRow, StaffRole, EnrollmentStatus } from '~/types/api'
import { fullName } from '~/utils/roster'
import { positionOptions } from '~/utils/sport'

const props = defineProps<{ row: RosterRow | null, positions: string[] }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const people = usePeople()

/** The select does not allow an empty value. The API does not clear a position: "none" is offered only to those who have none. */
const NO = 'no'
const status = reactive({ staffRole: 'coach' as StaffRole, position: NO, jerseyNumber: '', status: 'available' as EnrollmentStatus })
const submit = ref(false)
const error = ref('')
const staffRoles = computed(() => (['coach', 'assistant_coach', 'trainer', 'escort', 'other'] as StaffRole[]).map(r => ({ label: t(`staffRole.${r}`), value: r })))
const positionsOptions = computed(() => [
  ...(props.row?.position ? [] : [{ label: t('common.none'), value: NO }]),
  ...positionOptions(props.positions, t),
])
const states = computed(() => (['available', 'injured'] as EnrollmentStatus[]).map(s => ({ label: t(`status.enrollment.${s}`), value: s })))

watch(open, (v) => {
  error.value = ''
  if (v && props.row) {
    Object.assign(status, {
      staffRole: props.row.staffRole ?? 'coach',
      position: props.row.position ?? NO,
      jerseyNumber: String(props.row.jerseyNumber ?? ''),
      status: props.row.status,
    })
  }
})

function validate(s: typeof status): FormError[] {
  const m = s.jerseyNumber === '' ? null : Number(s.jerseyNumber)
  if (m !== null && (!Number.isInteger(m) || m < 0 || m > 999)) return [{ name: 'jerseyNumber', message: t('season.jerseyNotValid') }]
  return []
}

async function send() {
  if (!props.row) return
  submit.value = true
  error.value = ''
  try {
    const data = props.row.type === 'staff'
      ? { staffRole: status.staffRole }
      : {
          status: status.status,
          ...(status.position !== NO ? { position: status.position } : {}),
          ...(status.jerseyNumber !== '' ? { jerseyNumber: Number(status.jerseyNumber) } : {}),
        }
    await people.editEnrollment(props.row.id, data)
    open.value = false
    emit('saved')
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
