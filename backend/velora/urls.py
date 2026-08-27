from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.core.urls")),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/sessions/", include("apps.catalog.urls")),
    path("api/bookings/", include("apps.bookings.urls")),
]
