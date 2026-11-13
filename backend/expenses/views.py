import csv
from datetime import date

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.http import HttpResponse
from rest_framework import generics, permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, Expense, RecurringExpense
from .recurring import process_due
from .serializers import (
    CategorySerializer,
    ExpenseSerializer,
    RecurringExpenseSerializer,
    RegisterSerializer,
)


# ---------- Auth ----------

class RegisterView(generics.CreateAPIView):
    """POST username/email/password -> creates the user and returns an auth token."""

    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {'user': serializer.data, 'token': token.key}, status=status.HTTP_201_CREATED
        )


class LogoutView(APIView):
    """POST -> deletes the caller's token."""

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------- Categories ----------

class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# ---------- Expenses ----------

def _parse_date(value, param):
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValidationError({param: 'Use YYYY-MM-DD format.'})


def _parse_month(value):
    """'2026-11' -> (date(2026, 11, 1), date(2026, 12, 1))"""
    try:
        year, month = (int(p) for p in value.split('-'))
        start = date(year, month, 1)
    except (ValueError, TypeError):
        raise ValidationError({'month': 'Use YYYY-MM format.'})
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return start, end


ORDERING_FIELDS = {'date', '-date', 'amount', '-amount'}

CSV_HEADER = ['Date', 'Title', 'Amount', 'Category', 'Payment method', 'Notes']


def _csv_safe(value):
    """Stop spreadsheet apps from running user text as a formula (CSV injection)."""
    value = str(value)
    return "'" + value if value[:1] in ('=', '+', '-', '@', '\t', '\r') else value


class ExpenseViewSet(viewsets.ModelViewSet):
    """
    CRUD for expenses. Optional query params on list:
      ?start_date=YYYY-MM-DD  ?end_date=YYYY-MM-DD  ?month=YYYY-MM
      ?category=<id>  ?payment_method=cash|card|upi|net_banking|other
      ?search=<text>  (matches title or notes)
      ?ordering=date|-date|amount|-amount  (default: newest first)
    """

    serializer_class = ExpenseSerializer

    def get_queryset(self):
        qs = Expense.objects.filter(user=self.request.user).select_related('category')
        params = self.request.query_params

        if month := params.get('month'):
            start, end = _parse_month(month)
            qs = qs.filter(date__gte=start, date__lt=end)
        if start_date := params.get('start_date'):
            qs = qs.filter(date__gte=_parse_date(start_date, 'start_date'))
        if end_date := params.get('end_date'):
            qs = qs.filter(date__lte=_parse_date(end_date, 'end_date'))
        if category := params.get('category'):
            qs = qs.filter(category_id=category)
        if payment_method := params.get('payment_method'):
            qs = qs.filter(payment_method=payment_method)
        if search := params.get('search'):
            qs = qs.filter(Q(title__icontains=search) | Q(notes__icontains=search))
        if ordering := params.get('ordering'):
            if ordering not in ORDERING_FIELDS:
                raise ValidationError({'ordering': f"Use one of: {', '.join(sorted(ORDERING_FIELDS))}."})
            qs = qs.order_by(ordering, '-date', '-created_at')
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Spending totals. Defaults to the current month; accepts the same filters as list.
        Includes per-category totals and budget usage.
        """
        params = request.query_params
        has_range = any(p in params for p in ('month', 'start_date', 'end_date'))
        qs = self.get_queryset()
        if not has_range:
            start, end = _parse_month(date.today().strftime('%Y-%m'))
            qs = qs.filter(date__gte=start, date__lt=end)

        totals = qs.aggregate(total=Sum('amount'), count=Count('id'))

        by_category = []
        for row in (
            qs.values('category__id', 'category__name', 'category__monthly_budget')
            .annotate(total=Sum('amount'), count=Count('id'))
            .order_by('-total')
        ):
            budget = row['category__monthly_budget']
            by_category.append({
                'category_id': row['category__id'],
                'category': row['category__name'] or 'Uncategorized',
                'total': row['total'],
                'count': row['count'],
                'monthly_budget': budget,
                'remaining_budget': (budget - row['total']) if budget is not None else None,
                'over_budget': budget is not None and row['total'] > budget,
            })

        by_payment_method = list(
            qs.values('payment_method')
            .annotate(total=Sum('amount'), count=Count('id'))
            .order_by('-total')
        )

        by_day = list(
            qs.values('date').annotate(total=Sum('amount')).order_by('date')
        )

        return Response({
            'total': totals['total'] or 0,
            'count': totals['count'],
            'by_category': by_category,
            'by_payment_method': by_payment_method,
            'by_day': by_day,
        })

    @action(detail=False, methods=['get'])
    def trend(self, request):
        """
        Monthly totals for the last N months (?months=1..24, default 6), oldest first,
        ending with the current month. Months with no spending are included as zero.
        """
        raw = request.query_params.get('months', '6')
        try:
            months = int(raw)
        except ValueError:
            months = 0
        if not 1 <= months <= 24:
            raise ValidationError({'months': 'Use a whole number from 1 to 24.'})

        today = date.today()
        index = today.year * 12 + today.month - 1  # months since year 0
        keys = []
        for i in range(months - 1, -1, -1):
            year, month0 = divmod(index - i, 12)
            keys.append(f'{year:04d}-{month0 + 1:02d}')

        first = date(int(keys[0][:4]), int(keys[0][5:]), 1)
        rows = (
            Expense.objects.filter(user=request.user, date__gte=first)
            .annotate(month=TruncMonth('date'))
            .values('month')
            .annotate(total=Sum('amount'), count=Count('id'))
            .order_by()
        )
        found = {r['month'].strftime('%Y-%m'): r for r in rows}

        return Response({
            'months': [
                {
                    'month': key,
                    'total': found[key]['total'] if key in found else 0,
                    'count': found[key]['count'] if key in found else 0,
                }
                for key in keys
            ]
        })

    @action(detail=False, methods=['get'])
    def export(self, request):
        """Download the (filtered) expenses as CSV. Accepts the same filters as list."""
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="expenses.csv"'
        response.write('﻿')  # BOM so Excel reads the file as UTF-8
        writer = csv.writer(response)
        writer.writerow(CSV_HEADER)
        for e in self.get_queryset():
            writer.writerow([
                e.date.isoformat(),
                _csv_safe(e.title),
                e.amount,
                _csv_safe(e.category.name) if e.category else '',
                e.get_payment_method_display(),
                _csv_safe(e.notes),
            ])
        return response

    @action(detail=False, methods=['get'])
    def today(self, request):
        """All of today's expenses plus the day's total."""
        qs = self.get_queryset().filter(date=date.today())
        return Response({
            'date': date.today(),
            'total': qs.aggregate(total=Sum('amount'))['total'] or 0,
            'expenses': self.get_serializer(qs, many=True).data,
        })


# ---------- Recurring expenses ----------

class RecurringExpenseViewSet(viewsets.ModelViewSet):
    """
    CRUD for recurring expense rules. POST /recurring/process/ turns every due occurrence
    into a real expense (idempotent; safe to call as often as you like).
    """

    serializer_class = RecurringExpenseSerializer

    def get_queryset(self):
        return RecurringExpense.objects.filter(user=self.request.user).select_related('category')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['post'])
    def process(self, request):
        return Response({'created': process_due(request.user)})
