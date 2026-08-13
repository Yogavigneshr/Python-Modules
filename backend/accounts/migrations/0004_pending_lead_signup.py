from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_user_role"),
    ]

    operations = [
        migrations.CreateModel(
            name="PendingLeadSignup",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")], default="pending", max_length=20)),
                ("user", models.OneToOneField(on_delete=models.CASCADE, related_name="lead_signup", to="accounts.user")),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
