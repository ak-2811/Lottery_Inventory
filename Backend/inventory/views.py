from decimal import Decimal
from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import LotteryGame, InventoryBook, ActivatedPack, SoldTicket, InventoryBook, ActivatedPack, DailyReport, DailyReportBoxDetail
from .serializers import InventoryBookSerializer, ActivatedPackSerializer, DailyReportSerializer, DailyReportBoxDetailSerializer
from django.utils import timezone
from io import BytesIO
from django.http import FileResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from django.contrib.auth.models import User
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.decorators import permission_classes
from django.contrib.auth import authenticate


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

    return DailyReportBoxDetail.objects.create(
        user=activated_pack.user,
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

    existing = DailyReportBoxDetail.objects.filter(
        user=activated_pack.user,
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
        user=activated_pack.user,
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
        user=activated_pack.user,
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

def roll_active_packs_to_next_day(user):
    active_packs = ActivatedPack.objects.select_related('inventory_book__game').filter(user=user)

    for pack in active_packs:
        pack.today_start = pack.current_count
        pack.tomorrow_start = pack.current_count
        pack.save(update_fields=['today_start', 'tomorrow_start', 'updated_at'])

class SignupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        name = request.data.get('name', '').strip()
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '').strip()

        if not name or not email or not password:
            return Response({'error': 'All fields are required.'}, status=400)

        if User.objects.filter(username=email).exists():
            return Response({'error': 'User already exists.'}, status=400)

        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name=name
        )

        refresh = RefreshToken.for_user(user)

        return Response({
            'message': 'Signup successful',
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id': user.id,
                'name': user.first_name,
                'email': user.email,
            }
        }, status=201)

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '').strip()

        if not email or not password:
            return Response({'error': 'Email and password are required'}, status=400)

        try:
            existing_user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response({'error': 'Invalid email or password'}, status=400)

        user = authenticate(username=existing_user.username, password=password)

        if user is None:
            return Response({'error': 'Invalid email or password'}, status=400)

        refresh = RefreshToken.for_user(user)

        return Response({
            'message': 'Login successful',
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id': user.id,
                'name': user.first_name or user.username,
                'email': user.email,
            }
        }, status=200)

class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            'id': user.id,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email,
            'username': user.username,
        }, status=200)

class InventoryBookListView(generics.ListAPIView):
    queryset = InventoryBook.objects.select_related('game').filter(is_sold=False).order_by('-created_at')
    serializer_class = InventoryBookSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return InventoryBook.objects.select_related('game').filter(
            user=self.request.user,
            is_sold=False
        ).order_by('-created_at')
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class InventoryBookDeleteView(generics.DestroyAPIView):
    serializer_class = InventoryBookSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return InventoryBook.objects.filter(user=self.request.user)


class InventoryBookCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw_barcode = str(request.data.get('raw_barcode', '')).strip()

        if not raw_barcode:
            return Response({'error': 'Barcode is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(raw_barcode) < 5:
            return Response({'error': 'Invalid barcode.'}, status=status.HTTP_400_BAD_REQUEST)

        game_id = raw_barcode[:4]
        pack_id = raw_barcode[4:-4]

        if not pack_id:
            return Response({'error': 'Pack id is missing.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            game = LotteryGame.objects.get(game_id=game_id)
        except LotteryGame.DoesNotExist:
            return Response(
                {'error': f'Game ID {game_id} not found in LotteryGame table.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if InventoryBook.objects.filter(user=request.user, game=game, pack_id=pack_id).exists():
            return Response(
                {'error': f'Pack {pack_id} for game {game_id} already exists.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        inventory_book = InventoryBook.objects.create(
            user=request.user,
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
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ActivatedPack.objects.select_related('inventory_book__game').filter(
            user=self.request.user
        ).order_by('-updated_at')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

class ActivateInventoryBookView(APIView):
    permission_classes = [IsAuthenticated]

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
                user=request.user,
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

        box_num = request.data.get('box_num')

        if box_num is None:
            return Response({'error': 'Box number is required.'}, status=400)

        if ActivatedPack.objects.filter(user=request.user, box_num=box_num).exists():
            return Response({'error': f'Box {box_num} already in use.'}, status=400)

        inventory_book.is_activated = True
        inventory_book.save(update_fields=['is_activated', 'updated_at'])

        activated_pack = ActivatedPack.objects.create(
            user=request.user,
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
    permission_classes = [IsAuthenticated]

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
                user=request.user,
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

        if count > 0:
            delta_count = count
        elif count < 0:
            delta_count = count
        else:
            delta_count = 0

        is_reversal = delta_count < 0

        if delta_count == 0:
            return Response(
                {'error': 'Same ticket scanned again'},
                status=status.HTTP_400_BAD_REQUEST
            )

        SoldTicket.objects.create(
            user=request.user,
            inventory_book=book,
            ticket_number=ticket_number,
            scanned_code=raw_barcode,
            delta_count=delta_count,
            is_reversal=is_reversal
        )

        activated_pack.last_ticket = previous_ticket
        activated_pack.current_count = ticket_number
        activated_pack.save(update_fields=['last_ticket', 'current_count', 'updated_at'])

        create_active_box_detail(activated_pack, report_date=get_business_date())

        pack_sold = False
        if activated_pack.current_count == (book.total_tickets - 1):
            create_sold_box_detail(activated_pack)
            finalize_sold_pack(book, activated_pack)
            pack_sold = True

        return Response({
            'message': 'Ticket scanned successfully',
            'ticket_number': ticket_number,
            'current_count': ticket_number,
            'last_ticket': previous_ticket,
            'delta_count': delta_count,
            'is_reversal': is_reversal,
            'pack_sold': pack_sold,
        }, status=status.HTTP_200_OK)

class MarkInventoryBookSoldView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            inventory_book = InventoryBook.objects.select_related('game').get(
                pk=pk,
                user=request.user
            )
        except InventoryBook.DoesNotExist:
            return Response({'error': 'Inventory book not found.'}, status=status.HTTP_404_NOT_FOUND)

        if inventory_book.is_sold:
            return Response({'error': 'Pack is already sold.'}, status=status.HTTP_400_BAD_REQUEST)

        if not inventory_book.is_activated:
            inventory_book.is_sold = True
            inventory_book.is_activated = False
            inventory_book.is_returned = True
            inventory_book.save(update_fields=['is_sold', 'is_activated', 'is_returned', 'updated_at'])

            return Response({
                'message': 'Pack marked as sold successfully.'
            }, status=status.HTTP_200_OK)

        try:
            activated_pack = ActivatedPack.objects.get(
                inventory_book=inventory_book,
                user=request.user
            )
        except ActivatedPack.DoesNotExist:
            inventory_book.is_sold = True
            inventory_book.is_activated = False
            inventory_book.save(update_fields=['is_sold', 'is_activated', 'updated_at'])

            return Response({
                'message': 'Pack marked as sold successfully.'
            }, status=status.HTTP_200_OK)

        final_ticket_number = inventory_book.total_tickets - 1
        activated_pack.last_ticket = activated_pack.current_count
        activated_pack.current_count = final_ticket_number
        activated_pack.save(update_fields=['last_ticket', 'current_count', 'updated_at'])

        finalize_sold_pack(inventory_book, activated_pack)

        return Response({
            'message': 'Pack marked as sold successfully.',
            'final_ticket_number': final_ticket_number,
        }, status=status.HTTP_200_OK)
    
class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.localtime()
        today = now.date()

        active_boxes = ActivatedPack.objects.filter(user=request.user).count()

        activated_today = ActivatedPack.objects.filter(
            user=request.user,
            created_at__date=today
        ).count()

        activated_this_week = ActivatedPack.objects.filter(
            user=request.user,
            created_at__year=now.year,
            created_at__week=now.isocalendar()[1]
        ).count()

        activated_this_month = ActivatedPack.objects.filter(
            user=request.user,
            created_at__year=now.year,
            created_at__month=now.month
        ).count()

        inactive_packs = InventoryBook.objects.filter(
            user=request.user,
            is_activated=False,
            is_sold=False
        ).count()

        instant_sales_today = Decimal('0.00')

        today_scans = SoldTicket.objects.filter(
            user=request.user,
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
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        target_box = str(request.data.get('target_box', '')).strip()

        if not target_box:
            return Response({'error': 'Target box is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            source_pack = ActivatedPack.objects.get(pk=pk, user=request.user)
        except ActivatedPack.DoesNotExist:
            return Response({'error': 'Activated pack not found.'}, status=status.HTTP_404_NOT_FOUND)

        source_box = str(source_pack.box_num)

        if target_box == source_box:
            return Response({'error': 'Selected box is same as current box.'}, status=status.HTTP_400_BAD_REQUEST)

        target_pack = ActivatedPack.objects.filter(user=request.user, box_num=target_box).first()

        if target_pack:
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
    permission_classes = [IsAuthenticated]

    def get(self, request):
        reports = DailyReport.objects.filter(user=request.user).order_by('-report_date')
        serializer = DailyReportSerializer(reports, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
class DailyReportUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        try:
            report = DailyReport.objects.get(pk=pk, user=request.user)
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
    permission_classes = [IsAuthenticated]

    def post(self, request):
        today = get_business_date()

        existing_report = DailyReport.objects.filter(
            user=request.user,
            report_date=today
        ).first()

        if existing_report:
            serializer = DailyReportSerializer(existing_report)
            return Response({
                'error': 'End shift already completed for today.',
                'report': serializer.data
            }, status=status.HTTP_400_BAD_REQUEST)

        instant_sales_today = Decimal('0.00')

        today_scans = SoldTicket.objects.filter(
            user=request.user,
            sold_at__date=today
        ).select_related('inventory_book__game')

        for row in today_scans:
            instant_sales_today += Decimal(row.delta_count) * row.inventory_book.game.ticket_value

        report = DailyReport.objects.create(
            user=request.user,
            report_date=today,
            instant_sales=instant_sales_today,
            instant_cashes=Decimal('0.00'),
            online_sales=Decimal('0.00'),
            online_cashes=Decimal('0.00'),
            online_cancels=Decimal('0.00'),
        )

        DailyReportBoxDetail.objects.filter(
            user=request.user,
            report_date=today
        ).delete()

        active_packs = ActivatedPack.objects.select_related('inventory_book__game').filter(user=request.user)
        for pack in active_packs:
            create_active_box_detail(pack, report_date=today)

        DailyReportBoxDetail.objects.filter(
            user=request.user,
            report_date=today
        ).update(report=report)

        roll_active_packs_to_next_day(request.user)

        serializer = DailyReportSerializer(report)
        return Response(serializer.data, status=status.HTTP_200_OK)

class TodayEndShiftStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = get_business_date()
        report = DailyReport.objects.filter(
            user=request.user,
            report_date=today
        ).first()

        return Response({
            'date': str(today),
            'is_closed': report is not None,
            'report_id': report.id if report else None,
        }, status=status.HTTP_200_OK)

class TodayReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = get_business_date()
        report = DailyReport.objects.filter(
            user=request.user,
            report_date=today
        ).first()

        if not report:
            return Response({'error': 'Today report not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = DailyReportSerializer(report)
        return Response(serializer.data, status=status.HTTP_200_OK)

class DailyReportBoxDetailListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        details = DailyReportBoxDetail.objects.filter(
            user=request.user,
            report_id=pk
        ).exclude(
            inventory_book__is_returned=True
        ).order_by('box_num', 'id')

        serializer = DailyReportBoxDetailSerializer(details, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

class DailySalesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        reports = DailyReport.objects.filter(user=request.user).order_by('report_date')

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

class DailyReportDownloadPDFView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            report = DailyReport.objects.get(pk=pk, user=request.user)
        except DailyReport.DoesNotExist:
            return Response({'error': 'Report not found.'}, status=status.HTTP_404_NOT_FOUND)

        details = DailyReportBoxDetail.objects.filter(
            user=request.user,
            report=report
        ).exclude(
            inventory_book__is_returned=True
        ).order_by('box_num', 'id')

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=30,
            leftMargin=30,
            topMargin=30,
            bottomMargin=30
        )

        styles = getSampleStyleSheet()
        elements = []

        elements.append(Paragraph("Global Market #3", styles['Title']))
        elements.append(Paragraph(f"Report Date: {report.report_date}", styles['Normal']))
        elements.append(Paragraph(
            f"Generated: {timezone.localtime().strftime('%Y-%m-%d %H:%M %Z')}",
            styles['Normal']
        ))
        elements.append(Spacer(1, 12))

        elements.append(Paragraph("End Shift Report", styles['Heading2']))
        elements.append(Paragraph(f"Online Sales ${report.online_sales}", styles['Normal']))
        elements.append(Paragraph(f"Online Cashes ${report.online_cashes}", styles['Normal']))
        elements.append(Paragraph(f"Online Cancel ${report.online_cancels}", styles['Normal']))
        elements.append(Paragraph(f"Instant Sales ${report.instant_sales}", styles['Normal']))
        elements.append(Paragraph(f"Instant Cashes ${report.instant_cashes}", styles['Normal']))
        elements.append(Paragraph(f"Activated Packs {details.filter(closing_status='Active').count()}", styles['Normal']))
        elements.append(Spacer(1, 12))

        elements.append(Paragraph("Lottery Slot Details", styles['Heading2']))
        elements.append(Spacer(1, 6))

        table_data = [[
            'Slot #',
            'Lottery Name',
            'Start #',
            'Current #',
            'Value',
            'Total',
            'Closing Status'
        ]]

        for row in details:
            table_data.append([
                str(row.box_num),
                f"{row.lottery_name} - {row.pack_num}",
                str(row.start_num),
                str(row.current_num),
                f"${row.ticket_value:.0f}" if float(row.ticket_value).is_integer() else f"${row.ticket_value}",
                f"${row.total_amount:.0f}" if float(row.total_amount).is_integer() else f"${row.total_amount}",
                row.closing_status,
            ])

        table = Table(
            table_data,
            colWidths=[0.6*inch, 2.3*inch, 0.8*inch, 0.9*inch, 0.8*inch, 0.8*inch, 1.1*inch],
            repeatRows=1
        )

        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4A90E2')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('ALIGN', (1, 1), (1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#CCCCCC')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F7F7F7')]),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('TOPPADDING', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
            ('TOPPADDING', (0, 1), (-1, -1), 6),
        ]))

        elements.append(table)

        doc.build(elements)
        buffer.seek(0)

        filename = f"reports_eod_{report.id}_{report.report_date}.pdf"
        return FileResponse(buffer, as_attachment=True, filename=filename)
