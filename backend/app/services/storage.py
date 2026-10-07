"""Armazenamento de arquivos enviados (anexos).

Interface mínima para permitir trocar o disco local por um object storage
(S3, Azure Blob…) sem mexer nas regras de negócio.
"""

import shutil
from collections.abc import Iterator
from pathlib import Path
from typing import BinaryIO, Protocol

CHUNK_SIZE = 64 * 1024


class FileTooLargeError(Exception):
    """O arquivo excedeu o limite configurado durante a gravação."""


class FileStorage(Protocol):
    def save(self, key: str, source: BinaryIO, *, max_bytes: int) -> int: ...

    def open(self, key: str) -> BinaryIO: ...

    def path(self, key: str) -> Path: ...

    def delete(self, key: str) -> None: ...


class LocalFileStorage:
    """Grava em `UPLOAD_DIR/<key>`. A chave é gerada pelo sistema, nunca pelo usuário."""

    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir.resolve()

    def path(self, key: str) -> Path:
        target = (self.base_dir / key).resolve()
        # Defesa em profundidade contra path traversal (a chave já é interna).
        if not target.is_relative_to(self.base_dir):
            raise ValueError("Chave de armazenamento inválida")
        return target

    def save(self, key: str, source: BinaryIO, *, max_bytes: int) -> int:
        """Copia em blocos e aborta ao passar de `max_bytes` (sem carregar tudo na memória)."""
        target = self.path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        written = 0
        try:
            with target.open("wb") as destination:
                for chunk in _chunks(source):
                    written += len(chunk)
                    if written > max_bytes:
                        raise FileTooLargeError
                    destination.write(chunk)
        except BaseException:
            target.unlink(missing_ok=True)
            raise
        return written

    def open(self, key: str) -> BinaryIO:
        return self.path(key).open("rb")

    def delete(self, key: str) -> None:
        self.path(key).unlink(missing_ok=True)

    def clear(self) -> None:
        """Somente para testes."""
        shutil.rmtree(self.base_dir, ignore_errors=True)


def _chunks(source: BinaryIO) -> Iterator[bytes]:
    while chunk := source.read(CHUNK_SIZE):
        yield chunk
