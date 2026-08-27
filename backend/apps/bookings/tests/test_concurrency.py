"""
Proves the capacity race condition described in the assignment cannot
oversubscribe a session: capacity=1, many authenticated users fire
booking requests at (as close to) the same instant, and the final
active-booking count must never exceed capacity.

Uses `TransactionTestCase` (not `TestCase`) deliberately: `TestCase` wraps
each test in one outer transaction that never commits, so a second thread
would never see a first thread's in-progress write and the race could
never actually manifest. `TransactionTestCase` commits real rows against
the real Postgres backend and gives each thread its own DB connection
(Django connections are thread-local), which is what lets
`select_for_update()` actually block a second thread on the first
thread's row lock -- i.e. it exercises real transactional behavior
instead of mocking the booking function.
"""

import threading
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.bookings.models import Booking
from apps.catalog.models import Session

User = get_user_model()

CONTENDERS = 12


class ConcurrentBookingRaceTest(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.creator = User.objects.create_user(
            username="race-creator", email="race-creator@example.com", role=User.Role.CREATOR
        )
        self.users = [
            User.objects.create_user(username=f"racer{i}", email=f"racer{i}@example.com")
            for i in range(CONTENDERS)
        ]

    def _fire_concurrent_bookings(self, session):
        results = [None] * CONTENDERS
        barrier = threading.Barrier(CONTENDERS)

        def attempt_booking(user, index):
            client = APIClient()
            client.force_authenticate(user=user)
            try:
                barrier.wait(timeout=5)  # line everyone up to maximize actual overlap
                response = client.post("/api/bookings/", {"session": session.id}, format="json")
                results[index] = response.status_code
            finally:
                connection.close()

        threads = [
            threading.Thread(target=attempt_booking, args=(user, i))
            for i, user in enumerate(self.users)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=15)

        return results

    def test_capacity_one_never_oversells_under_concurrent_requests(self):
        session = Session.objects.create(
            creator=self.creator,
            title="Race Session (capacity 1)",
            start_time=timezone.now() + timedelta(hours=1),
            duration_minutes=45,
            capacity=1,
        )

        results = self._fire_concurrent_bookings(session)

        successes = [code for code in results if code == 201]
        conflicts = [code for code in results if code == 409]

        assert None not in results, f"a request never completed: {results}"
        assert len(successes) == 1, f"expected exactly 1 success (capacity=1), got statuses={results}"
        assert len(conflicts) == CONTENDERS - 1, f"expected the rest to be 409s, got statuses={results}"

        active_count = Booking.objects.filter(session=session, status=Booking.Status.ACTIVE).count()
        assert active_count == 1
        assert active_count <= session.capacity

    def test_capacity_three_admits_exactly_three_under_concurrent_requests(self):
        session = Session.objects.create(
            creator=self.creator,
            title="Race Session (capacity 3)",
            start_time=timezone.now() + timedelta(hours=1),
            duration_minutes=45,
            capacity=3,
        )

        results = self._fire_concurrent_bookings(session)
        successes = [code for code in results if code == 201]

        active_count = Booking.objects.filter(session=session, status=Booking.Status.ACTIVE).count()
        assert len(successes) == 3, f"expected exactly 3 successes (capacity=3), got statuses={results}"
        assert active_count == 3
        assert active_count <= session.capacity

    def test_race_is_stable_across_repeated_trials(self):
        """
        Concurrency bugs are often intermittent. Re-run the capacity=1 race
        several times over fresh sessions so a flaky implementation (e.g.
        one missing select_for_update) would be caught rather than getting
        lucky once.
        """
        for trial in range(5):
            session = Session.objects.create(
                creator=self.creator,
                title=f"Race Session trial {trial}",
                start_time=timezone.now() + timedelta(hours=1),
                duration_minutes=30,
                capacity=1,
            )
            results = self._fire_concurrent_bookings(session)
            active_count = Booking.objects.filter(session=session, status=Booking.Status.ACTIVE).count()
            assert active_count == 1, f"trial {trial} failed: statuses={results}"

    def test_same_user_double_click_race_never_creates_two_active_bookings(self):
        """Same user firing the booking request twice at once must not double-book."""
        session = Session.objects.create(
            creator=self.creator,
            title="Double-click session",
            start_time=timezone.now() + timedelta(hours=1),
            duration_minutes=30,
            capacity=5,
        )
        user = self.users[0]
        results = [None, None]
        barrier = threading.Barrier(2)

        def attempt(index):
            client = APIClient()
            client.force_authenticate(user=user)
            try:
                barrier.wait(timeout=5)
                response = client.post("/api/bookings/", {"session": session.id}, format="json")
                results[index] = response.status_code
            finally:
                connection.close()

        threads = [threading.Thread(target=attempt, args=(i,)) for i in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert sorted(results) == [201, 409], f"statuses={results}"
        active_count = Booking.objects.filter(session=session, user=user, status=Booking.Status.ACTIVE).count()
        assert active_count == 1
