<template>
  <div class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField name="name" :label="$t('person.name')" required>
        <UInput v-model="template.name" size="xl" class="w-full" autocomplete="off" />
      </UFormField>
      <UFormField name="surname" :label="$t('person.surname')" :hint="$t('common.optional')">
        <UInput v-model="template.surname" size="xl" class="w-full" autocomplete="off" />
      </UFormField>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField name="email" :label="$t('person.email')" :description="$t('person.contactHelp')">
        <UInput v-model="template.email" type="email" size="xl" class="w-full" autocomplete="off" />
      </UFormField>
      <UFormField name="phone" :label="$t('person.phone')">
        <UInput v-model="template.phone" type="tel" size="xl" class="w-full" autocomplete="off" />
      </UFormField>
    </div>
    <UFormField name="birthDate" :label="$t('person.birthDate')" :hint="$t('common.optional')">
      <UInput v-model="template.birthDate" type="date" size="xl" class="w-full" />
    </UFormField>
    <p class="text-sm text-muted">{{ $t('person.completeSubject') }}</p>
  </div>
</template>

<script setup lang="ts">
import type { PersonFields } from '~/utils/person'

const template = defineModel<PersonFields>({ required: true })
</script>
