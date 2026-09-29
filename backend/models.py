from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    department = Column(String)
    password = Column(String)  # Note: Storing plain text for prototype, should be hashed in prod

class Equipment(Base):
    __tablename__ = "equipments"
    id = Column(Integer, primary_key=True, index=True)
    serial_number = Column(String, unique=True, index=True)
    article_name = Column(String, nullable=True)
    status = Column(String) # 'Recibido' or 'Despachado'
    observations = Column(String, nullable=True)
    condition = Column(String, nullable=True)
    
    history = relationship("TrackingHistory", back_populates="equipment")

class TrackingHistory(Base):
    __tablename__ = "tracking_history"
    id = Column(Integer, primary_key=True, index=True)
    equipment_id = Column(Integer, ForeignKey("equipments.id"))
    action = Column(String) # 'Recepción' or 'Salida'
    employee_id = Column(Integer, ForeignKey("employees.id"))
    timestamp = Column(DateTime, default=datetime.now)
    signature_data = Column(String) # Base64 string of signature
    photo_url = Column(String, nullable=True) # URL or path to photo
    observations = Column(String, nullable=True)
    condition = Column(String, nullable=True)

    equipment = relationship("Equipment", back_populates="history")
    employee = relationship("Employee")
