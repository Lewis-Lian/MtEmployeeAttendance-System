from __future__ import annotations

from datetime import datetime, timezone
from functools import wraps

import jwt
from flask import Blueprint, current_app, jsonify, redirect, render_template, request, url_for, make_response, g

from models.user import User


auth_bp = Blueprint("auth", __name__)


def _generate_token(user: User) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "iat": int(now.timestamp()),
        "exp": int((now + current_app.config["JWT_EXPIRES_DELTA"]).timestamp()),
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")


def _decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None


def _extract_token() -> str | None:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return request.cookies.get("access_token")


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = _extract_token()
        if not token:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Unauthorized"}), 401
            return redirect(url_for("auth.login_page"))

        payload = _decode_token(token)
        if not payload:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Invalid token"}), 401
            resp = redirect(url_for("auth.login_page"))
            resp.delete_cookie("access_token")
            return resp

        user = User.query.get(payload["sub"])
        if not user:
            return jsonify({"error": "User not found"}), 401
        g.current_user = user
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    @login_required
    def wrapper(*args, **kwargs):
        if g.current_user.role != "admin":
            if request.path.startswith("/api/"):
                return jsonify({"error": "Forbidden"}), 403
            return redirect(url_for("employee.dashboard"))
        return fn(*args, **kwargs)

    return wrapper


@auth_bp.route("/")
def root():
    token = _extract_token()
    if token and _decode_token(token):
        return redirect(url_for("employee.dashboard"))
    return redirect(url_for("auth.login_page"))


@auth_bp.route("/login", methods=["GET"])
def login_page():
    return render_template("login.html")


@auth_bp.route("/login", methods=["POST"])
def login_post():
    username = request.form.get("username") or (request.json or {}).get("username")
    password = request.form.get("password") or (request.json or {}).get("password")

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password or ""):
        if request.is_json:
            return jsonify({"error": "用户名或密码错误"}), 401
        return render_template("login.html", error="用户名或密码错误"), 401

    token = _generate_token(user)
    if request.is_json:
        return jsonify({"token": token, "role": user.role, "username": user.username})

    resp = make_response(redirect(url_for("employee.dashboard")))
    resp.set_cookie("access_token", token, httponly=True, samesite="Lax")
    return resp


@auth_bp.route("/logout", methods=["POST", "GET"])
def logout():
    resp = make_response(redirect(url_for("auth.login_page")))
    resp.delete_cookie("access_token")
    return resp


@auth_bp.route("/api/me", methods=["GET"])
@login_required
def me():
    return jsonify(
        {
            "id": g.current_user.id,
            "username": g.current_user.username,
            "role": g.current_user.role,
        }
    )
