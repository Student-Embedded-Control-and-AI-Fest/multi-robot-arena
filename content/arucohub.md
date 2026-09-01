# ArucoHub C++ service

ArucoHub is the second stage of the vision backbone:

```text
N USB cameras
      ↓
CameraHub C++ service
      ↓ BGR8 memfd buffers
ArucoHub C++ service
      ↓ fused pose-history memfd
viewer / monitor / PID / ROS 2 bridge
```

ArucoHub does **not** open `/dev/video*`. It calls CameraHub's `AcquireCamera(camera_id)`, maps each BGR ring buffer, detects configured ArUco IDs, maps the marker centre and forward edge into the shared world frame, applies marker-height compensation when camera geometry is configured, fuses multi-camera observations, and writes one circular pose history per marker.

The implementation follows the existing Python tracker conventions:

- homography key: `H_image_to_world_m`;
- fusion weight: detected marker pixel area;
- heading: centre to the configured marker edge, transformed through the homography;
- marker-height compensation: applied to both the marker centre and forward-edge point before heading calculation;
- multi-camera heading: weighted circular mean.

## Project contents

```text
aruco_hub_cpp/
├── CMakeLists.txt
├── README.md
├── config/
│   └── aruco_hub.json
├── include/
│   ├── aruco_hub_client.hpp
│   ├── aruco_hub_protocol.hpp
│   └── camera_hub_protocol.hpp
├── src/
│   ├── aruco_hub.cpp
│   ├── aruco_hub_monitor.cpp
│   └── aruco_hub_viewer.cpp
└── systemd/
    └── aruco-hub.service
```

## Setup

### 1. Install dependencies

```bash
sudo apt update

sudo apt install -y \
  build-essential \
  cmake \
  pkg-config \
  libopencv-dev \
  libopencv-contrib-dev \
  libsystemd-dev \
  nlohmann-json3-dev
```

The OpenCV contrib package provides the ArUco module on distributions that split it from the base OpenCV packages.

### 2. Extract the project

Place it at:

```text
~/works/aruco_hub
```

Example:

```bash
mkdir -p ~/works
cd ~/works

unzip ~/Downloads/aruco_hub_cpp.zip
mv aruco_hub_cpp aruco_hub
cd aruco_hub
```

### 3. Copy the homographies

The sample config expects:

```text
~/works/aruco_hub/config/camera1_homography.json
~/works/aruco_hub/config/camera2_homography.json
```

Copy your existing calibrated files:

```bash
cp /path/to/camera1_homography.json \
  ~/works/aruco_hub/config/

cp /path/to/camera2_homography.json \
  ~/works/aruco_hub/config/
```

Each file must contain:

```json
{
  "H_image_to_world_m": [
    [1.0, 0.0, 0.0],
    [0.0, 1.0, 0.0],
    [0.0, 0.0, 1.0]
  ]
}
```

Use the real matrices produced by your checkerboard calibration. All cameras must map into the same world coordinate frame.

The homography is calibrated on the **floor plane**, i.e. `z = 0`. If an ArUco marker is mounted above the floor, the raw homography result is the point where the camera ray intersects the floor, not the true horizontal position of the elevated marker. ArucoHub can compensate for this when the marker height and camera centre are configured.

### 4. Configure N cameras, N marker IDs, and marker heights

Edit:

```bash
nano ~/works/aruco_hub/config/aruco_hub.json
```

Example with three cameras and four robots:

```json
{
  "aruco_dictionary": "DICT_4X4_50",
  "marker_ids": [1, 2, 3, 7],
  "history_length": 512,
  "publish_hz": 30.0,
  "fusion_window_ms": 40,
  "lost_timeout_ms": 150,

  "default_forward_edge": "bottom",
  "marker_forward_edges": {
    "1": "bottom",
    "2": "bottom",
    "3": "bottom",
    "7": "top"
  },

  "default_marker_height_m": 0.0,
  "marker_heights_m": {
    "1": 0.060,
    "2": 0.060,
    "3": 0.060,
    "7": 0.075
  },

  "cameras": [
    {
      "id": 0,
      "name": "camera_1",
      "homography": "camera1_homography.json",
      "camera_position_m": [1.80, 0.25, 2.10]
    },
    {
      "id": 1,
      "name": "camera_2",
      "homography": "camera2_homography.json",
      "camera_position_m": [-1.85, 0.20, 2.08]
    },
    {
      "id": 2,
      "name": "camera_3",
      "homography": "camera3_homography.json",
      "camera_position_m": [0.10, -1.20, 2.05]
    }
  ]
}
```

The camera positions above are only examples. Use the actual measured camera centres in your calibrated world frame.

For the current three robots, whose ArUco marker planes are approximately **60 mm above the floor**, use:

```json
"default_marker_height_m": 0.0,

"marker_heights_m": {
  "1": 0.060,
  "2": 0.060,
  "3": 0.060
}
```

The camera `id` is the CameraHub runtime ID, not `/dev/videoN`. CameraHub must have been started with matching IDs, for example:

```bash
camera_hub \
  --camera 0:/dev/video0 \
  --camera 1:/dev/video2 \
  --camera 2:/dev/video4
```

The previously generated `camera_config.json` can also be **reused** after **adding** `marker_ids`, `history_length`, and a CameraHub `id` to each camera. Fields such as `device`, `width`, `height`, and `fps` are ignored by ArucoHub because CameraHub owns the physical devices.

The supported forward edges are:

```text
top
right
bottom
left
```

Per-camera marker-edge overrides are also supported by adding `marker_forward_edges` inside one camera object.

#### Marker-height parameters

`default_marker_height_m` is used when a marker ID does not have an explicit entry in `marker_heights_m`.

```json
"default_marker_height_m": 0.0
```

A value of `0.0` means that the marker is treated as lying on the calibrated floor plane.

`marker_heights_m` provides per-marker overrides:

```json
"marker_heights_m": {
  "1": 0.060,
  "2": 0.060,
  "3": 0.060
}
```

The keys are marker IDs and the values are marker-plane heights above the floor in metres.

#### Camera position

Each camera can provide:

```json
"camera_position_m": [Cx, Cy, H]
```

where:

- `Cx` is the camera optical centre X coordinate in the calibrated world frame;
- `Cy` is the camera optical centre Y coordinate in the calibrated world frame;
- `H` is the camera optical centre height above the calibrated floor plane.

For example:

```json
"camera_position_m": [1.80, 0.25, 2.10]
```

means that the camera centre is at:

```text
x = +1.80 m
y = +0.25 m
z = +2.10 m
```

relative to the same checkerboard world frame used by the homography.

If `camera_position_m` is omitted or set to `null`, height compensation is disabled for that camera. ArucoHub will continue to use the floor-projected position for observations from that camera.

### 5. Height-compensation geometry

The checkerboard homography maps an image point to `Q`, the point where the corresponding viewing ray intersects the floor plane:

```text
camera C
    \
     \
      ● P = true marker point at z = h
       \
        \
---------●---------------- floor z = 0
         Q = floor-homography result
```

Let the physical camera centre be:

```text
C = (Cx, Cy, H)
```

and let the marker plane height be:

```text
h
```

If the floor homography produces:

```text
Q = (Qx, Qy)
```

then the corrected horizontal marker position is:

$$
P_x = C_x + \left(1-\frac{h}{H}\right)(Q_x-C_x)
$$

$$
P_y = C_y + \left(1-\frac{h}{H}\right)(Q_y-C_y)
$$

No camera intrinsic matrix is required for this correction. It uses the existing floor homography plus the physical camera centre and marker height.

ArucoHub applies this correction to:

1. the detected marker centre;
2. the configured forward-edge point.

The heading is calculated **after** both points have been height-corrected:

```text
pixel centre + pixel forward edge
              ↓
         floor homography
              ↓
     floor intersections Q
              ↓
       height compensation
              ↓
  corrected centre + forward edge
              ↓
       x, y, theta
```

This matters for multi-camera fusion because an elevated marker otherwise appears at different floor-projected XY positions when viewed from different camera directions.

The implementation requires:

```text
0 <= marker_height_m < camera_position_m[2]
```

A marker height equal to or above the camera height is rejected.

### 6. Compile

To compile:

```bash
cd ~/works/aruco_hub

cmake -S . -B build \
  -DCMAKE_BUILD_TYPE=Release

cmake --build build -j"$(nproc)"
```

This creates:

```text
build/aruco_hub
build/aruco_hub_viewer
build/aruco_hub_monitor
```

### 7. Start CameraHub first

Check the existing CameraHub service:

```bash
systemctl --user status camera-hub.service
```

Or run it manually in another terminal.

### 8. Run ArucoHub manually first

To run as a normal executable:

```bash
cd ~/works/aruco_hub

./build/aruco_hub \
  --config config/aruco_hub.json
```

Expected startup output now also reports marker-plane heights and camera centres:

```text
camera_1: mapped CameraHub ID 0 (1920x1080, slots=4, format=BGR8)
camera_2: mapped CameraHub ID 1 (1920x1080, slots=4, format=BGR8)
ArucoHub owns D-Bus name org.rosseminar.ArucoHub1
Dictionary: DICT_4X4_50
Cameras: 2
Marker IDs: 1 2 3
Marker plane heights: id1=60mm id2=60mm id3=60mm
Camera centres:
  camera_1: [Cx0, Cy0, H0] m
  camera_2: [Cx1, Cy1, H1] m
History per marker: 512 samples
Publish rate: 30 Hz
```

If a nonzero marker height is configured but one or more cameras do not have `camera_position_m`, ArucoHub prints a warning similar to:

```text
WARNING: nonzero marker heights are configured, but one or more cameras
have no camera_position_m. Those cameras will still report floor-projected
poses until their physical camera centres are configured.
```

### 9. Inspect the ArucoHub D-Bus API

What API does ArucoHub provide?

```bash
busctl --user introspect \
  org.rosseminar.ArucoHub1 \
  /org/rosseminar/ArucoHub1
```

Watch pose and visibility events:

```bash
busctl --user monitor \
  org.rosseminar.ArucoHub1
```

Methods:

```text
GetMarkerCount()
AcquirePoseBuffer()
GetLatestPose(marker_id)
```

Signals:

```text
PoseReady(marker_id, sequence, timestamp_ns, ring_index)
MarkerStateChanged(marker_id, visible)
```

The signals contain metadata only. Pose history remains in shared memory.

A one-off D-Bus latest-pose query for marker 3 is:

```bash
busctl --user call \
  org.rosseminar.ArucoHub1 \
  /org/rosseminar/ArucoHub1 \
  org.rosseminar.ArucoHub1 \
  GetLatestPose i 3
```

For a PID loop, map the shared memory once instead of making a D-Bus call on every control cycle.

### 10. Test the shared-memory clients

Console monitor for marker 3:

```bash
cd ~/works/aruco_hub
./build/aruco_hub_monitor 3
```

It prints the latest **height-compensated** fused pose and a simple one-step velocity estimate:

```text
ID=3 seq=281 detected=1 x=0.4112 y=0.2681 theta=1.5320 vx=... vy=... omega=...
```

World trajectory viewer:

```bash
cd ~/works/aruco_hub
./build/aruco_hub_viewer
```

The viewer maps the same pose buffer and draws the circular history, current position, heading arrow, visibility, sequence, and contributing camera count. Press `q` or `Esc` to close it.

The pose history contains the final fused `x`, `y`, and `theta` values after marker-height compensation.

### 11. Install ArucoHub as a user service

The supplied unit assumes:

```text
CameraHub: ~/works/camera_hub
ArucoHub:  ~/works/aruco_hub
```

Install it:

```bash
mkdir -p ~/.config/systemd/user

cp \
  ~/works/aruco_hub/systemd/aruco-hub.service \
  ~/.config/systemd/user/

systemctl --user daemon-reload
systemctl --user enable --now aruco-hub.service
```

Check status and logs:

```bash
systemctl --user status aruco-hub.service
journalctl --user -u aruco-hub.service -f
```

After rebuilding:

```bash
cmake --build ~/works/aruco_hub/build -j"$(nproc)"
systemctl --user restart aruco-hub.service
```

After editing the JSON configuration, only restart is required:

```bash
systemctl --user restart aruco-hub.service
```

The unit declares:

```text
Requires=camera-hub.service
After=camera-hub.service
PartOf=camera-hub.service
```

Therefore CameraHub starts first, and restarting CameraHub also restarts the ArUco consumer layer.

## Shared-memory layout

One `memfd` contains every configured marker:

```text
SharedHeader
MarkerDescriptor[marker_count]
Marker 1 PoseSample[history_length]
Marker 2 PoseSample[history_length]
...
Marker N PoseSample[history_length]
```

Each marker has its own circular sequence. The number of markers and `history_length` do not have to be powers of two.

A pose sample contains:

```text
sequence
timestamp_ns
x_m
y_m
theta_rad
detection_weight
source_camera_mask
source_camera_count
detected
```

The shared-memory ABI is unchanged by marker-height compensation. `x_m`, `y_m`, and `theta_rad` simply contain the corrected fused pose.

When a marker is lost for longer than `lost_timeout_ms`, ArucoHub appends one sample with `detected=0` while retaining the last known x, y, and heading. Any designed controller should stop the robot whenever the latest sample is lost or too old.

## Current limits

- Detection is sequential across cameras in one C++ process.
- Source-camera provenance uses a 64-bit mask, so this ABI supports at most 64 cameras.
- Homographies must already be calibrated into one common world frame.
- Marker-height compensation assumes the marker plane is parallel to the calibrated floor plane and uses one scalar height per marker.
- Accurate height compensation requires the physical camera optical centre `[Cx, Cy, H]` to be measured in the same world frame as the homographies.
- If `camera_position_m` is missing for a camera, that camera falls back to the original floor-projected pose.
- The marker height must be lower than the corresponding camera height.
- Pose history is local shared memory; Ethernet transport needs a separate bridge.
- The sample velocity in `aruco_hub_monitor` differentiates adjacent poses. A real controller should estimate velocity over several samples or use a filter.

## Example

The output of `aruco_hub_monitor` for marker 1:

```text
ictlab@ictlab-desktop:~$ cd ~/works/aruco_hub

./build/aruco_hub_monitor 1
Monitoring marker 1. Press Ctrl+C to stop.
ID=1 seq=1 detected=1 x=-0.5887 y=0.0034 theta=-1.3989 sources=1 mask=0x2
ID=1 seq=2 detected=1 x=-0.5884 y=0.0015 theta=-1.3935 vx=0.0038 vy=-0.0281 omega=0.0815 sources=1 mask=0x2
ID=1 seq=3 detected=1 x=-0.5883 y=0.0014 theta=-1.3874 vx=0.0014 vy=-0.0011 omega=0.0870 sources=1 mask=0x2
ID=1 seq=4 detected=1 x=-0.5882 y=0.0015 theta=-1.3876 vx=0.0020 vy=0.0016 omega=-0.0027 sources=1 mask=0x2
ID=1 seq=5 detected=1 x=-0.5883 y=0.0014 theta=-1.3863 vx=-0.0018 vy=-0.0013 omega=0.0223 sources=1 mask=0x2
ID=1 seq=6 detected=1 x=-0.5882 y=0.0014 theta=-1.3850 vx=0.0013 vy=-0.0006 omega=0.0196 sources=1 mask=0x2
ID=1 seq=7 detected=1 x=-0.5883 y=0.0015 theta=-1.3858 vx=-0.0015 vy=0.0011 omega=-0.0124 sources=1 mask=0x2
ID=1 seq=8 detected=1 x=-0.5883 y=0.0015 theta=-1.3896 vx=-0.0002 vy=0.0009 omega=-0.0544 sources=1 mask=0x2
ID=1 seq=9 detected=1 x=-0.5884 y=0.0015 theta=-1.3871 vx=-0.0007 vy=-0.0010 omega=0.0358 sources=1 mask=0x2
ID=1 seq=10 detected=1 x=-0.5882 y=0.0015 theta=-1.3830 vx=0.0029 vy=0.0010 omega=0.0629 sources=1 mask=0x2
ID=1 seq=11 detected=1 x=-0.5883 y=0.0016 theta=-1.3893 vx=-0.0024 vy=0.0007 omega=-0.0976 sources=1 mask=0x2
ID=1 seq=12 detected=1 x=-0.5884 y=0.0015 theta=-1.3856 vx=-0.0005 vy=-0.0011 omega=0.0560 sources=1 mask=0x2
ID=1 seq=13 detected=1 x=-0.5883 y=0.0015 theta=-1.3844 vx=0.0016 vy=0.0004 omega=0.0186 sources=1 mask=0x2
```
