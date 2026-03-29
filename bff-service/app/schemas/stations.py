from pydantic import BaseModel


class StationOut(BaseModel):
    id: int
    station_code: str
    name: str
    location: str
    status: str

    class Config:
        from_attributes = True
