from decimal import Decimal
from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import LotteryGame, InventoryBook
from .serializers import InventoryBookSerializer


class InventoryBookListView(generics.ListAPIView):
    queryset = InventoryBook.objects.select_related('game').order_by('-created_at')
    serializer_class = InventoryBookSerializer
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class InventoryBookDeleteView(generics.DestroyAPIView):
    queryset = InventoryBook.objects.all()
    serializer_class = InventoryBookSerializer


class InventoryBookCreateView(APIView):
    def post(self, request):
        raw_barcode = str(request.data.get('raw_barcode', '')).strip()

        if not raw_barcode:
            return Response({'error': 'Barcode is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(raw_barcode) < 5:
            return Response({'error': 'Invalid barcode.'}, status=status.HTTP_400_BAD_REQUEST)

        game_id = raw_barcode[:4]
        remaining = raw_barcode[4:]

        split_index = remaining.find('000')
        if split_index == -1:
            return Response(
                {'error': 'Could not determine pack id from barcode.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        pack_id = remaining[:split_index]

        if not pack_id:
            return Response({'error': 'Pack id is missing.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            game = LotteryGame.objects.get(game_id=game_id)
        except LotteryGame.DoesNotExist:
            return Response(
                {'error': f'Game ID {game_id} not found in LotteryGame table.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if InventoryBook.objects.filter(game=game, pack_id=pack_id).exists():
            return Response(
                {'error': f'Pack {pack_id} for game {game_id} already exists.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        inventory_book = InventoryBook.objects.create(
            game=game,
            pack_id=pack_id,
            raw_barcode=raw_barcode,
            total_tickets=game.ticket_count,
            remaining_tickets=game.ticket_count,
            ticket_value=game.ticket_value,
        )

        serializer = InventoryBookSerializer(inventory_book, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)