# CameraHub C++ 

```
camera_hub_cpp/
├── CMakeLists.txt
├── README.md
├── include/
│   └── camera_hub_protocol.hpp
├── src/
│   ├── camera_hub.cpp
│   └── camera_hub_viewer.cpp
└── systemd/
    └── camera-hub.service
```

```
USB camera 0 ─┐
USB camera 1 ─┤
USB camera 2 ─┤
      ...      ├── C++ CameraHub daemon
USB camera N ─┘           ↓
                 one memfd ring buffer
                    for each camera
                          ↓
             D-Bus file-descriptor handoff
                and frame notifications
                          ↓
        C++ viewers / Python clients / ROS clients
```

The CameraHub executable supports a runtime-configurable number of cameras. The camera count is **not fixed during compilation**.

Each camera receives:
```
one numeric camera ID
one capture thread
one independent memfd ring buffer
one frame sequence counter
one capture timestamp stream
one CameraStateChanged status
one FrameReady notification stream
```

`memfd_create()` creates an anonymous RAM-backed file descriptor that is resized with `ftruncate()` and mapped using `mmap()`.

The daemon transfers each camera’s file descriptor through D-Bus using the `UNIX_FD` type. Actual image pixels remain in shared memory and are not copied through D-Bus messages.

## 1. Install dependencies on the Jetson

Run this on Jetson's terminal:
```bash
sudo apt update

sudo apt install -y \
  build-essential \
  cmake \
  pkg-config \
  libopencv-dev \
  libsystemd-dev \
  v4l-utils
```

The project links sd-bus through the `libsystemd` pkg-config module.

---

## 2. Extract the project

Put the project at:
```
~/works/camera_hub
```

For example:
```bash
mkdir -p ~/works
cd ~/works

unzip ~/Downloads/camera_hub_cpp.zip
mv camera_hub_cpp camera_hub
cd camera_hub
```

Adjust the ZIP location according to where the browser saved it.

## 3. Identify all camera devices

List the available V4L2 devices:
```bash
v4l2-ctl --list-devices
```

For example, a four-camera system might appear as:

```
camera 0 → /dev/video0
camera 1 → /dev/video2
camera 2 → /dev/video4
camera 3 → /dev/video6
```

The `/dev/videoN` numbering can change after rebooting or reconnecting USB cameras. For a permanent installation, inspect stable device names:
```bash
ls -l /dev/v4l/by-id/
```

A stable launch configuration could use paths such as:
```
/dev/v4l/by-id/usb-Camera_A-video-index0
/dev/v4l/by-id/usb-Camera_B-video-index0
/dev/v4l/by-id/usb-Camera_C-video-index0
```

Check camera permissions:
```bash
ls -l /dev/video*
groups
```

When the current account is not a member of the `video` group:
```bash
sudo usermod -aG video "$USER"
```

Log out and log in again after changing group membership.

## 4. Compile

Compilation is independent of the number of cameras:
```bash
cd ~/works/camera_hub

cmake -S . -B build \
  -DCMAKE_BUILD_TYPE=Release

cmake --build build -j"$(nproc)"
```

This creates:
```
build/camera_hub
build/camera_hub_viewer
```

The same executable supports more than 1 cameras. The camera list is supplied when the executable starts. 
The daemon requests the V4L2 backend and configures width, height, frame rate, `FOURCC`, and capture-buffer size through OpenCV `VideoCapture`.
The actual negotiated values are printed during startup because a camera driver might not accept every requested setting exactly.

## 5. Run CameraHub manually

Specify every camera by repeating:
```
--camera ID:DEVICE
```

**Two-camera example**
```bash
cd ~/works/camera_hub

./build/camera_hub \
  --camera 0:/dev/video0 \
  --camera 1:/dev/video2 \
  --width 1920 \
  --height 1080 \
  --fps 30 \
  --fourcc MJPG \
  --slots 4
```

**Four-camera example**
```bash
cd ~/works/camera_hub

./build/camera_hub \
  --camera 0:/dev/video0 \
  --camera 1:/dev/video2 \
  --camera 2:/dev/video4 \
  --camera 3:/dev/video6 \
  --width 1920 \
  --height 1080 \
  --fps 30 \
  --fourcc MJPG \
  --slots 4
```

The camera IDs do not need to match the `/dev/videoN` numbers. They only need to be unique:
```bash
./build/camera_hub \
  --camera 10:/dev/video0 \
  --camera 20:/dev/video2 \
  --camera 30:/dev/video4
```

Expected output for four cameras should resemble:
```
camera_0: /dev/video0, 1920x1080 @ 30 fps, backend=V4L2
camera_1: /dev/video2, 1920x1080 @ 30 fps, backend=V4L2
camera_2: /dev/video4, 1920x1080 @ 30 fps, backend=V4L2
camera_3: /dev/video6, 1920x1080 @ 30 fps, backend=V4L2
CameraHub owns D-Bus name org.rosseminar.CameraHub1
```

CameraHub uses the **user-session D-Bus**, rather than the system bus. This avoids requiring a custom system-bus security policy during development.

When no `--camera` arguments are supplied, the current version uses this fallback:
```
camera 0 → /dev/video0
camera 1 → /dev/video2
```

## 6. Test any camera

Open another terminal and provide the desired camera ID.

Camera 0:
```bash
cd ~/works/camera_hub
./build/camera_hub_viewer 0
```

Camera 1:
```bash
cd ~/works/camera_hub
./build/camera_hub_viewer 1
```

Camera 2:
```bash
cd ~/works/camera_hub
./build/camera_hub_viewer 2
```

Camera 3:
```bash
cd ~/works/camera_hub
./build/camera_hub_viewer 3
```

Multiple viewers can run simultaneously:
```bash
./build/camera_hub_viewer 0 &
./build/camera_hub_viewer 1 &
./build/camera_hub_viewer 2 &
./build/camera_hub_viewer 3 &
```

All viewers read frames from CameraHub shared memory. They do not reopen the USB cameras.

Press `q` or `Esc` to close a viewer.

## 7. Inspect the D-Bus service

Show the available methods and signals:
```bash
busctl --user introspect \
  org.rosseminar.CameraHub1 \
  /org/rosseminar/CameraHub1
```

Query the number of configured cameras:
```bash
busctl --user call \
  org.rosseminar.CameraHub1 \
  /org/rosseminar/CameraHub1 \
  org.rosseminar.CameraHub1 \
  GetCameraCount
```

Monitor frame and camera-state events:
```bash
busctl --user monitor \
  org.rosseminar.CameraHub1
```

For N cameras, the signals contain the originating camera ID:
```
FrameReady(
    camera_id,
    sequence,
    timestamp_ns,
    slot
)

CameraStateChanged(
    camera_id,
    online,
    device
)
```

A client uses `camera_id` to determine which shared-memory buffer the event belongs to.

The actual BGR image remains in that camera’s shared-memory ring buffer.

## 8. Install CameraHub as a service

The service file determines which cameras are opened when CameraHub starts. Changing the camera list does not require recompilation. The provided unit assumes:
```
~/works/camera_hub
```

Install it:
```bash
mkdir -p ~/.config/systemd/user

cp \
  ~/works/camera_hub/systemd/camera-hub.service \
  ~/.config/systemd/user/
```

Edit the installed service:
```bash
nano ~/.config/systemd/user/camera-hub.service
```

### Example for four cameras
```
[Unit]
Description=ROS Seminar CameraHub
After=graphical-session.target

[Service]
Type=simple

ExecStart=%h/works/camera_hub/build/camera_hub \
    --camera 0:/dev/video0 \
    --camera 1:/dev/video2 \
    --camera 2:/dev/video4 \
    --camera 3:/dev/video6 \
    --width 1920 \
    --height 1080 \
    --fps 30 \
    --fourcc MJPG \
    --slots 4

Restart=on-failure
RestartSec=2
KillSignal=SIGINT
TimeoutStopSec=8

[Install]
WantedBy=default.target
```

Reload the service definition:
```bash
systemctl --user daemon-reload
```

Enable and start immediately:
```bash
systemctl --user enable --now camera-hub.service
```

Check its status:
```bash
systemctl --user status camera-hub.service
```

Follow logs:
```bash
journalctl --user -u camera-hub.service -f
```

After recompiling:
```bash
cmake --build ~/works/camera_hub/build -j"$(nproc)"
systemctl --user restart camera-hub.service
```

After changing the camera list in the service file:
```bash
systemctl --user daemon-reload
systemctl --user restart camera-hub.service
```

To allow the user service to remain active without an interactive login:
```bash
sudo loginctl enable-linger "$USER"
```

## Shared-memory behavior for N cameras

Each camera has its own independent memory object:
```
Camera 0 memfd
    Shared header
    Slot 0 metadata + BGR pixels
    Slot 1 metadata + BGR pixels
    Slot 2 metadata + BGR pixels
    Slot 3 metadata + BGR pixels

Camera 1 memfd
    Shared header
    Slot 0 metadata + BGR pixels
    Slot 1 metadata + BGR pixels
    Slot 2 metadata + BGR pixels
    Slot 3 metadata + BGR pixels

Camera 2 memfd
    ...

Camera N memfd
    ...
```

A slow client reading Camera 0 does not affect Camera 1 or any other camera. Each slot has a seqlock-style version:
```
odd version  → CameraHub is writing the slot
even version → the frame is complete
```

A client:
```
reads the slot version
→ copies the frame
→ reads the slot version again
→ accepts only equal, even versions
```

Therefore, a slow consumer never blocks camera capture. It simply skips old frames and reads the newest complete frame.

## Memory usage

For `BGR8` frames, approximate shared-memory usage per camera is: $W \times H \times 3 \times N_{\text{slots}}$ 
At 1920×1080 with four slots: $1920 \times 1080 \times 3 \times 4 \approx 24.9 \text{ MB per camera}$
Approximate frame-buffer memory is therefore:

| Cameras | Shared-memory usage |
| ------- | ------------------- |
| 1       | 24.9 MB             |
| 2       | 49.8 MB             |
| 4       | 99.5 MB             |
| 6       | 149.3 MB            |
| 8       | 199.1 MB            |

This excludes small headers, OpenCV capture buffers, MJPEG decoder memory, and client-side private copies.
USB bandwidth and MJPEG decoding load will usually become limiting before shared-memory capacity.

## Current common camera settings

The current MVP applies the same settings to every configured camera:
```
width
height
FPS
FOURCC
number of ring-buffer slots
```

For example:
```bash
--width 1920 \
--height 1080 \
--fps 30 \
--fourcc MJPG \
--slots 4
```

These values apply to all cameras in that invocation.

**The current version does not yet support different settings for each camera.**

## D-Bus interface

The service name is:
```
org.rosseminar.CameraHub1
```

Available methods:
```
GetCameraCount()
    → number of configured cameras
```

```
AcquireCamera(camera_id)
    → memfd
    → width
    → height
    → stride
    → slot count
    → slot span
    → total mapping size
    → pixel format
```

```
GetLatestFrame(camera_id)
    → sequence
    → timestamp
    → slot
```

Each client first calls:
```
AcquireCamera(camera_id)
```

for every camera it wants to consume.

For example, a four-camera tracker obtains four separate descriptors:
```
AcquireCamera(0) → memfd 0
AcquireCamera(1) → memfd 1
AcquireCamera(2) → memfd 2
AcquireCamera(3) → memfd 3
```

## Important scope

This version implements the local Jetson vision backbone for N cameras:
```
N-camera capture
one capture thread per camera
one shared-memory ring buffer per camera
D-Bus discovery and file-descriptor handoff
camera-specific frame notifications
systemd service
C++ test viewers
```

It does not yet encode or transmit video over Ethernet. 
A future H.264/RTP streamer should be a separate process:
```
CameraHub shared memory
       ↓
H.264/RTP streamer
       ↓
Ethernet
       ↓
Laptop receiver
```

The streamer can subscribe to one, several, or all configured camera IDs without reopening the cameras. This separation prevents remote visualization, recording, or Ethernet congestion from disturbing local ArUco detection and robot control.

One separate issue is **image resolution**. CameraHub itself does not require width and height to be powers of two. However, when we later add H.264 streaming, the encoder may require or strongly prefer even dimensions because common YUV 4:2:0 formats operate on 2×2 pixel groups. Standard resolutions such as 1920×1080 and 1280×720 already satisfy that condition.

# Converting into a Linux service

## 1. Stop the foreground process

In the terminal where it’s running:
```
Ctrl+C
```

## 2. Create the user service directory
```
mkdir -p ~/.config/systemd/user
```

## 3. Copy the service file

Since our project is in:
```
~/works/vision_backbone/camera_hub
```

Run:
```
cp ~/works/vision_backbone/camera_hub/systemd/camera-hub.service \
   ~/.config/systemd/user/
```

## 4. Verify the service file path

Open the file:
```
nano ~/.config/systemd/user/camera-hub.service
```

Make sure `ExecStart=` points to our actual build path. It should look like:
```
[Unit]
Description=ROS Seminar CameraHub
After=graphical-session.target

[Service]
Type=simple
ExecStart=%h/works/vision_backbone/camera_hub/build/camera_hub \
    --camera 0:/dev/video0 \
    --camera 1:/dev/video2 \
    --width 1920 \
    --height 1080 \
    --fps 30 \
    --fourcc MJPG \
    --slots 4
Restart=on-failure
RestartSec=2
KillSignal=SIGINT
TimeoutStopSec=8

[Install]
WantedBy=default.target
```

## 5. Reload `systemd` user services

```
systemctl --user daemon-reload
```

## 6. Start the service

```
systemctl --user start camera-hub.service
```

It should now run in the background.

## 7. Check status

```
systemctl --user status camera-hub.service
```

We should see `active (running)`.

---

## 8. Watch logs

```
journalctl --user -u camera-hub.service -f
```

This replaces the terminal output we had when running it in the foreground.

## 9. Enable auto-start

To start automatically for our user session:
```
systemctl --user enable camera-hub.service
```

Or enable and start immediately:
```
systemctl --user enable --now camera-hub.service
```