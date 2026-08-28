"""
Local demo data for evidence capture and manual exploration.
Run with:  docker compose exec -T backend python manage.py shell < tools/seed_demo.py
"""
from datetime import timedelta
from zoneinfo import ZoneInfo
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.catalog.models import Session
from apps.bookings.models import Booking

U = get_user_model()
Booking.objects.all().delete()
Session.objects.all().delete()
U.objects.filter(is_superuser=False).delete()

now = timezone.now()
LOCAL = ZoneInfo("Asia/Kolkata")

maya = U.objects.create_user(username="maya-oyelaran", email="maya@example.com", role=U.Role.CREATOR,
                             first_name="Maya", bio="Backend engineer. I like boring databases that never lie.")
devi = U.objects.create_user(username="devi-raghunathan", email="devi@example.com", role=U.Role.CREATOR,
                             first_name="Devi", bio="Frontend architecture, design systems, and the space between them.")
sam = U.objects.create_user(username="sam-okonkwo", email="sam@example.com", role=U.Role.USER, first_name="Sam")
rin = U.objects.create_user(username="rin-takeda", email="rin@example.com", role=U.Role.USER, first_name="Rin")
theo = U.objects.create_user(username="theo-brandt", email="theo@example.com", role=U.Role.USER, first_name="Theo")


def at(days, hour):
    """A sensible local hour, not whatever offset from 'now' fell out —
    demo screenshots shouldn't show workshops starting at 2am."""
    return (now + timedelta(days=days)).astimezone(LOCAL).replace(
        hour=hour, minute=0, second=0, microsecond=0)


def mk(creator, title, desc, loc, days, hour, mins, cap):
    return Session.objects.create(creator=creator, title=title, description=desc, location=loc,
                                  start_time=at(days, hour), duration_minutes=mins, capacity=cap)

s1 = mk(maya, "System Design: From API to Production",
        "We take one small service from a blank repo to something you'd be comfortable paging on.\n\n"
        "Request lifecycle, where state actually lives, what a transaction boundary buys you, and the "
        "handful of failure modes that account for most production incidents. Bring a service you own "
        "and we'll pull it apart in the last half hour.",
        "Online", 3, 18, 120, 12)

s2 = mk(devi, "Modern React Architecture",
        "Component boundaries that survive contact with a real product.\n\n"
        "Where server and client components genuinely differ, what belongs in context and what "
        "absolutely does not, and how to keep a design system from quietly becoming a second "
        "framework. Code-along; a laptop is enough.",
        "Online", 5, 17, 90, 20)

s3 = mk(maya, "Building Reliable APIs with Django",
        "Permissions that hold up when someone bypasses your frontend, error responses a client can "
        "actually branch on, and the difference between validating input and protecting an invariant.\n\n"
        "We'll write the tests that prove an authorization rule rather than assuming it.",
        "Online", 8, 19, 90, 8)

s4 = mk(devi, "PostgreSQL Performance Fundamentals",
        "Reading a query plan without guessing. Indexes that get used versus indexes that just take up "
        "space, what row locks really cost under contention, and how to tell a slow query from a slow "
        "database.",
        "Berlin · Prenzlauer Berg", 12, 10, 150, 6)

s5 = mk(maya, "Office Hours: Code Review, Live",
        "Bring a pull request you're unsure about. We read it together, out loud, and I'll tell you "
        "what I'd actually say if it landed in my review queue.",
        "Online", 1, 16, 60, 3)

past = Session.objects.create(
    creator=devi, title="Testing Strategy for Small Teams",
    description="What to test first when you can't test everything, and why coverage is a poor proxy "
                "for confidence.",
    location="Online", start_time=at(-6, 18), duration_minutes=75, capacity=10)

for u, s in [(sam, s1), (rin, s1), (theo, s1), (rin, s2), (sam, s4), (theo, s4), (rin, s4),
             (sam, s5), (rin, s5), (sam, past)]:
    Booking.objects.create(user=u, session=s)

cancelled = Booking.objects.create(user=sam, session=s3)
cancelled.status = Booking.Status.CANCELLED
cancelled.cancelled_at = now - timedelta(days=1)
cancelled.save()

print("creators:", U.objects.filter(role=U.Role.CREATOR).count())
print("users:   ", U.objects.filter(role=U.Role.USER).count())
print("sessions:", Session.objects.count())
print("bookings:", Booking.objects.filter(status=Booking.Status.ACTIVE).count(), "active,",
      Booking.objects.filter(status=Booking.Status.CANCELLED).count(), "cancelled")
