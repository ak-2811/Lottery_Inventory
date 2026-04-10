from decimal import Decimal
from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import LotteryGame, InventoryBook, ActivatedPack, SoldTicket, InventoryBook, ActivatedPack
from .serializers import InventoryBookSerializer, ActivatedPackSerializer
from django.utils import timezone


def finalize_sold_pack(inventory_book, activated_pack):
    inventory_book.is_sold = True
    inventory_book.is_activated = False
    inventory_book.save(update_fields=['is_sold', 'is_activated', 'updated_at'])

    activated_pack.delete()

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

class ActivatedInventoryBookListView(generics.ListAPIView):
    serializer_class = ActivatedPackSerializer

    def get_queryset(self):
        return ActivatedPack.objects.select_related('inventory_book__game').order_by('-updated_at')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

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
        box_num = request.data.get('box_num')

        if box_num is None:
            return Response({'error': 'Box number is required.'}, status=400)

        if ActivatedPack.objects.filter(box_num=box_num).exists():
            return Response({'error': f'Box {box_num} already in use.'}, status=400)

        activated_pack = ActivatedPack.objects.create(
            inventory_book=inventory_book,
            box_num=box_num,
            reverse_mode=reverse_mode,
            current_count=0,
            last_ticket=0
        )

        serializer = ActivatedPackSerializer(activated_pack, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

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

        previous_ticket = activated_pack.current_count
        count = ticket_number - previous_ticket
        if (count>0):
            delta_count=count+1
        elif (count<0):
            delta_count=count-1
        is_reversal = delta_count < 0

        if delta_count == 0:
            return Response(
                {'error': 'Same ticket scanned again'},
                status=status.HTTP_400_BAD_REQUEST
            )

        SoldTicket.objects.create(
            inventory_book=book,
            ticket_number=ticket_number,
            scanned_code=raw_barcode,
            delta_count=delta_count,
            is_reversal=is_reversal
        )

        activated_pack.last_ticket = previous_ticket
        activated_pack.current_count = ticket_number
        activated_pack.save()

        pack_sold = False
        if activated_pack.current_count == (book.total_tickets - 1):
            finalize_sold_pack(book, activated_pack)
            pack_sold = True

        return Response({
            'message': 'Ticket scanned successfully',
            'current_count': activated_pack.current_count,
            'last_ticket': activated_pack.last_ticket,
            'delta_count': delta_count,
            'is_reversal': is_reversal,
            'pack_sold': pack_sold,
        }, status=status.HTTP_200_OK)

class MarkInventoryBookSoldView(APIView):
    def post(self, request, pk):
        try:
            inventory_book = InventoryBook.objects.select_related('game').get(pk=pk)
        except InventoryBook.DoesNotExist:
            return Response({'error': 'Inventory book not found.'}, status=status.HTTP_404_NOT_FOUND)

        if inventory_book.is_sold:
            return Response({'error': 'Pack is already sold.'}, status=status.HTTP_400_BAD_REQUEST)

        if not inventory_book.is_activated:
            return Response(
                {'error': 'Please activate the ticket before selling it.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            activated_pack = ActivatedPack.objects.get(inventory_book=inventory_book)
        except ActivatedPack.DoesNotExist:
            return Response(
                {'error': 'Activated pack not found for this inventory book.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        final_ticket_number = inventory_book.total_tickets - 1
        current_ticket = activated_pack.current_count
        delta_count = final_ticket_number - current_ticket

        if delta_count < 0:
            return Response(
                {'error': 'Current ticket count is already beyond sellable limit.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if delta_count > 0:
            system_code = f"MARKSOLD-{inventory_book.id}-{timezone.now().timestamp()}"

            SoldTicket.objects.create(
                inventory_book=inventory_book,
                ticket_number=final_ticket_number,
                scanned_code=system_code,
                delta_count=delta_count,
                is_reversal=False
            )

        activated_pack.last_ticket = current_ticket
        activated_pack.current_count = final_ticket_number
        activated_pack.save()

        finalize_sold_pack(inventory_book, activated_pack)

        return Response({
            'message': 'Pack marked as sold successfully.',
            'final_ticket_number': final_ticket_number,
            'delta_count': delta_count,
        }, status=status.HTTP_200_OK)
    
class DashboardStatsView(APIView):
    def get(self, request):
        now = timezone.localtime()
        today = now.date()

        active_boxes = ActivatedPack.objects.count()

        activated_today = ActivatedPack.objects.filter(
            created_at__date=today
        ).count()

        activated_this_week = ActivatedPack.objects.filter(
            created_at__year=now.year,
            created_at__week=now.isocalendar()[1]
        ).count()

        activated_this_month = ActivatedPack.objects.filter(
            created_at__year=now.year,
            created_at__month=now.month
        ).count()

        inactive_packs = InventoryBook.objects.filter(
            is_activated=False
        ).count()

        instant_sales_today = Decimal('0.00')

        today_scans = SoldTicket.objects.filter(
            sold_at__date=today
        ).select_related('inventory_book__game')

        for row in today_scans:
            instant_sales_today += Decimal(row.delta_count) * row.inventory_book.game.ticket_value

        return Response({
            "instant_sales_today": f"{instant_sales_today:.2f}",
            "active_boxes": active_boxes,
            "activated_today": activated_today,
            "activated_this_week": activated_this_week,
            "activated_this_month": activated_this_month,
            "inactive_packs": inactive_packs,
        })
    
class TicketValuesView(APIView):
    def get(self, request):
        values = (
            LotteryGame.objects
            .values_list('ticket_value', flat=True)
            .distinct()
            .order_by('ticket_value')
        )

        ticket_values = [
            {
                "value": str(v),
                "label": f"${v:.0f}" if float(v).is_integer() else f"${v}"
            }
            for v in values
        ]

        return Response(ticket_values)
    
