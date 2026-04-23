package com.getcapacitor.myapp;

import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import org.junit.Test;

public class HarnessValidationContractTest {

    private static final String[] HARNESS_CONTROL_IDS = new String[] {
            "id=\"run-boundary-smoke\"",
            "id=\"action-setup\"",
            "id=\"action-sync-start\"",
            "id=\"action-sync-stop\"",
            "id=\"action-add\"",
            "id=\"action-play\"",
            "id=\"action-pause\"",
            "id=\"action-stop\"",
            "id=\"action-previous\"",
            "id=\"action-next\"",
            "id=\"action-seek\"",
            "id=\"action-snapshot\"",
            "id=\"copy-events\"",
            "id=\"copy-smoke-report\""
    };

    @Test
    public void indexHtml_exposesRemoteTransportV2ControlsAndChecklist() throws Exception {
        String html = readRepoFile("apps/capacitor-demo/index.html");

        for (String control : HARNESS_CONTROL_IDS) {
            assertTrue("Missing control marker in index.html: " + control, html.contains(control));
        }

        assertTrue("Missing capability summary node", html.contains("id=\"capability-summary\""));
        assertTrue("Missing transport checklist section", html.contains("Remote transport v2 validation checklist"));
        assertTrue("Missing remote next/previous checklist item", html.contains("Remote next/previous parity"));
        assertTrue("Missing remote seek checklist item", html.contains("Remote seek parity"));
        assertTrue("Missing boundary checklist item", html.contains("Boundary behavior parity"));
        assertTrue(
                "Missing Android position fidelity checklist item",
                html.contains("Android lockscreen/notification position from real snapshot")
        );
        assertTrue(
                "Missing iOS playbackRate fidelity checklist item",
                html.contains("iOS now-playing playbackRate fidelity")
        );
        assertTrue("Missing now-playing checklist item", html.contains("Now-playing metadata parity"));
        assertTrue("Missing recent events node", html.contains("id=\"events\""));
        assertTrue("Missing snapshot summary node", html.contains("id=\"snapshot-summary\""));
        assertTrue("Missing snapshot JSON node", html.contains("id=\"snapshot-json\""));
        assertTrue("Missing automation status node", html.contains("id=\"automation-status\""));
        assertTrue("Missing automation report node", html.contains("id=\"smoke-report-json\""));
        assertTrue("Missing automation snapshot node", html.contains("id=\"automation-snapshot\""));
    }

    @Test
    public void mainTs_usesCurrentDirectFixturesAndExposesBoundaryAndCapabilitySignals() throws Exception {
        String mainTs = readRepoFile("apps/capacitor-demo/src/main.ts");
        String smokeAutomation = readRepoFile("apps/capacitor-demo/src/smoke-automation.js");

        assertTrue("Smoke defaults should avoid redirect URLs", !mainTs.contains("soundhelix.com") && !mainTs.contains("redirect"));
        assertTrue("Expected direct samplelib URL for fixture track 1", mainTs.contains("https://samplelib.com/mp3/sample-12s.mp3"));
        assertTrue("Expected direct samplelib URL for fixture track 2", mainTs.contains("https://samplelib.com/mp3/sample-15s.mp3"));
        assertTrue("Expected direct samplelib URL for fixture track 3", mainTs.contains("https://samplelib.com/mp3/sample-9s.mp3"));
        assertTrue("Expected fixture duration for track 1", mainTs.contains("duration: 12000"));
        assertTrue("Expected fixture duration for track 2", mainTs.contains("duration: 19200"));
        assertTrue("Expected fixture duration for track 3", mainTs.contains("duration: 9613"));
        assertTrue("Expected artwork fixture mapping block", mainTs.contains("const expectedArtworkByTrackId"));
        assertTrue("Expected artwork mapping for track 1", mainTs.contains("'track-demo-1': demoTracks[0].artwork ?? null"));
        assertTrue("Expected artwork mapping for track 2", mainTs.contains("'track-demo-2': demoTracks[1].artwork ?? null"));
        assertTrue("Expected artwork mapping for track 3", mainTs.contains("'track-demo-3': demoTracks[2].artwork ?? null"));
        assertTrue("Expected skip-to-next handler", mainTs.contains("resolvePlaybackApi(surface).skipToNext()"));
        assertTrue("Expected skip-to-previous handler", mainTs.contains("resolvePlaybackApi(surface).skipToPrevious()"));
        assertTrue("Expected capability projection renderer", mainTs.contains("renderCapabilitySummary"));
        assertTrue("Expected boundary smoke flow helper", mainTs.contains("runBoundarySmokeFlow"));
        assertTrue("Expected recent events rendering helper", mainTs.contains("renderRecentEvents"));
        assertTrue(
                "Expected parity inspector reminder for Android snapshot-based rebasing",
                mainTs.contains("Android lockscreen/notification position rebases from real snapshot")
        );
        assertTrue(
                "Expected parity inspector reminder for iOS playbackRate fidelity",
                mainTs.contains("iOS now-playing playbackRate mirrors play/pause")
        );
        assertTrue("Expected smoke marker prefix", smokeAutomation.contains("LEGATO_SMOKE_REPORT"));
        assertTrue("Expected smoke report emission", mainTs.contains("buildSmokeMarkerLine"));
    }

    @Test
    public void readme_includesRemoteTransportV2ValidationReminder() throws Exception {
        String readme = readRepoFile("apps/capacitor-demo/README.md");

        assertTrue("README should include transport v2 heading", readme.contains("Remote transport richness v2 validation"));
        assertTrue("README should include manual next/previous mention", readme.contains("skipToNext") && readme.contains("skipToPrevious"));
        assertTrue("README should include capability projection mention", readme.contains("canSkipNext") && readme.contains("canSkipPrevious"));
        assertTrue("README should include build reminder", readme.contains("npm run build"));
        assertTrue("README should include cap sync reminder", readme.contains("npm run cap:sync"));
    }

    @Test
    public void capacitorReadme_documentsNamespacedPreferredMigrationMap() throws Exception {
        String capacitorReadme = readRepoFile("packages/capacitor/README.md");

        assertTrue(
                "Capacitor README should include explicit legacy-to-namespaced migration heading",
                capacitorReadme.contains("Legacy → namespaced migration map (preferred path)")
        );
        assertTrue(
                "Capacitor README should include preferred listener helper",
                capacitorReadme.contains("addAudioPlayerListener")
        );
        assertTrue(
                "Capacitor README should include preferred media session helper",
                capacitorReadme.contains("addMediaSessionListener")
        );
        assertTrue(
                "Capacitor README should include preferred playback sync helper",
                capacitorReadme.contains("createAudioPlayerSync")
        );
        assertTrue(
                "Capacitor README should keep compatibility-only posture for legacy helpers",
                capacitorReadme.contains("Compatibility-only (legacy Legato facade)")
        );
    }

    @Test
    public void demoHarness_copyAndImports_highlightNamespacedFirstSurfaces() throws Exception {
        String demoReadme = readRepoFile("apps/capacitor-demo/README.md");
        String mainTs = readRepoFile("apps/capacitor-demo/src/main.ts");
        String boundaryHarness = readRepoFile("apps/capacitor-demo/src/boundary-harness.js");
        String boundaryHarnessTest = readRepoFile("apps/capacitor-demo/src/boundary-harness.test.mjs");

        assertTrue(
                "Demo README should call out namespaced-first smoke objective",
                demoReadme.contains("Smoke objective (namespaced-first, compatibility-aware)")
        );
        assertTrue(
                "Demo README should keep native host refresh commands",
                demoReadme.contains("npm run build") && demoReadme.contains("npm run cap:sync")
        );

        assertTrue("main.ts should import createAudioPlayerSync", mainTs.contains("createAudioPlayerSync"));
        assertTrue("main.ts should import addAudioPlayerListener", mainTs.contains("addAudioPlayerListener"));
        assertTrue("main.ts should import addMediaSessionListener", mainTs.contains("addMediaSessionListener"));
        assertTrue("main.ts should use createAudioPlayerSync for preferred sync path", mainTs.contains("syncController = createAudioPlayerSync({"));
        assertTrue("main.ts should use addAudioPlayerListener helper", mainTs.contains("addAudioPlayerListener(eventName, (payload) => {"));
        assertTrue("main.ts should use addMediaSessionListener helper", mainTs.contains("addMediaSessionListener('remote-play', () => {})"));

        assertTrue(
                "Boundary summary should flag preferred namespaced surfaces",
                boundaryHarness.contains("`preferredSurface=${payload.preferredSurface}`")
        );
        assertTrue(
                "Boundary summary should label legacy facade as compatibility-only",
                boundaryHarness.contains("`compatSurface=${payload.compatSurface}`")
        );
        assertTrue(
                "boundary-harness test should lock preferred copy",
                boundaryHarnessTest.contains("preferredSurface: 'audioPlayer + mediaSession'")
        );
    }

    @Test
    public void capacitorEvents_exposesNamespacedConstantsAndListenerAliases() throws Exception {
        String eventsTs = readRepoFile("packages/capacitor/src/events.ts");

        assertTrue("Expected audio player event constant alias", eventsTs.contains("export const AUDIO_PLAYER_EVENTS = PLAYER_EVENT_NAMES;"));
        assertTrue("Expected media session event constant alias", eventsTs.contains("export const MEDIA_SESSION_EVENTS = MEDIA_SESSION_EVENT_NAMES;"));
        assertTrue("Expected addAudioPlayerListener helper", eventsTs.contains("export const addAudioPlayerListener = audioPlayer.addListener.bind(audioPlayer);"));
        assertTrue("Expected addMediaSessionListener helper", eventsTs.contains("export const addMediaSessionListener = mediaSession.addListener.bind(mediaSession);"));
    }

    @Test
    public void capacitorEvents_preservesLegacyCombinedConstantAndListenerHelper() throws Exception {
        String eventsTs = readRepoFile("packages/capacitor/src/events.ts");

        assertTrue("Expected legacy combined event constant to remain", eventsTs.contains("export const LEGATO_EVENTS = LEGATO_EVENT_NAMES;"));
        assertTrue("Expected addLegatoListener to remain", eventsTs.contains("export function addLegatoListener<E extends LegatoEventName>("));
    }

    @Test
    public void capacitorSync_exposesAudioPlayerScopedAliasesAndDelegatesToLegacySync() throws Exception {
        String syncTs = readRepoFile("packages/capacitor/src/sync.ts");

        assertTrue("Expected AudioPlayerSyncClient alias", syncTs.contains("export type AudioPlayerSyncClient = AudioPlayerApi;"));
        assertTrue("Expected AudioPlayerSyncOptions interface", syncTs.contains("export interface AudioPlayerSyncOptions extends LegatoSyncOptions"));
        assertTrue("Expected audio player sync factory", syncTs.contains("export function createAudioPlayerSync("));
        assertTrue("Expected audio player sync to delegate to legacy sync", syncTs.contains("return createLegatoSync(options);"));
    }

    @Test
    public void capacitorSync_preservesLegacyFactoryAndPlaybackOnlySubscriptionSource() throws Exception {
        String syncTs = readRepoFile("packages/capacitor/src/sync.ts");

        assertTrue("Expected createLegatoSync factory to remain", syncTs.contains("export function createLegatoSync(options: LegatoSyncOptions = {}): LegatoSyncController {"));
        assertTrue("Expected playback-only subscription source", syncTs.contains("AUDIO_PLAYER_EVENTS.map(async (eventName) => {"));
    }

    @Test
    public void capacitorIndex_reexportsPreferredNamespacedHelpersBeforeCompatibilityAliases() throws Exception {
        String indexTs = readRepoFile("packages/capacitor/src/index.ts");

        int preferredIndex = indexTs.indexOf("AUDIO_PLAYER_EVENTS");
        int compatibilityIndex = indexTs.indexOf("LEGATO_EVENTS");

        assertTrue("Expected preferred namespaced events export", preferredIndex >= 0);
        assertTrue("Expected compatibility LEGATO_EVENTS export", compatibilityIndex >= 0);
        assertTrue("Expected preferred namespaced exports before compatibility export", preferredIndex < compatibilityIndex);
        assertTrue("Expected addAudioPlayerListener export", indexTs.contains("addAudioPlayerListener"));
        assertTrue("Expected addMediaSessionListener export", indexTs.contains("addMediaSessionListener"));
        assertTrue("Expected createAudioPlayerSync export", indexTs.contains("createAudioPlayerSync"));
        assertTrue("Expected createLegatoSync export", indexTs.contains("createLegatoSync"));
    }

    private static String readRepoFile(String relativePath) throws IOException {
        Path repoRoot = locateRepoRoot();
        Path target = repoRoot.resolve(relativePath);
        byte[] bytes = Files.readAllBytes(target);
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private static Path locateRepoRoot() {
        Path cwd = Path.of(System.getProperty("user.dir", ".")).toAbsolutePath();

        Optional<Path> match = climb(cwd);
        if (match.isPresent()) {
            return match.get();
        }

        throw new IllegalStateException("Unable to locate repository root from " + cwd);
    }

    private static Optional<Path> climb(Path start) {
        Path cursor = start;
        while (cursor != null) {
            Path marker = cursor.resolve("apps/capacitor-demo/index.html");
            if (Files.exists(marker)) {
                return Optional.of(cursor);
            }
            cursor = cursor.getParent();
        }
        return Optional.empty();
    }
}
