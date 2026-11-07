from rest_framework import serializers


class ChatMessageSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant", "system"])
    content = serializers.CharField(allow_blank=True)


class ChatRequestSerializer(serializers.Serializer):
    messages = ChatMessageSerializer(many=True)
