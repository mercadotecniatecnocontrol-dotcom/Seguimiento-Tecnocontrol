import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv() # Carga las variables del archivo .env

# Usa la URL de la base de datos desde el archivo .env, o cae en un error si no existe
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    raise ValueError("No se encontró DATABASE_URL en el entorno. Asegúrate de configurar el archivo .env")

# Corregir el dialecto de postgres:// a postgresql:// si es necesario (común en Supabase/Render)
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Para PostgreSQL no necesitamos el check_same_thread
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
