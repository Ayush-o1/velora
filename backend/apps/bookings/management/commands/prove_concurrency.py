"""
Reproducible concurrency proof, runnable standalone (independent of the
pytest suite): creates a fresh capacity-1 session and N contenders,
fires them at `create_booking` concurrently on real threads with real
DB connections, and reports the outcome. Cleans up its own data after.

Usage:
    python manage.py prove_concurrency
    python manage.py prove_concurrency --contenders 20
"""

import threading

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import connection
from django.utils import timezone
from datetime import timedelta

from apps.bookings import services
from apps.bookings.models import Booking
from apps.catalog.models import Session

User = get_user_model()


class Command(BaseCommand):
    help = "Fires concurrent booking attempts at a capacity-1 session and reports the outcome."

    def add_arguments(self, parser):
        parser.add_argument("--contenders", type=int, default=15)

    def handle(self, *args, **options):
        n = options["contenders"]

        creator = User.objects.create_user(
            username="_proof_creator", email="_proof_creator@example.com", role=User.Role.CREATOR
        )
        session = Session.objects.create(
            creator=creator,
            title="Concurrency proof session",
            start_time=timezone.now() + timedelta(hours=1),
            duration_minutes=30,
            capacity=1,
        )
        contenders = [
            User.objects.create_user(username=f"_proof_racer{i}", email=f"_proof_racer{i}@example.com")
            for i in range(n)
        ]

        self.stdout.write(f"Session {session.id} created with capacity=1. Firing {n} concurrent booking attempts...")

        results = [None] * n
        barrier = threading.Barrier(n)

        def attempt(user, index):
            connection.close()
            try:
                barrier.wait(timeout=5)
                services.create_booking(user=user, session_id=session.id)
                results[index] = "SUCCESS"
            except services.SessionFullError:
                results[index] = "session_full"
            except services.DuplicateBookingError:
                results[index] = "duplicate_booking"
            except Exception as exc:  # pragma: no cover - diagnostic only
                results[index] = f"UNEXPECTED ERROR: {exc!r}"
            finally:
                connection.close()

        threads = [threading.Thread(target=attempt, args=(u, i)) for i, u in enumerate(contenders)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=15)

        active_count = Booking.objects.filter(session=session, status=Booking.Status.ACTIVE).count()

        successes = results.count("SUCCESS")
        self.stdout.write("")
        self.stdout.write("Result per contender:")
        for i, r in enumerate(results):
            self.stdout.write(f"  racer{i}: {r}")
        self.stdout.write("")
        self.stdout.write(f"Successful bookings: {successes} (session capacity: {session.capacity})")
        self.stdout.write(f"Active bookings in DB: {active_count}")

        # Cleanup
        Booking.objects.filter(session=session).delete()
        session.delete()
        for c in contenders:
            c.delete()
        creator.delete()

        if successes == 1 and active_count == 1:
            self.stdout.write(self.style.SUCCESS("PASS: exactly one booking succeeded, capacity was never exceeded."))
        else:
            self.stdout.write(
                self.style.ERROR(
                    f"FAIL: expected exactly 1 success and 1 active booking, got {successes} successes / {active_count} active."
                )
            )
            raise SystemExit(1)
