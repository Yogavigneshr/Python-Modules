from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("leads", "0007_activitylog"),
    ]

    operations = [
        migrations.AddField(
            model_name="lead",
            name="assigned_to",
            field=models.ForeignKey(
                blank=True,
                db_index=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="assigned_leads",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
