<template>
  <section class="space-y-4" aria-labelledby="titolo-certificati">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="title-certificates" class="text-lg font-semibold">{{ $t('certificate.title') }}</h2>
        <p v-if="list" class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          <CertificateBadge :summary="{ status: list.status, expiry: list.expiry }" />
        </p>
      </div>
      <UButton icon="i-tm-plus" size="lg" class="min-h-11" :label="$t('certificate.add')" @click="openForm(null)" />
    </div>

    <UAlert color="neutral" variant="subtle" icon="i-tm-shield" :title="$t('certificate.bannerHealth')" />
    <UAlert v-if="error" color="error" variant="subtle" icon="i-tm-error" :title="error" />
    <p v-if="loading && !list" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

    <template v-if="list">
      <p v-if="list.certificates.length === 0" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        {{ $t('certificate.empty') }}
      </p>
      <ul v-else class="space-y-2">
        <li v-for="c in list.certificates" :key="c.id" class="rounded-lg border border-default bg-elevated p-3">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="space-y-1">
              <p class="font-medium">{{ $t(`certificate.type.${c.type}`) }}</p>
              <p class="text-sm text-muted">
                {{ $t('certificate.issued') }} {{ formatDate(c.issueDate, locale) }} · {{ $t('certificate.expires') }} {{ formatDate(c.expiryDate, locale) }}
              </p>
              <UBadge :color="variantCertificate(c.status)" variant="subtle" :label="$t(`status.certificate.${c.status}`)" />
            </div>
            <UDropdownMenu :items="menu(c)" :content="{ align: 'end' }">
              <UButton color="neutral" variant="ghost" icon="i-tm-dots-v" class="min-h-11 min-w-11" :aria-label="$t('certificate.actions')" />
            </UDropdownMenu>
          </div>
          <p v-if="withFile" class="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <UIcon name="i-tm-file" class="size-4 text-muted" aria-hidden="true" />
            <span v-if="c.hasFile">{{ $t('certificate.fileLoaded') }}</span>
            <span v-else class="text-muted">{{ $t('certificate.noFile') }}</span>
            <UButton color="neutral" variant="outline" size="sm" class="min-h-11" :label="c.hasFile ? $t('certificate.manageFile') : $t('certificate.loadFile')" @click="openFile(c)" />
          </p>
        </li>
      </ul>
    </template>

    <USwitch
      v-if="settings"
      :model-value="settings.certificatesWithFile"
      :loading="savingSetting"
      :label="$t('certificate.withFile')"
      :description="$t('certificate.withFileText')"
      @update:model-value="changeWithFile"
    />

    <UModal v-model:open="form.open" :title="form.id ? $t('certificate.edit') : $t('certificate.add')">
      <template #body>
        <UAlert v-if="form.error" color="error" variant="subtle" icon="i-tm-error" :title="form.error" class="mb-4" />
        <UForm id="form-certificate" :state="form" :validate="validate" :validate-on="['change']" class="space-y-4" @submit="save">
          <UFormField name="type" :label="$t('certificate.labelType')" required>
            <USelect v-model="form.type" :items="types" size="xl" class="w-full" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField name="issueDate" :label="$t('certificate.issue')" required>
              <UInput v-model="form.issueDate" type="date" size="xl" class="w-full" />
            </UFormField>
            <UFormField name="expiryDate" :label="$t('certificate.expiry')" required>
              <UInput v-model="form.expiryDate" type="date" size="xl" class="w-full" />
            </UFormField>
          </div>
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="form.open = false" />
        <UButton type="submit" form="form-certificate" size="lg" :loading="form.submit" :label="$t('common.save')" />
      </template>
    </UModal>

    <UModal v-model:open="deletion.open" :title="$t('certificate.deleteTitle')" :description="$t('certificate.deleteText')">
      <template #body>
        <UAlert v-if="deletion.error" color="error" variant="subtle" icon="i-tm-error" :title="deletion.error" />
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" size="lg" :label="$t('common.cancel')" @click="deletion.open = false" />
        <UButton color="error" size="lg" :loading="deletion.submit" :label="$t('common.delete')" @click="remove" />
      </template>
    </UModal>

    <UModal v-model:open="file.open" :title="$t('certificate.fileTitle')" :description="$t('certificate.bannerHealth')">
      <template #body>
        <div class="space-y-4">
          <UAlert v-if="file.error" color="error" variant="subtle" icon="i-tm-error" :title="file.error" />

          <div v-if="file.preview" class="space-y-2">
            <img v-if="file.preview.type.startsWith('image/')" :src="file.preview.url" :alt="$t('certificate.preview')" class="max-h-80 w-full rounded-md border border-default object-contain">
            <iframe v-else :src="file.preview.url" :title="$t('certificate.preview')" class="h-80 w-full rounded-md border border-default" />
          </div>
          <p v-else-if="file.load" class="text-sm text-muted" role="status">{{ $t('common.loading') }}</p>

          <div
            class="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center"
            :class="file.drag ? 'border-primary bg-primary/10' : 'border-default'"
            @dragover.prevent="file.drag = true"
            @dragleave="file.drag = false"
            @drop.prevent="released"
          >
            <UIcon name="i-tm-upload" class="size-8 text-muted" aria-hidden="true" />
            <p class="text-sm text-muted">{{ $t('certificate.drag') }}</p>
            <div class="flex flex-wrap justify-center gap-2">
              <UButton color="neutral" variant="outline" class="min-h-11" icon="i-tm-file" :loading="file.submit" :label="$t('certificate.chooseFile')" @click="entryFile?.click()" />
              <UButton color="neutral" variant="outline" class="min-h-11" icon="i-tm-camera" :loading="file.submit" :label="$t('certificate.triggersPhoto')" @click="entryPhoto?.click()" />
            </div>
            <p class="text-xs text-muted">{{ $t('certificate.formats') }}</p>
            <input ref="entryFile" type="file" class="sr-only" tabindex="-1" accept="application/pdf,image/jpeg,image/png" :aria-label="$t('certificate.chooseFile')" @change="chosen">
            <input ref="entryPhoto" type="file" class="sr-only" tabindex="-1" accept="image/*" capture="environment" :aria-label="$t('certificate.triggersPhoto')" @change="chosen">
          </div>
        </div>
      </template>
      <template #footer>
        <UButton v-if="file.cert?.hasFile" color="error" variant="outline" size="lg" :loading="file.submit" :label="$t('certificate.deleteFile')" @click="deleteFile" />
        <UButton color="neutral" variant="outline" size="lg" :label="$t('common.close')" @click="file.open = false" />
      </template>
    </UModal>
  </section>
</template>

<script setup lang="ts">
import type { DropdownMenuItem, FormError } from '@nuxt/ui'
import type { CertificateDto, CertificateType } from '~/types/api'
import { checkFile, todayIso, variantCertificate } from '~/utils/certificate'
import { formatDate } from '~/utils/date'
import { validatePeriod } from '~/utils/season'

const props = defineProps<{ personId: string }>()
const emit = defineEmits<{ changed: [] }>()
const { t, locale } = useI18n()
const certificates = useCertificates()
const toast = useToast()

const { data, loading, error, reload } = useLoad(async () => {
  const [list, imp] = await Promise.all([certificates.list(props.personId), certificates.settings()])
  return { list, imp }
})
const list = computed(() => data.value?.list ?? null)
const settings = computed(() => data.value?.imp ?? null)
const withFile = computed(() => settings.value?.certificatesWithFile === true)

const types = computed(() => (['competitive', 'not_competitive'] as CertificateType[]).map(x => ({ label: t(`certificate.type.${x}`), value: x })))

async function refresh() {
  await reload()
  emit('changed')
}

const form = reactive({ open: false, id: '', type: 'competitive' as CertificateType, issueDate: '', expiryDate: '', submit: false, error: '' })
function openForm(c: CertificateDto | null) {
  Object.assign(form, {
    open: true,
    id: c?.id ?? '',
    type: c?.type ?? 'competitive',
    issueDate: c?.issueDate ?? todayIso(),
    expiryDate: c?.expiryDate ?? '',
    error: '',
  })
}
function validate(s: typeof form): FormError[] {
  const err: FormError[] = []
  if (!s.issueDate) err.push({ name: 'issueDate', message: t('validation.data') })
  if (!s.expiryDate) err.push({ name: 'expiryDate', message: t('validation.data') })
  else if (s.issueDate && !validatePeriod(s.issueDate, s.expiryDate)) err.push({ name: 'expiryDate', message: t('certificate.expiryAfterIssue') })
  return err
}
async function save() {
  form.submit = true
  form.error = ''
  try {
    const d = { type: form.type, issueDate: form.issueDate, expiryDate: form.expiryDate }
    if (form.id) await certificates.edit(form.id, d)
    else await certificates.create(props.personId, d)
    form.open = false
    await refresh()
  }
  catch (e) {
    form.error = errorText(e)
  }
  finally {
    form.submit = false
  }
}

const deletion = reactive({ open: false, id: '', submit: false, error: '' })
async function remove() {
  deletion.submit = true
  deletion.error = ''
  try {
    await certificates.remove(deletion.id)
    deletion.open = false
    await refresh()
  }
  catch (e) {
    deletion.error = errorText(e)
  }
  finally {
    deletion.submit = false
  }
}

const savingSetting = ref(false)
async function changeWithFile(v: boolean) {
  savingSetting.value = true
  try {
    await certificates.setFile(v)
    await reload()
  }
  catch (e) {
    toast.add({ title: errorText(e), color: 'error' })
  }
  finally {
    savingSetting.value = false
  }
}

// File: the preview downloads the content (read tracked by the API) only when the admin opens the window.
const entryFile = ref<HTMLInputElement | null>(null)
const entryPhoto = ref<HTMLInputElement | null>(null)
const file = reactive({
  open: false,
  cert: null as CertificateDto | null,
  preview: null as { url: string, type: string } | null,
  load: false,
  submit: false,
  drag: false,
  error: '',
})

function freePreview() {
  if (file.preview) URL.revokeObjectURL(file.preview.url)
  file.preview = null
}
async function readPreview(c: CertificateDto) {
  freePreview()
  if (!c.hasFile) return
  file.load = true
  try {
    const blob = await certificates.downloadFile(c.id)
    const type = blob.type || c.fileType || 'application/pdf'
    file.preview = { url: URL.createObjectURL(blob), type }
  }
  catch (e) {
    file.error = errorText(e)
  }
  finally {
    file.load = false
  }
}
async function openFile(c: CertificateDto) {
  Object.assign(file, { open: true, cert: c, error: '', drag: false })
  await readPreview(c)
}
watch(() => file.open, (v) => {
  if (!v) freePreview()
})
onBeforeUnmount(freePreview)

async function send(f: File) {
  if (!file.cert) return
  const code = checkFile(f)
  if (code) {
    file.error = t(`errors.codes.${code}`)
    return
  }
  file.submit = true
  file.error = ''
  try {
    file.cert = await certificates.loadFile(file.cert.id, f)
    await refresh()
    await readPreview(file.cert)
  }
  catch (e) {
    file.error = errorText(e)
  }
  finally {
    file.submit = false
  }
}
function chosen(ev: Event) {
  const input = ev.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (f) void send(f)
}
function released(ev: DragEvent) {
  file.drag = false
  const f = ev.dataTransfer?.files?.[0]
  if (f) void send(f)
}
async function deleteFile() {
  if (!file.cert) return
  file.submit = true
  file.error = ''
  try {
    await certificates.deleteFile(file.cert.id)
    freePreview()
    file.cert = { ...file.cert, hasFile: false, fileType: null }
    await refresh()
  }
  catch (e) {
    file.error = errorText(e)
  }
  finally {
    file.submit = false
  }
}

function menu(c: CertificateDto): DropdownMenuItem[][] {
  return [
    [{ label: t('common.edit'), icon: 'i-tm-edit', onSelect: () => openForm(c) }],
    [{ label: t('common.delete'), icon: 'i-tm-trash', color: 'error' as const, onSelect: () => Object.assign(deletion, { open: true, id: c.id, error: '' }) }],
  ]
}

onMounted(reload)
</script>
