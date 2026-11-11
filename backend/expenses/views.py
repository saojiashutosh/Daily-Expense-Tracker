from datetime import date

from django.db.models import Count, Q, Sum
from rest_framework import generics, permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, Expense
from .serializers import CategorySerializer, ExpenseSerializer, RegisterSerializer


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


class ExpenseViewSet(viewsets.ModelViewSet):
    """
    CRUD for expenses. Optional query params on list:
      ?start_date=YYYY-MM-DD  ?end_date=YYYY-MM-DD  ?month=YYYY-MM
      ?category=<id>  ?payment_method=cash|card|upi|net_banking|other
      ?search=<text>  (matches title or notes)
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

        return Response({
            'total': totals['total'] or 0,
            'count': totals['count'],
            'by_category': by_category,
            'by_payment_method': by_payment_method,
        })

    @action(detail=False, methods=['get'])
    def today(self, request):
        """All of today's expenses plus the day's total."""
        qs = self.get_queryset().filter(date=date.today())
        return Response({
            'date': date.today(),
            'total': qs.aggregate(total=Sum('amount'))['total'] or 0,
            'expenses': self.get_serializer(qs, many=True).data,
        })
