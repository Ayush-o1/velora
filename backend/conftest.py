from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.models import Session

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def make_user(db):
    def _make(username, role=User.Role.USER, **kwargs):
        return User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            role=role,
            **kwargs,
        )

    return _make


@pytest.fixture
def plain_user(make_user):
    return make_user("plainuser", role=User.Role.USER)


@pytest.fixture
def creator(make_user):
    return make_user("creatorone", role=User.Role.CREATOR)


@pytest.fixture
def other_creator(make_user):
    return make_user("creatortwo", role=User.Role.CREATOR)


@pytest.fixture
def make_session(db, creator):
    def _make(owner=None, capacity=5, starts_in_hours=24, **kwargs):
        return Session.objects.create(
            creator=owner or creator,
            title=kwargs.pop("title", "Test Session"),
            description=kwargs.pop("description", "A session for testing."),
            start_time=timezone.now() + timedelta(hours=starts_in_hours),
            duration_minutes=kwargs.pop("duration_minutes", 60),
            capacity=capacity,
            **kwargs,
        )

    return _make
