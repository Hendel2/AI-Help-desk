"""Armazenamento vetorial do RAG atrás de uma interface (§3.4).

Isolamento multiempresa por construção: cada empresa tem a sua coleção
(`kb_company_<id>`). Uma consulta nunca recebe trechos de outra empresa porque
nem sequer olha a coleção dela.
"""

import logging
import threading
import time
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol
from urllib.parse import urlparse

from app.services.ai.embeddings import cosine

if TYPE_CHECKING:
    from app.core.config import Settings

logger = logging.getLogger("app.ai.vector_store")


@dataclass(frozen=True)
class VectorRecord:
    id: str
    embedding: list[float]
    document: str
    article_id: int
    chunk_index: int


@dataclass(frozen=True)
class VectorMatch:
    id: str
    article_id: int
    chunk_index: int
    document: str
    score: float
    """Similaridade de cosseno (1 = idêntico)."""


class VectorStoreError(Exception):
    """Banco vetorial indisponível ou com erro."""


class VectorStore(Protocol):
    name: str

    def upsert(self, company_id: int, records: Sequence[VectorRecord]) -> None: ...

    def delete_article(self, company_id: int, article_id: int) -> None: ...

    def query(self, company_id: int, embedding: list[float], k: int) -> list[VectorMatch]: ...

    def reset(self, company_id: int) -> None:
        """Apaga a coleção da empresa (para reconstruir o índice do zero)."""
        ...


def collection_name(company_id: int) -> str:
    if isinstance(company_id, bool) or not isinstance(company_id, int) or company_id <= 0:
        raise ValueError("company_id obrigatório para acessar a base vetorial")
    return f"kb_company_{company_id}"


class InMemoryVectorStore:
    """Para testes e desenvolvimento sem Docker (reindexado ao subir a API)."""

    name = "memory"

    def __init__(self) -> None:
        self._data: dict[str, dict[str, VectorRecord]] = {}
        self._lock = threading.Lock()

    def upsert(self, company_id: int, records: Sequence[VectorRecord]) -> None:
        with self._lock:
            collection = self._data.setdefault(collection_name(company_id), {})
            for record in records:
                collection[record.id] = record

    def delete_article(self, company_id: int, article_id: int) -> None:
        with self._lock:
            collection = self._data.get(collection_name(company_id), {})
            for key in [k for k, r in collection.items() if r.article_id == article_id]:
                del collection[key]

    def reset(self, company_id: int) -> None:
        with self._lock:
            self._data.pop(collection_name(company_id), None)

    def query(self, company_id: int, embedding: list[float], k: int) -> list[VectorMatch]:
        with self._lock:
            records = list(self._data.get(collection_name(company_id), {}).values())
        scored = sorted(
            (
                VectorMatch(
                    id=r.id,
                    article_id=r.article_id,
                    chunk_index=r.chunk_index,
                    document=r.document,
                    score=cosine(embedding, r.embedding),
                )
                for r in records
            ),
            key=lambda match: match.score,
            reverse=True,
        )
        return scored[:k]


#: Tempo em que o Chroma fica "desligado" após uma falha (busca usa a contingência).
COOLDOWN_SECONDS = 30.0


class ChromaVectorStore:
    """ChromaDB via HTTP. Os embeddings são calculados por nós (não pelo Chroma)."""

    name = "chroma"

    def __init__(self, url: str) -> None:
        parsed = urlparse(url)
        self.host = parsed.hostname or "localhost"
        self.port = parsed.port or 8000
        self.ssl = parsed.scheme == "https"
        self._client = None
        self._lock = threading.Lock()
        # Disjuntor: após uma falha, as chamadas falham na hora por um tempo, em vez
        # de cada requisição esperar o timeout do Chroma (~5s) de novo.
        self._open_until = 0.0

    def _connect(self):  # type: ignore[no-untyped-def]
        """Conexão preguiçosa: a API sobe mesmo com o Chroma fora do ar."""
        with self._lock:
            if self._client is None:
                import chromadb  # import tardio: só quem usa Chroma paga o custo
                from chromadb.config import Settings as ChromaSettings

                try:
                    self._client = chromadb.HttpClient(
                        host=self.host,
                        port=self.port,
                        ssl=self.ssl,
                        settings=ChromaSettings(anonymized_telemetry=False),
                    )
                except Exception as exc:
                    raise VectorStoreError("Banco vetorial indisponível.") from exc
            return self._client

    def _guard(self) -> None:
        if time.monotonic() < self._open_until:
            raise VectorStoreError("Banco vetorial indisponível (aguardando nova tentativa).")

    def _trip(self) -> None:
        self._open_until = time.monotonic() + COOLDOWN_SECONDS
        logger.warning("Banco vetorial indisponível; usando contingência por %ss", COOLDOWN_SECONDS)

    def _collection(self, company_id: int):  # type: ignore[no-untyped-def]
        self._guard()
        # embedding_function=None: os vetores sempre chegam prontos.
        try:
            return self._connect().get_or_create_collection(
                name=collection_name(company_id), embedding_function=None
            )
        except VectorStoreError:
            self._trip()
            raise
        except Exception as exc:
            self._trip()
            raise VectorStoreError("Banco vetorial indisponível.") from exc

    def upsert(self, company_id: int, records: Sequence[VectorRecord]) -> None:
        if not records:
            return
        try:
            self._collection(company_id).upsert(
                ids=[r.id for r in records],
                embeddings=[r.embedding for r in records],
                documents=[r.document for r in records],
                metadatas=[
                    {"article_id": r.article_id, "chunk_index": r.chunk_index} for r in records
                ],
            )
        except Exception as exc:
            self._trip()
            raise VectorStoreError("Falha ao gravar no banco vetorial.") from exc

    def delete_article(self, company_id: int, article_id: int) -> None:
        try:
            self._collection(company_id).delete(where={"article_id": article_id})
        except Exception as exc:
            self._trip()
            raise VectorStoreError("Falha ao remover do banco vetorial.") from exc

    def reset(self, company_id: int) -> None:
        # A coleção é criada antes (se faltar) para a exclusão nunca falhar por "não existe".
        self._collection(company_id)
        try:
            self._connect().delete_collection(collection_name(company_id))
        except Exception as exc:
            self._trip()
            raise VectorStoreError("Falha ao apagar a coleção do banco vetorial.") from exc

    def query(self, company_id: int, embedding: list[float], k: int) -> list[VectorMatch]:
        try:
            result = self._collection(company_id).query(
                query_embeddings=[embedding],
                n_results=k,
                include=["documents", "metadatas", "distances"],
            )
        except Exception as exc:
            self._trip()
            raise VectorStoreError("Falha ao consultar o banco vetorial.") from exc

        ids = (result.get("ids") or [[]])[0]
        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]
        return [
            VectorMatch(
                id=ids[i],
                article_id=int(metadatas[i]["article_id"]),
                chunk_index=int(metadatas[i]["chunk_index"]),
                document=documents[i] or "",
                # Espaço padrão do Chroma: L2 ao quadrado. Com vetores unitários,
                # d² = 2 - 2·cos  →  cos = 1 - d²/2.
                score=1 - float(distances[i]) / 2,
            )
            for i in range(len(ids))
        ]


def build_vector_store(settings: "Settings") -> VectorStore:
    """Banco vetorial configurado (`VECTOR_STORE_PROVIDER`)."""
    if settings.VECTOR_STORE_PROVIDER == "memory":
        return InMemoryVectorStore()
    return ChromaVectorStore(settings.VECTOR_DB_URL)
