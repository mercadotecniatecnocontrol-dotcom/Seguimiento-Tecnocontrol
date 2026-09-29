from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class EmployeeValidate(BaseModel):
    id: int
    password: str

class EmployeeResponse(BaseModel):
    id: int
    name: str
    department: str

    class Config:
        from_attributes = True

class ActionRequest(BaseModel):
    serial_number: str
    article_name: Optional[str] = None
    employee_name: str
    employee_department: Optional[str] = "General"
    signature_data: str
    observations: Optional[str] = None
    photo_url: Optional[str] = None
    condition: Optional[str] = None

class TrackingHistoryResponse(BaseModel):
    id: int
    action: str
    employee: EmployeeResponse
    timestamp: datetime
    signature_data: str
    photo_url: Optional[str] = None
    observations: Optional[str] = None
    condition: Optional[str] = None

    class Config:
        from_attributes = True

class EquipmentBasic(BaseModel):
    serial_number: str
    article_name: Optional[str] = None
    
    class Config:
        from_attributes = True

class TrackingHistoryGlobalResponse(TrackingHistoryResponse):
    equipment: EquipmentBasic

class LoanCycleResponse(BaseModel):
    equipment: EquipmentBasic
    start_event: TrackingHistoryResponse
    end_event: Optional[TrackingHistoryResponse] = None
    status: str

class EquipmentResponse(BaseModel):
    id: int
    serial_number: str
    article_name: Optional[str] = None
    status: str
    observations: Optional[str] = None
    condition: Optional[str] = None
    history: List[TrackingHistoryResponse] = []

    class Config:
        from_attributes = True
