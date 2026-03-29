from collections.abc import Iterable

import httpx

from app.core.config import settings


class EventServiceClient:
    def __init__(self) -> None:
        self.base_url = settings.event_service_base_url.rstrip("/")

    async def list_events(self, station_codes: Iterable[str] | None = None, **filters):
        station_codes = list(station_codes or [])
        merged_events = []

        if station_codes:
            for station_code in station_codes:
                params = {k: v for k, v in filters.items() if v is not None}
                params["station_code"] = station_code
                station_events = await self._get("/v1/events", params=params)
                merged_events.extend(station_events)
        else:
            merged_events = await self._get("/v1/events", params={k: v for k, v in filters.items() if v is not None})

        unique = {event["id"]: event for event in merged_events}
        return sorted(unique.values(), key=lambda item: item["created_at"], reverse=True)

    async def get_event(self, event_id: int):
        return await self._get(f"/v1/events/{event_id}")

    async def patch_event(self, event_id: int, payload: dict):
        return await self._patch(f"/v1/events/{event_id}", json=payload)

    async def _get(self, path: str, **kwargs):
        async with httpx.AsyncClient(base_url=self.base_url, timeout=15.0) as client:
            response = await client.get(path, **kwargs)
            response.raise_for_status()
            return response.json()

    async def _patch(self, path: str, **kwargs):
        async with httpx.AsyncClient(base_url=self.base_url, timeout=15.0) as client:
            response = await client.patch(path, **kwargs)
            response.raise_for_status()
            return response.json()


event_service_client = EventServiceClient()
