from django.urls import path

from .views import GitHubCallbackView, LogoutView, MeView, RefreshView

urlpatterns = [
    path("github/callback/", GitHubCallbackView.as_view(), name="github-callback"),
    path("refresh/", RefreshView.as_view(), name="token-refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
]
