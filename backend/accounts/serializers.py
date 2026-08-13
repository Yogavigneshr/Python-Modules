from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(min_length=2, max_length=120, trim_whitespace=True)
    password = serializers.CharField(write_only=True, min_length=10)

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "password", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_full_name(self, value):
        value = " ".join(value.split())
        if len(value) < 2:
            raise serializers.ValidationError("Please enter your full name.")
        return value

    def validate_password(self, value):
        validate_password(value, self.instance)
        if not any(c.islower() for c in value):
            raise serializers.ValidationError("Password must contain a lowercase letter.")
        if not any(c.isupper() for c in value):
            raise serializers.ValidationError("Password must contain an uppercase letter.")
        if not any(c.isdigit() for c in value):
            raise serializers.ValidationError("Password must contain a number.")
        if not any(not c.isalnum() for c in value):
            raise serializers.ValidationError("Password must contain a special character.")
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            full_name=validated_data["full_name"],
        )


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "full_name", "role", "is_staff", "is_superuser", "created_at"]
