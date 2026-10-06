"""initial schema

Cria as 19 tabelas iniciais do AI Help Desk e popula os perfis (roles).

Gerada com `alembic revision --autogenerate` contra um SQLite vazio e revisada à mão.
A migration é autocontida (não importa `app`): valores de enum e tipos ficam
congelados aqui, como estavam nesta revisão.

Revision ID: 0001
Revises:
Create Date: 2026-10-06 18:08:30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def utc_datetime() -> sa.types.TypeEngine:
    """Equivalente a app.models.types.UTCDateTime: DATETIME(6) no MySQL."""
    return sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")


def long_text() -> sa.types.TypeEngine:
    """Equivalente a app.models.types.LongText: LONGTEXT no MySQL."""
    return sa.Text().with_variant(mysql.LONGTEXT(), "mysql")


def str_enum(name: str, *values: str) -> sa.Enum:
    """Enum como VARCHAR (sem ENUM nativo e sem CHECK), como em enum_column()."""
    return sa.Enum(
        *values,
        name=name,
        native_enum=False,
        create_constraint=False,
        length=max(len(value) for value in values),
    )


TICKET_PRIORITY = ("LOW", "MEDIUM", "HIGH", "CRITICAL")


def upgrade() -> None:
    # --- Tabelas sem dependências -------------------------------------------
    op.create_table(
        "companies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("cnpj", sa.String(length=14), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.Column("updated_at", utc_datetime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_companies")),
        sa.UniqueConstraint("cnpj", name=op.f("uq_companies_cnpj")),
    )

    roles = op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", str_enum("rolename", "USER", "TECHNICIAN", "ADMIN"), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_roles")),
        sa.UniqueConstraint("name", name=op.f("uq_roles_name")),
    )

    # --- Estrutura da empresa -----------------------------------------------
    op.create_table(
        "departments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.Column("updated_at", utc_datetime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_departments_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_departments")),
        sa.UniqueConstraint("company_id", "name", name=op.f("uq_departments_company_id_name")),
    )
    op.create_index(op.f("ix_departments_company_id"), "departments", ["company_id"])

    op.create_table(
        "sla_policies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("priority", str_enum("ticketpriority", *TICKET_PRIORITY), nullable=True),
        sa.Column("response_time_minutes", sa.Integer(), nullable=False),
        sa.Column("resolution_time_minutes", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.Column("updated_at", utc_datetime(), nullable=False),
        sa.CheckConstraint(
            "response_time_minutes > 0",
            name=op.f("ck_sla_policies_response_time_positive"),
        ),
        sa.CheckConstraint(
            "resolution_time_minutes >= response_time_minutes",
            name=op.f("ck_sla_policies_resolution_gte_response"),
        ),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_sla_policies_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sla_policies")),
        sa.UniqueConstraint("company_id", "name", name=op.f("uq_sla_policies_company_id_name")),
    )
    op.create_index(op.f("ix_sla_policies_company_id"), "sla_policies", ["company_id"])

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column(
            "default_priority",
            str_enum("ticketpriority", *TICKET_PRIORITY),
            server_default="MEDIUM",
            nullable=False,
        ),
        sa.Column("default_sla_policy_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.Column("updated_at", utc_datetime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_categories_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["default_sla_policy_id"],
            ["sla_policies.id"],
            name=op.f("fk_categories_default_sla_policy_id_sla_policies"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_categories")),
        sa.UniqueConstraint("company_id", "name", name=op.f("uq_categories_company_id_name")),
    )
    op.create_index(op.f("ix_categories_company_id"), "categories", ["company_id"])
    op.create_index(
        op.f("ix_categories_default_sla_policy_id"), "categories", ["default_sla_policy_id"]
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("department_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("avatar", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.Column("updated_at", utc_datetime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_users_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["departments.id"],
            name=op.f("fk_users_department_id_departments"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["role_id"], ["roles.id"], name=op.f("fk_users_role_id_roles"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_index(op.f("ix_users_company_id"), "users", ["company_id"])
    op.create_index(op.f("ix_users_department_id"), "users", ["department_id"])
    op.create_index(op.f("ix_users_role_id"), "users", ["role_id"])

    # --- Chamados -----------------------------------------------------------
    op.create_table(
        "tickets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("ticket_number", sa.String(length=20), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("technician_id", sa.Integer(), nullable=True),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("sla_policy_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "priority",
            str_enum("ticketpriority", *TICKET_PRIORITY),
            server_default="MEDIUM",
            nullable=False,
        ),
        sa.Column(
            "status",
            str_enum(
                "ticketstatus",
                "OPEN",
                "TRIAGE",
                "ASSIGNED",
                "IN_PROGRESS",
                "WAITING_USER",
                "RESOLVED",
                "CLOSED",
                "CANCELLED",
            ),
            server_default="OPEN",
            nullable=False,
        ),
        sa.Column(
            "source",
            str_enum("ticketsource", "WEB", "CHATBOT", "EMAIL", "API"),
            server_default="WEB",
            nullable=False,
        ),
        sa.Column("response_deadline", utc_datetime(), nullable=True),
        sa.Column("resolution_deadline", utc_datetime(), nullable=True),
        sa.Column("first_response_at", utc_datetime(), nullable=True),
        sa.Column("resolved_at", utc_datetime(), nullable=True),
        sa.Column("closed_at", utc_datetime(), nullable=True),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.Column("updated_at", utc_datetime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_tickets_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_tickets_user_id_users"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["technician_id"],
            ["users.id"],
            name=op.f("fk_tickets_technician_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_tickets_category_id_categories"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["sla_policy_id"],
            ["sla_policies.id"],
            name=op.f("fk_tickets_sla_policy_id_sla_policies"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tickets")),
        sa.UniqueConstraint(
            "company_id", "ticket_number", name=op.f("uq_tickets_company_id_ticket_number")
        ),
    )
    op.create_index(op.f("ix_tickets_company_id"), "tickets", ["company_id"])
    op.create_index(op.f("ix_tickets_user_id"), "tickets", ["user_id"])
    op.create_index(op.f("ix_tickets_technician_id"), "tickets", ["technician_id"])
    op.create_index(op.f("ix_tickets_category_id"), "tickets", ["category_id"])
    op.create_index(op.f("ix_tickets_sla_policy_id"), "tickets", ["sla_policy_id"])
    op.create_index(op.f("ix_tickets_company_id_status"), "tickets", ["company_id", "status"])
    op.create_index(
        op.f("ix_tickets_company_id_technician_id"), "tickets", ["company_id", "technician_id"]
    )
    op.create_index(op.f("ix_tickets_company_id_user_id"), "tickets", ["company_id", "user_id"])
    op.create_index(
        op.f("ix_tickets_company_id_created_at"), "tickets", ["company_id", "created_at"]
    )

    op.create_table(
        "ticket_comments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticket_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_internal", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.Column("updated_at", utc_datetime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["ticket_id"],
            ["tickets.id"],
            name=op.f("fk_ticket_comments_ticket_id_tickets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_ticket_comments_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ticket_comments")),
    )
    op.create_index(op.f("ix_ticket_comments_ticket_id"), "ticket_comments", ["ticket_id"])
    op.create_index(op.f("ix_ticket_comments_user_id"), "ticket_comments", ["user_id"])

    op.create_table(
        "ticket_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticket_id", sa.Integer(), nullable=False),
        sa.Column("uploaded_by", sa.Integer(), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("file_type", sa.String(length=100), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.CheckConstraint(
            "file_size >= 0", name=op.f("ck_ticket_attachments_file_size_non_negative")
        ),
        sa.ForeignKeyConstraint(
            ["ticket_id"],
            ["tickets.id"],
            name=op.f("fk_ticket_attachments_ticket_id_tickets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by"],
            ["users.id"],
            name=op.f("fk_ticket_attachments_uploaded_by_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ticket_attachments")),
    )
    op.create_index(op.f("ix_ticket_attachments_ticket_id"), "ticket_attachments", ["ticket_id"])
    op.create_index(
        op.f("ix_ticket_attachments_uploaded_by"), "ticket_attachments", ["uploaded_by"]
    )

    op.create_table(
        "ticket_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticket_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column(
            "action",
            str_enum(
                "tickethistoryaction",
                "CREATED",
                "STATUS_CHANGED",
                "PRIORITY_CHANGED",
                "ASSIGNED",
                "CATEGORY_CHANGED",
                "COMMENTED",
                "RESOLVED",
                "CLOSED",
                "REOPENED",
                "CANCELLED",
            ),
            nullable=False,
        ),
        sa.Column("field", sa.String(length=50), nullable=True),
        sa.Column("old_value", sa.String(length=255), nullable=True),
        sa.Column("new_value", sa.String(length=255), nullable=True),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["ticket_id"],
            ["tickets.id"],
            name=op.f("fk_ticket_history_ticket_id_tickets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_ticket_history_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ticket_history")),
    )
    op.create_index(
        op.f("ix_ticket_history_ticket_id_created_at"),
        "ticket_history",
        ["ticket_id", "created_at"],
    )
    op.create_index(op.f("ix_ticket_history_user_id"), "ticket_history", ["user_id"])

    op.create_table(
        "ticket_ratings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticket_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("rating", sa.SmallInteger(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name=op.f("ck_ticket_ratings_rating_range")),
        sa.ForeignKeyConstraint(
            ["ticket_id"],
            ["tickets.id"],
            name=op.f("fk_ticket_ratings_ticket_id_tickets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_ticket_ratings_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ticket_ratings")),
        sa.UniqueConstraint("ticket_id", name=op.f("uq_ticket_ratings_ticket_id")),
    )
    op.create_index(op.f("ix_ticket_ratings_user_id"), "ticket_ratings", ["user_id"])

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "type",
            str_enum(
                "notificationtype",
                "TICKET_CREATED",
                "TICKET_ASSIGNED",
                "COMMENT_ADDED",
                "TICKET_RESOLVED",
                "SLA_WARNING",
                "SLA_BREACHED",
            ),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("ticket_id", sa.Integer(), nullable=True),
        sa.Column("is_read", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("read_at", utc_datetime(), nullable=True),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_notifications_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_notifications_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["ticket_id"],
            ["tickets.id"],
            name=op.f("fk_notifications_ticket_id_tickets"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notifications")),
    )
    op.create_index(op.f("ix_notifications_company_id"), "notifications", ["company_id"])
    op.create_index(op.f("ix_notifications_ticket_id"), "notifications", ["ticket_id"])
    op.create_index(
        op.f("ix_notifications_user_id_is_read"), "notifications", ["user_id", "is_read"]
    )

    # --- Auditoria ----------------------------------------------------------
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column(
            "action",
            str_enum(
                "auditaction",
                "USER_CREATED",
                "USER_UPDATED",
                "USER_DELETED",
                "TICKET_CREATED",
                "TICKET_UPDATED",
                "TICKET_DELETED",
                "PERMISSION_CHANGED",
                "AI_ACTION_EXECUTED",
                "KNOWLEDGE_CREATED",
                "KNOWLEDGE_UPDATED",
                "KNOWLEDGE_DELETED",
                "LOGIN_SUCCEEDED",
                "LOGIN_FAILED",
            ),
            nullable=False,
        ),
        sa.Column("entity", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.String(length=64), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_audit_logs_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_audit_logs_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
    )
    op.create_index(
        op.f("ix_audit_logs_company_id_created_at"), "audit_logs", ["company_id", "created_at"]
    )
    op.create_index(op.f("ix_audit_logs_entity_entity_id"), "audit_logs", ["entity", "entity_id"])
    op.create_index(op.f("ix_audit_logs_user_id"), "audit_logs", ["user_id"])

    # --- Chatbot ------------------------------------------------------------
    op.create_table(
        "conversations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column(
            "status",
            str_enum("conversationstatus", "ACTIVE", "RESOLVED", "ESCALATED", "CLOSED"),
            server_default="ACTIVE",
            nullable=False,
        ),
        sa.Column("ticket_id", sa.Integer(), nullable=True),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.Column("updated_at", utc_datetime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_conversations_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_conversations_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["ticket_id"],
            ["tickets.id"],
            name=op.f("fk_conversations_ticket_id_tickets"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_conversations")),
    )
    op.create_index(op.f("ix_conversations_company_id"), "conversations", ["company_id"])
    op.create_index(op.f("ix_conversations_user_id"), "conversations", ["user_id"])
    op.create_index(op.f("ix_conversations_ticket_id"), "conversations", ["ticket_id"])

    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("role", str_enum("messagerole", "USER", "ASSISTANT", "SYSTEM"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "intent",
            str_enum(
                "chatintent",
                "NETWORK_PROBLEM",
                "PASSWORD_RESET",
                "EMAIL_PROBLEM",
                "PRINTER_PROBLEM",
                "SOFTWARE_PROBLEM",
                "HARDWARE_PROBLEM",
                "VPN_PROBLEM",
                "SYSTEM_ACCESS",
                "GENERAL_QUESTION",
                "CREATE_TICKET",
                "TICKET_STATUS",
                "OTHER",
            ),
            nullable=True,
        ),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("sources", sa.JSON(), nullable=True),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
            name=op.f("ck_messages_confidence_range"),
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            name=op.f("fk_messages_conversation_id_conversations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_messages")),
    )
    op.create_index(
        op.f("ix_messages_conversation_id_created_at"),
        "messages",
        ["conversation_id", "created_at"],
    )

    # --- Base de conhecimento -----------------------------------------------
    op.create_table(
        "knowledge_articles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("author_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.String(length=500), nullable=True),
        sa.Column("content", long_text(), nullable=False),
        sa.Column(
            "status",
            str_enum("articlestatus", "DRAFT", "PUBLISHED", "ARCHIVED"),
            server_default="DRAFT",
            nullable=False,
        ),
        sa.Column(
            "source_type",
            str_enum("articlesourcetype", "MANUAL", "UPLOAD"),
            server_default="MANUAL",
            nullable=False,
        ),
        sa.Column("source_file_name", sa.String(length=255), nullable=True),
        sa.Column("view_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("helpful_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("not_helpful_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_featured", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("indexed_at", utc_datetime(), nullable=True),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.Column("updated_at", utc_datetime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_knowledge_articles_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_knowledge_articles_category_id_categories"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            name=op.f("fk_knowledge_articles_author_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_knowledge_articles")),
    )
    op.create_index(op.f("ix_knowledge_articles_company_id"), "knowledge_articles", ["company_id"])
    op.create_index(
        op.f("ix_knowledge_articles_category_id"), "knowledge_articles", ["category_id"]
    )
    op.create_index(op.f("ix_knowledge_articles_author_id"), "knowledge_articles", ["author_id"])
    op.create_index(
        op.f("ix_knowledge_articles_company_id_status"),
        "knowledge_articles",
        ["company_id", "status"],
    )

    op.create_table(
        "knowledge_chunks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("article_id", sa.Integer(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("embedding_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.CheckConstraint(
            "chunk_index >= 0", name=op.f("ck_knowledge_chunks_chunk_index_non_negative")
        ),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_knowledge_chunks_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["article_id"],
            ["knowledge_articles.id"],
            name=op.f("fk_knowledge_chunks_article_id_knowledge_articles"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_knowledge_chunks")),
        sa.UniqueConstraint(
            "article_id", "chunk_index", name=op.f("uq_knowledge_chunks_article_id_chunk_index")
        ),
    )
    op.create_index(op.f("ix_knowledge_chunks_company_id"), "knowledge_chunks", ["company_id"])

    # --- IA -----------------------------------------------------------------
    op.create_table(
        "ai_actions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column(
            "action_type",
            str_enum(
                "aiactiontype",
                "CLASSIFY_TICKET",
                "SUMMARIZE_TICKET",
                "SUGGEST_SOLUTION",
                "GENERATE_RESPONSE",
                "RAG_SEARCH",
                "CHAT_RESPONSE",
            ),
            nullable=False,
        ),
        sa.Column("input_reference", sa.String(length=100), nullable=True),
        sa.Column("output", long_text(), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_ai_actions_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_ai_actions_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_actions")),
    )
    op.create_index(op.f("ix_ai_actions_company_id"), "ai_actions", ["company_id"])
    op.create_index(op.f("ix_ai_actions_user_id"), "ai_actions", ["user_id"])
    op.create_index(
        op.f("ix_ai_actions_company_id_action_type_created_at"),
        "ai_actions",
        ["company_id", "action_type", "created_at"],
    )

    op.create_table(
        "ai_feedback",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=True),
        sa.Column("ai_action_id", sa.Integer(), nullable=True),
        sa.Column("rating", str_enum("aifeedbackrating", "POSITIVE", "NEGATIVE"), nullable=False),
        sa.Column("feedback_text", sa.Text(), nullable=True),
        sa.Column("created_at", utc_datetime(), nullable=False),
        sa.CheckConstraint(
            "message_id IS NOT NULL OR ai_action_id IS NOT NULL",
            name=op.f("ck_ai_feedback_target_required"),
        ),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name=op.f("fk_ai_feedback_company_id_companies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_ai_feedback_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["messages.id"],
            name=op.f("fk_ai_feedback_message_id_messages"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["ai_action_id"],
            ["ai_actions.id"],
            name=op.f("fk_ai_feedback_ai_action_id_ai_actions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_feedback")),
    )
    op.create_index(op.f("ix_ai_feedback_company_id"), "ai_feedback", ["company_id"])
    op.create_index(op.f("ix_ai_feedback_user_id"), "ai_feedback", ["user_id"])
    op.create_index(op.f("ix_ai_feedback_message_id"), "ai_feedback", ["message_id"])
    op.create_index(op.f("ix_ai_feedback_ai_action_id"), "ai_feedback", ["ai_action_id"])

    # --- Dados iniciais -----------------------------------------------------
    op.bulk_insert(
        roles,
        [
            {"name": "USER", "description": "Usuário comum: abre e acompanha os próprios chamados"},
            {
                "name": "TECHNICIAN",
                "description": "Técnico de suporte: atende chamados e usa o AI Copilot",
            },
            {
                "name": "ADMIN",
                "description": "Administrador: gerencia usuários, cadastros, SLA e a empresa",
            },
        ],
    )


def downgrade() -> None:
    # Ordem inversa de dependência; drop_table remove também os índices da tabela.
    for table in (
        "ai_feedback",
        "ai_actions",
        "knowledge_chunks",
        "knowledge_articles",
        "messages",
        "conversations",
        "audit_logs",
        "notifications",
        "ticket_ratings",
        "ticket_history",
        "ticket_attachments",
        "ticket_comments",
        "tickets",
        "users",
        "categories",
        "sla_policies",
        "departments",
        "roles",
        "companies",
    ):
        op.drop_table(table)
