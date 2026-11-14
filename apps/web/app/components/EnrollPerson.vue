<template>
  <UModal v-model:open="open" :title="$t('season.addPeople')" :description="$t('season.addText')">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <UForm id="form-enroll" :state="status" :validate="validate" :validate-on="['change']" class="space-y-5" @submit="send">
        <div class="flex gap-2" role="group" :aria-label="$t('season.personCheType')">
          <UButton
            :color="fresh ? 'neutral' : 'primary'"
            :variant="fresh ? 'outline' : 'soft'"
            class="min-h-11 flex-1"
            :aria-pressed="!fresh"
            :label="$t('season.existingRecord')"
            @click="fresh = false"
          />
          <UButton
            :color="fresh ? 'primary' : 'neutral'"
            :variant="fresh ? 'soft' : 'outline'"
            class="min-h-11 flex-1"
            :aria-pressed="fresh"
            :label="$t('season.newRecord')"
            @click="fresh = true"
          />
        </div>

        <template v-if="!fresh">
          <UFormField name="person" :label="$t('person.search')">
            <UInput v-model="search" type="search" size="xl" class="w-full" icon="i-tm-search" :placeholder="$t('person.searchPlaceholder')" />
          </UFormField>
          <p v-if="loading" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>
          <p v-else-if="found.length === 0" class="text-sm text-muted">{{ $t('common.noResult') }}</p>
          <ul v-else class="max-h-56 divide-y divide-default overflow-y-auto rounded-md border border-default">
            <li v-for="p in found" :key="p.id">
              <button
                type="button"
                class="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                :class="status.personId === p.id ? 'bg-primary/10 font-semibold' : ''"
                :aria-pressed="status.personId === p.id"
                @click="status.personId = p.id"
              >
                <UIcon :name="status.personId === p.id ? 'i-tm-check-circle' : 'i-tm-user'" class="size-5 shrink-0" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate">{{ [p.name, p.surname].filter(Boolean).join(' ') }}</span>
                <span v-if="p.email" class="hidden truncate text-sm text-muted sm:block">{{ p.email }}</span>
              </button>
            </li>
          </ul>
        </template>
        <PersonFields v-else v-model="fields" />

        <fieldset class="space-y-4">
          <legend class="mb-2 text-sm font-semibold">{{ $t('season.comeIscriverla') }}</legend>
          <UFormField name="type" :label="$t('season.type')" required>
            <USelect v-model="status.type" :items="types" size="xl" class="w-full" />
          </UFormField>
          <UFormField v-if="status.type === 'staff'" name="staffRoleId" :label="$t('season.staffRole')" required>
            <USelect v-model="status.staffRoleId" :items="staffRoles" size="xl" class="w-full" />
          </UFormField>
          <template v-else>
            <UFormField v-if="positions.length" name="position" :label="$t('season.position')" :hint="$t('common.optional')">
              <USelect v-model="status.position" :items="positionsOptions" size="xl" class="w-full" />
            </UFormField>
            <UFormField name="jerseyNumber" :label="$t('season.jersey')" :hint="$t('common.optional')">
              <UInput v-model="status.jerseyNumber" type="number" inputmode="numeric" min="0" max="999" size="xl" class="w-full" />
            </UFormField>
          </template>
        </fieldset>
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
      <UButton type="submit" form="form-enroll" size="lg" :loading="submit" :label="$t('season.enroll')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { PersonDto, EnrollmentType } from '~/types/api'
import { personData, validatePerson, type PersonFields } from '~/utils/person'
import { positionOptions } from '~/utils/sport'
import { startingRole } from '~/utils/staff-role'

const props = defineProps<{ seasonId: string, positions: string[] }>()
const emit = defineEmits<{ enrolled: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const people = usePeople()
const catalog = useStaffRoleChoices()

/** The select does not allow an empty value: "no position" is its own value, never sent to the API. */
const NO = 'no'
const empty = (): PersonFields => ({ name: '', surname: '', birthDate: '', email: '', phone: '' })
const status = reactive({ personId: '', type: 'player' as EnrollmentType, staffRoleId: '', position: NO, jerseyNumber: '' })
const fields = ref<PersonFields>(empty())
const fresh = ref(false)
const search = ref('')
const found = ref<PersonDto[]>([])
const loading = ref(false)
const submit = ref(false)
const error = ref('')
/** Record already created by a half-finished attempt: a second submit does not duplicate it. */
let createdId: string | null = null

const types = computed(() => (['player', 'staff'] as EnrollmentType[]).map(x => ({ label: t(`enrollmentType.${x}`), value: x })))
const positionsOptions = computed(() => [{ label: t('common.none'), value: NO }, ...positionOptions(props.positions, t)])
const staffRoles = computed(() => catalog.choices())

async function runSearch() {
  loading.value = true
  try {
    found.value = await people.list(search.value)
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(runSearch, 300)
})
onBeforeUnmount(() => clearTimeout(timer))

watch(open, (v) => {
  error.value = ''
  if (!v) return
  Object.assign(status, { personId: '', type: 'player', staffRoleId: '', position: NO, jerseyNumber: '' })
  void catalog.load().then(() => {
    status.staffRoleId = startingRole(catalog.roles.value, null)
  })
  fields.value = empty()
  fresh.value = false
  search.value = ''
  createdId = null
  void runSearch()
})

function validate(s: typeof status): FormError[] {
  const err: FormError[] = []
  if (fresh.value) {
    for (const e of validatePerson(fields.value)) err.push({ name: e.field, message: t(e.key, { min: 1, max: 100 }) })
  }
  else if (!s.personId) err.push({ name: 'person', message: t('season.choosePerson') })
  if (s.type === 'staff' && !s.staffRoleId) err.push({ name: 'staffRoleId', message: t('staffRoles.required') })
  const m = s.jerseyNumber === '' ? null : Number(s.jerseyNumber)
  if (s.type === 'player' && m !== null && (!Number.isInteger(m) || m < 0 || m > 999)) err.push({ name: 'jerseyNumber', message: t('season.jerseyNotValid') })
  return err
}

async function send() {
  submit.value = true
  error.value = ''
  try {
    let personId = status.personId
    if (fresh.value) {
      createdId ??= (await people.create(personData(fields.value))).id
      personId = createdId
    }
    await people.enroll(props.seasonId, {
      personId,
      type: status.type,
      ...(status.type === 'staff'
        ? { staffRoleId: status.staffRoleId }
        : {
            ...(status.position !== NO ? { position: status.position } : {}),
            ...(status.jerseyNumber !== '' ? { jerseyNumber: Number(status.jerseyNumber) } : {}),
          }),
    })
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
