import os
from datetime import timedelta


class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///attendance.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
    JWT_EXPIRES_HOURS = int(os.getenv("JWT_EXPIRES_HOURS", "12"))
    JWT_EXPIRES_DELTA = timedelta(hours=JWT_EXPIRES_HOURS)
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "static", "uploads")
