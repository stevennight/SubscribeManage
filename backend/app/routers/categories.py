"""Categories API routes."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.auth import get_current_user
from app.database import get_db
from app.models import Category, Subscription
from app.schemas import CategoryCreate, CategoryUpdate, CategoryResponse

router = APIRouter(prefix="/api/categories", tags=["Categories"])


@router.get("", response_model=list[CategoryResponse])
def list_categories(
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all categories with subscription count."""
    categories = db.query(Category).order_by(Category.sort_order, Category.name).all()
    result = []
    for cat in categories:
        count = db.query(func.count(Subscription.id)).filter(
            Subscription.category_id == cat.id
        ).scalar()
        resp = CategoryResponse.model_validate(cat)
        resp.subscription_count = count
        result.append(resp)
    return result


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    request: CategoryCreate,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new category."""
    existing = db.query(Category).filter(Category.name == request.name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分类名称已存在")

    category = Category(**request.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)

    resp = CategoryResponse.model_validate(category)
    resp.subscription_count = 0
    return resp


@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    request: CategoryUpdate,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a category."""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分类不存在")

    update_data = request.model_dump(exclude_unset=True)
    if "name" in update_data:
        dup = db.query(Category).filter(
            Category.name == update_data["name"],
            Category.id != category_id,
        ).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分类名称已存在")

    for key, value in update_data.items():
        setattr(category, key, value)

    db.commit()
    db.refresh(category)

    count = db.query(func.count(Subscription.id)).filter(
        Subscription.category_id == category.id
    ).scalar()
    resp = CategoryResponse.model_validate(category)
    resp.subscription_count = count
    return resp


@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a category (only if no subscriptions use it)."""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分类不存在")

    count = db.query(func.count(Subscription.id)).filter(
        Subscription.category_id == category.id
    ).scalar()
    if count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"该分类下还有 {count} 个订阅，无法删除",
        )

    db.delete(category)
    db.commit()
    return {"message": "分类已删除"}
