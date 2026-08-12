# Generated manually to add separate date/time columns for Lead.created_at

import django.utils.timezone
from django.db import migrations, models


def backfill_date_time(apps, schema_editor):
    """Populate created_date/created_time for rows that already exist,
    deriving them from the existing created_at timestamp."""
    Lead = apps.get_model("leads", "Lead")
    for lead in Lead.objects.all().iterator():
        local_dt = django.utils.timezone.localtime(lead.created_at)
        Lead.objects.filter(pk=lead.pk).update(
            created_date=local_dt.date(),
            created_time=local_dt.time(),
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("leads", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="lead",
            name="created_date",
            field=models.DateField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="lead",
            name="created_time",
            field=models.TimeField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.RunPython(backfill_date_time, noop_reverse),
    ]
