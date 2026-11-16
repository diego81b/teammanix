<template>
  <UModal v-model:open="open" :title="$t('profile.deleteModalTitle')">
    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" class="mb-4" />
      <form id="delete-account-form" class="space-y-4 text-sm" @submit.prevent="remove">
        <p>{{ $t('profile.deleteModalText') }}</p>
        <UFormField name="password" :label="$t('profile.deletePassword')" required>
          <PasswordInput v-model="password" autocomplete="current-password" />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="open = false" />
        <UButton
          type="submit"
          form="delete-account-form"
          color="error"
          size="lg"
          :loading="submitting"
          :disabled="!password || submitting"
          :label="$t('profile.deleteConfirm')"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
const account = useAccount()
const toast = useToast()
const { t } = useI18n()

const password = ref('')
const submitting = ref(false)
const error = ref('')
watch(open, () => {
  password.value = ''
  error.value = ''
})

async function remove() {
  if (!password.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    await account.deleteAccount(password.value)
    open.value = false
    toast.add({ title: t('profile.deleteDone'), color: 'success' })
    await navigateTo('/login')
  }
  catch (e) {
    error.value = errorText(e)
  }
  finally {
    submitting.value = false
  }
}
</script>
