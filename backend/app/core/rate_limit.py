"""Limite de requisições em memória (§60 — "rate limiting quando necessário").

Janela deslizante por chave (ex.: IP + e-mail no login, usuário nas rotas de
IA). O estado vive no processo: com vários workers/instâncias o limite vale por
processo — suficiente para conter força bruta e abuso de custo de IA. Para um
limite global entre instâncias, trocar o armazenamento por Redis mantendo a
mesma interface.
"""

import math
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from app.core.exceptions import TooManyRequestsError


@dataclass(frozen=True)
class Rule:
    name: str
    limit: int
    window_seconds: int


# Regras da aplicação. Valores pensados para uso humano normal nunca esbarrar.
LOGIN = Rule("login", limit=10, window_seconds=300)
REGISTER = Rule("register", limit=5, window_seconds=3600)
REFRESH = Rule("refresh", limit=60, window_seconds=300)
AI = Rule("ai", limit=30, window_seconds=60)
UPLOAD = Rule("upload", limit=30, window_seconds=300)


class RateLimiter:
    #: Teto de chaves acompanhadas; acima disso as mais antigas são descartadas.
    MAX_KEYS = 50_000

    def __init__(self, *, enabled: bool = True, clock: Callable[[], float] = time.monotonic):
        self.enabled = enabled
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def check(self, rule: Rule, key: str) -> None:
        """Registra uma tentativa; levanta 429 se a janela já estiver cheia."""
        if not self.enabled:
            return
        now = self._clock()
        bucket_key = f"{rule.name}:{key}"
        with self._lock:
            hits = self._hits.get(bucket_key)
            if hits is None:
                if len(self._hits) >= self.MAX_KEYS:
                    self._hits.pop(next(iter(self._hits)))
                hits = self._hits[bucket_key] = deque()
            while hits and hits[0] <= now - rule.window_seconds:
                hits.popleft()
            if len(hits) >= rule.limit:
                retry_after = max(1, math.ceil(hits[0] + rule.window_seconds - now))
                raise TooManyRequestsError(
                    "Muitas tentativas. Aguarde um pouco e tente novamente.",
                    details={"retry_after_seconds": retry_after},
                    headers={"Retry-After": str(retry_after)},
                )
            hits.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def get_rate_limiter(request: Request) -> RateLimiter:
    limiter: RateLimiter = request.app.state.rate_limiter
    return limiter


RateLimiterDep = Annotated[RateLimiter, Depends(get_rate_limiter)]
