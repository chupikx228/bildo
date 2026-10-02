from src.apps.schemas import AppDocument


def missing_roots(document: AppDocument) -> list[str]:
    ids = {screen.id for screen in document.screens}
    return [root for root in document.navigation.roots if root not in ids]
