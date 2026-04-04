from django.urls import path
from .views import (
    InventoryBookCreateView,
    InventoryBookListView,
    InventoryBookDeleteView,
    ActivatedInventoryBookListView,
    ActivateInventoryBookView,
)

urlpatterns = [
    path('books/', InventoryBookListView.as_view(), name='inventory-book-list'),
    path('books/add/', InventoryBookCreateView.as_view(), name='inventory-book-add'),
    path('books/<int:pk>/', InventoryBookDeleteView.as_view(), name='inventory-book-delete'),
    # path('activated-packs/', ActivatedPackListView.as_view(), name='activated-pack-list'),
    # path('activated-packs/add/', ActivatePackCreateView.as_view(), name='activated-pack-add'),
    # path('activated-packs/<int:pk>/', ActivatedPackDeleteView.as_view(), name='activated-pack-delete'),
    path('activated-books/', ActivatedInventoryBookListView.as_view(), name='activated-book-list'),
    path('activated-books/activate/', ActivateInventoryBookView.as_view(), name='activated-book-activate'),

]