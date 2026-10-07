"""Executa uma varredura de alertas de SLA: `python -m app.cli.sla_monitor`.

Útil para agendar via cron quando o monitor embutido na API está desligado.
"""

from app.core.scheduler import run_sla_scan


def main() -> None:
    print(f"Alertas de SLA criados: {run_sla_scan()}")


if __name__ == "__main__":
    main()
