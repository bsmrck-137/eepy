import { $ } from "bun";

type Platform = "darwin" | "linux" | "win32" | "unknown";

export function getPlatform(): Platform {
  const platform = process.platform;
  if (platform === "darwin" || platform === "linux" || platform === "win32") {
    return platform;
  }
  return "unknown";
}

/**
 * Pause all browser media using platform-specific methods
 */
export async function pauseMedia(): Promise<{ success: boolean; message: string }> {
  const platform = getPlatform();

  try {
    switch (platform) {
      case "darwin": {
        // Use AppleScript to simulate media key press (works for any media player/browser)
        const script = `
          tell application "System Events"
            -- Simulate media pause key (key code 16 with command down = play/pause)
            key code 16 using {command down}
          end tell
        `;
        // Alternative: directly pause Safari/Chrome
        const safariPause = `
          tell application "System Events"
            if (exists process "Safari") then
              tell application "Safari"
                do JavaScript "document.querySelectorAll('video, audio').forEach(m => m.pause())" in current tab of front window
              end tell
            end if
          end tell
        `;
        const chromePause = `
          tell application "System Events"
            if (exists process "Google Chrome") then
              tell application "Google Chrome"
                execute front window's active tab javascript "document.querySelectorAll('video, audio').forEach(m => m.pause())"
              end tell
            end if
          end tell
        `;

        // Try to pause in both browsers
        try {
          await $`osascript -e ${safariPause}`.quiet();
        } catch {
          // Safari might not be running
        }
        try {
          await $`osascript -e ${chromePause}`.quiet();
        } catch {
          // Chrome might not be running
        }

        return { success: true, message: "Media pause commands sent" };
      }

      case "linux": {
        // Use playerctl to pause all media players
        try {
          await $`playerctl -a pause`.quiet();
          return { success: true, message: "All media paused via playerctl" };
        } catch {
          // playerctl might not be installed, try dbus
          try {
            await $`dbus-send --print-reply --dest=org.mpris.MediaPlayer2.chromium /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Pause`.quiet();
            return { success: true, message: "Media paused via dbus" };
          } catch {
            return { success: false, message: "Could not pause media. Install playerctl for best results." };
          }
        }
      }

      case "win32": {
        // Use PowerShell to simulate media key press
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait("{MEDIA_PLAY_PAUSE}")
        `;
        await $`powershell -Command ${psScript}`.quiet();
        return { success: true, message: "Media key sent" };
      }

      default:
        return { success: false, message: `Unsupported platform: ${platform}` };
    }
  } catch (error) {
    return { success: false, message: `Error pausing media: ${error}` };
  }
}

/**
 * Suspend/sleep the system using platform-specific methods
 */
export async function suspendSystem(): Promise<{ success: boolean; message: string }> {
  const platform = getPlatform();

  try {
    switch (platform) {
      case "darwin": {
        await $`pmset sleepnow`.quiet();
        return { success: true, message: "System going to sleep..." };
      }

      case "linux": {
        // Try systemctl first (systemd), then pm-suspend
        try {
          await $`systemctl suspend`.quiet();
          return { success: true, message: "System suspending via systemctl..." };
        } catch {
          try {
            await $`pm-suspend`.quiet();
            return { success: true, message: "System suspending via pm-suspend..." };
          } catch {
            return { success: false, message: "Could not suspend. Try: sudo systemctl suspend" };
          }
        }
      }

      case "win32": {
        // Use rundll32 to suspend (0 = suspend, not hibernate)
        await $`rundll32.exe powrprof.dll,SetSuspendState 0,1,0`.quiet();
        return { success: true, message: "System suspending..." };
      }

      default:
        return { success: false, message: `Unsupported platform: ${platform}` };
    }
  } catch (error) {
    return { success: false, message: `Error suspending system: ${error}` };
  }
}
