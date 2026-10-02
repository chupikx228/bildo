from src.apps.schemas import AppDocument, AppScreen


def missing_roots(document: AppDocument) -> list[str]:
    ids = {screen.id for screen in document.screens}
    return [root for root in document.navigation.roots if root not in ids]


def leading_slash_routes(document: AppDocument) -> list[AppScreen]:
    return [screen for screen in document.screens if screen.route.startswith("/")]
