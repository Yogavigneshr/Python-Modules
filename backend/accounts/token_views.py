from rest_framework.exceptions import AuthenticationFailed
from django.contrib.auth import get_user_model

User = get_user_model()
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import UserSerializer
from leads.audit import log_activity


class RoleTokenObtainPairSerializer(TokenObtainPairSerializer):
    expected_role = None

    def validate(self, attrs):
        email = attrs.get("email", "")
        if self.expected_role == "lead":
            pending = User.objects.filter(email__iexact=email, role="lead", is_active=False).first()
            if pending is not None:
                raise AuthenticationFailed("Your Lead account is awaiting admin verification.")
        data = super().validate(attrs)
        user = self.user
        actual_role = "admin" if user.is_superuser else getattr(user, "role", "user")

        if self.expected_role == "admin" and not user.is_superuser:
            raise AuthenticationFailed("This account cannot use the Admin login. Select the correct login type.")
        if actual_role != self.expected_role:
            role_name = self.expected_role.capitalize()
            raise AuthenticationFailed(
                f"This account cannot use the {role_name} login. Select the correct login type."
            )

        # Admin identity/value is intentionally never written to the activity log.
        if not user.is_superuser:
            log_activity(user=user, actor=user, action="login")

        data["user"] = UserSerializer(user).data
        return data


class UserTokenObtainPairSerializer(RoleTokenObtainPairSerializer):
    expected_role = "user"


class LeadTokenObtainPairSerializer(RoleTokenObtainPairSerializer):
    expected_role = "lead"


class AdminTokenObtainPairSerializer(RoleTokenObtainPairSerializer):
    expected_role = "admin"


class UserTokenObtainPairView(TokenObtainPairView):
    serializer_class = UserTokenObtainPairSerializer


class LeadTokenObtainPairView(TokenObtainPairView):
    serializer_class = LeadTokenObtainPairSerializer


class AdminTokenObtainPairView(TokenObtainPairView):
    serializer_class = AdminTokenObtainPairSerializer
