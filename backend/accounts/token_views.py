from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import UserSerializer


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    # USERNAME_FIELD is already "email" on the User model, so the default
    # simplejwt serializer accepts {"email": ..., "password": ...} as-is.
    # We just add the user payload to the response for convenience so the
    # frontend doesn't need a second round trip to /me/ after login.
    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class EmailTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer
