from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    dependencies = [("leads", "0003_backfill_created_by_email")]
    operations = [
        migrations.CreateModel(
            name="DeletedDataRecovery",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("kind", models.CharField(choices=[("user", "User"), ("user_data", "User data"), ("all_data", "All data")], max_length=20)),
                ("label", models.CharField(max_length=255)),
                ("user_email", models.EmailField(blank=True, default="", max_length=254)),
                ("deleted_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField(db_index=True)),
                ("payload", models.JSONField()),
            ],
            options={"ordering": ["-deleted_at"]},
        )
    ]
