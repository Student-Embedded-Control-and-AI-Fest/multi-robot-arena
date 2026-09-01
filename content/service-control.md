# CameraHub and ArucoHub Service Control

This guide summarizes the common `systemd --user` commands for controlling the ROS Seminar services:

- `camera-hub.service`
- `aruco-hub.service`

The service files are normally stored in:

```text
~/.config/systemd/user/
```

---

# 1. Check Service Status

## CameraHub

```bash
systemctl --user status camera-hub.service
```

## ArucoHub

```bash
systemctl --user status aruco-hub.service
```

For a shorter status summary:

```bash
systemctl --user is-active camera-hub.service
systemctl --user is-active aruco-hub.service
```

Expected result when running:

```text
active
```

---

# 2. Start the Services

## Start CameraHub

```bash
systemctl --user start camera-hub.service
```

## Start ArucoHub

```bash
systemctl --user start aruco-hub.service
```

If ArucoHub depends on CameraHub, start CameraHub first:

```bash
systemctl --user start camera-hub.service
systemctl --user start aruco-hub.service
```

---

# 3. Stop the Services

## Stop ArucoHub first

```bash
systemctl --user stop aruco-hub.service
```

## Then stop CameraHub

```bash
systemctl --user stop camera-hub.service
```

Recommended order:

```text
STOP:
ArucoHub
   ↓
CameraHub
```

This avoids ArucoHub continuing to request frames while CameraHub is already stopped.

---

# 4. Restart the Services

Restart CameraHub:

```bash
systemctl --user restart camera-hub.service
```

Restart ArucoHub:

```bash
systemctl --user restart aruco-hub.service
```

If CameraHub configuration or camera parameters were changed, restart both:

```bash
systemctl --user restart camera-hub.service
systemctl --user restart aruco-hub.service
```

Recommended order:

```text
RESTART:
CameraHub
   ↓
ArucoHub
```

---

# 5. Reload systemd After Editing a Service File

If you edit either:

```text
~/.config/systemd/user/camera-hub.service
```

or:

```text
~/.config/systemd/user/aruco-hub.service
```

reload the user systemd configuration:

```bash
systemctl --user daemon-reload
```

Then restart the affected service.

Example for CameraHub:

```bash
systemctl --user daemon-reload
systemctl --user restart camera-hub.service
```

Example for ArucoHub:

```bash
systemctl --user daemon-reload
systemctl --user restart aruco-hub.service
```

If both service files were changed:

```bash
systemctl --user daemon-reload
systemctl --user restart camera-hub.service
systemctl --user restart aruco-hub.service
```

---

# 6. Enable Automatic Startup

Enable CameraHub at login/boot:

```bash
systemctl --user enable camera-hub.service
```

Enable ArucoHub:

```bash
systemctl --user enable aruco-hub.service
```

Enable and start immediately:

```bash
systemctl --user enable --now camera-hub.service
systemctl --user enable --now aruco-hub.service
```

Check whether they are enabled:

```bash
systemctl --user is-enabled camera-hub.service
systemctl --user is-enabled aruco-hub.service
```

Expected:

```text
enabled
```

---

# 7. Disable Automatic Startup

Disable CameraHub:

```bash
systemctl --user disable camera-hub.service
```

Disable ArucoHub:

```bash
systemctl --user disable aruco-hub.service
```

Disable and stop immediately:

```bash
systemctl --user disable --now aruco-hub.service
systemctl --user disable --now camera-hub.service
```

---

# 8. View Logs

## CameraHub recent logs

```bash
journalctl --user -u camera-hub.service -n 100 --no-pager
```

## ArucoHub recent logs

```bash
journalctl --user -u aruco-hub.service -n 100 --no-pager
```

---

# 9. Follow Logs Live

CameraHub:

```bash
journalctl --user -u camera-hub.service -f
```

ArucoHub:

```bash
journalctl --user -u aruco-hub.service -f
```

Press:

```text
Ctrl+C
```

to leave the log viewer.

This does **not** stop the service.

---

# 10. Follow Both Services Together

```bash
journalctl --user     -u camera-hub.service     -u aruco-hub.service     -f
```

This is useful when debugging startup or camera-detection problems.

---

# 11. Recommended Full Restart Procedure

When changing CameraHub settings, camera devices, exposure settings, homography setup, or ArucoHub configuration:

```bash
systemctl --user stop aruco-hub.service
systemctl --user stop camera-hub.service

systemctl --user daemon-reload

systemctl --user start camera-hub.service
systemctl --user start aruco-hub.service
```

Then check:

```bash
systemctl --user status camera-hub.service
systemctl --user status aruco-hub.service
```

And optionally:

```bash
journalctl --user     -u camera-hub.service     -u aruco-hub.service     -n 100     --no-pager
```

---

# 12. Quick Command Summary

| Task     | CameraHub                                     | ArucoHub                                     |
| -------- | --------------------------------------------- | -------------------------------------------- |
| Start    | `systemctl --user start camera-hub.service`   | `systemctl --user start aruco-hub.service`   |
| Stop     | `systemctl --user stop camera-hub.service`    | `systemctl --user stop aruco-hub.service`    |
| Restart  | `systemctl --user restart camera-hub.service` | `systemctl --user restart aruco-hub.service` |
| Status   | `systemctl --user status camera-hub.service`  | `systemctl --user status aruco-hub.service`  |
| Enable   | `systemctl --user enable camera-hub.service`  | `systemctl --user enable aruco-hub.service`  |
| Disable  | `systemctl --user disable camera-hub.service` | `systemctl --user disable aruco-hub.service` |
| Live log | `journalctl --user -u camera-hub.service -f`  | `journalctl --user -u aruco-hub.service -f`  |

---

# 13. Service Dependency Order

For normal operation:

```text
START:
CameraHub
   ↓
ArucoHub
   ↓
GUI / controller / logger
```

For shutdown:

```text
STOP:
GUI / controller / logger
   ↓
ArucoHub
   ↓
CameraHub
```

CameraHub should normally be available before ArucoHub starts consuming frames.
