"""Embeddings para o RAG (§28).

`HashingEmbedder` é local, determinístico e não exige chave de API: projeta
termos e bigramas normalizados (sem acento, sem stopwords, com radical
simplificado) num vetor de dimensão fixa via *feature hashing*. Captura bem a
sobreposição de vocabulário típica de suporte ("vpn", "senha", "impressora").

A interface `Embedder` permite trocar por um modelo de embeddings semântico
sem alterar o restante do RAG.
"""

import hashlib
import math
import re
from collections import Counter
from typing import Protocol

from app.services.ai.classifier import normalize

DIMENSIONS = 512

_STOPWORDS = frozenset(
    [
        "a",
        "o",
        "e",
        "é",
        "de",
        "do",
        "da",
        "dos",
        "das",
        "em",
        "no",
        "na",
        "nos",
        "nas",
        "um",
        "uma",
        "uns",
        "umas",
        "para",
        "por",
        "com",
        "sem",
        "que",
        "se",
        "ao",
        "aos",
        "à",
        "às",
        "ou",
        "como",
        "mais",
        "menos",
        "muito",
        "muita",
        "meu",
        "minha",
        "meus",
        "minhas",
        "seu",
        "sua",
        "seus",
        "suas",
        "este",
        "esta",
        "isso",
        "isto",
        "esse",
        "essa",
        "ele",
        "ela",
        "eles",
        "elas",
        "eu",
        "voce",
        "voces",
        "nao",
        "sim",
        "ja",
        "foi",
        "ser",
        "esta",
        "estao",
        "tem",
        "ter",
        "ha",
        "qual",
        "quando",
        "onde",
        "porque",
        "pois",
        "entao",
        "tambem",
        "so",
        "ainda",
        "the",
        "of",
        "to",
        "and",
        "in",
        "is",
        "it",
        "for",
        "on",
    ]
)


class Embedder(Protocol):
    name: str

    def embed(self, texts: list[str]) -> list[list[float]]: ...


def _stem(token: str) -> str:
    """Singular simples para pt-BR (sem acentos): "configuracoes" → "configuracao",
    "impressoras" → "impressora", "redes" → "rede". Previsível de propósito."""
    if len(token) <= 3:
        return token
    if token.endswith("coes"):
        return token[:-4] + "cao"
    if token.endswith("oes"):
        return token[:-3] + "ao"
    if token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def tokenize(text: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)*", normalize(text))
    return [_stem(token) for token in tokens if token not in _STOPWORDS and len(token) > 1]


def _bucket(feature: str) -> tuple[int, float]:
    digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
    value = int.from_bytes(digest, "big")
    # Sinal pseudoaleatório reduz o viés de colisões no hashing.
    return value % DIMENSIONS, (1.0 if (value >> 63) & 1 else -1.0)


class HashingEmbedder:
    name = "hashing-v1"

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]

    def _embed_one(self, text: str) -> list[float]:
        tokens = tokenize(text)
        features = Counter(tokens)
        features.update(f"{a}_{b}" for a, b in zip(tokens, tokens[1:], strict=False))
        vector = [0.0] * DIMENSIONS
        for feature, count in features.items():
            index, sign = _bucket(feature)
            # Bigramas pesam um pouco menos que termos isolados; TF sublinear.
            weight = (0.6 if "_" in feature else 1.0) * (1 + math.log(count))
            vector[index] += sign * weight
        norm = math.sqrt(sum(value * value for value in vector))
        return [value / norm for value in vector] if norm else vector


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))
