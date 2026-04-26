package io.legato.core.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class LegatoAndroidAudioFocusSessionRuntimeTest {
    @Test
    fun `v1 policy pauses on loss and never auto-resumes on gain`() {
        val runtime = LegatoAndroidAudioFocusSessionRuntime()

        val policy = runtime.audioFocusPolicy()

        assertEquals(LegatoAndroidAudioFocusGainHint.AUDIOFOCUS_GAIN, policy.gainHint)
        assertEquals(true, policy.pauseOnTransientCanDuck)
        assertFalse(policy.resumeAfterGainIfNotUserPaused)
    }

    @Test
    fun `audio focus changes are emitted as interruption signals`() {
        val runtime = LegatoAndroidAudioFocusSessionRuntime()
        val signals = mutableListOf<LegatoAndroidInterruptionSignal>()
        runtime.setInterruptionListener { signal ->
            signals += signal
        }

        runtime.dispatchAudioFocusChange(android.media.AudioManager.AUDIOFOCUS_LOSS_TRANSIENT)
        runtime.dispatchAudioFocusChange(android.media.AudioManager.AUDIOFOCUS_GAIN)
        runtime.dispatchBecomingNoisy()

        assertEquals(
            listOf(
                LegatoAndroidInterruptionSignal.AudioFocusLostTransient,
                LegatoAndroidInterruptionSignal.AudioFocusGained,
                LegatoAndroidInterruptionSignal.BecomingNoisy,
            ),
            signals,
        )
    }
}
