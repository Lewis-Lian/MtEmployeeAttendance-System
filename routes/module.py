from __future__ import annotations

from flask import Blueprint, abort, g, render_template

from routes.auth import login_required
from utils.app_navigation import module_by_slug, visible_entries


module_bp = Blueprint("module", __name__, url_prefix="/module")


@module_bp.route("/<slug>")
@login_required
def module_home(slug: str):
    module = module_by_slug(slug)
    if not module:
        abort(404)

    entries = visible_entries(g.current_user, module)
    if not entries:
        abort(403)

    module["entries"] = entries
    module["home_href"] = f"/module/{module['slug']}"
    return render_template("module_home.html", module=module, entries=entries)
