from src.generation.exceptions import ModelCatalogUnavailable
from src.generation.model_catalog import ModelInfo


class InMemoryModelCatalog:
    def __init__(self, models: list[ModelInfo] | None = None, *, available: bool = True) -> None:
        self._models = models if models is not None else []
        self._available = available
        self.refreshes = 0

    async def ensure_fresh(self) -> None:
        self.refreshes += 1
        if not self._available:
            raise ModelCatalogUnavailable

    def is_valid(self, model_id: str) -> bool:
        return any(model.id == model_id for model in self._models)

    def list_models(self) -> list[ModelInfo]:
        return list(self._models)
