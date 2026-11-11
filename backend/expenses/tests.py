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
