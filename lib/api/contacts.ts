import { apiClient } from './client';

export interface Contact {
  id: string;
  accountId: string;
  name: string;
  note?: string | null;
  photoUrl?: string | null;
  createdAt?: string;
}

interface ApiEnvelope<T> { success: boolean; data: T }

export async function listContacts(): Promise<Contact[]> {
  const { data } = await apiClient.get<ApiEnvelope<Contact[]>>('/api/contacts');
  return data.data;
}

export async function createContact(input: {
  accountId: string;
  name?: string;
  note?: string;
}): Promise<Contact> {
  const { data } = await apiClient.post<ApiEnvelope<Contact>>('/api/contacts', input);
  return data.data;
}

export async function updateContact(id: string, input: {
  name?: string;
  note?: string;
}): Promise<Contact> {
  const { data } = await apiClient.patch<ApiEnvelope<Contact>>(`/api/contacts/${id}`, input);
  return data.data;
}

export async function deleteContact(id: string): Promise<void> {
  await apiClient.delete(`/api/contacts/${id}`);
}
