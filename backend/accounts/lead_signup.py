from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PendingLeadSignup
from .serializers import RegisterSerializer, UserSerializer
from leads.audit import log_activity

User = get_user_model()


class LeadSignupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        user.role = User.Role.LEAD
        user.is_active = False
        user.save(update_fields=["role", "is_active"])
        PendingLeadSignup.objects.create(user=user)
        log_activity(user=user, actor=user, action="lead_signup_submitted")
        return Response(
            {"user": UserSerializer(user).data, "status": "pending", "message": "Your Lead account is awaiting admin verification."},
            status=status.HTTP_201_CREATED,
        )
