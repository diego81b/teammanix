<template>
  <UModal v-model:open="open" :title="$t('structure.suggestedRoles.title', { sport })" :description="$t('structure.suggestedRoles.text')">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <ul class="space-y-2">
        <li v-for="c in choices" :key="c.code" class="rounded-lg border border-default p-3">
          <UCheckbox
            :model-value="chosen.has(c.code)"
            :label="c.name"
            :description="[$t(`staffRoles.model.${c.policyModel}`), c.mustBeAvailable ? $t('staffRoles.mustBeAvailableBadge') : null].filter(Boolean).join(' · ')"
            @update:model-value="toggle(c.code, $event === true)"
          />
        </li>
      </ul>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" size="lg" :label="$t('structure.suggestedRoles.skip')" @click="open = false" />
      <UButton size="lg" :loading="submit" :disabled="chosen.size === 0" :label="$t('structure.suggestedRoles.add')" @click="send" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { suggestedBody, type SuggestedChoice } from '~/utils/staff-role'

const props = defineProps<{ sport: string, sportProfile: string, choices: SuggestedChoice[] }>()
const emit = defineEmits<{ added: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const roles = useStaffRoles()
const toast = useToast()

// Everything is ticked when the dialog opens: the admin takes away what they do not want, and nothing is sent without the click.
const chosen = ref(new Set<string>())
const submit = ref(false)
const error = ref('')

watch(open, (v) => {
  if (v) chosen.value = new Set(props.choices.map(c => c.code))
  error.value = ''
})

function toggle(code: string, on: boolean) {
  const next = new Set(chosen.value)
  if (on) next.add(code)
  else next.delete(code)
  chosen.value = next
}

async function send() {
  submit.value = true
  error.value = ''
  try {
    await roles.addSuggested(suggestedBody(props.sportProfile, props.choices.filter(c => chosen.value.has(c.code))))
    open.value = false
    toast.add({ title: t('structure.suggestedRoles.added'), color: 'success' })
    emit('added')
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submit.value = false
  }
}
</script>
