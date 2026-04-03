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

    total_tickets = models.PositiveIntegerField()
    remaining_tickets = models.PositiveIntegerField()
    ticket_value = models.DecimalField(max_digits=10, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('game', 'pack_id')

    def __str__(self):
        return f"{self.game.game_id} - {self.pack_id}"