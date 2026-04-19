package io.legato.core.errors

import io.legato.core.core.LegatoAndroidError
import io.legato.core.core.LegatoAndroidErrorCode

class LegatoAndroidErrorMapper {
    fun mapThrowable(throwable: Throwable): LegatoAndroidError {
        return LegatoAndroidError(
            code = LegatoAndroidErrorCode.PLATFORM_ERROR,
            message = throwable.message ?: "Unknown platform error",
            details = throwable,
        )
    }

    fun playerNotSetup(message: String = "Player is not setup"): LegatoAndroidError {
        return LegatoAndroidError(code = LegatoAndroidErrorCode.PLAYER_NOT_SETUP, message = message)
    }
}
