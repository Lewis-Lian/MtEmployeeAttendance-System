from app import create_app
from services.bootstrap_service import ensure_default_admin, initialize_database


app = create_app()


@app.cli.command("init-db")
def init_db_command() -> None:
    with app.app_context():
        initialize_database()


@app.cli.command("init-admin")
def init_admin_command() -> None:
    with app.app_context():
        ensure_default_admin()
