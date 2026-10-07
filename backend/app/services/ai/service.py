"""Orquestração da IA (§5, §67): escolhe LLM ou heurística, valida e registra.

Toda execução vira uma linha em `ai_actions` (§69, §71) com modelo, tokens,
latência e sucesso — sem gravar o texto bruto enviado pelo usuário.
"""

import json
import logging
import time
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import AIAction, Category, User
from app.models.enums import AIActionType
from app.repositories.ticket import CategoryRepository
from app.services.ai.classifier import (
    Classification,
    InvalidAIOutputError,
    classify_heuristic,
    classify_with_llm,
)
from app.services.ai.provider import AIProviderError, LLMProvider, LLMResult

logger = logging.getLogger("app.ai")

HEURISTIC_MODEL = "heuristic"


@dataclass(frozen=True)
class ClassificationResult:
    classification: Classification
    category: Category | None


class AIService:
    def __init__(self, session: Session, provider: LLMProvider | None) -> None:
        self.session = session
        self.provider = provider

    @property
    def model_name(self) -> str:
        return self.provider.model if self.provider else HEURISTIC_MODEL

    def classify(
        self, user: User, text: str, *, input_reference: str = "draft"
    ) -> ClassificationResult:
        categories = list(CategoryRepository(self.session).list_active(user.company_id))
        names = [category.name for category in categories]
        defaults = {category.name: category.default_priority for category in categories}

        classification: Classification | None = None
        if self.provider is not None:
            started = time.perf_counter()
            try:
                classification, llm = classify_with_llm(self.provider, text, names)
                self._log(user, AIActionType.CLASSIFY_TICKET, input_reference, classification, llm)
            except (AIProviderError, InvalidAIOutputError) as exc:
                # Falha registrada; a abertura do chamado não pode depender da IA.
                logger.warning(
                    "Classificação por LLM falhou; usando heurística", extra={"error": str(exc)}
                )
                self._log_failure(
                    user,
                    AIActionType.CLASSIFY_TICKET,
                    input_reference,
                    str(exc),
                    int((time.perf_counter() - started) * 1000),
                )

        if classification is None:
            started = time.perf_counter()
            classification = classify_heuristic(text, names, defaults)
            self._log(
                user,
                AIActionType.CLASSIFY_TICKET,
                input_reference,
                classification,
                None,
                latency_ms=int((time.perf_counter() - started) * 1000),
            )

        self.session.commit()
        category = next((c for c in categories if c.name == classification.category_name), None)
        return ClassificationResult(classification=classification, category=category)

    # --- Registro ----------------------------------------------------------

    def _log(
        self,
        user: User,
        action: AIActionType,
        input_reference: str,
        output: Classification,
        llm: LLMResult | None,
        *,
        latency_ms: int | None = None,
    ) -> None:
        self.session.add(
            AIAction(
                company_id=user.company_id,
                user_id=user.id,
                action_type=action,
                input_reference=input_reference[:100],
                output=json.dumps(output.model_dump(mode="json"), ensure_ascii=False),
                model=llm.model if llm else HEURISTIC_MODEL,
                success=True,
                latency_ms=llm.latency_ms if llm else latency_ms,
                input_tokens=llm.input_tokens if llm else None,
                output_tokens=llm.output_tokens if llm else None,
            )
        )
        self.session.flush()

    def _log_failure(
        self,
        user: User,
        action: AIActionType,
        input_reference: str,
        error: str,
        latency_ms: int,
    ) -> None:
        self.session.add(
            AIAction(
                company_id=user.company_id,
                user_id=user.id,
                action_type=action,
                input_reference=input_reference[:100],
                model=self.model_name,
                success=False,
                error_message=error[:500],
                latency_ms=latency_ms,
            )
        )
        self.session.flush()
