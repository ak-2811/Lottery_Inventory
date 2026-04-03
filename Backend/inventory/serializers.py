from decimal import Decimal
from rest_framework import serializers
from .models import LotteryGame, InventoryBook


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
    subtitle = serializers.SerializerMethodField()

    class Meta:
        model = InventoryBook
        fields = [
            'id',
            'game',
            'name',
            'image',
            'subtitle',
            'pack',
            'value',
            'totalValue',
            'packSize',
            'date',
            'pack_id',
            'raw_barcode',
            'total_tickets',
            'remaining_tickets',
            'ticket_value',
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

    def get_subtitle(self, obj):
        return f"{obj.remaining_tickets} LEFT"