from decimal import Decimal
from rest_framework import serializers
from .models import LotteryGame, InventoryBook, ActivatedPack


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