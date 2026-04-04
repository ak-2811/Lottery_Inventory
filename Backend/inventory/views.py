from decimal import Decimal
from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import LotteryGame, InventoryBook, ActivatedPack
from .serializers import InventoryBookSerializer, ActivatedPackSerializer


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

# class ActivatedPackListView(generics.ListAPIView):
#     queryset = ActivatedPack.objects.select_related('inventory_book__game').order_by('box_num')
#     serializer_class = ActivatedPackSerializer

#     def get_serializer_context(self):
#         context = super().get_serializer_context()
#         context['request'] = self.request
#         return context


# class ActivatedPackDeleteView(generics.DestroyAPIView):
#     queryset = ActivatedPack.objects.all()
#     serializer_class = ActivatedPackSerializer


# class ActivatePackCreateView(APIView):
#     def post(self, request):
#         raw_barcode = str(request.data.get('raw_barcode', '')).strip()
#         box_num = str(request.data.get('box_num', '')).strip()
#         reverse_mode = bool(request.data.get('reverse_mode', False))

#         if not raw_barcode:
#             return Response({'error': 'Barcode is required.'}, status=status.HTTP_400_BAD_REQUEST)

#         if not box_num:
#             return Response({'error': 'Box number is required.'}, status=status.HTTP_400_BAD_REQUEST)

#         game_id = raw_barcode[:4]
#         remaining = raw_barcode[4:]

#         split_index = remaining.find('000')
#         if split_index == -1:
#             return Response(
#                 {'error': 'Could not determine pack id from barcode.'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )

#         pack_id = remaining[:split_index]

#         if not pack_id:
#             return Response({'error': 'Pack id is missing.'}, status=status.HTTP_400_BAD_REQUEST)

#         try:
#             inventory_book = InventoryBook.objects.select_related('game').get(
#                 game__game_id=game_id,
#                 pack_id=pack_id
#             )
#         except InventoryBook.DoesNotExist:
#             return Response(
#                 {'error': f'Inventory book not found for game {game_id} and pack {pack_id}.'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )

#         if ActivatedPack.objects.filter(box_num=box_num).exists():
#             return Response(
#                 {'error': f'Box {box_num} is already assigned.'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )

#         if ActivatedPack.objects.filter(inventory_book=inventory_book).exists():
#             return Response(
#                 {'error': f'Pack {pack_id} is already activated.'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )

#         activated_pack = ActivatedPack.objects.create(
#             inventory_book=inventory_book,
#             box_num=box_num,
#             reverse_mode=reverse_mode,
#             current_num=0
#         )

#         serializer = ActivatedPackSerializer(activated_pack, context={'request': request})
#         return Response(serializer.data, status=status.HTTP_201_CREATED)
class ActivatedInventoryBookListView(generics.ListAPIView):
    serializer_class = InventoryBookSerializer

    def get_queryset(self):
        return InventoryBook.objects.select_related('game').filter(is_activated=True).order_by('-updated_at')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class ActivateInventoryBookView(APIView):
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
            inventory_book = InventoryBook.objects.select_related('game').get(
                game__game_id=game_id,
                pack_id=pack_id
            )
        except InventoryBook.DoesNotExist:
            return Response(
                {'error': 'Not found in inventory.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if inventory_book.is_activated:
            return Response(
                {'error': 'Already activated.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        inventory_book.is_activated = True
        inventory_book.save()

        serializer = InventoryBookSerializer(inventory_book, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)