from django.db import migrations


def backfill_created_by_email(apps, schema_editor):
    Search = apps.get_model("leads", "Search")
    Lead = apps.get_model("leads", "Lead")

    for search in Search.objects.select_related("user").filter(created_by_email=""):
        search.created_by_email = search.user.email
        search.save(update_fields=["created_by_email"])

    for lead in Lead.objects.select_related("search__user").filter(created_by_email=""):
        lead.created_by_email = lead.search.user.email
        lead.save(update_fields=["created_by_email"])


def noop_reverse(apps, schema_editor):
    # Nothing to undo - created_by_email simply goes back to blank via the
    # AddField reversal in the previous migration.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("leads", "0002_username_and_split_timestamp_columns"),
    ]

    operations = [
        migrations.RunPython(backfill_created_by_email, noop_reverse),
    ]
