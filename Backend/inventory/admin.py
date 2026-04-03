from django.contrib import admin
from .models import LotteryGame, InventoryBook


@admin.register(LotteryGame)
class LotteryGameAdmin(admin.ModelAdmin):
    list_display = ('id', 'game_id', 'ticket_count', 'ticket_value')
    search_fields = ('game_id',)


@admin.register(InventoryBook)
class InventoryBookAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'game',
        'pack_id',
        'total_tickets',
        'remaining_tickets',
        'ticket_value',
        'created_at',
    )
    search_fields = ('pack_id', 'raw_barcode', 'game__game_id')