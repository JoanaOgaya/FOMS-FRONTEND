import requests
import logging
from typing import List
from app.core.config import settings

logger = logging.getLogger("foms_client")

class FomsClient:
    def __init__(self):
        self.base_url = settings.FOMS_API_URL
        self.headers = {"Authorization": f"ApiKey {settings.FOMS_API_KEY}"}

    def _get_all_pages(self, endpoint: str) -> List[dict]:
        all_items = []
        page = 1
        page_size = 100
        while True:
            try:
                url = f"{self.base_url}{endpoint}?page={page}&pageSize={page_size}"
                response = requests.get(url, headers=self.headers, timeout=10)
                response.raise_for_status()
                data = response.json()
                items = data.get("items", [])
                if not items:
                    break
                all_items.extend(items)
                
                total_count = data.get("totalCount", 0)
                if len(all_items) >= total_count:
                    break
                page += 1
            except requests.exceptions.RequestException as e:
                logger.error(f"Error fetching from FOMS API {endpoint}: {str(e)}")
                break
        return all_items

    def get_waybills(self) -> List[dict]:
        return self._get_all_pages("/api/ai-data/waybills")

    def get_invoices(self) -> List[dict]:
        return self._get_all_pages("/api/ai-data/invoices")

    def get_official_receipts(self) -> List[dict]:
        return self._get_all_pages("/api/ai-data/official-receipts")

    def get_speedpay_submissions(self) -> List[dict]:
        return self._get_all_pages("/api/ai-data/speedpay-submissions")

    def get_accounts_receivable(self) -> List[dict]:
        return self._get_all_pages("/api/ai-data/accounts-receivable")
        
    def get_aging_data(self) -> List[dict]:
        return self._get_all_pages("/api/ai-data/aging")
        
    def get_payments(self) -> List[dict]:
        return self._get_all_pages("/api/ai-data/payments")

    def get_collection_history(self) -> List[dict]:
        # Not paginated in mock, but we'll try to get it directly
        try:
            url = f"{self.base_url}/api/ai-data/collection-history"
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching from FOMS API /api/ai-data/collection-history: {str(e)}")
            return []
