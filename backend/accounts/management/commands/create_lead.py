from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

User = get_user_model()


class Command(BaseCommand):
    help = "Create a Lead account. Existing account roles are never changed from the admin UI."

    def add_arguments(self, parser):
        parser.add_argument("email")
        parser.add_argument("--name", required=True, dest="full_name")
        parser.add_argument("--password", required=True)

    def handle(self, *args, **options):
        email = User.objects.normalize_email(options["email"])
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError("An account with this email already exists. Existing roles are not modified.")

        try:
            validate_password(options["password"])
        except Exception as exc:
            raise CommandError(" ".join(str(error) for error in exc.messages))

        user = User.objects.create_user(
            email=email,
            password=options["password"],
            full_name=options["full_name"],
            role=User.Role.LEAD,
            is_staff=True,
        )
        self.stdout.write(self.style.SUCCESS(f"Lead account created: {user.email}"))
