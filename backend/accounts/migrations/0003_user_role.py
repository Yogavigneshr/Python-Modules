from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_user_full_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[("user", "User"), ("lead", "Lead"), ("admin", "Admin")],
                db_index=True,
                default="user",
                max_length=20,
            ),
        ),
    ]
