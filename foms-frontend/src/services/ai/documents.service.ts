/**
 * src/services/ai/documents.service.ts
 * Service for Document Checking and Extraction (FR-020..FR-024, NFR-007).
 * Uploads documents, tracks processing status, and sends user-confirmed fields.
 * Extracted values never auto-fill or auto-submit official records.
 */

import { http } from '../apiClient';
import type {
  DocumentType,
  DocumentExtractionResult,
  ConfirmExtractionPayload,
} from '../../types/ai';

export const documentsService = {
  /**
   * Uploads a document for AI checking and information extraction.
   * Enforces file size and type validation before transmission.
   */
  async upload(
    file: File,
    documentType: DocumentType,
    onProgress?: (percent: number) => void
  ): Promise<{ id: string; status: string; message?: string }> {
    // Client-side pre-validation
    const MAX_SIZE_MB = 10;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      throw new Error(`File size exceeds maximum limit of ${MAX_SIZE_MB}MB.`);
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|pdf)$/i)) {
      throw new Error('Unsupported file type. Please upload a JPG, PNG, WEBP, or PDF file.');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);

    // If progress tracking is needed, we can simulate or use XMLHttpRequest/axios
    if (onProgress) {
      onProgress(30);
    }

    const res = await http.post<{ id: string; status: string; message?: string }>('/ai/documents/upload', formData);

    if (onProgress) {
      onProgress(100);
    }
    return res;
  },

  /**
   * Fetches current processing status and extracted results.
   */
  async getStatus(id: string): Promise<DocumentExtractionResult> {
    return http.get<DocumentExtractionResult>(`/ai/documents/${encodeURIComponent(id)}`);
  },

  /**
   * Confirms or corrects extracted values with reviewer name and remarks.
   */
  async confirmExtraction(
    id: string,
    payload: ConfirmExtractionPayload
  ): Promise<{ success: boolean; record: DocumentExtractionResult }> {
    return http.post<{ success: boolean; record: DocumentExtractionResult }>(
      `/ai/documents/${encodeURIComponent(id)}/confirm`,
      payload
    );
  },

  /**
   * Lists document extraction history scoped to role.
   */
  async list(query: {
    page?: number;
    pageSize?: number;
    documentType?: string;
    status?: string;
    scope?: string;
    search?: string;
  } = {}): Promise<{ items: DocumentExtractionResult[]; total: number }> {
    return http.get<{ items: DocumentExtractionResult[]; total: number }>('/ai/documents', query);
  },
};
