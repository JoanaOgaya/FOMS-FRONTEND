export function getApiStatus(error: unknown): number {
  if (!error || typeof error !== 'object') return 0;
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  if (typeof candidate.status === 'number') return candidate.status;
  return typeof candidate.response?.status === 'number' ? candidate.response.status : 0;
}

export function getValidationErrors(error: unknown): Record<string, string> {
  if (!error || typeof error !== 'object') return {};
  const candidate = error as {
    data?: { errors?: unknown };
    response?: { data?: { errors?: unknown } };
  };
  const errors = candidate.data?.errors ?? candidate.response?.data?.errors;
  if (!errors || typeof errors !== 'object') return {};

  return Object.fromEntries(
    Object.entries(errors as Record<string, unknown>).flatMap(([field, messages]) => {
      const first = Array.isArray(messages) ? messages[0] : messages;
      return typeof first === 'string' ? [[field.charAt(0).toLowerCase() + field.slice(1), first]] : [];
    }),
  );
}

export function getApiErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as {
      message?: unknown;
      data?: { message?: unknown; error?: unknown };
      response?: { data?: { message?: unknown; error?: unknown } };
    };
    const message =
      candidate.data?.message ??
      candidate.response?.data?.message ??
      candidate.data?.error ??
      candidate.response?.data?.error ??
      candidate.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'The request could not be completed.';
}

export function getRecordErrorMessage(error: unknown): string {
  const status = getApiStatus(error);
  if (status === 403) return "You don't have permission to update this record.";
  if (status === 404) return 'This record no longer exists.';
  if (status === 409) return 'This record was changed by someone else.';
  if (status === 0 || status >= 500) return 'Service unavailable. Please retry.';
  return getApiErrorMessage(error);
}
