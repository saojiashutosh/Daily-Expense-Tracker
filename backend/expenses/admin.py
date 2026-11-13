from django.contrib import admin

from .models import Category, Expense, RecurringExpense


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'user', 'monthly_budget']
    list_filter = ['user']
    search_fields = ['name']


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ['title', 'amount', 'date', 'category', 'payment_method', 'user']
    list_filter = ['payment_method', 'category', 'date', 'user']
    search_fields = ['title', 'notes']
    date_hierarchy = 'date'


@admin.register(RecurringExpense)
class RecurringExpenseAdmin(admin.ModelAdmin):
    list_display = ['title', 'amount', 'frequency', 'next_due', 'is_active', 'user']
    list_filter = ['frequency', 'is_active', 'user']
    search_fields = ['title', 'notes']
