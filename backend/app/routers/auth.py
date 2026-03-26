"""Auth API routes."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import verify_password, create_access_token, get_current_user, hash_password
from app.database import get_db
from app.models import SystemConfig
from app.schemas import LoginRequest, TokenResponse, UserInfo, PasswordChange, UsernameChange

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return JWT token."""
    username_config = db.query(SystemConfig).filter(SystemConfig.key == "username").first()
    password_config = db.query(SystemConfig).filter(SystemConfig.key == "password_hash").first()

    if not username_config or not password_config:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="系统未初始化")

    if request.username != username_config.value or not verify_password(request.password, password_config.value):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")

    token = create_access_token(data={"sub": request.username})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserInfo)
def get_me(username: str = Depends(get_current_user)):
    """Get current user info."""
    return UserInfo(username=username)


@router.put("/password")
def change_password(
    request: PasswordChange,
    username: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the login password."""
    password_config = db.query(SystemConfig).filter(SystemConfig.key == "password_hash").first()
    if not password_config or not verify_password(request.old_password, password_config.value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="原密码错误")

    password_config.value = hash_password(request.new_password)
    db.commit()
    return {"message": "密码修改成功"}


@router.put("/username")
def change_username(
    request: UsernameChange,
    username: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the login username."""
    password_config = db.query(SystemConfig).filter(SystemConfig.key == "password_hash").first()
    if not password_config or not verify_password(request.password, password_config.value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="密码验证失败")

    if not request.new_username.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户名不能为空")

    username_config = db.query(SystemConfig).filter(SystemConfig.key == "username").first()
    if username_config:
        username_config.value = request.new_username.strip()
    db.commit()
    return {"message": "用户名修改成功"}
