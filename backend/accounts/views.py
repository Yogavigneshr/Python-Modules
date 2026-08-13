from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import RegisterSerializer, UserSerializer
from .models import PendingLeadSignup
from leads.audit import log_activity


class RegisterView(APIView):
    """POST /api/auth/register/  { email, password } -> user + tokens.

    Replaces supabase.auth.signUp() previously called from the browser.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log_activity(user=user, actor=user, action="account_registered")

        # Registration deliberately does NOT create a logged-in session.
        # The user must return to the login screen and authenticate with the
        # newly created credentials.
        return Response(
            {"user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


class MeView(APIView):
    """GET /api/auth/me/ -> current user, based on the JWT access token.

    Replaces supabase.auth.getSession() previously called from the browser.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class LogoutView(APIView):
    """POST /api/auth/logout/ { refresh } -> blacklists the refresh token.

    Requires rest_framework_simplejwt.token_blacklist in INSTALLED_APPS
    if you want server-side revocation; otherwise the frontend can just
    discard the tokens client-side.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        log_activity(user=request.user, actor=request.user, action="logout")
        try:
            token = RefreshToken(request.data.get("refresh"))
            token.blacklist()
        except Exception:
            pass
        return Response(status=status.HTTP_205_RESET_CONTENT)


class LeadSignupStatusView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        try:
            pending = PendingLeadSignup.objects.select_related("user").get(user__email=email, status="pending")
        except PendingLeadSignup.DoesNotExist:
            return Response({"pending": False})
        return Response({"pending": True, "status": pending.status})
