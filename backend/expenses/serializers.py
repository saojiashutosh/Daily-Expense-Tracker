from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Category, Expense, RecurringExpense
from .recurring import first_due_on_or_after

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password']

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'monthly_budget']

    def validate_name(self, value):
        user = self.context['request'].user
        qs = Category.objects.filter(user=user, name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('You already have a category with this name.')
        return value


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Expense
        fields = [
            'id', 'title', 'amount', 'date', 'category', 'category_name',
            'payment_method', 'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Only allow picking categories that belong to the current user.
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            self.fields['category'].queryset = Category.objects.filter(user=request.user)


class RecurringExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = RecurringExpense
        fields = [
            'id', 'title', 'amount', 'category', 'category_name', 'payment_method', 'notes',
            'frequency', 'start_date', 'next_due', 'is_active', 'created_at',
        ]
        read_only_fields = ['next_due', 'created_at']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # DRF treats a missing boolean in form-encoded input (e.g. curl -d) as False, which would
        # silently create paused rules. Treat "not sent" as "use the default" like JSON does.
        self.fields['is_active'].default_empty_html = serializers.empty
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            self.fields['category'].queryset = Category.objects.filter(user=request.user)

    def validate(self, attrs):
        # next_due is derived from start_date, so moving the start would corrupt the schedule.
        if self.instance and attrs.get('start_date', self.instance.start_date) != self.instance.start_date:
            raise serializers.ValidationError(
                {'start_date': "Start date can't be changed. Delete this and create a new one instead."}
            )
        return attrs

    def update(self, instance, validated_data):
        was_active = instance.is_active
        instance = super().update(instance, validated_data)
        # Resuming a paused rule shouldn't back-fill everything missed while it was paused.
        if instance.is_active and not was_active:
            due = first_due_on_or_after(instance, date.today())
            if due != instance.next_due:
                instance.next_due = due
                instance.save(update_fields=['next_due'])
        return instance
