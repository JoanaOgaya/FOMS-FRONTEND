import { http } from './apiClient';

interface CreatePaymentResponse {
  checkoutUrl?: string;
  referenceOrNumber?: string;
  message?: string;
}

export async function createPayMongoLink(
  invoiceNumber: string,
  amount: number,
  returnUrl: string,
): Promise<{ checkoutUrl: string; referenceNumber: string }> {
  const result = await http.post<CreatePaymentResponse>('/speedpay/create-payment', {
    invoiceNo: invoiceNumber,
    amount,
    paymentMethod: 'PayMongo',
    returnUrl,
  });

  const checkoutUrl = result.checkoutUrl;
  const referenceNumber = result.referenceOrNumber;
  if (!checkoutUrl || !referenceNumber) {
    throw new Error(result.message ?? 'Payment service returned incomplete checkout details.');
  }

  return { checkoutUrl, referenceNumber };
}
