from decimal import Decimal
from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import LotteryGame, InventoryBook, ActivatedPack, SoldTicket, InventoryBook, ActivatedPack, DailyReport, DailyReportBoxDetail
from .serializers import InventoryBookSerializer, ActivatedPackSerializer, DailyReportSerializer, DailyReportBoxDetailSerializer
from django.utils import timezone


def finalize_sold_pack(inventory_book, activated_pack):
    inventory_book.is_sold = True
    inventory_book.is_activated = False
    inventory_book.save(update_fields=['is_sold', 'is_activated', 'updated_at'])

    activated_pack.delete()

def get_business_date():
    return timezone.localtime().date()

def calculate_box_total(start_num, current_num, ticket_value, closing_status):
    sold_count = max(current_num - start_num, 0)

    # sold pack includes the final ticket
    if closing_status == 'Sold':
        sold_count += 1

    return Decimal(sold_count) * Decimal(ticket_value)

def create_active_box_detail(activated_pack, report_date=None):
    if report_date is None:
        report_date = get_business_date()

    book = activated_pack.inventory_book

    total_amount = calculate_box_total(
        activated_pack.today_start,
        activated_pack.current_count,
        book.ticket_value,
        'Active'
    )

    # CHECK if already exists → SAME snapshot
    existing = DailyReportBoxDetail.objects.filter(
        report_date=report_date,
        inventory_book=book,
        box_num=activated_pack.box_num,
        start_num=activated_pack.today_start,
        current_num=activated_pack.current_count,
        closing_status='Active'
    ).first()

    if existing:
        return existing

    # UPDATE latest instead of creating duplicate
    latest = DailyReportBoxDetail.objects.filter(
        report_date=report_date,
        inventory_book=book,
        closing_status='Active'
    ).order_by('-id').first()

    if latest:
        latest.box_num = activated_pack.box_num
        latest.start_num = activated_pack.today_start
        latest.current_num = activated_pack.current_count
        latest.total_amount = total_amount
        latest.save()
        return latest

    # CREATE only if nothing exists
    return DailyReportBoxDetail.objects.create(
        report_date=report_date,
        box_num=activated_pack.box_num,
        inventory_book=book,
        lottery_name=book.game.name or book.game.game_id,
        game_num=book.game.game_id,
        pack_num=book.pack_id,
        start_num=activated_pack.today_start,
        current_num=activated_pack.current_count,
        ticket_value=book.ticket_value,
        total_amount=total_amount,
        closing_status='Active'
    )

def create_sold_box_detail(activated_pack, report_date=None):
    if report_date is None:
        report_date = get_business_date()

    book = activated_pack.inventory_book

    total_amount = calculate_box_total(
        activated_pack.today_start,
        activated_pack.current_count,
        book.ticket_value,
        'Sold'
    )

    # prevent duplicate SOLD rows
    existing = DailyReportBoxDetail.objects.filter(
        report_date=report_date,
        inventory_book=book,
        box_num=activated_pack.box_num,
        start_num=activated_pack.today_start,
        current_num=activated_pack.current_count,
        closing_status='Sold'
    ).first()

    if existing:
        return existing

    latest = DailyReportBoxDetail.objects.filter(
        report_date=report_date,
        inventory_book=book,
        closing_status='Active'
    ).order_by('-id').first()

    if latest:
        latest.current_num = activated_pack.current_count
        latest.total_amount = total_amount
        latest.closing_status = 'Sold'
        latest.save()
        return latest

    return DailyReportBoxDetail.objects.create(
        report_date=report_date,
        box_num=activated_pack.box_num,
        inventory_book=book,
        lottery_name=book.game.name or book.game.game_id,
        game_num=book.game.game_id,
        pack_num=book.pack_id,
        start_num=activated_pack.today_start,
        current_num=activated_pack.current_count,
        ticket_value=book.ticket_value,
        total_amount=total_amount,
        closing_status='Sold'
    )

class InventoryBookListView(generics.ListAPIView):
    queryset = InventoryBook.objects.select_related('game').filter(is_sold=False).order_by('-created_at')
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
            last_ticket=0,
            today_start=0,
            tomorrow_start=0
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
        elif (count==0):
            delta_count=0
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

        create_active_box_detail(activated_pack,report_date=get_business_date())

        pack_sold = False
        if activated_pack.current_count == (book.total_tickets - 1):
            create_sold_box_detail(activated_pack)
            finalize_sold_pack(book, activated_pack)
            pack_sold = True

        return Response({
            'message': 'Ticket scanned successfully',
            'ticket_number': ticket_number,
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

        # Case 1: not activated -> directly mark sold
        if not inventory_book.is_activated:
            inventory_book.is_sold = True
            inventory_book.is_activated = False
            inventory_book.is_returned = True
            inventory_book.save(update_fields=['is_sold', 'is_activated', 'is_returned','updated_at'])

            return Response({
                'message': 'Pack marked as sold successfully.'
            }, status=status.HTTP_200_OK)

        # Case 2: activated -> move to last ticket and mark sold
        try:
            activated_pack = ActivatedPack.objects.get(inventory_book=inventory_book)
        except ActivatedPack.DoesNotExist:
            # even if activated flag is true but row is missing, still mark sold
            inventory_book.is_sold = True
            inventory_book.is_activated = False
            inventory_book.save(update_fields=['is_sold', 'is_activated', 'updated_at'])

            return Response({
                'message': 'Pack marked as sold successfully.'
            }, status=status.HTTP_200_OK)

        final_ticket_number = inventory_book.total_tickets - 1
        activated_pack.last_ticket = activated_pack.current_count
        activated_pack.current_count = final_ticket_number
        activated_pack.save()

        finalize_sold_pack(inventory_book, activated_pack)

        return Response({
            'message': 'Pack marked as sold successfully.',
            'final_ticket_number': final_ticket_number,
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
            is_activated=False,
            is_sold=False
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
    
class MoveActivatedPackView(APIView):
    def post(self, request, pk):
        target_box = str(request.data.get('target_box', '')).strip()

        if not target_box:
            return Response({'error': 'Target box is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            source_pack = ActivatedPack.objects.get(pk=pk)
        except ActivatedPack.DoesNotExist:
            return Response({'error': 'Activated pack not found.'}, status=status.HTTP_404_NOT_FOUND)

        source_box = str(source_pack.box_num)

        if target_box == source_box:
            return Response({'error': 'Selected box is same as current box.'}, status=status.HTTP_400_BAD_REQUEST)

        target_pack = ActivatedPack.objects.filter(box_num=target_box).first()

        if target_pack:
            # swap box numbers safely
            temp_box = f"temp-{source_pack.id}"

            source_pack.box_num = temp_box
            source_pack.save(update_fields=['box_num'])

            target_pack.box_num = source_box
            target_pack.save(update_fields=['box_num'])

            source_pack.box_num = target_box
            source_pack.save(update_fields=['box_num'])

            return Response({
                'message': f'Boxes swapped successfully. Box {source_box} ↔ Box {target_box}'
            }, status=status.HTTP_200_OK)

        source_pack.box_num = target_box
        source_pack.save(update_fields=['box_num'])
        create_active_box_detail(source_pack)

        return Response({
            'message': f'Pack moved successfully to Box {target_box}'
        }, status=status.HTTP_200_OK)
    
class DailyReportListView(APIView):
    def get(self, request):
        reports = DailyReport.objects.all().order_by('-report_date')
        serializer = DailyReportSerializer(reports, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
class DailyReportUpdateView(APIView):
    def put(self, request, pk):
        try:
            report = DailyReport.objects.get(pk=pk)
        except DailyReport.DoesNotExist:
            return Response({'error': 'Report not found.'}, status=status.HTTP_404_NOT_FOUND)

        def parse_decimal(value):
            if value in [None, '', 'null']:
                return Decimal('0.00')
            return Decimal(str(value))

        report.instant_cashes = parse_decimal(request.data.get('instantCashes'))
        report.online_sales = parse_decimal(request.data.get('onlineSales'))
        report.online_cashes = parse_decimal(request.data.get('onlineCashes'))
        report.online_cancels = parse_decimal(request.data.get('onlineCancels'))
        report.save()

        serializer = DailyReportSerializer(report)
        return Response(serializer.data, status=status.HTTP_200_OK)

class EndShiftView(APIView):
    def post(self, request):
        today = get_business_date()

        instant_sales_today = Decimal('0.00')

        today_scans = SoldTicket.objects.filter(
            sold_at__date=today
        ).select_related('inventory_book__game')

        for row in today_scans:
            instant_sales_today += Decimal(row.delta_count) * row.inventory_book.game.ticket_value

        report, created = DailyReport.objects.get_or_create(
            report_date=today,
            defaults={
                'instant_sales': instant_sales_today,
                'instant_cashes': Decimal('0.00'),
                'online_sales': Decimal('0.00'),
                'online_cashes': Decimal('0.00'),
                'online_cancels': Decimal('0.00'),
            }
        )

        if not created:
            report.instant_sales = instant_sales_today
            report.save(update_fields=['instant_sales', 'updated_at'])

        # make sure all currently active packs have their final active row snapshot
        active_packs = ActivatedPack.objects.select_related('inventory_book__game').all()
        for pack in active_packs:
            create_active_box_detail(pack, report_date=today)

        # attach today's box rows to this report
        DailyReportBoxDetail.objects.filter(
            report_date=today
        ).update(report=report)

        serializer = DailyReportSerializer(report)
        return Response(serializer.data, status=status.HTTP_200_OK)

class DailyReportBoxDetailListView(APIView):
    def get(self, request, pk):
        details = DailyReportBoxDetail.objects.filter(
                report_id=pk
            ).exclude(
                inventory_book__is_returned=True
            ).order_by('box_num', 'id')
        serializer = DailyReportBoxDetailSerializer(details, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

class DailySalesView(APIView):
    def get(self, request):
        """
        Returns daily sales data with totals for:
        instant_sales, instant_cashes, online_sales, online_cashes, online_cancels
        """
        reports = DailyReport.objects.all().order_by('report_date')
        
        data = []
        for report in reports:
            total = (
                report.instant_sales +
                report.instant_cashes +
                report.online_sales +
                report.online_cashes +
                report.online_cancels
            )
            
            data.append({
                'date': report.report_date.strftime('%b %d'),
                'instant_sales': float(report.instant_sales),
                'instant_cashes': float(report.instant_cashes),
                'online_sales': float(report.online_sales),
                'online_cashes': float(report.online_cashes),
                'online_cancels': float(report.online_cancels),
                'total': float(total),
            })
        
        return Response(data, status=status.HTTP_200_OK)
