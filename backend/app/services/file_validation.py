"""Validação de anexos (§19): extensão, conteúdo real (assinatura) e nome.

O `Content-Type` enviado pelo navegador NÃO é confiável e é ignorado: o tipo
gravado é derivado da extensão permitida e confirmado pelos primeiros bytes.
"""

import re
import unicodedata
from dataclasses import dataclass
from pathlib import PurePath

#: Bytes lidos para identificar o arquivo.
SNIFF_SIZE = 8192

# Assinaturas de executáveis: bloqueadas mesmo com extensão disfarçada.
_EXECUTABLE_SIGNATURES = (
    b"MZ",  # Windows PE (.exe, .dll)
    b"\x7fELF",  # Linux
    b"\xfe\xed\xfa\xce",  # Mach-O
    b"\xfe\xed\xfa\xcf",
    b"\xcf\xfa\xed\xfe",
    b"\xce\xfa\xed\xfe",
    b"\xca\xfe\xba\xbe",  # Mach-O universal / Java class
)

_ZIP = (b"PK\x03\x04",)


@dataclass(frozen=True)
class FileKind:
    mime: str
    signatures: tuple[bytes, ...] = ()
    is_text: bool = False


ALLOWED_TYPES: dict[str, FileKind] = {
    ".png": FileKind("image/png", (b"\x89PNG\r\n\x1a\n",)),
    ".jpg": FileKind("image/jpeg", (b"\xff\xd8\xff",)),
    ".jpeg": FileKind("image/jpeg", (b"\xff\xd8\xff",)),
    ".gif": FileKind("image/gif", (b"GIF87a", b"GIF89a")),
    ".webp": FileKind("image/webp", (b"RIFF",)),
    ".pdf": FileKind("application/pdf", (b"%PDF-",)),
    ".docx": FileKind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", _ZIP
    ),
    ".xlsx": FileKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", _ZIP),
    ".pptx": FileKind(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation", _ZIP
    ),
    ".txt": FileKind("text/plain", is_text=True),
    ".log": FileKind("text/plain", is_text=True),
    ".md": FileKind("text/markdown", is_text=True),
    ".csv": FileKind("text/csv", is_text=True),
}

ALLOWED_EXTENSIONS = tuple(sorted(ALLOWED_TYPES))


class InvalidFileError(Exception):
    def __init__(self, message: str, code: str = "INVALID_FILE") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


_UNSAFE_CHARS = re.compile(r'[\x00-\x1f\x7f<>:"/\\|?*]')


def sanitize_file_name(raw: str | None) -> str:
    """Nome exibido ao usuário: sem diretórios, caracteres de controle ou reservados."""
    name = PurePath((raw or "").replace("\\", "/")).name
    name = unicodedata.normalize("NFC", name)
    name = _UNSAFE_CHARS.sub("_", name).strip(" .")
    if not name:
        return "arquivo"
    if len(name) > 255:
        stem, dot, ext = name.rpartition(".")
        name = (stem[: 250 - len(ext)] + dot + ext) if dot else name[:255]
    return name


def validate_file(file_name: str, head: bytes) -> FileKind:
    """Confere extensão e conteúdo. `head` são os primeiros bytes do arquivo."""
    extension = PurePath(file_name).suffix.lower()
    kind = ALLOWED_TYPES.get(extension)
    if kind is None:
        raise InvalidFileError(
            "Tipo de arquivo não permitido. Envie imagens, PDF, documentos do Office ou texto.",
            code="FILE_TYPE_NOT_ALLOWED",
        )
    if not head:
        raise InvalidFileError("O arquivo está vazio.", code="EMPTY_FILE")
    if head.startswith(_EXECUTABLE_SIGNATURES):
        raise InvalidFileError(
            "Arquivos executáveis não são permitidos.", code="EXECUTABLE_NOT_ALLOWED"
        )

    if kind.is_text:
        if b"\x00" in head:
            raise InvalidFileError(
                "O conteúdo não corresponde a um arquivo de texto.", code="FILE_CONTENT_MISMATCH"
            )
        try:
            # Pode cortar um caractere multibyte no fim do trecho lido.
            head.decode("utf-8")
        except UnicodeDecodeError as exc:
            if exc.start < len(head) - 4:
                raise InvalidFileError(
                    "O arquivo de texto deve estar em UTF-8.", code="FILE_CONTENT_MISMATCH"
                ) from exc
        return kind

    if not head.startswith(kind.signatures):
        raise InvalidFileError(
            "O conteúdo do arquivo não corresponde à extensão informada.",
            code="FILE_CONTENT_MISMATCH",
        )
    if extension == ".webp" and head[8:12] != b"WEBP":
        raise InvalidFileError(
            "O conteúdo do arquivo não corresponde à extensão informada.",
            code="FILE_CONTENT_MISMATCH",
        )
    return kind
