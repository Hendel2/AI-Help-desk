"""Reconstrói o índice vetorial da base de conhecimento de todas as empresas.

Necessário depois de uma atualização que troca o embedder (dimensão ou
normalização dos vetores): os vetores antigos não são comparáveis aos novos.
Até rodar, nada para — o RAG usa a busca de contingência, só que mais lenta.

    python -m app.cli.reindex_knowledge
"""

import sys

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models import Company
from app.services.ai.embeddings import HashingEmbedder
from app.services.ai.rag import RAGService
from app.services.ai.vector_store import VectorStoreError, build_vector_store


def main() -> None:
    settings = get_settings()
    if settings.VECTOR_STORE_PROVIDER == "memory":
        print("Banco vetorial em memória: o índice é reconstruído quando a API sobe.")
        return
    store = build_vector_store(settings)
    with SessionLocal() as session:
        rag = RAGService(session, store, HashingEmbedder())
        companies = session.scalars(select(Company.id)).all()
        chunks = 0
        for company_id in companies:
            try:
                chunks += rag.rebuild_company(company_id)
            except VectorStoreError:
                session.rollback()
                sys.exit("Banco vetorial indisponível: verifique o serviço vector-db.")
            session.commit()
    print(f"Índice reconstruído: {len(companies)} empresa(s), {chunks} trecho(s).")


if __name__ == "__main__":
    main()
