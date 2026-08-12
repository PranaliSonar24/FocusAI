import pandas as pd
import PyPDF2
import io
import re
import random
import string
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from database.connection import get_db
from models.relational import User, Role

router = APIRouter()

def generate_password(length=8):
    characters = string.ascii_letters + string.digits
    return "".join(random.choice(characters) for i in range(length))

def extract_from_excel(contents):
    # Read all sheets without assuming row 0 is the header
    sheets_dict = pd.read_excel(io.BytesIO(contents), header=None, sheet_name=None)
    
    target_df = None
    header_idx = -1
    
    # Scan all sheets to find the one containing our data
    for sheet_name, df in sheets_dict.items():
        for idx, row in df.iterrows():
            row_values = [str(x).strip().lower() for x in row.values]
            if 'email' in row_values:
                header_idx = idx
                target_df = df
                break
        if target_df is not None:
            break
            
    if target_df is None or header_idx == -1:
        raise ValueError("Excel file must contain an 'email' column on at least one sheet.")
        
    df = target_df
    
    # Promote that row to header and strip whitespace
    df.columns = [str(c).strip().lower() for c in df.iloc[header_idx]]
    # Keep only the rows below the header
    df = df.iloc[header_idx + 1:]
    
    users = []
    for _, row in df.iterrows():
        email = None
        name = None
        for col in df.columns:
            if col == 'email':
                email = str(row[col]).strip()
            elif col in ['name', 'username', 'user', 'first name', 'student name']:
                name = str(row[col]).strip()
        
        if email and email != 'nan':
            if not name or name == 'nan':
                name = email.split('@')[0]
            users.append({"username": name, "email": email})
    return users

def extract_from_pdf(contents):
    pdf_reader = PyPDF2.PdfReader(io.BytesIO(contents))
    text_content = ""
    for page in pdf_reader.pages:
        text_content += page.extract_text() + "\n"
    
    email_pattern = r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+'
    emails = re.findall(email_pattern, text_content)
    
    seen = set()
    unique_emails = [x for x in emails if not (x in seen or seen.add(x))]
    
    users = []
    for email in unique_emails:
        username = email.split('@')[0]
        users.append({"username": username, "email": email})
    return users

@router.post("/bulk-upload")
async def bulk_upload_users(
    role_name: str = Form(...),
    industry: str = Form("Education"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    contents = await file.read()
    filename = file.filename.lower()
    
    try:
        if filename.endswith(".xlsx") or filename.endswith(".xls"):
            user_data = extract_from_excel(contents)
        elif filename.endswith(".pdf"):
            user_data = extract_from_pdf(contents)
        elif filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
            users = []
            for _, row in df.iterrows():
                email = row.get('email') or row.get('Email')
                name = row.get('name') or row.get('Name') or row.get('username') or row.get('Username')
                if email and not pd.isna(email):
                    if not name or pd.isna(name):
                        name = str(email).split('@')[0]
                    users.append({"username": str(name), "email": str(email)})
            user_data = users
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Please upload .xlsx, .csv, or .pdf")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file: {str(e)}")

    if not user_data:
        raise HTTPException(status_code=400, detail="No users found in the file.")

    result = await db.execute(select(Role).where(Role.name == role_name))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=400, detail=f"Role '{role_name}' not found.")

    created_users = []
    skipped = 0
    
    for u in user_data:
        res = await db.execute(select(User).where(User.email == u["email"]))
        if res.scalar_one_or_none():
            skipped += 1
            continue
            
        plain_password = generate_password()
        
        new_user = User(
            username=u["username"],
            email=u["email"],
            password=plain_password,
            role_id=role.id,
            industry=industry
        )
        db.add(new_user)
        created_users.append({
            "username": u["username"],
            "email": u["email"],
            "password": plain_password,
            "role": role_name
        })

    await db.commit()
    
    return {
        "message": f"Successfully created {len(created_users)} users. ({skipped} users were skipped because they already exist in the system).",
        "users": created_users,
        "skipped": skipped
    }

@router.get("/list")
async def list_users(industry: str = "Education", db: AsyncSession = Depends(get_db)):
    # Fetch users and their roles
    query = select(User, Role.name).join(Role, User.role_id == Role.id).where(User.industry == industry)
    result = await db.execute(query)
    users = []
    for user, role_name in result.all():
        users.append({
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name or user.username,
            "email": user.email,
            "password": user.password,
            "role": role_name
        })
    return {"users": users}

@router.delete("/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    from sqlalchemy import text
    await db.execute(text("DELETE FROM enrollments WHERE user_id = :uid"), {"uid": user_id})
    await db.delete(user)
    await db.commit()
    return {"message": "User deleted successfully"}
