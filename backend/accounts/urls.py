from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import RegisterView, MeView, LogoutView, LeadSignupStatusView
from .lead_signup import LeadSignupView
from .token_views import UserTokenObtainPairView, LeadTokenObtainPairView, AdminTokenObtainPairView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("register/lead/", LeadSignupView.as_view(), name="lead-register"),
    path("lead/status/", LeadSignupStatusView.as_view(), name="lead-status"),
    path("login/user/", UserTokenObtainPairView.as_view(), name="login-user"),
    path("login/lead/", LeadTokenObtainPairView.as_view(), name="login-lead"),
    path("login/admin/", AdminTokenObtainPairView.as_view(), name="login-admin"),
    path("refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("logout/", LogoutView.as_view(), name="logout"),
]
