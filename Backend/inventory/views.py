from decimal import Decimal
from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import LotteryGame, InventoryBook, ActivatedPack, SoldTicket
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
        pack_id= raw_barcode[4:-4]

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
    serializer_class = ActivatedPackSerializer

    def get_queryset(self):
        return ActivatedPack.objects.select_related('inventory_book__game').order_by('-updated_at')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

# class ActivateInventoryBookView(APIView):
#     def post(self, request):
#         raw_barcode = str(request.data.get('raw_barcode', '')).strip()

#         if not raw_barcode:
#             return Response({'error': 'Barcode is required.'}, status=status.HTTP_400_BAD_REQUEST)

#         if len(raw_barcode) < 5:
#             return Response({'error': 'Invalid barcode.'}, status=status.HTTP_400_BAD_REQUEST)

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
#                 {'error': 'Not found in inventory.'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )

#         if inventory_book.is_activated:
#             return Response(
#                 {'error': 'Already activated.'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )

#         inventory_book.is_activated = True
#         inventory_book.save()

#         serializer = InventoryBookSerializer(inventory_book, context={'request': request})
#         return Response(serializer.data, status=status.HTTP_200_OK)

class ActivateInventoryBookView(APIView):
    def post(self, request):
        raw_barcode = str(request.data.get('raw_barcode', '')).strip()
        reverse_mode = bool(request.data.get('reverse_mode', False))

        if not raw_barcode:
            return Response({'error': 'Barcode is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(raw_barcode) < 5:
            return Response({'error': 'Invalid barcode.'}, status=status.HTTP_400_BAD_REQUEST)

        game_id = raw_barcode[:4]
        pack_id = raw_barcode[4:-4]

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

        activated_pack = ActivatedPack.objects.create(
            inventory_book=inventory_book,
            reverse_mode=reverse_mode,
            current_count=0,
            last_ticket=0
        )

        serializer = ActivatedPackSerializer(activated_pack, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)
    
# class ScanSoldTicketView(APIView):
#     def parse_scanned_ticket(self, barcode: str):
#         barcode = str(barcode).strip()

#         if len(barcode) < 14:
#             raise ValueError("Invalid input")

#         game_id = barcode[:4]
#         remaining = barcode[4:]

#         split_index = remaining.find('0')
#         if split_index == -1:
#             raise ValueError("Invalid input")

#         pack_id = remaining[:split_index]
#         ticket_number = barcode[-4:-1]   # 4th last to 2nd last

#         if not pack_id or len(ticket_number) != 3:
#             raise ValueError("Invalid input")

#         return {
#             "game_id": game_id,
#             "pack_id": pack_id,
#             "ticket_number": int(ticket_number),
#             "ticket_number_str": ticket_number,
#         }

#     def post(self, request):
#         raw_barcode = str(request.data.get('raw_barcode', '')).strip()

#         if not raw_barcode:
#             return Response({'error': 'Invalid input'}, status=status.HTTP_400_BAD_REQUEST)

#         try:
#             parsed = self.parse_scanned_ticket(raw_barcode)
#         except ValueError:
#             return Response({'error': 'Invalid input'}, status=status.HTTP_400_BAD_REQUEST)

#         game_id = parsed['game_id']
#         pack_id = parsed['pack_id']
#         ticket_number = parsed['ticket_number']
#         ticket_number_str = parsed['ticket_number_str']

#         try:
#             activated_pack = ActivatedPack.objects.select_related('inventory_book__game').get(
#                 inventory_book__game__game_id=game_id,
#                 inventory_book__pack_id=pack_id,
#                 inventory_book__is_activated=True
#             )
#         except ActivatedPack.DoesNotExist:
#             return Response(
#                 {'error': 'Pack not activated or not found'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )

#         book = activated_pack.inventory_book

#         if ticket_number >= book.total_tickets:
#             return Response(
#                 {'error': 'Invalid input'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )

#         if SoldTicket.objects.filter(inventory_book=book, ticket_number=ticket_number).exists():
#             return Response(
#                 {'error': 'Ticket already sold'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )

#         SoldTicket.objects.create(
#             inventory_book=book,
#             ticket_number=ticket_number,
#             scanned_code=raw_barcode
#         )

#         activated_pack.current_count = ticket_number
#         activated_pack.last_scanned_ticket = ticket_number_str
#         activated_pack.save()

#         book.remaining_tickets = max(book.remaining_tickets - 1, 0)
#         book.save()

#         return Response({
#             'message': 'Ticket scanned successfully',
#             'game_id': game_id,
#             'pack_id': pack_id,
#             'ticket_number': ticket_number_str,
#             'current_count': activated_pack.current_count,
#             'remaining_tickets': book.remaining_tickets,
#         }, status=status.HTTP_200_OK)

class ScanSoldTicketView(APIView):
    def parse_scanned_ticket(self, barcode: str):
        barcode = str(barcode).strip()

        if len(barcode) < 11:
            raise ValueError("Invalid input")

        game_id = barcode[:4]
        pack_id = barcode[4:-4]
        ticket_number = barcode[-4:-1]

        if not pack_id or len(ticket_number) != 3:
            raise ValueError("Invalid input")

        return {
            "game_id": game_id,
            "pack_id": pack_id,
            "ticket_number": int(ticket_number),
        }

    def post(self, request):
        raw_barcode = str(request.data.get('raw_barcode', '')).strip()

        if not raw_barcode:
            return Response({'error': 'Invalid input'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            parsed = self.parse_scanned_ticket(raw_barcode)
        except ValueError:
            return Response({'error': 'Invalid input'}, status=status.HTTP_400_BAD_REQUEST)

        game_id = parsed['game_id']
        pack_id = parsed['pack_id']
        ticket_number = parsed['ticket_number']

        try:
            activated_pack = ActivatedPack.objects.select_related('inventory_book__game').get(
                inventory_book__game__game_id=game_id,
                inventory_book__pack_id=pack_id,
                inventory_book__is_activated=True
            )
        except ActivatedPack.DoesNotExist:
            return Response(
                {'error': 'Pack not activated or not found'},
                status=status.HTTP_400_BAD_REQUEST
            )

        book = activated_pack.inventory_book

        if ticket_number >= book.total_tickets:
            return Response({'error': 'Invalid input'}, status=status.HTTP_400_BAD_REQUEST)

        # if ticket_number <= activated_pack.current_count:
        #     return Response(
        #         {'error': 'Ticket number must be greater than current'},
        #         status=status.HTTP_400_BAD_REQUEST
        #     )

        if SoldTicket.objects.filter(inventory_book=book, ticket_number=ticket_number).exists():
            return Response(
                {'error': 'Ticket already sold'},
                status=status.HTTP_400_BAD_REQUEST
            )

        SoldTicket.objects.create(
            inventory_book=book,
            ticket_number=ticket_number,
            scanned_code=raw_barcode
        )

        activated_pack.last_ticket = activated_pack.current_count
        activated_pack.current_count = ticket_number
        activated_pack.save()

        return Response({
            'message': 'Ticket scanned successfully',
            'current_count': activated_pack.current_count,
            'last_ticket': activated_pack.last_ticket,
        }, status=status.HTTP_200_OK)