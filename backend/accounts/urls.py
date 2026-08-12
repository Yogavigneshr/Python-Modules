from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import LogoutView, MeView, RegisterView
from .token_views import EmailTokenObtainPairView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    # Login: POST { email, password } -> { access, refresh }
    # Replaces supabase.auth.signInWithPassword().
    path("login/", EmailTokenObtainPairView.as_view(), name="login"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
]
