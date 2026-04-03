from django.urls import path
from .views import (
    InventoryBookCreateView,
    InventoryBookListView,
    InventoryBookDeleteView,
)

urlpatterns = [
    path('books/', InventoryBookListView.as_view(), name='inventory-book-list'),
    path('books/add/', InventoryBookCreateView.as_view(), name='inventory-book-add'),
    path('books/<int:pk>/', InventoryBookDeleteView.as_view(), name='inventory-book-delete'),
]