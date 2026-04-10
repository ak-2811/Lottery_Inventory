from django.db import models


class LotteryGame(models.Model):
    game_id = models.CharField(max_length=4, unique=True)
    name = models.CharField(max_length=100, null=True, blank=True)
    image = models.ImageField(upload_to='lottery_games/', null=True, blank=True)
    ticket_count = models.PositiveIntegerField()
    ticket_value = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return self.game_id

class InventoryBook(models.Model):
    game = models.ForeignKey(LotteryGame, on_delete=models.CASCADE, related_name='books')
    pack_id = models.CharField(max_length=20)
    raw_barcode = models.CharField(max_length=100, unique=True)
    is_activated = models.BooleanField(default=False)
    is_sold = models.BooleanField(default=False)


    total_tickets = models.PositiveIntegerField()
    # remaining_tickets = models.PositiveIntegerField()
    ticket_value = models.DecimalField(max_digits=10, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('game', 'pack_id')

    def __str__(self):
        return f"{self.game.game_id} - {self.pack_id}"

class ActivatedPack(models.Model):
    inventory_book = models.ForeignKey(
        InventoryBook,
        on_delete=models.CASCADE,
        related_name='activated_packs'
    )
    box_num = models.CharField(max_length=20)
    reverse_mode = models.BooleanField(default=False)
    # current_num = models.PositiveIntegerField(default=0)
    current_count = models.PositiveIntegerField(default=0)
    # last_scanned_ticket = models.CharField(max_length=3, null=True, blank=True)
    last_ticket = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        unique_together = ('box_num',)

    def __str__(self):
        return f"Box {self.box_num} - {self.inventory_book.game.name}"
    
class SoldTicket(models.Model):
    inventory_book = models.ForeignKey(
        InventoryBook,
        on_delete=models.CASCADE,
        related_name='sold_tickets'
    )
    ticket_number = models.PositiveIntegerField()
    delta_count = models.IntegerField(default=0)
    is_reversal = models.BooleanField(default=False)
    scanned_code = models.CharField(max_length=100, unique=True)
    sold_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('inventory_book', 'ticket_number')

    def __str__(self):
        return f"{self.inventory_book.pack_id} - {self.ticket_number}"