"""Abstract base for ML models."""

from abc import ABC, abstractmethod
from typing import Any


class BaseMLModel(ABC):
    """All ML models inherit from this base."""

    @abstractmethod
    def can_run(self, data_dictionary: dict[str, Any]) -> bool:
        """Check if this model has enough data to run."""

    @abstractmethod
    def run(self, data_dictionary: dict[str, Any], database_url: str) -> dict[str, Any]:
        """Execute the model and return results."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Model name identifier."""
