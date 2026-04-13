from decimal import Decimal
from rest_framework import serializers
from .models import LotteryGame, InventoryBook, ActivatedPack, DailyReport, DailyReportBoxDetail


class LotteryGameSerializer(serializers.ModelSerializer):
    class Meta:
        model = LotteryGame
        fields = ['id', 'game_id', 'name', 'image', 'ticket_count', 'ticket_value']


class InventoryBookSerializer(serializers.ModelSerializer):
    game = serializers.CharField(source='game.game_id', read_only=True)
    name = serializers.CharField(source='game.name', read_only=True)
    image = serializers.SerializerMethodField()
    pack = serializers.CharField(source='pack_id', read_only=True)
    value = serializers.SerializerMethodField()
    totalValue = serializers.SerializerMethodField()
    packSize = serializers.IntegerField(source='total_tickets', read_only=True)
    date = serializers.SerializerMethodField()

    class Meta:
        model = InventoryBook
        fields = [
            'id',
            'game',
            'name',
            'image',
            'pack',
            'value',
            'totalValue',
            'packSize',
            'date',
            'pack_id',
            'raw_barcode',
            'total_tickets',
            'ticket_value',
            'is_activated',
            'is_sold',
            'is_returned',
            'created_at',
        ]

    def get_value(self, obj):
        return f"${obj.ticket_value:.2f}"

    def get_totalValue(self, obj):
        total = Decimal(obj.total_tickets) * obj.ticket_value
        return f"${total:.2f}"

    def get_image(self, obj):
        request = self.context.get('request')
        if obj.game.image:
            if request:
                return request.build_absolute_uri(obj.game.image.url)
            return obj.game.image.url
        return None

    def get_date(self, obj):
        return obj.created_at.strftime('%b %d, %Y')


class ActivatedPackSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='inventory_book.game.name', read_only=True)
    gameNum = serializers.CharField(source='inventory_book.game.game_id', read_only=True)
    packNum = serializers.CharField(source='inventory_book.pack_id', read_only=True)
    value = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    boxNum = serializers.CharField(source='box_num', read_only=True)
    reversed = serializers.BooleanField(source='reverse_mode', read_only=True)
    currentNum = serializers.IntegerField(source='current_count', read_only=True)
    lastTicket = serializers.IntegerField(source='last_ticket', read_only=True)
    dateUpdated = serializers.SerializerMethodField()

    class Meta:
        model = ActivatedPack
        fields = [
            'id',
            'boxNum',
            'name',
            'gameNum',
            'packNum',
            'reversed',
            'value',
            'image',
            'currentNum',
            'lastTicket',
            'dateUpdated',
            'created_at',
        ]

    def get_value(self, obj):
        return f"${obj.inventory_book.ticket_value:.2f}"

    def get_image(self, obj):
        request = self.context.get('request')
        image = obj.inventory_book.game.image
        if image:
            if request:
                return request.build_absolute_uri(image.url)
            return image.url
        return None

    def get_dateUpdated(self, obj):
        return obj.updated_at.strftime('%B %d, %Y')


class DailyReportSerializer(serializers.ModelSerializer):
    date = serializers.SerializerMethodField()
    instantSales = serializers.DecimalField(source='instant_sales', max_digits=12, decimal_places=2, read_only=True)
    instantCashes = serializers.DecimalField(source='instant_cashes', max_digits=12, decimal_places=2, read_only=True)
    onlineSales = serializers.DecimalField(source='online_sales', max_digits=12, decimal_places=2, read_only=True)
    onlineCashes = serializers.DecimalField(source='online_cashes', max_digits=12, decimal_places=2, read_only=True)
    onlineCancels = serializers.DecimalField(source='online_cancels', max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = DailyReport
        fields = [
            'id',
            'report_date',
            'date',
            'instantSales',
            'instantCashes',
            'onlineSales',
            'onlineCashes',
            'onlineCancels',
            'created_at',
            'updated_at',
        ]

    def get_date(self, obj):
        return obj.report_date.strftime('%B %d, %Y')


class DailyReportBoxDetailSerializer(serializers.ModelSerializer):
    boxNum = serializers.CharField(source='box_num', read_only=True)
    game = serializers.SerializerMethodField()
    startNum = serializers.IntegerField(source='start_num', read_only=True)
    endNum = serializers.IntegerField(source='current_num', read_only=True)
    value = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()
    status = serializers.CharField(source='closing_status', read_only=True)

    class Meta:
        model = DailyReportBoxDetail
        fields = [
            'id',
            'boxNum',
            'game',
            'startNum',
            'endNum',
            'value',
            'total',
            'status',
        ]

    def get_game(self, obj):
        return f"{obj.lottery_name} - {obj.pack_num}"

    def get_value(self, obj):
        return f"${obj.ticket_value:.2f}"

    def get_total(self, obj):
        return f"${obj.total_amount:.2f}"