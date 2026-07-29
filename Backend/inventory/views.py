from decimal import Decimal
from datetime import timedelta
import secrets
from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import LotteryGame, InventoryBook, ActivatedPack, SoldTicket, InventoryBook, ActivatedPack, DailyReport, DailyReportBoxDetail, ShiftState, ShiftReport, ShiftReportBoxDetail
from .serializers import InventoryBookSerializer, ActivatedPackSerializer, DailyReportSerializer, DailyReportBoxDetailSerializer, ShiftReportDetailSerializer
from django.utils import timezone
from django.utils.dateparse import parse_date
from io import BytesIO
from django.http import FileResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from django.contrib.auth.models import User
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.decorators import permission_classes
from django.contrib.auth import authenticate
from django.conf import settings
from django.core.mail import EmailMessage
from django.core.cache import cache
from django.db.models import IntegerField, Sum, Max, F, Count
from django.db.models.functions import Cast
from django.http import JsonResponse
from .models import JackpotValue, StoreOwner, Store
import threading
import time
from django.db import transaction
from zoneinfo import ZoneInfo
import resend
import base64


LIVE_DISPLAY_EVENT_TYPES = {
    'blink_price',
    'lucky_tickets',
    'new_tickets',
    'ending_tickets',
    'reload_live_display',
}


def get_live_display_cache_key(user_id):
    return f"live_display_events:{user_id}"


def finalize_sold_pack(inventory_book, activated_pack):
    inventory_book.is_sold = True
    inventory_book.is_activated = False
    inventory_book.save(update_fields=['is_sold', 'is_activated', 'updated_at'])

    activated_pack.delete()

def jackpot_values(request):
    data = list(
        JackpotValue.objects.values(
            "game_name", "amount_text", "amount_number", "updated_at"
        )
    )
    return JsonResponse({"jackpots": data})

def get_or_create_shift_state(user):
    """
    Returns the user's active shift state.

    The visible shift number is calculated from ShiftReport records
    belonging to the current date.
    """

    today = get_business_date()

    shift_state, created = ShiftState.objects.get_or_create(
        user=user,
        defaults={
            'shift_number': 1,
            'instant_sales': Decimal('0.00'),
        }
    )

    latest_shift_number = ShiftReport.objects.filter(
        user=user,
        report_date=today
    ).aggregate(
        highest_shift=Max('shift_number')
    )['highest_shift'] or 0

    expected_shift_number = latest_shift_number + 1

    if shift_state.shift_number != expected_shift_number:
        shift_state.shift_number = expected_shift_number
        shift_state.save(
            update_fields=[
                'shift_number',
                'updated_at'
            ]
        )

    return shift_state


def add_to_shift_sales(user, delta_count, ticket_value):
    """
    Adds or subtracts sales from the current shift.

    Positive delta_count = sale
    Negative delta_count = reversal
    """

    delta_amount = (
        Decimal(str(delta_count)) *
        Decimal(str(ticket_value))
    )

    shift_state = get_or_create_shift_state(user)

    ShiftState.objects.filter(pk=shift_state.pk).update(
        instant_sales=F('instant_sales') + delta_amount
    )

    shift_state.refresh_from_db()

    # Prevent accidental negative display because of a bad reversal.
    if shift_state.instant_sales < Decimal('0.00'):
        shift_state.instant_sales = Decimal('0.00')
        shift_state.save(
            update_fields=['instant_sales', 'updated_at']
        )

    return shift_state


def reset_shift_state(user):
    """
    Resets the displayed shift sales after a shift is completed.
    The next shift number is also prepared here.
    """

    shift_state = get_or_create_shift_state(user)

    shift_state.instant_sales = Decimal('0.00')
    shift_state.shift_number += 1
    shift_state.started_at = timezone.now()

    shift_state.save(
        update_fields=[
            'instant_sales',
            'shift_number',
            'started_at',
            'updated_at',
        ]
    )

    return shift_state

def create_report_snapshot(user, extra_data, report_date=None):
    today = report_date or get_business_date()

    existing_report = DailyReport.objects.filter(
        user=user,
        report_date=today
    ).first()

    if existing_report:
        return existing_report, False

    instant_sales_today = get_instant_sales_for_date(user, today)

    def parse_decimal(value):
        if value in [None, '', 'null']:
            return Decimal('0.00')
        return Decimal(str(value))

    report = DailyReport.objects.create(
        user=user,
        report_date=today,
        instant_sales=instant_sales_today,
        instant_cashes=parse_decimal(extra_data.get('instantCashes')),
        online_sales=parse_decimal(extra_data.get('onlineSales')),
        online_cashes=parse_decimal(extra_data.get('onlineCashes')),
        online_cancels=parse_decimal(extra_data.get('onlineCancels')),
    )

    # clone sold rows tracked during the day
    sold_rows = DailyReportBoxDetail.objects.filter(
        user=user,
        report_date=today,
        report__isnull=True,
        # closing_status='Sold'
        closing_status__in=['Sold', 'Returned']
    ).order_by('box_num', 'id')

    for row in sold_rows:
        DailyReportBoxDetail.objects.create(
            user=user,
            report=report,
            report_date=today,
            box_num=row.box_num,
            inventory_book=row.inventory_book,
            lottery_name=row.lottery_name,
            game_num=row.game_num,
            pack_num=row.pack_num,
            start_num=row.start_num,
            current_num=row.current_num,
            ticket_value=row.ticket_value,
            total_amount=row.total_amount,
            closing_status=row.closing_status
        )

    # snapshot current active packs
    active_packs = ActivatedPack.objects.select_related('inventory_book__game').filter(user=user)

    for pack in active_packs:
        book = pack.inventory_book
        total_amount = calculate_box_total(
            pack.today_start,
            pack.current_count,
            book.ticket_value,
            'Active'
        )

        DailyReportBoxDetail.objects.create(
            user=user,
            report=report,
            report_date=today,
            box_num=pack.box_num,
            inventory_book=book,
            lottery_name=book.game.name or book.game.game_id,
            game_num=book.game.game_id,
            pack_num=book.pack_id,
            start_num=pack.today_start,
            current_num=pack.current_count,
            ticket_value=book.ticket_value,
            total_amount=total_amount,
            closing_status='Active'
        )

    roll_active_packs_to_next_day(user)

    return report, True

def auto_save_yesterday_report_if_missing(user):
    yesterday = get_business_date() - timedelta(days=1)

    existing_report = DailyReport.objects.filter(
        user=user,
        report_date=yesterday
    ).first()

    if existing_report:
        return existing_report, False

    report, created = create_report_snapshot(
        user=user,
        extra_data={
            'instantCashes': '0.00',
            'onlineSales': '0.00',
            'onlineCashes': '0.00',
            'onlineCancels': '0.00',
        },
        report_date=yesterday
    )

    if created:
        threading.Thread(
            target=send_report_email,
            args=(report, user),
            daemon=True
        ).start()

    return report, created

def build_end_shift_preview(user):
    today = get_business_date()
    shift_state = get_or_create_shift_state(user)

    cumulative_totals = get_shift_cumulative_totals(
        user=user,
        report_date=today
    )

    next_shift_number = (
        cumulative_totals[
            'last_shift_number'
        ] + 1
    )

    preview_rows = []

    # Temporary Sold rows not yet consumed.
    sold_rows = list(
        DailyReportBoxDetail.objects.filter(
            user=user,
            report_date=today,
            report__isnull=True,
            closing_status__iexact='Sold',
        )
    )

    # Temporary Returned rows not yet consumed.
    returned_rows = list(
        DailyReportBoxDetail.objects.filter(
            user=user,
            report_date=today,
            report__isnull=True,
            closing_status__iexact='Returned',
        )
    )

    for row in sold_rows + returned_rows:
        preview_rows.append({
            'id': f"closed-{row.id}",
            'boxNum': str(row.box_num),
            'game': (
                f"{row.lottery_name} "
                f"- {row.pack_num}"
            ),
            'startNum': row.start_num,
            'endNum': row.current_num,
            'value': (
                f"${row.ticket_value:.0f}"
                if float(
                    row.ticket_value
                ).is_integer()
                else f"${row.ticket_value}"
            ),
            'total': (
                f"${row.total_amount:.2f}"
            ),
            'status': row.closing_status,
        })

    active_packs = (
        ActivatedPack.objects
        .select_related(
            'inventory_book__game'
        )
        .filter(user=user)
    )

    for pack in active_packs:
        book = pack.inventory_book

        total_amount = calculate_box_total(
            pack.today_start,
            pack.current_count,
            book.ticket_value,
            'Active'
        )

        preview_rows.append({
            'id': f"active-{pack.id}",
            'boxNum': str(pack.box_num),
            'game': (
                f"{book.game.name or book.game.game_id} "
                f"- {book.pack_id}"
            ),
            'startNum': pack.today_start,
            'endNum': pack.current_count,
            'value': (
                f"${book.ticket_value:.0f}"
                if float(
                    book.ticket_value
                ).is_integer()
                else f"${book.ticket_value}"
            ),
            'total': (
                f"${total_amount:.2f}"
            ),
            'status': 'Active',
        })

    preview_rows.sort(
        key=lambda row: (
            get_numeric_box_sort_value(
                row.get('boxNum')
            ),
            str(row.get('id', ''))
        )
    )

    return {
        'id': None,
        'report_date': str(today),
        'shiftNumber': next_shift_number,
        'shiftStartedAt': (
            shift_state.started_at
        ),
        'instantSales': (
            f"{shift_state.instant_sales:.2f}"
        ),
        'instantCashes': '0.00',
        'onlineSales': '0.00',
        'onlineCashes': '0.00',
        'onlineCancels': '0.00',
        'boxDetails': preview_rows,
    }

MANAGER_ACCESS_TIMEOUT_SECONDS = 10 * 60


def get_user_store(user):
    """
    Returns the store associated with the logged-in store user.
    """

    return (
        Store.objects
        .filter(user=user)
        .select_related('owner')
        .first()
    )


def create_manager_access_token(user, store, scope):
    """
    Generates a short-lived random authorization token.

    Scope values:
    - reports
    - activation
    """

    token = secrets.token_urlsafe(32)

    cache.set(
        f'manager_access:{token}',
        {
            'user_id': user.id,
            'store_id': store.id,
            'scope': scope,
        },
        timeout=MANAGER_ACCESS_TIMEOUT_SECONDS
    )

    return token

def get_reports_target_user(request):
    """
    Determines whose reports are being accessed.

    Normal store user:
        target user = request.user
        managerial PIN is required

    Store owner opening reports using ?store_id=<id>:
        target user = selected store.user
        managerial PIN is bypassed
    """

    store_id = str(
        request.query_params.get('store_id', '')
    ).strip()

    if not store_id:
        return request.user, False, None

    try:
        owner = StoreOwner.objects.get(
            user=request.user
        )
    except StoreOwner.DoesNotExist:
        return (
            None,
            False,
            Response(
                {
                    'error': (
                        'You are not authorized to access '
                        'another store’s reports.'
                    )
                },
                status=status.HTTP_403_FORBIDDEN
            )
        )

    try:
        store = Store.objects.select_related(
            'user'
        ).get(
            id=store_id,
            owner=owner
        )
    except Store.DoesNotExist:
        return (
            None,
            False,
            Response(
                {
                    'error': (
                        'Store not found or it does not '
                        'belong to this owner.'
                    )
                },
                status=status.HTTP_404_NOT_FOUND
            )
        )

    return store.user, True, None


def validate_manager_access_token(request, required_scope):
    """
    Validates the token sent through X-Manager-Access-Token.
    """

    token = str(
        request.headers.get(
            'X-Manager-Access-Token',
            ''
        )
    ).strip()

    if not token:
        return False, 'Manager authorization is required.'

    access_data = cache.get(
        f'manager_access:{token}'
    )

    if not access_data:
        return False, (
            'Manager authorization has expired. '
            'Please enter the PIN again.'
        )

    if access_data.get('user_id') != request.user.id:
        return False, 'Invalid manager authorization.'

    if access_data.get('scope') != required_scope:
        return False, (
            'This authorization cannot be used '
            'for the requested section.'
        )

    store = get_user_store(request.user)

    if not store:
        return False, (
            'No store is associated with this account.'
        )

    if access_data.get('store_id') != store.id:
        return False, 'Invalid store authorization.'

    return True, None

class ShiftReportValidationError(Exception):
    def __init__(self, message, field_errors=None):
        super().__init__(message)
        self.message = message
        self.field_errors = field_errors or {}


def parse_required_report_decimal(value, field_label):
    """
    Parses a required cumulative shift value.

    All four manually entered values are required and cannot be negative.
    """

    if value in [None, '', 'null']:
        raise ShiftReportValidationError(
            f'{field_label} is required.'
        )

    try:
        parsed_value = Decimal(str(value)).quantize(
            Decimal('0.01')
        )
    except Exception:
        raise ShiftReportValidationError(
            f'{field_label} must be a valid number.'
        )

    if parsed_value < Decimal('0.00'):
        raise ShiftReportValidationError(
            f'{field_label} cannot be negative.'
        )

    return parsed_value

def get_shift_cumulative_totals(user, report_date):
    """
    Since ShiftReport stores differences, summing today's shift reports
    gives the cumulative value entered at the end of the latest shift.
    """

    totals = ShiftReport.objects.filter(
        user=user,
        report_date=report_date
    ).aggregate(
        instant_cashes_total=Sum('instant_cashes'),
        online_sales_total=Sum('online_sales'),
        online_cashes_total=Sum('online_cashes'),
        online_cancels_total=Sum('online_cancels'),
        highest_shift_number=Max('shift_number'),
    )

    return {
        'instant_cashes': (
            totals['instant_cashes_total']
            or Decimal('0.00')
        ),
        'online_sales': (
            totals['online_sales_total']
            or Decimal('0.00')
        ),
        'online_cashes': (
            totals['online_cashes_total']
            or Decimal('0.00')
        ),
        'online_cancels': (
            totals['online_cancels_total']
            or Decimal('0.00')
        ),
        'last_shift_number': (
            totals['highest_shift_number']
            or 0
        ),
    }

def calculate_shift_differences(user, report_date, extra_data):
    """
    The frontend sends cumulative daily values.

    This function:
    1. Gets cumulative totals from previous shifts today.
    2. Validates that entered values did not decrease.
    3. Returns only the difference belonging to the current shift.
    """

    previous_totals = get_shift_cumulative_totals(
        user=user,
        report_date=report_date
    )

    entered_values = {
        'instant_cashes': parse_required_report_decimal(
            extra_data.get('instantCashes'),
            'Instant Cashes'
        ),
        'online_sales': parse_required_report_decimal(
            extra_data.get('onlineSales'),
            'Online Sales'
        ),
        'online_cashes': parse_required_report_decimal(
            extra_data.get('onlineCashes'),
            'Online Cashes'
        ),
        'online_cancels': parse_required_report_decimal(
            extra_data.get('onlineCancels'),
            'Online Cancels'
        ),
    }

    labels = {
        'instant_cashes': 'Instant Cashes',
        'online_sales': 'Online Sales',
        'online_cashes': 'Online Cashes',
        'online_cancels': 'Online Cancels',
    }

    errors = {}

    for field_name, entered_value in entered_values.items():
        previous_value = previous_totals[field_name]

        if entered_value < previous_value:
            errors[field_name] = (
                f"{labels[field_name]} must be at least "
                f"${previous_value:.2f}. "
                f"You entered ${entered_value:.2f}."
            )

    if errors:
        first_error = next(iter(errors.values()))

        raise ShiftReportValidationError(
            message=first_error,
            field_errors=errors
        )

    differences = {
        field_name: entered_values[field_name] - previous_totals[field_name]
        for field_name in entered_values
    }

    return {
        'entered': entered_values,
        'previous': previous_totals,
        'differences': differences,
        'shift_number': previous_totals['last_shift_number'] + 1,
    }

def create_shift_report_snapshot(user, extra_data):
    """
    Creates one permanent ShiftReport for the current shift.

    Temporary Sold and Returned DailyReportBoxDetail rows are:
    1. Copied into ShiftReportBoxDetail.
    2. Deleted after the copy succeeds.

    This prevents Shift 1 closed packs from appearing again
    in Shift 2.
    """

    today = get_business_date()

    with transaction.atomic():
        shift_state = (
            ShiftState.objects
            .select_for_update()
            .filter(user=user)
            .first()
        )

        if not shift_state:
            shift_state = ShiftState.objects.create(
                user=user,
                shift_number=1,
                instant_sales=Decimal('0.00'),
                started_at=timezone.now(),
            )

        shift_started_at = shift_state.started_at
        shift_ended_at = timezone.now()

        calculated_values = calculate_shift_differences(
            user=user,
            report_date=today,
            extra_data=extra_data
        )

        shift_number = calculated_values[
            'shift_number'
        ]

        differences = calculated_values[
            'differences'
        ]

        existing_report = ShiftReport.objects.filter(
            user=user,
            report_date=today,
            shift_number=shift_number
        ).first()

        if existing_report:
            return existing_report, False

        report = ShiftReport.objects.create(
            user=user,
            report_date=today,
            shift_number=shift_number,
            shift_started_at=shift_started_at,
            shift_ended_at=shift_ended_at,
            instant_sales=shift_state.instant_sales,
            instant_cashes=differences[
                'instant_cashes'
            ],
            online_sales=differences[
                'online_sales'
            ],
            online_cashes=differences[
                'online_cashes'
            ],
            online_cancels=differences[
                'online_cancels'
            ],
        )

        # ==============================================
        # TEMPORARY CLOSED PACK ROWS
        #
        # Do not use created_at here. report=None means
        # the row has not yet been consumed by a shift.
        # ==============================================
        sold_rows = list(
            DailyReportBoxDetail.objects.filter(
                user=user,
                report_date=today,
                report__isnull=True,
                closing_status__iexact='Sold',
            )
        )

        returned_rows = list(
            DailyReportBoxDetail.objects.filter(
                user=user,
                report_date=today,
                report__isnull=True,
                closing_status__iexact='Returned',
            )
        )

        closed_rows = sold_rows + returned_rows

        closed_rows.sort(
            key=lambda row: (
                get_numeric_box_sort_value(
                    row.box_num
                ),
                row.id
            )
        )

        for row in closed_rows:
            ShiftReportBoxDetail.objects.create(
                user=user,
                report=report,
                report_date=today,
                shift_number=shift_number,
                box_num=row.box_num,
                inventory_book=row.inventory_book,
                lottery_name=row.lottery_name,
                game_num=row.game_num,
                pack_num=row.pack_num,
                start_num=row.start_num,
                current_num=row.current_num,
                ticket_value=row.ticket_value,
                total_amount=row.total_amount,
                closing_status=row.closing_status,
            )

        # Delete only after all rows were successfully copied.
        closed_row_ids = [
            row.id
            for row in closed_rows
        ]

        if closed_row_ids:
            DailyReportBoxDetail.objects.filter(
                id__in=closed_row_ids,
                user=user,
            ).delete()

        # ==============================================
        # CURRENT ACTIVE PACK SNAPSHOT
        # ==============================================
        active_packs = (
            ActivatedPack.objects
            .select_related(
                'inventory_book__game'
            )
            .filter(user=user)
        )

        active_packs = sorted(
            active_packs,
            key=lambda pack: (
                get_numeric_box_sort_value(
                    pack.box_num
                ),
                pack.id
            )
        )

        for pack in active_packs:
            book = pack.inventory_book

            total_amount = calculate_box_total(
                pack.today_start,
                pack.current_count,
                book.ticket_value,
                'Active'
            )

            ShiftReportBoxDetail.objects.create(
                user=user,
                report=report,
                report_date=today,
                shift_number=shift_number,
                box_num=pack.box_num,
                inventory_book=book,
                lottery_name=(
                    book.game.name
                    or book.game.game_id
                ),
                game_num=book.game.game_id,
                pack_num=book.pack_id,
                start_num=pack.today_start,
                current_num=pack.current_count,
                ticket_value=book.ticket_value,
                total_amount=total_amount,
                closing_status='Active',
            )

        # Prepare active boxes for the next shift.
        roll_active_packs_to_next_day(user)

        shift_state.instant_sales = Decimal(
            '0.00'
        )
        shift_state.shift_number = (
            shift_number + 1
        )
        shift_state.started_at = shift_ended_at

        shift_state.save(
            update_fields=[
                'instant_sales',
                'shift_number',
                'started_at',
                'updated_at',
            ]
        )

    return report, True

def build_report_pdf_bytes(report, user):
    details = DailyReportBoxDetail.objects.filter(
        user=user,
        report=report
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

    # elements.append(Paragraph("Global Market #3", styles['Title']))
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
    return buffer.getvalue()

def pdf_money(value, negative_parentheses=False):
    """
    Formats Decimal values for the PDF.
    """

    amount = Decimal(str(value or 0)).quantize(
        Decimal('0.01')
    )

    if negative_parentheses and amount > 0:
        return f"(${amount:,.2f})"

    if amount < 0:
        return f"(${abs(amount):,.2f})"

    return f"${amount:,.2f}"


# def pdf_datetime(value):
#     if not value:
#         return '-'

#     return timezone.localtime(value).strftime(
#         '%m-%d-%Y %I:%M:%S %p'
#     )
NEW_YORK_TIMEZONE = ZoneInfo(
    'America/New_York'
)


def pdf_datetime(value):
    """
    Formats report timestamps explicitly in
    New York Eastern Time.
    """

    if not value:
        return '-'

    # Django stores timezone-aware values in UTC.
    # Convert them explicitly to New York time
    # before placing them in the PDF.
    local_value = timezone.localtime(
        value,
        NEW_YORK_TIMEZONE
    )

    return local_value.strftime(
        '%m-%d-%Y %I:%M:%S %p'
    )

def safe_ticket_count(start_num, current_num):
    try:
        start = int(start_num or 0)
        current = int(current_num or 0)
        return max(current - start, 0)
    except (TypeError, ValueError):
        return 0


def get_numeric_box_sort_value(box_num):
    """
    Keeps numeric boxes ordered correctly and places labels such as
    'Direct Sale' after numbered boxes.
    """

    try:
        return 0, int(str(box_num))
    except (TypeError, ValueError):
        return 1, str(box_num or '')


def build_pdf_table(
    data,
    col_widths=None,
    header_rows=1,
    font_size=8,
    alignments=None,
):
    """
    Reusable PDF table styling.
    """

    table = Table(
        data,
        colWidths=col_widths,
        repeatRows=header_rows,
        hAlign='LEFT',
    )

    table_style = [
        (
            'BACKGROUND',
            (0, 0),
            (-1, header_rows - 1),
            colors.HexColor('#BFBFBF')
        ),
        (
            'TEXTCOLOR',
            (0, 0),
            (-1, header_rows - 1),
            colors.black
        ),
        (
            'FONTNAME',
            (0, 0),
            (-1, header_rows - 1),
            'Helvetica-Bold'
        ),
        (
            'FONTNAME',
            (0, header_rows),
            (-1, -1),
            'Helvetica'
        ),
        ('FONTSIZE', (0, 0), (-1, -1), font_size),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        (
            'GRID',
            (0, 0),
            (-1, -1),
            0.5,
            colors.HexColor('#707070')
        ),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]

    if alignments:
        for column_index, alignment in alignments.items():
            table_style.append(
                (
                    'ALIGN',
                    (column_index, header_rows),
                    (column_index, -1),
                    alignment
                )
            )

    table.setStyle(TableStyle(table_style))
    return table

def build_shift_report_pdf_bytes(report, user):
    """
    Generates a detailed shift report similar to the supplied reference.

    Sections:
    1. Store and shift information
    2. Lottery box sales details
    3. Selected shift totals
    4. Daily shift-by-shift sales summary
    5. Inventory and active ticket information
    6. Active, sold and returned ticket details
    """

    zero = Decimal('0.00')

    # ---------------------------------------------------------
    # SELECTED SHIFT DETAILS
    # ---------------------------------------------------------
    shift_details = list(
        ShiftReportBoxDetail.objects
        .select_related(
            'inventory_book',
            'inventory_book__game'
        )
        .filter(
            user=user,
            report=report
        )
    )

    shift_details.sort(
        key=lambda item: (
            get_numeric_box_sort_value(item.box_num),
            item.id
        )
    )

    # ---------------------------------------------------------
    # ALL SHIFTS FOR THE SAME DATE
    # ---------------------------------------------------------
    daily_shifts = list(
        ShiftReport.objects.filter(
            user=user,
            report_date=report.report_date
        ).order_by('shift_number')
    )

    # ---------------------------------------------------------
    # STORE INFORMATION
    # ---------------------------------------------------------
    store = (
        Store.objects
        .filter(user=user)
        .select_related('owner')
        .first()
    )

    location_name = (
        store.name
        if store
        else user.first_name or user.username
    )

    legal_name = (
        store.owner.name
        if store and store.owner
        else user.first_name or user.username
    )

    user_login = user.username

    # The Store model currently does not have an address.
    store_address = 'Not configured'

    # ---------------------------------------------------------
    # SELECTED SHIFT CALCULATIONS
    # ---------------------------------------------------------
    total_ticket_count = 0
    details_total = zero

    active_details = []
    sold_details = []
    returned_details = []

    for detail in shift_details:
        count = safe_ticket_count(
            detail.start_num,
            detail.current_num
        )

        total_ticket_count += count
        details_total += Decimal(
            str(detail.total_amount or 0)
        )

        normalized_status = (
            detail.closing_status or ''
        ).strip().lower()

        if normalized_status == 'sold':
            sold_details.append(detail)
        elif normalized_status == 'returned':
            returned_details.append(detail)
        else:
            active_details.append(detail)

    shift_total_sales = (
        Decimal(str(report.instant_sales or 0))
        + Decimal(str(report.online_sales or 0))
    )

    shift_total_cashes = (
        Decimal(str(report.instant_cashes or 0))
        + Decimal(str(report.online_cashes or 0))
    )

    calculated_money_drop = (
        Decimal(str(report.instant_sales or 0))
        + Decimal(str(report.online_sales or 0))
        - Decimal(str(report.instant_cashes or 0))
        - Decimal(str(report.online_cashes or 0))
        - Decimal(str(report.online_cancels or 0))
    )

    # ---------------------------------------------------------
    # ACTIVE TICKET SNAPSHOT
    # ---------------------------------------------------------
    active_remaining_ticket_count = 0
    active_remaining_value = zero

    for detail in active_details:
        book = detail.inventory_book

        if not book:
            continue

        remaining_tickets = max(
            int(book.total_tickets or 0)
            - int(detail.current_num or 0),
            0
        )

        active_remaining_ticket_count += remaining_tickets

        active_remaining_value += (
            Decimal(remaining_tickets)
            * Decimal(str(detail.ticket_value or 0))
        )

    # ---------------------------------------------------------
    # CURRENT INACTIVE INVENTORY
    # ---------------------------------------------------------
    #
    # This is current inventory at PDF generation time.
    # It is exact when the report is emailed immediately at shift end.
    #
    inactive_inventory = list(
        InventoryBook.objects.filter(
            user=user,
            is_activated=False,
            is_sold=False,
            is_returned=False,
        ).select_related('game')
    )

    inactive_pack_count = len(inactive_inventory)
    inactive_ticket_count = 0
    inactive_inventory_value = zero

    for book in inactive_inventory:
        inactive_ticket_count += int(
            book.total_tickets or 0
        )

        inactive_inventory_value += (
            Decimal(book.total_tickets or 0)
            * Decimal(str(book.ticket_value or 0))
        )

    # ---------------------------------------------------------
    # EMPTY BOXES
    # ---------------------------------------------------------
    #
    # Your application currently supports box numbers through 70.
    #
    used_boxes = set()

    for detail in shift_details:
        try:
            used_boxes.add(int(str(detail.box_num)))
        except (TypeError, ValueError):
            continue

    empty_boxes = [
        str(box_number)
        for box_number in range(1, 71)
        if box_number not in used_boxes
    ]

    # ---------------------------------------------------------
    # DAILY TOTALS
    # ---------------------------------------------------------
    daily_instant_sales = sum(
        (
            Decimal(str(item.instant_sales or 0))
            for item in daily_shifts
        ),
        zero
    )

    daily_online_sales = sum(
        (
            Decimal(str(item.online_sales or 0))
            for item in daily_shifts
        ),
        zero
    )

    daily_instant_cashes = sum(
        (
            Decimal(str(item.instant_cashes or 0))
            for item in daily_shifts
        ),
        zero
    )

    daily_online_cashes = sum(
        (
            Decimal(str(item.online_cashes or 0))
            for item in daily_shifts
        ),
        zero
    )

    daily_online_cancels = sum(
        (
            Decimal(str(item.online_cancels or 0))
            for item in daily_shifts
        ),
        zero
    )

    daily_total_sales = (
        daily_instant_sales
        + daily_online_sales
    )

    daily_total_cashes = (
        daily_instant_cashes
        + daily_online_cashes
    )

    daily_calculated_money_drop = (
        daily_total_sales
        - daily_total_cashes
        - daily_online_cancels
    )

    # ---------------------------------------------------------
    # PDF SETUP
    # ---------------------------------------------------------
    buffer = BytesIO()

    document = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=18,
        leftMargin=18,
        topMargin=22,
        bottomMargin=22,
        title=(
            f"Shift {report.shift_number} Report "
            f"{report.report_date}"
        ),
        author='Bright Core Solutions',
    )

    stylesheet = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'CustomTitle',
        parent=stylesheet['Title'],
        fontName='Helvetica-Bold',
        fontSize=17,
        leading=20,
        alignment=TA_CENTER,
        spaceAfter=5,
    )

    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=stylesheet['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=14,
        alignment=TA_CENTER,
        spaceAfter=10,
    )

    section_style = ParagraphStyle(
        'SectionHeading',
        parent=stylesheet['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        alignment=TA_LEFT,
        spaceBefore=8,
        spaceAfter=6,
    )

    small_style = ParagraphStyle(
        'SmallText',
        parent=stylesheet['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10,
    )

    small_bold_style = ParagraphStyle(
        'SmallBoldText',
        parent=small_style,
        fontName='Helvetica-Bold',
    )

    right_small_style = ParagraphStyle(
        'RightSmallText',
        parent=small_style,
        alignment=TA_RIGHT,
    )

    story = []

    # ---------------------------------------------------------
    # REPORT TITLE
    # ---------------------------------------------------------
    story.append(
        Paragraph(
            'THE LOTTERY SYSTEM',
            title_style
        )
    )

    story.append(
        Paragraph(
            f"Detailed Shift Report - {location_name}",
            subtitle_style
        )
    )

    # ---------------------------------------------------------
    # HEADER INFORMATION
    # ---------------------------------------------------------
    left_header = [
        [
            Paragraph(
                '<b>Location Name</b>',
                small_style
            ),
            Paragraph(
                str(location_name),
                small_style
            ),
        ],
        [
            Paragraph(
                '<b>Legal Name</b>',
                small_style
            ),
            Paragraph(
                str(legal_name),
                small_style
            ),
        ],
        [
            Paragraph(
                '<b>Address</b>',
                small_style
            ),
            Paragraph(
                str(store_address),
                small_style
            ),
        ],
    ]

    right_header = [
        [
            Paragraph(
                '<b>User Login</b>',
                small_style
            ),
            Paragraph(
                str(user_login),
                small_style
            ),
        ],
        [
            Paragraph(
                '<b>Shift #</b>',
                small_style
            ),
            Paragraph(
                f"Shift {report.shift_number}",
                small_style
            ),
        ],
        [
            Paragraph(
                '<b>Start Date</b>',
                small_style
            ),
            Paragraph(
                pdf_datetime(report.shift_started_at),
                small_style
            ),
        ],
        [
            Paragraph(
                '<b>Close Date</b>',
                small_style
            ),
            Paragraph(
                pdf_datetime(report.shift_ended_at),
                small_style
            ),
        ],
        [
            Paragraph(
                '<b>Report #</b>',
                small_style
            ),
            Paragraph(
                str(report.id),
                small_style
            ),
        ],
    ]

    header_table = Table(
        [
            [
                Table(
                    left_header,
                    colWidths=[0.9 * inch, 2.35 * inch],
                ),
                Table(
                    right_header,
                    colWidths=[0.85 * inch, 2.25 * inch],
                ),
            ]
        ],
        colWidths=[3.35 * inch, 3.25 * inch],
    )

    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))

    story.append(header_table)
    story.append(Spacer(1, 10))

    # ---------------------------------------------------------
    # LOTTERY BOX DETAIL TABLE
    # ---------------------------------------------------------
    story.append(
        Paragraph(
            'Lottery Box Sales Details',
            section_style
        )
    )

    box_table_data = [[
        'Box',
        'Ticket ID',
        'Pack #',
        'Ticket Name',
        'Open #',
        'Close #',
        'Value',
        'Count',
        'Total',
    ]]

    for detail in shift_details:
        ticket_count = safe_ticket_count(
            detail.start_num,
            detail.current_num
        )

        box_table_data.append([
            Paragraph(
                str(detail.box_num),
                small_style
            ),
            str(detail.game_num),
            str(detail.pack_num),
            Paragraph(
                str(detail.lottery_name),
                small_bold_style
            ),
            str(detail.start_num),
            str(detail.current_num),
            pdf_money(detail.ticket_value),
            str(ticket_count),
            pdf_money(detail.total_amount),
        ])

    if not shift_details:
        box_table_data.append([
            '',
            '',
            '',
            'No lottery box details available',
            '',
            '',
            '',
            '',
            '',
        ])

    box_table_data.append([
        '',
        '',
        '',
        Paragraph(
            '<b>Total</b>',
            right_small_style
        ),
        '',
        '',
        '',
        str(total_ticket_count),
        pdf_money(details_total),
    ])

    box_table = build_pdf_table(
        box_table_data,
        col_widths=[
            0.82 * inch,   # Box / Direct Sale / Inventory Return
            0.55 * inch,   # Ticket ID
            0.68 * inch,   # Pack #
            1.78 * inch,   # Ticket Name
            0.52 * inch,   # Open #
            0.54 * inch,   # Close #
            0.60 * inch,   # Value
            0.50 * inch,   # Count
            0.72 * inch,   # Total
        ],
        font_size=6.8,
        alignments={
            3: 'LEFT',
            8: 'RIGHT',
        },
    )

    box_table.setStyle(TableStyle([
        (
            'SPAN',
            (0, len(box_table_data) - 1),
            (2, len(box_table_data) - 1)
        ),
        (
            'SPAN',
            (3, len(box_table_data) - 1),
            (6, len(box_table_data) - 1)
        ),
        (
            'FONTNAME',
            (0, len(box_table_data) - 1),
            (-1, len(box_table_data) - 1),
            'Helvetica-Bold'
        ),
    ]))

    story.append(box_table)
    story.append(Spacer(1, 12))

    # ---------------------------------------------------------
    # SHIFT FINANCIAL SUMMARY
    # ---------------------------------------------------------
    shift_summary_left = [
        ['Online Cancels', pdf_money(
            report.online_cancels,
            negative_parentheses=True
        )],
        ['Total Tickets Sold', str(total_ticket_count)],
        ['Active Boxes', str(len(active_details))],
        ['Sold Packs', str(len(sold_details))],
        ['Returned Packs', str(len(returned_details))],
    ]

    shift_summary_right = [
        ['Instant Sales', pdf_money(report.instant_sales)],
        ['Online Sales', pdf_money(report.online_sales)],
        ['Total Sales', pdf_money(shift_total_sales)],
        [
            'Online CashOut',
            pdf_money(
                report.online_cashes,
                negative_parentheses=True
            )
        ],
        [
            'Instant CashOut',
            pdf_money(
                report.instant_cashes,
                negative_parentheses=True
            )
        ],
        [
            'Total CashOut',
            pdf_money(
                shift_total_cashes,
                negative_parentheses=True
            )
        ],
        [
            'Calculated Money Drop',
            pdf_money(calculated_money_drop)
        ],
    ]

    financial_summary = Table(
        [
            [
                Table(
                    shift_summary_left,
                    colWidths=[1.25 * inch, 1.15 * inch],
                ),
                Table(
                    shift_summary_right,
                    colWidths=[1.35 * inch, 1.25 * inch],
                ),
            ]
        ],
        colWidths=[3.2 * inch, 3.2 * inch],
    )

    financial_summary.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
    ]))

    for nested_data in [
        financial_summary._cellvalues[0][0],
        financial_summary._cellvalues[0][1],
    ]:
        nested_data.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))

    story.append(financial_summary)
    story.append(Spacer(1, 14))

    # ---------------------------------------------------------
    # DAILY SALES SUMMARY
    # ---------------------------------------------------------
    story.append(
        Paragraph(
            'Daily Sales Summary',
            section_style
        )
    )

    daily_summary_header = ['']

    for shift in daily_shifts:
        daily_summary_header.append(
            f"Shift {shift.shift_number}"
        )

    daily_summary_header.append('Daily Total')

    def build_daily_summary_row(
        label,
        field_name=None,
        calculated_function=None,
        negative=False,
        daily_total=None,
    ):
        row = [label]

        for shift in daily_shifts:
            if calculated_function:
                value = calculated_function(shift)
            else:
                value = getattr(
                    shift,
                    field_name,
                    zero
                )

            row.append(
                pdf_money(
                    value,
                    negative_parentheses=negative
                )
            )

        row.append(
            pdf_money(
                daily_total,
                negative_parentheses=negative
            )
        )

        return row

    daily_summary_data = [
        daily_summary_header,
        build_daily_summary_row(
            'Instant Sales',
            field_name='instant_sales',
            daily_total=daily_instant_sales,
        ),
        build_daily_summary_row(
            'Online Sales',
            field_name='online_sales',
            daily_total=daily_online_sales,
        ),
        build_daily_summary_row(
            'Total Sales',
            calculated_function=lambda shift: (
                Decimal(str(shift.instant_sales or 0))
                + Decimal(str(shift.online_sales or 0))
            ),
            daily_total=daily_total_sales,
        ),
        build_daily_summary_row(
            'Online CashOut',
            field_name='online_cashes',
            negative=True,
            daily_total=daily_online_cashes,
        ),
        build_daily_summary_row(
            'Instant CashOut',
            field_name='instant_cashes',
            negative=True,
            daily_total=daily_instant_cashes,
        ),
        build_daily_summary_row(
            'Total CashOut',
            calculated_function=lambda shift: (
                Decimal(str(shift.instant_cashes or 0))
                + Decimal(str(shift.online_cashes or 0))
            ),
            negative=True,
            daily_total=daily_total_cashes,
        ),
        build_daily_summary_row(
            'Online Cancels',
            field_name='online_cancels',
            negative=True,
            daily_total=daily_online_cancels,
        ),
        build_daily_summary_row(
            'Calculated Money Drop',
            calculated_function=lambda shift: (
                Decimal(str(shift.instant_sales or 0))
                + Decimal(str(shift.online_sales or 0))
                - Decimal(str(shift.instant_cashes or 0))
                - Decimal(str(shift.online_cashes or 0))
                - Decimal(str(shift.online_cancels or 0))
            ),
            daily_total=daily_calculated_money_drop,
        ),
    ]

    shift_column_count = max(
        len(daily_summary_header) - 1,
        1
    )

    daily_summary_table = build_pdf_table(
        daily_summary_data,
        col_widths=[
            1.45 * inch,
            *(
                [5.2 * inch / shift_column_count]
                * shift_column_count
            ),
        ],
        font_size=7,
        alignments={
            0: 'LEFT',
        },
    )

    daily_summary_table.setStyle(TableStyle([
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (-1, 0), (-1, -1), 'Helvetica-Bold'),
    ]))

    story.append(daily_summary_table)
    story.append(Spacer(1, 14))

    # ---------------------------------------------------------
    # INVENTORY AND ACTIVE TICKET INFORMATION
    # ---------------------------------------------------------
    story.append(
        Paragraph(
            'Inventory and Active Ticket Information',
            section_style
        )
    )

    inventory_summary_data = [
        [
            'Category',
            'Pack Count',
            'Ticket Count',
            'Value',
        ],
        [
            'Active Display Boxes',
            str(len(active_details)),
            str(active_remaining_ticket_count),
            pdf_money(active_remaining_value),
        ],
        [
            'Inactive Inventory',
            str(inactive_pack_count),
            str(inactive_ticket_count),
            pdf_money(inactive_inventory_value),
        ],
        [
            'Combined Total',
            str(
                len(active_details)
                + inactive_pack_count
            ),
            str(
                active_remaining_ticket_count
                + inactive_ticket_count
            ),
            pdf_money(
                active_remaining_value
                + inactive_inventory_value
            ),
        ],
    ]

    inventory_table = build_pdf_table(
        inventory_summary_data,
        col_widths=[
            2.2 * inch,
            1.1 * inch,
            1.25 * inch,
            1.5 * inch,
        ],
        font_size=8,
        alignments={
            0: 'LEFT',
            3: 'RIGHT',
        },
    )

    inventory_table.setStyle(TableStyle([
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]))

    story.append(inventory_table)
    story.append(Spacer(1, 8))

    story.append(
        Paragraph(
            (
                '<b>Total Value of Leftover Tickets in Display Boxes:</b> '
                f'{pdf_money(active_remaining_value)}'
            ),
            small_style
        )
    )

    story.append(
        Paragraph(
            (
                '<b>Total Inventory Ticket Value:</b> '
                f'{pdf_money(inactive_inventory_value)}'
            ),
            small_style
        )
    )

    story.append(
        Paragraph(
            (
                '<b>Empty Boxes:</b> '
                f'{", ".join(empty_boxes) if empty_boxes else "None"}'
            ),
            small_style
        )
    )

    story.append(PageBreak())

    # ---------------------------------------------------------
    # TICKET STATUS TABLE BUILDER
    # ---------------------------------------------------------
    def add_ticket_status_section(
        heading,
        rows,
        include_count=False,
    ):
        story.append(
            Paragraph(
                heading,
                section_style
            )
        )

        status_data = [[
            'Box',
            'Ticket ID',
            'Pack #',
            'Ticket Name',
            'Open #',
            'Close #',
            'Value',
            'Count',
            'Total',
            'Status',
        ]]

        for detail in rows:
            count = safe_ticket_count(
                detail.start_num,
                detail.current_num
            )

            status_data.append([
                Paragraph(
                    str(detail.box_num),
                    small_style
                ),
                str(detail.game_num),
                str(detail.pack_num),
                Paragraph(
                    str(detail.lottery_name),
                    small_style
                ),
                str(detail.start_num),
                str(detail.current_num),
                pdf_money(detail.ticket_value),
                str(count),
                pdf_money(detail.total_amount),
                str(detail.closing_status),
            ])

        if not rows:
            status_data.append([
                '',
                '',
                '',
                'No records available',
                '',
                '',
                '',
                '',
                '',
                '',
            ])

        status_table = build_pdf_table(
            status_data,
            col_widths=[
                0.85 * inch,   # Box label
                0.52 * inch,   # Ticket ID
                0.66 * inch,   # Pack #
                1.36 * inch,   # Ticket Name
                0.45 * inch,   # Open #
                0.47 * inch,   # Close #
                0.55 * inch,   # Value
                0.44 * inch,   # Count
                0.64 * inch,   # Total
                0.64 * inch,   # Status
            ],
            font_size=6.2,
            alignments={
                3: 'LEFT',
                8: 'RIGHT',
            },
        )

        story.append(status_table)
        story.append(Spacer(1, 12))

    # ---------------------------------------------------------
    # ACTIVE, SOLD AND RETURNED DETAILS
    # ---------------------------------------------------------
    add_ticket_status_section(
        f"Shift {report.shift_number} - Active Tickets at Shift Close",
        active_details,
    )

    add_ticket_status_section(
        f"Shift {report.shift_number} - Sold Out Tickets",
        sold_details,
    )

    add_ticket_status_section(
        f"Shift {report.shift_number} - Returned Tickets",
        returned_details,
    )

    # ---------------------------------------------------------
    # FOOTER CALLBACK
    # ---------------------------------------------------------
    def add_page_number(canvas, doc):
        canvas.saveState()

        canvas.setFont(
            'Helvetica',
            7
        )

        canvas.drawString(
            18,
            12,
            (
                f"Report #{report.id} | "
                f"Shift {report.shift_number} | "
                f"{report.report_date}"
            )
        )

        canvas.drawRightString(
            letter[0] - 18,
            12,
            f"Page {doc.page}"
        )

        canvas.restoreState()

    document.build(
        story,
        onFirstPage=add_page_number,
        onLaterPages=add_page_number,
    )

    buffer.seek(0)
    return buffer.getvalue()

def send_report_email(report, user):
    if not user.email:
        return
    
    resend.api_key = settings.RESEND_API_KEY

    pdf_bytes = build_report_pdf_bytes(report, user)
    import base64

    resend.Emails.send({
        "from": "admin@bright-core-solutions.com",
        "to": [user.email],
        "subject": f"End Shift Report - {report.report_date}",
        "text": (
            f"Hello {user.first_name or user.username},\n\n"
            f"Please find attached your end shift report for {report.report_date}.\n\n"
            f"Regards,\nBright Core Solutions"
        ),
        "attachments": [{
            "filename": f"reports_eod_{report.id}_{report.report_date}.pdf",
            "content": base64.b64encode(pdf_bytes).decode("utf-8"),
        }],
    })

def send_shift_report_email(report, user):
    if not user.email:
        raise ValueError(
            'The store user has no email address.'
        )

    if not settings.RESEND_API_KEY:
        raise ValueError(
            'RESEND_API_KEY is not configured.'
        )

    resend.api_key = settings.RESEND_API_KEY

    pdf_bytes = build_shift_report_pdf_bytes(
        report,
        user
    )

    if not pdf_bytes:
        raise ValueError(
            'Shift report PDF generation returned no data.'
        )

    response = resend.Emails.send({
        "from": (
            "admin@bright-core-solutions.com"
        ),
        "to": [user.email],
        "subject": (
            f"Shift {report.shift_number} Report - "
            f"{report.report_date}"
        ),
        "text": (
            f"Hello "
            f"{user.first_name or user.username},\n\n"
            f"Please find attached the report for "
            f"shift {report.shift_number} on "
            f"{report.report_date}.\n\n"
            f"Regards,\n"
            f"Bright Core Solutions"
        ),
        "attachments": [{
            "filename": (
                f"shift_report_"
                f"{report.id}_"
                f"{report.report_date}_"
                f"shift_{report.shift_number}.pdf"
            ),
            "content": base64.b64encode(
                pdf_bytes
            ).decode("utf-8"),
        }],
    })

    return response

def send_shift_report_email_safely(
    report_id,
    user_id
):
    """
    Runs inside the background thread and prints the
    actual email/PDF error instead of failing silently.
    """

    try:
        report = ShiftReport.objects.get(
            id=report_id
        )

        user = User.objects.get(
            id=user_id
        )

        send_shift_report_email(
            report,
            user
        )

        print(
            f"[SHIFT EMAIL SUCCESS] "
            f"Report ID: {report_id}, "
            f"To: {user.email}"
        )

    except Exception as error:
        import traceback

        print(
            f"[SHIFT EMAIL FAILED] "
            f"Report ID: {report_id}, "
            f"User ID: {user_id}, "
            f"Error: {error}"
        )

        traceback.print_exc()

def get_business_date():
    return timezone.localtime().date()

def get_instant_sales_for_date(user, report_date):
    instant_sales = Decimal('0.00')

    scans = SoldTicket.objects.filter(
        user=user,
        sold_at__date=report_date
    ).select_related('inventory_book__game')

    for row in scans:
        instant_sales += Decimal(row.delta_count) * row.inventory_book.game.ticket_value

    return instant_sales

def get_today_instant_sales(user):
    return get_instant_sales_for_date(user, get_business_date())

def calculate_box_total(start_num, current_num, ticket_value, closing_status):
    sold_count = max(current_num - start_num, 0)

    # sold pack includes the final ticket
    # if closing_status == 'Sold':
    #     sold_count += 1
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

class ManagerReportsAccessMixin:
    manager_scope = 'reports'

    def get_reports_access(self, request):
        """
        Returns:

        target_user:
            The store user whose reports should be loaded.

        access_error:
            Response when access should be denied.
        """

        target_user, is_owner_access, context_error = (
            get_reports_target_user(request)
        )

        if context_error:
            return None, context_error

        # Store owners accessing their own linked store
        # do not need the managerial PIN.
        if is_owner_access:
            return target_user, None

        # Normal store employee access still requires PIN.
        is_valid, error_message = (
            validate_manager_access_token(
                request,
                self.manager_scope
            )
        )

        if not is_valid:
            return (
                None,
                Response(
                    {'error': error_message},
                    status=status.HTTP_403_FORBIDDEN
                )
            )

        return target_user, None

class ManagerActivationAccessMixin:
    manager_scope = 'activation'

    def check_manager_access(self, request):
        is_valid, error_message = (
            validate_manager_access_token(
                request,
                self.manager_scope
            )
        )

        if not is_valid:
            return Response(
                {'error': error_message},
                status=status.HTTP_403_FORBIDDEN
            )

        return None

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
        is_owner = StoreOwner.objects.filter(user=user).exists()

        return Response({
            'message': 'Login successful',
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'is_owner': is_owner,
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

        if (len(raw_barcode)) > 14:
            raw_barcode=raw_barcode[:14]
            game_id = raw_barcode[:4]
            pack_id = raw_barcode[4:-3]
        else:
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
        ).annotate(
            box_num_order=Cast('box_num', IntegerField())
        ).order_by('box_num_order', 'id')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

# class ActivateInventoryBookView(APIView):
#     permission_classes = [IsAuthenticated]

#     def post(self, request):
#         raw_barcode = str(request.data.get('raw_barcode', '')).strip()
#         reverse_mode = bool(request.data.get('reverse_mode', False))

#         if not raw_barcode:
#             return Response({'error': 'Barcode is required.'}, status=status.HTTP_400_BAD_REQUEST)

#         if len(raw_barcode) < 5:
#             return Response({'error': 'Invalid barcode.'}, status=status.HTTP_400_BAD_REQUEST)

#         game_id = raw_barcode[:4]
#         pack_id = raw_barcode[4:-4]

#         if not pack_id:
#             return Response({'error': 'Pack id is missing.'}, status=status.HTTP_400_BAD_REQUEST)

#         try:
#             inventory_book = InventoryBook.objects.select_related('game').get(
#                 user=request.user,
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

#         box_num = request.data.get('box_num')

#         if box_num is None:
#             return Response({'error': 'Box number is required.'}, status=400)

#         if ActivatedPack.objects.filter(user=request.user, box_num=box_num).exists():
#             return Response({'error': f'Box {box_num} already in use.'}, status=400)

#         inventory_book.is_activated = True
#         inventory_book.save(update_fields=['is_activated', 'updated_at'])

#         activated_pack = ActivatedPack.objects.create(
#             user=request.user,
#             inventory_book=inventory_book,
#             box_num=box_num,
#             reverse_mode=reverse_mode,
#             current_count=0,
#             last_ticket=0,
#             today_start=0,
#             tomorrow_start=0
#         )

#         serializer = ActivatedPackSerializer(activated_pack, context={'request': request})
#         return Response(serializer.data, status=status.HTTP_200_OK)

class ActivateInventoryBookView(ManagerActivationAccessMixin, APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        access_error = self.check_manager_access(
            request
        )

        if access_error:
            return access_error
        
        raw_barcode = str(request.data.get('raw_barcode', '')).strip()
        reverse_mode = request.data.get('reverse_mode', False)

        if isinstance(reverse_mode, str):
            reverse_mode = reverse_mode.lower() in ['true', '1', 'yes', 'on']
        else:
            reverse_mode = bool(reverse_mode)

        if not raw_barcode:
            return Response({'error': 'Barcode is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(raw_barcode) < 5:
            return Response({'error': 'Invalid barcode.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(raw_barcode) > 14:
            raw_barcode=raw_barcode[:14]
            game_id = raw_barcode[:4]
            pack_id = raw_barcode[4:-3]
        else:    
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

        box_num = str(request.data.get('box_num', '')).strip()
        if not box_num:
            return Response({'error': 'Box number is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if ActivatedPack.objects.filter(user=request.user, box_num=box_num).exists():
            return Response({'error': f'Box {box_num} already in use.'}, status=status.HTTP_400_BAD_REQUEST)

        # -----------------------------
        # REVERSE MODE: bring sold pack back
        # -----------------------------
        if reverse_mode:
            if inventory_book.is_activated:
                return Response({'error': 'Pack is already activated.'}, status=status.HTTP_400_BAD_REQUEST)

            if not inventory_book.is_sold:
                return Response(
                    {'error': 'Only sold packs can be restored in reverse mode.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            latest_sold_detail = DailyReportBoxDetail.objects.filter(
                user=request.user,
                report_date=get_business_date(),
                inventory_book=inventory_book,
                closing_status='Sold'
            ).order_by('-id').first()

            restored_today_start = latest_sold_detail.start_num if latest_sold_detail else 0
            restored_current = max(inventory_book.total_tickets - 1, 0)

            inventory_book.is_sold = False
            inventory_book.is_activated = True
            inventory_book.is_returned = False
            inventory_book.save(update_fields=['is_sold', 'is_activated', 'is_returned', 'updated_at'])

            activated_pack = ActivatedPack.objects.create(
                user=request.user,
                inventory_book=inventory_book,
                box_num=box_num,
                reverse_mode=True,
                current_count=restored_current,
                last_ticket=restored_current,
                today_start=restored_today_start,
                tomorrow_start=restored_today_start
            )

            # instead of creating a new reverse SoldTicket row,
            # update the latest positive sold row for this pack today
            latest_sale_row = SoldTicket.objects.filter(
                user=request.user,
                inventory_book=inventory_book,
                sold_at__date=get_business_date(),
                delta_count__gt=0
            ).order_by('-sold_at').first()

            if latest_sale_row:
                latest_sale_row.delta_count -= 1
                latest_sale_row.is_reversal = latest_sale_row.delta_count < 0
                latest_sale_row.scanned_code = 'REVERSE_RESTORE'

                if latest_sale_row.delta_count == 0:
                    latest_sale_row.delete()
                else:
                    latest_sale_row.save(update_fields=['delta_count', 'is_reversal', 'scanned_code'])
            else:
                SoldTicket.objects.create(
                    user=request.user,
                    inventory_book=inventory_book,
                    ticket_number=restored_current,
                    scanned_code='REVERSE_RESTORE',
                    delta_count=-1,
                    is_reversal=True
                )
            
            add_to_shift_sales(
                user=request.user,
                delta_count=-1,
                ticket_value=inventory_book.ticket_value
            )

            if latest_sold_detail:
                latest_sold_detail.box_num = box_num
                latest_sold_detail.current_num = restored_current
                latest_sold_detail.total_amount = calculate_box_total(
                    latest_sold_detail.start_num,
                    restored_current,
                    inventory_book.ticket_value,
                    'Active'
                )
                latest_sold_detail.closing_status = 'Active'
                latest_sold_detail.save()
            else:
                create_active_box_detail(activated_pack, report_date=get_business_date())

            serializer = ActivatedPackSerializer(activated_pack, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)

        # -----------------------------
        # NORMAL ACTIVATE
        # -----------------------------
        if inventory_book.is_activated:
            return Response({'error': 'Already activated.'}, status=status.HTTP_400_BAD_REQUEST)

        if inventory_book.is_sold:
            return Response(
                {'error': 'Sold pack can only be restored using reverse mode.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        inventory_book.is_activated = True
        inventory_book.save(update_fields=['is_activated', 'updated_at'])

        activated_pack = ActivatedPack.objects.create(
            user=request.user,
            inventory_book=inventory_book,
            box_num=box_num,
            reverse_mode=False,
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
        
        if len(barcode) > 14:
            barcode=barcode[:14] 
            game_id = barcode[:4]
            pack_id = barcode[4:-3]
            ticket_number = barcode[-3:]
        else:
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
            return Response({'error': 'Invalid input'}, status=400)

        try:
            parsed = self.parse_scanned_ticket(raw_barcode)
        except ValueError:
            return Response({'error': 'Invalid input'}, status=400)

        game_id = parsed['game_id']
        pack_id = parsed['pack_id']
        ticket_number = parsed['ticket_number']

        # -----------------------------
        # SMART DUPLICATE PROTECTION
        # -----------------------------
        # block same ticket
        ticket_lock_key = f"scan_ticket:{request.user.id}:{pack_id}:{ticket_number}"

        # block rapid scans on same pack
        pack_lock_key = f"scan_pack:{request.user.id}:{pack_id}"

        if cache.get(ticket_lock_key) or cache.get(pack_lock_key):
            return Response({
                "message": "Duplicate scan blocked",
                "ticket_number": ticket_number,
                "duplicate": True
            }, status=200)

        # set both locks
        cache.set(ticket_lock_key, True, timeout=1.0)
        cache.set(pack_lock_key, True, timeout=0.3)

        # -----------------------------
        # MAIN LOGIC WITH LOCK
        # -----------------------------
        with transaction.atomic():
            try:
                activated_pack = ActivatedPack.objects.select_for_update().select_related(
                    'inventory_book__game'
                ).get(
                    user=request.user,
                    inventory_book__game__game_id=game_id,
                    inventory_book__pack_id=pack_id,
                    inventory_book__is_activated=True
                )
            except ActivatedPack.DoesNotExist:
                return Response({'error': 'Pack not activated or not found'}, status=400)

            book = activated_pack.inventory_book

            if ticket_number >= book.total_tickets:
                return Response({'error': 'Invalid input'}, status=400)

            # -----------------------------
            # ORIGINAL LOGIC (UNCHANGED)
            # -----------------------------
            previous_ticket = activated_pack.current_count
            count = ticket_number - previous_ticket

            if count > 0:
                delta_count = count + 1
            elif count < 0:
                delta_count = count
            else:
                delta_count = 1

            is_reversal = delta_count < 0
            if delta_count >0:
                activated_pack.current_count = activated_pack.current_count  + delta_count
                cc = activated_pack.current_count
                # print("DELTA:", cc, "CURRENT:", activated_pack.current_count)

            elif delta_count < 0:
                activated_pack.current_count = max(activated_pack.current_count  + delta_count, 0)
                cc =  max(activated_pack.current_count, 0)
                # print("DELTA:", cc, "CURRENT:", activated_pack.current_count)

            SoldTicket.objects.create(
                user=request.user,
                inventory_book=book,
                ticket_number=ticket_number,
                scanned_code=raw_barcode,
                delta_count=delta_count,
                is_reversal=is_reversal
            )

            add_to_shift_sales(
                user=request.user,
                delta_count=delta_count,
                ticket_value=book.ticket_value
            )

            activated_pack.last_ticket = previous_ticket

           

            activated_pack.save(update_fields=['last_ticket', 'current_count', 'updated_at'])

            create_active_box_detail(activated_pack, report_date=get_business_date())

            pack_sold = False
            if activated_pack.current_count >= book.total_tickets:
                create_sold_box_detail(activated_pack)
                finalize_sold_pack(book, activated_pack)
                pack_sold = True

        return Response({
            'message': 'Ticket scanned successfully',
            'ticket_number': ticket_number,
            'current_count': cc,
            'last_ticket': previous_ticket,
            'delta_count': delta_count,
            'is_reversal': is_reversal,
            'pack_sold': pack_sold,
        }, status=200)

class MarkInventoryBookSoldView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        today = get_business_date()

        with transaction.atomic():
            # Lock/create the current shift first so the returned row
            # definitely belongs to the active shift.
            shift_state = (
                ShiftState.objects
                .select_for_update()
                .filter(user=request.user)
                .first()
            )

            if not shift_state:
                shift_state = ShiftState.objects.create(
                    user=request.user,
                    shift_number=1,
                    instant_sales=Decimal('0.00'),
                    started_at=timezone.now(),
                )

            try:
                inventory_book = (
                    InventoryBook.objects
                    .select_for_update()
                    .select_related('game')
                    .get(
                        pk=pk,
                        user=request.user
                    )
                )
            except InventoryBook.DoesNotExist:
                return Response(
                    {
                        'error': 'Inventory book not found.'
                    },
                    status=status.HTTP_404_NOT_FOUND
                )

            if inventory_book.is_sold:
                return Response(
                    {
                        'error': (
                            'Pack is already sold or returned.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

            # ==================================================
            # INACTIVE INVENTORY PACK
            # Mark it returned without counting any sale.
            # ==================================================
            if not inventory_book.is_activated:
                returned_detail = (
                    DailyReportBoxDetail.objects
                    .filter(
                        user=request.user,
                        report_date=today,
                        inventory_book=inventory_book,
                        report__isnull=True,
                        closing_status__iexact='Returned',
                        created_at__gte=shift_state.started_at,
                    )
                    .order_by('-id')
                    .first()
                )

                if returned_detail:
                    returned_detail.box_num = 'Inventory Return'
                    returned_detail.lottery_name = (
                        inventory_book.game.name
                        or inventory_book.game.game_id
                    )
                    returned_detail.game_num = (
                        inventory_book.game.game_id
                    )
                    returned_detail.pack_num = (
                        inventory_book.pack_id
                    )
                    returned_detail.start_num = 0
                    returned_detail.current_num = 0
                    returned_detail.ticket_value = (
                        inventory_book.ticket_value
                    )
                    returned_detail.total_amount = (
                        Decimal('0.00')
                    )
                    returned_detail.closing_status = (
                        'Returned'
                    )

                    returned_detail.save(
                        update_fields=[
                            'box_num',
                            'lottery_name',
                            'game_num',
                            'pack_num',
                            'start_num',
                            'current_num',
                            'ticket_value',
                            'total_amount',
                            'closing_status',
                        ]
                    )
                else:
                    returned_detail = (
                        DailyReportBoxDetail.objects.create(
                            user=request.user,
                            report=None,
                            report_date=today,
                            box_num='Inventory Return',
                            inventory_book=inventory_book,
                            lottery_name=(
                                inventory_book.game.name
                                or inventory_book.game.game_id
                            ),
                            game_num=(
                                inventory_book.game.game_id
                            ),
                            pack_num=inventory_book.pack_id,
                            start_num=0,
                            current_num=0,
                            ticket_value=(
                                inventory_book.ticket_value
                            ),
                            total_amount=Decimal('0.00'),
                            closing_status='Returned',
                        )
                    )

                inventory_book.is_sold = True
                inventory_book.is_returned = True
                inventory_book.is_activated = False

                inventory_book.save(
                    update_fields=[
                        'is_sold',
                        'is_returned',
                        'is_activated',
                        'updated_at',
                    ]
                )

                return Response(
                    {
                        'message': (
                            'Inventory pack returned successfully.'
                        ),
                        'pack_id': inventory_book.pack_id,
                        'closing_status': 'Returned',
                        'report_detail_id': returned_detail.id,
                        'report_date': str(today),
                        'shift_started_at': (
                            shift_state.started_at
                        ),
                    },
                    status=status.HTTP_200_OK
                )

            # ==================================================
            # ACTIVATED PACK
            # Mark all remaining tickets as sold.
            # ==================================================
            try:
                activated_pack = (
                    ActivatedPack.objects
                    .select_for_update()
                    .select_related(
                        'inventory_book',
                        'inventory_book__game'
                    )
                    .get(
                        inventory_book=inventory_book,
                        user=request.user
                    )
                )
            except ActivatedPack.DoesNotExist:
                return Response(
                    {
                        'error': (
                            'This pack is marked activated, but '
                            'its activated-box record was not found.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

            previous_count = int(
                activated_pack.current_count or 0
            )

            final_ticket_number = int(
                inventory_book.total_tickets or 0
            )

            remaining_count = max(
                final_ticket_number - previous_count,
                0
            )

            if remaining_count > 0:
                SoldTicket.objects.create(
                    user=request.user,
                    inventory_book=inventory_book,
                    ticket_number=final_ticket_number,
                    delta_count=remaining_count,
                    is_reversal=False,
                    scanned_code='MARK_SOLD',
                )

                add_to_shift_sales(
                    user=request.user,
                    delta_count=remaining_count,
                    ticket_value=(
                        inventory_book.ticket_value
                    ),
                )

            activated_pack.last_ticket = previous_count
            activated_pack.current_count = (
                final_ticket_number
            )

            activated_pack.save(
                update_fields=[
                    'last_ticket',
                    'current_count',
                    'updated_at',
                ]
            )

            sold_detail = create_sold_box_detail(
                activated_pack,
                report_date=today
            )

            inventory_book.is_returned = False
            inventory_book.save(
                update_fields=[
                    'is_returned',
                    'updated_at',
                ]
            )

            finalize_sold_pack(
                inventory_book,
                activated_pack
            )

            return Response(
                {
                    'message': (
                        'Pack marked as sold successfully.'
                    ),
                    'final_ticket_number': (
                        final_ticket_number
                    ),
                    'counted_tickets': remaining_count,
                    'closing_status': 'Sold',
                    'report_detail_id': sold_detail.id,
                },
                status=status.HTTP_200_OK
            )
    
class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # auto_save_yesterday_report_if_missing(request.user)
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

        shift_state = get_or_create_shift_state(request.user)
        instant_sales_today = shift_state.instant_sales

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


class LiveDisplayEventView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        event_type = str(request.data.get('type', '')).strip()
        payload = request.data.get('payload') or {}

        if event_type not in LIVE_DISPLAY_EVENT_TYPES:
            return Response(
                {'error': 'Invalid event type.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not isinstance(payload, dict):
            return Response(
                {'error': 'Payload must be an object.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        cache_key = get_live_display_cache_key(request.user.id)
        events = cache.get(cache_key, [])

        created_at = time.time()
        event = {
            'id': int(created_at * 1000),
            'type': event_type,
            'payload': payload,
            'created_at': created_at,
        }

        events.append(event)
        events = events[-100:]
        cache.set(cache_key, events, timeout=60 * 60)

        return Response(event, status=status.HTTP_201_CREATED)

    def get(self, request):
        since_param = request.query_params.get('since')

        since = 0.0
        if since_param is not None:
            try:
                since = float(since_param)
            except (TypeError, ValueError):
                return Response(
                    {'error': 'Invalid since value.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        cache_key = get_live_display_cache_key(request.user.id)
        events = cache.get(cache_key, [])
        filtered = [event for event in events if float(event.get('created_at', 0)) > since]

        return Response({
            'events': filtered,
            'server_time': time.time(),
        }, status=status.HTTP_200_OK)
    
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
def get_report_user_for_request(request):
    store_id = request.query_params.get('store_id')

    if not store_id:
        return request.user

    try:
        owner = StoreOwner.objects.get(user=request.user)
        store = Store.objects.get(id=store_id, owner=owner)
    except (StoreOwner.DoesNotExist, Store.DoesNotExist):
        return None

    return store.user

def can_access_report_user(request, report_user):
    if report_user == request.user:
        return True

    return Store.objects.filter(
        owner__user=request.user,
        user=report_user
    ).exists()

class DailyReportListView(APIView, ManagerReportsAccessMixin):
    """
    Returns one cumulative report row per date.

    ShiftReport stores individual shift differences.
    Summing all ShiftReport rows for a date gives the full daily totals.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        target_user, access_error = (
            self.get_reports_access(request)
        )

        if access_error:
            return access_error

        # report_user = get_report_user_for_request(request)

        # if report_user is None:
        #     return Response(
        #         {'error': 'Store not found.'},
        #         status=status.HTTP_404_NOT_FOUND
        #     )

        grouped_reports = (
            ShiftReport.objects
            .filter(user=target_user)
            .values('report_date')
            .annotate(
                instant_sales_total=Sum('instant_sales'),
                instant_cashes_total=Sum('instant_cashes'),
                online_sales_total=Sum('online_sales'),
                online_cashes_total=Sum('online_cashes'),
                online_cancels_total=Sum('online_cancels'),
                shifts_count=Count('id'),
            )
            .order_by('-report_date')
        )

        response_data = []

        for daily_group in grouped_reports:
            report_date = daily_group['report_date']

            shifts = ShiftReport.objects.filter(
                user=target_user,
                report_date=report_date
            ).order_by('shift_number')

            shift_options = [
                {
                    'id': shift.id,
                    'shiftNumber': shift.shift_number,
                    'label': f"Shift {shift.shift_number}",
                    'shiftStartedAt': shift.shift_started_at,
                    'shiftEndedAt': shift.shift_ended_at,
                }
                for shift in shifts
            ]

            response_data.append({
                # Date is the unique row identifier on the frontend.
                'id': report_date.isoformat(),
                'report_date': report_date.isoformat(),

                # Daily cumulative totals.
                'instantSales': str(
                    daily_group['instant_sales_total']
                    or Decimal('0.00')
                ),
                'instantCashes': str(
                    daily_group['instant_cashes_total']
                    or Decimal('0.00')
                ),
                'onlineSales': str(
                    daily_group['online_sales_total']
                    or Decimal('0.00')
                ),
                'onlineCashes': str(
                    daily_group['online_cashes_total']
                    or Decimal('0.00')
                ),
                'onlineCancels': str(
                    daily_group['online_cancels_total']
                    or Decimal('0.00')
                ),

                'shiftsCount': daily_group['shifts_count'],
                'shifts': shift_options,
            })

        return Response(
            response_data,
            status=status.HTTP_200_OK
        )

class ShiftReportDetailView(ManagerReportsAccessMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        target_user, access_error = (
            self.get_reports_access(request)
        )

        if access_error:
            return access_error

        try:
            report = (
                ShiftReport.objects
                .prefetch_related('box_details')
                .get(
                    pk=pk,
                    user=target_user
                )
            )
        except ShiftReport.DoesNotExist:
            return Response(
                {'error': 'Shift report not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = ShiftReportDetailSerializer(
            report
        )

        return Response(
            serializer.data,
            status=status.HTTP_200_OK
        )

class ShiftReportUpdateView(ManagerReportsAccessMixin, APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        target_user, access_error = (
            self.get_reports_access(request)
        )

        if access_error:
            return access_error

        try:
            report = ShiftReport.objects.get(pk=pk, user=target_user)
        except ShiftReport.DoesNotExist:
            return Response(
                {'error': 'Shift report not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not can_access_report_user(request, report.user):
            return Response(
                {'error': 'Shift report not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        def parse_shift_value(value, field_label):
            if value in [None, '', 'null']:
                raise ShiftReportValidationError(
                    f'{field_label} is required.'
                )

            try:
                parsed_value = Decimal(str(value)).quantize(
                    Decimal('0.01')
                )
            except Exception:
                raise ShiftReportValidationError(
                    f'{field_label} must be a valid number.'
                )

            if parsed_value < Decimal('0.00'):
                raise ShiftReportValidationError(
                    f'{field_label} cannot be negative.'
                )

            return parsed_value

        try:
            instant_cashes = parse_shift_value(
                request.data.get('instantCashes'),
                'Instant Cashes'
            )

            online_sales = parse_shift_value(
                request.data.get('onlineSales'),
                'Online Sales'
            )

            online_cashes = parse_shift_value(
                request.data.get('onlineCashes'),
                'Online Cashes'
            )

            online_cancels = parse_shift_value(
                request.data.get('onlineCancels'),
                'Online Cancels'
            )

        except ShiftReportValidationError as error:
            return Response(
                {'error': error.message},
                status=status.HTTP_400_BAD_REQUEST
            )

        report.instant_cashes = instant_cashes
        report.online_sales = online_sales
        report.online_cashes = online_cashes
        report.online_cancels = online_cancels

        report.save(
            update_fields=[
                'instant_cashes',
                'online_sales',
                'online_cashes',
                'online_cancels',
                'updated_at',
            ]
        )

        serializer = ShiftReportDetailSerializer(report)

        return Response(
            {
                'message': 'Shift report updated successfully.',
                'report': serializer.data,
            },
            status=status.HTTP_200_OK
        )
    
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
        threading.Thread(target=send_report_email, args=(report, request.user), daemon=True).start()

        serializer = DailyReportSerializer(report)
        return Response({
            'message': 'Report saved successfully.',
            'report': serializer.data
        }, status=status.HTTP_200_OK)

class EndShiftView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        preview = build_end_shift_preview(request.user)
        return Response(preview, status=status.HTTP_200_OK)

    def post(self, request):
        # keep POST also working in case frontend still calls post somewhere
        preview = build_end_shift_preview(request.user)
        return Response(preview, status=status.HTTP_200_OK)

class EndShiftSaveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            report, created = create_shift_report_snapshot(
                request.user,
                request.data
            )

        except ShiftReportValidationError as error:
            return Response(
                {
                    'error': error.message,
                    'field_errors': error.field_errors,
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        except Exception as error:
            return Response(
                {
                    'error': 'Failed to save shift report.',
                    'details': str(error),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        if created:
            threading.Thread(
                target=(
                    send_shift_report_email_safely
                ),
                args=(
                    report.id,
                    request.user.id,
                ),
                daemon=True
            ).start()

        cumulative_totals = get_shift_cumulative_totals(
            user=request.user,
            report_date=report.report_date
        )

        return Response(
            {
                'message': (
                    'Shift report saved successfully.'
                    if created
                    else 'This shift report already exists.'
                ),
                'report': {
                    'id': report.id,
                    'report_date': str(report.report_date),
                    'shiftNumber': report.shift_number,

                    # Values stored for this specific shift.
                    'instantSales': str(report.instant_sales),
                    'instantCashes': str(report.instant_cashes),
                    'onlineSales': str(report.online_sales),
                    'onlineCashes': str(report.online_cashes),
                    'onlineCancels': str(report.online_cancels),

                    # Complete cumulative totals after this shift.
                    'cumulativeTotals': {
                        'instantCashes': str(
                            cumulative_totals['instant_cashes']
                        ),
                        'onlineSales': str(
                            cumulative_totals['online_sales']
                        ),
                        'onlineCashes': str(
                            cumulative_totals['online_cashes']
                        ),
                        'onlineCancels': str(
                            cumulative_totals['online_cancels']
                        ),
                    }
                }
            },
            status=(
                status.HTTP_201_CREATED
                if created
                else status.HTTP_200_OK
            )
        )

class EndShiftManualScanView(APIView):
    permission_classes = [IsAuthenticated]

    def parse_scanned_ticket(self, barcode: str):
        barcode = str(barcode).strip()
        print(barcode)
        print(len(barcode))

        if len(barcode) < 11:
            # print(barcode)
            raise ValueError("Invalid input")
        
        if len(barcode) > 14:
            barcode=barcode[:14]
            game_id = barcode[:4]
            pack_id = barcode[4:-3]
            ticket_number = barcode[-3:]
        else:
            game_id = barcode[:4]
            pack_id = barcode[4:-4]
            ticket_number = barcode[-4:-1]

        if not pack_id or len(ticket_number) != 3:
            print(ticket_number)
            raise ValueError("Invalid input")

        return {
            "game_id": game_id,
            "pack_id": pack_id,
            "ticket_number": int(ticket_number),
        }

    def post(self, request):
        raw_barcode = str(request.data.get('raw_barcode', '')).strip()
        print(raw_barcode)

        if not raw_barcode:
            return Response({'error': 'Barcode error in input'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            parsed = self.parse_scanned_ticket(raw_barcode)
        except ValueError:
            return Response({'error': 'Parsing error in input'}, status=status.HTTP_400_BAD_REQUEST)

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
            return Response({'error': 'Invalid ticket number'}, status=status.HTTP_400_BAD_REQUEST)

        previous_current = activated_pack.current_count
        delta_count = ticket_number - previous_current

        if delta_count == 0:
            preview = build_end_shift_preview(request.user)
            return Response({
                'message': 'No change. Current number already matches scanned ticket.',
                'ticket_number': ticket_number,
                'current_count': activated_pack.current_count,
                'delta_count': 0,
                'instantSales': preview['instantSales'],
                'boxDetails': preview['boxDetails'],
            }, status=status.HTTP_200_OK)

        SoldTicket.objects.create(
            user=request.user,
            inventory_book=book,
            ticket_number=ticket_number,
            scanned_code=raw_barcode,
            delta_count=delta_count,
            is_reversal=delta_count < 0
        )

        add_to_shift_sales(
            user=request.user,
            delta_count=delta_count,
            ticket_value=book.ticket_value
        )

        activated_pack.last_ticket = previous_current
        activated_pack.current_count = ticket_number
        activated_pack.save(update_fields=['last_ticket', 'current_count', 'updated_at'])

        preview = build_end_shift_preview(request.user)

        return Response({
            'message': 'End shift scan updated successfully.',
            'ticket_number': ticket_number,
            'current_count': activated_pack.current_count,
            'last_ticket': previous_current,
            'delta_count': delta_count,
            'instantSales': preview['instantSales'],
            'boxDetails': preview['boxDetails'],
        }, status=status.HTTP_200_OK)

class TodayEndShiftStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = get_business_date()
        report = DailyReport.objects.filter(
            user=request.user,
            report_date=today
        ).count()

        return Response({
            'date': str(today),
            'is_closed': False,
            'report_id': None,
            'reports_count_today': report,
        }, status=status.HTTP_200_OK)

# class TodayReportView(APIView):
#     permission_classes = [IsAuthenticated]

#     def get(self, request):
#         today = get_business_date()
#         report = DailyReport.objects.filter(
#             user=request.user,
#             report_date=today
#         ).first()

#         if not report:
#             return Response({'error': 'Today report not found.'}, status=status.HTTP_404_NOT_FOUND)

#         serializer = DailyReportSerializer(report)
#         return Response(serializer.data, status=status.HTTP_200_OK)
class TodayReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        preview = build_end_shift_preview(request.user)
        return Response(preview, status=status.HTTP_200_OK)

class DailyReportBoxDetailListView(ManagerReportsAccessMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        access_error = self.check_manager_access(
            request
        )

        if access_error:
            return access_error
        
        details = DailyReportBoxDetail.objects.filter(
            user=request.user,
            report_id=pk
        ).order_by('box_num', 'id')

        serializer = DailyReportBoxDetailSerializer(details, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

class DailySalesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        reports = DailyReport.objects.filter(user=request.user).order_by('report_date')

        data = []
        for report in reports:
            total = report.instant_sales + report.online_sales

            data.append({
                'date': report.report_date.strftime('%b %d'),
                'report_date': report.report_date.isoformat(),
                'instant_sales': float(report.instant_sales),
                'instant_cashes': float(report.instant_cashes),
                'online_sales': float(report.online_sales),
                'online_cashes': float(report.online_cashes),
                'online_cancels': float(report.online_cancels),
                'total': float(total),
            })

        return Response(data, status=status.HTTP_200_OK)

class SalesPerformanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = get_business_date()
        default_from = today - timedelta(days=13)

        from_date = parse_date(request.query_params.get('from') or '') or default_from
        to_date = parse_date(request.query_params.get('to') or '') or today

        if from_date > to_date:
            return Response(
                {'error': 'From date must be before or equal to To date.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        sold_tickets = SoldTicket.objects.filter(
            user=request.user,
            sold_at__date__gte=from_date,
            sold_at__date__lte=to_date,
        ).select_related('inventory_book__game')

        game_totals = {}
        value_totals = {}

        for row in sold_tickets:
            book = row.inventory_book
            game = book.game
            ticket_value = Decimal(book.ticket_value)
            sold_count = Decimal(row.delta_count)
            sales_amount = sold_count * ticket_value

            game_key = game.game_id
            if game_key not in game_totals:
                game_totals[game_key] = {
                    'label': game.name or game.game_id,
                    'game_id': game.game_id,
                    'tickets_sold': 0,
                    'total_sales': Decimal('0.00'),
                }

            game_totals[game_key]['tickets_sold'] += int(row.delta_count)
            game_totals[game_key]['total_sales'] += sales_amount

            value_key = str(ticket_value)
            if value_key not in value_totals:
                value_totals[value_key] = {
                    'label': f"${ticket_value:.0f}" if float(ticket_value).is_integer() else f"${ticket_value}",
                    'ticket_value': float(ticket_value),
                    'tickets_sold': 0,
                    'total_sales': Decimal('0.00'),
                }

            value_totals[value_key]['tickets_sold'] += int(row.delta_count)
            value_totals[value_key]['total_sales'] += sales_amount

        def serialize_totals(rows):
            return sorted(
                [
                    {
                        **row,
                        'total_sales': float(row['total_sales']),
                    }
                    for row in rows.values()
                ],
                key=lambda item: item['total_sales'],
                reverse=True
            )

        return Response({
            'from': from_date.isoformat(),
            'to': to_date.isoformat(),
            'games': serialize_totals(game_totals),
            'ticket_values': serialize_totals(value_totals),
        }, status=status.HTTP_200_OK)

class DailyReportDownloadPDFView(ManagerReportsAccessMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        access_error = self.check_manager_access(
            request
        )

        if access_error:
            return access_error
        try:
            report = DailyReport.objects.get(pk=pk, user=request.user)
        except DailyReport.DoesNotExist:
            return Response({'error': 'Report not found.'}, status=status.HTTP_404_NOT_FOUND)

        details = DailyReportBoxDetail.objects.filter(
            user=request.user,
            report=report
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
    
class DirectSaleInventoryBookView(APIView):
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

        if inventory_book.is_activated:
            return Response({'error': 'Activated pack cannot be direct sold.'}, status=status.HTTP_400_BAD_REQUEST)

        # count full pack sale
        SoldTicket.objects.create(
            user=request.user,
            inventory_book=inventory_book,
            ticket_number=inventory_book.total_tickets - 1,
            delta_count=inventory_book.total_tickets,
            is_reversal=False,
            scanned_code='DIRECT_SALE'
        )

        add_to_shift_sales(
            user=request.user,
            delta_count=inventory_book.total_tickets,
            ticket_value=inventory_book.ticket_value
        )

        # mark inventory sold
        inventory_book.is_sold = True
        inventory_book.is_activated = False
        inventory_book.is_returned = False
        inventory_book.save(update_fields=['is_sold', 'is_activated', 'is_returned', 'updated_at'])

        # create report row so it shows in end shift
        DailyReportBoxDetail.objects.create(
            user=request.user,
            report_date=get_business_date(),
            box_num='Direct Sale',
            inventory_book=inventory_book,
            lottery_name=inventory_book.game.name or inventory_book.game.game_id,
            game_num=inventory_book.game.game_id,
            pack_num=inventory_book.pack_id,
            start_num=0,
            current_num=inventory_book.total_tickets,
            ticket_value=inventory_book.ticket_value,
            total_amount=Decimal(inventory_book.total_tickets) * Decimal(inventory_book.ticket_value),
            closing_status='Sold'
        )

        return Response({
            'message': 'Pack direct sold successfully.',
            'pack_id': inventory_book.pack_id,
            'total_tickets': inventory_book.total_tickets,
        }, status=status.HTTP_200_OK)
    
class PauseActivatedPackView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        # IMPORTANT:
        # Ensure the current shift exists BEFORE creating
        # the returned-ticket detail.
        shift_state = get_or_create_shift_state(
            request.user
        )

        try:
            activated_pack = (
                ActivatedPack.objects
                .select_related(
                    'inventory_book',
                    'inventory_book__game'
                )
                .get(
                    pk=pk,
                    user=request.user
                )
            )
        except ActivatedPack.DoesNotExist:
            return Response(
                {
                    'error': (
                        'Activated pack not found.'
                    )
                },
                status=status.HTTP_404_NOT_FOUND
            )

        inventory_book = (
            activated_pack.inventory_book
        )

        # Save values before deleting the ActivatedPack.
        box_num = activated_pack.box_num
        current_count = (
            activated_pack.current_count
        )
        today_start = activated_pack.today_start

        report_date = get_business_date()

        total_amount = calculate_box_total(
            today_start,
            current_count,
            inventory_book.ticket_value,
            'Returned'
        )

        # Avoid creating duplicate Returned rows if the
        # request is accidentally submitted more than once.
        returned_detail = (
            DailyReportBoxDetail.objects
            .filter(
                user=request.user,
                report_date=report_date,
                inventory_book=inventory_book,
                box_num=box_num,
                closing_status='Returned',
                report__isnull=True,
                created_at__gte=(
                    shift_state.started_at
                )
            )
            .order_by('-id')
            .first()
        )

        if returned_detail:
            returned_detail.start_num = today_start
            returned_detail.current_num = (
                current_count
            )
            returned_detail.ticket_value = (
                inventory_book.ticket_value
            )
            returned_detail.total_amount = (
                total_amount
            )

            returned_detail.save(
                update_fields=[
                    'start_num',
                    'current_num',
                    'ticket_value',
                    'total_amount',
                ]
            )
        else:
            returned_detail = (
                DailyReportBoxDetail.objects.create(
                    user=request.user,
                    report_date=report_date,
                    box_num=box_num,
                    inventory_book=inventory_book,
                    lottery_name=(
                        inventory_book.game.name
                        or
                        inventory_book.game.game_id
                    ),
                    game_num=(
                        inventory_book.game.game_id
                    ),
                    pack_num=(
                        inventory_book.pack_id
                    ),
                    start_num=today_start,
                    current_num=current_count,
                    ticket_value=(
                        inventory_book.ticket_value
                    ),
                    total_amount=total_amount,
                    closing_status='Returned'
                )
            )

        # Mark the inventory pack as returned.
        inventory_book.is_returned = True
        inventory_book.is_activated = False
        inventory_book.is_sold = True

        inventory_book.save(
            update_fields=[
                'is_returned',
                'is_activated',
                'is_sold',
                'updated_at',
            ]
        )

        # Remove it from currently active display boxes.
        activated_pack.delete()

        return Response(
            {
                'message': (
                    'Pack paused and returned '
                    'successfully.'
                ),
                'pack_id': inventory_book.pack_id,
                'current_number': current_count,
                'box_num': box_num,
                'closing_status': 'Returned',
                'report_detail_id': (
                    returned_detail.id
                ),
            },
            status=status.HTTP_200_OK
        )
    
class OwnerDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            owner = StoreOwner.objects.get(
                user=request.user
            )
        except StoreOwner.DoesNotExist:
            return Response(
                {'error': 'Not an owner account'},
                status=status.HTTP_400_BAD_REQUEST
            )

        stores = (
            Store.objects
            .filter(owner=owner)
            .select_related('user')
        )

        requested_store_id = request.query_params.get(
            'store_id'
        )

        if (
            requested_store_id
            and requested_store_id != 'all'
        ):
            stores = stores.filter(
                id=requested_store_id
            )

        store_users = [
            store.user
            for store in stores
        ]

        # --------------------------------------------------
        # COMPLETED SHIFT SALES FOR ALL SELECTED STORES
        # --------------------------------------------------
        completed_sales_by_user = {
            row['user_id']: (
                row['instant_sales_total']
                or Decimal('0.00')
            )
            for row in (
                ShiftReport.objects
                .filter(user__in=store_users)
                .values('user_id')
                .annotate(
                    instant_sales_total=Sum(
                        'instant_sales'
                    )
                )
            )
        }

        # --------------------------------------------------
        # CURRENT OPEN SHIFT SALES
        # --------------------------------------------------
        current_sales_by_user = {
            row['user_id']: (
                row['instant_sales']
                or Decimal('0.00')
            )
            for row in (
                ShiftState.objects
                .filter(user__in=store_users)
                .values(
                    'user_id',
                    'instant_sales'
                )
            )
        }

        # --------------------------------------------------
        # TOTAL GROSS SALES ACROSS ALL SELECTED STORES
        # --------------------------------------------------
        total_sales = Decimal('0.00')

        for store_user in store_users:
            completed_sales = (
                completed_sales_by_user.get(
                    store_user.id,
                    Decimal('0.00')
                )
            )

            current_shift_sales = (
                current_sales_by_user.get(
                    store_user.id,
                    Decimal('0.00')
                )
            )

            total_sales += (
                completed_sales
                + current_shift_sales
            )

        # --------------------------------------------------
        # ACTIVE AND INACTIVE PACKS
        # --------------------------------------------------
        active_boxes = ActivatedPack.objects.filter(
            user__in=store_users
        ).count()

        inactive_packs = InventoryBook.objects.filter(
            user__in=store_users,
            is_activated=False,
            is_sold=False
        ).count()

        # --------------------------------------------------
        # DAILY SALES GRAPH
        #
        # Completed shifts are grouped by report date.
        # Current shift sales are added to today's date.
        # --------------------------------------------------
        daily_sales_rows = (
            ShiftReport.objects
            .filter(user__in=store_users)
            .values('report_date')
            .annotate(
                instant_sales_total=Sum(
                    'instant_sales'
                )
            )
            .order_by('report_date')
        )

        daily_data = {
            row['report_date'].isoformat(): float(
                row['instant_sales_total']
                or Decimal('0.00')
            )
            for row in daily_sales_rows
        }

        today = get_business_date()
        today_key = today.isoformat()

        current_open_sales_total = sum(
            current_sales_by_user.values(),
            Decimal('0.00')
        )

        if current_open_sales_total:
            daily_data[today_key] = (
                daily_data.get(today_key, 0)
                + float(current_open_sales_total)
            )

        daily_sales = [
            {
                'date': report_date,
                'total': total,
            }
            for report_date, total in sorted(
                daily_data.items()
            )
        ]

        # --------------------------------------------------
        # STORE-WISE DETAILS
        # --------------------------------------------------
        store_wise = []

        for store in stores:
            store_user = store.user

            completed_sales = (
                completed_sales_by_user.get(
                    store_user.id,
                    Decimal('0.00')
                )
            )

            current_shift_sales = (
                current_sales_by_user.get(
                    store_user.id,
                    Decimal('0.00')
                )
            )

            store_total_sales = (
                completed_sales
                + current_shift_sales
            )

            activated_packs = (
                ActivatedPack.objects
                .filter(user=store_user)
                .select_related(
                    'inventory_book__game'
                )
                .order_by('box_num')
            )

            # Completed daily shift totals for this store.
            store_daily_rows = (
                ShiftReport.objects
                .filter(user=store_user)
                .values('report_date')
                .annotate(
                    instant_sales_total=Sum(
                        'instant_sales'
                    )
                )
                .order_by('report_date')
            )

            store_daily_data = {
                row['report_date'].isoformat(): float(
                    row['instant_sales_total']
                    or Decimal('0.00')
                )
                for row in store_daily_rows
            }

            # Add current unfinished shift to today.
            if current_shift_sales:
                store_daily_data[today_key] = (
                    store_daily_data.get(
                        today_key,
                        0
                    )
                    + float(current_shift_sales)
                )

            store_daily_sales = [
                {
                    'date': report_date,
                    'total': total,
                }
                for report_date, total in sorted(
                    store_daily_data.items()
                )
            ]

            store_wise.append({
                'store_id': store.id,
                'store_name': store.name,
                'store_user': (
                    store_user.first_name
                    or store_user.username
                ),
                'store_email': store_user.email,

                # Completed + currently open shift
                'total_sales': float(
                    store_total_sales
                ),

                # Optional debugging/display values
                'completed_shift_sales': float(
                    completed_sales
                ),
                'current_shift_sales': float(
                    current_shift_sales
                ),

                'daily_sales': store_daily_sales,
                'active_boxes': (
                    activated_packs.count()
                ),
                'inactive_packs': (
                    InventoryBook.objects.filter(
                        user=store_user,
                        is_activated=False,
                        is_sold=False
                    ).count()
                ),
                'activated_packs': (
                    ActivatedPackSerializer(
                        activated_packs,
                        many=True,
                        context={'request': request}
                    ).data
                ),
            })

        return Response({
            'owner_name': (
                owner.name
                or request.user.first_name
                or request.user.username
            ),
            'total_sales': float(total_sales),
            'total_stores': stores.count(),
            'active_boxes': active_boxes,
            'inactive_packs': inactive_packs,
            'daily_sales': daily_sales,
            'store_wise': store_wise,
        })

class ShiftReportListView(ManagerReportsAccessMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        access_error = self.check_manager_access(
            request
        )

        if access_error:
            return access_error
        reports = ShiftReport.objects.filter(
            user=request.user
        ).order_by(
            '-report_date',
            '-shift_number'
        )

        data = []

        for report in reports:
            data.append({
                'id': report.id,
                'reportType': 'Shift',
                'report_date': report.report_date,
                'shiftNumber': report.shift_number,
                'instantSales': str(report.instant_sales),
                'instantCashes': str(report.instant_cashes),
                'onlineSales': str(report.online_sales),
                'onlineCashes': str(report.online_cashes),
                'onlineCancels': str(report.online_cancels),
                'createdAt': report.created_at,
            })

        return Response(data, status=status.HTTP_200_OK)

class ShiftReportDownloadPDFView(ManagerReportsAccessMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        target_user, access_error = (
            self.get_reports_access(request)
        )

        if access_error:
            return access_error

        try:
            report = ShiftReport.objects.get(
                pk=pk,
                user=target_user
            )
        except ShiftReport.DoesNotExist:
            return Response(
                {'error': 'Shift report not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        pdf_bytes = build_shift_report_pdf_bytes(
            report,
            target_user
        )

        buffer = BytesIO(pdf_bytes)

        filename = (
            f"shift_report_"
            f"{report.report_date}_"
            f"shift_{report.shift_number}.pdf"
        )

        return FileResponse(
            buffer,
            as_attachment=True,
            filename=filename
        )

class VerifyManagerPinView(APIView):
    permission_classes = [IsAuthenticated]

    ALLOWED_SCOPES = {
        'reports',
        'activation',
    }

    def post(self, request):
        pin = str(
            request.data.get('pin', '')
        ).strip()

        scope = str(
            request.data.get('scope', '')
        ).strip().lower()

        if scope not in self.ALLOWED_SCOPES:
            return Response(
                {'error': 'Invalid authorization scope.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not pin.isdigit() or len(pin) != 8:
            return Response(
                {
                    'error': (
                        'Manager PIN must contain '
                        'exactly 8 digits.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        store = get_user_store(request.user)

        if not store:
            return Response(
                {
                    'error': (
                        'No store is associated '
                        'with this user account.'
                    )
                },
                status=status.HTTP_404_NOT_FOUND
            )

        if not store.has_manager_pin:
            return Response(
                {
                    'error': (
                        'A managerial PIN has not been '
                        'configured for this store.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if not store.check_manager_pin(pin):
            return Response(
                {'error': 'Incorrect managerial PIN.'},
                status=status.HTTP_403_FORBIDDEN
            )

        token = create_manager_access_token(
            user=request.user,
            store=store,
            scope=scope
        )

        return Response(
            {
                'message': 'Manager PIN verified.',
                'accessToken': token,
                'scope': scope,
                'expiresIn': (
                    MANAGER_ACCESS_TIMEOUT_SECONDS
                ),
                'store': {
                    'id': store.id,
                    'name': store.name,
                },
            },
            status=status.HTTP_200_OK
        )

class OwnerSetStoreManagerPinView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, store_id):
        try:
            owner = StoreOwner.objects.get(
                user=request.user
            )
        except StoreOwner.DoesNotExist:
            return Response(
                {
                    'error': (
                        'Only a store owner can '
                        'change the managerial PIN.'
                    )
                },
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            store = Store.objects.get(
                id=store_id,
                owner=owner
            )
        except Store.DoesNotExist:
            return Response(
                {'error': 'Store not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        pin = str(
            request.data.get('pin', '')
        ).strip()

        confirm_pin = str(
            request.data.get('confirmPin', '')
        ).strip()

        if not pin.isdigit() or len(pin) != 8:
            return Response(
                {
                    'error': (
                        'Manager PIN must contain '
                        'exactly 8 digits.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if pin != confirm_pin:
            return Response(
                {
                    'error': (
                        'PIN and confirmation PIN '
                        'do not match.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        store.set_manager_pin(pin)

        store.save(
            update_fields=['manager_pin_hash']
        )

        return Response(
            {
                'message': (
                    f'Managerial PIN updated for '
                    f'{store.name}.'
                ),
                'storeId': store.id,
                'storeName': store.name,
            },
            status=status.HTTP_200_OK
        )