class DomainError(Exception):
    status_code = 400
    message = "Ошибка запроса"


class NotFoundError(DomainError):
    status_code = 404


class ConflictError(DomainError):
    status_code = 409
