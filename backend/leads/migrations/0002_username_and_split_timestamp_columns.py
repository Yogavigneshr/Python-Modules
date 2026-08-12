import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("leads", "0001_initial"),
    ]

    operations = [
        # Denormalized "who searched this" column on both tables, so the
        # user's email is visible directly on each row (exports, admin,
        # raw SQL) without joining back through Search -> User.
        migrations.AddField(
            model_name="search",
            name="created_by_email",
            field=models.EmailField(blank=True, db_index=True, default="", max_length=254),
        ),
        migrations.AddField(
            model_name="lead",
            name="created_by_email",
            field=models.EmailField(blank=True, db_index=True, default="", max_length=254),
        ),
        # Split-out date/time columns on Lead, populated at the same
        # instant as created_at, so date and time can be queried,
        # displayed, and exported independently of the combined datetime.
        migrations.AddField(
            model_name="lead",
            name="created_date",
            field=models.DateField(auto_now_add=True, db_index=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="lead",
            name="created_time",
            field=models.TimeField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
    ]
