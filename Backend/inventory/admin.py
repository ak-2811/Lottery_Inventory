from django.contrib import admin
from .models import LotteryGame, InventoryBook, ActivatedPack, SoldTicket, DailyReport


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
        # 'remaining_tickets',
        'ticket_value',
        'created_at',
    )
    search_fields = ('pack_id', 'raw_barcode', 'game__game_id')

@admin.register(ActivatedPack)
class ActivatedPackAdmin(admin.ModelAdmin):
    list_display = ('inventory_book', 'box_num', 'current_count', 'last_ticket', 'created_at')
    search_fields = ('box_num',)

@admin.register(SoldTicket)
class SoldTicketAdmin(admin.ModelAdmin):
    list_display = ('inventory_book', 'ticket_number', 'sold_at',)
    search_fields = ('ticket_number',)

@admin.register(DailyReport)
class DailyReportAdmin(admin.ModelAdmin):
    list_display = ('report_date', 'instant_sales',)
    search_fields = ('report_date',)