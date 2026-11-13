"""Scheduling logic for recurring expenses. No cron needed: due items are turned into
real expenses whenever `process_due` runs (the frontend calls it when the app opens)."""

from calendar import monthrange
from datetime import date, timedelta

from django.db import transaction

from .models import Expense, RecurringExpense

# Safety valve so a rule starting decades ago can't create thousands of rows in one request.
# Anything left over is picked up by the next run.
MAX_CATCH_UP = 366


def add_months(d: date, months: int) -> date:
    """d shifted by `months`, clamping the day (Jan 31 + 1 month -> Feb 28/29)."""
    year, month0 = divmod(d.year * 12 + d.month - 1 + months, 12)
    month = month0 + 1
    return date(year, month, min(d.day, monthrange(year, month)[1]))


def next_occurrence(start: date, current: date, frequency: str) -> date:
    """
    The occurrence after `current`. Monthly/yearly dates are always computed from `start`
    (not from `current`) so clamping never drifts: a rule starting Jan 31 goes
    Jan 31 -> Feb 28 -> Mar 31, not Jan 31 -> Feb 28 -> Mar 28.
    """
    if frequency == RecurringExpense.Frequency.WEEKLY:
        return current + timedelta(days=7)
    step = 12 if frequency == RecurringExpense.Frequency.YEARLY else 1
    months_since_start = (current.year - start.year) * 12 + current.month - start.month
    return add_months(start, months_since_start + step)


def first_due_on_or_after(rec: RecurringExpense, today: date) -> date:
    """Skip occurrences that fell in the past (used when a paused rule is resumed)."""
    due = rec.next_due
    while due < today:
        due = next_occurrence(rec.start_date, due, rec.frequency)
    return due


@transaction.atomic
def process_due(user, today: date | None = None) -> int:
    """Create an expense for every due occurrence of the user's active rules. Returns how many."""
    today = today or date.today()
    created = 0
    # select_for_update stops two simultaneous requests from both creating the same expenses.
    due_rules = RecurringExpense.objects.select_for_update().filter(
        user=user, is_active=True, next_due__lte=today
    )
    for rec in due_rules:
        new_expenses = []
        while rec.next_due <= today and len(new_expenses) < MAX_CATCH_UP:
            new_expenses.append(Expense(
                user=user,
                category=rec.category,
                title=rec.title,
                amount=rec.amount,
                date=rec.next_due,
                payment_method=rec.payment_method,
                notes=rec.notes,
            ))
            rec.next_due = next_occurrence(rec.start_date, rec.next_due, rec.frequency)
        Expense.objects.bulk_create(new_expenses)
        rec.save(update_fields=['next_due'])
        created += len(new_expenses)
    return created
