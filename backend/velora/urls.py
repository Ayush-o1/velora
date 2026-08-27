from django.contrib import admin
from django.urls import include, path, re_path

from apps.core.views import api_not_found

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.core.urls")),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/sessions/", include("apps.catalog.urls")),
    path("api/bookings/", include("apps.bookings.urls")),
    # Anything else under /api/ is still an API request and deserves the
    # JSON error envelope, not Django's HTML 404 page. Must stay last.
    re_path(r"^api/.*$", api_not_found),
]
