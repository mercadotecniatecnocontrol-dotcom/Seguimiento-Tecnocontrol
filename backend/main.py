from typing import List
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload
from fastapi.security import OAuth2PasswordRequestForm
from database import SessionLocal, engine
from jose import JWTError, jwt
from datetime import timedelta
import models, schemas
import auth
import io
import base64
from PIL import Image
import openpyxl
from openpyxl.drawing.image import Image as ExcelImage
from openpyxl.styles import Font, Alignment, PatternFill
from fastapi.responses import StreamingResponse

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Seguimiento TecnoControl API")

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev only. Update in production.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(token: str = Depends(auth.oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(models.Employee).filter(models.Employee.name == username).first()
    if user is None:
        raise credentials_exception
    return user

# Temporary: Seed some employees if none exist for testing
def seed_data(db: Session):
    if not db.query(models.Employee).first():
        e1 = models.Employee(id=1, name="Mercadotecnia", department="Administración", password=auth.get_password_hash("TencoControl@@2026."))
        db.add(e1)
        db.commit()

@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    seed_data(db)
    db.close()

@app.post("/api/token", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.Employee).filter(models.Employee.name == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.name}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/validate-employee", response_model=schemas.EmployeeResponse)
def validate_employee(request: schemas.EmployeeValidate, db: Session = Depends(get_db)):
    employee = db.query(models.Employee).filter(models.Employee.id == request.id).first()
    if not employee or not auth.verify_password(request.password, employee.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return employee

@app.post("/api/equipment/receive", response_model=schemas.EquipmentResponse)
def receive_equipment(request: schemas.ActionRequest, db: Session = Depends(get_db), current_user: models.Employee = Depends(get_current_user)):
    # Check if equipment exists
    equipment = db.query(models.Equipment).filter(models.Equipment.serial_number == request.serial_number).first()
    
    if equipment and equipment.status == "Recibido":
        raise HTTPException(status_code=400, detail="Este equipo ya se encuentra registrado como 'Recibido'.")
        
    if not equipment:
        equipment = models.Equipment(
            serial_number=request.serial_number,
            article_name=request.article_name,
            status="Recibido",
            observations=request.observations,
            condition=request.condition
        )
        db.add(equipment)
        db.flush()
    else:
        equipment.status = "Recibido"
        if request.article_name:
            equipment.article_name = request.article_name
        if request.observations:
            equipment.observations = request.observations
        if request.condition:
            equipment.condition = request.condition
            
    employee = db.query(models.Employee).filter(models.Employee.name == request.employee_name).first()
    if not employee:
        employee = models.Employee(name=request.employee_name, department=request.employee_department, password="")
        db.add(employee)
        db.flush()

    history_entry = models.TrackingHistory(
        equipment_id=equipment.id,
        action="Recepción",
        employee_id=employee.id,
        signature_data=request.signature_data,
        photo_url=request.photo_url,
        observations=request.observations,
        condition=request.condition
    )
    db.add(history_entry)
    db.commit()
    db.refresh(equipment)
    
    return db.query(models.Equipment).options(joinedload(models.Equipment.history).joinedload(models.TrackingHistory.employee)).filter(models.Equipment.id == equipment.id).first()

@app.post("/api/equipment/{serial}/dispatch", response_model=schemas.EquipmentResponse)
def dispatch_equipment(serial: str, request: schemas.ActionRequest, db: Session = Depends(get_db), current_user: models.Employee = Depends(get_current_user)):
    equipment = db.query(models.Equipment).filter(models.Equipment.serial_number == serial).first()
    if not equipment:
        raise HTTPException(status_code=404, detail="El equipo no existe en el sistema.")
        
    if equipment.status == "Despachado":
        raise HTTPException(status_code=400, detail="Este equipo ya fue despachado.")
        
    equipment.status = "Despachado"
    if request.observations:
        equipment.observations = request.observations
    if request.condition:
        equipment.condition = request.condition
        
    employee = db.query(models.Employee).filter(models.Employee.name == request.employee_name).first()
    if not employee:
        employee = models.Employee(name=request.employee_name, department=request.employee_department, password="")
        db.add(employee)
        db.flush()

    history_entry = models.TrackingHistory(
        equipment_id=equipment.id,
        action="Salida",
        employee_id=employee.id,
        signature_data=request.signature_data,
        photo_url=request.photo_url,
        observations=request.observations,
        condition=request.condition
    )
    db.add(history_entry)
    db.commit()
    db.refresh(equipment)
    
    return db.query(models.Equipment).options(joinedload(models.Equipment.history).joinedload(models.TrackingHistory.employee)).filter(models.Equipment.id == equipment.id).first()

@app.get("/api/equipment", response_model=List[schemas.EquipmentResponse])
def get_equipments(db: Session = Depends(get_db)):
    # Eager load history to return in the table if needed
    equipments = db.query(models.Equipment).options(joinedload(models.Equipment.history).joinedload(models.TrackingHistory.employee)).all()
    return equipments

@app.get("/api/equipment/{serial}/history", response_model=schemas.EquipmentResponse)
def get_equipment_history(serial: str, db: Session = Depends(get_db)):
    equipment = db.query(models.Equipment).options(joinedload(models.Equipment.history).joinedload(models.TrackingHistory.employee)).filter(models.Equipment.serial_number == serial).first()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return equipment

@app.get("/api/history", response_model=List[schemas.LoanCycleResponse])
def get_global_history(db: Session = Depends(get_db)):
    # Fetch the latest 50 'Recepción' events (starts of cycles)
    start_events = db.query(models.TrackingHistory).options(
        joinedload(models.TrackingHistory.employee),
        joinedload(models.TrackingHistory.equipment)
    ).filter(models.TrackingHistory.action == "Recepción")\
     .order_by(models.TrackingHistory.timestamp.desc()).limit(50).all()

    cycles = []
    
    for start in start_events:
        # Find the first 'Salida' event for this equipment that happened AFTER this 'Recepción'
        end = db.query(models.TrackingHistory).options(
            joinedload(models.TrackingHistory.employee)
        ).filter(
            models.TrackingHistory.equipment_id == start.equipment_id,
            models.TrackingHistory.action == "Salida",
            models.TrackingHistory.timestamp > start.timestamp
        ).order_by(models.TrackingHistory.timestamp.asc()).first()
        
        cycles.append({
            "equipment": start.equipment,
            "start_event": start,
            "end_event": end,
            "status": "Completado" if end else "En uso"
        })

    return cycles

@app.get("/api/equipment/export")
def export_equipments(db: Session = Depends(get_db)):
    equipments = db.query(models.Equipment).options(joinedload(models.Equipment.history).joinedload(models.TrackingHistory.employee)).all()
    
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Inventario"
    
    # --- Formato Formal: Logo y Título ---
    try:
        logo = ExcelImage("../frontend/logotecno.png")
        logo.width = 160
        logo.height = 50
        ws.add_image(logo, "A1")
    except Exception as e:
        print(f"Could not load logo: {e}")

    ws.merge_cells("C1:H3")
    title_cell = ws["C1"]
    title_cell.value = "REPORTE DE INVENTARIO Y MOVIMIENTOS - TECNOCONTROL"
    title_cell.font = Font(name="Arial", size=16, bold=True, color="0F172A")
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    
    # Ajustar altura de las filas del encabezado
    ws.row_dimensions[1].height = 20
    ws.row_dimensions[2].height = 20
    ws.row_dimensions[3].height = 20
    ws.row_dimensions[4].height = 10 # Espacio en blanco
    
    # Headers
    headers = ["Serie", "Artículo", "Estado", "Receptor", "Despachador", "Condición Físico", "Observaciones", "Foto Recepción", "Foto Salida", "Firma Recepción", "Firma Salida"]
    for col_idx, header in enumerate(headers, 1):
        ws.cell(row=5, column=col_idx, value=header)
    
    # Styling headers
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid") # Formal Deep Navy Blue
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=5, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
    
    # Set column widths
    column_widths = [15, 25, 15, 20, 20, 15, 30, 20, 20, 25, 25]
    for i, column_width in enumerate(column_widths, 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = column_width

    # Process data
    row_idx = 6
    for eq in equipments:
        sorted_history = sorted(eq.history, key=lambda x: x.timestamp, reverse=True)
        receive_hist = next((h for h in sorted_history if h.action == 'Recepción'), None)
        dispatch_hist = next((h for h in sorted_history if h.action == 'Salida'), None)
        
        ws.row_dimensions[row_idx].height = 80  # Height for images
        
        receptor = receive_hist.employee.name if receive_hist else "-"
        dispatcher = dispatch_hist.employee.name if dispatch_hist else "-"
        
        row_data = [
            eq.serial_number,
            eq.article_name or "-",
            eq.status,
            receptor,
            dispatcher,
            eq.condition or "-",
            eq.observations or "-"
        ]
        
        # Write text cells
        for col_idx, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.alignment = Alignment(vertical="center", horizontal="center" if col_idx in [1, 3] else "left", wrap_text=True)

        def add_base64_image(b64_str, col):
            if not b64_str: return
            try:
                if "," in b64_str:
                    b64_str = b64_str.split(",")[1]
                img_data = base64.b64decode(b64_str)
                img = Image.open(io.BytesIO(img_data))
                img.thumbnail((120, 100))
                temp_io = io.BytesIO()
                img.save(temp_io, format="PNG")
                temp_io.seek(0)
                
                xl_img = ExcelImage(temp_io)
                # Apply slight offset
                xl_img.anchor = f"{openpyxl.utils.get_column_letter(col)}{row_idx}"
                ws.add_image(xl_img)
            except Exception as e:
                print(f"Image processing error: {e}")

        # Foto Recepcion
        if receive_hist and receive_hist.photo_url:
            add_base64_image(receive_hist.photo_url, 8)
            
        # Foto Salida
        if dispatch_hist and dispatch_hist.photo_url:
            add_base64_image(dispatch_hist.photo_url, 9)
        
        # Signature Recepcion
        if receive_hist and receive_hist.signature_data:
            add_base64_image(receive_hist.signature_data, 10)
            
        # Signature Salida
        if dispatch_hist and dispatch_hist.signature_data:
            add_base64_image(dispatch_hist.signature_data, 11)
            
        row_idx += 1

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    headers_dict = {
        'Content-Disposition': 'attachment; filename="inventario_tecnocontrol.xlsx"'
    }
    return StreamingResponse(output, headers=headers_dict, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

# Serve Frontend
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")
