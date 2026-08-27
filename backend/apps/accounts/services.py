"""
GitHub OAuth exchange, kept isolated from views so it can be unit-tested
and swapped independently of the HTTP layer.
"""

from dataclasses import dataclass

import requests
from django.conf import settings

GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"


class GitHubOAuthError(Exception):
    """Raised when the code exchange or profile fetch fails."""


@dataclass
class GitHubProfile:
    github_id: str
    login: str
    name: str
    avatar_url: str
    email: str


def exchange_code_for_profile(code: str) -> GitHubProfile:
    token_response = requests.post(
        GITHUB_TOKEN_URL,
        headers={"Accept": "application/json"},
        data={
            "client_id": settings.GITHUB_CLIENT_ID,
            "client_secret": settings.GITHUB_CLIENT_SECRET,
            "code": code,
            "redirect_uri": settings.GITHUB_OAUTH_REDIRECT_URI,
        },
        timeout=10,
    )
    token_response.raise_for_status()
    token_data = token_response.json()

    access_token = token_data.get("access_token")
    if not access_token:
        raise GitHubOAuthError(token_data.get("error_description", "GitHub did not return an access token."))

    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"}

    user_response = requests.get(GITHUB_USER_URL, headers=headers, timeout=10)
    user_response.raise_for_status()
    user_data = user_response.json()

    email = user_data.get("email")
    if not email:
        emails_response = requests.get(GITHUB_EMAILS_URL, headers=headers, timeout=10)
        emails_response.raise_for_status()
        emails = emails_response.json()
        primary = next((e for e in emails if e.get("primary") and e.get("verified")), None)
        if primary is None:
            primary = next((e for e in emails if e.get("verified")), None)
        if primary is None:
            raise GitHubOAuthError("GitHub account has no verified email address.")
        email = primary["email"]

    return GitHubProfile(
        github_id=str(user_data["id"]),
        login=user_data["login"],
        name=user_data.get("name") or user_data["login"],
        avatar_url=user_data.get("avatar_url", ""),
        email=email,
    )
