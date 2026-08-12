from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database.connection import Base

class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(String, nullable=True)

class Permission(Base):
    __tablename__ = "permissions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=True)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=True)
    industry = Column(String, default="Education")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
class Workspace(Base):
    __tablename__ = "workspaces"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False) # e.g. PDAC, DBDA, Engineering Dept
    code = Column(String, unique=True, nullable=False)
    industry = Column(String, default="Education")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    name = Column(String, nullable=False) # e.g. Subject 1, Apollo Project
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Enrollment(Base):
    __tablename__ = "enrollments"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True) # Optional fine-grained affiliation

class Session(Base):
    __tablename__ = "sessions"
    id = Column(String, primary_key=True) # The Meeting Code (e.g. AI-101)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    start_time = Column(DateTime(timezone=True), server_default=func.now())
    end_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="active")

class Calibration(Base):
    __tablename__ = "calibrations"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    ear_weight = Column(Integer, default=100) # Base 100%
    pose_weight = Column(Integer, default=100)
    emotion_weight = Column(Integer, default=100)
    base_offset = Column(Integer, default=0) # Flat +/- to final score
