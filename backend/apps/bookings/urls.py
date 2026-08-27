from rest_framework.routers import DefaultRouter

from .views import BookingViewSet

router = DefaultRouter(trailing_slash=True)
router.register("", BookingViewSet, basename="booking")

urlpatterns = router.urls
