"""Simple in-memory rate limiter for the Lambda/local backend.

Uses a sliding window per IP. Since Lambda instances are short-lived,
this naturally resets — it's a best-effort guard, not a fortress.
The real protection is the API Gateway throttle in the CDK stack.
"""

import time
from collections import defaultdict
from fastapi import Request, HTTPException


class RateLimiter:
    def __init__(self, max_requests: int = 20, window_seconds: int = 60):
        """
        Args:
            max_requests: Max requests allowed per IP within the window.
            window_seconds: Time window in seconds.
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: dict[str, list[float]] = defaultdict(list)

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP, accounting for proxies."""
        # API Gateway passes the real IP in x-forwarded-for
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _cleanup(self, ip: str) -> None:
        """Remove expired timestamps."""
        now = time.time()
        cutoff = now - self.window_seconds
        self.requests[ip] = [t for t in self.requests[ip] if t > cutoff]

    def check(self, request: Request) -> None:
        """
        Check if the request should be allowed.
        Raises HTTPException(429) if rate limit exceeded.
        """
        ip = self._get_client_ip(request)
        self._cleanup(ip)

        if len(self.requests[ip]) >= self.max_requests:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "rate_limit_exceeded",
                    "message": "Too many requests. Please slow down and try again shortly.",
                    "retry_after_seconds": self.window_seconds,
                },
            )

        self.requests[ip].append(time.time())


# Global instance: 20 requests per minute per IP
rate_limiter = RateLimiter(max_requests=20, window_seconds=60)
