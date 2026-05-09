from flask import g, request

from .auth import auth_bp
from .employee import employee_bp
from .admin import admin_bp
from .module import module_bp
from utils.app_navigation import nav_context


def register_routes(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(employee_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(module_bp)

    @app.context_processor
    def inject_app_navigation():
        return {"app_nav": nav_context(getattr(g, "current_user", None), request.path)}
