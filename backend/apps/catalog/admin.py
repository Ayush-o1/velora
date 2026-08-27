from django.contrib import admin

from .models import Session


@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ("title", "creator", "start_time", "capacity", "created_at")
    list_filter = ("creator",)
    search_fields = ("title", "description")
