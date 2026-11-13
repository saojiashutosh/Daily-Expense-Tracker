from django.urls import include, path
from rest_framework.authtoken.views import obtain_auth_token
from rest_framework.routers import DefaultRouter

from .views import (
    CategoryViewSet,
    ExpenseViewSet,
    LogoutView,
    RecurringExpenseViewSet,
    RegisterView,
)

router = DefaultRouter()
router.register('categories', CategoryViewSet, basename='category')
router.register('expenses', ExpenseViewSet, basename='expense')
router.register('recurring', RecurringExpenseViewSet, basename='recurring')

urlpatterns = [
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/login/', obtain_auth_token, name='login'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('', include(router.urls)),
]
