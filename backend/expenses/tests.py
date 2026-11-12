from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Category, Expense

User = get_user_model()


class AuthTests(APITestCase):
    def test_register_returns_token(self):
        res = self.client.post('/api/auth/register/', {
            'username': 'alice', 'email': 'a@example.com', 'password': 'Str0ngPass!23',
        })
        self.assertEqual(res.status_code, 201)
        self.assertIn('token', res.data)

    def test_login_returns_token(self):
        User.objects.create_user('bob', password='Str0ngPass!23')
        res = self.client.post('/api/auth/login/', {'username': 'bob', 'password': 'Str0ngPass!23'})
        self.assertEqual(res.status_code, 200)
        self.assertIn('token', res.data)

    def test_endpoints_require_auth(self):
        self.assertEqual(self.client.get('/api/expenses/').status_code, 401)


class ExpenseTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('alice', password='pass')
        self.other = User.objects.create_user('eve', password='pass')
        self.client.force_authenticate(self.user)
        self.food = Category.objects.create(user=self.user, name='Food', monthly_budget=Decimal('100'))

    def test_create_and_list_expense(self):
        res = self.client.post('/api/expenses/', {
            'title': 'Lunch', 'amount': '12.50', 'category': self.food.id, 'payment_method': 'upi',
        })
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['category_name'], 'Food')

        res = self.client.get('/api/expenses/')
        self.assertEqual(res.data['count'], 1)

    def test_users_only_see_their_own_data(self):
        Expense.objects.create(user=self.other, title='Secret', amount=5)
        self.assertEqual(self.client.get('/api/expenses/').data['count'], 0)

    def test_cannot_use_another_users_category(self):
        theirs = Category.objects.create(user=self.other, name='Theirs')
        res = self.client.post('/api/expenses/', {'title': 'x', 'amount': '1', 'category': theirs.id})
        self.assertEqual(res.status_code, 400)

    def test_rejects_non_positive_amount(self):
        res = self.client.post('/api/expenses/', {'title': 'x', 'amount': '0'})
        self.assertEqual(res.status_code, 400)

    def test_filter_by_date_range(self):
        Expense.objects.create(user=self.user, title='Old', amount=1, date=date(2025, 1, 5))
        Expense.objects.create(user=self.user, title='New', amount=1, date=date(2025, 2, 5))
        res = self.client.get('/api/expenses/?month=2025-02')
        self.assertEqual([e['title'] for e in res.data['results']], ['New'])

    def test_summary_with_budget(self):
        today = date.today()
        Expense.objects.create(user=self.user, title='A', amount=70, category=self.food, date=today)
        Expense.objects.create(user=self.user, title='B', amount=40, category=self.food, date=today)
        Expense.objects.create(user=self.user, title='C', amount=10, date=today)

        res = self.client.get('/api/expenses/summary/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Decimal(res.data['total']), Decimal('120'))
        food = next(c for c in res.data['by_category'] if c['category'] == 'Food')
        self.assertTrue(food['over_budget'])
        self.assertEqual(food['remaining_budget'], Decimal('-10'))

    def test_today(self):
        Expense.objects.create(user=self.user, title='Tea', amount=2)
        res = self.client.get('/api/expenses/today/')
        self.assertEqual(Decimal(res.data['total']), Decimal('2'))
        self.assertEqual(len(res.data['expenses']), 1)

    def test_duplicate_category_name_rejected(self):
        res = self.client.post('/api/categories/', {'name': 'food'})
        self.assertEqual(res.status_code, 400)


class OrderingTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('alice', password='pass')
        self.client.force_authenticate(self.user)
        Expense.objects.create(user=self.user, title='Mid', amount=20, date=date(2025, 3, 2))
        Expense.objects.create(user=self.user, title='Big', amount=90, date=date(2025, 3, 1))
        Expense.objects.create(user=self.user, title='Small', amount=5, date=date(2025, 3, 3))

    def titles(self, query):
        return [e['title'] for e in self.client.get(f'/api/expenses/{query}').data['results']]

    def test_default_is_newest_first(self):
        self.assertEqual(self.titles(''), ['Small', 'Mid', 'Big'])

    def test_order_by_amount(self):
        self.assertEqual(self.titles('?ordering=-amount'), ['Big', 'Mid', 'Small'])
        self.assertEqual(self.titles('?ordering=amount'), ['Small', 'Mid', 'Big'])

    def test_order_by_date_ascending(self):
        self.assertEqual(self.titles('?ordering=date'), ['Big', 'Mid', 'Small'])

    def test_rejects_unknown_ordering(self):
        self.assertEqual(self.client.get('/api/expenses/?ordering=user__password').status_code, 400)


class SummaryByDayTests(APITestCase):
    def test_by_day_groups_and_sorts_by_date(self):
        user = User.objects.create_user('alice', password='pass')
        self.client.force_authenticate(user)
        Expense.objects.create(user=user, title='A', amount=10, date=date(2025, 4, 10))
        Expense.objects.create(user=user, title='B', amount=5, date=date(2025, 4, 10))
        Expense.objects.create(user=user, title='C', amount=7, date=date(2025, 4, 2))

        res = self.client.get('/api/expenses/summary/?month=2025-04')
        days = [(str(d['date']), Decimal(d['total'])) for d in res.data['by_day']]
        self.assertEqual(days, [('2025-04-02', Decimal('7')), ('2025-04-10', Decimal('15'))])


class TrendTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('alice', password='pass')
        self.other = User.objects.create_user('eve', password='pass')
        self.client.force_authenticate(self.user)

    def test_returns_requested_months_oldest_first_with_zero_fill(self):
        today = date.today()
        Expense.objects.create(user=self.user, title='Now', amount=30, date=today)
        Expense.objects.create(user=self.user, title='Now2', amount=20, date=today)

        res = self.client.get('/api/expenses/trend/?months=3')
        self.assertEqual(res.status_code, 200)
        months = res.data['months']
        self.assertEqual(len(months), 3)
        self.assertEqual(months[-1]['month'], today.strftime('%Y-%m'))
        self.assertEqual(Decimal(months[-1]['total']), Decimal('50'))
        self.assertEqual(months[-1]['count'], 2)
        self.assertEqual(months[0]['total'], 0)  # nothing two months ago
        self.assertEqual([m['month'] for m in months], sorted(m['month'] for m in months))

    def test_crosses_year_boundary(self):
        from unittest.mock import patch

        with patch('expenses.views.date') as fake:
            fake.today.return_value = date(2026, 2, 15)
            fake.side_effect = lambda *a, **k: date(*a, **k)
            res = self.client.get('/api/expenses/trend/?months=4')
        self.assertEqual(
            [m['month'] for m in res.data['months']],
            ['2025-11', '2025-12', '2026-01', '2026-02'],
        )

    def test_ignores_other_users_data(self):
        Expense.objects.create(user=self.other, title='Secret', amount=999, date=date.today())
        res = self.client.get('/api/expenses/trend/')
        self.assertEqual(len(res.data['months']), 6)
        self.assertTrue(all(m['total'] == 0 for m in res.data['months']))

    def test_rejects_bad_months(self):
        for bad in ('0', '25', 'abc'):
            res = self.client.get(f'/api/expenses/trend/?months={bad}')
            self.assertEqual(res.status_code, 400, bad)


class ExportTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('alice', password='pass')
        self.other = User.objects.create_user('eve', password='pass')
        self.client.force_authenticate(self.user)
        self.food = Category.objects.create(user=self.user, name='Food')

    def body(self, query=''):
        res = self.client.get(f'/api/expenses/export/{query}')
        self.assertEqual(res.status_code, 200)
        self.assertIn('text/csv', res['Content-Type'])
        self.assertIn('attachment', res['Content-Disposition'])
        return res.content.decode('utf-8-sig').splitlines()

    def test_exports_rows_with_header(self):
        Expense.objects.create(
            user=self.user, title='Lunch', amount='12.50', category=self.food,
            payment_method='upi', date=date(2025, 5, 1), notes='with team',
        )
        lines = self.body()
        self.assertEqual(lines[0], 'Date,Title,Amount,Category,Payment method,Notes')
        self.assertEqual(lines[1], '2025-05-01,Lunch,12.50,Food,UPI,with team')

    def test_respects_filters(self):
        Expense.objects.create(user=self.user, title='May', amount=1, date=date(2025, 5, 1))
        Expense.objects.create(user=self.user, title='June', amount=1, date=date(2025, 6, 1))
        lines = self.body('?month=2025-06')
        self.assertEqual(len(lines), 2)
        self.assertIn('June', lines[1])

    def test_only_own_expenses(self):
        Expense.objects.create(user=self.other, title='Secret', amount=1)
        self.assertEqual(len(self.body()), 1)  # header only

    def test_formula_cells_are_neutralised(self):
        Expense.objects.create(user=self.user, title='=HYPERLINK("http://evil")', amount=1)
        self.assertIn("'=HYPERLINK", self.body()[1])

    def test_requires_auth(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/expenses/export/').status_code, 401)
