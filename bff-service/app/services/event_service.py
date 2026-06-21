from collections.abc import Iterable

import httpx

from app.core.config import settings


class EventServiceClient:
    def __init__(self) -> None:
        self.base_url = settings.event_service_base_url.rstrip("/")

    async def list_events(self, station_codes: Iterable[str] | None = None, **filters):
        station_codes = list(station_codes or [])
        params = {k: v for k, v in filters.items() if v is not None}
        if station_codes:
            params["station_codes"] = station_codes

        data = await self._get("/v1/events", params=params)
        if isinstance(data, list):
            # Backward compatibility with older event-service deployments.
            unique = {event["id"]: event for event in data}
            events = sorted(unique.values(), key=lambda item: item["created_at"], reverse=True)
            return {"items": events, "total": len(events), "limit": len(events), "offset": 0}
        return data

    async def get_event(self, event_id: int):
        return await self._get(f"/v1/events/{event_id}")

    async def create_event(self, payload: dict):
        return await self._post("/v1/events", json=payload)

    async def add_media(self, event_id: int, payload: dict):
        return await self._post(f"/v1/events/{event_id}/media", json=payload)

    async def patch_event(self, event_id: int, payload: dict):
        return await self._patch(f"/v1/events/{event_id}", json=payload)

    async def _get(self, path: str, **kwargs):
        async with httpx.AsyncClient(base_url=self.base_url, timeout=15.0) as client:
            response = await client.get(path, **kwargs)
            response.raise_for_status()
            return response.json()

    async def _post(self, path: str, **kwargs):
        async with httpx.AsyncClient(base_url=self.base_url, timeout=30.0) as client:
            response = await client.post(path, **kwargs)
            response.raise_for_status()
            return response.json()

    async def _patch(self, path: str, **kwargs):
        async with httpx.AsyncClient(base_url=self.base_url, timeout=15.0) as client:
            response = await client.patch(path, **kwargs)
            response.raise_for_status()
            return response.json()


event_service_client = EventServiceClient()
