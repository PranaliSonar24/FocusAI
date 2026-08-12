from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy import select, text
from database.connection import SessionLocal
import pandas as pd
import io
import random
import string
from models.relational import User, Role, Workspace, Project, Enrollment

router = APIRouter()

def generate_password(length=8):
    characters = string.ascii_letters + string.digits
    return "".join(random.choice(characters) for i in range(length))

class WorkspaceCreate(BaseModel):
    name: str
    code: str
    industry: str = "Education"

class ProjectCreate(BaseModel):
    workspace_id: int
    name: str

class AssignHost(BaseModel):
    username: str
    workspace_id: int
    project_id: int

@router.post("/course")
async def create_course(req: WorkspaceCreate):
    from models.relational import Workspace
    try:
        async with SessionLocal() as db:
            db.add(Workspace(name=req.name, code=req.code, industry=req.industry))
            await db.commit()
            return {"message": "Course created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/subject")
async def create_subject(req: ProjectCreate):
    from models.relational import Project
    try:
        async with SessionLocal() as db:
            db.add(Project(workspace_id=req.workspace_id, name=req.name))
            await db.commit()
            return {"message": "Subject created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/assign")
async def assign_host(req: AssignHost):
    from models.relational import Enrollment
    try:
        async with SessionLocal() as db:
            # Get user id
            user_res = await db.execute(text("SELECT id FROM users WHERE username = :un"), {"un": req.username})
            u_row = user_res.fetchone()
            if not u_row:
                return {"message": "User not found"}
            user_id = u_row.id
                
            # Check if assignment already exists
            existing = await db.execute(select(Enrollment).where(
                (Enrollment.user_id == user_id) & 
                (Enrollment.workspace_id == req.workspace_id) &
                (Enrollment.project_id == req.project_id)
            ))
            if existing.scalar_one_or_none():
                return {"message": "User is already assigned to this subject"}
            
            db.add(Enrollment(
                user_id=user_id,
                workspace_id=req.workspace_id,
                project_id=req.project_id
            ))
            await db.commit()
            return {"message": "Host assigned successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/course/{course_id}")
async def delete_course(course_id: int):
    try:
        async with SessionLocal() as db:
            await db.execute(text("DELETE FROM enrollments WHERE workspace_id = :wid"), {"wid": course_id})
            await db.execute(text("DELETE FROM projects WHERE workspace_id = :wid"), {"wid": course_id})
            await db.execute(text("DELETE FROM workspaces WHERE id = :wid"), {"wid": course_id})
            await db.commit()
            return {"message": "Course deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/subject/{subject_id}")
async def delete_subject(subject_id: int):
    try:
        async with SessionLocal() as db:
            await db.execute(text("DELETE FROM enrollments WHERE project_id = :pid"), {"pid": subject_id})
            await db.execute(text("DELETE FROM projects WHERE id = :pid"), {"pid": subject_id})
            await db.commit()
            return {"message": "Subject deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/assign/{user_id}/{project_id}")
async def delete_assignment(user_id: int, project_id: int):
    try:
        async with SessionLocal() as db:
            await db.execute(text("DELETE FROM enrollments WHERE user_id = :uid AND project_id = :pid"), {"uid": user_id, "pid": project_id})
            await db.commit()
            return {"message": "Assignment removed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tree")
async def get_taxonomy_tree(industry: str = "Education"):
    try:
        async with SessionLocal() as db:
            # Fetch all workspaces
            ws_res = await db.execute(text("SELECT id, name, code FROM workspaces WHERE industry = :ind"), {"ind": industry})
            workspaces = ws_res.fetchall()
            
            tree = []
            for ws in workspaces:
                ws_data = {"id": ws.id, "name": ws.name, "code": ws.code, "subjects": []}
                
                # Fetch subjects for this workspace
                proj_res = await db.execute(text("SELECT id, name FROM projects WHERE workspace_id = :wid"), {"wid": ws.id})
                projects = proj_res.fetchall()
                
                for prj in projects:
                    prj_data = {"id": prj.id, "name": prj.name, "hosts": []}
                    
                    # Fetch assigned hosts
                    host_res = await db.execute(text("""
                        SELECT u.id, u.username FROM enrollments e
                        JOIN users u ON e.user_id = u.id
                        WHERE e.project_id = :pid
                    """), {"pid": prj.id})
                    hosts = host_res.fetchall()
                    
                    for h in hosts:
                        prj_data["hosts"].append({"id": h.id, "username": h.username})
                        
                    ws_data["subjects"].append(prj_data)
                    
                tree.append(ws_data)
                
            return tree
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
@router.get("/my-subjects")
async def get_my_subjects(username: str):
    try:
        async with SessionLocal() as db:
            res = await db.execute(text("""
                SELECT DISTINCT p.id, p.name, w.name as workspace_name
                FROM projects p
                JOIN enrollments e ON p.id = e.project_id
                JOIN users u ON e.user_id = u.id
                JOIN workspaces w ON p.workspace_id = w.id
                WHERE u.username = :un
            """), {"un": username})
            subjects = res.fetchall()
            return [{"id": s.id, "name": s.name, "workspace_name": s.workspace_name} for s in subjects]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/bulk-import")
async def bulk_import_taxonomy(industry: str = Form("Education"), file: UploadFile = File(...)):
    contents = await file.read()
    filename = file.filename.lower()
    
    try:
        if filename.endswith(".xlsx") or filename.endswith(".xls"):
            sheets_dict = pd.read_excel(io.BytesIO(contents), header=None, sheet_name=None)
            df = list(sheets_dict.values())[0]  # Just take the first sheet for taxonomy
        elif filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents), header=None)
        else:
            raise HTTPException(status_code=400, detail="Only .xlsx or .csv files are supported.")
            
        # Find the header row
        header_idx = -1
        for idx, row in df.iterrows():
            row_values = [str(x).strip().lower().replace(" ", "_") for x in row.values]
            if 'course_name' in row_values or 'student_prn' in row_values:
                header_idx = idx
                break
                
        if header_idx != -1:
            df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.iloc[header_idx]]
            df = df.iloc[header_idx + 1:]
        else:
            # Fallback to assuming first row is header
            df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.iloc[0]]
            df = df.iloc[1:]
            
        required_columns = ['course_name', 'course_code', 'subject_name', 'faculty_name', 'faculty_email', 'student_name', 'student_prn', 'student_email']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            raise HTTPException(status_code=400, detail=f"Invalid file format! Missing required columns: {', '.join(missing_columns)}. Please make sure you are uploading the correct 'demo_upload_multi.csv' file.")
        print("DEBUG COLUMNS:", df.columns)
        if len(df) > 0:
            print("DEBUG ROW 0:", df.iloc[0].to_dict())
        
        async with SessionLocal() as db:
            # Pre-fetch roles
            roles_res = await db.execute(select(Role))
            roles = {r.name: r.id for r in roles_res.scalars().all()}
            host_role_id = roles.get("Host")
            user_role_id = roles.get("User")
            
            created_users = []
            
            for _, row in df.iterrows():
                # Extract fields safely
                c_name = str(row.get('course_name', '')).strip()
                c_code = str(row.get('course_code', '')).strip()
                s_name = str(row.get('subject_name', '')).strip()
                f_name = str(row.get('faculty_name', '')).strip()
                f_email = str(row.get('faculty_email', '')).strip()
                st_prn = str(row.get('student_prn', '')).strip()
                if st_prn.endswith('.0'):
                    st_prn = st_prn[:-2]
                st_name = str(row.get('student_name', '')).strip()
                st_email = str(row.get('student_email', '')).strip()
                
                if not c_name or c_name == 'nan': continue
                
                # 2. Workspace
                workspace = None
                if c_name and c_name != 'nan':
                    ws_res = await db.execute(select(Workspace).where(Workspace.name == c_name))
                    workspace = ws_res.scalar_one_or_none()
                    if not workspace:
                        workspace = Workspace(name=c_name, code=c_code or c_name[:3].upper(), industry=industry)
                        db.add(workspace)
                        await db.flush()
                
                # 2. Subject (Project)
                project = None
                if s_name and s_name != 'nan':
                    proj_res = await db.execute(select(Project).where(
                        (Project.workspace_id == workspace.id) & (Project.name == s_name)
                    ))
                    project = proj_res.scalar_one_or_none()
                    if not project:
                        project = Project(workspace_id=workspace.id, name=s_name)
                        db.add(project)
                        await db.flush()
                        
                # 3. Faculty
                faculty = None
                if f_email and f_email != 'nan':
                    fac_res = await db.execute(select(User).where(User.email == f_email))
                    faculty = fac_res.scalar_one_or_none()
                    if not faculty:
                        pwd = generate_password()
                        faculty = User(username=f_name or f_email.split('@')[0], email=f_email, password=pwd, full_name=f_name, role_id=host_role_id, industry=industry)
                        db.add(faculty)
                        await db.flush()
                        created_users.append({"username": faculty.username, "email": faculty.email, "password": pwd, "role": "Host"})
                        
                    # Map faculty to subject if subject exists
                    if project:
                        enr_res = await db.execute(select(Enrollment).where(
                            (Enrollment.user_id == faculty.id) & (Enrollment.project_id == project.id)
                        ))
                        if not enr_res.scalar_one_or_none():
                            db.add(Enrollment(user_id=faculty.id, workspace_id=workspace.id, project_id=project.id))
                            
                # 4. Student (Enrolled at Workspace Level)
                student = None
                if st_prn and st_prn != 'nan':
                    stu_res = await db.execute(select(User).where(User.username == st_prn))
                    student = stu_res.scalar_one_or_none()
                    if not student:
                        # Password is set to PRN
                        pwd = st_prn
                        email_to_use = st_email if st_email and st_email != 'nan' else f"{st_prn}@student.edu"
                        student = User(username=st_prn, email=email_to_use, password=pwd, full_name=st_name, role_id=user_role_id, industry=industry)
                        db.add(student)
                        await db.flush()
                        created_users.append({"username": student.username, "email": student.email, "password": pwd, "role": "User"})
                        
                    # Map student to workspace ONLY (no project_id!)
                    enr_stu = await db.execute(select(Enrollment).where(
                        (Enrollment.user_id == student.id) & (Enrollment.workspace_id == workspace.id) & (Enrollment.project_id.is_(None))
                    ))
                    if not enr_stu.scalar_one_or_none():
                        db.add(Enrollment(user_id=student.id, workspace_id=workspace.id, project_id=None))
                        
            await db.commit()
            return {"message": "Bulk import processed successfully!", "new_users": created_users}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/directory")
async def get_directory(industry: str = "Education"):
    try:
        async with SessionLocal() as db:
            # Workspaces
            ws_res = await db.execute(text("SELECT id, name, code FROM workspaces WHERE industry = :ind"), {"ind": industry})
            workspaces = ws_res.fetchall()
            
            directory = []
            for ws in workspaces:
                ws_data = {"id": ws.id, "name": ws.name, "code": ws.code, "subjects": [], "students": []}
                
                # Workspace Level Students (not bound to a specific subject, but bound to workspace)
                w_stu_res = await db.execute(text("""
                    SELECT DISTINCT u.id, u.username, u.email FROM enrollments e
                    JOIN users u ON e.user_id = u.id
                    JOIN roles r ON u.role_id = r.id
                    WHERE e.workspace_id = :wid AND e.project_id IS NULL AND r.name = 'User'
                """), {"wid": ws.id})
                ws_data["students"] = [{"id": r.id, "username": r.username, "email": r.email} for r in w_stu_res.fetchall()]
                
                # Subjects
                proj_res = await db.execute(text("SELECT id, name FROM projects WHERE workspace_id = :wid"), {"wid": ws.id})
                projects = proj_res.fetchall()
                
                for prj in projects:
                    prj_data = {"id": prj.id, "name": prj.name, "faculty": [], "students": []}
                    
                    # Users bound to this subject
                    users_res = await db.execute(text("""
                        SELECT u.id, u.username, u.email, r.name as role FROM enrollments e
                        JOIN users u ON e.user_id = u.id
                        JOIN roles r ON u.role_id = r.id
                        WHERE e.project_id = :pid
                    """), {"pid": prj.id})
                    
                    for r in users_res.fetchall():
                        if r.role in ['Host', 'Admin']:
                            prj_data["faculty"].append({"id": r.id, "username": r.username, "email": r.email})
                        elif r.role == 'User':
                            prj_data["students"].append({"id": r.id, "username": r.username, "email": r.email})
                            
                    ws_data["subjects"].append(prj_data)
                    
                directory.append(ws_data)
                
            return directory
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
