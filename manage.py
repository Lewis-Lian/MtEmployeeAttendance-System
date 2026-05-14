import click

from app import create_app


app = create_app()


def _load_bootstrap_functions():
    try:
        from services.bootstrap_service import ensure_default_admin, initialize_database
    except ImportError as exc:
        raise click.ClickException("Bootstrap commands will be implemented in Task 2.") from exc

    return initialize_database, ensure_default_admin


@app.cli.command("init-db")
def init_db_command() -> None:
    initialize_database, _ = _load_bootstrap_functions()
    with app.app_context():
        initialize_database()


@app.cli.command("init-admin")
def init_admin_command() -> None:
    _, ensure_default_admin = _load_bootstrap_functions()
    with app.app_context():
        ensure_default_admin()
