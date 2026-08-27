from rest_framework.routers import DefaultRouter

from .views import SessionViewSet

router = DefaultRouter(trailing_slash=True)
router.register("", SessionViewSet, basename="session")

urlpatterns = router.urls
