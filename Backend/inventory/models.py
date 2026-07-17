from django.db import models
from django.contrib.auth.models import User


class LotteryGame(models.Model):
    game_id = models.CharField(max_length=4, unique=True)
    name = models.CharField(max_length=100, null=True, blank=True)
    image = models.ImageField(upload_to='lottery_games/', null=True, blank=True)
    ticket_count = models.PositiveIntegerField()
    ticket_value = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return self.game_id


class InventoryBook(models.Model):
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name='inventory_books')
    game = models.ForeignKey(LotteryGame, on_delete=models.CASCADE, related_name='books')
    pack_id = models.CharField(max_length=20)
    raw_barcode = models.CharField(max_length=100)
    is_activated = models.BooleanField(default=False)
    is_sold = models.BooleanField(default=False)
    is_returned = models.BooleanField(default=False)

    total_tickets = models.PositiveIntegerField()
    ticket_value = models.DecimalField(max_digits=10, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'game', 'pack_id')

    def __str__(self):
        return f"{self.user.username} - {self.game.game_id} - {self.pack_id}"


class ActivatedPack(models.Model):
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name='activated_packs')
    inventory_book = models.ForeignKey(
        InventoryBook,
        on_delete=models.CASCADE,
        related_name='activated_packs'
    )
    box_num = models.CharField(max_length=20)
    reverse_mode = models.BooleanField(default=False)
    current_count = models.PositiveIntegerField(default=0)
    last_ticket = models.PositiveIntegerField(default=0)
    today_start = models.PositiveIntegerField(default=0)
    tomorrow_start = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'box_num')

    def __str__(self):
        return f"{self.user.username} - Box {self.box_num}"


class SoldTicket(models.Model):
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name='sold_tickets')
    inventory_book = models.ForeignKey(
        InventoryBook,
        on_delete=models.CASCADE,
        related_name='sold_tickets'
    )
    ticket_number = models.PositiveIntegerField()
    delta_count = models.IntegerField(default=0)
    is_reversal = models.BooleanField(default=False)
    scanned_code = models.CharField(max_length=100)
    sold_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-sold_at']

    def __str__(self):
        return f"{self.user.username} - {self.inventory_book.pack_id} - {self.ticket_number}"


class DailyReport(models.Model):
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name='daily_reports')
    report_date = models.DateField()
    instant_sales = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    instant_cashes = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    online_sales = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    online_cashes = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    online_cancels = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-report_date']
        unique_together = ('user', 'report_date')

    def __str__(self):
        return f"{self.user.username} - {self.report_date}"


class DailyReportBoxDetail(models.Model):
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name='daily_report_box_details')
    report = models.ForeignKey(
        'DailyReport',
        on_delete=models.CASCADE,
        related_name='box_details',
        null=True,
        blank=True
    )
    report_date = models.DateField(db_index=True)

    box_num = models.CharField(max_length=20)

    inventory_book = models.ForeignKey(
        InventoryBook,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='daily_report_box_details'
    )

    lottery_name = models.CharField(max_length=200)
    game_num = models.CharField(max_length=20)
    pack_num = models.CharField(max_length=20)

    start_num = models.PositiveIntegerField(default=0)
    current_num = models.PositiveIntegerField(default=0)

    ticket_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    closing_status = models.CharField(max_length=20, default='Active')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['box_num', 'id']

    def __str__(self):
        return f"{self.user.username} - {self.report_date} - Box {self.box_num}"

class JackpotValue(models.Model):
    game_name = models.CharField(max_length=50, unique=True)  # "Mega Millions", "Powerball"
    amount_text = models.CharField(max_length=50)             # "$130 Million"
    amount_number = models.BigIntegerField(null=True, blank=True)  # 130000000
    source_url = models.URLField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.game_name} - {self.amount_text}"
    
class ShiftState(models.Model):
    """
    Stores the currently running shift values for one user/store.
    There is only one active state row per user.
    """

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='shift_state'
    )

    shift_number = models.PositiveIntegerField(default=1)

    instant_sales = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    started_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return (
            f"{self.user.username} - "
            f"Shift {self.shift_number} - "
            f"${self.instant_sales}"
        )


class ShiftReport(models.Model):
    """
    One report is created every time the user ends a shift.
    Multiple reports can exist for the same user and date.
    """

    user = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='shift_reports'
    )

    report_date = models.DateField(db_index=True)
    shift_number = models.PositiveIntegerField()

    shift_started_at = models.DateTimeField(null=True, blank=True)
    shift_ended_at = models.DateTimeField(null=True, blank=True)

    instant_sales = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    instant_cashes = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    online_sales = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    online_cashes = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    online_cancels = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-report_date', '-shift_number', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'report_date', 'shift_number'],
                name='unique_user_date_shift_number'
            )
        ]

    def __str__(self):
        return (
            f"{self.user.username} - "
            f"{self.report_date} - "
            f"Shift {self.shift_number}"
        )


class ShiftReportBoxDetail(models.Model):
    user = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='shift_report_box_details'
    )

    report = models.ForeignKey(
        ShiftReport,
        on_delete=models.CASCADE,
        related_name='box_details'
    )

    report_date = models.DateField(db_index=True)
    shift_number = models.PositiveIntegerField()

    box_num = models.CharField(max_length=20)

    inventory_book = models.ForeignKey(
        InventoryBook,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shift_report_box_details'
    )

    lottery_name = models.CharField(max_length=200)
    game_num = models.CharField(max_length=20)
    pack_num = models.CharField(max_length=20)

    start_num = models.PositiveIntegerField(default=0)
    current_num = models.PositiveIntegerField(default=0)

    ticket_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0
    )

    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    closing_status = models.CharField(
        max_length=20,
        default='Active'
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['box_num', 'id']

    def __str__(self):
        return (
            f"{self.user.username} - "
            f"{self.report_date} - "
            f"Shift {self.shift_number} - "
            f"Box {self.box_num}"
        )



# -----------------------------
# MULTI STORE SUPPORT
# -----------------------------

class StoreOwner(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class Store(models.Model):
    owner = models.ForeignKey(StoreOwner, on_delete=models.CASCADE, related_name="stores")
    user = models.ForeignKey(User, on_delete=models.CASCADE)  # ✅ FIXED
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name