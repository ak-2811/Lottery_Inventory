from django.db import models
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password, check_password, identify_hasher
from decimal import Decimal


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
    activated_at = models.DateTimeField(null=True,blank=True,db_index=True)

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

    coam_payout = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    debit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    credit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    cash_drop = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def total_sales(self):
        return (
            Decimal(str(self.instant_sales or 0))
            + Decimal(str(self.online_sales or 0))
        )


    @property
    def expected_drop(self):
        """
        Amount that should be accounted for after
        deducting Debit and Credit from sales.
        """
        return (
            self.total_sales
            - Decimal(str(self.debit or 0))
            - Decimal(str(self.credit or 0))
        )


    @property
    def actual_drop(self):
        """
        Actual amount accounted for by:
        Cash Drop + COAM Payout.
        """
        return (
            Decimal(str(self.cash_drop or 0))
            + Decimal(str(self.coam_payout or 0))
        )


    @property
    def drop_difference(self):
        """
        Positive = Over
        Negative = Short
        Zero = Matched
        """
        return (
            self.actual_drop
            - self.expected_drop
        )


    @property
    def drop_status(self):
        difference = self.drop_difference

        if difference < 0:
            return 'Short'

        if difference > 0:
            return 'Over'

        return 'Matched'


    @property
    def drop_variance_amount(self):
        """
        Always returns the positive amount of the
        over/short difference.
        """
        return abs(self.drop_difference)

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
    manager_pin_hash = models.CharField(
        max_length=128,
        blank=True,
        default=''
    )

    def save(self, *args, **kwargs):
        """
        Automatically hash the manager PIN if a plain
        8-digit PIN is entered.
        """

        pin = (self.manager_pin_hash or '').strip()

        if pin:
            try:
                # If this succeeds, it's already a Django hash.
                identify_hasher(pin)
            except Exception:
                # Not a hash yet.
                if pin.isdigit() and len(pin) == 8:
                    self.manager_pin_hash = make_password(pin)

        super().save(*args, **kwargs)

    def check_manager_pin(self, pin):
        return check_password(
            str(pin),
            self.manager_pin_hash
        )

    def set_manager_pin(self, raw_pin):
        raw_pin = str(raw_pin or '').strip()

        if not raw_pin.isdigit() or len(raw_pin) != 8:
            raise ValueError(
                'Manager PIN must contain exactly 8 digits.'
            )

        self.manager_pin_hash = make_password(raw_pin)

    def check_manager_pin(self, raw_pin):
        raw_pin = str(raw_pin or '').strip()

        if not self.manager_pin_hash:
            return False

        return check_password(
            raw_pin,
            self.manager_pin_hash
        )

    @property
    def has_manager_pin(self):
        return bool(self.manager_pin_hash)

    def __str__(self):
        return self.name