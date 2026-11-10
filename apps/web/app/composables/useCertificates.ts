import type { PersonCertificates, CertificateDto, CertificateDue, ClubSettings, CertificateType } from '../types/api'

export interface CertificateData {
  type: CertificateType
  issueDate: string
  expiryDate: string
}

/** Medical certificates (screen 25). Health data: every file read is tracked by the API. */
export function useCertificates() {
  const api = useApi()
  return {
    list: (personId: string) => api<PersonCertificates>(`/people/${personId}/certificates`),
    /** Players of the team whose certificate expires within 30 days or has expired: status and dates only. Needs the certificates permission in the team. */
    due: (seasonId: string) => api<CertificateDue[]>(`/seasons/${seasonId}/certificates-due`),
    create: (personId: string, data: CertificateData) =>
      api<CertificateDto>(`/people/${personId}/certificates`, { method: 'POST', body: { ...data } }),
    edit: (id: string, data: Partial<CertificateData>) =>
      api<CertificateDto>(`/certificates/${id}`, { method: 'PATCH', body: { ...data } }),
    remove: (id: string) => api<void>(`/certificates/${id}`, { method: 'DELETE' }),
    loadFile: (id: string, file: Blob) => api<CertificateDto>(`/certificates/${id}/file`, { method: 'PUT', body: file }),
    downloadFile: (id: string) => api<Blob>(`/certificates/${id}/file`, { response: 'blob' }),
    deleteFile: (id: string) => api<void>(`/certificates/${id}/file`, { method: 'DELETE' }),
    settings: () => api<ClubSettings>('/club/current/settings'),
    setFile: (active: boolean) =>
      api<ClubSettings>('/club/current/settings', { method: 'PATCH', body: { certificatesWithFile: active } }),
  }
}
