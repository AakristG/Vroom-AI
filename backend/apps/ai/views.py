from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import nim_client
from .serializers import ChatRequestSerializer


@api_view(["POST"])
def chat(request):
    """Plain REST endpoint to test the NVIDIA NIM integration directly from the frontend,
    independent of a live Retell call. POST {"messages": [{"role": "user", "content": "..."}]}.
    """
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    reply = nim_client.generate_reply(serializer.validated_data["messages"])
    return Response({"reply": reply})
