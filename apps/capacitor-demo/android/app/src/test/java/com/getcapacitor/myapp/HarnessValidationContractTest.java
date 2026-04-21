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
            "id=\"action-setup\"",
            "id=\"action-sync-start\"",
            "id=\"action-sync-stop\"",
            "id=\"action-add\"",
            "id=\"action-play\"",
            "id=\"action-pause\"",
            "id=\"action-stop\"",
            "id=\"action-seek\"",
            "id=\"action-snapshot\"",
            "id=\"copy-events\""
    };

    @Test
    public void indexHtml_exposesManualControlsAndValidationChecklist() throws Exception {
        String html = readRepoFile("apps/capacitor-demo/index.html");

        for (String control : HARNESS_CONTROL_IDS) {
            assertTrue("Missing control marker in index.html: " + control, html.contains(control));
        }

        assertTrue("Missing Android lifecycle checklist section", html.contains("Android lifecycle validation checklist"));
        assertTrue("Missing focus-loss checklist item", html.contains("Focus loss pauses playback"));
        assertTrue("Missing no-auto-resume checklist item", html.contains("Focus regain does not auto-resume"));
        assertTrue("Missing service teardown checklist item", html.contains("stop+idle tears down foreground service"));
        assertTrue("Missing recent events node", html.contains("id=\"events\""));
        assertTrue("Missing snapshot summary node", html.contains("id=\"snapshot-summary\""));
        assertTrue("Missing snapshot JSON node", html.contains("id=\"snapshot-json\""));
    }

    @Test
    public void mainTs_usesDirectAudioUrlsAndAndroidFocusedLogging() throws Exception {
        String mainTs = readRepoFile("apps/capacitor-demo/src/main.ts");

        assertTrue("Smoke defaults should avoid redirect URLs", !mainTs.contains("soundhelix.com") && !mainTs.contains("redirect"));
        assertTrue("Expected direct samplelib URL for smoke fixture", mainTs.contains("https://samplelib.com/mp3/sample-3s.mp3"));
        assertTrue("Expected explicit background instructions logger", mainTs.contains("Background check:"));
        assertTrue("Expected Android parity snapshot logging", mainTs.contains("snapshot summary"));
        assertTrue("Expected recent events rendering helper", mainTs.contains("renderRecentEvents"));
    }

    @Test
    public void readme_includesBuildAndSyncValidationReminder() throws Exception {
        String readme = readRepoFile("apps/capacitor-demo/README.md");

        assertTrue("README should include Android parity validation heading", readme.contains("Android parity v1 validation"));
        assertTrue("README should include build reminder", readme.contains("npm run build"));
        assertTrue("README should include cap sync reminder", readme.contains("npm run cap:sync"));
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
